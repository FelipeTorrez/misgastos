import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert } from "react-native";
import { API_URL } from "../lib/supabase";
import { C, R } from "../theme/tokens";
import { Card } from "../components/ui/Card";
import { MIcon } from "../components/ui/MIcon";
import { UserSettings, fetchSettings, saveSettings } from "../lib/useShellData";
import { currentCycle, rangeLabel } from "../lib/billingCycle";
import { hasPermission, requestPermission, simulateBankNotification, resendActive, postTestNotificationVisible } from "../native/NotificationListener";

export function Config({ devMode, setDevMode, onNavigate, onReload, settings, onCycleChange }: {
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  onNavigate?: (key: string) => void;
  onReload?: () => void;
  settings?: UserSettings | null;
  onCycleChange?: (day: number, enabled: boolean) => void;
}) {
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<boolean | null>(null);
  const [simMsg, setSimMsg] = useState<string | null>(null);
  const [cycleDay, setCycleDay] = useState(settings?.billing_cycle_day ?? 20);
  const [cycleEnabled, setCycleEnabled] = useState<boolean | null>(settings?.billing_cycle_enabled ?? null);
  const [cycleMsg, setCycleMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/health`).then(r => r.json()).then(setHealth).catch(e => setError(String(e.message ?? e)));
    hasPermission().then(setNotifPerm).catch(() => setNotifPerm(null));
    fetchSettings().then(s => {
      if (s) { setCycleDay(s.billing_cycle_day); setCycleEnabled(s.billing_cycle_enabled); }
    }).catch(() => {});
  }, []);

  const cyclePreview = currentCycle(cycleDay);
  const notifyCycle = (m: string) => { setCycleMsg(m); setTimeout(() => setCycleMsg(null), 2400); };

  async function saveCycle(day: number, enabled: boolean | null) {
    const saved = await saveSettings({ billing_cycle_day: day, billing_cycle_enabled: enabled });
    setCycleDay(saved?.billing_cycle_day ?? day);
    setCycleEnabled(saved?.billing_cycle_enabled ?? enabled);
    if (saved) onCycleChange?.(saved.billing_cycle_day, saved.billing_cycle_enabled === true);
    notifyCycle("Ciclo actualizado");
  }

  async function sim(text: string) {
    setSimMsg("Enviando…");
    try {
      const res = await simulateBankNotification(text);
      setSimMsg(`OK: ${res?.status ?? res?.classification_source ?? "creado"} — ${res?.merchant ?? text.slice(0, 24)}`);
      setTimeout(() => setSimMsg(null), 3000);
      setTimeout(() => onReload?.(), 600);
    } catch (e: any) {
      setSimMsg(`Error: ${e?.message ?? e}`);
      setTimeout(() => setSimMsg(null), 3000);
    }
  }

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text style={s.title}>Configuración</Text>

      <Card>
        <Text style={s.h2}>Conexión</Text>
        <Text style={s.row}>API: <Text style={s.mono}>{API_URL}</Text></Text>
        {health ? (
          <>
            <Text style={s.row}>Estado: <Text style={{ color: C.positive }}>● Conectado</Text></Text>
            <Text style={s.row}>Versión: {health.version}</Text>
            <Text style={s.row}>Fase: {health.phase}</Text>
            <Text style={s.row}>Modo: {health.phase?.includes("mock") ? "Mock" : "Supabase real"}</Text>
          </>
        ) : error ? (
          <Text style={{ color: C.negative, marginTop: 8 }}>{error}</Text>
        ) : (
          <Text style={{ color: C.dim, marginTop: 8 }}>Verificando…</Text>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={s.switchRow}>
          <View>
            <Text style={s.h2}>Ciclo de facturación</Text>
            <Text style={s.muted}>Muestra tu ciclo en lugar del mes calendario</Text>
          </View>
          <Switch value={cycleEnabled === true} onValueChange={v => saveCycle(cycleDay, v)} trackColor={{ true: C.primary }} thumbColor={cycleEnabled ? "#fff" : undefined} />
        </View>

        <View style={s.cycleDayRow}>
          <TouchableOpacity style={s.cycleDayBtn} onPress={() => saveCycle(Math.max(1, cycleDay - 1), cycleEnabled)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MIcon name="minus" size={18} color={C.text} />
          </TouchableOpacity>
          <View style={s.cycleDayBox}>
            <Text style={s.cycleDayText}>Día {cycleDay}</Text>
            <Text style={s.cycleDayPreview}>{rangeLabel(cyclePreview)}</Text>
          </View>
          <TouchableOpacity style={s.cycleDayBtn} onPress={() => saveCycle(Math.min(28, cycleDay + 1), cycleEnabled)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MIcon name="plus" size={18} color={C.text} />
          </TouchableOpacity>
        </View>
        {cycleMsg && <Text style={[s.muted, { color: C.positive, marginTop: 4 }]}>{cycleMsg}</Text>}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={s.switchRow}>
          <View>
            <Text style={s.h2}>Modo desarrollador</Text>
            <Text style={s.muted}>Muestra herramientas: Probar · UI U0</Text>
          </View>
          <Switch value={devMode} onValueChange={setDevMode} trackColor={{ true: C.primary }} thumbColor={devMode ? "#fff" : undefined} />
        </View>
        {devMode && (
          <View style={{ gap: 8, marginTop: 12 }}>
            <TouchableOpacity style={s.devBtn} onPress={() => onNavigate?.("probar")}><Text style={s.devBtnText}>Abrir Probar (ingesta)</Text></TouchableOpacity>
            <TouchableOpacity style={s.devBtn} onPress={() => onNavigate?.("galeria")}><Text style={s.devBtnText}>Abrir Galería UI</Text></TouchableOpacity>
          </View>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>Datos</Text>
        <Text style={s.muted}>Borra todos los movimientos de prueba</Text>
        <TouchableOpacity
          style={[s.devBtn, { backgroundColor: "rgba(248,113,113,0.12)", borderColor: C.negative, marginTop: 10 }]}
          onPress={() => {
            Alert.alert("Limpiar base", "¿Borrar TODOS los movimientos? No se puede deshacer.", [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Borrar todo", style: "destructive", onPress: async () => {
                  try {
                    const r = await fetch(`${API_URL}/v1/transactions`);
                    const list = await r.json();
                    let ok = 0;
                    for (const t of list as any[]) {
                      const del = await fetch(`${API_URL}/v1/transactions/${t.id}`, { method: "DELETE" });
                      if (del.ok) ok++;
                    }
                    Alert.alert("Listo", `Borrados ${ok} movimientos`);
                  } catch (e: any) {
                    Alert.alert("Error", String(e?.message ?? e));
                  }
                }
              }
            ]);
          }}
        >
          <Text style={[s.devBtnText, { color: C.negative }]}>Limpiar base</Text>
        </TouchableOpacity>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={s.h2}>Notificaciones bancarias — simulación</Text>
        <Text style={s.muted}>Prueba el flujo Phase 6 sin permiso real. En dev-build con acceso a notificaciones, usa el listener nativo.</Text>
        <Text style={[s.row, { marginTop: 8 }]}>Estado: {notifPerm === null ? "Modo simulación (Expo Go/web)" : notifPerm ? "● Con acceso" : "○ Sin acceso"}</Text>
        {notifPerm === false && (
          <TouchableOpacity style={[s.devBtn, { marginTop: 8 }]} onPress={async () => { await requestPermission(); const v = await hasPermission(); setNotifPerm(v); }}>
            <Text style={s.devBtnText}>Solicitar acceso a notificaciones</Text>
          </TouchableOpacity>
        )}
        <View style={{ gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={s.devBtn} onPress={() => sim("Compra por $32.990 en Lider - 26/08/2026 15:30")}><Text style={s.devBtnText}>Simular Lider $32.990</Text></TouchableOpacity>
          <TouchableOpacity style={s.devBtn} onPress={() => sim("Compra por $45.200 en Jumbo - 26/08/2026 16:00")}><Text style={s.devBtnText}>Simular Jumbo $45.200</Text></TouchableOpacity>
          <TouchableOpacity style={s.devBtn} onPress={() => sim("Tu suscripción Spotify se renovó $7.490 - 26/08/2026 09:00")}><Text style={s.devBtnText}>Simular Spotify $7.490</Text></TouchableOpacity>
          <TouchableOpacity style={[s.devBtn, { borderColor: C.primary }]} onPress={async () => { await resendActive(); setSimMsg("Reenviando notificaciones en pantalla…"); setTimeout(() => setSimMsg(null), 3000); setTimeout(() => onReload?.(), 800); }}><Text style={s.devBtnText}>Reenviar notificaciones en pantalla</Text></TouchableOpacity>
          <TouchableOpacity style={[s.devBtn, { backgroundColor: C.primarySoft, borderColor: C.primary }]} onPress={async () => { await postTestNotificationVisible("Compra Test Visible", `Compra por $12.300 en Test Visible - ${new Date().toLocaleDateString("es-CL")} 12:00`); setSimMsg("Notificación visible disparada — revisa la bandeja"); setTimeout(() => setSimMsg(null), 3000); }}><Text style={[s.devBtnText, { color: C.primary }]}>Disparar notificación visible Test</Text></TouchableOpacity>
          {simMsg && <Text style={[s.muted, { color: C.positive, marginTop: 4 }]}>{simMsg}</Text>}
          <Text style={[s.muted, { fontSize: 11 }]}>Cada simulación hace POST /v1/ingestion/notification → parser §14 → AI → dedup §15. Verifica en Movimientos.</Text>
        </View>
      </Card>

      <Text style={s.footer}>MisGastos v0.3.0-phase8 · Expo SDK 53</Text>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  title: { color: C.text, fontSize: 22, fontWeight: "800", marginBottom: 12 },
  h2: { color: C.text, fontWeight: "700", marginBottom: 6 },
  row: { color: C.dim, fontSize: 13, marginTop: 4 },
  mono: { color: C.text, fontFamily: "monospace", fontSize: 11 },
  muted: { color: C.dim, fontSize: 12 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cycleDayRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  cycleDayBtn: { width: 44, height: 44, borderRadius: R.md, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  cycleDayBox: { flex: 1, alignItems: "center", gap: 2 },
  cycleDayText: { color: C.text, fontSize: 16, fontWeight: "800" },
  cycleDayPreview: { color: C.primary, fontSize: 12, fontWeight: "600" },
  devBtn: { backgroundColor: C.surfaceAlt, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.border },
  devBtnText: { color: C.primary, fontWeight: "700", textAlign: "center" },
  footer: { color: C.faint, fontSize: 11, textAlign: "center", marginTop: 24 },
});
