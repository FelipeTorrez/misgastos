import { describe, expect, it } from "vitest";
import { projectCycle } from "./projection";

const FROM = "2026-10-20";
const TO = "2026-11-18"; // 30 días

describe("projectCycle", () => {
  it("día 1: muestra insuficiente → null (sin proyección)", () => {
    expect(projectCycle({ spent: 50000, from: FROM, to: TO, today: FROM })).toBeNull();
  });

  it("día 2: muestra insuficiente → null (sin proyección)", () => {
    expect(projectCycle({ spent: 50000, from: FROM, to: TO, today: "2026-10-21" })).toBeNull();
  });

  it("día 3 (borde exacto): proyecta gasto × total/3", () => {
    const p = projectCycle({ spent: 30000, from: FROM, to: TO, today: "2026-10-22" });
    expect(p).not.toBeNull();
    expect(p!.elapsedDays).toBe(3);
    expect(p!.totalDays).toBe(30);
    expect(p!.daysLeft).toBe(27);
    expect(p!.dailyAvg).toBe(10000);
    expect(p!.projected).toBe(300000);
  });

  it("mitad de ciclo (día 15): proyecta el doble del gasto", () => {
    const p = projectCycle({ spent: 150000, from: FROM, to: TO, today: "2026-11-03" });
    expect(p).not.toBeNull();
    expect(p!.elapsedDays).toBe(15);
    expect(p!.totalDays).toBe(30);
    expect(p!.daysLeft).toBe(15);
    expect(p!.dailyAvg).toBe(10000);
    expect(p!.projected).toBe(300000);
  });

  it("penúltimo día (elapsed = total-1): todavía proyecta", () => {
    const p = projectCycle({ spent: 290000, from: FROM, to: TO, today: "2026-11-17" });
    expect(p).not.toBeNull();
    expect(p!.elapsedDays).toBe(29);
    expect(p!.totalDays).toBe(30);
    expect(p!.daysLeft).toBe(1);
    expect(p!.dailyAvg).toBe(10000);
    expect(p!.projected).toBe(300000);
  });

  it("último día (elapsed = total): ciclo cerrado → null (sin proyección)", () => {
    expect(projectCycle({ spent: 280000, from: FROM, to: TO, today: TO })).toBeNull();
  });

  it("today antes del ciclo → null (sin proyección)", () => {
    expect(projectCycle({ spent: 50000, from: FROM, to: TO, today: "2026-10-19" })).toBeNull();
  });

  it("today después del ciclo → null (ciclo cerrado)", () => {
    expect(projectCycle({ spent: 50000, from: FROM, to: TO, today: "2026-11-19" })).toBeNull();
  });

  it("ciclo pasado completo → null (sin proyección)", () => {
    expect(projectCycle({ spent: 250000, from: "2026-09-20", to: "2026-10-18", today: "2026-10-25" })).toBeNull();
  });

  it("ciclo de 31 días (2026-10-20→2026-11-19) día 3 proyecta ×31/3", () => {
    const p = projectCycle({ spent: 93000, from: "2026-10-20", to: "2026-11-19", today: "2026-10-22" });
    expect(p).not.toBeNull();
    expect(p!.totalDays).toBe(31);
    expect(p!.elapsedDays).toBe(3);
    expect(p!.projected).toBe(93000 * 31 / 3);
  });
});
