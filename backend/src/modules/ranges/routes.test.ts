import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

// Almacenes en memoria compartidos con el mock de supabase
const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[], budgets: [] as any[], categories: [] as any[] } };
});

function makeTable(tables: any, tname: string) {
  const state: any = { filters: [], limit: null, order: null, single: false };
  const apply = () => {
    let rows = [...(tables[tname] ?? [])];
    for (const f of state.filters) {
      if (f.op === "gte") rows = rows.filter(r => (r[f.field] ?? "") >= f.val);
      else if (f.op === "lt") rows = rows.filter(r => (r[f.field] ?? "") < f.val);
      else if (f.op === "eq") rows = rows.filter(r => r[f.field] === f.val);
      else if (f.op === "is") rows = rows.filter(r => (f.val === null ? r[f.field] == null : r[f.field] === f.val));
    }
    if (state.order) {
      const dir = state.order.ascending === false ? -1 : 1;
      rows.sort((a: any, b: any) => String(a[state.order.f] ?? "").localeCompare(String(b[state.order.f] ?? "")) * dir);
    }
    if (state.limit) rows = rows.slice(0, state.limit);
    if (state.single) rows = rows.slice(0, 1);
    return rows;
  };
  const b: any = {
    eq: (f: string, v: any) => { state.filters.push({ op: "eq", field: f, val: v }); return b; },
    gte: (f: string, v: any) => { state.filters.push({ op: "gte", field: f, val: v }); return b; },
    lt: (f: string, v: any) => { state.filters.push({ op: "lt", field: f, val: v }); return b; },
    is: (f: string, v: any) => { state.filters.push({ op: "is", field: f, val: v }); return b; },
    limit: (n: number) => { state.limit = n; return b; },
    order: (f: string, o: any) => { state.order = { f, o }; return b; },
    or: () => b,
    select: (_c: string) => b,
    single: () => { state.single = true; return { then: (cb: any) => { const r = apply(); return cb({ data: r[0] ?? null, error: r[0] ? null : { message: "not found" } }); } }; },
    then: (cb: any) => cb({ data: apply(), error: null }),
  };
  return b;
}

vi.mock("../../lib/supabase.js", () => ({
  supabase: { from: (t: string) => makeTable(db, t) },
  getUserId: () => "u1",
  isMockMode: false,
}));

import { balanceRoutes } from "../balance/routes.js";
import { transactionRoutes } from "../transactions/routes.js";
import { budgetRoutes } from "../budgets/routes.js";

const CAT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  db.transactions.length = 0;
  db.budgets.length = 0;
  db.categories.length = 0;
});

async function makeApp(mods: any[]) {
  const app = Fastify();
  for (const m of mods) await app.register(m);
  return app;
}

describe("Filtro rango 20→20 — endpoints", () => {
  it("balance with from/to filtra por rango inclusivo y excluye duplicate/ignored/transfer", async () => {
    db.transactions = [
      { id: "t1", user_id: "u1", amount: 10000, type: "expense", date: "2026-08-21T12:00:00Z", status: "confirmed", category_id: CAT_A },
      { id: "t2", user_id: "u1", amount: 20000, type: "expense", date: "2026-09-05T12:00:00Z", status: "confirmed", category_id: CAT_B },
      { id: "t3", user_id: "u1", amount: 50000, type: "income", date: "2026-09-10T12:00:00Z", status: "confirmed", category_id: null },
      { id: "t4", user_id: "u1", amount: 9999, type: "expense", date: "2026-08-10T12:00:00Z", status: "confirmed", category_id: CAT_A }, // fuera de rango
      { id: "t5", user_id: "u1", amount: 7777, type: "expense", date: "2026-08-22T12:00:00Z", status: "duplicate", category_id: CAT_A },
      { id: "t6", user_id: "u1", amount: 5555, type: "transfer", date: "2026-08-23T12:00:00Z", status: "confirmed", category_id: null },
    ];
    const app = await makeApp([balanceRoutes]);
    const res = await app.inject({ method: "GET", url: "/v1/balance?from=2026-08-20&to=2026-09-19" });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.income).toBe(50000);
    expect(body.expense).toBe(30000); // t1 10000 + t2 20000 (t4 fuera, t5 dup, t6 transfer)
    expect(body.balance).toBe(20000);
    expect(body.weekly).toEqual([]); // sin gráfico semanal en rango
    expect(body.range).toEqual({ from: "2026-08-20", to: "2026-09-19", days: 31 });
  });

  it("transactions with from/to + limit", async () => {
    db.transactions = [
      { id: "a", user_id: "u1", date: "2026-08-21", amount: 100, type: "expense" },
      { id: "b", user_id: "u1", date: "2026-09-01", amount: 200, type: "expense" },
      { id: "c", user_id: "u1", date: "2026-07-30", amount: 300, type: "expense" },
    ];
    const app = await makeApp([transactionRoutes]);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?from=2026-08-20&to=2026-09-19&limit=500" });
    const list = res.json();
    expect(list.length).toBe(2);
    expect(list.map((t: any) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("presupuestos prorrateados por días en rango", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: CAT_A, amount: 310000, month: "2026-08-01", period: "monthly" },
      { id: "b2", user_id: "u1", category_id: CAT_A, amount: 300000, month: "2026-09-01", period: "monthly" },
    ];
    db.transactions = [
      { id: "t1", user_id: "u1", amount: 12000, type: "expense", date: "2026-08-21", status: "confirmed", category_id: CAT_A },
      { id: "t2", user_id: "u1", amount: 15000, type: "expense", date: "2026-09-05", status: "confirmed", category_id: CAT_A },
    ];
    const app = await makeApp([budgetRoutes]);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-08-20&to=2026-09-19" });
    const list = res.json();
    expect(list.length).toBe(1); // dedup por categoría
    const b = list[0];
    const expectedAmt = Math.round(310000 * (12 / 31)) + Math.round(300000 * (19 / 30));
    expect(b.amount).toBe(expectedAmt);
    expect(b.spent).toBe(27000);
    expect(b.pct).toBe(Math.round((27000 / expectedAmt) * 100));
    expect(b.range).toEqual({ from: "2026-08-20", to: "2026-09-19" });
  });
});
