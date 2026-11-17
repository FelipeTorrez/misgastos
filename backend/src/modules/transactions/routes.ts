import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";
import { normalizeMerchant, findBestRuleMatch } from "../../lib/merchantNorm.js";
import { del as classifyCacheDel } from "../../lib/classifyCache.js";
import { monthBounds } from "../../lib/dateRange.js";
import { TransactionsQuery, DateTimeQuery } from "../../lib/queryDates.js";

export const CreateTx = z.object({
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  merchant: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  currency: z.string().default("CLP"),
  type: z.enum(["expense","income","transfer"]),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]).default("unknown"),
  date: DateTimeQuery,
  from_account_id: z.string().uuid().nullable().optional(),
  to_account_id: z.string().uuid().nullable().optional(),
  status: z.enum(["pending_ai","pending_review","confirmed","corrected","ignored","duplicate"]).default("confirmed"),
  confidence: z.number().min(0).max(1).default(1)
}).refine(v => {
  if (v.type === "transfer") return !!v.from_account_id && !!v.to_account_id && v.from_account_id !== v.to_account_id;
  return true;
}, { message: "transfer requiere from_account_id y to_account_id distintos" });

function toTitleCase(s: string): string {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export const PatchTx = z.object({
  merchant: z.string().min(1).max(100).optional(),
  amount: z.number().int().positive().optional(),
  category_id: z.string().uuid().nullable().optional(),
  status: z.enum(["pending_ai","pending_review","confirmed","corrected","ignored","duplicate"]).optional(),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]).optional(),
  direction: z.enum(["in","out","internal","none"]).optional(),
  counterparty: z.string().max(100).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  account_id: z.string().uuid().nullable().optional(),
  date: DateTimeQuery.optional(),
}).strict();

