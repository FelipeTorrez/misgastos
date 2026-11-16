import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  get,
  set,
  del,
  clear,
  __resetForTests,
  CLASSIFY_CACHE_TTL_MS,
  CLASSIFY_CACHE_MAX_ENTRIES,
  type CachedClassification,
} from "./classifyCache.js";

const V: CachedClassification = {
  category: "alimentacion",
  merchant: "Uber",
  payment_method: "credit_card",
  direction: "out",
  is_recurring_candidate: false,
  confidence: 0.95,
};

beforeEach(() => {
  __resetForTests();
});

describe("classifyCache — unidad", () => {
  it("miss en vacío, hit tras set", () => {
    expect(get("uber")).toBeUndefined();
    set("uber", V);
    expect(get("uber")).toEqual(V);
  });

  it("clave = merchant normalizado", () => {
    set("Payu Uber", V);
    expect(get("payu uber")).toEqual(V);
    expect(get("Payu Uber Las Condes CHL")).toEqual(V);
    expect(get("otro comercio")).toBeUndefined();
  });

  it("expira por TTL (now inyectado)", () => {
    __resetForTests({ ttlMs: 1000 });
    set("uber", V, 0);
    expect(get("uber", 999)).toEqual(V);
    expect(get("uber", 1001)).toBeUndefined();
    // Expirada queda eliminada: sigue miss aunque vuelva el tiempo atrás
    expect(get("uber", 500)).toBeUndefined();
  });

  it("respeta max (evicta la más antigua)", () => {
    __resetForTests({ maxEntries: 2 });
    set("a", { ...V, merchant: "A" });
    set("b", { ...V, merchant: "B" });
    set("c", { ...V, merchant: "C" });
    expect(get("a")).toBeUndefined();
    expect(get("b")?.merchant).toBe("B");
    expect(get("c")?.merchant).toBe("C");
  });

  it("re-set refresca sin contar doble contra el max", () => {
    __resetForTests({ maxEntries: 2 });
    set("a", { ...V, merchant: "A" });
    set("b", { ...V, merchant: "B" });
    set("a", { ...V, merchant: "A2" });
    set("c", { ...V, merchant: "C" });
    expect(get("a")?.merchant).toBe("A2");
    expect(get("b")).toBeUndefined();
    expect(get("c")?.merchant).toBe("C");
  });

  it("del invalida una entrada, clear vacía todo", () => {
    set("uber", V);
    set("lider", { ...V, merchant: "Lider" });
    del("Uber Las Condes CHL");
    expect(get("uber")).toBeUndefined();
    expect(get("lider")?.merchant).toBe("Lider");
    clear();
    expect(get("lider")).toBeUndefined();
  });

  it("ignora clave vacía sin romper", () => {
    set("", V);
    set("   ", V);
    expect(get("")).toBeUndefined();
    expect(get("   ")).toBeUndefined();
  });

  it("defaults: TTL 7 días y max 500", () => {
    expect(CLASSIFY_CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(CLASSIFY_CACHE_MAX_ENTRIES).toBe(500);
  });
});

// ---- Integración: 2ª ingesta del mismo comercio => ai_cache ----

const CAT_ALIM = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAT_TRAN = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const store: Record<string, any[]> = { raw_events: [], transactions: [], categories: [], rules: [] };

function resetStore() {
  store.raw_events = [];
  store.transactions = [];
  store.rules = [];
  store.categories = [
    { id: CAT_ALIM, slug: "alimentacion" },
    { id: CAT_TRAN, slug: "transporte" },
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
    upsert: async () => ({ data: null, error: null }),
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
    },
  };
  return api;
}

const { classifyMock } = vi.hoisted(() => ({
  classifyMock: vi.fn(async (input: any) => ({
    is_transaction: true,
    transaction_type: "expense",
    direction: "out",
    amount: input?.parser_hints?.amount ?? 0,
    currency: "CLP",
    merchant: "Uber",
    counterparty: null,
    category: "alimentacion",
    date: input?.parser_hints?.date ?? "2026-08-24",
    account_hint: null,
    payment_method: "credit_card",
    installment: null,
    is_recurring_candidate: false,
    is_transfer_candidate: false,
    confidence: 0.95,
    needs_review: false,
    reason: "Compra con tarjeta → gasto",
  })),
}));

