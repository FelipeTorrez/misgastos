import { describe, expect, it } from "vitest";
import { classificationAudit, reviewQueue } from "./audit";

describe("classificationAudit", () => {
  it("mezcla de sources y confidences", () => {
    const txs = [
      { source: "ai", confidence: 0.95 },
      { source: "ai", confidence: 0.7 },
      { source: "ai_cache", confidence: 0.95 },
      { source: "rule", confidence: 1 },
      { source: "fallback", confidence: null },
      { source: "ai_error", confidence: 0.4 },
    ];
    const a = classificationAudit(txs);
    expect(a.total).toBe(6);
    expect(a.ai).toBe(2);
    expect(a.aiCache).toBe(1);
    expect(a.rule).toBe(1);
    expect(a.fallback).toBe(1);
    expect(a.sinClasificar).toBe(1);
    expect(a.bajaConfianza).toBe(1);
    expect(a.requierenRevision).toBe(2);
  });

  it("lista vacía → todo en cero", () => {
    expect(classificationAudit([])).toEqual({
      total: 0,
      ai: 0,
      rule: 0,
      aiCache: 0,
      fallback: 0,
      sinClasificar: 0,
      bajaConfianza: 0,
      requierenRevision: 0,
    });
  });

  it("acepta classification_source como alias de source", () => {
    const a = classificationAudit([
      { classification_source: "ai", confidence: 0.95 },
      { classification_source: "fallback", confidence: null },
    ]);
    expect(a.total).toBe(2);
    expect(a.ai).toBe(1);
    expect(a.fallback).toBe(1);
    expect(a.requierenRevision).toBe(1);
  });

  it("manual no cuenta como sinClasificar ni como requieren revisión", () => {
    const a = classificationAudit([
      { source: "manual", confidence: 1 },
      { source: "ai_error", confidence: null },
    ]);
    expect(a.total).toBe(2);
    expect(a.sinClasificar).toBe(1);
    expect(a.requierenRevision).toBe(1);
  });
});

describe("reviewQueue", () => {
  it("fallback 0.4 → incluida; ai 0.95 → no", () => {
    const { items, count } = reviewQueue([
      { source: "fallback", confidence: 0.4 },
      { source: "ai", confidence: 0.95 },
    ]);
    expect(count).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "fallback" });
  });

  it("ai_error/null → incluida; ai baja confianza → incluida", () => {
    const { items, count } = reviewQueue([
      { source: "ai_error", confidence: null },
      { source: "ai", confidence: 0.5 },
      { source: "rule", confidence: 1 },
    ]);
    expect(count).toBe(2);
    expect(items.map((t) => t.source).sort()).toEqual(["ai", "ai_error"]);
  });

  it("ordena por confianza ascendente, null primero", () => {
    const { items } = reviewQueue([
      { source: "fallback", confidence: 0.5 },
      { source: "ai_error", confidence: null },
      { source: "ai", confidence: 0.4 },
    ]);
    expect(items.map((t) => t.confidence)).toEqual([null, 0.4, 0.5]);
  });

  it("acepta classification_source como alias", () => {
    const { count } = reviewQueue([
      { classification_source: "fallback", confidence: null },
      { classification_source: "ai", confidence: 0.95 },
    ]);
    expect(count).toBe(1);
  });

  it("ignora txs ya resueltas (status corrected/confirmed)", () => {
    const { items, count } = reviewQueue([
      { source: "fallback", confidence: null, status: "corrected" },
      { source: "fallback", confidence: null, status: "confirmed" },
      { source: "fallback", confidence: null, status: "pending_review" },
    ]);
    expect(count).toBe(1);
    expect(items[0].status).toBe("pending_review");
  });
});
