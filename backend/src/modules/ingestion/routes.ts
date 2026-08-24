import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId } from "../../lib/supabase.js";
import { parseEmail, normalizeForAI } from "./parser.js";

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

    // Idempotencia por (source, external_id) si viene
    if (external_id) {
      const { data: existing } = await supabase.from("raw_events").select("id").eq("source", "gmail").eq("external_id", external_id).eq("user_id", userId).single() as any;
      if (existing) return reply.status(200).send({ dedup: true, raw_event_id: (existing as any).id, message: "duplicate email ignored" });
    }

    // 1. Guardar RawEvent inmutable §12
    const { data: raw, error: rawErr } = await supabase.from("raw_events").insert({
      user_id: userId,
      source: "gmail",
      external_id: external_id ?? null,
      sender: sender ?? null,
      subject: subject ?? null,
      raw_content,
      received_at: received_at ?? new Date().toISOString(),
      metadata: { normalized: normalizeForAI(raw_content) }
    }).select().single();
    if (rawErr) return reply.status(400).send({ error: rawErr.message });

    // 2. Parser determinístico §14
    const p = parseEmail(raw_content);
    const normalized = normalizeForAI(raw_content);

    // 3. Crear Transaction candidate si parser tiene amount
    let transaction: any = null;
    if (p.amount) {
      // Mapear operation → type
      const type = p.operation === "transfer" ? "transfer" : p.operation === "withdrawal" ? "expense" : "expense";
      // Resolver categoría: si no hay merchant, "otros"
      const { data: cat } = await supabase.from("categories").select("id").or(`slug.eq.${p.merchant?.toLowerCase() ?? "otros"},slug.eq.otros`).limit(1) as any;
      // Merchant fallback
      const merchant = p.merchant ?? (p.operation === "transfer" ? "Transferencia" : "Desconocido");
      // Si confianza <0.6 → pending_review, si no pending_ai (luego AI lo refinará en Phase 4)
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
      const { data: tx, error: txErr } = await supabase.from("transactions").insert(payload).select().single();
      if (!txErr) transaction = tx;
    }

    return reply.status(201).send({
      raw_event: raw,
      parsed: p,
      normalized,
      transaction,
      next: transaction ? "transaction created (pending_ai/review)" : "no amount found → needs manual review"
    });
  });

  // GET /v1/raw-events — bandeja auditoría §12
  app.get("/v1/raw-events", async (req: any) => {
    const userId = getUserId(req);
    const { data } = await supabase.from("raw_events").select("*").eq("user_id", userId).order("received_at", { ascending: false }).limit(50);
    return data ?? [];
  });
}
