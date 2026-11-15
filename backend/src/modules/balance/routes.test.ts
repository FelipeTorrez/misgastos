import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[], budgets: [] as any[], error: null as any } };
});

function makeTable(tables: any, tname: string) {
  const state: any = { filters: [], limit: null, order: null, single: false };
  const apply = () => {
    let rows = [...(tables[tname] ?? [])];
    for (const f of state.filters) {
      if (f.op === "gte") rows = rows.filter(r => (r[f.field] ?? "") >= f.val);
      else if (f.op === "lt") rows = rows.filter(r => (r[f.field] ?? "") < f.val);
      else if (f.op === "eq") rows = rows.filter(r => r[f.field] === f.val);
    }
    if (state.limit) rows = rows.slice(0, state.limit);
    return rows;
  };
  const b: any = {
    eq: (f: string, v: any) => { state.filters.push({ op: "eq", field: f, val: v }); return b; },
    gte: (f: string, v: any) => { state.filters.push({ op: "gte", field: f, val: v }); return b; },
    lt: (f: string, v: any) => { state.filters.push({ op: "lt", field: f, val: v }); return b; },
    or: (_c: string) => b,
    limit: (n: number) => { state.limit = n; return b; },
    order: (f: string, o: any) => { state.order = { f, o }; return b; },
    select: (_c: string) => b,
    single: () => {
      const rows = apply();
      return { data: rows[0] ?? null, error: null };
    },
    then: (cb: any) => cb(db.error && tname === "transactions" ? { data: null, error: db.error } : { data: apply(), error: null }),
  };
  return b;
}

vi.mock("../../lib/supabase.js", () => ({
  supabase: { from: (t: string) => makeTable(db, t) },
  getUserId: () => "u1",
  isMockMode: false,
}));

import { balanceRoutes } from "./routes.js";

beforeEach(() => {
  db.transactions.length = 0;
  db.budgets.length = 0;
  db.error = null;
});

describe("GET /v1/balance — error DB", () => {
  it("devuelve 503 con code db_unavailable cuando Supabase falla", async () => {
    db.error = { message: "db down" };
    const app = Fastify();
    await app.register(balanceRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/balance?month=2026-03" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "db down", code: "db_unavailable" });
  });

  it("devuelve 200 con balance cuando Supabase responde", async () => {
    db.transactions = [
      { user_id: "u1", amount: 1000, type: "expense", date: "2026-03-10", status: "confirmed", category_id: null },
    ];
    const app = Fastify();
    await app.register(balanceRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/balance?month=2026-03" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ expense: 1000, balance: -1000 });
  });
});
