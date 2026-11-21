import { describe, expect, it } from "vitest";
import { shortDate, fmtWallDate, wallYMD, deltaPct, fmtCLP, budgetDetailLabel } from "./format";

describe("shortDate", () => {
  it("mismo año → 'dd-mm' (5 chars)", () => {
    expect(shortDate("2026-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11");
  });

  it("otro año → mantiene el año", () => {
    expect(shortDate("2025-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11-2025");
  });

  it("instante UTC con milisegundos → día local de Chile (17-11, no 18-11)", () => {
    // 2026-11-18T01:01:19.446Z = 17-11 22:01 en America/Santiago (UTC-3 en noviembre)
    expect(shortDate("2026-11-18T01:01:19.446Z", new Date(2026, 5, 15))).toBe("17-11");
  });

  it("hora de pared T00:30:00Z → conserva el día escrito (19-11)", () => {
    expect(shortDate("2026-11-19T00:30:00Z", new Date(2026, 5, 15))).toBe("19-11");
  });

  it("fecha pelada → ese día tal cual", () => {
    expect(shortDate("2026-11-19", new Date(2026, 5, 15))).toBe("19-11");
  });
});

describe("wallYMD / fmtWallDate", () => {
  it("instante con milisegundos → día de Santiago", () => {
    expect(wallYMD("2026-11-18T01:01:19.446Z")).toBe("2026-11-17");
    expect(fmtWallDate("2026-11-18T01:01:19.446Z")).toBe("17-11-2026");
  });

  it("pared sin milisegundos y segundos 00 → prefijo tal cual", () => {
    expect(wallYMD("2026-11-19T00:30:00Z")).toBe("2026-11-19");
    expect(fmtWallDate("2026-11-19T00:30:00Z")).toBe("19-11-2026");
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

  it("cycle con perDay:true explícito → igual que el default", () => {
    const implicit = budgetDetailLabel({ amount: 400000, period: "cycle" }, 30);
    const explicit = budgetDetailLabel({ amount: 400000, period: "cycle" }, 30, { perDay: true });
    expect(explicit).toBe(implicit);
    expect(explicit).toBe(`de ${fmtCLP(400000)} · límite del ciclo (≈${fmtCLP(Math.round(400000 / 30))}/día)`);
  });

  it("cycle con perDay:false → sin '(≈$/día)', conserva 'límite del ciclo'", () => {
    const label = budgetDetailLabel({ amount: 400000, period: "cycle" }, 30, { perDay: false });
    expect(label).toBe(`de ${fmtCLP(400000)} · límite del ciclo`);
    expect(label).not.toContain("/día");
    expect(label).not.toContain("≈");
  });

  it("partial con perDay:false → sin $/día y conserva 'C de T días'", () => {
    const label = budgetDetailLabel(
      { amount: 27097, partial: true, coveredDays: 12, totalDays: 31 },
      31,
      { perDay: false },
    );
    expect(label).toBe(`de ${fmtCLP(27097)} · 12 de 31 días`);
    expect(label).not.toContain("/día");
  });

  it("mensual con perDay:false → solo 'de $X'", () => {
    const label = budgetDetailLabel({ amount: 31000 }, 31, { perDay: false });
    expect(label).toBe(`de ${fmtCLP(31000)}`);
    expect(label).not.toContain("/día");
  });
});
