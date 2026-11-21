/**
 * Ritmo real del ciclo 20→20: cuánto queda y cuánto se puede gastar por día
 * hasta el cierre. A diferencia de `budgetDetailLabel` (límite/días del ciclo,
 * promedio estático), esto usa el gasto ya realizado.
 * Todo en "YYYY-MM-DD", comparado de forma UTC como billingCycle.ts.
 */

import { cycleDays } from "./billingCycle";
import { todayYMD } from "./projection";

export type CyclePaceInput = {
  limit: number;
  spent: number;
  from: string;
  to: string;
  /** "YYYY-MM-DD". Por defecto: hoy local. */
  today?: string;
};

export type CyclePace = {
  /** limit - spent. Puede ser negativo. */
  remaining: number;
  /** Días desde hoy hasta `to`, ambos inclusive (último día = 1). */
  daysLeft: number;
  /** ceil(remaining / daysLeft); negativo si `overspent`. */
  perDay: number;
  overspent: boolean;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Devuelve null si el ciclo no tiene límite válido o si hoy está fuera del
 * rango [from, to] (ciclo futuro o ya cerrado): en esos casos "queda por día"
 * no tiene sentido.
 */
export function cyclePace({ limit, spent, from, to, today }: CyclePaceInput): CyclePace | null {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const t = today ?? todayYMD();
  if (!YMD.test(from) || !YMD.test(to) || !YMD.test(t)) return null;
  if (to < from) return null;
  if (t < from || t > to) return null;

  const daysLeft = cycleDays(t, to);
  if (!Number.isFinite(daysLeft) || daysLeft <= 0) return null;

  const safeSpent = Number.isFinite(spent) ? spent : 0;
  const remaining = limit - safeSpent;
  return {
    remaining,
    daysLeft,
    perDay: Math.ceil(remaining / daysLeft),
    overspent: remaining < 0,
  };
}
