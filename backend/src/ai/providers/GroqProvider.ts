import { AgentOutput, AgentInput, AgentOutputSchema } from "./AIProvider.js";

// Groq via OpenAI-compatible API con structured outputs (JSON Schema)
// Docs: https://console.groq.com/docs/text-chat#json-mode
export class GroqProvider {
  private apiKey = process.env.GROQ_API_KEY ?? "";
  private model = process.env.GROQ_MODEL ?? "llama-3.1-70b-versatile";

  async classify(input: AgentInput): Promise<AgentOutput> {
    if (!this.apiKey) return this.mock(input, "no_api_key");

    const categories = input.categories.join(", ");
    const rulesHint = input.user_rules.length
      ? `Reglas usuario (prioridad): ${input.user_rules.map(r => `${r.merchant}→${r.preferred_category}`).join("; ")}`
      : "Sin reglas";

    const system = `Eres Transaction Intelligence (Agente #1). Convierte texto financiero chileno no estructurado en JSON ESTRICTO según schema.
- Usa parser_hints si son confiables, pero corrige si el texto contradice.
- merchant: nombre corto normalizado (ej "Lider", "Spotify").
- category: elige SOLO de [${categories}] (usa "otros" si dudas).
- amount: CLP entero sin puntos, debe coincidir con texto o hints.
- Si amount es null o no hay monto claro, pon confidence 0.4 y needs_review true.
- Respeta reglas usuario si merchant coincide.
- No inventes datos. JSON solo.`;

    const user = JSON.stringify({
      normalized_text: input.normalized_text.slice(0, 500),
      parser_hints: input.parser_hints,
      categories: input.categories,
      rules_hint: rulesHint,
      locale: input.locale,
    });

    // Intentar Groq con response_format json_object + validar con Zod
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user + "\n\nResponde SOLO con JSON válido según: {transaction_type, amount, currency, merchant, category, date, account_hint, payment_method, installment, is_recurring_candidate, is_transfer_candidate, confidence, needs_review, reason}" }
          ],
        }),
      });
      if (!res.ok) throw new Error(`groq ${res.status} ${await res.text().then(t=>t.slice(0,300))}`);
      const j: any = await res.json();
      const content = j.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      // Validación Zod estricta
      const validated = AgentOutputSchema.safeParse(parsed);
      if (!validated.success) throw new Error("zod: " + JSON.stringify(validated.error.flatten()));
      return validated.data;
    } catch (e: any) {
      // Fallback mock con razón
      return this.mock(input, e.message?.slice(0, 120) ?? "groq_error");
    }
  }

  private mock(input: AgentInput, reason: string): AgentOutput {
    const amount = input.parser_hints.amount ?? 0;
    // Heurística categoría por merchant (para demo sin API)
    const m = (input.parser_hints.merchant_guess ?? input.normalized_text).toLowerCase();
    let category = "otros";
    if (/lider|jumbo|santa|unimarc|tottus/.test(m)) category = "supermercado";
    else if (/uber|cabify|copec|shell|metro/.test(m)) category = "transporte";
    else if (/spotify|netflix|chatgpt|youtube|disney|icloud/.test(m)) category = "suscripciones";
    else if (/pedidos|rappi|starbucks|dominó|piojera|restaurant/.test(m)) category = "restaurantes";
    else if (/enel|aguas|movistar|vtr|wom|entel|gasco/.test(m)) category = "servicios";
    else if (/transferencia/.test(m)) category = "otros";

    // Reglas usuario tienen prioridad
    for (const r of input.user_rules) {
      if (m.includes(r.merchant.toLowerCase())) { category = r.preferred_category; break; }
    }

    const needs_review = amount === 0 || !input.parser_hints.merchant_guess;
    return {
      transaction_type: /transferencia/.test(m) ? "transfer" : "expense",
      amount: amount || 0,
      currency: "CLP",
      merchant: input.parser_hints.merchant_guess ?? "Desconocido",
      category,
      date: input.parser_hints.date ?? new Date().toISOString().slice(0, 10),
      account_hint: null,
      payment_method: "unknown",
      installment: null,
      is_recurring_candidate: /spotify|netflix|chatgpt/.test(m),
      is_transfer_candidate: /transferencia/.test(m),
      confidence: needs_review ? 0.5 : 0.88,
      needs_review,
      reason: reason.slice(0, 200),
    };
  }
}
