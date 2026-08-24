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