vi.mock("./supabase.js", () => ({ supabase: { from: (t: string) => query(t) }, getUserId: () => "user-test", isMockMode: false }));
vi.mock("../ai/providers/AIProvider.js", () => ({
  createAIProvider: () => ({ classify: classifyMock }),
}));

import app from "../index.js";

describe("classifyCache — integración con ingesta", () => {
  beforeEach(() => {
    resetStore();
    __resetForTests();
    classifyMock.mockClear();
  });

  async function ingest(amount: string, externalId: string) {
    const res = await app.inject({
      method: "POST", url: "/v1/ingestion/email",
      payload: {
        sender: "santander@notificaciones.cl", subject: "Compra realizada",
        raw_content: `Compra por $${amount} en Uber con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander`,
        external_id: externalId,
      },
    });
    return { status: res.statusCode, body: JSON.parse(res.body) };
  }

  it("2ª ingesta del mismo comercio => ai_cache sin llamar al provider", async () => {
    const r1 = await ingest("12.500", "cache-int-1");
    expect(r1.status).toBe(201);
    expect(r1.body.classification_source).toBe("ai");
    expect(r1.body.transaction.source).toBe("ai");
    expect(classifyMock).toHaveBeenCalledTimes(1);

    const r2 = await ingest("8.900", "cache-int-2");
    expect(r2.status).toBe(201);
    expect(r2.body.classification_source).toBe("ai_cache");
    expect(r2.body.transaction.source).toBe("ai_cache");
    // Sin llamar al provider de nuevo
    expect(classifyMock).toHaveBeenCalledTimes(1);
    // Lo reutilizable viene del cache; amount/date son del movimiento actual
    expect(r2.body.transaction.amount).toBe(8900);
    expect(r2.body.transaction.category_id).toBe(CAT_ALIM);
    expect(r2.body.ai.merchant).toBe("Uber");
  });

  it("no cachea si confidence < 0.9 o hay provider_fallback", async () => {
    const lowConf = async (input: any) => ({
      is_transaction: true, transaction_type: "expense", direction: "out",
      amount: input?.parser_hints?.amount ?? 0, currency: "CLP", merchant: "Uber",
      counterparty: null, category: "otros", date: "2026-08-24", account_hint: null,
      payment_method: "unknown", installment: null, is_recurring_candidate: false,
      is_transfer_candidate: false, confidence: 0.5, needs_review: true,
      reason: "baja confianza", provider_fallback: "429",
    });
    // Once por ingesta: no altera la implementación base de los otros tests
    classifyMock.mockImplementationOnce(lowConf);
    classifyMock.mockImplementationOnce(lowConf);
    const r1 = await ingest("12.500", "cache-nocache-1");
    expect(r1.body.classification_source).toBe("fallback");
    const r2 = await ingest("8.900", "cache-nocache-2");
    expect(r2.body.classification_source).toBe("fallback");
    expect(classifyMock).toHaveBeenCalledTimes(2);
  });

  it("PATCH corrige categoría => invalida la entrada", async () => {
    const r1 = await ingest("12.500", "cache-inv-1");
    expect(r1.body.classification_source).toBe("ai");
    expect(classifyMock).toHaveBeenCalledTimes(1);

    const patched = await app.inject({
      method: "PATCH", url: `/v1/transactions/${r1.body.transaction.id}`,
      payload: { category_id: CAT_TRAN },
    });
    expect(patched.statusCode).toBe(200);
    expect(JSON.parse(patched.body).category_id).toBe(CAT_TRAN);

    const r2 = await ingest("8.900", "cache-inv-2");
    expect(r2.body.classification_source).toBe("ai");
    expect(classifyMock).toHaveBeenCalledTimes(2);
  });
});
