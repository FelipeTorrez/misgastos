/**
 * Bucket "Sin categoría" para la distribución por categoría.
 * PURO: sin imports de react-native (testeable en node/vitest).
 */

/** Clave especial para el bucket sin categoría (nunca es un category_id real). */
export const UNCATEGORIZED_KEY = "__uncategorized__";

/**
 * Suma de gastos sin category_id.
 * Incluye solo type='expense' con status distinto de 'duplicate'/'ignored'.
 */
export function uncategorizedSpent(txs: any[]): number {
  let total = 0;
  for (const t of txs ?? []) {
    if (t?.type !== "expense") continue;
    if (t?.status === "duplicate" || t?.status === "ignored") continue;
    if (t?.category_id) continue;
    const amount = Number(t?.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return total;
}

/**
 * Devuelve una copia de `byCat` con el bucket `__uncategorized__` agregado
 * cuando hay gasto sin categoría. Nunca muta el objeto original.
 */
export function withUncategorized(
  byCat: Record<string, number>,
  txs: any[]
): { byCat: Record<string, number>; uncategorized: number } {
  const uncategorized = uncategorizedSpent(txs);
  const next: Record<string, number> = { ...(byCat ?? {}) };
  if (uncategorized > 0) {
    next[UNCATEGORIZED_KEY] = uncategorized;
  }
  return { byCat: next, uncategorized };
}
