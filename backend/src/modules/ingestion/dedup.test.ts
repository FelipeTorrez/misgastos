import { describe, it, expect } from "vitest";
import { isDuplicate } from "./dedup.js";

const baseExisting = [
  { id: "1", amount: 32990, date: "2026-08-24T15:30:00Z", merchant: "Lider", type: "expense", status: "confirmed" },
  { id: "2", amount: 250000, date: "2026-08-06T09:00:00Z", merchant: "Transferencia", type: "transfer", status: "confirmed" },
];

describe("Phase 5 — Deduplicación §15", () => {
  it("email + notificación mismo Lider 32.990 mismo día → duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", time: "15:32", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)?.id).toBe("1");
  });
  it("mismo monto distinto comercio → no duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", merchant: "Jumbo", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)).toBeNull();
  });
  it("mismo comercio distinto monto → no duplicado", () => {
    const cand = { amount: 10000, date: "2026-08-24", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)).toBeNull();
  });
  it("mismo todo distinto día → no duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-25", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)).toBeNull();
  });
  it("fuzzy merchant Lider Providencia vs Lider → duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", merchant: "Lider Providencia", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any)?.id).toBe("1");
  });
  it("ventana tiempo 60min: 15:30 vs 18:00 fuera ventana → no duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", time: "18:00", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any, { windowMinutes: 60 })).toBeNull();
  });
  it("ventana 180min: 15:30 vs 18:00 dentro → duplicado", () => {
    const cand = { amount: 32990, date: "2026-08-24", time: "18:00", merchant: "Lider", type: "expense" };
    expect(isDuplicate(cand, baseExisting as any, { windowMinutes: 180 })?.id).toBe("1");
  });
  it("ignora transacciones ya marcadas duplicate", () => {
    const existing = [{ id: "dup", amount: 100, date: "2026-08-24T10:00:00Z", merchant: "Test", type: "expense", status: "duplicate" }];
    const cand = { amount: 100, date: "2026-08-24", merchant: "Test", type: "expense" };
    expect(isDuplicate(cand, existing as any)).toBeNull();
  });
  it("transferencia mismo monto → detecta", () => {
    const cand = { amount: 250000, date: "2026-08-06", merchant: "Transferencia", type: "transfer" };
    expect(isDuplicate(cand, baseExisting as any)?.id).toBe("2");
  });
});
