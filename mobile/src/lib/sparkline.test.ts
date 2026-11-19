import { describe, expect, it } from "vitest";
import { dailyExpenseSeries, sparklinePoints } from "./sparkline";

describe("sparklinePoints", () => {
  it("(a) array vacío -> []", () => {
    expect(sparklinePoints([], 100, 30)).toEqual([]);
  });

  it("(b) un solo punto -> centrado", () => {
    expect(sparklinePoints([5000], 100, 30)).toEqual([{ x: 50, y: 15 }]);
  });

  it("(c) todos iguales -> línea plana a media altura", () => {
    const pts = sparklinePoints([10, 10, 10, 10], 120, 40);
    expect(pts).toHaveLength(4);
    expect(new Set(pts.map((p) => p.y))).toEqual(new Set([20]));
    expect(pts.map((p) => p.x)).toEqual([0, 40, 80, 120]);
  });

  it("(d) mínimo abajo y máximo arriba, sin NaN", () => {
    const pts = sparklinePoints([0, 50, 100], 100, 40);
    expect(pts.map((p) => p.y)).toEqual([40, 20, 0]);
    expect(pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))).toBe(false);
  });

  it("(e) width/height inválidos -> []", () => {
    expect(sparklinePoints([1, 2], 0, 30)).toEqual([]);
    expect(sparklinePoints([1, 2], 100, -1)).toEqual([]);
  });
});

describe("dailyExpenseSeries", () => {
  it("(f) suma gastos por día e ignora ingresos/duplicados", () => {
    const range = { from: "2026-11-20", to: "2026-11-22" };
    const out = dailyExpenseSeries(
      [
        { amount: 1000, type: "expense", date: "2026-11-20T12:00:00Z" },
        { amount: 500, type: "expense", date: "2026-11-20T18:00:00Z" },
        { amount: 2000, type: "expense", date: "2026-11-21T09:00:00Z", status: "duplicate" },
        { amount: 3000, type: "expense", date: "2026-11-22T09:00:00Z" },
        { amount: 9000, type: "income", date: "2026-11-22T09:00:00Z" },
      ],
      range,
      { today: "2026-11-22" }
    );
    expect(out).toEqual([1500, 0, 3000]);
  });

  it("(g) no dibuja días futuros y un ciclo largo queda en 12-20 puntos", () => {
    const range = { from: "2026-11-20", to: "2026-12-19" };
    const out = dailyExpenseSeries([], range, { today: "2026-12-19", maxPoints: 20 });
    expect(out.length).toBeGreaterThanOrEqual(12);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  it("(h) rango futuro -> []", () => {
    expect(dailyExpenseSeries([], { from: "2027-01-20", to: "2027-02-19" }, { today: "2026-11-19" })).toEqual([]);
  });
});
