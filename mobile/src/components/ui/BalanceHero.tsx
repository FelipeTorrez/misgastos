import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { C } from "../../theme/tokens";
import { fmtCLP } from "../../lib/format";
import { CategoryCircle } from "./CategoryCircle";
import { MIcon } from "./MIcon";

/**
 * Hero fijo del shell: Total Gastos protagonista + Ingresos y Balance a la derecha
 * (Balance destacado, con más aire). Chip de filtro debajo.
 */
export function BalanceHero({ income, expense, balance, filterCategory, onClearFilter }: {
  income: number;
  expense: number;
  balance: number;
  filterCategory?: { id: string; label: string; slug: string } | null;
  onClearFilter?: () => void;
}) {
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.label}>Total Gastos</Text>
          <Text style={s.big}>{fmtCLP(expense)}</Text>
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
  big: { color: C.text, fontSize: 38, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
  right: { alignItems: "flex-end", gap: 14 },
  stat: { alignItems: "flex-end", gap: 2 },
  statLabel: { color: C.dim, fontSize: 11, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase" },
  statVal: { fontSize: 16, fontWeight: "800" },
  balanceLabel: { color: C.dim, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  balanceVal: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  chipWrap: { alignItems: "flex-start", marginTop: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipLabel: { color: C.text, fontWeight: "700", fontSize: 13 },
});
