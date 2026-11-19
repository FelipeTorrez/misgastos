import { describe, expect, it } from "vitest";
import { shortDate, deltaPct, fmtCLP, budgetDetailLabel } from "./format";

describe("shortDate", () => {
  it("mismo año → 'dd-mm' (5 chars)", () => {
    expect(shortDate("2026-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11");
  });

  it("otro año → mantiene el año", () => {
    expect(shortDate("2025-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11-2025");
  });

  it("hora de pared: 00:30Z no corre al día anterior", () => {
    expect(shortDate("2026-11-19T00:30:00Z", new Date(2026, 2, 1))).toBe("19-11");
  });

  it("date-only usa el día tal cual", () => {
    expect(shortDate("2026-11-19", new Date(2026, 2, 1))).toBe("19-11");
  });
});

describe("deltaPct", () => {
  it("840000 vs 750000 → 12", () => {
    expect(deltaPct(840000, 750000)).toBe(12);
  });

  it("prev 0 → null", () => {
    expect(deltaPct(1000, 0)).toBeNull();
  });

  it("0 vs 1000 → -100", () => {
    expect(deltaPct(0, 1000)).toBe(-100);
  });
});

describe("budgetDetailLabel", () => {
  it("cycle → 'límite del ciclo' y $/día por cycleN", () => {
    const label = budgetDetailLabel({ amount: 31000, period: "cycle" }, 31);
    expect(label).toBe(`de ${fmtCLP(31000)} · límite del ciclo (≈${fmtCLP(1000)}/día)`);
  });

  it("partial → $/día por coveredDays (27097/12 ≈ 2258, no 874)", () => {
    const label = budgetDetailLabel(
      { amount: 27097, partial: true, coveredDays: 12, totalDays: 31 },
      31,
    );
    expect(label).toBe(`de ${fmtCLP(27097)} · 12 de 31 días (≈${fmtCLP(2258)}/día)`);
    expect(label).toContain(fmtCLP(Math.round(27097 / 12)));
    expect(label).not.toContain(fmtCLP(Math.round(27097 / 31)));
  });

  it("mensual completo → sin 'en N días' duplicado", () => {
    const label = budgetDetailLabel({ amount: 31000 }, 31);
    expect(label).toBe(`de ${fmtCLP(31000)} (≈${fmtCLP(1000)}/día)`);
    expect(label).not.toContain("en ");
  });
});
