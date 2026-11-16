/**
 * Cache en disco de resultados del harness de evaluación del clasificador.
 *
 * Sin dependencias (solo node:crypto/fs/path): guarda { predicted,
 * category_expected, ok, fallback, model, promptHash, ts } por clave
 * `rawEventId::model::promptHash`, así la 2ª corrida del harness no gasta
 * cuota de Groq. El promptHash invalida el cache cuando cambia el prompt o el
 * modelo (sin eso, comparar "antes vs después" mentiría).
 *
 * Puro en memoria + load/save explícitos a JSON; el script
 * `scripts/eval-classifier.ts` decide cuándo cargar y guardar.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type EvalCacheEntry = {
  predicted: string;
  category_expected: string;
  ok: boolean;
  fallback: boolean;
  model: string;
  promptHash: string;
  ts: number;
};

const store = new Map<string, EvalCacheEntry>();
let hits = 0;
let misses = 0;
let lastPath = "";

/** sha256 corto (12 hex) de prompt + modelo: cambia si cambia cualquiera. */
export function promptHash(promptText: string, model: string): string {
  return createHash("sha256").update(promptText + "\n" + model, "utf8").digest("hex").slice(0, 12);
}

/** Clave del caso: id del raw_event + modelo + hash del prompt. */
export function caseKey(rawEventId: string, model: string, phash: string): string {
  return `${rawEventId}::${model}::${phash}`;
}

/** Hit → entrada; miss → undefined. Cuenta para stats(). */
export function get(key: string): EvalCacheEntry | undefined {
  const e = store.get(key);
  if (e) hits++;
  else misses++;
  return e;
}

export function set(key: string, entry: EvalCacheEntry): void {
  store.set(key, entry);
}

/**
 * Carga el JSON de `filePath` al store en memoria. Retorna entradas válidas
 * cargadas. Archivo inexistente o corrupto → 0, sin lanzar (el harness sigue
 * clasificando y reconstruye el cache).
 */
export function load(filePath: string): number {
  lastPath = filePath;
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return 0;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (isEntry(v)) {
      store.set(k, v);
      n++;
    }
  }
  return n;
}

/** Persiste el store a `filePath` (default: último path de load). */
export function save(filePath: string = lastPath): void {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(store), null, 2), "utf8");
}

export function stats(): { entries: number; hits: number; misses: number } {
  return { entries: store.size, hits, misses };
}

/** Vacía el store y resetea contadores (tests). */
export function clear(): void {
  store.clear();
  hits = 0;
  misses = 0;
}

function isEntry(v: unknown): v is EvalCacheEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.predicted === "string" &&
    typeof e.category_expected === "string" &&
    typeof e.ok === "boolean" &&
    typeof e.fallback === "boolean" &&
    typeof e.model === "string" &&
    typeof e.promptHash === "string" &&
    typeof e.ts === "number"
  );
}
