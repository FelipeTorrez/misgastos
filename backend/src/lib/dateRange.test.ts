import { describe, it, expect } from "vitest";
import { monthOverlaps, rangeDays, addDays, toDate, fmt, daysInMonth, monthBounds, currentMonthLocal, shiftMonths } from "./dateRange.js";

describe("#Filtro rango — helpers de fecha (ciclo 20→20)", () => {
  it("monthOverlaps agrupa correctamente un ciclo que cruza 2 meses", () => {
    const o = monthOverlaps("2026-08-20", "2026-09-19");
    expect(o).toEqual([
      { month: "2026-08-01", overlapDays: 12, totalDays: 31, ratio: 12 / 31 },
      { month: "2026-09-01", overlapDays: 19, totalDays: 30, ratio: 19 / 30 },
    ]);
  });

  it("ciclo dentro de un solo mes", () => {
    const o = monthOverlaps("2026-08-05", "2026-08-25");
    expect(o.length).toBe(1);
    expect(o[0]).toEqual({ month: "2026-08-01", overlapDays: 21, totalDays: 31, ratio: 21 / 31 });
  });

  it("rango que cruza el cambio de año", () => {
    const o = monthOverlaps("2026-12-25", "2027-01-05");
    expect(o.map(x => x.month)).toEqual(["2026-12-01", "2027-01-01"]);
    expect(o[0].overlapDays).toBe(7); // 25..31
    expect(o[1].overlapDays).toBe(5); // 01..05
  });

  it("rangeDays calcula días inclusive", () => {
    expect(rangeDays("2026-08-20", "2026-09-19")).toBe(31);
    expect(rangeDays("2026-08-05", "2026-08-05")).toBe(1);
  });

  it("prorrateo: 100.000 en agosto *12/31 + septiembre*19/30", () => {
    const o = monthOverlaps("2026-08-20", "2026-09-19");
    const aug = o[0];
    const sep = o[1];
    const prorated = Math.round(100000 * aug.ratio) + Math.round(100000 * sep.ratio);
    // ratio exacto: (12/31 + 19/30)
    expect(prorated).toBe(Math.round(100000 * (12 / 31)) + Math.round(100000 * (19 / 30)));
  });

  it("addDays/fmt/toDate funcionan", () => {
    expect(fmt(addDays(toDate("2026-08-31"), 1))).toBe("2026-09-01");
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it("monthBounds cubre marzo completo (31 días, sin desfase UTC)", () => {
    expect(monthBounds("2026-03")).toEqual({ start: "2026-03-01", endExcl: "2026-04-01" });
  });

  it("monthBounds cubre diciembre y cruza el año", () => {
    expect(monthBounds("2026-12")).toEqual({ start: "2026-12-01", endExcl: "2027-01-01" });
  });

  it("monthBounds respeta febrero bisiesto 2028", () => {
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", endExcl: "2028-03-01" });
  });

  it("currentMonthLocal fija America/Santiago aunque el proceso corra en UTC", () => {
    // 2026-12-01T02:30Z = 30-nov 23:30 en Santiago → sigue siendo noviembre.
    expect(currentMonthLocal(new Date("2026-12-01T02:30:00Z"))).toBe("2026-11");
  });

  it("currentMonthLocal cambia a diciembre pasada la medianoche en Santiago", () => {
    // 2026-12-01T04:00Z = 01-dic 01:00 en Santiago → ya es diciembre.
    expect(currentMonthLocal(new Date("2026-12-01T04:00:00Z"))).toBe("2026-12");
  });

  it("shiftMonths ubica el inicio del ciclo anterior (20→20)", () => {
    expect(shiftMonths("2026-10-20", -1)).toBe("2026-09-20");
    expect(shiftMonths("2026-01-20", -1)).toBe("2025-12-20");
    expect(shiftMonths("2026-10-20", 1)).toBe("2026-11-20");
  });

  it("shiftMonths recorta el día al último del mes destino", () => {
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2024-03-31", -1)).toBe("2024-02-29");
  });
});
