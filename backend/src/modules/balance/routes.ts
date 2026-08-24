import { FastifyInstance } from "fastify";
import { supabase, getUserId } from "../../lib/supabase.js";

export async function balanceRoutes(app: FastifyInstance) {
  app.get("/v1/balance", async (req: any) => {
    const userId = getUserId(req);
    const month = req.query?.month; // YYYY-MM
    let q = supabase.from("transactions").select("amount, type, date").eq("user_id", userId);
    if (month) {
      const start = `${month}-01`;
      const end = new Date(new Date(start).setMonth(new Date(start).getMonth()+1)).toISOString().slice(0,10);
      q = q.gte("date", start).lt("date", end);
    }
    const { data } = await q;
    let income = 0, expense = 0;
    for (const t of data ?? []) {
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expense += t.amount;
      // transfer no cuenta para balance global (ADR-002)
    }
    const balance = income - expense;
    // evolución semanal si month
    let weekly: any[] = [];
    if (month && data) {
      const weeks: Record<string, {income:number, expense:number}> = {};
      for (const t of data) {
        const d = new Date(t.date);
        const w = `S${Math.ceil(d.getDate()/7)}`;
        if (!weeks[w]) weeks[w] = { income:0, expense:0 };
        if (t.type==="income") weeks[w].income += t.amount;
        else if (t.type==="expense") weeks[w].expense += t.amount;
      }
      weekly = Object.entries(weeks).map(([week, v]) => ({ week, ...v, balance: v.income - v.expense }));
    }
    return { income, expense, balance, weekly };
  });
}
