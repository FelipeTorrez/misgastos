import { describe, it, expect } from "vitest";
import { parseEmail, normalizeForAI, __test__ } from "./parser.js";

describe("Phase 3 — Parser §14", () => {
  it("monto $32.990", () => expect(__test__.extractAmount("Compra por $32.990 en Lider")).toBe(32990));
  it("monto $45.000 con punto", () => expect(__test__.extractAmount("Compra por $45.000 en Test")).toBe(45000));
  it("monto $45000 sin punto (bug reportado)", () => expect(__test__.extractAmount("Compra por $45000 en Test")).toBe(45000));
  it("monto $45000 sin $ con Monto:", () => expect(__test__.extractAmount("Monto: $45000")).toBe(45000));
  it("monto $600.000", () => expect(__test__.extractAmount("$600.000")).toBe(600000));
  it("monto $1.000.000", () => expect(__test__.extractAmount("$1.000.000")).toBe(1000000));
  it("monto $250.000", () => expect(__test__.extractAmount("Monto: $250.000")).toBe(250000));
  it("monto con espacio $ 7.490", () => expect(__test__.extractAmount("$ 7.490")).toBe(7490));
  it("fecha 24/08/2026 -> 2026-08-24", () => expect(__test__.extractDate("24/08/2026 15:30")).toBe("2026-08-24"));
  it("fecha 2026-08-24 iso", () => expect(__test__.extractDate("2026-08-24")).toBe("2026-08-24"));
  it("hora 15:30", () => expect(__test__.extractTime("24/08/2026 15:30 hrs")).toBe("15:30"));
  it("banco Santander", () => expect(__test__.extractBank("Santander te informa compra")).toBe("Santander"));
  it("banco BCI", () => expect(__test__.extractBank("BCI: compra aprobada")).toBe("BCI"));
  it("last4 1234", () => expect(__test__.extractLast4("tarjeta terminada en 1234")).toBe("1234"));
  it("last4 ****1234", () => expect(__test__.extractLast4("****1234")).toBe("1234"));
  it("merchant Lider", () => expect(__test__.extractMerchant("Compra por $32.990 en Lider con tarjeta")).toBe("Lider"));
  it("merchant Comercio Jumbo", () => expect(__test__.extractMerchant("comercio: Jumbo")).toBe("Jumbo"));
  it("operation transfer", () => expect(__test__.detectOperation("Transferencia recibida $250.000")).toBe("transfer"));
  it("operation purchase", () => expect(__test__.detectOperation("Compra por $10.000")).toBe("purchase"));

  it("parseEmail completo Lider §37", () => {
    const p = parseEmail("Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30 - Banco Santander");
    expect(p.amount).toBe(32990);
    expect(p.merchant).toBe("Lider");
    expect(p.date).toBe("2026-08-24");
    expect(p.time).toBe("15:30");
    expect(p.bank).toBe("Santander");
    expect(p.last4).toBe("1234");
    expect(p.operation).toBe("purchase");
    expect(p.confidence).toBeGreaterThan(0.8);
  });

  it("parseEmail transferencia", () => {
    const p = parseEmail("Transferencia recibida Monto: $250.000 - 06/08/2026 - BancoEstado");
    expect(p.amount).toBe(250000);
    expect(p.operation).toBe("transfer");
  });

  it("parseEmail sin monto -> null", () => {
    const p = parseEmail("Hola, tu estado de cuenta");
    expect(p.amount).toBeNull();
    expect(p.confidence).toBe(0.5);
  });

  it("normalizeForAI trunca 500 y oculta RUT", () => {
    const raw = "RUT 12.345.678-9 " + "a".repeat(600);
    const n = normalizeForAI(raw);
    expect(n.length).toBeLessThanOrEqual(500);
    expect(n).toContain("[RUT]");
    expect(n).not.toContain("12.345.678-9");
  });

  // Muestras REALES de producción (Google Wallet, sender com.google.android.apps.walletnfcrel).
  // Ojo: el espacio después de CLP es NO SEPARABLE (\u00a0) en la mayoría de las muestras.
  const walletSamples: Array<[string, string, number]> = [
    ["COMERCIALIZADORA MUNDO CLP\u00a01,000 con CMR Mastercard Contactless ••6592", "Comercializadora Mundo", 1000],
    ["SABORES DEL CAMPO CLP\u00a09,000 con CMR Mastercard Contactless ••6592", "Sabores Del Campo", 9000],
    ["Santiago Baila Salsa CLP\u00a03,000 con CMR Mastercard Contactless ••6592", "Santiago Baila Salsa", 3000],
    ["RedGloba*BREAK CLP 5,200 con CMR Mastercard Contactless ••6592", "Redgloba Break", 5200],
    ["RedGloba*BREAK CLP\u00a05,200 con CMR Mastercard Contactless ••6592", "Redgloba Break", 5200],
    ["BEAUMONT Y OSORIO SPA CLP\u00a021,890 con CMR Mastercard Contactless ••6592", "Beaumont Y Osorio Spa", 21890],
  ];

  for (const [text, merchant, amount] of walletSamples) {
    it(`merchant + monto Google Wallet: ${text.replace(/\u00a0/g, "<NBSP>")}`, () => {
      const p = parseEmail(text);
      expect(p.merchant).toBe(merchant);
      expect(p.amount).toBe(amount);
    });
  }

  it("Google Wallet sin comercio (solo dígitos) -> null, no inventar", () => {
    expect(__test__.extractMerchant("12345 CLP\u00a01,000 con CMR Mastercard")).toBeNull();
  });

  it("control negativo: Falabella 'en <comercio>' sigue funcionando", () => {
    const p = parseEmail("Compraste $5.200 en RedGloba BREAK SANTIAGO CHL con tu tarjeta CMR");
    expect(p.merchant).toBe("RedGloba BREAK");
    expect(p.amount).toBe(5200);
  });

  it("control negativo: correo de marketing no devuelve comercio falso", () => {
    const p = parseEmail("¡Gana $25.000 con tu Cuenta Corriente!");
    expect(p.merchant).toBeNull();
  });

  it("pipeline §13: normalized -> parsed -> candidate", () => {
    const raw = "Compra por $32.990 en Lider - 24/08/2026";
    const normalized = normalizeForAI(raw);
    const parsed = parseEmail(raw);
    expect(normalized.length).toBeGreaterThan(10);
    expect(parsed.amount).toBe(32990);
    // candidate requeriría amount != null
    expect(parsed.amount !== null).toBe(true);
  });
});
