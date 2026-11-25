import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => ({
  supabase: { from: () => { throw new Error("supabase no debe usarse en mock mode"); } },
  getUserId: () => "user-test",
  isMockMode: true,
}));

import app from "../src/index.js";
import { mockStore } from "../src/lib/mockStore.js";

beforeEach(() => {
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
      // received_at creciente: el orden desc queda determinístico para paginar.
      received_at: new Date(Date.UTC(2026, 7, 1, 0, 0, i)).toISOString(),
      raw_content: `Compra por $${amount.toLocaleString("es-CL")} en Comercio${i} con tarjeta terminada en 1234 - 24/08/2026 15:30`,
    });
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
