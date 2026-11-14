import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[] } };
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
    if (state.order) {
      const dir = state.order.ascending === false ? -1 : 1;
      rows.sort((a: any, b: any) => String(a[state.order.f] ?? "").localeCompare(String(b[state.order.f] ?? "")) * dir);
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
    select: (_c: string) => b,
    then: (cb: any) => cb({ data: apply(), error: null }),
  };
  return b;
}

vi.mock("../../lib/supabase.js", () => ({
  supabase: { from: (t: string) => makeTable(db, t) },
  getUserId: () => "u1",
  isMockMode: false,
}));

import { transactionRoutes } from "./routes.js";

beforeEach(() => {
  db.transactions.length = 0;
});

describe("GET /v1/transactions?month — fin de mes", () => {
  it("incluye los gastos del 29/30/31 de marzo y excluye el 01-abr", async () => {
    db.transactions = [
      { id: "m29", user_id: "u1", date: "2026-03-29", amount: 1000, type: "expense", merchant: "A" },
      { id: "m30", user_id: "u1", date: "2026-03-30", amount: 2000, type: "expense", merchant: "B" },
      { id: "m31", user_id: "u1", date: "2026-03-31", amount: 3000, type: "expense", merchant: "C" },
      { id: "a01", user_id: "u1", date: "2026-04-01", amount: 4000, type: "expense", merchant: "D" },
    ];
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.map((t: any) => t.id).sort()).toEqual(["m29", "m30", "m31"]);
  });
});
