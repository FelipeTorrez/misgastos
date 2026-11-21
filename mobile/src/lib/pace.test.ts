import { describe, expect, it } from "vitest";
import { cyclePace } from "./pace";

const FROM = "2026-08-20";
const TO = "2026-09-19"; // ciclo 20 ago → 19 sep (31 días)

describe("cyclePace", () => {
  it("ciclo 20-ago→19-sep con hoy 12-sep: quedan $30.000 en 8 días", () => {
    const p = cyclePace({ limit: 200000, spent: 170000, from: FROM, to: TO, today: "2026-09-12" });
    expect(p).not.toBeNull();
    expect(p!.remaining).toBe(30000);
    expect(p!.daysLeft).toBe(8);
    expect(p!.perDay).toBe(3750);
    expect(p!.overspent).toBe(false);
  });

  it("último día (hoy = to): daysLeft = 1 y perDay = todo lo que queda", () => {
    const p = cyclePace({ limit: 200000, spent: 175000, from: FROM, to: TO, today: TO });
    expect(p).not.toBeNull();
    expect(p!.daysLeft).toBe(1);
    expect(p!.remaining).toBe(25000);
    expect(p!.perDay).toBe(25000);
    expect(p!.overspent).toBe(false);
  });

  it("perDay redondea hacia arriba (no se puede gastar fracción de peso)", () => {
    const p = cyclePace({ limit: 100000, spent: 90000, from: FROM, to: TO, today: "2026-09-17" });
    expect(p).not.toBeNull();
    expect(p!.daysLeft).toBe(3);
    expect(p!.perDay).toBe(3334);
  });

  it("excedido: remaining negativo y overspent true", () => {
    const p = cyclePace({ limit: 100000, spent: 130000, from: FROM, to: TO, today: "2026-09-12" });
    expect(p).not.toBeNull();
    expect(p!.remaining).toBe(-30000);
    expect(p!.daysLeft).toBe(8);
    expect(p!.perDay).toBe(-3750);
    expect(p!.overspent).toBe(true);
  });

  it("excedido no exacto: perDay también usa ceil", () => {
    const p = cyclePace({ limit: 100000, spent: 110000, from: FROM, to: TO, today: "2026-09-17" });
    expect(p).not.toBeNull();
    expect(p!.remaining).toBe(-10000);
    expect(p!.daysLeft).toBe(3);
    expect(p!.perDay).toBe(-3333);
    expect(p!.overspent).toBe(true);
  });

  it("ciclo cerrado (hoy después de to) → null", () => {
    expect(cyclePace({ limit: 200000, spent: 170000, from: FROM, to: TO, today: "2026-09-20" })).toBeNull();
  });

  it("ciclo futuro (hoy antes de from) → null", () => {
    expect(cyclePace({ limit: 200000, spent: 0, from: FROM, to: TO, today: "2026-08-19" })).toBeNull();
  });

  it("limit 0 → null", () => {
    expect(cyclePace({ limit: 0, spent: 0, from: FROM, to: TO, today: "2026-09-12" })).toBeNull();
  });

  it("limit negativo o no finito → null", () => {
    expect(cyclePace({ limit: -1000, spent: 0, from: FROM, to: TO, today: "2026-09-12" })).toBeNull();
    expect(cyclePace({ limit: NaN, spent: 0, from: FROM, to: TO, today: "2026-09-12" })).toBeNull();
  });

  it("fecha mal formada → null", () => {
    expect(cyclePace({ limit: 100000, spent: 0, from: FROM, to: "2026-9-19", today: "2026-09-12" })).toBeNull();
  });
});
