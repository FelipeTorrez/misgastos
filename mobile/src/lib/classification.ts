export type ConfidenceBand = "alta" | "media" | "baja";

export interface ClassifiedTx {
  source?: string | null;
  confidence?: number | null;
  metadata?: {
    matched_rule?: { id?: string | null; merchant_normalized?: string | null } | null;
  } | null;
}

const SOURCE_LABELS: Record<string, string> = {
  ai: "IA",
  manual: "Manual",
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
/** Una regla o un gasto manual siempre son 100%: el porcentaje no aporta, se omite. */
export function provenanceLabel(tx: ClassifiedTx): string {
  const base = sourceLabel(tx?.source);
  if (tx?.source === "rule" || tx?.source === "manual") return base;
  const pct = formatConfidence(tx?.confidence);
  return pct ? `${base} ${pct}` : base;
}

/** true cuando el origen no es ai/rule/ai_cache/manual y merece revisión. */
export function needsAudit(tx: ClassifiedTx): boolean {
  const s = tx?.source;
  return s !== "ai" && s !== "rule" && s !== "ai_cache" && s !== "manual";
}

/**
 * Comercio normalizado de la regla que clasificó el gasto (metadata.matched_rule),
 * o null si lo clasificó otra vía / es un gasto previo a esta auditoría.
 */
export function ruleProvenance(tx: ClassifiedTx): string | null {
  const merchant = tx?.metadata?.matched_rule?.merchant_normalized;
  return typeof merchant === "string" && merchant.trim() ? merchant : null;
}
