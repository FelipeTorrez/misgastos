import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[], budgets: [] as any[], error: null as any } };
});

function makeTable(tables: any, tname: string) {
  const state: any = { filters: [], limit: null, order: null, single: false, patch: null as any };
  const apply = () => {
    let rows = [...(tables[tname] ?? [])];
    for (const f of state.filters) {
      if (f.op === "gte") rows = rows.filter(r => (r[f.field] ?? "") >= f.val);
      else if (f.op === "lt") rows = rows.filter(r => (r[f.field] ?? "") < f.val);
      else if (f.op === "eq") rows = rows.filter(r => r[f.field] === f.val);
      else if (f.op === "is") rows = rows.filter(r => (f.val === null ? r[f.field] == null : r[f.field] === f.val));
    }
    if (state.limit) rows = rows.slice(0, state.limit);
    return rows;
  };
  const b: any = {
    eq: (f: string, v: any) => { state.filters.push({ op: "eq", field: f, val: v }); return b; },
    is: (f: string, v: any) => { state.filters.push({ op: "is", field: f, val: v }); return b; },
    gte: (f: string, v: any) => { state.filters.push({ op: "gte", field: f, val: v }); return b; },
    lt: (f: string, v: any) => { state.filters.push({ op: "lt", field: f, val: v }); return b; },
    or: (_c: string) => b,
    limit: (n: number) => { state.limit = n; return b; },
    order: (f: string, o: any) => { state.order = { f, o }; return b; },
    select: (_c: string) => b,
    insert: (row: any) => {
      const r = { id: `b-${(tables[tname] ?? []).length + 1}`, ...row };
      (tables[tname] ?? []).push(r);
      return { select: (_c: string) => ({ single: () => ({ data: r, error: null }) }) };
    },
    update: (patch: any) => { state.patch = patch; return b; },
    delete: () => { state.deleting = true; return b; },
    single: () => {
      const rows = apply();
      if (state.patch) for (const r of rows) Object.assign(r, state.patch);
      return { data: rows[0] ?? null, error: null };
    },
    then: (cb: any) => {
      if (db.error) return cb({ data: null, error: db.error });
      if (state.deleting) {
        const rows = apply();
        const arr = tables[tname] ?? [];
        for (const r of rows) {
          const i = arr.indexOf(r);
          if (i >= 0) arr.splice(i, 1);
        }
        return cb({ data: null, error: null });
      }
      return cb({ data: apply(), error: null });
    },
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
        { id: "b1", user_id: "u1", category_id: null, amount: 100000, month: "2026-11-01", period: "monthly" },
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
      { id: "b1", user_id: "u1", category_id: null, amount: 50000, month: "2026-11-01", period: "monthly" },
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

  it("from/to a caballo de 2 meses prorratea amount y expone range", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: "cat-1", amount: 31000, month: "2026-10-01", period: "monthly", categories: { name: "Comida", slug: "food" } },
      { id: "b2", user_id: "u1", category_id: "cat-1", amount: 30000, month: "2026-11-01", period: "monthly", categories: { name: "Comida", slug: "food" } },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    // oct: 12/31, nov: 19/30
    const expected = Math.round(31000 * 12 / 31) + Math.round(30000 * 19 / 30);
    expect(body[0].amount).toBe(expected);
    expect(body[0].range).toEqual({ from: "2026-10-20", to: "2026-11-19" });
  });
});

