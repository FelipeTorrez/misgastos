import { describe, it, expect, afterEach } from "vitest";
import { GroqProvider } from "./GroqProvider.js";
import { AgentOutputSchema } from "./AIProvider.js";

const _origFetch = globalThis.fetch;

afterEach(() => {
  (globalThis as any).fetch = _origFetch;
  delete (process.env as any).GROQ_API_KEY;
});

function validLLMContent() {
  return JSON.stringify({
    is_transaction: true, transaction_type: "expense", direction: "out",
    amount: 32990, currency: "CLP", merchant: "Lider", counterparty: null,
    category: "alimentacion", date: "2026-08-24", account_hint: null,
    payment_method: "credit_card", installment: null,
    is_recurring_candidate: false, is_transfer_candidate: false,
    confidence: 0.92, needs_review: false, reason: "Compra con tarjeta → gasto",
  });
}

const baseInput = {
  normalized_text: "compra lider 32990",
  parser_hints: { amount: 32990, merchant_guess: "Lider" },
  categories: ["alimentacion", "otros"], user_rules: [], locale: "es-CL",
};

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
  it("body incluye max_tokens<=1000", async () => {
    const bodies: any[] = [];
    (globalThis as any).fetch = async (_url: any, opts: any) => {
      bodies.push(JSON.parse(opts.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: validLLMContent() } }] }) } as any;
    };
    const p = new GroqProvider();
    (p as any).apiKey = "test-key";
    await p.classify(baseInput as any);
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0].max_tokens).toBeLessThanOrEqual(1000);
  });
  it("429 => fallback visible sin excepción (retry una vez)", async () => {
    let calls = 0;
    (globalThis as any).fetch = async () => {
      calls++;
      return { ok: false, status: 429, headers: { get: () => "0" }, text: async () => "Rate limit OTPM Limit 1000" } as any;
    };
    const p = new GroqProvider();
    (p as any).apiKey = "test-key";
    const out = await p.classify(baseInput as any);
    expect(calls).toBe(2);
    expect((out as any).provider_fallback).toMatch(/429/);
    expect(AgentOutputSchema.safeParse(out).success).toBe(true);
  });
});
