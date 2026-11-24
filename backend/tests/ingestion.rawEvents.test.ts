import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any[]> = {
  raw_events: [],
  transactions: [],
  categories: [{ id: "cat-otros", slug: "otros" }],
  rules: [],
};
function reset() { for (const k of Object.keys(store)) if (k !== "categories") store[k] = []; }

function query(table: string) {
  let filters: any[] = [];
  let orderKey: string | null = null;
  let orderAsc = true;
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  let limitN: number | null = null;
  let inserts: any = null;
  let updatePatch: any = null;
  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
    order: (col: string, opts?: { ascending?: boolean }) => { orderKey = col; orderAsc = opts?.ascending !== false; return api; },
    limit: (n: number) => { limitN = n; return api; },
    range: (from: number, to: number) => { rangeFrom = from; rangeTo = to; return api; },
    insert: (row: any) => { inserts = row; return api; },
    update: (patch: any) => { updatePatch = patch; return api; },
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
      if (updatePatch) {
        for (const row of rows) Object.assign(row, updatePatch);
        updatePatch = null;
        resolve({ data: rows, error: null });
        return;
      }
      if (orderKey) rows.sort((a, b) => (orderAsc ? 1 : -1) * (String(a[orderKey!]) < String(b[orderKey!]) ? -1 : String(a[orderKey!]) > String(b[orderKey!]) ? 1 : 0));
      if (rangeFrom !== null && rangeTo !== null) rows = rows.slice(rangeFrom, rangeTo + 1);
      else if (limitN !== null) rows = rows.slice(0, limitN);
      resolve({ data: rows, error: null });
    },
  };
  return api;
}

vi.mock("../src/lib/supabase.js", () => ({ supabase: { from: (t: string) => query(t) }, getUserId: () => "user-test", isMockMode: false }));
import app from "../src/index.js";

beforeEach(() => {
  reset();
  for (let i = 1; i <= 5; i++) {
    store.raw_events.push({
      id: `re-${i}`,
      user_id: "user-test",
      received_at: `2026-08-0${i}T12:00:00Z`,
      raw_content: `compra ${i}`,
    });
  }
});

describe("GET /v1/raw-events paginación limit/offset", () => {
  it("respeta limit/offset (orden recibido desc)", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/raw-events?limit=2&offset=1" });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body);
    expect(Array.isArray(j)).toBe(true);
    expect(j.length).toBe(2);
    // orden desc: re-5, re-4, re-3, ... → offset 1 → re-4, re-3
    expect(j.map((r: any) => r.id)).toEqual(["re-4", "re-3"]);
  });

  it("clamp: limit>500 → 500, default 50 mantiene array", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/raw-events" });
    expect(JSON.parse(res.body).length).toBe(5);
    const res2 = await app.inject({ method: "GET", url: "/v1/raw-events?limit=999&offset=-5" });
    // clamp no rompe: devuelve todo lo disponible como array
    expect(Array.isArray(JSON.parse(res2.body))).toBe(true);
    expect(JSON.parse(res2.body).length).toBe(5);
  });
});

describe("POST /v1/ingestion/notification — ingesta sin fecha guarda el día de Chile", () => {
  it("texto sin fecha a las 22:30 del 19-08 en Chile → date 2026-08-19, no 20-08 UTC", async () => {
    store.rules.push({
      id: "rule-angaroa",
      user_id: "user-test",
      merchant_normalized: "angaroa",
      preferred_category_id: "cat-otros",
      hits_count: 0,
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-20T02:30:00Z"));
    try {
      const res = await app.inject({
        method: "POST",
        url: "/v1/ingestion/notification",
        payload: {
          raw_content: "Compraste $1.300 en ANGAROA con tu tarjeta",
          sender: "cl.android",
          external_id: "notif-sin-fecha",
        },
      });
      const j = JSON.parse(res.body);
      expect(j.parsed.date).toBeNull();
      expect(j.transaction.date).toBe("2026-08-19T22:30:00Z");
      expect(j.transaction.date.slice(0, 10)).toBe("2026-08-19");
    } finally {
      vi.useRealTimers();
    }
  });
});
