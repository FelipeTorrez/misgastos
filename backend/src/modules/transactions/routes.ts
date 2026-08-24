import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId } from "../../lib/supabase.js";

const CreateTx = z.object({
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  merchant: z.string().min(1).max(100),
  amount: z.number().int().positive(), // CLP sin decimales
  currency: z.string().default("CLP"),
  type: z.enum(["expense","income","transfer"]),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]).default("unknown"),
  date: z.string(), // ISO
  from_account_id: z.string().uuid().nullable().optional(),
  to_account_id: z.string().uuid().nullable().optional(),
  status: z.enum(["pending_ai","pending_review","confirmed","corrected","ignored","duplicate"]).default("confirmed"),
  confidence: z.number().min(0).max(1).default(1)
}).refine(v => {
  if (v.type === "transfer") return !!v.from_account_id && !!v.to_account_id && v.from_account_id !== v.to_account_id;
  return true;
}, { message: "transfer requiere from_account_id y to_account_id distintos" });

export async function transactionRoutes(app: FastifyInstance) {
  app.get("/v1/transactions", async (req: any) => {
    const userId = getUserId(req);
    const { month, category_id, account_id } = req.query ?? {};
    let q = supabase.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(100);
    if (month) q = q.gte("date", `${month}-01`).lt("date", `${month}-31`);
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
    if (payload.type === "transfer") {
      payload.transfer_group_id = crypto.randomUUID();
      // transfer no afecta balance global, guardamos como transfer
    }
    const { data, error } = await supabase.from("transactions").insert(payload).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch("/v1/transactions/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const { data, error } = await supabase.from("transactions").update({ ...req.body, status: req.body.status ?? "corrected", updated_at: new Date().toISOString() }).eq("id", req.params.id).eq("user_id", userId).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    // Aprender regla si cambia categoría -> upsert rule
    if (req.body.category_id && data.merchant) {
      const norm = data.merchant.toLowerCase().trim();
      await supabase.from("rules").upsert({ user_id: userId, merchant_normalized: norm, preferred_category_id: req.body.category_id }, { onConflict: "user_id,merchant_normalized" });
    }
    return data;
  });

  app.delete("/v1/transactions/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const { error } = await supabase.from("transactions").delete().eq("id", req.params.id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