describe("GET /v1/budgets from/to — presupuestos por ciclo (period='cycle')", () => {
  it("(a) con budget cycle para from => amount sin prorratear, spent del rango, partial=false", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: "cat-1", amount: 70000, month: "2026-10-20", period: "cycle" },
    ];
    db.transactions = [
      { id: "t1", user_id: "u1", type: "expense", status: "ok", date: "2026-10-25", amount: 20000, category_id: "cat-1" },
      { id: "t2", user_id: "u1", type: "expense", status: "ok", date: "2026-11-10", amount: 25500, category_id: "cat-1" },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].amount).toBe(70000);
    expect(body[0].spent).toBe(45500);
    expect(body[0].pct).toBe(65);
    expect(body[0].period).toBe("cycle");
    expect(body[0].partial).toBe(false);
    expect(body[0].range).toEqual({ from: "2026-10-20", to: "2026-11-19" });
  });

  it("(b) solo budget mensual => fallback con spent del tramo cubierto y partial=true", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: "cat-1", amount: 70000, month: "2026-10-01", period: "monthly" },
    ];
    db.transactions = [
      { id: "t1", user_id: "u1", type: "expense", status: "ok", date: "2026-10-25", amount: 30000, category_id: "cat-1" },
      { id: "t2", user_id: "u1", type: "expense", status: "ok", date: "2026-11-10", amount: 15500, category_id: "cat-1" },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    // solo octubre prorrateado (12/31), gasto solo del tramo cubierto
    expect(body[0].amount).toBe(Math.round(70000 * 12 / 31));
    expect(body[0].spent).toBe(30000);
    expect(body[0].period).toBe("monthly");
    expect(body[0].partial).toBe(true);
    expect(body[0].coveredDays).toBe(12);
    expect(body[0].totalDays).toBe(31);
  });

  it("(c) GET por month no devuelve budgets de ciclo", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: "cat-1", amount: 50000, month: "2026-10-01", period: "monthly" },
      { id: "b2", user_id: "u1", category_id: "cat-2", amount: 70000, month: "2026-10-01", period: "cycle" },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?month=2026-10" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "b1", month: "2026-10-01" });
  });

  it("(d) POST period='cycle' persiste month sin normalizar a día 01", async () => {
    const app = Fastify();
    await app.register(budgetRoutes);
    const catId = "123e4567-e89b-12d3-a845-426614174000";
    const res = await app.inject({
      method: "POST",
      url: "/v1/budgets",
      payload: { category_id: catId, amount: 70000, month: "2026-10-20", period: "cycle" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ month: "2026-10-20", period: "cycle", amount: 70000 });
    expect(db.budgets).toHaveLength(1);
    // y el GET del ciclo lo devuelve sin prorratear
    const get = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(get.json()).toHaveLength(1);
    expect(get.json()[0].amount).toBe(70000);
  });
});

describe("GET /v1/budgets from/to — el GET no hereda (solo lectura)", () => {
  it("(a) ciclo vacío con límites en el ciclo anterior => [] y NO inserta", async () => {
    db.budgets = [
      { id: "p1", user_id: "u1", category_id: "cat-1", amount: 70000, month: "2026-09-20", period: "cycle" },
      { id: "p2", user_id: "u1", category_id: null, amount: 500000, month: "2026-09-20", period: "cycle" },
      { id: "p3", user_id: "u1", category_id: "cat-2", amount: 30000, month: "2026-09-20", period: "cycle" },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const before = db.budgets.length;
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    expect(db.budgets).toHaveLength(before);
    expect(db.budgets.filter((b: any) => b.month === "2026-10-20")).toHaveLength(0);
  });
});

describe("POST /v1/budgets/carry-over — herencia explícita", () => {
  function seedPrev() {
    db.budgets = [
      { id: "p1", user_id: "u1", category_id: "cat-1", amount: 70000, month: "2026-09-20", period: "cycle" },
      { id: "p2", user_id: "u1", category_id: "cat-2", amount: 30000, month: "2026-09-20", period: "cycle" },
      { id: "p3", user_id: "u1", category_id: null, amount: 500000, month: "2026-09-20", period: "cycle" },
      { id: "m1", user_id: "u1", category_id: "cat-9", amount: 10000, month: "2026-09-01", period: "monthly" },
    ];
  }

  it("(b) crea los 3 límites del ciclo anterior y el GET siguiente los devuelve", async () => {
    seedPrev();
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: { from: "2026-10-20", to: "2026-11-19" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.created).toBe(3);
    expect(body.skipped).toBe(0);
    expect(body.budgets).toHaveLength(3);

    const get = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(get.statusCode).toBe(200);
    const list = get.json();
    expect(list).toHaveLength(3);
    expect(list.map((b: any) => b.category_id)).toEqual(expect.arrayContaining(["cat-1", "cat-2", null]));
    for (const b of list) {
      expect(b).toMatchObject({ month: "2026-10-20", period: "cycle" });
    }
    expect(list.find((b: any) => b.category_id === "cat-1").amount).toBe(70000);
  });

  it("(c) un segundo POST devuelve created 0 y no duplica", async () => {
    seedPrev();
    const app = Fastify();
    await app.register(budgetRoutes);
    const first = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: { from: "2026-10-20", to: "2026-11-19" },
    });
    expect(first.json().created).toBe(3);
    const afterFirst = db.budgets.length;

    const second = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: { from: "2026-10-20", to: "2026-11-19" },
    });
    expect(second.statusCode).toBe(200);
    const body = second.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(3);
    expect(body.budgets).toHaveLength(3);
    expect(db.budgets).toHaveLength(afterFirst);
  });

  it("(d) sin límites en el ciclo anterior => created 0 sin error", async () => {
    db.budgets = [];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: { from: "2026-10-20", to: "2026-11-19" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 0, skipped: 0, budgets: [] });
    expect(db.budgets).toHaveLength(0);
  });

  it("(e) from/to invertidos o mal formados => 400", async () => {
    const app = Fastify();
    await app.register(budgetRoutes);
    const inverted = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: { from: "2026-11-19", to: "2026-10-20" },
    });
    expect(inverted.statusCode).toBe(400);
    const malformed = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: { from: "2026-10", to: "2026-11-19" },
    });
    expect(malformed.statusCode).toBe(400);
    const missing = await app.inject({
      method: "POST",
      url: "/v1/budgets/carry-over",
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(db.budgets).toHaveLength(0);
  });
});

