import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { C } from "./src/theme/tokens";
import { MIcon } from "./src/components/ui/MIcon";
import { Sheet } from "./src/components/ui/Sheet";
import { MonthPager } from "./src/components/ui/MonthPager";
import { BalanceHero } from "./src/components/ui/BalanceHero";
import { AddMoveModal } from "./src/components/ui/AddMoveModal";
import { FabMenu } from "./src/components/ui/FabMenu";
import { IASheet } from "./src/components/ui/IASheet";
import { hasPermission, startListening, setApiUrl, flushQueue } from "./src/native/NotificationListener";
import { API_URL } from "./src/lib/supabase";
import { useShellData } from "./src/lib/useShellData";
import { Categorias } from "./src/screens/Categorias";
import { Movimientos } from "./src/screens/Movimientos";
import { Presupuesto } from "./src/screens/Presupuesto";
import { Reglas } from "./src/screens/Reglas";
import { IngestionTest } from "./src/screens/IngestionTest";
import { GaleriaUI } from "./src/screens/GaleriaUI";
import { Config } from "./src/screens/Config";

type SubTab = "categorias" | "movimientos" | "presupuestos";

const subTabs: { key: SubTab; label: string }[] = [
  { key: "categorias", label: "Categorías" },
  { key: "movimientos", label: "Movimientos" },
  { key: "presupuestos", label: "Presupuestos" },
];

const secondaryMap: Record<string, any> = {
  reglas: Reglas,
  ingest: IngestionTest,
  probar: IngestionTest,
  galeria: GaleriaUI,
  cfg: Config,
};

export default function App() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [subTab, setSubTab] = useState<SubTab>("categorias");
  const [secondary, setSecondary] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"expense" | "income">("expense");
  const [filterCategory, setFilterCategory] = useState<{ id: string; label: string; slug: string } | null>(null);

  const { balance, txs, budgets, cats, byCat, reload } = useShellData(month);
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  // Phase 6: reenvío NATIVO (funciona con app cerrada) + refresco de UI al detectar notificación
  useEffect(() => {
    setApiUrl(API_URL);
    let stop: (() => void) | null = null;
    flushQueue().then(() => {}).catch(() => {});
    hasPermission().then(has => {
      if (!has) return;
      // El envío al backend ya lo hace el service nativo; aquí solo refrescamos la lista.
      stop = startListening(() => reloadRef.current());
    }).catch(() => {});
    return () => { try { stop?.(); } catch {} };
  }, []);

  function onSelectCategory(cat: { id: string; label: string; slug: string }) {
    setFilterCategory(cat);
    setSubTab("movimientos");
  }
  function openSecondary(k: string) { setSecondary(k); setSheetOpen(false); }

  let content;
  if (secondary) {
    const Sec = secondaryMap[secondary];
    const extra: any = {};
    if (secondary === "cfg") Object.assign(extra, { devMode, setDevMode, onNavigate: (k: string) => setSecondary(k), onReload: reload });
    else if (secondary === "ingest" || secondary === "probar") Object.assign(extra, { onReload: reload });
    content = <Sec {...extra} />;
  } else if (subTab === "categorias") {
    content = <Categorias txs={txs} cats={cats} byCat={byCat} onSelectCategory={onSelectCategory} />;
  } else if (subTab === "movimientos") {
    content = (
      <Movimientos
        txs={txs}
        cats={cats}
        month={month}
        filterCategory={filterCategory}
        onClearFilter={() => setFilterCategory(null)}
        onRefresh={reload}
      />
    );
  } else {
    content = <Presupuesto budgets={budgets} cats={cats} month={month} onRefresh={reload} />;
  }

  return (
    <SafeAreaView style={s.bg}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.logoBox}><MIcon name="wallet" size={14} color="#04121F" /></View>
          <Text style={s.logoText}>MisGastos</Text>
        </View>
        <View style={s.headerRight}>
          {secondary ? (
            <TouchableOpacity style={s.gearBtn} onPress={() => setSecondary(null)}>
              <MIcon name="chevron-left" size={22} color={C.text} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={s.aiChip} onPress={() => setIaOpen(true)}>
                <MIcon name="robot-happy" size={20} color={C.primary} />
                <Text style={s.aiText}>IA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.gearBtn} onPress={() => setSheetOpen(true)}>
                <MIcon name="cog" size={18} color={C.dim} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {!secondary && (
        <View style={s.fixedTop}>
          <View style={s.monthWrap}>
            <MonthPager month={month} onChange={setMonth} />
          </View>
          <BalanceHero
            income={balance.income}
            expense={balance.expense}
            balance={balance.balance}
            filterCategory={filterCategory}
            onClearFilter={() => setFilterCategory(null)}
          />
          <View style={s.subTabBar}>
            {subTabs.map(t => (
              <TouchableOpacity key={t.key} style={[s.subTab, subTab === t.key && s.subTabActive]} onPress={() => setSubTab(t.key)}>
                <Text style={[s.subTabText, subTab === t.key && s.subTabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={{ flex: 1 }}>{content}</View>

      {!secondary && (
        <FabMenu
          actions={[
            { icon: "trending-down", label: "Gasto", color: C.negative, onPress: () => { setAddType("expense"); setAddOpen(true); } },
            { icon: "trending-up", label: "Ingreso", color: C.positive, onPress: () => { setAddType("income"); setAddOpen(true); } },
          ]}
        />
      )}

      <AddMoveModal visible={addOpen} onClose={() => setAddOpen(false)} cats={cats} onAdded={reload} initialType={addType} />

      <IASheet visible={iaOpen} onClose={() => setIaOpen(false)} month={month} balance={balance} byCat={byCat} budgets={budgets} cats={cats} />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Más">
        <TouchableOpacity style={s.sheetItem} onPress={() => openSecondary("reglas")}>
          <MIcon name="tag" size={18} color={C.dim} /><Text style={s.sheetText}>Reglas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.sheetItem} onPress={() => openSecondary("cfg")}>
          <MIcon name="cog" size={18} color={C.dim} /><Text style={s.sheetText}>Configuración</Text>
        </TouchableOpacity>
        {devMode && (
          <>
            <TouchableOpacity style={s.sheetItem} onPress={() => openSecondary("ingest")}>
              <MIcon name="flask" size={18} color={C.dim} /><Text style={s.sheetText}>Probar (dev)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetItem} onPress={() => openSecondary("galeria")}>
              <MIcon name="palette" size={18} color={C.dim} /><Text style={s.sheetText}>Galería UI (dev)</Text>
            </TouchableOpacity>
          </>
        )}
        <Text style={s.sheetHint}>Modo desarrollador: {devMode ? "activo" : "inactivo"} — cambia en Config</Text>
      </Sheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoBox: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  logoText: { color: C.text, fontSize: 17, fontWeight: "800" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.primarySoft, borderWidth: 1, borderColor: "rgba(56,189,248,0.35)", shadowColor: C.primary, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2 },
  aiText: { color: C.primary, fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  gearBtn: { width: 32, height: 32, borderRadius: 999, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  fixedTop: { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  monthWrap: { alignItems: "center", marginTop: 8 },
  subTabBar: { flexDirection: "row", paddingHorizontal: 16, marginTop: 6, gap: 18 },
  subTab: { paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  subTabActive: { borderBottomColor: C.primary },
  subTabText: { color: C.dim, fontSize: 14, fontWeight: "600" },
  subTabTextActive: { color: C.primary, fontWeight: "800" },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: C.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  sheetText: { color: C.text, fontWeight: "600" },
  sheetHint: { color: C.faint, fontSize: 11, textAlign: "center", marginTop: 8 },
});
