import { describe, it, expect } from "vitest";
import { computeAccuracy, toMarkdown } from "./evalClassifier.js";

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
});
