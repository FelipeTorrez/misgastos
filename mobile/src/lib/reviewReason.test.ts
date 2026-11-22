import { describe, expect, it } from "vitest";
import { reviewReasonLabel } from "./reviewReason";

describe("reviewReasonLabel", () => {
  it("payment_processor → acción concreta y sin jerga", () => {
    expect(reviewReasonLabel("payment_processor")).toBe(
      "El banco no muestra el comercio real — elige la categoría"
    );
  });

  it("ai_fallback:429_tpd → IA saturada sin sufijo crudo", () => {
    expect(reviewReasonLabel("ai_fallback:429_tpd")).toBe("IA saturada, clasifícalo tú");
  });

  it("ai_fallback:429 → IA saturada", () => {
    expect(reviewReasonLabel("ai_fallback:429")).toBe("IA saturada, clasifícalo tú");
  });

  it("ai_fallback:no_api_key → sin acceso a IA", () => {
    expect(reviewReasonLabel("ai_fallback:no_api_key")).toBe("Sin acceso a IA, clasifícalo tú");
  });

  it("ai_fallback con sufijo desconocido → texto genérico, sin imprimir el sufijo", () => {
    expect(reviewReasonLabel("ai_fallback:otro")).toBe("La IA no respondió, clasifícalo tú");
  });

  it("null y vacío → null (no se muestra nada)", () => {
    expect(reviewReasonLabel(null)).toBe(null);
    expect(reviewReasonLabel(undefined)).toBe(null);
    expect(reviewReasonLabel("")).toBe(null);
  });
});
