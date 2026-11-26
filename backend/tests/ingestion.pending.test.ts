import { describe, it, expect, beforeEach, vi } from "vitest";

// Estado mutable para alternar entre mock mode (mockStore) y "real" (Supabase
// falso). `isMockMode` se expone con getter para que cada request lea el valor
// vigente, igual que la app real.
const h = vi.hoisted(() => ({
  mock: true,
  txError: null as { message: string } | null,
  inCalls: [] as number[],
  store: {
    raw_events: [] as any[],
    transactions: [] as any[],
    categories: [{ id: "cat-otros", slug: "otros" }],
    rules: [] as any[],
  },
}));

vi.mock("../src/lib/supabase.js", () => {
  function query(table: string) {
    const filters: Array<(r: any) => boolean> = [];
    let orderKey: string | null = null;
    let orderAsc = true;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;
    let limitN: number | null = null;
    let inColumn: string | null = null;
    let inValues: any[] | null = null;
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
      not: (c: string, op: string, v: any) => {
        if (op === "is" && v === null) filters.push((r: any) => r[c] !== null && r[c] !== undefined && r[c] !== "");
        return api;
      },
      in: (c: string, values: any[]) => {
        inColumn = c;
        inValues = values;
        h.inCalls.push(values.length);
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderKey = col;
        orderAsc = opts?.ascending !== false;
        return api;
      },
      limit: (n: number) => { limitN = n; return api; },
      range: (from: number, to: number) => { rangeFrom = from; rangeTo = to; return api; },
      then: (resolve: any) => {
        if (table === "transactions" && h.txError) {
          resolve({ data: null, error: h.txError });
          return;
        }
        let rows = [...(h.store as any)[table]];
        for (const f of filters) rows = rows.filter(f);
        if (inColumn && inValues) rows = rows.filter((r: any) => inValues!.includes(r[inColumn!]));
        if (orderKey) rows.sort((a: any, b: any) => (orderAsc ? 1 : -1) * (String(a[orderKey!]) < String(b[orderKey!]) ? -1 : String(a[orderKey!]) > String(b[orderKey!]) ? 1 : 0));
        if (rangeFrom !== null && rangeTo !== null) rows = rows.slice(rangeFrom, rangeTo + 1);
        else if (limitN !== null) rows = rows.slice(0, limitN);
        resolve({ data: rows, error: null });
      },
    };
    return api;
  }
  return {
    get isMockMode() { return h.mock; },
    getUserId: () => "user-test",
    supabase: { from: (t: string) => query(t) },
  };
});

import app from "../src/index.js";
import { mockStore } from "../src/lib/mockStore.js";
import { linkedRawEventIds } from "../src/modules/ingestion/routes.js";

beforeEach(() => {
  h.mock = true;
  h.txError = null;
  h.inCalls = [];
  h.store.raw_events.length = 0;
  h.store.transactions.length = 0;
  mockStore.reset();
  delete (process.env as any).GROQ_API_KEY;
});

function seedPending(count: number, amount: number) {
  for (let i = 0; i < count; i++) {
    mockStore.insertRawEvent("user-test", {
      source: "gmail",
      external_id: `pending-${amount}-${i}`,
      sender: "santander@notificaciones.cl",
      subject: "Compra realizada",
      // received_at creciente: el orden desc determínistico para paginar.
      received_at: new Date(Date.UTC(2026, 7, 1, 0, 0, i)).toISOString(),
      raw_content: `Compra por $${amount.toLocaleString("es-CL")} en Comercio${i} con tarjeta terminada en 1234 - 24/08/2026 15:30`,
    });
  }
}

/** Siembra raw_events/transactions en el Supabase falso (modo real). */
function seedRealPending(total: number, linked: number) {
  h.mock = false;
  for (let i = 0; i < total; i++) {
    h.store.raw_events.push({
      id: `re-${i}`,
      user_id: "user-test",
      received_at: new Date(Date.UTC(2026, 7, 1, 0, 0, i)).toISOString(),
      raw_content: `Compra por $1.000 en Comercio${i} con tarjeta terminada en 1234 - 24/08/2026 15:30`,
      metadata: {},
    });
  }
  for (let i = 0; i < linked; i++) {
    h.store.transactions.push({ id: `tx-${i}`, user_id: "user-test", raw_event_id: `re-${i}` });
  }
}

