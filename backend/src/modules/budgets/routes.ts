import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId } from "../../lib/supabase.js";

const CreateBudget = z.object({
  category_id: z.string().uuid().nullable(), // null = global
  amount: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-01
  period: z.string().default("monthly")
});

export async function budgetRoutes(app: FastifyInstance) {
  // Lista presupuestos del mes con spent calculado
  app.get("/v1/budgets", async (req: any) => {
    const userId = getUserId(req);
    const month = req.query?.month ?? new Date().toISOString().slice(0,7) + "-01";
    const { data: budgets } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", month);
    // calcular spent
    const start = month;
    const end = new Date(new Date(month).setMonth(new Date(month).getMonth()+1)).toISOString().slice(0,10);
    const { data: txs } = await supabase.from("transactions").select("amount, category_id, type").eq("user_id", userId).eq("type","expense").gte("date", start).lt("date", end);
    const byCat: Record<string, number> = {};
    let globalSpent = 0;
    for (const t of txs ?? []) {
      globalSpent += t.amount;
      if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] ?? 0) + t.amount;
    }
    return (budgets ?? []).map((b:any) => ({
      ...b,
      spent: b.category_id ? (byCat[b.category_id] ?? 0) : globalSpent,
      remaining: b.amount - (b.category_id ? (byCat[b.category_id] ?? 0) : globalSpent),
      pct: Math.round(((b.category_id ? (byCat[b.category_id] ?? 0) : globalSpent) / b.amount) * 100)
    }));
  });

  app.post("/v1/budgets", async (req, reply) => {
    const userId = getUserId(req);
    const parsed = CreateBudget.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { data, error } = await supabase.from("budgets").upsert({ ...parsed.data, user_id: userId }, { onConflict: "user_id,category_id,month" }).select().single();
    // nota: para global (null) el índice parcial maneja unicidad, upsert con null necesita manejo; fallback a insert
    if (error) {
      // si es global duplicado, intenta update
      if (parsed.data.category_id === null) {
        const { data: existing } = await supabase.from("budgets").select("id").eq("user_id", userId).is("category_id", null).eq("month", parsed.data.month).single();
        if (existing) {
          const { data: upd } = await supabase.from("budgets").update({ amount: parsed.data.amount }).eq("id", (existing as any).id).select().single();
          return upd;
        }
      }
      return reply.status(400).send({ error: error.message });
    }
    return reply.status(201).send(data);
  });

  app.delete("/v1/budgets/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    const { error } = await supabase.from("budgets").delete().eq("id", req.params.id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
