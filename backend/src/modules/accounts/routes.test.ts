import { describe, it, expect } from "vitest";
import { parseCLP, formatCLP } from "../../utils/money.js";

describe("money", () => {
  it("parse $32.990", () => expect(parseCLP("$32.990")).toBe(32990));
  it("format 32990", () => expect(formatCLP(32990)).toContain("32.990"));
});
