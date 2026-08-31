import { AgentOutput, AgentInput, AgentOutputSchema } from "./AIProvider.js";
import { FINAN_SYSTEM_PROMPT, inferDirection } from "../prompts/agente-financiero.js";

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

    const system = FINAN_SYSTEM_PROMPT.replace("[CATEGORIES]", categories);

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
            { role: "user", content: user + "\n\nResponde SOLO con JSON válido según: {is_transaction, transaction_type, direction, amount, currency, merchant, counterparty, category, date, account_hint, payment_method, installment, is_recurring_candidate, is_transfer_candidate, confidence, needs_review, reason}" }
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

  private mock(input: AgentInput, fallbackReason: string): AgentOutput {
    const rawLow = input.normalized_text.toLowerCase();
    // Guard: promos / cupo / oferta sin consumo -> is_transaction=false con alta confianza
    // Incluye patrones de marketing bancario chileno: cuotas sin interés, permiso circulación, días baratísimos
    // No bloquear si hay verbo de consumo real (compra/pagaste) con monto → es compra en cuotas legítima
    const hasRealConsumptionVerb = /(compra|compraste|pagaste|consumo|te han transferido|recibiste|transferiste|enviaste|giro|cajero|retiro)/i.test(rawLow);
    const isPromoPattern = /(cupo.*aprobado|preaprobado|oferta|simula.*cr[eé]dito|tienes un nuevo cupo|solicita.*aqu[ií]|crédito aprobado|últimos días|permiso de circulación|d[ií]as barat[ií]simos|doble acum|continúan los mejores|encuentra miles de productos|paga tu.*cuotas|\b3\s*o\s*6\s*cuotas\b|cuotas sin interés|canjea|canje|d[oó]lares[ -]?premio|d[oó]lares tur[ií]sticos|travel days|ofertas imperdibles|descubre ofertas|sorteo|concurso|participa y gana|podr[ií]as ganar|hasta\s*\$?\s*[\d][\d.,]*|descuento|\bpremio\b|beneficio|bonificaci[oó]n|acumula|millas|puntos)/i.test(rawLow);
    if (isPromoPattern && !hasRealConsumptionVerb) {
      return {
        is_transaction: false,
        transaction_type: "none" as const,
        direction: "none" as const,
        amount: 0,
        currency: "CLP",
        merchant: "Desconocido",
        counterparty: null,
        category: "otros",
        date: input.parser_hints.date ?? new Date().toISOString().slice(0, 10),
        account_hint: null,
        payment_method: "unknown",
        installment: null,
        is_recurring_candidate: false,
        is_transfer_candidate: false,
        confidence: 0.95,
        needs_review: false,
        reason: "Mensaje promocional o informativo, no hay consumo",
      };
    }
    const amount = input.parser_hints.amount ?? 0;
    // Heurística categoría por merchant (para demo sin API)
    const m = (input.parser_hints.merchant_guess ?? input.normalized_text).toLowerCase();
    let category = "otros";
    if (/lider|jumbo|santa|unimarc|tottus/.test(m)) category = "alimentacion";
    else if (/uber|cabify|copec|shell|metro/.test(m)) category = "transporte";
    else if (/spotify|netflix|chatgpt|youtube|disney|icloud/.test(m)) category = "suscripciones";
    else if (/pedidos|rappi|starbucks|dominó|piojera|restaurant/.test(m)) category = "restaurantes";
    else if (/enel|aguas|movistar|vtr|wom|entel|gasco/.test(m)) category = "servicios";
    else if (/transferencia/.test(m)) category = "otros";

    // Reglas usuario tienen prioridad
    for (const r of input.user_rules) {
      if (m.includes(r.merchant.toLowerCase())) { category = r.preferred_category; break; }
    }

    // Extraer merchant del texto si el parser no lo encontró
    let merchant = input.parser_hints.merchant_guess;
    if (!merchant) {
      const KNOWN = ["Santa Isabel", "Pedidos Ya", "BancoEstado", "Lider", "Jumbo", "Unimarc", "Tottus", "Uber", "Cabify", "Copec", "Shell", "Spotify", "Netflix", "ChatGPT", "YouTube", "Disney", "iCloud", "Rappi", "Starbucks", "Enel", "Movistar", "Entel", "Falabella", "Ripley"];
      const lowText = input.normalized_text.toLowerCase();
      for (const km of KNOWN) {
        if (lowText.includes(km.toLowerCase())) { merchant = km; break; }
      }
    }

    // Dirección financiera (SDD §7): Finan decide in/out/internal, no solo /transferencia/
    const direction = inferDirection(input.normalized_text);
    let transaction_type: "expense" | "income" | "transfer" = "expense";
    let counterparty: string | null = null;
    let payment_method: AgentOutput["payment_method"] = "unknown";
    if (direction === "in") {
      transaction_type = "income";
      payment_method = "transfer";
      // counterparty: buscar "de <Nombre>" tras señal entrante
      const cp = input.normalized_text.match(/de\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})/i);
      if (cp) {
        const cand = cp[1].trim().split(/\s+/).slice(0, 3).join(" ");
        if (cand.length >= 3 && !/cuenta|banco|falabella|bci|santander/i.test(cand)) counterparty = cand.split(" ").map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ");
      }
      if (!merchant || merchant === "Desconocido") merchant = "Transferencia";
    } else if (direction === "internal") {
      transaction_type = "transfer";
      payment_method = "transfer";
      if (!merchant || merchant === "Desconocido") merchant = "Transferencia";
    } else {
      // out: compra/gasto o transferencia enviada
      const isTransferOut = /(transferiste|enviaste|transferencia (realizada|enviada))/.test(rawLow);
      if (isTransferOut) {
        payment_method = "transfer";
        if (!merchant || merchant === "Desconocido") merchant = "Transferencia";
        const cp = input.normalized_text.match(/a\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2})/i);
        if (cp) {
          const cand = cp[1].trim().split(/\s+/).slice(0, 3).join(" ");
          if (cand.length >= 3 && !/cuenta|banco/i.test(cand)) counterparty = cand.split(" ").map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ");
        }
      } else {
        payment_method = rawLow.includes("cmr") || rawLow.includes("mastercard") || rawLow.includes("visa") ? "credit_card" : "unknown";
      }
    }

    const isTransferCandidate = direction !== "out" || /(transferencia|transfirieron|transferiste|enviaste)/.test(rawLow);
    const needs_review = amount === 0 || (!merchant || merchant === "Desconocido" && !counterparty);
    let verdictReason: string;
    if (direction === "in") verdictReason = counterparty ? `Transferencia recibida de ${counterparty} → ingreso` : "Transferencia recibida → ingreso";
    else if (direction === "internal") verdictReason = "Traspaso entre cuentas propias → transferencia";
    else if (isTransferCandidate && transaction_type === "expense") {
      verdictReason = counterparty ? `Transferencia enviada a ${counterparty} → gasto` : "Transferencia enviada → gasto";
      // si es compra normal, sobrescribir
      if (!/(transferiste|enviaste)/.test(rawLow)) {
        verdictReason = rawLow.includes("compra") || rawLow.includes("pagaste") ? "Compra con tarjeta → gasto" : verdictReason;
      }
    } else verdictReason = rawLow.includes("compra") ? "Compra con tarjeta → gasto" : "Gasto → pendiente revisión";

    return {
      is_transaction: true,
      transaction_type,
      direction,
      amount: amount || 0,
      currency: "CLP",
      merchant: merchant ?? "Desconocido",
      counterparty,
      category,
      date: input.parser_hints.date ?? new Date().toISOString().slice(0, 10),
      account_hint: null,
      payment_method,
      installment: null,
      is_recurring_candidate: /spotify|netflix|chatgpt/.test(m),
      is_transfer_candidate: isTransferCandidate,
      confidence: needs_review ? 0.5 : 0.88,
      needs_review,
      reason: verdictReason.slice(0, 200),
    };
  }

  // Hook para tests y métrica
  public static inferDirection = inferDirection;

  // Export para tests unitarios sin instanciar
  public __test__ = { inferDirection };
}
