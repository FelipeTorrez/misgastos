/**
 * Utilidades de ciclo de facturación (20→20) y rangos de fecha.
 * Todo en "YYYY-MM-DD", comparado de forma UTC para evitar desfase de zona horaria.
 */

export type DateRange = { from: string; to: string };

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function parse(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function build(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Suma `delta` meses a "YYYY-MM-DD" preservando el día (clampeado al fin de mes). */
export function shiftMonthStable(ymd: string, delta: number): string {
  const { y, m, d } = parse(ymd);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = ((idx % 12) + 12) % 12 + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return build(ny, nm, nd);
}

/** Suma `delta` días a "YYYY-MM-DD". */
export function shiftDays(ymd: string, delta: number): string {
  const { y, m, d } = parse(ymd);
  const t = new Date(Date.UTC(y, m - 1, d)).getTime() + delta * 86400000;
  const x = new Date(t);
  return build(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

/**
 * Ciclo actual para un día de corte `day` (1..28).
 * Si hoy es >= day → ciclo [day de este mes, day del próximo).
 * Si no → ciclo [day del mes anterior, day de este mes).
 * Devuelve desde y hasta INCLUSIVOS (el "to" es el día de corte menos 1).
 */
export function currentCycle(day: number, now: Date = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const dayStr = Math.min(day, daysInMonth(y, m));
  const from = d >= day ? build(y, m, dayStr) : shiftMonthStable(build(y, m, Math.min(day, daysInMonth(y, m))), -1);
  // toExclusive = from + 1 mes; to inclusivo = toExclusive - 1 día
  const toExcl = shiftMonthStable(from, 1);
  return { from, to: shiftDays(toExcl, -1) };
}

/** Mueve un rango un ciclo completo hacia adelante/atrás (delta en meses). */
export function shiftCycle(range: DateRange, delta: number): DateRange {
  return {
    from: shiftMonthStable(range.from, delta),
    to: shiftMonthStable(range.to, delta),
  };
}

function fmtShort(ymd: string): string {
  const { m, d } = parse(ymd);
  return `${d} ${MESES_CORTO[m - 1]}`;
}

/** "2026-08-20" → "20 ago" y rango → "20 ago — 19 sep 2026". */
export function rangeLabel(range: DateRange): string {
  const { from, to } = range;
  const fromY = from.slice(0, 4);
  const toY = to.slice(0, 4);
  if (fromY === toY) return `${fmtShort(from)} — ${fmtShort(to)} ${toY}`;
  return `${fmtShort(from)} ${fromY} — ${fmtShort(to)} ${toY}`;
}

/** Meses con su mes-número tocados por un rango (para UI). */
export function rangeMonths(range: DateRange): string[] {
  const out: string[] = [];
  let cur = range.from.slice(0, 7);
  const end = range.to.slice(0, 7);
  while (cur <= end) {
    out.push(cur);
    const [y, m] = cur.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    cur = next;
  }
  return out;
}