describe("GET /v1/budgets from/to — merge ciclo + mensuales", () => {
  it("(e) cycle cat-A + monthly cat-B => 2 items, A sin prorratear period=cycle, B prorrateado partial", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: "cat-A", amount: 70000, month: "2026-10-20", period: "cycle" },
      { id: "b2", user_id: "u1", category_id: "cat-B", amount: 31000, month: "2026-10-01", period: "monthly" },
    ];
    db.transactions = [];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    const a = body.find((x: any) => x.category_id === "cat-A");
    const b = body.find((x: any) => x.category_id === "cat-B");
    expect(a.amount).toBe(70000);
    expect(a.period).toBe("cycle");
    expect(a.partial).toBe(false);
    expect(b.amount).toBe(Math.round(31000 * 12 / 31));
    expect(b.period).toBe("monthly");
    expect(b.partial).toBe(true);
    expect(b.coveredDays).toBe(12);
    expect(b.totalDays).toBe(31);
  });

  it("(f) misma categoria con cycle y monthly => 1 solo item y es el de ciclo", async () => {
    db.budgets = [
      { id: "b1", user_id: "u1", category_id: "cat-A", amount: 70000, month: "2026-10-20", period: "cycle" },
      { id: "b2", user_id: "u1", category_id: "cat-A", amount: 31000, month: "2026-10-01", period: "monthly" },
    ];
    db.transactions = [];
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].period).toBe("cycle");
    expect(body[0].amount).toBe(70000);
    expect(body[0].category_id).toBe("cat-A");
  });

  it("(g) DELETE /v1/budgets/:id borra un budget de ciclo", async () => {
    const budgetId = "66666666-6666-4666-8666-666666666666";
    db.budgets = [
      { id: budgetId, user_id: "u1", category_id: "cat-A", amount: 70000, month: "2026-10-20", period: "cycle" },
    ];
    const app = Fastify();
    await app.register(budgetRoutes);
    const before = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(before.json()).toHaveLength(1);
    const del = await app.inject({ method: "DELETE", url: `/v1/budgets/${budgetId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    const after = await app.inject({ method: "GET", url: "/v1/budgets?from=2026-10-20&to=2026-11-19" });
    expect(after.json()).toHaveLength(0);
  });

  it("(h) DELETE /v1/budgets/:id con id malformado → 400 (no 503)", async () => {
    const app = Fastify();
    await app.register(budgetRoutes);
    const res = await app.inject({ method: "DELETE", url: "/v1/budgets/abc123" });
    expect(res.statusCode).toBe(400);
  });
});
