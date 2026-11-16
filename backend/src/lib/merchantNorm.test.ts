import { describe, it, expect } from "vitest";
import { normalizeMerchant, findBestRuleMatch } from "./merchantNorm.js";

describe("normalizeMerchant", () => {
  it("caso prod: relleno + ciudad + país → base", () => {
    expect(normalizeMerchant("MERPAGO LABALIZA       Las Condes    CHL")).toBe("merpago labaliza");
  });
  it("lowercase + colapsa espacios + trim", () => {
    expect(normalizeMerchant("  JUMBO   Costanera ")).toBe("jumbo costanera");
  });
  it("quita puntuación", () => {
    expect(normalizeMerchant("Café-Línea, S.A.")).toBe("café línea s a");
  });
  it("quita sufijos encadenados (comuna + país)", () => {
    expect(normalizeMerchant("Lider Providencia Chile")).toBe("lider");
    expect(normalizeMerchant("Jumbo, Las Condes, CHL")).toBe("jumbo");
  });
  it("no recorta palabras que solo terminan igual sin límite", () => {
    // "sacl" no es "cl" como palabra separada
    expect(normalizeMerchant("Sacl")).toBe("sacl");
  });
  it("nulo/vacío → vacío", () => {
    expect(normalizeMerchant(null)).toBe("");
    expect(normalizeMerchant("   ")).toBe("");
  });
});

describe("findBestRuleMatch", () => {
  const rules = (names: string[]) =>
    names.map((m, i) => ({ id: `r${i}`, merchant_normalized: m, preferred_category_id: "cat" }));

  it("match exacto tras normalizar", () => {
    const m = findBestRuleMatch("MERPAGO LABALIZA       Las Condes    CHL", rules(["merpago labaliza"]));
    expect(m?.merchant_normalized).toBe("merpago labaliza");
  });
  it("prefijo: merchant empieza con la regla", () => {
    const m = findBestRuleMatch("santa isabel providencia", rules(["santa isabel"]));
    expect(m?.merchant_normalized).toBe("santa isabel");
  });
  it("contiene: merchant contiene la regla", () => {
    const m = findBestRuleMatch("pago en linea restaurante central", rules(["linea restaurante"]));
    expect(m?.merchant_normalized).toBe("linea restaurante");
  });
  it("devuelve el match más largo", () => {
    const m = findBestRuleMatch("pedidos ya express costanera", rules(["pedidos ya", "pedidos ya express"]));
    expect(m?.merchant_normalized).toBe("pedidos ya express");
  });
  it("ignora reglas cortas (<6) para evitar falsos positivos", () => {
    expect(findBestRuleMatch("santander", rules(["san"]))).toBeNull();
    expect(findBestRuleMatch("santander", rules(["santa"]))).toBeNull();
  });
  it("sin match → null", () => {
    expect(findBestRuleMatch("copec", rules(["santa isabel"]))).toBeNull();
  });
});
