import { describe, it, expect } from "vitest";
import { planCarryOver } from "./carry.js";

const NEW = "2026-10-20";

describe("planCarryOver — herencia de límites de ciclo", () => {
  it("copia los límites del ciclo anterior al nuevo, con period='cycle' y month=newStart", () => {
    const prev = [
      { category_id: "cat-1", amount: 70000, month: "2026-09-20", period: "cycle" },
      { category_id: null, amount: 500000, month: "2026-09-20", period: "cycle" },
    ];
    expect(planCarryOver(prev, [], NEW)).toEqual([
      { category_id: "cat-1", amount: 70000, period: "cycle", month: NEW },
      { category_id: null, amount: 500000, period: "cycle", month: NEW },
    ]);
  });

  it("no sobreescribe categorías ya presentes en el ciclo actual", () => {
    const prev = [
      { category_id: "cat-1", amount: 70000, month: "2026-09-20", period: "cycle" },
      { category_id: "cat-2", amount: 30000, month: "2026-09-20", period: "cycle" },
      { category_id: null, amount: 500000, month: "2026-09-20", period: "cycle" },
    ];
    const current = [
      { category_id: "cat-1", amount: 50000, month: NEW, period: "cycle" },
      { category_id: null, amount: 400000, month: NEW, period: "cycle" },
    ];
    expect(planCarryOver(prev, current, NEW)).toEqual([
      { category_id: "cat-2", amount: 30000, period: "cycle", month: NEW },
    ]);
  });

  it("no duplica categorías repetidas en el ciclo anterior", () => {
    const prev = [
      { category_id: "cat-1", amount: 70000, month: "2026-09-20", period: "cycle" },
      { category_id: "cat-1", amount: 90000, month: "2026-09-20", period: "cycle" },
    ];
    const plan = planCarryOver(prev, [], NEW);
    expect(plan).toHaveLength(1);
    expect(plan[0].amount).toBe(70000);
  });

  it("ignora presupuestos mensuales, montos inválidos y filas ya del ciclo nuevo", () => {
    const prev = [
      { category_id: "cat-1", amount: 70000, month: "2026-09-20", period: "monthly" },
      { category_id: "cat-2", amount: 0, month: "2026-09-20", period: "cycle" },
      { category_id: "cat-3", amount: 25000, month: NEW, period: "cycle" },
      { category_id: "cat-4", amount: 10000, month: "2026-09-20", period: "cycle" },
    ];
    expect(planCarryOver(prev, [], NEW)).toEqual([
      { category_id: "cat-4", amount: 10000, period: "cycle", month: NEW },
    ]);
  });

  it("sin presupuestos previos devuelve []", () => {
    expect(planCarryOver([], [], NEW)).toEqual([]);
  });
});
