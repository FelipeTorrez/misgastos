import { View, Text, StyleSheet } from "react-native";
import { fmtCLP } from "../lib/format";
export function BudgetBar({ name, spent, total, isGlobal }: { name: string; spent: number; total: number; isGlobal?: boolean }) {
  const pct = Math.min(100, Math.round((spent / total) * 100));
  const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#10b981";
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={[s.name, isGlobal && s.global]}>{isGlobal ? "🌐 " : ""}{name}</Text>
        <Text style={s.pct}>{pct}%</Text>
      </View>
      <View style={s.track}><View style={[s.fill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={s.detail}>{fmtCLP(spent)} / {fmtCLP(total)} · queda {fmtCLP(total - spent)}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { padding: 14, backgroundColor: "#1f2937", borderRadius: 12, marginBottom: 10 },
  head: { flexDirection: "row", justifyContent: "space-between" },
  name: { color: "#fff", fontWeight: "600" }, global: { fontWeight: "800" },
  pct: { color: "#9ca3af" },
  track: { height: 8, backgroundColor: "#374151", borderRadius: 4, marginTop: 8, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  detail: { color: "#9ca3af", fontSize: 12, marginTop: 6 }
});
