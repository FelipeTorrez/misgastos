import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";

const CreateTx = z.object({
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  merchant: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  currency: z.string().default("CLP"),
  type: z.enum(["expense","income","transfer"]),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]).default("unknown"),
  date: z.string(),
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

export async function transactionRoutes(app: FastifyInstance) {
  app.get("/v1/transactions", async (req: any) => {
    const userId = getUserId(req);
    const { month, category_id, account_id, from, to } = req.query ?? {};
    const limitRaw = req.query?.limit;
    const limit = Math.min(limitRaw ? parseInt(String(limitRaw), 10) : 100, 500) || 100;
    if (isMockMode) return mockStore.listTransactions(userId, { month, category_id, account_id, from, to, limit });
    let q = supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(limit);
    if (from || to) {
      if (from) q = q.gte("date", from);
      if (to) {
        const toExcl = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
        q = q.lt("date", toExcl);
      }
    } else if (month) {
      const start = `${month}-01`;
      const end = new Date(new Date(start).setMonth(new Date(start).getMonth() + 1)).toISOString().slice(0, 10);
      q = q.gte("date", start).lt("date", end);
    }
    if (category_id) q = q.eq("category_id", category_id);
    if (account_id) q = q.eq("account_id", account_id);
    const { data } = await q;
    return data ?? [];
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
      const norm = payload.merchant.toLowerCase().trim();
      let rule: any = null;
      if (isMockMode) rule = mockStore.findRule(userId, norm);
      else {
        const { data } = await supabase.from("rules").select("preferred_category_id").eq("user_id", userId).eq("merchant_normalized", norm).limit(1);
        rule = ((data ?? []) as any[])[0] ?? null;
      }
      if (rule) payload.category_id = rule.preferred_category_id;
    }
    if (isMockMode) return reply.status(201).send(mockStore.insertTransaction(userId, payload));
    if (payload.type === "transfer") payload.transfer_group_id = crypto.randomUUID();
    const { data, error } = await supabase.from("transactions").insert(payload).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch("/v1/transactions/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const body = req.body as any;
    const updateRule = body.update_rule !== false;
    const patchData: any = { ...body };
    delete patchData.update_rule;
    patchData.status = patchData.status ?? "corrected";
    if (isMockMode) {
      const tx = mockStore.updateTransaction(userId, req.params.id, patchData);
      if (!tx) return reply.status(404).send({ error: "transaction not found" });
      // Learn rule on category correction (solo si update_rule !== false)
      if (updateRule && body.category_id && tx.merchant) {
        const norm = tx.merchant.toLowerCase().trim();
        const existing = mockStore.findRule(userId, norm);
        if (existing) {
          mockStore.updateRule(userId, existing.id, { preferred_category_id: body.category_id });
          mockStore.incrementRuleHits(existing.id);
        } else {
          mockStore.upsertRule(userId, { merchant_normalized: norm, preferred_category_id: body.category_id });
        }
      }
      return { ...tx, mocked: true };
    }
    const { data, error } = await supabase.from("transactions").update({ ...patchData, updated_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", userId).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    if (updateRule && body.category_id && data.merchant) {
      const norm = data.merchant.toLowerCase().trim();
      await supabase.from("rules").upsert({ user_id: userId, merchant_normalized: norm, preferred_category_id: body.category_id }, { onConflict: "user_id,merchant_normalized" });
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
