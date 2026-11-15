import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { CreateTx, PatchTx, transactionRoutes } from "./routes.js";
import { mockStore } from "../../lib/mockStore.js";

const UUID1 = "11111111-1111-1111-8111-111111111111";
const UUID2 = "22222222-2222-2222-8222-222222222222";

describe("#1 Unit — transacciones & transfer 1-fila (ADR-002)", () => {
  it("expense válido", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 32990, type: "expense", date: "2026-08-24" });
    expect(r.success).toBe(true);
  });
  it("income válido", () => {
    const r = CreateTx.safeParse({ merchant: "Sueldo", amount: 2500000, type: "income", date: "2026-08-01" });
    expect(r.success).toBe(true);
  });
  it("transfer válido 1-fila con from/to distintos", () => {
    const r = CreateTx.safeParse({ merchant: "Transfer", amount: 100000, type: "transfer", date: "2026-08-24", from_account_id: UUID1, to_account_id: UUID2 });
    expect(r.success).toBe(true);
  });
  it("transfer falla sin from/to", () => {
    const r = CreateTx.safeParse({ merchant: "Transfer", amount: 100000, type: "transfer", date: "2026-08-24" });
    expect(r.success).toBe(false);
  });
  it("transfer falla si from == to", () => {
    const r = CreateTx.safeParse({ merchant: "Transfer", amount: 50000, type: "transfer", date: "2026-08-24", from_account_id: UUID1, to_account_id: UUID1 });
    expect(r.success).toBe(false);
  });
  it("transfer falla si solo from", () => {
    const r = CreateTx.safeParse({ merchant: "Transfer", amount: 50000, type: "transfer", date: "2026-08-24", from_account_id: UUID1 });
    expect(r.success).toBe(false);
  });
  it("amount debe ser positivo", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: -100, type: "expense", date: "2026-08-24" });
    expect(r.success).toBe(false);
  });
  it("amount 0 falla", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 0, type: "expense", date: "2026-08-24" });
    expect(r.success).toBe(false);
  });
});

describe("date ISO en CreateTx/PatchTx → 400 si inválida", () => {
  it("'24/08/2026' rechazada", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 1000, type: "expense", date: "24/08/2026" });
    expect(r.success).toBe(false);
  });
  it("'2026-02-30' rechazada (no es fecha calendario)", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 1000, type: "expense", date: "2026-02-30" });
    expect(r.success).toBe(false);
  });
  it("'2026-08-24' aceptada", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 1000, type: "expense", date: "2026-08-24" });
    expect(r.success).toBe(true);
  });
  it("'2026-08-24T12:00:00Z' aceptada", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 1000, type: "expense", date: "2026-08-24T12:00:00Z" });
    expect(r.success).toBe(true);
  });
  it("'2026-08-24T12:00:00-04:00' aceptada", () => {
    const r = CreateTx.safeParse({ merchant: "Lider", amount: 1000, type: "expense", date: "2026-08-24T12:00:00-04:00" });
    expect(r.success).toBe(true);
  });
  it("PatchTx rechaza date inválida", () => {
    expect(PatchTx.safeParse({ date: "24/08/2026" }).success).toBe(false);
    expect(PatchTx.safeParse({ date: "2026-08-24" }).success).toBe(true);
  });
});

describe("POST /v1/transactions con date inválida → 400 sin guardar", () => {
  beforeEach(() => {
    mockStore.reset();
  });

  it("app.inject POST con date inválida → 400 y mockStore sin filas", async () => {
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/v1/transactions",
      payload: { merchant: "Lider", amount: 1000, type: "expense", date: "24/08/2026" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockStore.transactions.length).toBe(0);
  });

  it("PATCH con date inválida → 400 y conserva fecha", async () => {
    const tx = mockStore.insertTransaction("00000000-0000-0000-0000-000000000000", {
      merchant: "Lider",
      amount: 1000,
      type: "expense",
      date: "2026-08-24",
    });
    const app = Fastify();
    await app.register(transactionRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/transactions/${tx.id}`,
      payload: { date: "2026-02-30" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockStore.transactions[0].date).toBe("2026-08-24");
  });
});
