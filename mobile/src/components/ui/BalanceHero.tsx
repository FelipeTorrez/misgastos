import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Svg, Circle, Polyline } from "react-native-svg";
import { C, T } from "../../theme/tokens";
import { fmtCLP, deltaPct } from "../../lib/format";
import { projectCycle } from "../../lib/projection";
import { sparklinePoints } from "../../lib/sparkline";
import { CategoryCircle } from "./CategoryCircle";
import { MIcon } from "./MIcon";

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const SPARK_W = 150;
const SPARK_H = 30;

/** "2026-11-19" → "19 nov" para la línea de proyección. */
function shortTo(ymd: string): string {
  const [_, m, d] = ymd.split("-").map(Number);
  return `${d} ${MESES_CORTO[m! - 1]}`;
}

/**
 * Hero fijo del shell: Total Gastos protagonista + Ingresos y Balance a la derecha
 * (Balance destacado, con más aire). Chip de filtro debajo.
 */
export function BalanceHero({ income, expense, balance, prevExpense, prevLabel, range, daily, filterCategory, onClearFilter }: {
  income: number;
  expense: number;
  balance: number;
  prevExpense?: number | null;
  prevLabel?: string | null;
  range?: { from: string; to: string } | null;
  /** Gasto por día del ciclo (12-20 puntos); sin datos no se dibuja tendencia. */
  daily?: number[] | null;
  filterCategory?: { id: string; label: string; slug: string } | null;
  onClearFilter?: () => void;
}) {
  const delta = prevExpense != null ? deltaPct(expense, prevExpense) : null;
  const proj = range ? projectCycle({ spent: expense, from: range.from, to: range.to }) : null;
  const spark = daily && daily.length > 1 && daily.some(v => v > 0) ? sparklinePoints(daily, SPARK_W, SPARK_H) : [];
  const sparkLine = spark.map(p => `${p.x},${p.y}`).join(" ");
  const sparkArea = spark.length
    ? `${spark[0]!.x},${SPARK_H} ${sparkLine} ${spark[spark.length - 1]!.x},${SPARK_H}`
    : "";
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.label}>Total Gastos</Text>
          <Text style={s.big}>{fmtCLP(expense)}</Text>
          {spark.length > 1 && (
            <View style={s.spark} accessibilityLabel="Gasto diario del ciclo">
              <Svg width={SPARK_W} height={SPARK_H}>
                <Polyline points={sparkArea} fill={C.primarySoft} stroke="none" />
                <Polyline
                  points={sparkLine}
                  fill="none"
                  stroke={C.primary}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Circle cx={spark[spark.length - 1]!.x} cy={spark[spark.length - 1]!.y} r={2.5} fill={C.primary} />
              </Svg>
            </View>
          )}
          {delta != null && (
            <Text style={[s.delta, { color: delta > 0 ? C.warning : delta < 0 ? C.positive : C.dim }]}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}% vs {prevLabel ?? "periodo anterior"}
            </Text>
          )}
          {proj && range && (
            <Text style={s.proj} numberOfLines={1} ellipsizeMode="tail">
              Proyección {shortTo(range.to)} · {fmtCLP(proj.projected)}
            </Text>
          )}
        </View>
        <View style={s.right}>
          <View style={s.stat}>
            <Text style={s.statLabel}>Ingresos</Text>
            <Text style={[s.statVal, { color: C.positive }]}>+ {fmtCLP(income)}</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.balanceLabel}>Balance</Text>
            <Text style={[s.balanceVal, { color: balance < 0 ? C.negative : C.positive }]}>{fmtCLP(balance)}</Text>
          </View>
        </View>
      </View>
      {filterCategory && (
        <View style={s.chipWrap}>
          <View style={s.chip}>
            <CategoryCircle slug={filterCategory.slug} size={20} />
            <Text style={s.chipLabel}>{filterCategory.label}</Text>
            <TouchableOpacity onPress={onClearFilter} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MIcon name="close" size={14} color={C.dim} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  row: { flexDirection: "row", alignItems: "flex-end" },
  label: { color: C.dim, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  big: { ...T.num, color: C.text, fontSize: 38, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  spark: { marginTop: 6 },
  delta: { fontSize: 13, fontWeight: "700", marginTop: 4 },
  proj: { ...T.num, color: C.dim, fontSize: 13, fontWeight: "600", marginTop: 2 },
  right: { alignItems: "flex-end", gap: 14 },
  stat: { alignItems: "flex-end", gap: 2 },
  statLabel: { color: C.dim, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  statVal: { ...T.num, fontSize: 16, fontWeight: "800" },
  balanceLabel: { color: C.dim, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  balanceVal: { ...T.num, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  chipWrap: { alignItems: "flex-start", marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipLabel: { color: C.text, fontWeight: "700", fontSize: 13 },
});
