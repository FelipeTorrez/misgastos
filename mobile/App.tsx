import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, AppState } from "react-native";
import { C } from "./src/theme/tokens";
import { MIcon } from "./src/components/ui/MIcon";
import { Sheet } from "./src/components/ui/Sheet";
import { PeriodPager } from "./src/components/ui/PeriodPager";
import { DateRangePicker } from "./src/components/ui/DateRangePicker";
import { CyclePrompt } from "./src/components/ui/CyclePrompt";
import { BalanceHero } from "./src/components/ui/BalanceHero";
import { AddMoveModal } from "./src/components/ui/AddMoveModal";
import { FabMenu } from "./src/components/ui/FabMenu";
import { IASheet } from "./src/components/ui/IASheet";
import { hasPermission, startListening, setApiUrl, flushQueue, resendActive } from "./src/native/NotificationListener";
import { API_URL } from "./src/lib/supabase";
import { useShellData, fetchSettings, saveSettings, Period, UserSettings } from "./src/lib/useShellData";
import { currentCycle, DateRange } from "./src/lib/billingCycle";
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

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function App() {
  const [period, setPeriod] = useState<Period>(() => ({ type: "month", month: currentMonth() }));
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [promptDay, setPromptDay] = useState(20);
  const [promptOpen, setPromptOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("categorias");
  const [secondary, setSecondary] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"expense" | "income">("expense");
  const [filterCategory, setFilterCategory] = useState<{ id: string; label: string; slug: string } | null>(null);

  const { balance, txs, budgets, cats, byCat, reload } = useShellData(period);
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  // Carga la config del ciclo de facturación al abrir (default: ciclo si está activo)
  useEffect(() => {
    fetchSettings().then(s => {
      setSettings(s);
      if (s && s.billing_cycle_enabled === true) {
        setPeriod({ type: "range", ...currentCycle(s.billing_cycle_day) });
      } else if (s && s.billing_cycle_enabled === false) {
        setPeriod({ type: "month", month: currentMonth() });
      } else {
        setPromptOpen(true);
        setPromptDay(s?.billing_cycle_day ?? 20);
      }
    }).catch(() => {});
  }, []);

  function defaultPeriod(): Period {
    if (settings && settings.billing_cycle_enabled === true) return { type: "range", ...currentCycle(settings.billing_cycle_day) };
    return { type: "month", month: currentMonth() };
  }
  const isDefault = JSON.stringify(period) === JSON.stringify(defaultPeriod());

  function resetToDefault() { setPeriod(defaultPeriod()); }
  function applyRange(r: DateRange) { setPeriod({ type: "range", ...r }); setRangeOpen(false); }

  async function acceptCycle() {
    const saved = await saveSettings({ billing_cycle_day: promptDay, billing_cycle_enabled: true });
    setSettings(saved ?? { billing_cycle_day: promptDay, billing_cycle_enabled: true });
    setPeriod({ type: "range", ...currentCycle(promptDay) });
    setPromptOpen(false);
  }
  async function declineCycle() {
    const saved = await saveSettings({ billing_cycle_enabled: false });
    setSettings(saved ?? { billing_cycle_day: promptDay, billing_cycle_enabled: false });
    setPromptOpen(false);
  }

  function applyCycleSettings(day: number, enabled: boolean) {
    setSettings(prev => ({ billing_cycle_day: day, billing_cycle_enabled: enabled }));
    if (enabled) setPeriod({ type: "range", ...currentCycle(day) });
    else setPeriod({ type: "month", month: currentMonth() });
  }

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

  // Reintento automático al volver al primer plano y cada 30s (captura notis que llegaron con app en background)
  useEffect(() => {
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") {
        resendActive().then(() => reloadRef.current()).catch(() => {});
        flushQueue().catch(() => {});
      }
    });
    const id = setInterval(() => {
      resendActive().catch(() => {});
    }, 30000);
    return () => { sub.remove(); clearInterval(id as any); };
  }, []);

  function onSelectCategory(cat: { id: string; label: string; slug: string }) {
    setFilterCategory(cat);
    setSubTab("movimientos");
  }
  function openSecondary(k: string) { setSecondary(k); setSheetOpen(false); }

  const month = period.type === "month" ? period.month : period.from.slice(0, 7);
  const rangeActive = period.type === "range";
  const cycleEnabled = settings?.billing_cycle_enabled === true;
  const cycleRange = cycleEnabled && settings ? currentCycle(settings.billing_cycle_day) : null;

  let content;
  if (secondary) {
    const Sec = secondaryMap[secondary];
    const extra: any = {};
    if (secondary === "cfg") Object.assign(extra, { devMode, setDevMode, onNavigate: (k: string) => setSecondary(k), onReload: reload, settings, onCycleChange: applyCycleSettings });
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
    content = <Presupuesto budgets={budgets} cats={cats} month={month} onRefresh={reload} rangeActive={rangeActive} />;
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
            <PeriodPager period={period} onChange={setPeriod} onOpenRange={() => setRangeOpen(true)} showClear={!isDefault && !cycleEnabled} onClear={resetToDefault} cycleEnabled={cycleEnabled} cycleRange={cycleRange} />
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

      <DateRangePicker
        visible={rangeOpen}
        onClose={() => setRangeOpen(false)}
        initial={period.type === "range" ? period : null}
        onApply={applyRange}
      />

      <CyclePrompt
        visible={promptOpen}
        day={promptDay}
        onDayChange={setPromptDay}
        onAccept={acceptCycle}
        onDecline={declineCycle}
      />

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
