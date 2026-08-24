import { describe, it, expect } from "vitest";
import { parseCLP, formatCLP } from "./money.js";

describe("#1 Unit — money CLP", () => {
  it("parse $32.990", () => expect(parseCLP("$32.990")).toBe(32990));
  it("parse $ 250.000 con espacio", () => expect(parseCLP("$ 250.000")).toBe(250000));
  it("parse $7.490", () => expect(parseCLP("$7.490")).toBe(7490));
  it("parse $600.000", () => expect(parseCLP("$600.000")).toBe(600000));
  it("parse 1.000.000", () => expect(parseCLP("1.000.000")).toBe(1000000));
  it("parse vacío -> 0", () => expect(parseCLP("")).toBe(0));
  it("parse sin símbolo 32990", () => expect(parseCLP("32990")).toBe(32990));
  it("format 32990 contiene 32.990", () => expect(formatCLP(32990)).toContain("32.990"));
  it("format 0", () => expect(formatCLP(0)).toContain("0"));
  it("format 250000", () => expect(formatCLP(250000).replace(/\u00a0/g," ")).toContain("250"));
  it("roundtrip parse(format(x)) == x", () => {
    const n = 123990;
    expect(parseCLP(formatCLP(n))).toBe(n);
  });
});
