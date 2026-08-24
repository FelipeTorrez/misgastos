import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { Dashboard } from "./src/screens/Dashboard";
import { Movimientos } from "./src/screens/Movimientos";
import { Presupuesto } from "./src/screens/Presupuesto";
import { IngestionTest } from "./src/screens/IngestionTest";

const tabs = [
  { key: "inicio", label: "Inicio", comp: Dashboard },
  { key: "mov", label: "Movimientos", comp: Movimientos },
  { key: "pres", label: "Presupuesto", comp: Presupuesto },
  { key: "ingest", label: "Probar Email", comp: IngestionTest },
  { key: "cfg", label: "Config", comp: () => <View style={s.center}><Text style={s.muted}>Fase 3 — Ingestión Gmail (reenvío) → Fase 4 AI Agent</Text></View> }
] as const;

export default function App() {
  const [active, setActive] = useState("inicio");
  const Comp: any = tabs.find(t=>t.key===active)?.comp ?? Dashboard;
  return (
    <SafeAreaView style={s.bg}>
      <View style={{flex:1}}><Comp /></View>
      <View style={s.tabBar}>
        {tabs.map(t=>(
          <TouchableOpacity key={t.key} onPress={()=>setActive(t.key)} style={[s.tab, active===t.key && s.tabActive]}>
            <Text style={[s.tabText, active===t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  bg:{flex:1, backgroundColor:"#0b0e14"},
  tabBar:{flexDirection:"row", backgroundColor:"#111827", paddingVertical:8, borderTopWidth:1, borderTopColor:"#1f2937"},
  tab:{flex:1, alignItems:"center", paddingVertical:10, borderRadius:8, marginHorizontal:4},
  tabActive:{backgroundColor:"#1f2937"},
  tabText:{color:"#9ca3af", fontSize:12, fontWeight:"600"},
  tabTextActive:{color:"#fff"},
  center:{flex:1, alignItems:"center", justifyContent:"center", padding:24},
  muted:{color:"#9ca3af"}
});
