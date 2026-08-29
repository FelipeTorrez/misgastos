import { describe, it, expect } from "vitest";
import { GroqProvider } from "./GroqProvider.js";
import { AgentOutputSchema } from "./AIProvider.js";

describe("Phase 4 — AI Agent #1 (Groq) mock", () => {
  it("mock Lider -> alimentacion", async () => {
    const p = new GroqProvider();
    const out = await (p as any).mock({ normalized_text: "compra lider", parser_hints: { amount: 32990, merchant_guess: "Lider" }, categories: ["alimentacion","otros"], user_rules: [], locale: "es-CL" }, "test");
    expect(out.category).toBe("alimentacion");
    expect(AgentOutputSchema.safeParse(out).success).toBe(true);
  });
  it("mock Spotify -> suscripciones + recurring", async () => {
    const p = new GroqProvider();
    const out = await (p as any).mock({ normalized_text: "spotify", parser_hints: { amount: 7490, merchant_guess: "Spotify" }, categories: ["suscripciones","otros"], user_rules: [], locale: "es-CL" }, "test");
    expect(out.category).toBe("suscripciones");
    expect(out.is_recurring_candidate).toBe(true);
  });
  it("regla usuario prioriza: Spotify -> Entretenimiento", async () => {
    const p = new GroqProvider();
    const out = await (p as any).mock({ normalized_text: "spotify", parser_hints: { amount: 7490, merchant_guess: "Spotify" }, categories: ["suscripciones","entretenimiento"], user_rules: [{ merchant: "spotify", preferred_category: "entretenimiento" }], locale: "es-CL" }, "test");
    expect(out.category).toBe("entretenimiento");
  });
  it("sin amount -> needs_review", async () => {
    const p = new GroqProvider();
    const out = await (p as any).mock({ normalized_text: "hola", parser_hints: {}, categories: ["otros"], user_rules: [], locale: "es-CL" }, "test");
    expect(out.needs_review).toBe(true);
    expect(out.confidence).toBe(0.5);
  });
  it("schema validado — transferencia genérica", async () => {
    const p = new GroqProvider();
    const out = await (p as any).mock({ normalized_text: "transferencia", parser_hints: { amount: 250000, merchant_guess: "Transferencia" }, categories: ["otros"], user_rules: [], locale: "es-CL" }, "test");
    const parsed = AgentOutputSchema.safeParse(out);
    expect(parsed.success).toBe(true);
    // transferencia genérica sin dirección explícita → internal/transfer (neutro) o expense según mock conservador
    if (parsed.success) expect(["transfer","expense"]).toContain(parsed.data.transaction_type);
  });
});
