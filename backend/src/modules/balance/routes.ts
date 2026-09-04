import { FastifyInstance } from "fastify";
import { supabase, getUserId, isMockMode } from "../../lib/supabase.js";
import { mockStore } from "../../lib/mockStore.js";
import { SYSTEM_CATEGORIES } from "../categories/routes.js";
import { monthOverlaps, rangeDays } from "../../lib/dateRange.js";

export async function balanceRoutes(app: FastifyInstance) {
  app.get("/v1/balance", async (req: any) => {
    const userId = getUserId(req);
    const month = req.query?.month; // YYYY-MM
    const from = req.query?.from;   // YYYY-MM-DD (inclusive)
    const to = req.query?.to;       // YYYY-MM-DD (inclusive)
    let rows: any[];
    let rawForByCat: any[] = [];
    if (isMockMode) {
      let list = mockStore.transactions.filter(t => t.user_id === userId && t.status !== "duplicate" && t.status !== "ignored");
      if (from || to) {
        list = list.filter(t => {
          if (typeof t.date !== "string") return false;
          const d = t.date.slice(0, 10);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      } else if (month) list = list.filter(t => typeof t.date === "string" && t.date.startsWith(month));
      rows = list.map(t => ({ amount: t.amount, type: t.type, date: t.date }));
      rawForByCat = list;
    } else {
      let q = supabase.from("transactions").select("amount, type, date, status, category_id").eq("user_id", userId);
      if (from || to) {
        if (from) q = q.gte("date", from);
        if (to) {
          const toExcl = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
          q = q.lt("date", toExcl);
        }
      } else if (month) {
        const start = `${month}-01`;
        const end = new Date(new Date(start).setMonth(new Date(start).getMonth()+1)).toISOString().slice(0,10);
        q = q.gte("date", start).lt("date", end);
      }
      const { data } = await q;
      const filtered = ((data ?? []) as any[]).filter(t => t.status !== "duplicate" && t.status !== "ignored");
      rows = filtered.map(t => ({ amount: t.amount, type: t.type, date: t.date }));
      rawForByCat = filtered;
    }
    let income = 0, expense = 0;
    for (const t of rows) {
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expense += t.amount;
      // transfer no cuenta para balance global (ADR-002)
    }
    const balance = income - expense;
    // evolución semanal: solo en modo mes (S1-S5 es semanal-mensual, no aplica a un rango arbitrario)
    let weekly: any[] = [];
    if (month && !from && !to && rows.length) {
      const weeks: Record<string, {income:number, expense:number}> = {};
      for (const t of rows) {
        const d = new Date(t.date);
        const w = `S${Math.ceil(d.getUTCDate()/7)}`;
        if (!weeks[w]) weeks[w] = { income:0, expense:0 };
        if (t.type==="income") weeks[w].income += t.amount;
        else if (t.type==="expense") weeks[w].expense += t.amount;
      }
      weekly = Object.entries(weeks).map(([week, v]) => ({ week, ...v, balance: v.income - v.expense }));
    }
    // --- by_category: union gastos del periodo + presupuestos vigentes ---
    // spent por categoría (solo expense, requiere category_id)
    const spentByCat: Record<string, number> = {};
    for (const t of rawForByCat as any[]) {
      if (t.type === "expense" && t.category_id) {
        spentByCat[t.category_id] = (spentByCat[t.category_id] ?? 0) + t.amount;
      }
    }
    // Presupuestos vigentes. En modo mes usamos el mes; en modo rango prorrateamos
    // el monto mensual de cada categoría según el solape por día de cada mes tocado.
    let budgetByCat = new Map<string, number>();
    let budgets: any[] = [];
    let catMap = new Map<string, { id: string; name: string; slug: string }>(
      SYSTEM_CATEGORIES.map(c => [c.id, { id: c.id, name: c.name, slug: c.slug }])
    );
    if (from && to) {
      const overlaps = monthOverlaps(from, to);
      const monthKeys: string[] = [];
      for (const o of overlaps) {
        let monthBs: any[] = [];
        if (isMockMode) {
          monthBs = mockStore.listBudgets(userId, o.month);
        } else {
          const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", o.month);
          monthBs = bs ?? [];
        }
        for (const b of monthBs) {
          budgetByCat.set(b.category_id, (budgetByCat.get(b.category_id) ?? 0) + Math.round(b.amount * o.ratio));
          if (b.category_id && b.categories && !catMap.has(b.category_id)) {
            catMap.set(b.category_id, { id: b.category_id, name: b.categories.name, slug: b.categories.slug });
          }
        }
        // para el map de categorías, incluir todas las categorías del usuario
        monthKeys.push(o.month);
      }
      if (!isMockMode && monthKeys.length) {
        const { data: cats } = await supabase.from("categories").select("id, name, slug").or(`user_id.is.null,user_id.eq.${userId}`);
        if (cats) {
          for (const c of cats as any[]) catMap.set(c.id, { id: c.id, name: c.name, slug: c.slug });
        }
      }
    } else {
      const budgetMonth = month ? `${month}-01` : new Date().toISOString().slice(0,7) + "-01";
      if (isMockMode) {
        budgets = mockStore.listBudgets(userId, budgetMonth);
      } else {
        const { data: bs } = await supabase.from("budgets").select("*, categories(name, slug)").eq("user_id", userId).eq("month", budgetMonth);
        budgets = bs ?? [];
        const { data: cats } = await supabase.from("categories").select("id, name, slug").or(`user_id.is.null,user_id.eq.${userId}`);
        if (cats) {
          for (const c of cats as any[]) catMap.set(c.id, { id: c.id, name: c.name, slug: c.slug });
        }
        // también asegurar categorías que vienen joineadas en budgets (por si no están en map)
        for (const b of budgets as any[]) {
          if (b.category_id && b.categories && !catMap.has(b.category_id)) {
            catMap.set(b.category_id, { id: b.category_id, name: b.categories.name, slug: b.categories.slug });
          }
        }
      }
      for (const b of budgets as any[]) if (b.category_id) budgetByCat.set(b.category_id, b.amount);
    }
    const unionIds = new Set<string>([...Object.keys(spentByCat), ...budgetByCat.keys()]);
    const by_category = [...unionIds].map(id => {
      const cat = catMap.get(id);
      const spent = spentByCat[id] ?? 0;
      const budget = budgetByCat.get(id) ?? null;
      const pct = expense ? Math.round((spent / expense) * 100) : 0;
      const budget_pct = budget ? Math.round((spent / budget) * 100) : null;
      return {
        category_id: id,
        slug: cat?.slug ?? "otros",
        name: cat?.name ?? id,
        spent,
        budget,
        pct,
        budget_pct,
      };
    }).sort((a, b) => b.spent - a.spent);
    const range = from && to ? { from, to, days: rangeDays(from, to) } : null;
    return { income, expense, balance, weekly, by_category, range };
  });
}
