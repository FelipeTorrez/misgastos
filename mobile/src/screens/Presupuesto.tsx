import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { BudgetBar } from "../components/BudgetBar";
import { API_URL } from "../lib/supabase";

export function Presupuesto() {
  const [budgets, setBudgets] = useState<any[]>([]);
  useEffect(() => {
    const m = new Date().toISOString().slice(0,7)+"-01";
    fetch(`${API_URL}/v1/budgets?month=${m}`).then(r=>r.json()).then(setBudgets).catch(()=>{});
  }, []);
  const global = budgets.find(b=>!b.category_id);
  const cats = budgets.filter(b=>b.category_id);
  return (
    <ScrollView style={s.bg}>
      <Text style={s.title}>Presupuesto</Text>
      {global ? <BudgetBar name="Presupuesto global" spent={global.spent} total={global.amount} isGlobal /> :
        <Text style={s.muted}>Sin presupuesto global — créalo en API: POST /v1/budgets {`{"category_id":null,"amount":800000,"month":"2026-08-01"}`}</Text>}
      <Text style={s.h2}>Por categoría</Text>
      {cats.length===0 ? <Text style={s.muted}>Sin presupuestos por categoría</Text> :
        cats.map((b:any)=><BudgetBar key={b.id} name={b.categories?.name ?? b.category_id} spent={b.spent} total={b.amount} />)}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bg:{flex:1, backgroundColor:"#0b0e14", padding:16},
  title:{color:"#fff", fontSize:22, fontWeight:"800", marginBottom:12},
  h2:{color:"#fff", fontWeight:"700", marginTop:16, marginBottom:8},
  muted:{color:"#9ca3af", fontSize:13, marginBottom:10}
});
