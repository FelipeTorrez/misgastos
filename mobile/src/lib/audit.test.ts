import { describe, expect, it } from "vitest";
import { classificationAudit } from "./audit";

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
});
