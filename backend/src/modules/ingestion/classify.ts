/**
 * Decisiones puras de la ingesta: tipo de transacción y status (chip que ve el
 * usuario en Movimientos). Sin Supabase, sin mockStore, sin efectos: solo
 * precedencia. ingestFromRaw las usa para la dedup y para el insert, de modo
 * que ambos caminos no puedan divergir.
 */

export type TypeInput = {
  aiType?: string | null;
  direction?: string | null;
  operation: string;
};

/**
 * La IA manda sobre la dirección inferida (transaction_type explícito). Si no
 * hay tipo de IA: direction 'in' → income, 'internal' → transfer, operación de
 * texto 'transfer' → transfer, resto → expense.
 */
export function resolveType(input: TypeInput): string {
  const { aiType, direction, operation } = input;
  if (aiType != null) return aiType;
  if (direction === "in") return "income";
  if (direction === "internal") return "transfer";
  if (operation === "transfer") return "transfer";
  return "expense";
}

export type StatusInput = {
  dedupFound: any | null;
  processorHit: boolean;
  classificationSource: string;
  aiConfidence: number;
  aiNeedsReview: boolean;
  providerFallback?: boolean;
};

/**
 * Semántica de status (lo que ve el usuario en los chips de Movimientos):
 *  - confirmed      → nadie tiene que hacer nada: la regla del usuario (determinista)
 *                     o una IA con confianza alta ya clasificaron.
 *  - pending_review → hay un motivo concreto para revisar: duplicado (se resuelve solo
 *                     con el original), procesador de pago (MG-013), IA en fallback
 *                     (MG-015) o IA que pidió revisión explícitamente.
 *  - pending_ai     → la IA respondió pero con confianza media: falta confirmación,
 *                     sin un motivo puntual que discutir.
 * Precedencia explícita: duplicate > procesador > fallback > needs_review > confirmado.
 */
export function resolveStatus(input: StatusInput): string {
  const { dedupFound, processorHit, classificationSource, aiConfidence, aiNeedsReview, providerFallback } = input;
  if (dedupFound) return "duplicate";
  if (processorHit) return "pending_review"; // MG-013: el banco trae al procesador, no al comercio
  if (classificationSource === "fallback" || providerFallback) return "pending_review"; // MG-015
  if (aiNeedsReview) return "pending_review";
  if (classificationSource === "rule") return "confirmed";
  if ((classificationSource === "ai" || classificationSource === "ai_cache") && aiConfidence >= 0.85) return "confirmed";
  return "pending_ai";
}
