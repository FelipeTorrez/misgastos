import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetForTests as resetClassifyCache } from "../src/lib/classifyCache.js";

/**
 * Dedup concurrente (migración 008): el índice único
 * transactions(user_id, dedup_key) es lo que serializa dos peticiones que
 * corrieron en paralelo (caso RedGloba 22-nov 23:27, Wallet y Falabella con
 * 38 ms de diferencia). La fake supabase de este archivo simula:
 *  - la consulta de "últimas 50 transacciones" de `isDuplicate` NO ve nada
 *    (corrió antes de que la otra petición insertara) → fuerza la carrera;
 *  - el índice único (user_id, dedup_key) devuelve 23505 en el segundo INSERT.
 */

const { classifyMock } = vi.hoisted(() => ({ classifyMock: vi.fn() }));

const CAT_OTROS = "cat-otros";
const store: Record<string, any[]> = {
  raw_events: [],
  transactions: [],
  categories: [{ id: CAT_OTROS, slug: "otros" }],
  accounts: [],
  rules: [],
};

function reset() {
  for (const k of Object.keys(store)) if (k !== "categories") store[k] = [];
}

let seq = 0;

function query(table: string) {
  const filters: any[] = [];
  let inserts: any = null;
  let updatePatch: any = null;
  let ordered = false;

  const matches = (row: any) => filters.every((fn: any) => fn(row));

  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
    neq: (c: string, v: any) => { filters.push((r: any) => r[c] !== v); return api; },
    is: () => api, gte: () => api, lt: () => api, or: () => api, in: () => api,
    order: () => { ordered = true; return api; },
    limit: () => api,
    insert: (row: any) => { inserts = row; return api; },
    update: (patch: any) => { updatePatch = patch; return updateChain; },
    single: async () => {
      if (inserts) {
        const row = { id: `tx-${++seq}`, created_at: new Date().toISOString(), ...inserts };
        if (table === "transactions" && row.dedup_key) {
          const clash = store.transactions.some(t => t.user_id === row.user_id && t.dedup_key === row.dedup_key);
          if (clash) {
            inserts = null;
            return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "transactions_user_dedup_key_idx"' } };
          }
        }
        store[table].push(row);
        inserts = null;
        return { data: row, error: null };
      }
      return { data: store[table].find(matches) ?? null, error: null };
    },
    then: (resolve: any) => {
      if (updatePatch) {
        for (const row of store[table]) if (matches(row)) Object.assign(row, updatePatch);
        updatePatch = null;
        resolve({ data: null, error: null });
        return;
      }
      let rows = store[table].filter(matches);
      // Carrera simulada: la lectura de la dedup en memoria ocurrió antes del
      // INSERT de la otra petición, así que no ve transacciones.
      if (table === "transactions" && ordered) rows = [];
      resolve({ data: rows, error: null });
    },
  };

  const updateChain: any = {
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return updateChain; },
    then: (resolve: any) => {
      for (const row of store[table]) if (matches(row)) Object.assign(row, updatePatch);
      updatePatch = null;
      resolve({ data: null, error: null });
    },
  };

  return api;
}

vi.mock("../src/lib/supabase.js", () => ({
  supabase: { from: (t: string) => query(t) },
  getUserId: () => "user-test",
  isMockMode: false,
}));
vi.mock("../src/ai/providers/AIProvider.js", () => ({ createAIProvider: () => ({ classify: classifyMock }) }));

import app from "../src/index.js";

function aiClassification(overrides: Record<string, any> = {}) {
  return {
    is_transaction: true,
    transaction_type: "expense",
    direction: "out",
    merchant: "RedGloba Break",
    category: "otros",
    payment_method: "credit_card",
    confidence: 0.95,
    needs_review: false,
    reason: "test",
    ...overrides,
  };
}

async function ingest(raw_content: string, external_id: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/ingestion/notification",
    payload: { sender: "banco@notificaciones.cl", subject: "Compra realizada", raw_content, external_id },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** Dos notificaciones del mismo pago: Wallet y Falabella, mismo minuto. */
const REDGLOBA_WALLET = "Compra por $1.300 en RedGloba BREAK con tarjeta terminada en 1234 - 22/11/2026 23:27 - Falabella";

beforeEach(() => {
  reset();
  resetClassifyCache();
  classifyMock.mockReset();
});

describe("Dedup concurrente — índice único (user_id, dedup_key)", () => {
  it("misma compra en paralelo: la segunda responde status duplicate apuntando al original", async () => {
    classifyMock.mockResolvedValue(aiClassification());

    const first = await ingest(REDGLOBA_WALLET, "wsp-wallet-2327");
    expect(first.statusCode).toBe(201);
    expect(first.body.dedup.is_duplicate).toBe(false);
    // RedGloba es procesador de pagos → pending_review (MG-013), no confirmed.
    expect(first.body.transaction.status).toBe("pending_review");
    expect(first.body.transaction.dedup_key).toMatch(/^[0-9a-f]{32}$/);

    // 38 ms después, el otro canal: la dedup en memoria no vio el INSERT anterior.
    const second = await ingest(REDGLOBA_WALLET, "wsp-falabella-2327");
    expect(second.statusCode).toBe(200);
    expect(second.body.dedup.is_duplicate).toBe(true);
    expect(second.body.dedup.duplicate_of).toBe(first.body.transaction.id);
    expect(second.body.transaction.status).toBe("duplicate");
    expect(second.body.transaction.duplicate_of).toBe(first.body.transaction.id);
    // La fila duplicate no lleva clave: no compite con el original.
    expect(second.body.transaction.dedup_key).toBeNull();

    // Una tercera notificación del mismo pago sigue resolviendo al original.
    const third = await ingest(REDGLOBA_WALLET, "wsp-extra-2327");
    expect(third.body.transaction.status).toBe("duplicate");
    expect(third.body.dedup.duplicate_of).toBe(first.body.transaction.id);

    expect(store.transactions.filter(t => t.dedup_key)).toHaveLength(1);
    expect(store.transactions).toHaveLength(3);
  });

  it("mismo monto y merchant a horas distintas: claves distintas y ambas se crean (201)", async () => {
    classifyMock.mockResolvedValue(aiClassification());

    const manana = await ingest(
      "Compra por $1.300 en RedGloba BREAK con tarjeta terminada en 1234 - 22/11/2026 09:12 - Falabella",
      "dos-cafes-0912",
    );
    const tarde = await ingest(
      "Compra por $1.300 en RedGloba BREAK con tarjeta terminada en 1234 - 22/11/2026 17:40 - Falabella",
      "dos-cafes-1740",
    );

    expect(manana.statusCode).toBe(201);
    expect(tarde.statusCode).toBe(201);
    expect(tarde.body.dedup.is_duplicate).toBe(false);
    expect(manana.body.transaction.dedup_key).not.toBe(tarde.body.transaction.dedup_key);
    expect(store.transactions).toHaveLength(2);
  });

  it("flujo normal sin colisión: 201, status confirmed y clave guardada", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Frida Kahlo" }));

    const r = await ingest(
      "Compra por $1.300 en Frida Kahlo con tarjeta terminada en 1234 - 22/11/2026 23:27 - Falabella",
      "sin-carrera-1",
    );
    expect(r.statusCode).toBe(201);
    expect(r.body.dedup.is_duplicate).toBe(false);
    expect(r.body.transaction.status).toBe("confirmed");
    expect(store.transactions).toHaveLength(1);
    expect(store.transactions[0].dedup_key).toBe(r.body.transaction.dedup_key);
  });
});
