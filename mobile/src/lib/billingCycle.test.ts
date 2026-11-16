import { describe, expect, it } from "vitest";
import { currentCycle, cycleDays, shiftCycle } from "./billingCycle";

describe("cycleDays", () => {
  it("ciclo 2026-10-20→2026-11-19 = 31 días", () => {
    expect(cycleDays("2026-10-20", "2026-11-19")).toBe(31);
  });

  it("cruce dic→ene 2026-12-20→2027-01-19 = 31 días", () => {
    expect(cycleDays("2026-12-20", "2027-01-19")).toBe(31);
  });

  it("febrero no bisiesto 2027-02-20→2027-03-19 = 28 días", () => {
    expect(cycleDays("2027-02-20", "2027-03-19")).toBe(28);
  });

  it("mismo día = 1 día", () => {
    expect(cycleDays("2027-01-19", "2027-01-19")).toBe(1);
  });
});

describe("currentCycle bordes", () => {
  it("2027-01-10 con corte 20 → 2026-12-20→2027-01-19", () => {
    expect(currentCycle(20, new Date(2027, 0, 10))).toEqual({
      from: "2026-12-20",
      to: "2027-01-19",
    });
  });
});

describe("shiftCycle bordes", () => {
  it("un ciclo adelante sobre 2026-12-20→2027-01-19", () => {
    expect(shiftCycle({ from: "2026-12-20", to: "2027-01-19" }, 1)).toEqual({
      from: "2027-01-20",
      to: "2027-02-19",
    });
  });
});
