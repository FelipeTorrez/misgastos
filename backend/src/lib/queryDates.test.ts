import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { BalanceQuery, TransactionsQuery } from "./queryDates.js";

const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[], budgets: [] as any[], categories: [] as any[] } };
});

function makeTable(tables: any, tname: string) {
  const state: any = { filters: [] as any[], limit: null as any, order: null as any };
  const apply = () => {
    let rows = [...(tables[tname] ?? [])];
    for (const f of state.filters) {
      if (f.op === "gte") rows = rows.filter((r: any) => (r[f.field] ?? "") >= f.val);
      else if (f.op === "lt") rows = rows.filter((r: any) => (r[f.field] ?? "") < f.val);
      else if (f.op === "eq") rows = rows.filter((r: any) => r[f.field] === f.val);
    }
    if (state.limit) rows = rows.slice(0, state.limit);
    return rows;
  };
  const b: any = {
    eq: (f: string, v: any) => { state.filters.push({ op: "eq", field: f, val: v }); return b; },
    gte: (f: string, v: any) => { state.filters.push({ op: "gte", field: f, val: v }); return b; },
    lt: (f: string, v: any) => { state.filters.push({ op: "lt", field: f, val: v }); return b; },
    limit: (n: number) => { state.limit = n; return b; },
    order: (f: string, o: any) => { state.order = { f, o }; return b; },
    or: () => b,
    select: (_c: string) => b,
    then: (cb: any) => cb({ data: apply(), error: null }),
  };
  return b;
}

vi.mock("./supabase.js", () => ({
  supabase: { from: (t: string) => makeTable(db, t) },
  getUserId: () => "u1",
  isMockMode: false,
}));

import { transactionRoutes } from "../modules/transactions/routes.js";
import { balanceRoutes } from "../modules/balance/routes.js";

beforeEach(() => {
  db.transactions.length = 0;
  db.budgets.length = 0;
  db.categories.length = 0;
});

describe("queryDates schemas", () => {
  it("rechaza month inválido", () => {
    expect(TransactionsQuery.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(TransactionsQuery.safeParse({ month: "2026-9-1" }).success).toBe(false);
    expect(TransactionsQuery.safeParse({ month: "2026-08" }).success).toBe(true);
  });
  it("rechaza from/to con mal formato y to < from", () => {
    expect(BalanceQuery.safeParse({ from: "2026-9-1" }).success).toBe(false);
    expect(BalanceQuery.safeParse({ from: "2026-09-19", to: "2026-08-20" }).success).toBe(false);
    expect(BalanceQuery.safeParse({ from: "2026-08-20", to: "2026-09-19" }).success).toBe(true);
  });
  it("valida limit 1..500", () => {
    expect(TransactionsQuery.safeParse({ limit: "0" }).success).toBe(false);
    expect(TransactionsQuery.safeParse({ limit: "501" }).success).toBe(false);
    expect(TransactionsQuery.safeParse({ limit: "abc" }).success).toBe(false);
    expect(TransactionsQuery.safeParse({ limit: "500" }).success).toBe(true);
  });
});

describe("GET validación de fechas → 400", () => {
  it("/v1/transactions?month=2026-13 => 400", async () => {
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-13" });
    expect(res.statusCode).toBe(400);
  });
  it("/v1/transactions?from=2026-9-1 => 400", async () => {
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?from=2026-9-1" });
    expect(res.statusCode).toBe(400);
  });
  it("/v1/balance?from=2026-09-19&to=2026-08-20 => 400", async () => {
    const app = Fastify();
    await app.register(balanceRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/balance?from=2026-09-19&to=2026-08-20" });
    expect(res.statusCode).toBe(400);
  });
  it("rango válido sigue en 200", async () => {
    db.transactions = [
      { id: "a", user_id: "u1", date: "2026-09-01", amount: 100, type: "expense", status: "confirmed" },
    ];
    const appTx = Fastify();
    await appTx.register(transactionRoutes);
    const r1 = await appTx.inject({ method: "GET", url: "/v1/transactions?from=2026-08-20&to=2026-09-19" });
    expect(r1.statusCode).toBe(200);
    const appBal = Fastify();
    await appBal.register(balanceRoutes);
    const r2 = await appBal.inject({ method: "GET", url: "/v1/balance?from=2026-08-20&to=2026-09-19" });
    expect(r2.statusCode).toBe(200);
  });
});
