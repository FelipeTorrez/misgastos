export const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Día de pared "YYYY-MM-DD" de un `date` de transacción, distinguiendo
 *  INSTANTE UTC real de HORA DE PARED por la FORMA del string (no por prefijo).
 *
 *  Productores reales:
 *  - backend ingestion/routes.ts:331 escribe `${date}T${time}:00Z` (hora de pared)
 *    solo cuando la notificación trae fecha u hora; si no trae ninguna escribe
 *    `new Date().toISOString()` (instante UTC real, siempre con milisegundos).
 *  - mobile escribe `T12:00:00Z` (hora de pared, sin milisegundos, segundos 00).
 *
 *  Criterio (la forma distingue porque `toISOString()` siempre emite `.sss`):
 *  (a) /^\d{4}-\d{2}-\d{2}$/ → día tal cual;
 *  (b) /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(Z|\+00:00)$/ (sin milisegundos y con
 *      segundos exactamente 00) → hora de pared: slice(0, 10);
 *  (c) cualquier otra forma (milisegundos, offset distinto de +00:00,
 *      segundos != 00) → instante real: YYYY-MM-DD en America/Santiago vía
 *      Intl.DateTimeFormat('en-CA'), sin depender del TZ del proceso.
 */
export function wallYMD(iso: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(Z|\+00:00)$/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Fecha de pared "dd-mm-yyyy" para `date` de transacción (ver `wallYMD`).
 *  `fmtDate` queda intacto solo para timestamps reales de recepción
 *  (p. ej. rawEvent.received_at). */
export function fmtWallDate(iso: string): string {
  const ymd = wallYMD(iso);
  if (!ymd) return fmtDate(iso);
  const [y, m, d] = ymd.split("-");
  return `${d}-${m}-${y}`;
}

/** Etiqueta de detalle de un presupuesto ("de $X · ...").
 * - cycle: "de $M · límite del ciclo (≈$/día)".
 * - partial con coveredDays: "de $M · C de T días (≈$/día)" dividiendo por coveredDays (NO por cycleN).
 * - mensual completo: "de $M (≈$/día)" solo si cycleN>0, sin repetir "en N días".
 * - `opts.perDay === false` (default true) omite el sufijo "(≈$/día)" en todas las ramas:
 *   se usa cuando la fila ya muestra una línea de ritmo con el $/día real.
 */
export type BudgetLabelInput = {
  amount: number;
  period?: string;
  partial?: boolean;
  coveredDays?: number | null;
  totalDays?: number | null;
};

export type BudgetLabelOpts = { perDay?: boolean };

export function budgetDetailLabel(b: BudgetLabelInput, cycleN: number, opts?: BudgetLabelOpts): string {
  const perDay = opts?.perDay !== false;
  const amount = fmtCLP(b.amount);
  if (b.period === "cycle") {
    const base = `de ${amount} · límite del ciclo`;
    if (perDay && cycleN > 0) return `${base} (≈${fmtCLP(Math.round(b.amount / cycleN))}/día)`;
    return base;
  }
  if (b.partial && b.coveredDays != null && b.coveredDays > 0) {
    const days = b.totalDays != null ? `${b.coveredDays} de ${b.totalDays} días` : null;
    if (!perDay) return days ? `de ${amount} · ${days}` : `de ${amount}`;
    const perDayAmount = fmtCLP(Math.round(b.amount / b.coveredDays));
    if (days) return `de ${amount} · ${days} (≈${perDayAmount}/día)`;
    return `de ${amount} (≈${perDayAmount}/día)`;
  }
  if (perDay && cycleN > 0) return `de ${amount} (≈${fmtCLP(Math.round(b.amount / cycleN))}/día)`;
  return `de ${amount}`;
}

/** Variación % del gasto actual vs ciclo anterior. null si no hay base válida. */
export function deltaPct(current: number, prev: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prev)) return null;
  if (prev <= 0) return null;
  return Math.round(((current - prev) / prev) * 100);
}

/** Fecha corta para la línea meta de Movimientos: "dd-mm" si es del año en curso, "dd-mm-yyyy" si no.
 *  Usa el día de pared (`wallYMD`), no el día UTC ni el del TZ del proceso. */
export function shortDate(iso: string, now: string | number | Date = new Date()): string {
  const ymd = wallYMD(iso);
  const ref = new Date(now);
  if (!ymd || Number.isNaN(ref.getTime())) return fmtDate(iso);
  const [y, m, d] = ymd.split("-");
  if (Number(y) === ref.getFullYear()) {
    return `${d}-${m}`;
  }
  return `${d}-${m}-${y}`;
}
