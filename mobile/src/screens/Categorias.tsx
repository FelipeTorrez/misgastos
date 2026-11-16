import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { C, R, SP } from "../theme/tokens";
import { Category } from "../lib/categories";
import { CategoryCircle } from "../components/ui/CategoryCircle";
import { catIcon } from "../theme/categoryIcons";
import { Card, SectionHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Progress } from "../components/ui/Progress";
import { Amount } from "../components/ui/Amount";
import { DonutChart } from "../components/ui/DonutChart";
import { buildDonutSegments } from "../lib/donut";
import { UNCATEGORIZED_KEY, withUncategorized } from "../lib/distribution";
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
  const { byCat: fullByCat, uncategorized } = withUncategorized(byCat, txs);
  const total = Object.values(fullByCat).reduce((a, b) => a + b, 0);
  const [view, setView] = useState<"barras" | "dona">("barras");
  const withSpent = cats
    .map(c => ({ ...c, spent: fullByCat[c.id] ?? 0 }))
    .filter(c => c.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const donutItems = [
    ...withSpent.map(c => ({ key: c.id, label: c.label, value: c.spent, color: catIcon(c.slug).color })),
    ...(uncategorized > 0
      ? [{ key: UNCATEGORIZED_KEY, label: "Sin categoría", value: uncategorized, color: C.dim }]
      : []),
  ];
  const donutSegments = buildDonutSegments(donutItems);
  const byId = new Map(withSpent.map(c => [c.id, c]));
  const recent = txs.slice().sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
      <Card style={s.distCard}>
        <Text style={s.distTitle}>Distribución por Categoría</Text>
        <Text style={s.distSub}>Toca una categoría para filtrar</Text>
        <View style={s.toggle}>
          {(["barras", "dona"] as const).map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => setView(v)}
              activeOpacity={0.7}
              accessibilityLabel={v === "barras" ? "Barras" : "Dona"}
              accessibilityRole="button"
              style={[s.pill, view === v && s.pillActive]}
            >
              <Text style={[s.pillText, view === v && s.pillTextActive]}>
                {v === "barras" ? "Barras" : "Dona"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {donutSegments.length === 0 ? (
          <EmptyState icon="view-grid" title="Sin gastos este mes" subtitle="Agrega tu primer movimiento para ver la distribución" />
        ) : view === "dona" ? (
          <View style={{ marginTop: 14 }}>
            <DonutChart
              segments={donutSegments}
              centerValue={fmtCLP(total)}
              centerLabel="Total"
              onPressSegment={(key) => { if (key === UNCATEGORIZED_KEY) return; const c = byId.get(key); if (c) onSelectCategory?.(c); }}
            />
            <View style={{ gap: 8, marginTop: 14 }}>
              {donutSegments.map(seg => {
                if (seg.key === UNCATEGORIZED_KEY) {
                  return (
                    <View key={seg.key} style={s.legendRow}>
                      <View style={[s.dot, { backgroundColor: seg.color }]} />
                      <Text style={s.name}>{seg.label}</Text>
                      <Text style={s.pct}>{seg.pct}%</Text>
                      <Text style={s.legendAmount}>{fmtCLP(seg.value)}</Text>
                    </View>
                  );
                }
                const c = byId.get(seg.key)!;
                return (
                  <TouchableOpacity key={seg.key} onPress={() => onSelectCategory?.(c)} activeOpacity={0.7}>
                    <View style={s.legendRow}>
                      <View style={[s.dot, { backgroundColor: seg.color }]} />
                      <Text style={s.name}>{seg.label}</Text>
                      <Text style={s.pct}>{seg.pct}%</Text>
                      <Text style={s.legendAmount}>{fmtCLP(seg.value)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
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
            {uncategorized > 0 && (
              <View style={s.row}>
                <CategoryCircle slug={undefined} size={34} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={s.rowHead}>
                    <Text style={s.name}>Sin categoría</Text>
                    <Text style={s.pct}>{Math.round((uncategorized / total) * 100)}%</Text>
                  </View>
                  <Text style={s.amount}>{fmtCLP(uncategorized)}</Text>
                  <View style={{ marginTop: 6 }}>
                    <Progress pct={total ? (uncategorized / total) * 100 : 0} height={6} color={C.dim} />
                  </View>
                </View>
              </View>
            )}
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
  toggle: { flexDirection: "row", gap: 8, marginTop: 12 },
  pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.surfaceAlt },
  pillActive: { backgroundColor: C.primarySoft },
  pillText: { color: C.dim, fontSize: 13, fontWeight: "600" },
  pillTextActive: { color: C.text },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendAmount: { color: C.text, fontSize: 12, marginLeft: "auto" },
  movCard: { flexDirection: "row", alignItems: "center", padding: 12 } as any,
  movMerchant: { color: C.text, fontWeight: "600", fontSize: 14 },
  movMeta: { color: C.dim, fontSize: 12, marginTop: 2 },
});
