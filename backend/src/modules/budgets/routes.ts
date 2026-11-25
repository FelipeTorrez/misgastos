import { FastifyInstance } from "fastify";
import { z } from "zod";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";
import { monthBounds, monthOverlaps, rangeDays, currentMonthLocal, shiftMonths } from "../../lib/dateRange.js";
import { BudgetsQuery, UuidParam } from "../../lib/queryDates.js";
import { planCarryOver } from "./carry.js";

const CreateBudget = z.object({
  category_id: z.string().uuid().nullable(), // null = global
  amount: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // monthly: YYYY-MM-01 · cycle: fecha de inicio del ciclo
  period: z.enum(["monthly", "cycle"]).default("monthly")
});

const CarryOver = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // inicio del ciclo nuevo
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).refine((d) => d.from <= d.to, { message: "from must be <= to", path: ["from"] });

export async function budgetRoutes(app: FastifyInstance) {
  // Lista presupuestos del mes (o de un rango prorrateado) con spent calculado
  app.get("/v1/budgets", async (req: any, reply: any) => {
    const parsed = BudgetsQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const userId = getUserId(req);
    // Acepta 'YYYY-MM' y 'YYYY-MM-01'; normaliza a 'YYYY-MM-01'.
    // Sin month/from/to: default al mes en curso (reloj local, no UTC).
    const rawMonth = parsed.data.month;
    const month = rawMonth ? `${rawMonth.slice(0, 7)}-01` : `${currentMonthLocal()}-01`;
    const from = parsed.data.from;
    const to = parsed.data.to;

    let budgets: any[], txs: any[];

    if (from && to) {
      // Rama ciclo: presupuestos con period='cycle' y month=from (inicio del ciclo)
      // se devuelven SIN prorratear contra el gasto de todo el rango.
      let cycleBs: any[];
      if (isMockMode) {
        cycleBs = mockStore.listBudgets(userId, from).filter(b => b.period === "cycle");
      } else {
        const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", from).eq("period", "cycle");
        cycleBs = bs ?? [];
      }

      // GET solo lectura: si el ciclo nuevo aún no tiene límites se devuelve [].
      // Heredar del ciclo anterior es una acción explícita (POST /v1/budgets/carry-over).

      // spent: gasto real dentro del rango (con fecha para el prorrateo por tramo del fallback)
      let rangeTxs: any[];
      if (isMockMode) {
        rangeTxs = mockStore.transactions.filter(t =>
          t.user_id === userId && t.type === "expense" &&
          t.status !== "duplicate" && t.status !== "ignored" &&
          typeof t.date === "string" && t.date.slice(0, 10) >= from && t.date.slice(0, 10) <= to
        ).map(t => ({ amount: t.amount, category_id: t.category_id, date: t.date }));
      } else {
        const start = from;
        const toExcl = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
        const { data: ts } = await supabase.from("transactions").select("amount, category_id, date, type, status").eq("user_id", userId).eq("type","expense").gte("date", start).lt("date", toExcl);
        rangeTxs = ((ts ?? []) as any[]).filter(t => t.status !== "duplicate" && t.status !== "ignored");
      }

      // Items de ciclo: amount sin prorratear, spent del rango completo.
      const byCatCycle: Record<string, number> = {};
      let globalSpentCycle = 0;
      for (const t of rangeTxs) {
        globalSpentCycle += t.amount;
        if (t.category_id) byCatCycle[t.category_id] = (byCatCycle[t.category_id] ?? 0) + t.amount;
      }
      const seenCycle = new Set<string>();
      let seenGlobalCycle = false;
      const cycleItems = cycleBs
        .filter((b: any) => {
          if (b.category_id) {
            if (seenCycle.has(b.category_id)) return false;
            seenCycle.add(b.category_id);
            return true;
          }
          if (seenGlobalCycle) return false;
          seenGlobalCycle = true;
          return true;
        })
        .map((b: any) => {
          const spent = b.category_id ? (byCatCycle[b.category_id] ?? 0) : globalSpentCycle;
          return {
            ...b,
            spent,
            remaining: b.amount - spent,
            pct: Math.round((spent / b.amount) * 100),
            month: from,
            period: "cycle",
            partial: false,
            range: { from, to },
          };
        });

      // Fallback: prorrateo de mensuales, con spent SOLO del tramo cubierto
      // (tramos = solape de cada mes con presupuesto; partial=true si falta algún tramo).
      const overlaps = monthOverlaps(from, to);
      const overlapDaysByMonth = new Map(overlaps.map(o => [o.month, o.overlapDays]));
      const totalDays = rangeDays(from, to);
      const budgetByCat = new Map<string, number>();
      const catMonths = new Map<string, Set<string>>();
      const globalMonths = new Set<string>();
      let globalAmount = 0;
      let rawBudgets: any[] = [];

      for (const o of overlaps) {
        let monthBs: any[] = [];
        if (isMockMode) {
          monthBs = mockStore.listBudgets(userId, o.month).filter(b => (b.period ?? "monthly") === "monthly");
        } else {
          const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", o.month).eq("period", "monthly");
          monthBs = bs ?? [];
        }
        rawBudgets = rawBudgets.concat(monthBs);
        for (const b of monthBs as any[]) {
          const prorated = Math.round(b.amount * o.ratio);
          if (b.category_id) {
            budgetByCat.set(b.category_id, (budgetByCat.get(b.category_id) ?? 0) + prorated);
            if (!catMonths.has(b.category_id)) catMonths.set(b.category_id, new Set());
            catMonths.get(b.category_id)!.add(o.month);
          } else {
            globalAmount += prorated;
            globalMonths.add(o.month);
          }
        }
      }

      const byCat: Record<string, number> = {};
      let globalSpent = 0;
      for (const t of rangeTxs) {
        const d10 = typeof t.date === "string" ? t.date.slice(0, 10) : null;
        if (!d10) continue;
        const mkey = `${d10.slice(0, 7)}-01`;
        if (t.category_id && catMonths.get(t.category_id)?.has(mkey)) {
          byCat[t.category_id] = (byCat[t.category_id] ?? 0) + t.amount;
        }
        if (globalMonths.has(mkey)) globalSpent += t.amount;
      }

      // unir categorías de presupuestos (dedup por id)
      const seen = new Set<string>();
      let seenGlobal = false;
      const merged: (any & { amount: number; effective: boolean })[] = [];
      for (const b of rawBudgets as any[]) {
        const prorated = b.category_id ? (budgetByCat.get(b.category_id) ?? 0) : globalAmount;
        const coveredMonths = b.category_id ? (catMonths.get(b.category_id) ?? new Set<string>()) : globalMonths;
        let coveredDays = 0;
        for (const m of coveredMonths) coveredDays += overlapDaysByMonth.get(m) ?? 0;
        const partial = coveredDays < totalDays;
        if (b.category_id) {
          if (seenCycle.has(b.category_id)) continue;
          if (seen.has(b.category_id)) continue;
          seen.add(b.category_id);
        } else {
          if (seenGlobalCycle) continue;
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
          period: "monthly",
          partial,
          coveredDays,
          totalDays,
          range: { from, to },
          effective: b.category_id ? true : (globalAmount > 0),
        });
      }
      return [...cycleItems, ...merged];
    }

    if (isMockMode) {
      budgets = mockStore.listBudgets(userId, month).filter(b => (b.period ?? "monthly") === "monthly");
      txs = mockStore.transactions.filter(t =>
        t.user_id === userId && t.type === "expense" &&
        t.status !== "duplicate" && t.status !== "ignored" &&
        typeof t.date === "string" && t.date.startsWith(month.slice(0, 7))
      ).map(t => ({ amount: t.amount, category_id: t.category_id }));
    } else {
      const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", month).eq("period", "monthly");
      budgets = bs ?? [];
      const { start, endExcl } = monthBounds(month.slice(0, 7));
      const { data: ts } = await supabase.from("transactions").select("amount, category_id, type, status").eq("user_id", userId).eq("type","expense").gte("date", start).lt("date", endExcl);
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
    const period = parsed.data.period;
    // monthly se normaliza a día 01; cycle guarda la fecha de inicio del ciclo tal cual.
    const monthNorm = period === "cycle" ? parsed.data.month : `${parsed.data.month.slice(0, 7)}-01`;
    if (isMockMode) {
      const b = mockStore.upsertBudget(userId, { ...parsed.data, month: monthNorm });
      return reply.status(201).send({ ...b, mocked: true });
    }
    // Upsert con ON CONFLICT("user_id,category_id,month") falla porque las únicas únicas
    // son PARCIALES (budgets_category_unique / budgets_global_unique), no una constraint simple.
    // Hacemos find-then-insert/update manual (compatible con category_id null = global).
    let q = supabase.from("budgets").select("id").eq("user_id", userId).eq("month", monthNorm).eq("period", period).limit(1);
    if (parsed.data.category_id === null) q = q.is("category_id", null);
    else q = q.eq("category_id", parsed.data.category_id);
    const { data: existing } = await q;
    if (existing && (existing as any[]).length > 0) {
      const { data: upd, error: updErr } = await supabase.from("budgets").update({ amount: parsed.data.amount }).eq("id", (existing as any[])[0].id).select().single();
      if (updErr) return reply.status(400).send({ error: updErr.message });
      return upd;
    }
    const { data, error } = await supabase.from("budgets").insert({ ...parsed.data, month: monthNorm, user_id: userId }).select().single();
    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // Herencia explícita de límites de ciclo: copia los del ciclo anterior (from - 1 mes)
  // que aún no existan en `from`. Idempotente: una segunda llamada crea 0 filas.
  app.post("/v1/budgets/carry-over", async (req: any, reply: any) => {
    const userId = getUserId(req);
    const parsed = CarryOver.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { from } = parsed.data;
    const prevStart = shiftMonths(from, -1);

    let prevBs: any[];
    let currentBs: any[];
    if (isMockMode) {
      prevBs = mockStore.listBudgets(userId, prevStart).filter(b => b.period === "cycle");
      currentBs = mockStore.listBudgets(userId, from).filter(b => b.period === "cycle");
    } else {
      const prevRes = await supabase.from("budgets").select("*").eq("user_id", userId).eq("month", prevStart).eq("period", "cycle");
      if (prevRes.error) return reply.status(500).send({ error: prevRes.error.message });
      prevBs = prevRes.data ?? [];
      const curRes = await supabase.from("budgets").select("*").eq("user_id", userId).eq("month", from).eq("period", "cycle");
      if (curRes.error) return reply.status(500).send({ error: curRes.error.message });
      currentBs = curRes.data ?? [];
    }

    const plan = planCarryOver(prevBs, currentBs, from);
    let created = 0;
    for (const row of plan) {
      if (isMockMode) {
        mockStore.upsertBudget(userId, row);
      } else {
        const { error } = await supabase.from("budgets").insert({ ...row, user_id: userId });
        if (error) return reply.status(500).send({ error: error.message, created });
      }
      created++;
    }

    let budgets: any[];
    if (isMockMode) {
      budgets = mockStore.listBudgets(userId, from).filter(b => b.period === "cycle");
    } else {
      const { data, error } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", from).eq("period", "cycle");
      if (error) return reply.status(500).send({ error: error.message, created });
      budgets = data ?? [];
    }

    // skipped = límites del ciclo anterior que ya existían en `from` (o inválidos).
    const skipped = Math.max(0, prevBs.length - created);
    return { created, skipped, budgets };
  });

  app.delete("/v1/budgets/:id", async (req: any, reply) => {
    const parsedId = UuidParam.safeParse(req.params.id);
    if (!parsedId.success) return reply.status(400).send(parsedId.error.flatten());
    const id = parsedId.data;
    const userId = getUserId(req);
    if (isMockMode) {
      mockStore.deleteBudget(userId, id);
      return { ok: true };
    }
    const { error } = await supabase.from("budgets").delete().eq("id", id).eq("user_id", userId);
    if (error) return reply.status(400).send({ error: error.message });
    return { ok: true };
  });
}
