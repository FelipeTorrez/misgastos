import { describe, it, expect } from "vitest";
import { enrichPending, looksLikeTransaction } from "./pending.js";

describe("enrichPending — raw_events pending con monto/comercio/fecha", () => {
  it("evento con monto: extrae parsed_amount, parsed_merchant y parsed_date", () => {
    const { rows, summary } = enrichPending([
      { id: "re-1", raw_content: "Compra por $12.500 en Jumbo con tarjeta terminada en 4321 - 24/08/2026 15:30 - Banco de Chile" },
    ]);
    expect(rows[0].parsed_amount).toBe(12500);
    expect(rows[0].parsed_merchant).toBe("Jumbo");
    expect(rows[0].parsed_date).toBe("2026-08-24");
    expect(rows[0].id).toBe("re-1"); // conserva la fila original
    expect(summary).toEqual({ count: 1, total: 12500, with_amount: 1, total_transactions: 12500, promos: 0 });
  });

  it("evento sin monto: parsed_amount null y no suma al total", () => {
    const { rows, summary } = enrichPending([
      { id: "re-2", raw_content: "Aviso: tu tarjeta fue bloqueada temporalmente" },
    ]);
    expect(rows[0].parsed_amount).toBeNull();
    expect(rows[0].parsed_merchant).toBeNull();
    expect(rows[0].parsed_is_transaction).toBe(true);
    expect(summary).toEqual({ count: 1, total: 0, with_amount: 0, total_transactions: 0, promos: 0 });
  });

  it("raw_content de promo (sin monto) no rompe el enriquecimiento", () => {
    const { rows, summary } = enrichPending([
      { id: "re-3", raw_content: "Promo: 50% off en tu próxima compra, válido hasta 30/09/2026" },
    ]);
    expect(rows[0].parsed_amount).toBeNull();
    expect(summary.total).toBe(0);
    expect(summary.with_amount).toBe(0);
    expect(summary.total_transactions).toBe(0);
    expect(summary.promos).toBe(0);
  });

  it("mezcla: suma solo los eventos con monto y tolera raw_content ausente", () => {
    const { rows, summary } = enrichPending([
      { id: "a", raw_content: "Compra por $32.990 en Lider - 24/08/2026" },
      { id: "b", raw_content: "Resumen mensual disponible" },
      { id: "c", raw_content: null },
      { id: "d", raw_content: "Compra por $5.000 en Uber Eats - 25/08/2026" },
    ]);
    expect(rows.map(r => r.parsed_amount)).toEqual([32990, null, null, 5000]);
    expect(summary).toEqual({ count: 4, total: 37990, with_amount: 2, total_transactions: 37990, promos: 0 });
  });

  it("lista vacía → summary en ceros", () => {
    expect(enrichPending([])).toEqual({
      rows: [],
      summary: { count: 0, total: 0, with_amount: 0, total_transactions: 0, promos: 0 },
    });
  });
});

describe("enrichPending — promos de crédito no se suman como plata real (MG-084)", () => {
  it("aviso de compra CMR → transacción, $1.300", () => {
    const { rows, summary } = enrichPending([
      { id: "p-a", raw_content: "Compraste $1.300 en RedGloba BREAK         SANTIAGO      CHL Con tu CMR Mastercard Clasica terminada en 6592." },
    ]);
    expect(rows[0].parsed_amount).toBe(1300);
    expect(rows[0].parsed_is_transaction).toBe(true);
    expect(summary.total_transactions).toBe(1300);
    expect(summary.promos).toBe(0);
  });

  it("formato Google Wallet (empieza con el comercio) → transacción, $1.300", () => {
    const { rows, summary } = enrichPending([
      { id: "p-b", raw_content: "RedGloba*BREAK CLP 1,300 con CMR Mastercard Contactless ••6592" },
    ]);
    expect(rows[0].parsed_amount).toBe(1300);
    expect(rows[0].parsed_is_transaction).toBe(true);
    expect(summary.total_transactions).toBe(1300);
    expect(summary.promos).toBe(0);
  });

  it("crédito de consumo preaprobado → promo, no suma", () => {
    const { rows, summary } = enrichPending([
      { id: "p-c", raw_content: "Viajar, comprar o estudiar? Credito de Consumo Preaprobado de $27.680.000. Simula y contratalo desde App Mi Banco" },
    ]);
    expect(rows[0].parsed_amount).toBe(27680000);
    expect(rows[0].parsed_is_transaction).toBe(false);
    expect(summary.total_transactions).toBe(0);
    expect(summary.promos).toBe(1);
    expect(summary.total).toBe(27680000); // obsoleto: conservado tal cual
  });

  it("compra referencial en cuotas con CAE → promo, no suma", () => {
    const { rows, summary } = enrichPending([
      { id: "p-d", raw_content: "Ultimo dia! Aprovecha tasa automotriz de 0,99% y lleva tu compra referencial de $8.000.000 en 24 cuotas de $376.140, CAE: 12,68%" },
    ]);
    expect(rows[0].parsed_amount).toBe(8000000);
    expect(rows[0].parsed_is_transaction).toBe(false);
    expect(summary.total_transactions).toBe(0);
    expect(summary.promos).toBe(1);
  });

  it("aviso sin monto no rompe y suma 0", () => {
    const { rows, summary } = enrichPending([
      { id: "p-e", raw_content: "Ya tienes disponible tu ultimo estado de cuenta en la app" },
    ]);
    expect(rows[0].parsed_amount).toBeNull();
    expect(summary.total).toBe(0);
    expect(summary.total_transactions).toBe(0);
    expect(summary.promos).toBe(0);
  });

  it("looksLikeTransaction: default invertido (texto corto o sin marcadores → true)", () => {
    expect(looksLikeTransaction("")).toBe(true);
    expect(looksLikeTransaction("Compra")).toBe(true);
    expect(looksLikeTransaction("Credito de Consumo Preaprobado")).toBe(false);
  });
});
