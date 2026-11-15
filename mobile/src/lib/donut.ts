/**
 * Geometría y reparto porcentual para el gráfico dona de Categorías.
 * PURO: sin imports de react-native (testeable en node/vitest).
 */

export type DonutItem = { key: string; label: string; value: number; color: string };

export type DonutSegment = DonutItem & {
  pct: number;
  fromDeg: number;
  toDeg: number;
  path: string;
};

/** Geometría fija del viewBox 200x200 usado por DonutChart. */
export const DONUT_CX = 100;
export const DONUT_CY = 100;
export const DONUT_R = 80;

function fmt(n: number): string {
  const v = Math.abs(n) < 0.0005 ? 0 : Math.round(n * 1000) / 1000;
  return String(v);
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  // 0° = arriba (12h), sentido horario.
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * Reparte 100 (enteros) proporcional a `values` por largest remainder (Hamilton).
 * Total 0 (o vacío / no finito) -> [].
 */
export function percentParts(values: number[]): number[] {
  if (values.length === 0) return [];
  const total = values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  const exact = values.map((v) => (Number.isFinite(v) && v > 0 ? (v / total) * 100 : 0));
  const floors = exact.map((e) => Math.floor(e));
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ frac: e - Math.floor(e), i }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && rest > 0; k++) {
    out[order[k]!.i]! += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Path SVG de arco circular de `fromDeg` a `toDeg` (grados, 0°=arriba, horario).
 * Si el arco mide >= 359.99° se parte en dos arcos para evitar el caso degenerado.
 */
export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const raw = toDeg - fromDeg;
  let delta = ((raw % 360) + 360) % 360;
  if (delta < 1e-9) delta = Math.abs(raw) < 1e-9 ? 0 : 360;

  const [sx, sy] = polar(cx, cy, r, fromDeg);

  if (delta >= 359.99) {
    const mid = fromDeg + delta / 2;
    const [mx, my] = polar(cx, cy, r, mid);
    const [ex, ey] = polar(cx, cy, r, fromDeg + delta);
    const halfLarge = delta / 2 > 180 ? 1 : 0;
    return (
      `M ${fmt(sx)} ${fmt(sy)} ` +
      `A ${fmt(r)} ${fmt(r)} 0 ${halfLarge} 1 ${fmt(mx)} ${fmt(my)} ` +
      `A ${fmt(r)} ${fmt(r)} 0 ${halfLarge} 1 ${fmt(ex)} ${fmt(ey)}`
    );
  }

  const [ex, ey] = polar(cx, cy, r, fromDeg + delta);
  const largeArc = delta > 180 ? 1 : 0;
  return `M ${fmt(sx)} ${fmt(sy)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} 1 ${fmt(ex)} ${fmt(ey)}`;
}

export type DonutOpts = { startDeg?: number; gapDeg?: number };

/**
 * Construye los segmentos de la dona. Ignora value<=0 o no finito.
 * gapDeg (default 1) deja separación entre segmentos; con un solo ítem
 * no se aplica gap y el segmento mide 360°.
 */
export function buildDonutSegments(items: DonutItem[], opts?: DonutOpts): DonutSegment[] {
  const valid = items.filter((it) => Number.isFinite(it.value) && it.value > 0);
  if (valid.length === 0) return [];
  const start = opts?.startDeg ?? 0;
  const gapRaw = opts?.gapDeg ?? 1;
  const gap = Number.isFinite(gapRaw) ? Math.max(0, gapRaw) : 1;

  const total = valid.reduce((a, b) => a + b.value, 0);
  const pcts = percentParts(valid.map((v) => v.value));

  const segs: DonutSegment[] = [];
  let cursor = start;

  if (valid.length === 1) {
    const it = valid[0]!;
    return [
      {
        ...it,
        pct: pcts[0] ?? 100,
        fromDeg: cursor,
        toDeg: cursor + 360,
        path: arcPath(DONUT_CX, DONUT_CY, DONUT_R, cursor, cursor + 360),
      },
    ];
  }

  for (let i = 0; i < valid.length; i++) {
    const it = valid[i]!;
    const sweep = (it.value / total) * 360;
    const fromDeg = cursor + gap / 2;
    let toDeg = cursor + sweep - gap / 2;
    if (toDeg < fromDeg) toDeg = fromDeg;
    segs.push({
      ...it,
      pct: pcts[i] ?? 0,
      fromDeg,
      toDeg,
      path: arcPath(DONUT_CX, DONUT_CY, DONUT_R, fromDeg, toDeg),
    });
    cursor += sweep;
  }
  return segs;
}
