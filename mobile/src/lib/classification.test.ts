import { describe, expect, it } from "vitest";
import { confidenceBand, needsAudit, provenanceLabel } from "./classification";

describe("provenanceLabel", () => {
  it("ai 0.95 → 'IA 95%'", () => {
    expect(provenanceLabel({ source: "ai", confidence: 0.95 })).toBe("IA 95%");
  });

  it("fallback sin confianza → 'Respaldo sin IA'", () => {
    expect(provenanceLabel({ source: "fallback", confidence: null })).toBe("Respaldo sin IA");
  });

  it("rule sin confidence → 'Regla'", () => {
    expect(provenanceLabel({ source: "rule" })).toBe("Regla");
  });

  it("rule con confidence 1 → 'Regla' sin porcentaje", () => {
    expect(provenanceLabel({ source: "rule", confidence: 1 })).toBe("Regla");
  });

  it("confidence null no agrega porcentaje", () => {
    expect(provenanceLabel({ source: "ai", confidence: null })).toBe("IA");
  });

  it("manual con confidence 1 → 'Manual' sin porcentaje", () => {
    expect(provenanceLabel({ source: "manual", confidence: 1 })).toBe("Manual");
  });
});

describe("needsAudit", () => {
  it("ai/rule/ai_cache no necesitan auditoría", () => {
    expect(needsAudit({ source: "ai", confidence: 0.95 })).toBe(false);
    expect(needsAudit({ source: "rule" })).toBe(false);
    expect(needsAudit({ source: "ai_cache", confidence: 0.92 })).toBe(false);
  });

  it("manual no necesita auditoría (lo escribió el usuario)", () => {
    expect(needsAudit({ source: "manual" })).toBe(false);
    expect(needsAudit({ source: "manual", confidence: 1 })).toBe(false);
  });

  it("fallback necesita auditoría", () => {
    expect(needsAudit({ source: "fallback", confidence: null })).toBe(true);
  });
});

describe("confidenceBand", () => {
  it("bandas >=0.85 alta, 0.60-0.85 media, <0.60 baja", () => {
    expect(confidenceBand(0.95)).toBe("alta");
    expect(confidenceBand(0.7)).toBe("media");
    expect(confidenceBand(0.4)).toBe("baja");
    expect(confidenceBand(null)).toBe(null);
  });
});
