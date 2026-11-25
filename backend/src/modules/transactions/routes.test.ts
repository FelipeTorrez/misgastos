import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { db } = vi.hoisted(() => {
  return { db: { transactions: [] as any[], raw_events: [] as any[], error: null as any } };
});

const TX1 = "11111111-1111-4111-8111-111111111111";
const TX2 = "22222222-2222-4222-8222-222222222222";
const TX_MISSING = "33333333-3333-4333-8333-333333333333";
const TX_DUP = "44444444-4444-4444-8444-444444444444";
const TX_ORIG = "55555555-5555-4555-8555-555555555555";

function makeTable(tables: any, tname: string) {
  const state: any = { filters: [], limit: null, order: null, single: false, insert: null };
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
    insert: (p: any) => { state.insert = p; return b; },
    single: () => {
      if (state.insert) {
        const rows = tables[tname] ?? (tables[tname] = []);
        const row = { id: `t${rows.length + 1}`, ...state.insert };
        rows.push(row);
        return { data: row, error: null };
      }
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

describe("GET /v1/transactions — filtros category_id/account_id deben ser uuid", () => {
  it("?category_id=abc → 400 (no 503 db_unavailable)", async () => {
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?category_id=abc" });
    expect(res.statusCode).toBe(400);
  });

  it("?account_id=abc → 400 (no 503 db_unavailable)", async () => {
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/transactions?account_id=abc" });
    expect(res.statusCode).toBe(400);
  });

  it("?category_id uuid válido → 200 y filtra", async () => {
    const cat = "00000000-0000-4000-8000-000000000001";
    db.transactions = [
      { id: TX1, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "A", category_id: cat },
      { id: TX2, user_id: "u1", date: "2026-03-11", amount: 2000, type: "expense", merchant: "B", category_id: "00000000-0000-4000-8000-000000000002" },
    ];
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({ method: "GET", url: `/v1/transactions?category_id=${cat}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((t: any) => t.id)).toEqual([TX1]);
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
      { id: TX1, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "confirmed", raw_event_id: "re1" },
    ];
    db.raw_events = [
      { id: "re1", user_id: "u1", source: "gmail", sender: "santander@notificaciones.cl", subject: "Compra realizada", received_at: "2026-03-10T15:30:00Z", raw_content: "Compra por $1.000 en Lider" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/v1/transactions/${TX1}` });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.id).toBe(TX1);
    expect(j.raw_event).toMatchObject({ id: "re1", source: "gmail", sender: "santander@notificaciones.cl", subject: "Compra realizada", raw_content: "Compra por $1.000 en Lider" });
    expect(j.raw_event.received_at).toBe("2026-03-10T15:30:00Z");
  });

  it("raw_event null si la tx no tiene raw_event_id", async () => {
    db.transactions = [
      { id: TX2, user_id: "u1", date: "2026-03-10", amount: 500, type: "expense", merchant: "Manual", status: "confirmed" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/v1/transactions/${TX2}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().raw_event).toBeNull();
  });

  it("id inexistente → 404", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/v1/transactions/${TX_MISSING}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "transaction not found" });
  });

  it("id malformado → 400 (no 503 db_unavailable)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/abc123" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("fieldErrors");
  });

  it("Supabase caído → 503 con code db_unavailable", async () => {
    db.error = { message: "db down" };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/v1/transactions/${TX1}` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "db down", code: "db_unavailable" });
  });

  it("error 22P02 de Postgres → 400 id invalido (no 503)", async () => {
    db.error = { message: 'invalid input syntax for type uuid: "abc123"', code: "22P02" };
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: `/v1/transactions/${TX1}` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "id invalido" });
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
      { id: TX1, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "pending_review" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: `/v1/transactions/${TX1}`, payload: { status: "confirmed" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("confirmed");
    expect(db.transactions[0].status).toBe("confirmed");
  });

  it("rechaza user_id → 400 y conserva user_id/amount", async () => {
    db.transactions = [
      { id: TX1, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "pending_review" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: `/v1/transactions/${TX1}`, payload: { user_id: "otro", amount: 500 } });
    expect(res.statusCode).toBe(400);
    expect(db.transactions[0].user_id).toBe("u1");
    expect(db.transactions[0].amount).toBe(1000);
  });

  it("rechaza clave desconocida → 400", async () => {
    db.transactions = [
      { id: TX1, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "pending_review" },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: `/v1/transactions/${TX1}`, payload: { categoria_typo: 1 } });
    expect(res.statusCode).toBe(400);
    expect(db.transactions[0].status).toBe("pending_review");
  });

  it("restaura un falso duplicado: duplicate → confirmed con duplicate_of null", async () => {
    db.transactions = [
      { id: TX_ORIG, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Lider", status: "confirmed" },
      { id: TX_DUP, user_id: "u1", date: "2026-03-10", amount: 1000, type: "expense", merchant: "Jumbo", status: "duplicate", duplicate_of: TX_ORIG },
    ];
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: `/v1/transactions/${TX_DUP}`, payload: { status: "confirmed" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("confirmed");
    expect(res.json().duplicate_of).toBeNull();
    expect(db.transactions[1].status).toBe("confirmed");
    expect(db.transactions[1].duplicate_of).toBeNull();
    const list = await app.inject({ method: "GET", url: "/v1/transactions?month=2026-03" });
    expect(list.statusCode).toBe(200);
    expect(list.json().find((t: any) => t.id === TX_DUP)).toMatchObject({ status: "confirmed" });
  });

  it("id malformado → 400 sin tocar la DB", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "PATCH", url: "/v1/transactions/abc123", payload: { status: "confirmed" } });
    expect(res.statusCode).toBe(400);
  });

  it("corregir categoría limpia metadata.review_reason y conserva el resto del metadata", async () => {
    db.transactions = [
      {
        id: TX1,
        user_id: "u1",
        date: "2026-03-10",
        amount: 1000,
        type: "expense",
        merchant: "Lider",
        status: "pending_review",
        source: "fallback",
        metadata: { review_reason: "payment_processor", merged_from: ["tx-a"] },
      },
    ];
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/transactions/${TX1}`,
      payload: { category_id: "00000000-0000-0000-0000-000000000001", update_rule: false },
    });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.review_reason).toBeNull();
    expect(j.status).toBe("corrected");
    expect(db.transactions[0].metadata.review_reason).toBeNull();
    expect(db.transactions[0].metadata.merged_from).toEqual(["tx-a"]);
  });
});

describe("POST /v1/transactions — gasto manual", () => {
  async function buildApp() {
    const app = Fastify();
    await app.register(transactionRoutes);
    return app;
  }

  it("sin source en el body → source 'manual' (no el default 'ai' de la DB)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/transactions",
      payload: {
        merchant: "almacen don pedro",
        amount: 3500,
        type: "expense",
        category_id: "00000000-0000-0000-0000-000000000001",
        date: "2026-03-10",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBe("manual");
    expect(db.transactions[0].source).toBe("manual");
  });

  it("source enviado por el cliente no puede falsear el origen", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/transactions",
      payload: {
        merchant: "Almacen Don Pedro",
        amount: 3500,
        type: "expense",
        category_id: "00000000-0000-0000-0000-000000000001",
        date: "2026-03-10",
        source: "ai",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBe("manual");
  });
});
