import { View, Text, StyleSheet } from "react-native";
import { fmtCLP } from "../lib/format";
export function BalanceCard({ income, expense, balance }: { income: number; expense: number; balance: number }) {
  return (
    <View style={s.card}>
      <Text style={s.label}>Balance</Text>
      <Text style={[s.balance, { color: balance >= 0 ? "#10b981" : "#ef4444" }]}>{fmtCLP(balance)}</Text>
      <View style={s.row}>
        <Text style={s.income}>▲ {fmtCLP(income)}</Text>
        <Text style={s.expense}>▼ {fmtCLP(expense)}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: "#111827", padding: 20, borderRadius: 16, margin: 16 },
  label: { color: "#9ca3af", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  balance: { fontSize: 32, fontWeight: "800", marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  income: { color: "#34d399" }, expense: { color: "#f87171" }
});
