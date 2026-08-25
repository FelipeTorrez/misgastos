/**
 * Deduplicación §15 — evita que email + notificación + cartola creen 2 transacciones.
 * Criterios: amount, date (YYYY-MM-DD), merchant normalizado, type, ventana tiempo.
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

function sameDay(a: string | null, b: string): boolean {
  if (!a) return false;
  const da = a.slice(0, 10);
  const db = b.slice(0, 10);
  return da === db;
}

function timeDiffMinutes(aTime: string | null | undefined, bDateIso: string): number | null {
  if (!aTime) return null;
  const [ah, am] = aTime.split(":").map(Number);
  const b = new Date(bDateIso);
  const bh = b.getUTCHours(), bm = b.getUTCMinutes();
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

export function isDuplicate(candidate: Candidate, existing: Existing[], opts?: { windowMinutes?: number }): Existing | null {
  const windowMinutes = opts?.windowMinutes ?? 60;
  const candNorm = normalizeMerchant(candidate.merchant);

  for (const e of existing) {
    if (e.status === "duplicate") continue; // no comparar contra duplicados
    if (e.amount !== candidate.amount) continue;
    if (e.type !== candidate.type) continue;
    if (!sameDay(candidate.date, e.date)) continue;
    const eNorm = normalizeMerchant(e.merchant);
    // merchant fuzzy: exact o contiene (Lider vs Lider Providencia)
    const merchantMatch = candNorm === eNorm || (candNorm && eNorm && (eNorm.includes(candNorm) || candNorm.includes(eNorm)));
    if (!merchantMatch) continue;
    // si tenemos hora, verifica ventana
    if (candidate.time && candidate.date) {
      const diff = timeDiffMinutes(candidate.time, e.date);
      if (diff !== null && diff > windowMinutes) continue;
    }
    // si ambos tienen accountHint/account_id y son distintos, no es duplicado (cuentas distintas)
    // (opcional, por ahora no bloquea)
    return e;
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
