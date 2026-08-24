# AI Agent #2 — Financial Advisor Spec (Fase 9, post-MVP)

## Objetivo (§19)
Analizar datos estructurados acumulados y generar insights, sin modificar transacciones.

## Separación (§20)
Agent1: procesa datos (texto -> transacción). Agent2: interpreta datos (transacciones -> insight). Agent2 NUNCA ve raw email/notificación, solo transacciones confirmadas/corregidas + budgets.

## Inputs
- Transacciones últimos 90 días (agregadas por categoría, merchant, semana)
- Budgets y % utilizado
- Recurrencias detectadas
- No envía: raw_content, datos de otros usuarios

## Outputs (ejemplos §19)
- "Este mes gastaste 18% más en restaurantes vs promedio 3 meses"
- "Tu gasto en transporte aumentó respecto al promedio"
- "Detecté 3 gastos recurrentes (Spotify, Netflix, ChatGPT)"
- "Presupuesto entretenimiento al 85% a día 18, proyección agotamiento día 24"

## Restricciones
- Solo lectura, no escribe transacciones
- Insights con confianza y ventana temporal explícita
- Debe citar datos (ej: "$45.000 en 5 transacciones")
- Rate limit: 1 análisis/semana automático + on-demand

## Implementación futura
- Provider separado del Agent1 (puede ser GPT-4o o Gemini para reasoning)
- Evaluación con dataset sintético de 6 meses antes de activar