export async function transactionRoutes(app: FastifyInstance) {
  // review_reason vive en metadata.review_reason (cola de revisión: procesadores
  // de pago, fallback IA). Se expone top-level para que la app lo muestre.
  const withReviewReason = (rows: any[]) =>
    rows.map((t: any) => ({ ...t, review_reason: t?.metadata?.review_reason ?? null }));

  app.get("/v1/transactions", async (req: any, reply: any) => {
    const parsed = TransactionsQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const userId = getUserId(req);
    const { month, category_id, account_id, from, to } = parsed.data;
    const limit = parsed.data.limit ?? 200;
    if (isMockMode) {
      const rows = mockStore.listTransactions(userId, { month, category_id, account_id, from, to, limit });
      reply.header("x-transactions-limit", String(limit));
      if (rows.length >= limit) reply.header("x-transactions-truncated", "1");
      return withReviewReason(rows);
    }
    let q = supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(limit);
    if (from || to) {
      if (from) q = q.gte("date", from);
      if (to) {
        const toExcl = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
        q = q.lt("date", toExcl);
      }
    } else if (month) {
      const { start, endExcl: end } = monthBounds(month);
      q = q.gte("date", start).lt("date", end);
    }
    if (category_id) q = q.eq("category_id", category_id);
    if (account_id) q = q.eq("account_id", account_id);
    const { data, error } = await q;
    if (error) return reply.status(503).send({ error: error.message, code: "db_unavailable" });
    const rows = withReviewReason(data ?? []);
    reply.header("x-transactions-limit", String(limit));
    if (rows.length >= limit) reply.header("x-transactions-truncated", "1");
    return rows;
  });

  app.post("/v1/transactions", async (req, reply) => {
    const userId = getUserId(req);
    const parsed = CreateTx.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const payload: any = { ...parsed.data, user_id: userId };
    // Normaliza merchant para display
    if (payload.merchant) payload.merchant = toTitleCase(payload.merchant.trim());
    // Si no trae categoría, intenta aplicar regla existente (ej: Jumbo → Supermercado)
    if (!payload.category_id && payload.merchant) {
      const norm = normalizeMerchant(payload.merchant);
      let rule: any = null;
      if (isMockMode) rule = mockStore.findRule(userId, norm) ?? findBestRuleMatch(norm, mockStore.listRules(userId));
      else {
        const { data } = await supabase.from("rules").select("preferred_category_id, merchant_normalized").eq("user_id", userId).eq("merchant_normalized", norm).limit(1);
        rule = ((data ?? []) as any[])[0] ?? null;
        if (!rule) {
          const { data: all } = await supabase.from("rules").select("preferred_category_id, merchant_normalized").eq("user_id", userId).limit(200);
          rule = findBestRuleMatch(norm, ((all ?? []) as any[]));
        }
      }
      if (rule) payload.category_id = rule.preferred_category_id;
    }
    if (isMockMode) return reply.status(201).send(mockStore.insertTransaction(userId, payload));
    if (payload.type === "transfer") payload.transfer_group_id = crypto.randomUUID();
    const { data, error } = await supabase.from("transactions").insert(payload).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.get("/v1/transactions/:id", async (req: any, reply: any) => {
    const userId = getUserId(req);
    const id = req.params.id as string;
    if (isMockMode) {
      const tx = mockStore.getTransaction(userId, id);
      if (!tx) return reply.status(404).send({ error: "transaction not found" });
      let raw_event: any = null;
      if (tx.raw_event_id) {
        const re = mockStore.getRawEvent(tx.raw_event_id, userId);
        if (re) raw_event = { id: re.id, source: re.source, sender: re.sender, subject: re.subject, received_at: re.received_at, raw_content: re.raw_content };
      }
      return { ...tx, review_reason: tx?.metadata?.review_reason ?? null, raw_event };
    }
    const { data: txData, error: txError } = await supabase.from("transactions").select("*").eq("id", id).eq("user_id", userId).limit(1);
    if (txError) return reply.status(503).send({ error: txError.message, code: "db_unavailable" });
    const tx = ((txData ?? []) as any[])[0] ?? null;
    if (!tx) return reply.status(404).send({ error: "transaction not found" });
    let raw_event: any = null;
    if (tx.raw_event_id) {
      const { data: reData, error: reError } = await supabase.from("raw_events").select("id, source, sender, subject, received_at, raw_content").eq("id", tx.raw_event_id).eq("user_id", userId).limit(1);
      if (reError) return reply.status(503).send({ error: reError.message, code: "db_unavailable" });
      raw_event = ((reData ?? []) as any[])[0] ?? null;
    }
    return { ...tx, review_reason: tx?.metadata?.review_reason ?? null, raw_event };
  });

  app.patch("/v1/transactions/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const body = { ...((req.body ?? {}) as any) };
    const updateRule = body.update_rule !== false;
    delete body.update_rule;
    const parsed = PatchTx.safeParse(body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const patchData: any = { ...parsed.data };
    patchData.status = patchData.status ?? "corrected";
    if (isMockMode) {
      const tx = mockStore.updateTransaction(userId, req.params.id, patchData);
      if (!tx) return reply.status(404).send({ error: "transaction not found" });
      // Al corregir categoría, una clasificación cacheada mala queda congelada:
      // invalidar para que la próxima ingesta de este comercio reclasifique.
      if (parsed.data.category_id && tx.merchant) {
        classifyCacheDel(normalizeMerchant(tx.merchant));
      }
      // Learn rule on category correction (solo si update_rule !== false)
      if (updateRule && parsed.data.category_id && tx.merchant) {
        const norm = normalizeMerchant(tx.merchant);
        const existing = mockStore.findRule(userId, norm);
        if (existing) {
          mockStore.updateRule(userId, existing.id, { preferred_category_id: parsed.data.category_id });
          mockStore.incrementRuleHits(existing.id);
        } else {
          mockStore.upsertRule(userId, { merchant_normalized: norm, preferred_category_id: parsed.data.category_id });
        }
      }
      return { ...tx, mocked: true };
    }
    const { data, error } = await supabase.from("transactions").update({ ...patchData, updated_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", userId).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    // Al corregir categoría, invalidar el cache de este comercio (ver rama mock).
    if (parsed.data.category_id && (data as any)?.merchant) {
      classifyCacheDel(normalizeMerchant((data as any).merchant));
    }
    if (updateRule && parsed.data.category_id && data.merchant) {
      const norm = normalizeMerchant(data.merchant);
      await supabase.from("rules").upsert({ user_id: userId, merchant_normalized: norm, preferred_category_id: parsed.data.category_id }, { onConflict: "user_id,merchant_normalized" });
    }
    return data;
  });

  app.delete("/v1/transactions/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    if (isMockMode) { mockStore.deleteTransaction(userId, req.params.id); return { ok: true }; }
    const { error } = await supabase.from("transactions").delete().eq("id", req.params.id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
