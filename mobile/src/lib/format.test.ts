import { describe, expect, it } from "vitest";
import { shortDate } from "./format";

describe("shortDate", () => {
  it("mismo año → 'dd-mm' (5 chars)", () => {
    expect(shortDate("2026-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11");
  });

  it("otro año → mantiene el año", () => {
    expect(shortDate("2025-11-15T12:00:00", new Date(2026, 2, 1))).toBe("15-11-2025");
  });
});
