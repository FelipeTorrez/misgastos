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

    // 3. Crear Transaction candidate si parser tiene amount — con fallback
    let transaction: any = null;
    if (p.amount) {
      const type = p.operation === "transfer" ? "transfer" : "expense";
      const merchant = p.merchant ?? (p.operation === "transfer" ? "Transferencia" : "Desconocido");
      const status = p.confidence < 0.6 ? "pending_review" : "pending_ai";
      const payload: any = {
        user_id: userId,
        raw_event_id: (raw as any).id,
        merchant,
        amount: p.amount,
        currency: p.currency ?? "CLP",
        type,
        payment_method: p.last4 ? "credit_card" : "unknown",
        date: p.date ? `${p.date}T${p.time ?? "12:00"}:00Z` : new Date().toISOString(),
        status,
        confidence: p.confidence,
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
      normalized,
      transaction,
      mocked: isMocked,
      next: transaction ? `transaction ${isMocked ? "(mock, sin DB)" : "created"} (${(transaction as any)?.status ?? "pending"})` : "no amount found → needs manual review",
      warning: isMocked ? "Supabase no disponible — usando modo demo (parser funciona, datos no persisten). Configura SUPABASE_URL para persistir." : undefined
    });
  });

  // GET /v1/raw-events — bandeja auditoría §12
  app.get("/v1/raw-events", async (req: any) => {
    const userId = getUserId(req);
    const { data } = await supabase.from("raw_events").select("*").eq("user_id", userId).order("received_at", { ascending: false }).limit(50);
    return data ?? [];
  });
}
