import { describe, expect, it } from "vitest";
import { shortDate, deltaPct } from "./format";

describe("shortDate", () => {
  it("mismo año → 'dd-mm' (5 chars)", () => {
    expect(shortDate("2026-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11");
  });

  it("otro año → mantiene el año", () => {
    expect(shortDate("2025-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11-2025");
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
