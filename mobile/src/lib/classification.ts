export type ConfidenceBand = "alta" | "media" | "baja";

export interface ClassifiedTx {
  source?: string | null;
  confidence?: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
  ai: "IA",
  rule: "Regla",
  ai_cache: "IA (cache)",
  fallback: "Respaldo sin IA",
  parser: "Parser",
  ai_error: "Sin clasificar",
  no_amount: "Sin clasificar",
  ai_guard: "Sin clasificar",
};

export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "Sin clasificar";
  return SOURCE_LABELS[source] ?? "Sin clasificar";
}

export function confidenceBand(confidence: number | null | undefined): ConfidenceBand | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  if (confidence >= 0.85) return "alta";
  if (confidence >= 0.6) return "media";
  return "baja";
}

function formatConfidence(confidence: number | null | undefined): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return `${Math.round(confidence * 100)}%`;
}

/** Etiqueta de procedencia: "IA 95%", "Regla", "Respaldo sin IA", ... */
export function provenanceLabel(tx: ClassifiedTx): string {
  const base = sourceLabel(tx?.source);
  const pct = formatConfidence(tx?.confidence);
  return pct ? `${base} ${pct}` : base;
}

/** true cuando el origen no es ai/rule/ai_cache y merece revisión. */
export function needsAudit(tx: ClassifiedTx): boolean {
  const s = tx?.source;
  return s !== "ai" && s !== "rule" && s !== "ai_cache";
}
