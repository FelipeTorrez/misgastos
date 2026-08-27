/**
 * MisGastos Design Tokens — fuente única de verdad visual.
 * Principio fintech: el color comunica ESTADO, nada más.
 */
export const C = {
  bg: "#0C1322",
  surface: "#182238",
  surfaceAlt: "#223052",
  border: "rgba(148,163,184,0.16)",
  primary: "#38BDF8",
  primarySoft: "rgba(56,189,248,0.15)",
  positive: "#34D399",
  negative: "#F87171",
  warning: "#FBBF24",
  text: "#F1F5F9",
  dim: "#94A3B8",
  faint: "#64748B",
  textDim: "#94A3B8",
  textFaint: "#64748B",
} as const;

export const R = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const T = {
  display: { fontSize: 36, fontWeight: "800" as const, color: C.text },
  h1: { fontSize: 22, fontWeight: "800" as const, color: C.text },
  h2: { fontSize: 16, fontWeight: "700" as const, color: C.text },
  body: { fontSize: 14, color: C.text },
  caption: { fontSize: 12, color: C.dim },
  label: { fontSize: 11, fontWeight: "600" as const, color: C.faint, letterSpacing: 0.6, textTransform: "uppercase" as const },
};

/** Estados de barra de progreso según % de presupuesto */
export function progressState(pct: number): "ok" | "warn" | "over" {
  if (pct >= 100) return "over";
  if (pct >= 70) return "warn";
  return "ok";
}
export const stateColor = (st: "ok" | "warn" | "over") =>
  st === "over" ? C.negative : st === "warn" ? C.warning : C.positive;

/** Alias para código que usa la convención `colors.x` (compatibilidad). */
export const colors = C;
/** Alias para código que usa la convención `type.x` (compatibilidad). */
export const type = T;

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/** "2026-08" → "Agosto 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MESES[(m ?? 1) - 1]} ${y}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
