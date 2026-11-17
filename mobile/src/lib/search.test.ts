import { describe, expect, it } from "vitest";
import { filterTxs, normText } from "./search";

const txs = [
  { id: "1", merchant: "Líder", counterparty: null },
  { id: "2", merchant: "Uber   Eats", counterparty: null },
  { id: "3", merchant: "Copec", counterparty: "Juan Pérez" },
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
});
