import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, any[]> = { raw_events: [] };
function reset() { store.raw_events = []; }

function query(table: string) {
  let filters: any[] = [];
  let orderKey: string | null = null;
  let orderAsc = true;
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  let limitN: number | null = null;
  const api: any = {
    select: () => api,
    eq: (c: string, v: any) => { filters.push((r: any) => r[c] === v); return api; },
    order: (col: string, opts?: { ascending?: boolean }) => { orderKey = col; orderAsc = opts?.ascending !== false; return api; },
    limit: (n: number) => { limitN = n; return api; },
    range: (from: number, to: number) => { rangeFrom = from; rangeTo = to; return api; },
    then: (resolve: any) => {
      let rows = [...store[table]];
      for (const f of filters) rows = rows.filter(f);
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
