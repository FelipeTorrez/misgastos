import { describe, expect, it } from "vitest";
import { splitDescartados } from "./visibleTxs";

describe("splitDescartados", () => {
  it("sin descartados: todo queda en visibles", () => {
    const txs = [
      { id: "1", status: "confirmed" },
      { id: "2", status: "pending_review" },
      { id: "3", status: "corrected" },
    ];
    const { visibles, descartados } = splitDescartados(txs);
    expect(visibles.map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(descartados).toEqual([]);
  });

  it("1 duplicado + 1 ignorado se separan y se preserva el orden", () => {
    const txs = [
      { id: "1", status: "confirmed" },
      { id: "2", status: "duplicate", duplicate_of: "1" },
      { id: "3", status: "pending_review" },
      { id: "4", status: "ignored" },
    ];
    const { visibles, descartados } = splitDescartados(txs);
    expect(visibles.map((t) => t.id)).toEqual(["1", "3"]);
    expect(descartados.map((t) => t.id)).toEqual(["2", "4"]);
  });

  it("todos descartados: visibles queda vacío", () => {
    const txs = [
      { id: "1", status: "duplicate" },
      { id: "2", status: "ignored" },
    ];
    const { visibles, descartados } = splitDescartados(txs);
    expect(visibles).toEqual([]);
    expect(descartados.map((t) => t.id)).toEqual(["1", "2"]);
  });
});
