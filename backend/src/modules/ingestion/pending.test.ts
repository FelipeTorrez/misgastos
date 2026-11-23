import { describe, it, expect } from "vitest";
import { enrichPending } from "./pending.js";

describe("enrichPending — raw_events pending con monto/comercio/fecha", () => {
  it("evento con monto: extrae parsed_amount, parsed_merchant y parsed_date", () => {
    const { rows, summary } = enrichPending([
      { id: "re-1", raw_content: "Compra por $12.500 en Jumbo con tarjeta terminada en 4321 - 24/08/2026 15:30 - Banco de Chile" },
    ]);
    expect(rows[0].parsed_amount).toBe(12500);
    expect(rows[0].parsed_merchant).toBe("Jumbo");
    expect(rows[0].parsed_date).toBe("2026-08-24");
    expect(rows[0].id).toBe("re-1"); // conserva la fila original
    expect(summary).toEqual({ count: 1, total: 12500, with_amount: 1 });
  });

  it("evento sin monto: parsed_amount null y no suma al total", () => {
    const { rows, summary } = enrichPending([
      { id: "re-2", raw_content: "Aviso: tu tarjeta fue bloqueada temporalmente" },
    ]);
    expect(rows[0].parsed_amount).toBeNull();
    expect(rows[0].parsed_merchant).toBeNull();
    expect(summary).toEqual({ count: 1, total: 0, with_amount: 0 });
  });

  it("raw_content de promo (sin monto) no rompe el enriquecimiento", () => {
    const { rows, summary } = enrichPending([
      { id: "re-3", raw_content: "Promo: 50% off en tu próxima compra, válido hasta 30/09/2026" },
    ]);
    expect(rows[0].parsed_amount).toBeNull();
    expect(summary.total).toBe(0);
    expect(summary.with_amount).toBe(0);
  });

  it("mezcla: suma solo los eventos con monto y tolera raw_content ausente", () => {
    const { rows, summary } = enrichPending([
      { id: "a", raw_content: "Compra por $32.990 en Lider - 24/08/2026" },
      { id: "b", raw_content: "Resumen mensual disponible" },
      { id: "c", raw_content: null },
      { id: "d", raw_content: "Compra por $5.000 en Uber Eats - 25/08/2026" },
    ]);
    expect(rows.map(r => r.parsed_amount)).toEqual([32990, null, null, 5000]);
    expect(summary).toEqual({ count: 4, total: 37990, with_amount: 2 });
  });

  it("lista vacía → summary en ceros", () => {
    expect(enrichPending([])).toEqual({ rows: [], summary: { count: 0, total: 0, with_amount: 0 } });
  });
});
