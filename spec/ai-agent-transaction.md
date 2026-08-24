# AI Agent #1 — Transaction Intelligence Spec

## Objetivo (§16)
Convertir información no estructurada (email, notificación, PDF texto) en transacción estructurada validada.

## Responsabilidades
Extraer: amount, currency, merchant, date, account_hint, category, transaction_type, payment_method, installment, is_recurring_candidate, confidence, is_transfer_candidate, needs_review_reason.

## Input
```json
{
  "normalized_text": "Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30",
  "parser_hints": { "amount": 32990, "date": "2026-08-24", "merchant_guess": "Lider" },
  "categories": ["vivienda","supermercado","transporte",...],
  "user_rules": [{ "merchant": "spotify", "preferred_category": "suscripciones" }],
  "locale": "es-CL"
}
```
**NUNCA enviar:** raw email completo con headers sensibles, tokens, RUT completo, ni datos de otros usuarios.

## Output — JSON Schema (strict, §17)
```json
{
  "transaction_type": "expense | income | transfer",
  "amount": 32990,
  "currency": "CLP",
  "merchant": "Lider",
  "category": "supermercado",
  "date": "2026-08-24",
  "account_hint": "1234",
  "payment_method": "debit_card | credit_card | transfer | cash",
  "installment": null | { "number": 1, "total": 6, "original_amount": 600000 },
  "is_recurring_candidate": false,
  "is_transfer_candidate": false,
  "confidence": 0.97,
  "needs_review": false,
  "reason": null
}
```
Validación: Zod en backend, rechaza si no cumple schema. Texto libre no es fuente primaria.

## Reglas
- Si parser ya resolvió amount/date con regex confiable, IA no lo sobrescribe salvo contradicción + baja confianza parser.
- Abstención: si amount == null o merchant == null y confidence <0.6 → needs_review=true, category="otros", confidence 0.5
- Groq structured outputs con JSON Schema; fallback a prompt con ejemplo few-shot si provider no soporta strict.

## AIProvider Interface (§32)
```ts
interface AIProvider {
  classify(input: AgentInput): Promise<AgentOutput>;
}
class GroqProvider implements AIProvider {}
// Futuro: OpenAIProvider, GeminiProvider, LocalProvider
```

## Aprendizaje (§18)
Prioridad: Rule > AI. Flujo: Nuevo RawEvent -> normaliza merchant -> busca Rule exact match -> si existe, aplica y marca source=rule; si no, llama AI -> guarda. Corrección usuario crea/actualiza Rule.

## Costos
Parser primero (§14) reduce 60-70% llamadas IA. Cache por hash de texto normalizado.
