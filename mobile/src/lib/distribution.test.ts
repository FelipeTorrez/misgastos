import { describe, expect, it } from "vitest";
import { UNCATEGORIZED_KEY, uncategorizedSpent, withUncategorized } from "./distribution";

describe("uncategorizedSpent", () => {
  it("gasto sin categoría se cuenta", () => {
    const txs = [{ type: "expense", status: "posted", category_id: null, amount: 25000 }];
    expect(uncategorizedSpent(txs)).toBe(25000);
  });

  it("gasto sin category_id undefined también se cuenta", () => {
    const txs = [{ type: "expense", amount: 1000 }];
    expect(uncategorizedSpent(txs)).toBe(1000);
  });

  it("gasto con categoría no se cuenta", () => {
    const txs = [{ type: "expense", status: "posted", category_id: "cat-1", amount: 5000 }];
    expect(uncategorizedSpent(txs)).toBe(0);
  });

  it("income se excluye aunque no tenga categoría", () => {
    const txs = [{ type: "income", status: "posted", category_id: null, amount: 99999 }];
    expect(uncategorizedSpent(txs)).toBe(0);
  });

  it("status duplicate/ignored se excluyen", () => {
    const txs = [
      { type: "expense", status: "duplicate", category_id: null, amount: 1000 },
      { type: "expense", status: "ignored", category_id: null, amount: 2000 },
      { type: "expense", status: "posted", category_id: null, amount: 3000 },
    ];
    expect(uncategorizedSpent(txs)).toBe(3000);
  });
});

describe("withUncategorized", () => {
  it("agrega la clave especial y reporta el monto", () => {
    const byCat = { "cat-1": 10000 };
    const txs = [{ type: "expense", status: "posted", category_id: null, amount: 25000 }];
    const { byCat: next, uncategorized } = withUncategorized(byCat, txs);
    expect(uncategorized).toBe(25000);
    expect(next[UNCATEGORIZED_KEY]).toBe(25000);
    expect(next["cat-1"]).toBe(10000);
  });

  it("sin gasto sin categoría no agrega la clave", () => {
    const byCat = { "cat-1": 10000 };
    const txs = [{ type: "expense", status: "posted", category_id: "cat-1", amount: 10000 }];
    const { byCat: next, uncategorized } = withUncategorized(byCat, txs);
    expect(uncategorized).toBe(0);
    expect(UNCATEGORIZED_KEY in next).toBe(false);
  });

  it("no muta el byCat original", () => {
    const byCat = { "cat-1": 10000 };
    const txs = [{ type: "expense", status: "posted", category_id: null, amount: 500 }];
    withUncategorized(byCat, txs);
    expect(byCat).toEqual({ "cat-1": 10000 });
    expect(UNCATEGORIZED_KEY in byCat).toBe(false);
  });
});
