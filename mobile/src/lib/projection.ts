/**
 * Proyección lineal de gasto al cierre del ciclo 20→20.
 * Todo en "YYYY-MM-DD", comparado de forma UTC como billingCycle.ts.
 */

export type ProjectionInput = {
  spent: number;
  from: string;
  to: string;
  /** "YYYY-MM-DD". Por defecto: hoy local. */
  today?: string;
};

export type Projection = {
  elapsedDays: number;
  totalDays: number;
  daysLeft: number;
  dailyAvg: number;
  projected: number;
};

function parse(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function ymdToMs(ymd: string): number {
  const { y, m, d } = parse(ymd);
  return Date.UTC(y, m - 1, d);
}

export function todayYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Proyecta el gasto al cierre: promedio diario × días totales.
 * Devuelve null si today está fuera del rango [from, to] (ciclo futuro o cerrado).
 * También devuelve null si elapsedDays < 3: con 1-2 días de muestra la
 * proyección lineal es ruido (ej. un gasto grande el día 1 extrapola un
 * cierre absurdo). Umbral mínimo de confianza = 3 días.
 */
export function projectCycle({ spent, from, to, today }: ProjectionInput): Projection | null {
  const t = today ?? todayYMD();
  const fromMs = ymdToMs(from);
  const toMsVal = ymdToMs(to);
  const todayMs = ymdToMs(t);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMsVal) || !Number.isFinite(todayMs)) return null;
  if (toMsVal < fromMs) return null;
  if (todayMs < fromMs || todayMs > toMsVal) return null;

  const totalDays = Math.round((toMsVal - fromMs) / 86400000) + 1;
  const elapsedDays = Math.round((todayMs - fromMs) / 86400000) + 1;
  if (totalDays <= 0 || elapsedDays <= 0) return null;
  if (elapsedDays < 3) return null;

  const safeSpent = Number.isFinite(spent) ? spent : 0;
  const daysLeft = totalDays - elapsedDays;
  const dailyAvg = safeSpent / elapsedDays;
  const projected = Math.round(dailyAvg * totalDays);
  return { elapsedDays, totalDays, daysLeft, dailyAvg, projected };
}
