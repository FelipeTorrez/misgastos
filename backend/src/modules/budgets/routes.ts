import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";
import { monthOverlaps } from "../../lib/dateRange.js";

const CreateBudget = z.object({
  category_id: z.string().uuid().nullable(), // null = global
  amount: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-01
  period: z.string().default("monthly")
});

export async function budgetRoutes(app: FastifyInstance) {
  // Lista presupuestos del mes (o de un rango prorrateado) con spent calculado
  app.get("/v1/budgets", async (req: any) => {
    const userId = getUserId(req);
    const month = req.query?.month ?? new Date().toISOString().slice(0,7) + "-01";
    const from = req.query?.from;   // YYYY-MM-DD (inclusive)
    const to = req.query?.to;       // YYYY-MM-DD (inclusive)
    const isRange = Boolean(from && to);

    let budgets: any[], txs: any[];

    if (isRange) {
      const overlaps = monthOverlaps(from, to);
      const budgetByCat = new Map<string, number>();
      let globalAmount = 0;
      let rawBudgets: any[] = [];

      for (const o of overlaps) {
        let monthBs: any[] = [];
        if (isMockMode) {
          monthBs = mockStore.listBudgets(userId, o.month);
        } else {
          const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", o.month);
          monthBs = bs ?? [];
        }
        rawBudgets = rawBudgets.concat(monthBs);
        for (const b of monthBs as any[]) {
          const prorated = Math.round(b.amount * o.ratio);
          if (b.category_id) budgetByCat.set(b.category_id, (budgetByCat.get(b.category_id) ?? 0) + prorated);
          else globalAmount += prorated;
        }
      }

      // spent: gasto real dentro del rango
      let rangeTxs: any[];
      if (isMockMode) {
        rangeTxs = mockStore.transactions.filter(t =>
          t.user_id === userId && t.type === "expense" &&
          t.status !== "duplicate" && t.status !== "ignored" &&
          typeof t.date === "string" && t.date.slice(0, 10) >= from && t.date.slice(0, 10) <= to
        ).map(t => ({ amount: t.amount, category_id: t.category_id }));
      } else {
        const start = from;
        const toExcl = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
        const { data: ts } = await supabase.from("transactions").select("amount, category_id, type, status").eq("user_id", userId).eq("type","expense").gte("date", start).lt("date", toExcl);
        rangeTxs = ((ts ?? []) as any[]).filter(t => t.status !== "duplicate" && t.status !== "ignored");
      }
      const byCat: Record<string, number> = {};
      let globalSpent = 0;
      for (const t of rangeTxs) {
        globalSpent += t.amount;
        if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] ?? 0) + t.amount;
      }

      // unir categorías de presupuestos (dedup por id)
      const seen = new Set<string>();
      let seenGlobal = false;
      const merged: (any & { amount: number; effective: boolean })[] = [];
      for (const b of rawBudgets as any[]) {
        const prorated = b.category_id ? (budgetByCat.get(b.category_id) ?? 0) : globalAmount;
        if (b.category_id) {
          if (seen.has(b.category_id)) continue;
          seen.add(b.category_id);
        } else {
          if (seenGlobal) continue;
          seenGlobal = true;
        }
        const spent = b.category_id ? (byCat[b.category_id] ?? 0) : globalSpent;
        merged.push({
          ...b,
          amount: prorated,
          spent,
          remaining: prorated - spent,
          pct: Math.round((spent / prorated) * 100),
          month: from,
          range: { from, to },
          effective: b.category_id ? true : (globalAmount > 0),
        });
      }
      return merged;
    }

    if (isMockMode) {
      budgets = mockStore.listBudgets(userId, month);
      txs = mockStore.transactions.filter(t =>
        t.user_id === userId && t.type === "expense" &&
        t.status !== "duplicate" && t.status !== "ignored" &&
        typeof t.date === "string" && t.date.startsWith(month.slice(0, 7))
      ).map(t => ({ amount: t.amount, category_id: t.category_id }));
    } else {
      const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", month);
      budgets = bs ?? [];
      const start = month;
      const end = new Date(new Date(month).setMonth(new Date(month).getMonth()+1)).toISOString().slice(0,10);
      const { data: ts } = await supabase.from("transactions").select("amount, category_id, type, status").eq("user_id", userId).eq("type","expense").gte("date", start).lt("date", end);
      txs = ((ts ?? []) as any[]).filter(t => t.status !== "duplicate" && t.status !== "ignored");
    }
    // calcular spent
    const byCat: Record<string, number> = {};
    let globalSpent = 0;
    for (const t of txs) {
      globalSpent += t.amount;
      if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] ?? 0) + t.amount;
    }
    return budgets.map((b:any) => ({
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
    if (isMockMode) {
      const b = mockStore.upsertBudget(userId, parsed.data);
      return reply.status(201).send({ ...b, mocked: true });
    }
    // Upsert con ON CONFLICT("user_id,category_id,month") falla porque las únicas únicas
    // son PARCIALES (budgets_category_unique / budgets_global_unique), no una constraint simple.
    // Hacemos find-then-insert/update manual (compatible con category_id null = global).
    let q = supabase.from("budgets").select("id").eq("user_id", userId).eq("month", parsed.data.month).limit(1);
    if (parsed.data.category_id === null) q = q.is("category_id", null);
    else q = q.eq("category_id", parsed.data.category_id);
    const { data: existing } = await q;
    if (existing && (existing as any[]).length > 0) {
      const { data: upd, error: updErr } = await supabase.from("budgets").update({ amount: parsed.data.amount }).eq("id", (existing as any[])[0].id).select().single();
      if (updErr) return reply.status(400).send({ error: updErr.message });
      return upd;
    }
    const { data, error } = await supabase.from("budgets").insert({ ...parsed.data, user_id: userId }).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.delete("/v1/budgets/:id", async (req: any, reply) => {
    const userId = getUserId(req);
    if (isMockMode) {
      mockStore.deleteBudget(userId, req.params.id);
      return { ok: true };
    }
    const { error } = await supabase.from("budgets").delete().eq("id", req.params.id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
