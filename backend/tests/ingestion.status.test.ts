import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetForTests as resetClassifyCache } from "../src/lib/classifyCache.js";

const { classifyMock } = vi.hoisted(() => ({ classifyMock: vi.fn() }));

const CAT_ALIM = "cat-alim";
const store: Record<string, any[]> = {
  raw_events: [],
  transactions: [],
  categories: [{ id: CAT_ALIM, slug: "alimentacion" }],
  accounts: [],
  rules: [],
};
function reset() {
  for (const k of Object.keys(store)) if (k !== "categories") store[k] = [];
}
function query(table: string) {
  const filters: any[] = [];
  let inserts: any = null;
  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
    is: () => api, gte: () => api, lt: () => api, or: () => api, order: () => api, limit: () => api,
    insert: (row: any) => { inserts = row; return api; },
    update: (patch: any) => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }), select: () => api }) }),
    single: async () => {
      if (inserts) {
        const row = { id: crypto.randomUUID(), ...inserts, created_at: new Date().toISOString() };
        store[table].push(row); inserts = null; return { data: row, error: null };
      }
      const found = store[table].find(r => filters.every((fn: any) => fn(r)));
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

vi.mock("../src/lib/supabase.js", () => ({ supabase: { from: (t: string) => query(t) }, getUserId: () => "user-test", isMockMode: false }));
vi.mock("../src/ai/providers/AIProvider.js", () => ({ createAIProvider: () => ({ classify: classifyMock }) }));

import app from "../src/index.js";

function aiClassification(overrides: Record<string, any> = {}) {
  return {
    is_transaction: true,
    transaction_type: "expense",
    direction: "out",
    merchant: "Comercio IA",
    category: "alimentacion",
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
    url: "/v1/ingestion/email",
    payload: { sender: "santander@notificaciones.cl", subject: "Compra realizada", raw_content, external_id },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

beforeEach(() => {
  reset();
  resetClassifyCache();
  classifyMock.mockReset();
});

describe("Ingesta — estados honestos (confirmed / pending_review / pending_ai)", () => {
  it("regla del usuario => confirmed (la IA nunca corre)", async () => {
    store.rules = [{
      id: "rule-isidora", user_id: "user-test", merchant_normalized: "isidora",
      preferred_category_id: CAT_ALIM, preferred_merchant_alias: null, hits_count: 0,
    }];
    const r = await ingest(
      "Compra por $8.500 en Isidora con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-rule-1",
    );
    expect(r.statusCode).toBe(201);
    expect(r.body.classification_source).toBe("rule");
    expect(r.body.transaction.status).toBe("confirmed");
    expect(r.body.transaction.source).toBe("rule");
    expect(classifyMock).not.toHaveBeenCalled();
  });

  it("guarda qué regla clasificó el gasto en transaction.metadata.matched_rule", async () => {
    store.rules = [{
      id: "rule-jumbo", user_id: "user-test", merchant_normalized: "jumbo",
      preferred_category_id: CAT_ALIM, preferred_merchant_alias: null, hits_count: 0,
    }];
    const r = await ingest(
      "Compra por $8.500 en Jumbo con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-rule-audit",
    );
    expect(r.body.classification_source).toBe("rule");
    expect(r.body.transaction.metadata.matched_rule).toEqual({ id: "rule-jumbo", merchant_normalized: "jumbo" });
    // La respuesta pública no cambia: matched_rule sigue top-level con su forma.
    expect(r.body.matched_rule).toEqual({ id: "rule-jumbo", category: CAT_ALIM, hits: 0 });
  });

  it("sin regla no inventa metadata.matched_rule", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Frida Kahlo", confidence: 0.95 }));
    const r = await ingest(
      "Compra por $12.000 en Frida Kahlo con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-ai-no-rule",
    );
    expect(r.body.transaction.metadata?.matched_rule).toBeUndefined();
  });

  it("IA con confianza alta (0.95) => confirmed", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Frida Kahlo", confidence: 0.95 }));
    const r = await ingest(
      "Compra por $12.000 en Frida Kahlo con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-ai-095",
    );
    expect(r.body.classification_source).toBe("ai");
    expect(r.body.transaction.status).toBe("confirmed");
    expect(r.body.transaction.confidence).toBe(0.95);
  });

  it("IA con confianza media (0.70) => pending_ai", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Cafe Media", confidence: 0.70 }));
    const r = await ingest(
      "Compra por $4.500 en Cafe Media con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-ai-070",
    );
    expect(r.body.classification_source).toBe("ai");
    expect(r.body.transaction.status).toBe("pending_ai");
  });

  it("IA 0.70 con needs_review => pending_review", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Cafe Dudoso", confidence: 0.70, needs_review: true }));
    const r = await ingest(
      "Compra por $9.990 en Cafe Dudoso con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-ai-review",
    );
    expect(r.body.transaction.status).toBe("pending_review");
  });

  it("IA en fallback (provider_fallback) => pending_review aunque needs_review venga false", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Comercio Fallback", confidence: 0.5, needs_review: false, provider_fallback: "rate_limit" }));
    const r = await ingest(
      "Compra por $15.000 en Comercio Fallback con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-ai-fallback",
    );
    expect(r.body.classification_source).toBe("fallback");
    expect(r.body.transaction.status).toBe("pending_review");
    expect(r.body.transaction.metadata.review_reason).toMatch(/^ai_fallback:/);
  });

  it("procesador de pago => pending_review con motivo payment_processor", async () => {
    classifyMock.mockResolvedValue(aiClassification({ merchant: "Merpago Migas", confidence: 0.95 }));
    const r = await ingest(
      "Compra por $8.500 en Merpago Migas con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander",
      "st-processor",
    );
    expect(r.body.transaction.status).toBe("pending_review");
    expect(r.body.transaction.metadata.review_reason).toBe("payment_processor");
    expect(r.body.transaction.category_id).toBeNull();
  });

  it("duplicate gana sobre confirmed / pending_ai", async () => {
    store.rules = [{
      id: "rule-lider", user_id: "user-test", merchant_normalized: "lider",
      preferred_category_id: CAT_ALIM, preferred_merchant_alias: null, hits_count: 0,
    }];
    const raw = "Compra por $32.990 en Lider con tarjeta terminada en 1234 - 22/11/2026 15:30 - Santander";
    const first = await ingest(raw, "st-dup-1");
    expect(first.body.transaction.status).toBe("confirmed");
    const second = await ingest(raw, "st-dup-2");
    expect(second.body.transaction.status).toBe("duplicate");
    expect(second.body.transaction.duplicate_of).toBe(first.body.transaction.id);
  });
});