describe("GET /v1/raw-events?pending=1 — headers resumen la cola, no la página", () => {
  it("120 pendientes y limit=20 → body 20 filas, headers de las 120", async () => {
    seedPending(120, 1000);

    const res = await app.inject({ method: "GET", url: "/v1/raw-events?pending=1&limit=20" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(20);

    // el conteo es la cola completa, no la página
    expect(res.headers["x-pending-count"]).toBe("120");
    expect(res.headers["x-pending-returned"]).toBe("20");
    // x-pending-total ya no mezcla promos: 120 filas x $1.000
    expect(res.headers["x-pending-total"]).toBe("120000");
    expect(res.headers["x-pending-total-transactions"]).toBe("120000");
    expect(res.headers["x-pending-total-con-promos"]).toBe("120000");
    expect(res.headers["x-pending-promos"]).toBe("0");
  });

  it("offset pagina el body sin alterar los headers de la cola", async () => {
    seedPending(120, 1000);

    const res = await app.inject({ method: "GET", url: "/v1/raw-events?pending=1&limit=20&offset=100" });
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(20);
    expect(res.headers["x-pending-count"]).toBe("120");
    expect(res.headers["x-pending-returned"]).toBe("20");
    expect(res.headers["x-pending-total"]).toBe("120000");
  });

  it("las promos quedan fuera de x-pending-total y aparecen en x-pending-total-con-promos", async () => {
    seedPending(2, 10000);
    mockStore.insertRawEvent("user-test", {
      source: "gmail",
      external_id: "promo-1",
      received_at: new Date(Date.UTC(2026, 7, 2, 0, 0, 0)).toISOString(),
      raw_content: "Aprovecha tu crédito preaprobado de $500.000: solicita hoy en 12 cuotas",
    });

    const res = await app.inject({ method: "GET", url: "/v1/raw-events?pending=1" });
    const body = JSON.parse(res.body);
    const promo = body.find((r: any) => r.external_id === "promo-1");
    expect(promo?.parsed_amount).toBe(500000);
    expect(promo?.parsed_is_transaction).toBe(false);

    expect(res.headers["x-pending-count"]).toBe("3");
    expect(res.headers["x-pending-returned"]).toBe("3");
    expect(res.headers["x-pending-total"]).toBe("20000");
    expect(res.headers["x-pending-total-transactions"]).toBe("20000");
    expect(res.headers["x-pending-total-con-promos"]).toBe("520000");
    expect(res.headers["x-pending-promos"]).toBe("1");
  });
});

describe("GET /v1/raw-events?pending=1 (modo real) — excluye raw_events ya vinculados", () => {
  it("10 pendientes con 4 transacciones vinculadas → x-pending-count 6 y las 4 fuera del body", async () => {
    seedRealPending(10, 4);

    const res = await app.inject({ method: "GET", url: "/v1/raw-events?pending=1&limit=50" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(res.headers["x-pending-count"]).toBe("6");
    expect(res.headers["x-pending-returned"]).toBe("6");
    expect(body).toHaveLength(6);
    const ids = body.map((r: any) => r.id);
    expect(ids.sort()).toEqual(["re-4", "re-5", "re-6", "re-7", "re-8", "re-9"]);
    for (let i = 0; i < 4; i++) expect(ids).not.toContain(`re-${i}`);
  });

  it("si la lectura de transacciones falla → 503, no 200 con la cola sin filtrar", async () => {
    seedRealPending(10, 0);
    h.txError = { message: "PostgREST: URI too long" };

    const res = await app.inject({ method: "GET", url: "/v1/raw-events?pending=1" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["x-pending-count"]).toBeUndefined();
    const body = JSON.parse(res.body);
    expect(body.error).toContain("URI too long");
  });

  it("linkedRawEventIds trocea más de 100 ids en lotes de 100 y no pierde ninguno", async () => {
    h.mock = false;
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    for (let i = 0; i < 250; i += 2) {
      h.store.transactions.push({ id: `tx-${i}`, user_id: "user-test", raw_event_id: `id-${i}` });
    }

    const linked = await linkedRawEventIds("user-test", ids);
    expect(linked.size).toBe(125);
    expect(h.inCalls).toEqual([100, 100, 50]);
    for (let i = 0; i < 250; i += 2) expect(linked.has(`id-${i}`)).toBe(true);
  });
});
