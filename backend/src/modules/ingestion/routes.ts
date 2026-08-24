import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId } from "../../lib/supabase.js";
import { parseEmail, normalizeForAI } from "./parser.js";

// Helper: intenta supabase con timeout corto, si falla usa fallback mock (para demo sin DB)
async function trySupabase<T>(promise: PromiseLike<any>, fallback: T, timeoutMs = 900): Promise<{ data: T | null; error: any | null; mocked: boolean }> {
  try {
    const res: any = await Promise.race([
      promise as Promise<any>,
      new Promise((_, rej) => setTimeout(() => rej(new Error("supabase timeout")), timeoutMs))
    ]);
    if (res?.error) throw res.error;
    return { data: res.data ?? null, error: null, mocked: false };
  } catch (e: any) {
    return { data: fallback, error: e, mocked: true };
  }
}

const EmailIngest = z.object({
  sender: z.string().optional(),
  subject: z.string().optional(),
  raw_content: z.string().min(1).max(20000),
  external_id: z.string().optional(), // gmail messageId para idempotencia
  received_at: z.string().optional(),
});

export async function ingestionRoutes(app: FastifyInstance) {
  // POST /v1/ingestion/email  — Flujo Gmail §11.1: Banco → Email → Gmail → Ingestion → Parser
  app.post("/v1/ingestion/email", async (req, reply) => {
    const userId = getUserId(req);
    const parsed = EmailIngest.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { sender, subject, raw_content, external_id, received_at } = parsed.data;

    // Parser siempre primero (no depende de DB) §14
    const p = parseEmail(raw_content);
    const normalized = normalizeForAI(raw_content);

    // Idempotencia por (source, external_id) si viene — con fallback
    if (external_id) {
      const { data: existing } = await trySupabase(
        supabase.from("raw_events").select("id").eq("source", "gmail").eq("external_id", external_id).eq("user_id", userId).single() as any,
        null
      );
      if (existing) return reply.status(200).send({ dedup: true, raw_event_id: (existing as any).id, message: "duplicate email ignored", parsed: p, normalized, mocked: true });
    }

    // 1. Guardar RawEvent inmutable §12 — con fallback mock si no hay DB
    const mockRaw = {
      id: `mock-${crypto.randomUUID()}`,
      user_id: userId,
      source: "gmail",
      external_id: external_id ?? null,
      sender: sender ?? null,
      subject: subject ?? null,
      raw_content: raw_content.slice(0, 200),
      received_at: received_at ?? new Date().toISOString(),
      mocked: true
    };
    const { data: raw, mocked: rawMocked } = await trySupabase(
      supabase.from("raw_events").insert({
        user_id: userId,
        source: "gmail",
        external_id: external_id ?? null,
        sender: sender ?? null,
        subject: subject ?? null,
        raw_content,
        received_at: received_at ?? new Date().toISOString(),
        metadata: { normalized }
      }).select().single() as any,
      mockRaw
    );

    // 3. AI Classification Phase 4 — solo si hay monto y no es 100% determinístico
    // Parser ya dio amount/merchant/date; AI refina categoría, merchant normalizado, recurring, etc. §16-17
    let ai: any = null;
    let finalMerchant = p.merchant ?? (p.operation === "transfer" ? "Transferencia" : "Desconocido");
    let finalCategory: string | null = null;
    let aiConfidence = p.confidence;
    let aiNeedsReview = p.confidence < 0.6;
    try {
      const { createAIProvider } = await import("../../ai/providers/AIProvider.js");
      const provider = createAIProvider(process.env.GROQ_API_KEY ? "groq" : "mock");
      // Categorías válidas (slugs)
      const { data: cats } = await trySupabase(supabase.from("categories").select("slug").limit(20) as any, [{ slug: "supermercado" }, { slug: "transporte" }, { slug: "suscripciones" }, { slug: "restaurantes" }, { slug: "servicios" }, { slug: "otros" }]);
      const categories = (cats as any[])?.map((c: any) => c.slug) ?? ["otros"];
      // Reglas usuario
      const { data: rules } = await trySupabase(supabase.from("rules").select("merchant_normalized, preferred_category_id").eq("user_id", userId).limit(20) as any, []);
      const userRules = ((rules as any[]) ?? []).map((r: any) => ({ merchant: r.merchant_normalized, preferred_category: String(r.preferred_category_id) }));
      if (p.amount) {
        ai = await provider.classify({
          normalized_text: normalized,
          parser_hints: { amount: p.amount, date: p.date ?? undefined, merchant_guess: p.merchant ?? undefined },
          categories,
          user_rules: userRules,
          locale: "es-CL",
        });
        // Validar y aplicar: categoría y merchant de AI tienen prioridad si confidence alta, pero reglas mandan
        if (ai && ai.merchant) finalMerchant = ai.merchant;
        if (ai && ai.category) finalCategory = ai.category;
        aiConfidence = ai?.confidence ?? p.confidence;
        aiNeedsReview = ai?.needs_review ?? (p.confidence < 0.6);
      }
    } catch { /* AI opcional, no bloquea */ }

    // 4. Crear Transaction candidate
    let transaction: any = null;
    if (p.amount) {
      const type = (ai?.transaction_type as any) ?? (p.operation === "transfer" ? "transfer" : "expense");
      const status = aiNeedsReview ? "pending_review" : "pending_ai";
      // Resolver category_id si AI dio categoría
      let categoryId: string | null = null;
      if (finalCategory) {
        const { data: cat } = await trySupabase(supabase.from("categories").select("id").eq("slug", finalCategory).limit(1) as any, null);
        categoryId = (cat as any)?.id ?? (cat as any)?.[0]?.id ?? null;
      }
      const payload: any = {
        user_id: userId,
        raw_event_id: (raw as any).id,
        merchant: finalMerchant,
        amount: ai?.amount ?? p.amount,
        currency: ai?.currency ?? p.currency ?? "CLP",
        type,
        category_id: categoryId,
        payment_method: ai?.payment_method ?? (p.last4 ? "credit_card" : "unknown"),
        date: ai?.date ? `${ai.date}T${p.time ?? "12:00"}:00Z` : p.date ? `${p.date}T${p.time ?? "12:00"}:00Z` : new Date().toISOString(),
        status,
        confidence: aiConfidence,
        is_recurring_candidate: ai?.is_recurring_candidate ?? false,
      };
      const mockTx = { id: `mock-tx-${crypto.randomUUID()}`, ...payload, mocked: true };
      const { data: tx } = await trySupabase(
        supabase.from("transactions").insert(payload).select().single() as any,
        mockTx
      );
      transaction = tx;
    }

    const isMocked = (raw as any)?.mocked || (transaction as any)?.mocked;
    return reply.status(201).send({
      raw_event: raw,
      parsed: p,
      ai,
      normalized,
      transaction,
      mocked: isMocked,
      next: transaction ? `transaction ${isMocked ? "(mock, sin DB)" : "created"} (${(transaction as any)?.status ?? "pending"}) — AI: ${ai ? `${ai.category} ${Math.round((ai.confidence ?? 0)*100)}%` : "no AI"}` : "no amount found → needs manual review",
      warning: isMocked ? "Supabase no disponible — usando modo demo (parser+AI funcionan, datos no persisten). Configura SUPABASE_URL para persistir." : undefined
    });
  });

  // GET /v1/raw-events — bandeja auditoría §12
  app.get("/v1/raw-events", async (req: any) => {
    const userId = getUserId(req);
    const { data } = await supabase.from("raw_events").select("*").eq("user_id", userId).order("received_at", { ascending: false }).limit(50);
    return data ?? [];
  });
}
