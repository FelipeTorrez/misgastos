import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { C, R, SP } from "../theme/tokens";
import { Category } from "../lib/categories";
import { CategoryCircle } from "../components/ui/CategoryCircle";
import { catIcon } from "../theme/categoryIcons";
import { Card, SectionHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Progress } from "../components/ui/Progress";
import { Amount } from "../components/ui/Amount";
import { fmtCLP } from "../lib/format";

export function toTitleCase(s: string) {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function Categorias({ txs, cats, byCat, onSelectCategory }: {
  txs: any[];
  cats: Category[];
  byCat: Record<string, number>;
  onSelectCategory?: (cat: Category) => void;
}) {
  const total = Object.values(byCat).reduce((a, b) => a + b, 0);
  const withSpent = cats
    .map(c => ({ ...c, spent: byCat[c.id] ?? 0 }))
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const recent = txs.slice().sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
      <Card style={s.distCard}>
        <Text style={s.distTitle}>Distribución por Categoría</Text>
        <Text style={s.distSub}>Toca una categoría para filtrar</Text>
        {withSpent.length === 0 ? (
          <EmptyState icon="view-grid" title="Sin gastos este mes" subtitle="Agrega tu primer movimiento para ver la distribución" />
        ) : (
          <View style={{ gap: 12, marginTop: 14 }}>
            {withSpent.map(c => (
              <TouchableOpacity key={c.id} onPress={() => onSelectCategory?.(c)} activeOpacity={0.7}>
                <View style={s.row}>
                  <CategoryCircle slug={c.slug} size={34} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={s.rowHead}>
                      <Text style={s.name}>{c.label}</Text>
                      <Text style={s.pct}>{Math.round((c.spent / total) * 100)}%</Text>
                    </View>
                    <Text style={s.amount}>{fmtCLP(c.spent)}</Text>
                    <View style={{ marginTop: 6 }}>
                      <Progress pct={total ? (c.spent / total) * 100 : 0} height={6} color={catIcon(c.slug).color} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Card>

      <SectionHeader title="Últimos movimientos" />
      {recent.length === 0 ? (
        <Card><Text style={s.muted}>Aún no hay movimientos este mes.</Text></Card>
      ) : (
        <View style={{ gap: 8 }}>
          {recent.map((t: any) => {
            const cat = cats.find(c => c.id === t.category_id);
            return (
              <Card key={t.id} style={s.movCard}>
                <CategoryCircle slug={cat?.slug} size={34} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.movMerchant}>{toTitleCase(t.merchant)}</Text>
                  <Text style={s.movMeta}>{cat?.label ?? "Sin categoría"} · {new Date(t.date).toLocaleDateString("es-CL")}</Text>
                </View>
                <Amount value={t.amount} tone={t.type === "income" ? "income" : "expense"} size="md" />
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  distCard: { padding: SP.lg } as any,
  distTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  distSub: { color: C.dim, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center" },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: C.text, fontWeight: "700", fontSize: 14 },
  pct: { color: C.dim, fontSize: 12, fontWeight: "600" },
  amount: { color: C.text, fontSize: 12, marginTop: 2 },
  muted: { color: C.dim, fontSize: 13 },
  movCard: { flexDirection: "row", alignItems: "center", padding: 12 } as any,
  movMerchant: { color: C.text, fontWeight: "600", fontSize: 14 },
  movMeta: { color: C.dim, fontSize: 12, marginTop: 2 },
});
