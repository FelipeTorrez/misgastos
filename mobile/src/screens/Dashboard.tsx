import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { BalanceCard } from "../components/BalanceCard";
import { API_URL } from "../lib/supabase";
import { demoBalance } from "../lib/demoData";

export function Dashboard() {
  const [data, setData] = useState({ income: 0, expense: 0, balance: 0, weekly: [] as any[] });
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/v1/balance?month=${new Date().toISOString().slice(0,7)}`);
      if (r.ok) { setData(await r.json()); return; }
    } catch {}
    // fallback demo sin backend (Phase 2)
    const d = demoBalance();
    setData({ ...d, weekly: [{ week: "S1", balance: d.balance, income: d.income, expense: d.expense }] });
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <ScrollView style={s.bg} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async()=>{setRefreshing(true); await load(); setRefreshing(false);}}/>}>
      <Text style={s.title}>MisGastos</Text>
      <BalanceCard income={data.income} expense={data.expense} balance={data.balance} />
      <View style={s.card}>
        <Text style={s.h2}>Evolución semanal</Text>
        {data.weekly.length===0 ? <Text style={s.muted}>Sin datos este mes — agrega tu primer movimiento</Text> :
          data.weekly.map((w:any)=>(<Text key={w.week} style={s.muted}>{w.week}: {w.balance>=0?"+":""}{w.balance} CLP</Text>))}
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Próximo paso</Text>
        <Text style={s.muted}>Fase 1: registra ingreso/gasto manual y define presupuesto global + por categoría.</Text>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0b0e14" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", margin: 16 },
  card: { backgroundColor: "#111827", padding: 16, borderRadius: 12, marginHorizontal: 16, marginBottom: 12 },
  h2: { color: "#fff", fontWeight: "700", marginBottom: 6 },
  muted: { color: "#9ca3af", fontSize: 13 }
});
