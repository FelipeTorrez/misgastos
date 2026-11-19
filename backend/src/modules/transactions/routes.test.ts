import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[], raw_events: [] as any[], error: null as any } };
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
    update: (p: any) => { state.patch = p; return b; },
    single: () => {
      const rows = apply();
      if (state.patch) {
        if (!rows.length) return { data: null, error: { message: "not found" } };
        Object.assign(rows[0], state.patch);
        return { data: rows[0], error: null };
      }
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

import { transactionRoutes } from "./routes.js";

beforeEach(() => {
  db.transactions.length = 0;
  db.raw_events.length = 0;
  db.error = null;
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

  it("devuelve 503 con code db_unavailable cuando Supabase falla", async () => {
    db.error = { message: "db down" };
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "db down", code: "db_unavailable" });
  });
});

describe("GET /v1/transactions — truncado en 200", () => {
  it("201 tx sin limit → header x-transactions-truncated=1 y 200 filas + x-transactions-limit=200", async () => {
    db.transactions = Array.from({ length: 201 }, (_, i) => ({
      id: `t${String(i).padStart(3, "0")}`,
      user_id: "u1",
      date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
      amount: 1000 + i,
      type: "expense",
      merchant: `M${i}`,
    }));
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-transactions-truncated"]).toBe("1");
    expect(res.headers["x-transactions-limit"]).toBe("200");
    expect(res.json()).toHaveLength(200);
  });

  it("150 tx sin limit → 150 filas, sin truncated, x-transactions-limit=200", async () => {
    db.transactions = Array.from({ length: 150 }, (_, i) => ({
      id: `t${String(i).padStart(3, "0")}`,
      user_id: "u1",
      date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
      amount: 1000 + i,
      type: "expense",
      merchant: `M${i}`,
    }));
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-transactions-truncated"]).toBeUndefined();
    expect(res.headers["x-transactions-limit"]).toBe("200");
    expect(res.json()).toHaveLength(150);
  });

  it("limit=50 explícito → 50 filas + truncated", async () => {
    db.transactions = Array.from({ length: 150 }, (_, i) => ({
      id: `t${String(i).padStart(3, "0")}`,
      user_id: "u1",
      date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
      amount: 1000 + i,
      type: "expense",
      merchant: `M${i}`,
    }));
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03&limit=50" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-transactions-truncated"]).toBe("1");
    expect(res.headers["x-transactions-limit"]).toBe("50");
    expect(res.json()).toHaveLength(50);
  });

  it("3 tx → sin header y 3 filas", async () => {
    db.transactions = [
      { id: "t1", user_id: "u1", date: "2026-03-05", amount: 1000, type: "expense", merchant: "A" },
      { id: "t2", user_id: "u1", date: "2026-03-10", amount: 2000, type: "expense", merchant: "B" },
      { id: "t3", user_id: "u1", date: "2026-03-15", amount: 3000, type: "expense", merchant: "C" },
    ];
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-transactions-truncated"]).toBeUndefined();
    expect(res.json()).toHaveLength(3);
  });
});

describe("GET /v1/transactions/:id — correo original", () => {
  async function buildApp() {
    const app = Fastify();
    await app.register(transactionRoutes);
    return app;
  }

  it("devuelve transacción + raw_event resumido", async () => {
    db.transactions = [
      { id: "t1", user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "confirmed", raw_event_id: "re1" },
    ];
    db.raw_events = [
      { id: "re1", user_id: "u1", source: "gmail", sender: "santander@notificaciones.cl", subject: "Compra realizada", received_at: "2026-03-10T15:30:00Z", raw_content: "Compra por $1.000 en Lider" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/t1" });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.id).toBe("t1");
    expect(j.raw_event).toMatchObject({ id: "re1", source: "gmail", sender: "santander@notificaciones.cl", subject: "Compra realizada", raw_content: "Compra por $1.000 en Lider" });
    expect(j.raw_event.received_at).toBe("2026-03-10T15:30:00Z");
  });

  it("raw_event null si la tx no tiene raw_event_id", async () => {
    db.transactions = [
      { id: "t2", user_id: "u1", date: "2026-03-10", amount: 500, type: "expense", merchant: "Manual", status: "confirmed" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/t2" });
    expect(res.statusCode).toBe(200);
    expect(res.json().raw_event).toBeNull();
  });

  it("id inexistente → 404", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "transaction not found" });
  });

  it("Supabase caído → 503 con code db_unavailable", async () => {
    db.error = { message: "db down" };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/t1" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "db down", code: "db_unavailable" });
  });
});

describe("PATCH /v1/transactions/:id — whitelist zod", () => {
  async function buildApp() {
    const app = Fastify();
    await app.register(transactionRoutes);
    return app;
  }

  it("acepta {status:'confirmed'} → 200 y actualiza", async () => {
    db.transactions = [
      { id: "t1", user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "pending_review" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/transactions/t1", payload: { status: "confirmed" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("confirmed");
    expect(db.transactions[0].status).toBe("confirmed");
  });

  it("rechaza user_id → 400 y conserva user_id/amount", async () => {
    db.transactions = [
      { id: "t1", user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "pending_review" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/transactions/t1", payload: { user_id: "otro", amount: 500 } });
    expect(res.statusCode).toBe(400);
    expect(db.transactions[0].user_id).toBe("u1");
    expect(db.transactions[0].amount).toBe(1000);
  });

  it("rechaza clave desconocida → 400", async () => {
    db.transactions = [
      { id: "t1", user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "pending_review" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/transactions/t1", payload: { categoria_typo: 1 } });
    expect(res.statusCode).toBe(400);
    expect(db.transactions[0].status).toBe("pending_review");
  });

  it("restaura un falso duplicado: duplicate → confirmed con duplicate_of null", async () => {
    db.transactions = [
      { id: "orig", user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "confirmed" },
      { id: "dup", user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Jumbo", status: "duplicate", duplicate_of: "orig" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/transactions/dup", payload: { status: "confirmed" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("confirmed");
    expect(res.json().duplicate_of).toBeNull();
    expect(db.transactions[1].status).toBe("confirmed");
    expect(db.transactions[1].duplicate_of).toBeNull();
    const list = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(list.statusCode).toBe(200);
    expect(list.json().find((t: any) => t.id === "dup")).toMatchObject({ status: "confirmed" });
  });
});
