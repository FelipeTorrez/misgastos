import { confidenceBand, needsAudit } from "./classification";

export interface AuditTx {
  source?: string | null;
  classification_source?: string | null;
  confidence?: number | null;
}

export interface ClassificationAudit {
  total: number;
  ai: number;
  rule: number;
  aiCache: number;
  fallback: number;
  sinClasificar: number;
  bajaConfianza: number;
  requierenRevision: number;
}

const SIN_CLASIFICAR = new Set(["ai_error", "no_amount", "ai_guard"]);

function norm(tx: AuditTx): { source?: string | null; confidence?: number | null } {
  return {
    source: tx?.source ?? tx?.classification_source ?? null,
    confidence: tx?.confidence ?? null,
  };
}

/**
 * Agregado de procedencia de la clasificación.
 * Reusa needsAudit/confidenceBand de classification.ts.
 */
export function classificationAudit(txs: AuditTx[]): ClassificationAudit {
  const list = Array.isArray(txs) ? txs : [];
  let ai = 0;
  let rule = 0;
  let aiCache = 0;
  let fallback = 0;
  let sinClasificar = 0;
  let bajaConfianza = 0;
  let requierenRevision = 0;

  for (const t of list) {
    const n = norm(t);
    const src = n.source ?? null;
    if (src === "ai") ai++;
    else if (src === "rule") rule++;
    else if (src === "ai_cache") aiCache++;
    else if (src === "fallback") fallback++;
    if (!src || SIN_CLASIFICAR.has(src)) sinClasificar++;
    if (confidenceBand(n.confidence) === "baja") bajaConfianza++;
    if (needsAudit(n)) requierenRevision++;
  }

  return {
    total: list.length,
    ai,
    rule,
    aiCache,
    fallback,
    sinClasificar,
    bajaConfianza,
    requierenRevision,
  };
}
