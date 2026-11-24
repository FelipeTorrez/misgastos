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

/**
 * Desplaza una fecha "YYYY-MM-DD" en `delta` meses, recortando el día al
 * último del mes destino (2026-03-31 - 1 mes → 2026-02-28). Se usa para
 * ubicar el inicio del ciclo anterior (ej. 2026-10-20 → 2026-09-20).
 */
export function shiftMonths(date: string, delta: number): string {
  const [y, m, day] = date.split("-").map(Number);
  const total = y! * 12 + (m! - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  const nd = Math.min(day ?? 1, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** Días totales de un rango inclusive. */
export function rangeDays(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000) + 1;
}

/** Límites [start, endExcl) de un mes "YYYY-MM", todo en UTC. */
export function monthBounds(month: string): { start: string; endExcl: string } {
  const [y, m] = month.split("-").map(Number);
  const start = fmt(toDate(`${month}-01`));
  const endExcl = fmt(addDays(toDate(start), daysInMonth(y!, m!)));
  return { start, endExcl };
}

/**
 * Mes en curso "YYYY-MM" en la zona horaria de la app (America/Santiago),
 * independiente del TZ del proceso.
 * NO usar getFullYear()/getMonth() ni toISOString(): dependen del TZ del
 * proceso y Railway corre en UTC. Con TZ=UTC, el instante 2026-12-01T02:30Z
 * (= 30-nov 23:30 en Chile) devolvía '2026-12' en vez de '2026-11'.
 */
export function currentMonthLocal(
  now: Date = new Date(),
  tz: string = process.env.APP_TZ ?? "America/Santiago",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

/**
 * Hora de pared de la zona de la app (America/Santiago) para un instante real,
 * con la forma "YYYY-MM-DDTHH:mm:00Z" que reconoce `wallYMD` en mobile.
 *
 * Se usa cuando el correo/notificación no trae fecha: guardar `toISOString()`
 * (UTC) hacía que una compra a las 22:00 del 19-08 quedara como 20-08 y saltara
 * al ciclo siguiente (borde 20→20). Con esto el día guardado es el de Chile.
 * NO usar getHours()/toISOString(): dependen del TZ del proceso (Railway = UTC).
 */
export function chileWallStamp(
  now: Date = new Date(),
  tz: string = process.env.APP_TZ ?? "America/Santiago",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`;
}
