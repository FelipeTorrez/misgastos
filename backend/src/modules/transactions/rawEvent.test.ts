import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { ingestionRoutes } from "../ingestion/routes.js";
import { transactionRoutes } from "./routes.js";
import { mockStore } from "../../lib/mockStore.js";

// Sin vi.mock de supabase: corre en mock mode (sin SUPABASE_URL en la suite).
// POST /v1/ingestion/email en mock → GET /v1/transactions/:id con raw_event.

describe("GET /v1/transactions/:id en mock — correo original", () => {
  beforeEach(() => {
    mockStore.reset();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(ingestionRoutes);
    await app.register(transactionRoutes);
    return app;
  }

  it("ingestión en mock → GET por id devuelve body.raw_event.sender y .raw_content", async () => {
    const app = await buildApp();
    const raw_content = "Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30 - Santander";
    const ing = await app.inject({
      method: "POST",
      url: "/v1/ingestion/email",
      payload: {
        sender: "santander@notificaciones.cl",
        subject: "Compra realizada",
        raw_content,
        external_id: "raw-event-test-1",
      },
    });
    expect(ing.statusCode).toBe(201);
    const txId = ing.json().transaction?.id;
    expect(txId).toBeDefined();

    const res = await app.inject({ method: "GET", url: `/v1/transactions/${txId}` });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.raw_event.sender).toBe("santander@notificaciones.cl");
    expect(j.raw_event.raw_content).toBe(raw_content);
    expect(j.raw_event.subject).toBe("Compra realizada");
  });

  it("id inexistente pero uuid válido → 404", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/99999999-9999-4999-8999-999999999999" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: "transaction not found" });
  });

  it("id malformado → 400", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/transactions/no-existe" });
    expect(res.statusCode).toBe(400);
  });
});
