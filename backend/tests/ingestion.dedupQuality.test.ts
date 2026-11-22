import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetForTests as resetClassifyCache } from "../src/lib/classifyCache.js";

const { classifyMock } = vi.hoisted(() => ({ classifyMock: vi.fn() }));

const CAT_OTROS = "cat-otros";
const CAT_COMPRAS = "cat-compras";
const CAT_ALIM = "cat-alim";

const store: Record<string, any[]> = {
  raw_events: [],
  transactions: [],
  categories: [
    { id: CAT_OTROS, slug: "otros" },
    { id: CAT_COMPRAS, slug: "compras" },
    { id: CAT_ALIM, slug: "alimentacion" },
  ],
  accounts: [],
  rules: [],
};

function reset() {
  for (const k of Object.keys(store)) if (k !== "categories") store[k] = [];
}

function query(table: string) {
  const filters: any[] = [];
  let inserts: any = null;

  const applyUpdate = (patch: any) => {
    for (const row of store[table]) {
      if (filters.every((fn: any) => fn(row))) Object.assign(row, patch);
    }
    return { error: null };
  };

  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
    is: () => api, gte: () => api, lt: () => api, or: () => api, order: () => api, limit: () => api,
    insert: (row: any) => { inserts = row; return api; },
    // La dedup actualiza al superviviente: .update(patch).eq("id").eq("user_id")
    update: (patch: any) => ({
      eq: (c: string, v: any) => {
        filters.push((r: any) => r[c] === v);
        return {
          eq: (c2: string, v2: any) => {
            filters.push((r: any) => r[c2] === v2);
            return Promise.resolve(applyUpdate(patch));
          },
        };
      },
    }),
    single: async () => {
      if (inserts) {
        const row = { id: crypto.randomUUID(), ...inserts, created_at: new Date().toISOString() };
        store[table].push(row);
        inserts = null;
        return { data: row, error: null };
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
    merchant: "Frida Kahlo",
    category: "otros",
    payment_method: "credit_card",
    confidence: 0.9,
    needs_review: false,
    reason: "test",
    ...overrides,
  };
}

async function ingest(raw_content: string, external_id: string, url = "/v1/ingestion/notification") {
  const res = await app.inject({
    method: "POST",
    url,
    payload: { sender: "banco@notificaciones.cl", subject: "Compra realizada", raw_content, external_id },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

const FRIDA_RAW = "Compra por $32.620 en Frida Kahlo con tarjeta terminada en 1234 - 22/11/2026 20:53 - Santander";

beforeEach(() => {
  reset();
  resetClassifyCache();
  classifyMock.mockReset();
});

describe("Dedup — al unir dos filas sobrevive la mejor clasificación", () => {
  it("(a) superviviente ai 0.90 Otros + candidato ai 0.95 Compras → el superviviente queda en Compras 0.95", async () => {
    classifyMock.mockResolvedValueOnce(aiClassification({ category: "otros", confidence: 0.9 }));
    const first = await ingest(FRIDA_RAW, "fh-wallet");
    expect(first.statusCode).toBe(201);
    expect(first.body.dedup.is_duplicate).toBe(false);
    expect(first.body.transaction.category_id).toBe(CAT_OTROS);
    expect(first.body.transaction.confidence).toBe(0.9);

    // Nueva ingesta 1,1 s después (otro canal): la IA ahora acierta mejor.
    resetClassifyCache();
    classifyMock.mockResolvedValueOnce(aiClassification({ category: "compras", confidence: 0.95 }));
    const second = await ingest(FRIDA_RAW, "fh-falabella");
    expect(second.body.dedup.is_duplicate).toBe(true);
    expect(second.body.dedup.duplicate_of).toBe(first.body.transaction.id);
    // La fila nueva sí se guarda como duplicate y apunta al superviviente.
    expect(second.body.transaction.status).toBe("duplicate");
    expect(second.body.transaction.duplicate_of).toBe(first.body.transaction.id);

    const survivor = store.transactions.find(t => t.id === first.body.transaction.id);
    expect(survivor.category_id).toBe(CAT_COMPRAS);
    expect(survivor.source).toBe("ai");
    expect(survivor.confidence).toBe(0.95);
    expect(survivor.merchant).toBe("Frida Kahlo");
    // Rastro del id absorbido.
    expect(survivor.metadata?.merged_from).toEqual([second.body.transaction.id]);
  });

  it("(b) superviviente rule + candidato ai 0.99 → no se toca (la regla manda)", async () => {
    store.rules.push({
      id: "rule-isidora", user_id: "user-test", merchant_normalized: "isidora",
      preferred_category_id: CAT_ALIM, preferred_merchant_alias: null, hits_count: 0,
    });
    store.transactions.push({
      id: "tx-rule", user_id: "user-test", amount: 32620, date: "2026-11-22T20:53:00Z",
      merchant: "Isidora", type: "expense", status: "confirmed",
      category_id: CAT_ALIM, source: "rule", confidence: 1,
    });

    // Merchant distinto: la dedup matchea por T3 (mismo monto, |dt|<=90s).
    classifyMock.mockResolvedValueOnce(aiClassification({ merchant: "Tienda Nueva", category: "compras", confidence: 0.99 }));
    const r = await ingest(
      "Compra por $32.620 en Tienda Nueva con tarjeta terminada en 1234 - 22/11/2026 20:53 - Santander",
      "rule-cand",
    );
    expect(r.body.dedup.duplicate_of).toBe("tx-rule");

    const survivor = store.transactions.find(t => t.id === "tx-rule");
    expect(survivor.category_id).toBe(CAT_ALIM);
    expect(survivor.source).toBe("rule");
    expect(survivor.confidence).toBe(1);
    expect(survivor.metadata).toBeUndefined();
  });

  it("(c) superviviente 'corrected' → nunca se pisa una corrección manual", async () => {
    store.transactions.push({
      id: "tx-corrected", user_id: "user-test", amount: 32620, date: "2026-11-22T20:53:00Z",
      merchant: "Frida Kahlo", type: "expense", status: "corrected",
      category_id: CAT_OTROS, source: "ai", confidence: 0.9,
      metadata: { note: "corregido a mano" },
    });

    classifyMock.mockResolvedValueOnce(aiClassification({ category: "compras", confidence: 0.95 }));
    const r = await ingest(FRIDA_RAW, "corrected-cand");
    expect(r.body.dedup.duplicate_of).toBe("tx-corrected");

    const survivor = store.transactions.find(t => t.id === "tx-corrected");
    expect(survivor.category_id).toBe(CAT_OTROS);
    expect(survivor.confidence).toBe(0.9);
    expect(survivor.metadata).toEqual({ note: "corregido a mano" });
  });

  it("(d) candidato con confianza menor → no se toca el superviviente", async () => {
    store.transactions.push({
      id: "tx-best", user_id: "user-test", amount: 32620, date: "2026-11-22T20:53:00Z",
      merchant: "Frida Kahlo", type: "expense", status: "confirmed",
      category_id: CAT_COMPRAS, source: "ai", confidence: 0.95,
    });

    classifyMock.mockResolvedValueOnce(aiClassification({ category: "otros", confidence: 0.8 }));
    const r = await ingest(FRIDA_RAW, "lower-cand");
    expect(r.body.dedup.duplicate_of).toBe("tx-best");

    const survivor = store.transactions.find(t => t.id === "tx-best");
    expect(survivor.category_id).toBe(CAT_COMPRAS);
    expect(survivor.confidence).toBe(0.95);
    expect(survivor.metadata).toBeUndefined();
  });
});
