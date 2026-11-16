import { describe, expect, it } from "vitest";
import { cycleDays } from "./billingCycle";

describe("cycleDays", () => {
  it("ciclo 2026-10-20→2026-11-19 = 31 días", () => {
    expect(cycleDays("2026-10-20", "2026-11-19")).toBe(31);
  });
});
