import { describe, it, expect, beforeEach, vi } from "vitest";

// Reglas EXACTAS ya existentes. En prod la IA devuelve el merchant con
// relleno + ciudad + país ("MERPAGO LABALIZA       Las Condes    CHL")
// y variantes ("jumbo costanera" vs regla "jumbo") que antes no matcheaban.
const CAT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PADDED_MERPAGO = "MERPAGO LABALIZA       Las Condes    CHL";
const PADDED_SANTA = "SANTA ISABEL PROVIDENCIA       CHL";

const store: Record<string, any[]> = { raw_events: [], transactions: [], categories: [], rules: [] };

function reset() {
  store.raw_events = [];
  store.transactions = [];
  store.categories = [{ id: CAT, slug: "alimentacion" }];
  store.rules = [
    { id: "rule-1", user_id: "user-test", merchant_normalized: "merpago labaliza", preferred_category_id: CAT, preferred_merchant_alias: null, hits_count: 0 },
    { id: "rule-2", user_id: "user-test", merchant_normalized: "santa isabel", preferred_category_id: CAT, preferred_merchant_alias: null, hits_count: 0 },
  ];
}

function query(table: string) {
  let filters: any[] = [];
  let inserts: any = null;
  let updates: any = null;
  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
    is: () => api, gte: () => api, lt: () => api, or: () => api, order: () => api, limit: () => api,
    insert: (row: any) => { inserts = row; return api; },
    update: (row: any) => { updates = row; return api; },
    single: async () => {
      if (inserts) {
        const row = { id: crypto.randomUUID(), ...inserts, created_at: new Date().toISOString() };
        store[table].push(row); inserts = null; return { data: row, error: null };
      }
      if (updates) {
        const found = store[table].find(r => filters.every(fn => fn(r)));
        if (found) Object.assign(found, updates);
        updates = null; return { data: found ?? null, error: null };
      }
      const found = store[table].find(r => filters.every(fn => fn(r)));
      return { data: found ?? null, error: null };
    },
    then: (resolve: any) => {
      let rows = [...store[table]];
      for (const f of filters) rows = rows.filter(f);
      resolve({ data: rows, error: null });
    }
  };
  return api;
}

vi.mock("../src/lib/supabase.js", () => ({ supabase: { from: (t: string) => query(t) }, getUserId: () => "user-test", isMockMode: false }));

// Simula la IA de prod: devuelve el merchant con relleno/ciudad/país.
// Si el parser vio otro comercio, la IA corrige a MERPAGO con ruido (caso medido).
vi.mock("../src/ai/providers/AIProvider.js", () => ({
  createAIProvider: () => ({
    classify: async (input: any) => {
      const guess = input?.parser_hints?.merchant_guess ?? "Desconocido";
      const merchant = guess === "Kiosko Verde" ? PADDED_MERPAGO
        : guess === "Kiosko Norte" ? PADDED_SANTA
        : `${guess}       Las Condes    CHL`;
      return {
        is_transaction: true, transaction_type: "expense", direction: "out",
        amount: input?.parser_hints?.amount ?? 12500, currency: "CLP", merchant, counterparty: null,
        category: CAT, date: "2026-08-24", account_hint: null,
        payment_method: "credit_card", installment: null,
        is_recurring_candidate: false, is_transfer_candidate: false,
        confidence: 0.9, needs_review: false, reason: "Compra con tarjeta → gasto",
      };
    },
  }),
}));

import app from "../src/index.js";

beforeEach(() => { reset(); });

describe("Phase 5 — Reglas: merchant normalizado igual al escribir que al leer", () => {
  it("'MERPAGO LABALIZA       Las Condes    CHL' con regla 'merpago labaliza' => source='rule'", async () => {
    const r = await app.inject({
      method: "POST", url: "/v1/ingestion/email",
      payload: {
        raw_content: "Compra por $12.500 en Kiosko Verde con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
        external_id: "rule-norm-1",
      },
    });
    const j = JSON.parse(r.body);
    expect(r.statusCode).toBe(201);
    // Con código viejo: findRule("merpago labaliza       las condes    chl") → miss → 'ai'.
    expect(j.classification_source).toBe("rule");
    expect(j.transaction.source).toBe("rule");
    expect(j.matched_rule).not.toBeNull();
  });

  it("'Santa Isabel Providencia CHL' con regla 'santa isabel' => source='rule' (prefijo)", async () => {
    const r = await app.inject({
      method: "POST", url: "/v1/ingestion/email",
      payload: {
        raw_content: "Compra por $9.990 en Kiosko Norte con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander",
        external_id: "rule-norm-2",
      },
    });
    const j = JSON.parse(r.body);
    expect(r.statusCode).toBe(201);
    expect(j.classification_source).toBe("rule");
    expect(j.transaction.source).toBe("rule");
    expect(j.matched_rule).not.toBeNull();
  });
});
