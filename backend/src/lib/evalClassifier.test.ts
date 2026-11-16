import { describe, it, expect } from "vitest";
import { buildEvalUserRules, computeAccuracy, EVAL_MAX_USER_RULES, estimateRequestSize, toMarkdown } from "./evalClassifier.js";

describe("evalClassifier — agregador puro", () => {
  it("accuracy global con 3 casos sintéticos (2/3)", () => {
    const report = computeAccuracy([
      { id: "tx-1", expected: "alimentacion", predicted: "alimentacion", merchant: "Lider", amount: 12500 },
      { id: "tx-2", expected: "transporte", predicted: "otros", merchant: "Copec", amount: 30000 },
      { id: "tx-3", expected: "salud", predicted: "salud", merchant: "Cruz Verde", amount: 8990 },
    ]);
    expect(report.total).toBe(3);
    expect(report.correct).toBe(2);
    expect(report.incorrect).toBe(1);
    expect(report.accuracy).toBeCloseTo(2 / 3, 6);
  });

  it("matriz de confusión por categoría", () => {
    const report = computeAccuracy([
      { id: "tx-1", expected: "alimentacion", predicted: "alimentacion" },
      { id: "tx-2", expected: "transporte", predicted: "otros" },
      { id: "tx-3", expected: "salud", predicted: "salud" },
    ]);
    expect(report.confusion["alimentacion"]["alimentacion"]).toBe(1);
    expect(report.confusion["transporte"]["otros"]).toBe(1);
    expect(report.confusion["salud"]["salud"]).toBe(1);
    expect(report.perCategory["transporte"]).toMatchObject({ total: 1, correct: 0, accuracy: 0 });
    expect(report.perCategory["salud"]).toMatchObject({ total: 1, correct: 1, accuracy: 1 });
  });

  it("lista de fallos con normalización de slugs", () => {
    const report = computeAccuracy([
      { id: "tx-1", expected: " Alimentacion ", predicted: "ALIMENTACION" },
      { id: "tx-2", expected: "transporte", predicted: "otros" },
      { id: "tx-3", expected: "salud", predicted: "salud" },
    ]);
    expect(report.failures.map((f) => f.id)).toEqual(["tx-2"]);
  });

  it("ignora los marcados como fallback y los cuenta aparte", () => {
    const report = computeAccuracy([
      { id: "tx-1", expected: "alimentacion", predicted: "alimentacion" },
      { id: "tx-2", expected: "transporte", predicted: "otros", fallback: true },
      { id: "tx-3", expected: "transporte", predicted: "otros" },
    ]);
    expect(report.skippedFallback).toBe(1);
    expect(report.total).toBe(2);
    expect(report.correct).toBe(1);
    expect(report.incorrect).toBe(1);
    expect(report.accuracy).toBeCloseTo(1 / 2, 6);
    expect(report.perCategory["transporte"]).toMatchObject({ total: 1, correct: 0 });
    expect(report.confusion["transporte"]["otros"]).toBe(1);
    const md = toMarkdown(report);
    expect(md).toContain("No evaluables (fallback Groq): **1**");
  });

  it("recorta user_rules a 20 como la ingesta", () => {
    const all = Array.from({ length: 124 }, (_, i) => ({ merchant: `m${i}`, preferred_category: "otros" }));
    const cut = buildEvalUserRules(all);
    expect(EVAL_MAX_USER_RULES).toBe(20);
    expect(cut).toHaveLength(20);
    expect(cut[0].merchant).toBe("m0");
    expect(cut[19].merchant).toBe("m19");
  });

  it("estima tamaño del request y el markdown incluye modelo y reglas", () => {
    const size = estimateRequestSize("a".repeat(100), "b".repeat(100));
    expect(size.chars).toBe(200);
    expect(size.approxTokens).toBe(50);
    const report = computeAccuracy([
      { id: "tx-1", expected: "alimentacion", predicted: "alimentacion" },
    ]);
    const md = toMarkdown(report, { model: "qwen/qwen3-32b", ruleCount: 20 });
    expect(md).toContain("qwen/qwen3-32b");
    expect(md).toContain("Reglas usuario: **20**");
  });
});
