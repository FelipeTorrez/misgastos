/**
 * Helpers puros de rango de fechas (ciclo de facturación 20→20).
 * Fechas en formato "YYYY-MM-DD". Se comparan de forma UTC para evitar desfase
 * de zona horaria (mismo criterio que el resto del proyecto).
 */

export function toDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
}

export function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

/** Días totales del mes (m = 1..12). */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type MonthOverlap = { month: string; overlapDays: number; totalDays: number; ratio: number };

/**
 * Meses tocados por [from, to] (inclusive), con el solape en días de cada mes.
 * Ej: from=2026-08-20, to=2026-09-19 →
 *   [{month:"2026-08-01", overlapDays:12, totalDays:31, ratio:12/31},
 *    {month:"2026-09-01", overlapDays:19, totalDays:30, ratio:19/30}]
 */
export function monthOverlaps(from: string, to: string): MonthOverlap[] {
  const start = toDate(from);
  const end = toDate(to);
  const out: MonthOverlap[] = [];
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth() + 1;
    const monthStart = cur.getTime();
    const monthEnd = new Date(Date.UTC(y, m, 0)).getTime();
    const oStart = Math.max(start.getTime(), monthStart);
    const oEnd = Math.min(end.getTime(), monthEnd);
    const overlapDays = Math.round((oEnd - oStart) / 86400000) + 1;
    const totalDays = daysInMonth(y, m);
    out.push({
      month: `${y}-${String(m).padStart(2, "0")}-01`,
      overlapDays,
      totalDays,
      ratio: overlapDays / totalDays,
    });
    cur = new Date(Date.UTC(y, m, 1));
  }
  return out;
}

/** Días totales de un rango inclusive. */
export function rangeDays(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000) + 1;
}
