import { describe, it, expect } from "vitest";
import { z } from "zod";

// Replica del schema de routes.ts para test unit puro (sin Fastify)
const CreateTx = z.object({
  account_id: z.string().uuid().nullable().optional(),
  merchant: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  currency: z.string().default("CLP"),
  type: z.enum(["expense","income","transfer"]),
  payment_method: z.enum(["debit_card","credit_card","transfer","cash","unknown"]).default("unknown"),
  date: z.string(),
  from_account_id: z.string().uuid().nullable().optional(),
  to_account_id: z.string().uuid().nullable().optional(),
  status: z.enum(["pending_ai","pending_review","confirmed","corrected","ignored","duplicate"]).default("confirmed"),
}).refine(v => {
  if (v.type === "transfer") return !!v.from_account_id && !!v.to_account_id && v.from_account_id !== v.to_account_id;
  return true;
}, { message: "transfer requiere from_account_id y to_account_id distintos" });

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
