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
    then: (cb: any) => cb(db.error ? { data: null, error: db.error } : { data: apply(), error: null }),
  };
  return b;
}

vi.mock("../../lib/supabase.js", () => ({
  supabase: { from: (t: string) => makeTable(db, t) },
  getUserId: () => "u1",
  isMockMode: false,
}));

import { budgetRoutes } from "./routes.js";

beforeEach(() => {
  db.transactions.length = 0;
  db.budgets.length = 0;
  db.error = null;
});

describe("GET /v1/budgets — validación month/from/to", () => {
  it("?month=2026-13 → 400", async () => {
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?month=2026-13" });
    expect(res.statusCode).toBe(400);
  });

  it("?from=basura → 400", async () => {
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=basura&to=2026-11-01" });
    expect(res.statusCode).toBe(400);
  });

  it("?from=2026-11-30&to=2026-11-01 (to<from) → 400", async () => {
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-11-30&to=2026-11-01" });
    expect(res.statusCode).toBe(400);
  });

  it("sin params → usa el mes civil de Santiago aunque el proceso corra en UTC", async () => {
    process.env.TZ = "UTC";
    vi.useFakeTimers();
    try {
      // 2026-12-01T02:30Z = 30-nov 23:30 en Santiago → mes esperado 2026-11.
      vi.setSystemTime(new Date("2026-12-01T02:30:00Z"));
      db.budgets = [
        { id: "b1", user_id: "u1", category_id: null, amount: 100000, month: "2026-11-01" },
      ];
      const app = Fastify();
      await app.register(budgetRoutes);
      const res = await app.inject({ method: "GET", url: "/v1/budgets" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ id: "b1", month: "2026-11-01" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("?month=2026-11 devuelve lo mismo que ?month=2026-11-01", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: null, amount: 50000, month: "2026-11-01" },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const r1 = await app.inject({ method: "GET", url: "/v1/budgets?month=2026-11" });
    const r2 = await app.inject({ method: "GET", url: "/v1/budgets?month=2026-11-01" });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r1.json()).toEqual(r2.json());
    expect(r1.json()).toHaveLength(1);
  });
});
