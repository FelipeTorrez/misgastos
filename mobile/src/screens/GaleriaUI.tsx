/**
 * Galería UI (dev) — muestra el design system con datos fake.
 * U0: validar componentes aislados. Luego vive dentro de Config → modo desarrollador.
 */
import { useState } from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { Card, SectionHeader } from "../components/ui/Card";
import { Progress } from "../components/ui/Progress";
import { CategoryCircle, CategoryTag } from "../components/ui/CategoryCircle";
import { Amount } from "../components/ui/Amount";
import { MonthPager } from "../components/ui/MonthPager";
import { EmptyState } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/ui/StatusBadge";
import { ListRow, RowText, DayHeader } from "../components/ui/ListRow";
import { FabMenu } from "../components/ui/FabMenu";
import { Sheet } from "../components/ui/Sheet";
import { ScreenHeader, Logo, AiChip, HeaderIconButton } from "../components/ui/ScreenHeader";
import { C, T, monthLabel } from "../theme/tokens";

export function GaleriaUI() {
  const [month, setMonth] = useState("2026-08");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fabAction, setFabAction] = useState<string | null>(null);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <ScreenHeader
          left={<Logo />}
          center={null}
          right={[<AiChip key="ai" onPress={() => setSheetOpen(true)} />, <HeaderIconButton key="gear" icon="cog" />]}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

        <SectionHeader title="Tokens · paleta" />
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(C).map(([k, v]) => (
              <View key={k} style={{ alignItems: "center", width: 72 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: v as string, borderWidth: 1, borderColor: C.border }} />
                <Text style={s.tokenName} numberOfLines={1}>{k}</Text>
              </View>
            ))}
          </View>
        </Card>

        <SectionHeader title="Tipografía" />
        <Card style={{ gap: 8 }}>
          <Text style={T.display}>$823.782</Text>
          <Text style={T.h1}>Balance disponible — h1</Text>
          <Text style={T.h2}>Presupuesto de agosto — h2</Text>
          <Text style={T.body}>Cuerpo de texto body 14 — Compra en Lider</Text>
          <Text style={T.caption}>Caption secundario 12</Text>
          <Text style={T.label}>Label uppercase 11</Text>
        </Card>

        <SectionHeader title="Montos (Amount)" />
        <Card style={{ gap: 8 }}>
          <Amount value={1500000} tone="income" size="lg" />
          <Amount value={676218} tone="expense" size="lg" />
          <Amount value={32990} tone="auto" size="md" />
          <Amount value={-8900} tone="auto" size="sm" />
        </Card>

        <SectionHeader title="Selector de mes (MonthPager)" />
        <Card><MonthPager month={month} onChange={setMonth} /><Text style={s.hint}>{monthLabel(month)} seleccionado</Text></Card>

        <SectionHeader title="Iconos por categoría (CategoryCircle)" />
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {["supermercado","restaurantes","transporte","suscripciones","servicios","vivienda","salud","educacion","entretenimiento","compras","deudas","alimentacion"].map(slug => (
              <CategoryCircle key={slug} slug={slug} />
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <CategoryTag name="Supermercado" slug="supermercado" />
            <CategoryTag name="Transporte" slug="transporte" />
            <CategoryTag name="Suscripciones" slug="suscripciones" />
          </View>
        </Card>

        <SectionHeader title="Barras de progreso (estados + icono)" />
        <Card style={{ gap: 14 }}>
          {[
            { l: "Supermercado", slug: "supermercado", spent: 65000, total: 100000 },
            { l: "Transporte", slug: "transporte", spent: 43074, total: 60000 },
            { l: "Entretenimiento", slug: "entretenimiento", spent: 20000, total: 20000 },
          ].map(b => {
            const pct = Math.round((b.spent / b.total) * 100);
            return (
              <View key={b.l}>
                <View style={s.barHead}>
                  <Text style={s.barName}>{b.l}</Text>
                  <Text style={s.barAmounts}>{b.spent.toLocaleString("es-CL")} / {b.total.toLocaleString("es-CL")}</Text>
                </View>
                <Progress pct={pct} slug={b.slug} />
              </View>
            );
          })}
        </Card>

        <SectionHeader title="Badges de estado (español)" />
        <Card style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["pending_ai", "pending_review", "confirmed", "corrected", "duplicate", "ignored"].map(st => (
            <StatusBadge key={st} status={st} />
          ))}
        </Card>

        <SectionHeader title="Filas de movimientos (ListRow)" />
        <DayHeader label="Hoy" />
        <View style={{ gap: 8 }}>
          <ListRow
            left={<CategoryCircle slug="supermercado" />}
            title={<RowText main="Lider" sub="Supermercado" />}
            right={<Amount value={32990} tone="expense" />}
            subRight={<StatusBadge status="pending_ai" />}
          />
          <ListRow
            left={<CategoryCircle slug="restaurantes" />}
            title={<RowText main="McDonald's" sub="Restaurantes" />}
            right={<Amount value={8900} tone="expense" />}
            subRight={<StatusBadge status="confirmed" />}
          />
          <ListRow
            left={<CategoryCircle slug="transferencias" />}
            title={<RowText main="Transferencia recibida" sub="Ingreso" />}
            right={<Amount value={450000} tone="income" />}
            subRight={<StatusBadge status="corrected" />}
          />
        </View>

        <SectionHeader title="Estado vacío" />
        <Card padded={false}>
          <EmptyState
            icon="receipt"
            title="No tienes movimientos todavía"
            subtitle="Agrega tu primer gasto y comenzaremos a organizar tus finanzas."
            ctaLabel="Agregar gasto"
            onCta={() => setFabAction("demo")}
          />
        </Card>

      </ScrollView>

      <FabMenu actions={[
        { icon: "trending-down", label: "Gasto", color: C.negative, onPress: () => setFabAction("gasto") },
        { icon: "trending-up", label: "Ingreso", color: C.positive, onPress: () => setFabAction("ingreso") },
        { icon: "swap-horizontal", label: "Transferencia", color: C.primary, onPress: () => setFabAction("transferencia") },
      ]} />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="🤖 Asistente IA">
        <Text style={s.sheetText}>Aquí irá el asistente (U6): responde con datos reales del mes.</Text>
        <Text style={s.hint}>Última acción FAB: {fabAction ?? "ninguna"}</Text>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  tokenName: { color: C.dim, fontSize: 10, marginTop: 4 },
  hint: { color: C.faint, fontSize: 11, marginTop: 8 },
  barHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  barName: { color: C.text, fontSize: 14, fontWeight: "800" },
  barAmounts: { color: C.dim, fontSize: 13 },
  sheetText: { color: C.text, fontSize: 14 },
});
