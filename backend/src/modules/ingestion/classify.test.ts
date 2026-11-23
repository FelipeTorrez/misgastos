import { describe, it, expect } from "vitest";
import { resolveType, resolveStatus } from "./classify.js";

const baseStatus = {
  dedupFound: null,
  processorHit: false,
  classificationSource: "ai",
  aiConfidence: 0.95,
  aiNeedsReview: false,
  providerFallback: false,
};

describe("Ingesta — resolveStatus (precedencia de chips)", () => {
  it("dedup + procesador => duplicate gana", () => {
    expect(resolveStatus({ ...baseStatus, dedupFound: { id: "tx-1" }, processorHit: true })).toBe("duplicate");
  });
  it("procesador de pago => pending_review", () => {
    expect(resolveStatus({ ...baseStatus, processorHit: true })).toBe("pending_review");
  });
  it("IA en fallback => pending_review aunque needs_review venga false", () => {
    expect(resolveStatus({ ...baseStatus, classificationSource: "fallback", aiConfidence: 0.5, aiNeedsReview: false })).toBe("pending_review");
    expect(resolveStatus({ ...baseStatus, providerFallback: true })).toBe("pending_review");
  });
  it("regla del usuario => confirmed", () => {
    expect(resolveStatus({ ...baseStatus, classificationSource: "rule", aiConfidence: 1.0 })).toBe("confirmed");
  });
  it("IA 0.90 => confirmed", () => {
    expect(resolveStatus({ ...baseStatus, aiConfidence: 0.90 })).toBe("confirmed");
  });
  it("IA 0.85 (borde) => confirmed", () => {
    expect(resolveStatus({ ...baseStatus, aiConfidence: 0.85 })).toBe("confirmed");
  });
  it("IA 0.70 => pending_ai", () => {
    expect(resolveStatus({ ...baseStatus, aiConfidence: 0.70 })).toBe("pending_ai");
  });
});

describe("Ingesta — resolveType (income / transfer / expense)", () => {
  it("direction 'in' => income", () => {
    expect(resolveType({ direction: "in", operation: "compra" })).toBe("income");
  });
  it("direction 'internal' => transfer", () => {
    expect(resolveType({ direction: "internal", operation: "compra" })).toBe("transfer");
  });
  it("operation 'transfer' => transfer", () => {
    expect(resolveType({ direction: "out", operation: "transfer" })).toBe("transfer");
  });
  it("aiType explícito gana sobre direction y operation", () => {
    expect(resolveType({ aiType: "income", direction: "internal", operation: "transfer" })).toBe("income");
  });
  it("sin señales => expense", () => {
    expect(resolveType({ operation: "compra" })).toBe("expense");
  });
});
