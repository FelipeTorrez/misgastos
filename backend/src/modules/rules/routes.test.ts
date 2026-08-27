import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { mockRules, nextId } = vi.hoisted(() => {
  const mockRules: any[] = [];
  let nextId = 1;
  return { mockRules, nextId: { v: 1 } };
});

vi.mock("../../lib/supabase.js", () => {
  const query = (table: string) => {
    return {
      select: () => ({
        eq: (f1: string, v1: any) => ({
          eq: (f2: string, v2: any) => ({
            single: async () => {
              const found = mockRules.find((r: any) => r[f1] === v1 && r[f2] === v2);
              return { data: found ?? null, error: found ? null : { message: "not found" } };
            },
          }),
          order: (_f: string, _opts: any) => ({
            order: (_f2: string, _opts2: any) => ({
              then: (cb: any) => cb({ data: [...mockRules].sort((a: any, b: any) => (b.hits_count ?? 0) - (a.hits_count ?? 0)), error: null })
            }),
            then: (cb: any) => cb({ data: [...mockRules].sort((a: any, b: any) => (b.hits_count ?? 0) - (a.hits_count ?? 0)), error: null })
          }),
        }),
        then: (cb: any) => cb({ data: [...mockRules], error: null })
      }),
      insert: (row: any) => {
        const r = { id: `rule-${nextId.v++}`, hits_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
        mockRules.push(r);
        return { select: () => ({ single: async () => ({ data: r, error: null }) }) };
      },
      upsert: (row: any, _opts: any) => {
        const idx = mockRules.findIndex((r: any) => r.user_id === row.user_id && r.merchant_normalized === row.merchant_normalized);
        if (idx >= 0) {
          Object.assign(mockRules[idx], row);
          return { select: () => ({ single: async () => ({ data: mockRules[idx], error: null }) }) };
        }
        const r = { id: `rule-${nextId.v++}`, hits_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
        mockRules.push(r);
        return { select: () => ({ single: async () => ({ data: r, error: null }) }) };
      },
      update: (updates: any) => ({
        eq: (f1: string, v1: any) => ({
          eq: (f2: string, v2: any) => {
            const idx = mockRules.findIndex((r: any) => r[f1] === v1 && r[f2] === v2);
            if (idx >= 0) Object.assign(mockRules[idx], updates);
            return { select: () => ({ single: async () => ({ data: idx >= 0 ? mockRules[idx] : null, error: idx >= 0 ? null : { message: "not found" } }) }) };
          }
        })
      }),
      delete: () => ({
        eq: (f1: string, v1: any) => ({
          eq: (f2: string, v2: any) => {
            const idx = mockRules.findIndex((r: any) => r[f1] === v1 && r[f2] === v2);
            if (idx >= 0) mockRules.splice(idx, 1);
            return { error: null };
          }
        })
      })
    };
  };
  return { supabase: { from: query }, getUserId: () => "u1", isMockMode: false };
});

import { ruleRoutes } from "./routes.js";

const CAT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("Phase 8 — Rules CRUD API", () => {
  let app: any;

  beforeEach(async () => {
    mockRules.length = 0;
    nextId.v = 1;
    app = Fastify();
    await app.register(ruleRoutes);
  });

  it("POST /v1/rules crea regla", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/rules",
      payload: { merchant_normalized: "spotify", preferred_category_id: CAT_A }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.merchant_normalized).toBe("spotify");
    expect(body.preferred_category_id).toBe(CAT_A);
    expect(body.hits_count).toBe(0);
  });

  it("GET /v1/rules lista reglas del usuario", async () => {
    await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "spotify", preferred_category_id: CAT_A } });
    await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "uber", preferred_category_id: CAT_B } });
    
    const res = await app.inject({ method: "GET", url: "/v1/rules" });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(2);
  });

  it("PATCH /v1/rules/:id actualiza categoría", async () => {
    const create = await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "spotify", preferred_category_id: CAT_A } });
    const ruleId = create.json().id;

    const res = await app.inject({ method: "PATCH", url: `/v1/rules/${ruleId}`, payload: { preferred_category_id: CAT_B } });
    expect(res.statusCode).toBe(200);
    expect(res.json().preferred_category_id).toBe(CAT_B);
  });

  it("DELETE /v1/rules/:id elimina regla", async () => {
    const create = await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "spotify", preferred_category_id: CAT_A } });
    const ruleId = create.json().id;

    const del = await app.inject({ method: "DELETE", url: `/v1/rules/${ruleId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().ok).toBe(true);

    const list = await app.inject({ method: "GET", url: "/v1/rules" });
    expect(list.json().length).toBe(0);
  });

  it("POST /v1/rules upsert si merchant ya existe", async () => {
    await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "spotify", preferred_category_id: CAT_A } });
    const res = await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "spotify", preferred_category_id: CAT_B } });
    expect(res.statusCode).toBe(201);
    
    const list = await app.inject({ method: "GET", url: "/v1/rules" });
    expect(list.json().length).toBe(1);
    expect(list.json()[0].preferred_category_id).toBe(CAT_B);
  });

  it("POST /v1/rules normaliza merchant", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rules", payload: { merchant_normalized: "  SPOTIFY  ", preferred_category_id: CAT_A } });
    expect(res.statusCode).toBe(201);
    expect(res.json().merchant_normalized).toBe("spotify");
  });
});
