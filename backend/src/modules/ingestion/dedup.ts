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

import { createHash } from "node:crypto";

export type Candidate = {
  amount: number;
  date: string | null; // YYYY-MM-DD
  time?: string | null; // HH:MM
  merchant: string | null;
  type: string; // expense/income/transfer
  accountHint?: string | null;
  category_id?: string | null;
  source?: string | null;
  confidence?: number | null;
};

export type Existing = {
  id: string;
  amount: number;
  date: string; // ISO
  merchant: string | null;
  type: string;
  account_id?: string | null;
  status: string;
  category_id?: string | null;
  source?: string | null;
  confidence?: number | null;
  metadata?: any;
};

function normalizeMerchant(m: string | null): string {
  return (m ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** T2: quita espacios, guiones y puntuación (solo quedan letras/números), lowercase. */
export function squashMerchant(m: string | null | undefined): string {
  return (m ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export type DedupKeyInput = {
  amount: number | null | undefined;
  type: string | null | undefined;
  merchant: string | null | undefined;
  date?: string | null; // YYYY-MM-DD (o ISO con la fecha primero)
  time?: string | null; // HH:MM (hora de pared del texto)
  receivedAt?: string | null; // ISO de llegada; fallback cuando el texto no trae hora
};

/** "15:3" / "15:30" / "15:30:12" → "15:30"; inválido → null. */
function minuteOfDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** Fecha YYYY-MM-DD del encabezado del string; inválida → null. */
function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Día + minuto de un ISO. Se lee en UTC igual que el resto de esta carpeta
 * (convención: hora de pared etiquetada con Z, ver header).
 */
function minuteOfIso(value: string | null | undefined): { day: string; minute: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    day: d.toISOString().slice(0, 10),
    minute: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  };
}

/**
 * Clave atómica anti-duplicado concurrente (migración 008).
 *
 * `isDuplicate` es `leer → comparar → insertar`: dos peticiones en paralelo
 * (Wallet + Falabella del mismo pago, 38 ms de diferencia) leen las últimas
 * transacciones antes de que la otra inserte y ninguna se ve. Esta huella viaja
 * a la fila y el índice único `transactions(user_id, dedup_key)` hace que la
 * segunda inserción choque (23505) aunque ninguna haya visto a la otra.
 *
 * Huella = md5(amount | type | merchant_normalizado | YYYY-MM-DD HH:MM), con
 * ventana de 1 minuto: más estricta que los 60 min de `isDuplicate`, así que dos
 * compras del mismo monto el mismo día a horas distintas no colisionan. El
 * merchant va "squasheado" (sin espacios ni puntuación) para que
 * "RedGloba*BREAK" y "Redgloba Break" caigan en la misma clave.
 *
 * Si el texto no trae hora se usa el minuto de `receivedAt` (dos notificaciones
 * simultáneas del mismo pago caen en el mismo minuto igual). Sin hora ni
 * `receivedAt` devuelve null: esa fila no participa del índice y queda sólo con
 * la dedup en memoria.
 */
export function dedupKey(input: DedupKeyInput): string | null {
  const amount = input.amount;
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const type = (input.type ?? "").trim().toLowerCase();
  if (!type || type === "none") return null;
  const fromIso = minuteOfIso(input.receivedAt ?? null);
  const day = dayOf(input.date) ?? fromIso?.day ?? null;
  const minute = minuteOfDay(input.time) ?? fromIso?.minute ?? null;
  if (!day || !minute) return null;
  const material = `${Math.round(amount)}|${type}|${squashMerchant(input.merchant)}|${day} ${minute}`;
  return createHash("md5").update(material, "utf8").digest("hex");
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

/**
 * Calidad de la clasificación para decidir quién sobrevive en una dedup.
 * Una regla del usuario (conocimiento explícito) manda sobre la IA; entre
 * clasificaciones del mismo origen/peso gana la de mayor confianza.
 */
export type ClassificationInfo = {
  category_id?: string | null;
  source?: string | null;
  confidence?: number | null;
  merchant?: string | null;
};

function sourceRank(source: string | null | undefined): number {
  const s = (source ?? "").toLowerCase();
  if (s === "manual") return 3; // clasificación humana: intocable
  if (s === "rule") return 2;
  if (s === "ai" || s === "ai_cache") return 1;
  return 0;
}

export function isBetterClassification(candidate: ClassificationInfo, survivor: ClassificationInfo): boolean {
  const cRank = sourceRank(candidate.source);
  const sRank = sourceRank(survivor.source);
  if (cRank !== sRank) return cRank > sRank;
  // Mismo origen (o ambos sin origen conocido): gana mayor confidence.
  return (candidate.confidence ?? 0) > (survivor.confidence ?? 0);
}

/** true si el merchant del candidato dice más que el del superviviente. */
export function isMoreSpecificMerchant(candidate: string | null | undefined, survivor: string | null | undefined): boolean {
  const c = normalizeMerchant(candidate ?? null);
  const s = normalizeMerchant(survivor ?? null);
  if (!c || c === s) return false;
  // Placeholder genérico: cualquier merchant concreto es mejor.
  if (!s || s === "desconocido" || s === "transferencia") return true;
  // Extensión del mismo comercio ("Frida Kahlo" → "Frida Kahlo Providencia").
  return c.length > s.length && (c.includes(s) || s.includes(c));
}

/**
 * Patch a aplicar al superviviente cuando el candidato trae mejor
 * clasificación. null = no tocar nada: el superviviente ya es mejor, empatan,
 * o el usuario corrigió a mano (status='corrected', intocable).
 */
export function betterClassificationPatch(
  candidate: ClassificationInfo,
  survivor: ClassificationInfo & { status?: string | null },
): Record<string, any> | null {
  if (survivor.status === "corrected") return null; // nunca pisar una corrección manual
  if (!isBetterClassification(candidate, survivor)) return null;
  const patch: Record<string, any> = {};
  if (candidate.category_id) patch.category_id = candidate.category_id;
  if (candidate.source) patch.source = candidate.source;
  if (candidate.confidence !== undefined && candidate.confidence !== null) patch.confidence = candidate.confidence;
  if (isMoreSpecificMerchant(candidate.merchant, survivor.merchant)) patch.merchant = candidate.merchant;
  return Object.keys(patch).length ? patch : null;
}

// Score para futura UI "posible duplicado" (no usado en Phase 5 MVP)
export function duplicateScore(candidate: Candidate, existing: Existing): number {
  let score = 0;
  if (candidate.amount === existing.amount) score += 0.4;
  if (sameDay(candidate.date, existing.date)) score += 0.3;
  if (normalizeMerchant(candidate.merchant) === normalizeMerchant(existing.merchant)) score += 0.3;
  return Math.min(1, score);
}
