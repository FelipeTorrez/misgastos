/**
 * Cache de clasificación por comercio — ahorra cupo del LLM.
 *
 * Puro, sin I/O: Map en memoria con TTL y tamaño máximo.
 * Clave = normalizeMerchant(merchant), así "Payu Uber", "PAYU UBER" y
 * "Payu Uber Las Condes CHL" comparten la misma entrada.
 *
 * Solo se guarda lo reutilizable del AgentOutput (category, merchant,
 * payment_method, direction, is_recurring_candidate, confidence).
 * NUNCA amount/date: son del movimiento actual y se toman del parser.
 */

import { normalizeMerchant } from "./merchantNorm.js";

export type CachedClassification = {
  category: string;
  merchant: string;
  payment_method: "debit_card" | "credit_card" | "transfer" | "cash" | "unknown";
  direction: "in" | "out" | "internal" | "none";
  is_recurring_candidate: boolean;
  confidence: number;
};

/** TTL default: 7 días. */
export const CLASSIFY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Tamaño máximo default: 500 entradas. */
export const CLASSIFY_CACHE_MAX_ENTRIES = 500;

let ttlMs = CLASSIFY_CACHE_TTL_MS;
let maxEntries = CLASSIFY_CACHE_MAX_ENTRIES;

type Entry = { value: CachedClassification; expiresAt: number };
const entries = new Map<string, Entry>();

function keyOf(raw: string | null | undefined): string {
  return normalizeMerchant(raw);
}

/** Hit → valor cacheado; miss o expirado → undefined. `now` inyectable para tests. */
export function get(key: string | null | undefined, now: number = Date.now()): CachedClassification | undefined {
  const k = keyOf(key);
  if (!k) return undefined;
  const e = entries.get(k);
  if (!e) return undefined;
  if (now > e.expiresAt) {
    entries.delete(k);
    return undefined;
  }
  return e.value;
}

/** Guarda bajo la clave normalizada; evicta la más antigua si se supera el máximo. */
export function set(key: string | null | undefined, value: CachedClassification, now: number = Date.now()): void {
  const k = keyOf(key);
  if (!k) return;
  if (entries.has(k)) entries.delete(k);
  else if (entries.size >= maxEntries) {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }
  entries.set(k, { value, expiresAt: now + ttlMs });
}

/** Invalida la entrada de un comercio (ej: al corregir su categoría). */
export function del(key: string | null | undefined): void {
  entries.delete(keyOf(key));
}

/** Vacía el cache completo. */
export function clear(): void {
  entries.clear();
}

/** Solo tests: limpia y opcionalmente ajusta TTL/máximo. */
export function __resetForTests(opts?: { ttlMs?: number; maxEntries?: number }): void {
  entries.clear();
  ttlMs = opts?.ttlMs ?? CLASSIFY_CACHE_TTL_MS;
  maxEntries = opts?.maxEntries ?? CLASSIFY_CACHE_MAX_ENTRIES;
}
