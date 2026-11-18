/**
 * Deduplicación §15 — evita que email + notificación + cartola creen 2 transacciones.
 * Criterios: amount, date (YYYY-MM-DD), merchant normalizado, type, ventana tiempo.
 *
 * CONVENCIÓN REAL DE `transactions.date` (no es UTC real):
 * ingestion/routes.ts escribe `${p.date}T${p.time ?? "12:00"}:00Z`, es decir, la hora
 * de pared de APP_TZ etiquetada con `Z` (p. ej. email "24/08/2026 15:30" →
 * `2026-08-24T15:30:00Z`). Mobile manda `T12:00:00Z` con la misma semántica
 * solo-fecha. Por eso la dedup compara `candidate.time` (hora de pared del
 * correo/notificación) contra `getUTCHours()/getUTCMinutes()` del `date`
 * guardado (= hora de pared), SIN convertir a zona local vía Intl/APP_TZ.
 * Si algún día se migra a UTC real hay que migrar datos y todos los
 * escritores juntos (ingesta + mobile), no solo este archivo.
 */

export type Candidate = {
  amount: number;
  date: string | null; // YYYY-MM-DD
  time?: string | null; // HH:MM
  merchant: string | null;
  type: string; // expense/income/transfer
  accountHint?: string | null;
};

export type Existing = {
  id: string;
  amount: number;
  date: string; // ISO
  merchant: string | null;
  type: string;
  account_id?: string | null;
  status: string;
};

function normalizeMerchant(m: string | null): string {
  return (m ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** T2: quita espacios, guiones y puntuación (solo quedan letras/números), lowercase. */
export function squashMerchant(m: string | null | undefined): string {
  return (m ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function sameDay(a: string | null, b: string): boolean {
  if (!a) return false;
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  return da === db;
}

function timeDiffMinutes(aTime: string | null | undefined, bDateIso: string): number | null {
  if (!aTime) return null;
  const [ah, am] = aTime.split(":").map(Number);
  // `bDateIso` es hora de pared etiquetada Z (ver header): se lee tal cual en UTC.
  const d = new Date(bDateIso);
  const bh = d.getUTCHours();
  const bm = d.getUTCMinutes();
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

function timeDiffSeconds(aTime: string | null | undefined, bDateIso: string): number | null {
  if (!aTime) return null;
  const [ah, am] = aTime.split(":").map(Number);
  // `bDateIso` es hora de pared etiquetada Z (ver header): se lee tal cual en UTC.
  const d = new Date(bDateIso);
  const bh = d.getUTCHours();
  const bm = d.getUTCMinutes();
  const bs = d.getUTCSeconds();
  return Math.abs(ah * 3600 + am * 60 - (bh * 3600 + bm * 60 + bs));
}

export function isDuplicate(candidate: Candidate, existing: Existing[], opts?: { windowMinutes?: number }): Existing | null {
  const windowMinutes = opts?.windowMinutes ?? 60;

  for (const e of existing) {
    if (e.status === "duplicate") continue; // no comparar contra duplicados
    if (e.amount !== candidate.amount) continue;
    if (e.type !== candidate.type) continue;
    if (!sameDay(candidate.date, e.date)) continue;
    // si tenemos hora, diferencia en minutos (T1/T2) y en segundos (T3)
    const diff =
      candidate.time && candidate.date ? timeDiffMinutes(candidate.time, e.date) : null;
    const candNorm = normalizeMerchant(candidate.merchant);
    const eNorm = normalizeMerchant(e.merchant);
    const hasMerchant = candNorm.length > 0 && eNorm.length > 0;
    // T1 (actual): merchant exacto o contenido + ventana 60 min
    // T2 (nuevo): merchant "squasheado" contenido (len >= 5) + ventana 15 min
    if (hasMerchant) {
      // merchant fuzzy: exact o contiene (Lider vs Lider Providencia)
      const merchantMatch =
        candNorm === eNorm ||
        eNorm.includes(candNorm) ||
        candNorm.includes(eNorm);
      if (merchantMatch && (diff === null || diff <= windowMinutes)) return e;
      const s1 = squashMerchant(candidate.merchant);
      const s2 = squashMerchant(e.merchant);
      if (
        s1.length >= 5 &&
        s2.length >= 5 &&
        (s1.includes(s2) || s2.includes(s1)) &&
        (diff === null || diff <= 15)
      )
        return e;
    }
    // T3 (nuevo): sin mirar merchant, |dt| <= 90 segundos.
    // Dos compras distintas del mismo monto en 90s son improbables;
    // el usuario puede desmarcar. Requiere hora en el candidato;
    // sin hora no hay dt que verificar (no matchea).
    // Si alguno de los dos merchants es null/vacío, solo aplica T3.
    if (candidate.time && candidate.date) {
      const sec = timeDiffSeconds(candidate.time, e.date);
      if (sec !== null && sec <= 90) return e;
    }
    // si ambos tienen accountHint/account_id y son distintos, no es duplicado (cuentas distintas)
    // (opcional, por ahora no bloquea)
  }
  return null;
}

// Score para futura UI "posible duplicado" (no usado en Phase 5 MVP)
export function duplicateScore(candidate: Candidate, existing: Existing): number {
  let score = 0;
  if (candidate.amount === existing.amount) score += 0.4;
  if (sameDay(candidate.date, existing.date)) score += 0.3;
  if (normalizeMerchant(candidate.merchant) === normalizeMerchant(existing.merchant)) score += 0.3;
  return Math.min(1, score);
}
