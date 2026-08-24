import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { useEffect, useState } from "react";
import { API_URL } from "../lib/supabase";
import { fmtCLP, fmtDate } from "../lib/format";
import { demoTransactions } from "../lib/demoData";

export function Movimientos() {
  const [txs, setTxs] = useState<any[]>([]);
  useEffect(() => { fetch(`${API_URL}/v1/transactions`).then(r=>r.json()).then(d=> setTxs(d.length? d : demoTransactions)).catch(()=> setTxs(demoTransactions)); }, []);
  return (
    <View style={s.bg}>
      <Text style={s.title}>Movimientos</Text>
      <FlatList data={txs} keyExtractor={i=>i.id} ListEmptyComponent={<Text style={s.muted}>Aún no hay movimientos. Usa + Agregar.</Text>}
        renderItem={({item})=>(
          <View style={s.row}>
            <View style={{flex:1}}>
              <Text style={s.merchant}>{item.merchant}</Text>
              <Text style={s.meta}>{fmtDate(item.date)} · {item.type}</Text>
            </View>
            <Text style={[s.amount, {color: item.type==="income"?"#34d399":"#fff"}]}>{item.type==="income"?"+":"-"}{fmtCLP(item.amount)}</Text>
          </View>
        )} />
      <TouchableOpacity style={s.fab} onPress={()=>{}}><Text style={s.fabText}>+ Agregar</Text></TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  bg:{flex:1, backgroundColor:"#0b0e14", padding:16},
  title:{color:"#fff", fontSize:22, fontWeight:"800", marginBottom:12},
  row:{backgroundColor:"#111827", padding:14, borderRadius:12, flexDirection:"row", alignItems:"center", marginBottom:8},
  merchant:{color:"#fff", fontWeight:"600"}, meta:{color:"#9ca3af", fontSize:12}, amount:{fontWeight:"800"},
  muted:{color:"#9ca3af", textAlign:"center", marginTop:40},
  fab:{position:"absolute", right:16, bottom:24, backgroundColor:"#10b981", paddingHorizontal:20, paddingVertical:14, borderRadius:28},
  fabText:{color:"#fff", fontWeight:"800"}
});
