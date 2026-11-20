/**
 * Herencia de límites al empezar un ciclo nuevo (eje 20→20).
 *
 * Los presupuestos de ciclo se guardan con month = fecha de inicio del ciclo.
 * Al cambiar de ciclo, GET /v1/budgets?from=<nuevo inicio>&to=<fin> ya no
 * encuentra filas y la pestaña Presupuestos queda vacía. Este helper calcula,
 * de forma pura, qué límites del ciclo anterior hay que copiar al nuevo.
 */

export type CarryBudgetRow = {
  category_id: string | null; // null = límite global
  amount: number;
  period: "cycle";
  month: string;
};

const GLOBAL_KEY = "::global";

function keyOf(categoryId: string | null): string {
  return categoryId ?? GLOBAL_KEY;
}

/**
 * Devuelve solo los límites del ciclo anterior que aún no existen en el ciclo
 * nuevo, sin duplicar categorías. No toca los que ya están (no los sobreescribe)
 * y descarta montos inválidos.
 *
 * @param prevBudgets    filas del ciclo anterior (month = inicio anterior)
 * @param currentBudgets filas ya existentes en el ciclo nuevo (month = newStart)
 * @param newStart       fecha de inicio del ciclo nuevo (YYYY-MM-DD)
 */
export function planCarryOver(
  prevBudgets: any[],
  currentBudgets: any[],
  newStart: string,
): CarryBudgetRow[] {
  const taken = new Set<string>();
  for (const b of currentBudgets ?? []) {
    if (!b || (b.period ?? "monthly") !== "cycle") continue;
    taken.add(keyOf(b.category_id ?? null));
  }

  const out: CarryBudgetRow[] = [];
  for (const b of prevBudgets ?? []) {
    if (!b || (b.period ?? "monthly") !== "cycle") continue;
    if (b.month === newStart) continue; // ya pertenece al ciclo nuevo
    const categoryId = b.category_id ?? null;
    const key = keyOf(categoryId);
    if (taken.has(key)) continue;
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    taken.add(key);
    out.push({ category_id: categoryId, amount: Math.round(amount), period: "cycle", month: newStart });
  }
  return out;
}
