// Traduce los códigos internos de review_reason a instrucciones accionables.
// Los códigos crudos (p. ej. "ai_fallback:groq_429_tpd") son jerga del pipeline:
// el sufijo varía y no aporta nada al usuario, solo importa el prefijo.
const AI_FALLBACK_PREFIX = "ai_fallback:";

const FIXED: Record<string, string> = {
  payment_processor: "El banco no muestra el comercio real — elige la categoría",
  "ai_fallback:429": "IA saturada, clasifícalo tú",
  "ai_fallback:429_tpd": "IA saturada, clasifícalo tú",
  "ai_fallback:no_api_key": "Sin acceso a IA, clasifícalo tú",
};

const AI_FALLBACK_DEFAULT = "La IA no respondió, clasifícalo tú";

export function reviewReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const fixed = FIXED[code];
  if (fixed) return fixed;
  if (code.startsWith(AI_FALLBACK_PREFIX)) return AI_FALLBACK_DEFAULT;
  return null;
}
