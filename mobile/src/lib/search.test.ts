import { describe, expect, it } from "vitest";
import { filterTxs, normText } from "./search";

const txs = [
  { id: "1", merchant: "Líder", counterparty: null },
  { id: "2", merchant: "Uber   Eats", counterparty: null },
  { id: "3", merchant: "Copec", counterparty: "Juan Pérez" },
];

const withAmounts = [
  { id: "a", merchant: "Jumbo", counterparty: null, amount: 12990 },
  { id: "b", merchant: "Líder", counterparty: null, amount: 4590 },
];

describe("normText", () => {
  it("minúsculas + sin diacríticos + espacios colapsados", () => {
    expect(normText("  LÍDER  ")).toBe("lider");
    expect(normText("Uber   Eats")).toBe("uber eats");
  });
});

describe("filterTxs", () => {
  it("'lider' encuentra 'Líder'", () => {
    expect(filterTxs(txs, "lider").map((t) => t.id)).toEqual(["1"]);
  });

  it("'uber eats' matchea merchant con espacios extra", () => {
    expect(filterTxs(txs, "uber eats").map((t) => t.id)).toEqual(["2"]);
  });

  it("busca también en counterparty", () => {
    expect(filterTxs(txs, "perez").map((t) => t.id)).toEqual(["3"]);
  });

  it("query vacía devuelve todo", () => {
    expect(filterTxs(txs, "")).toHaveLength(3);
    expect(filterTxs(txs, "   ")).toHaveLength(3);
  });

  it("'zzz' devuelve []", () => {
    expect(filterTxs(txs, "zzz")).toEqual([]);
  });

  it("'12990' encuentra el monto sin puntos", () => {
    expect(filterTxs(withAmounts, "12990").map((t) => t.id)).toEqual(["a"]);
  });

  it("'12.990' encuentra el monto con punto de miles", () => {
    expect(filterTxs(withAmounts, "12.990").map((t) => t.id)).toEqual(["a"]);
  });

  it("un token numérico matchea por prefijo de los dígitos", () => {
    expect(filterTxs(withAmounts, "12").map((t) => t.id)).toEqual(["a"]);
  });

  it("'99' no matchea 12990 (no es prefijo)", () => {
    expect(filterTxs(withAmounts, "99")).toEqual([]);
  });

  it("las queries de texto siguen funcionando con amount presente", () => {
    expect(filterTxs(withAmounts, "lider").map((t) => t.id)).toEqual(["b"]);
    expect(filterTxs(withAmounts, "jumbo").map((t) => t.id)).toEqual(["a"]);
  });

  it("mantiene el comportamiento previo de texto en txs sin amount", () => {
    expect(filterTxs(txs, "lider").map((t) => t.id)).toEqual(["1"]);
    expect(filterTxs(txs, "perez").map((t) => t.id)).toEqual(["3"]);
  });
});
