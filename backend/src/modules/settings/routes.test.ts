import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const { settingsRows } = vi.hoisted(() => {
  let rows: any[] = [];
  return { settingsRows: rows };
});

vi.mock("../../lib/supabase.js", () => {
  const query = () => {
    const eq = (f: string, v: any) => ({
      limit: async () => ({ data: settingsRows.filter((r: any) => r[f] === v), error: null }),
    });
    return {
      select: (_c: string) => ({ eq }),
      insert: (row: any) => {
        settingsRows.push(row);
        return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
      },
      update: (updates: any) => ({
        eq: (f: string, v: any) => {
          const r = settingsRows.find((x: any) => x[f] === v);
          if (r) Object.assign(r, updates);
          return { select: () => ({ single: async () => ({ data: r ?? null, error: r ? null : { message: "not found" } }) }) };
        },
      }),
    };
  };
  return { supabase: { from: () => query() }, getUserId: () => "u1", isMockMode: false };
});

import { settingsRoutes } from "./routes.js";

describe("Config ciclo de facturación — Settings API", () => {
  let app: any;

  beforeEach(async () => {
    settingsRows.length = 0;
    app = Fastify();
    await app.register(settingsRoutes);
  });

  it("GET /v1/settings devuelve null si no hay fila", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/settings" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it("PUT /v1/settings crea configuración", async () => {
    const res = await app.inject({
      method: "PUT", url: "/v1/settings",
      payload: { billing_cycle_day: 20, billing_cycle_enabled: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().billing_cycle_day).toBe(20);
    expect(res.json().billing_cycle_enabled).toBe(true);
  });

  it("GET devuelve la config guardada", async () => {
    await app.inject({ method: "PUT", url: "/v1/settings", payload: { billing_cycle_day: 15, billing_cycle_enabled: false } });
    const res = await app.inject({ method: "GET", url: "/v1/settings" });
    expect(res.json().billing_cycle_day).toBe(15);
    expect(res.json().billing_cycle_enabled).toBe(false);
  });

  it("PUT actualiza en vez de duplicar", async () => {
    const a = await app.inject({ method: "PUT", url: "/v1/settings", payload: { billing_cycle_day: 20, billing_cycle_enabled: true } });
    const b = await app.inject({ method: "PUT", url: "/v1/settings", payload: { billing_cycle_day: 22, billing_cycle_enabled: true } });
    expect(b.statusCode).toBe(200);
    expect(settingsRows.length).toBe(1);
    expect(settingsRows[0].billing_cycle_day).toBe(22);
  });

  it("PUT valida día fuera de rango 1..28", async () => {
    const res = await app.inject({ method: "PUT", url: "/v1/settings", payload: { billing_cycle_day: 30 } });
    expect(res.statusCode).toBe(400);
  });
});
