import { useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { API_URL } from "../lib/supabase";

const EXAMPLES = [
  { label: "Santander compra", raw: "Santander: Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30\nMonto: $32.990\nComercio: Lider", sender: "santander@notificaciones.cl", subject: "Compra realizada" },
  { label: "BCI transferencia", raw: "BCI te informa: Transferencia recibida Monto: $250.000 - 06/08/2026 09:15 - BancoEstado\nDe: Juan Perez", sender: "bci@bci.cl", subject: "Transferencia recibida" },
  { label: "BancoEstado giro", raw: "BancoEstado: Giro por $20.000 en Cajero ATM - 14/08/2026 18:00 - tarjeta ****5678", sender: "bancoestado@bancoestado.cl", subject: "Giro realizado" },
];

const NOTIF_EXAMPLES = [
  { label: "Notificación Lider (duplica email)", raw: "Compra por $32.990 en Lider - 24/08/2026 15:32", title: "Compra Lider $32.990" },
  { label: "Notificación Uber", raw: "Pagaste $8.900 en Uber - 24/08/2026 19:00", title: "Uber $8.900" },
];

export function IngestionTest({ onReload }: { onReload?: () => void } = {}) {
  const [raw, setRaw] = useState(EXAMPLES[0].raw);
  const [sender, setSender] = useState(EXAMPLES[0].sender);
  const [subject, setSubject] = useState(EXAMPLES[0].subject);
  const [externalId, setExternalId] = useState(`test-${Date.now()}`);
  const [mode, setMode] = useState<"email" | "notification">("email");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async (asNotif = false) => {
    setLoading(true); setErr(null); setRes(null);
    const url = asNotif || mode === "notification" ? `${API_URL}/v1/ingestion/notification` : `${API_URL}/v1/ingestion/email`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_content: raw, sender, subject, external_id: externalId }),
        signal: ctrl.signal as any,
      });
      clearTimeout(t);
      const text = await r.text();
      let j: any; try { j = JSON.parse(text); } catch { j = { raw: text }; }
      if (!r.ok && r.status !== 200) throw new Error(j.error || text.slice(0, 500));
      setRes(j);
      setExternalId(`test-${Date.now()}`);
      onReload?.();
    } catch (e: any) { 
      if (e.name === "AbortError") setErr("Timeout: backend no respondió en 8s. Verifica que `cd backend; npm run dev` esté corriendo en :3000 y que no esté bloqueado por firewall.");
      else setErr(e.message?.includes("Failed to fetch") || e.message?.includes("fetch failed") ? `No se pudo conectar a ${API_URL}. Verifica backend en :3000 y que CORS esté habilitado. Detalle: ${e.message}` : e.message); 
    }
    finally { setLoading(false); }
  };

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.title}>Probar Email / Notificación</Text>
      <Text style={s.hint}>Phase 6 — Prueba conjunta 4 (AI) +5 (dedup). Pega email o simula notificación Android §11.2.</Text>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TouchableOpacity onPress={() => setMode("email")} style={[s.chip, mode === "email" && { backgroundColor: "#10b981" }]}><Text style={[s.chipText, mode === "email" && { color: "#fff" }]}>📧 Email (Gmail)</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setMode("notification")} style={[s.chip, mode === "notification" && { backgroundColor: "#3b82f6" }]}><Text style={[s.chipText, mode === "notification" && { color: "#fff" }]}>🔔 Notificación Android</Text></TouchableOpacity>
      </View>

      <Text style={s.label}>Ejemplos chilenos {mode === "notification" ? "(notificación)" : "(email)"} (toca para cargar)</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {(mode === "notification" ? NOTIF_EXAMPLES : EXAMPLES).map((ex: any) => (
          <TouchableOpacity key={ex.label} onPress={() => {
            setRaw(ex.raw);
            if (ex.sender) { setSender(ex.sender); setSubject(ex.subject); }
            else { setSender("com.santander.mock"); setSubject(ex.title); }
            setExternalId(`test-${Date.now()}`);
          }} style={s.chip}>
            <Text style={s.chipText}>{ex.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {mode === "notification" && <Text style={s.hint}>En Expo Go/web es simulado. En dev-build real, las notificaciones del banco llegan solas vía NotificationListenerService §11.2.</Text>}

      <Text style={s.label}>Remitente</Text>
      <TextInput value={sender} onChangeText={setSender} style={s.input} placeholder="santander@..." placeholderTextColor="#6b7280" />
      <Text style={s.label}>Asunto</Text>
      <TextInput value={subject} onChangeText={setSubject} style={s.input} placeholder="Compra realizada" placeholderTextColor="#6b7280" />
      <Text style={s.label}>External ID (para no duplicar)</Text>
      <TextInput value={externalId} onChangeText={setExternalId} style={s.input} placeholderTextColor="#6b7280" />
      <Text style={s.label}>Contenido del email (raw_content) *</Text>
      <TextInput value={raw} onChangeText={setRaw} style={[s.input, s.textarea]} multiline numberOfLines={8} placeholder="Pega aquí el texto del email..." placeholderTextColor="#6b7280" />

      <TouchableOpacity onPress={() => send()} disabled={loading || !raw.trim()} style={[s.btn, (!raw.trim()||loading)&&s.btnDisabled]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{mode === "notification" ? "Enviar como Notificación → Dedup" : "Enviar a Ingestión → Parser → AI"}</Text>}
      </TouchableOpacity>

      <Text style={s.hint}>Flujo {mode === "notification" ? "Banco → Notificación → Android → Listener → App → Backend §11.2" : "Banco → Email → Gmail → Ingestion → RawEvent §12 → Parser §14 → AI §16 → Dedup §15"} · Idempotencia por external_id</Text>

      {mode === "email" && (
        <TouchableOpacity onPress={async () => {
          setErr(null); setRes(null); setLoading(true);
          try {
            const headers = { "Content-Type": "application/json" };
            const ctrl1 = new AbortController(); setTimeout(() => ctrl1.abort(), 15000);
            const r1 = await fetch(`${API_URL}/v1/ingestion/email`, { method: "POST", headers, body: JSON.stringify({ raw_content: "Compra por $32.990 en Lider - 24/08/2026 15:30", sender: "santander@cl", subject: "Compra", external_id: `joint-email-${Date.now()}` }), signal: ctrl1.signal as any });
            if (!r1.ok) throw new Error(`Email failed ${r1.status}: ${await r1.text().catch(()=>"")}`);
            const j1 = await r1.json();

            const ctrl2 = new AbortController(); setTimeout(() => ctrl2.abort(), 15000);
            const r2 = await fetch(`${API_URL}/v1/ingestion/notification`, { method: "POST", headers, body: JSON.stringify({ raw_content: "Compra por $32.990 en Lider - 24/08/2026 15:32", sender: "cl.santander", subject: "Notificación", external_id: `joint-notif-${Date.now()}` }), signal: ctrl2.signal as any });
            if (!r2.ok) throw new Error(`Notif failed ${r2.status}: ${await r2.text().catch(()=>"")}`);
            const j2 = await r2.json();

            setRes({ joint: true, email: j1, notification: j2, isDup: j2.dedup?.is_duplicate, aiCat: j1.ai?.category });
            setExternalId(`test-${Date.now()}`);
            onReload?.();
          } catch (e: any) {
            const msg = e.name === "AbortError" ? `Timeout (15s). Backend en ${API_URL} no respondió.` : e.message?.includes("Failed to fetch") || e.message?.includes("fetch failed") ? `No conecta a ${API_URL}. Verifica que el backend esté corriendo.` : e.message;
            setErr(msg);
          }
          setLoading(false);
        }} style={[s.btn, { backgroundColor: "#3b82f6", marginTop: 8 }]}>
          <Text style={s.btnText}>▶ Probar conjunta 4+5 (email + notificación → dedup)</Text>
        </TouchableOpacity>
      )}

      {err && <View style={s.cardErr}><Text style={s.err}>{err}</Text><Text style={s.muted}>¿Backend corriendo? `cd backend; npm run dev` en :3000. Web usa API_URL={API_URL}</Text></View>}

      {res && (
        <>
          {res.joint ? (
            <>
              <View style={[s.card, res.isDup ? { borderColor: "#f59e0b", borderWidth: 1, backgroundColor: "#1f1400" } : s.cardOk]}>
                <Text style={s.h2}>{res.isDup ? "✅ Dedup OK — 2 fuentes → 1 gasto" : "ℹ️ Conjunta sin duplicado"}</Text>
                <Text style={s.muted}>Email: {res.email?.parsed?.merchant} ${res.email?.parsed?.amount} → {res.email?.ai?.category} {Math.round((res.email?.ai?.confidence||0)*100)}%{"\n"}Notif: {res.notification?.parsed?.merchant} ${res.notification?.parsed?.amount} → dedup: {String(res.isDup)}</Text>
              </View>
              <View style={s.card}>
                <Text style={s.h2}>Email → Parsed + AI</Text>
                <Text style={s.mono}>{JSON.stringify({ parsed: res.email?.parsed, ai: res.email?.ai }, null, 2)}</Text>
              </View>
              <View style={s.card}>
                <Text style={s.h2}>Notificación → Dedup</Text>
                <Text style={s.mono}>{JSON.stringify(res.notification?.dedup, null, 2)}</Text>
                <Text style={s.monoSmall}>Transaction: {JSON.stringify(res.notification?.transaction, null, 2)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={[s.card, res.dedup === true ? s.cardWarn : res.transaction ? s.cardOk : s.cardWarn]}>
                <Text style={s.h2}>{res.dedup === true ? "⚠️ Duplicado ignorado (external_id)" : res.transaction ? "✅ Transaction creada" : "⚠️ Sin monto — revisión manual"}</Text>
                {res.dedup === true && <Text style={s.muted}>Ya existía este external_id en la base.</Text>}
              </View>

              <View style={s.card}>
                <Text style={s.h2}>Parsed (determinístico §14)</Text>
                <Text style={s.mono}>{JSON.stringify(res.parsed, null, 2)}</Text>
                <Text style={s.h2}>Normalized (500c, RUT oculto)</Text>
                <Text style={s.monoSmall}>{res.normalized}</Text>
              </View>

              {res.dedup?.is_duplicate && (
                <View style={[s.card, { borderWidth: 1, borderColor: "#f59e0b", backgroundColor: "#1f1400" }]}>
                  <Text style={s.h2}>⚠️ Duplicado detectado §15</Text>
                  <Text style={s.muted}>Mismo monto/fecha/comercio que {res.dedup.duplicate_of}. No se crea gasto duplicado (status: duplicate).</Text>
                  <Text style={s.monoSmall}>Fuente actual: {res.raw_event?.source} → dedup con transacción {res.dedup.duplicate_of} (email+notificación)</Text>
                </View>
              )}

              {res.classification_source && (
                <View style={[s.card, res.classification_source === "rule" ? { borderWidth: 2, borderColor: "#10b981", backgroundColor: "#04140c" } : { borderWidth: 1, borderColor: "#3b82f6" }]}>
                  <Text style={s.h2}>
                    {res.classification_source === "rule" ? "📏 REGLA aplicada — AI omitido (skip AI)" : res.classification_source === "ai" ? "🤖 Clasificado por AI Agent" : "⚙️ Clasificado por parser"}
                  </Text>
                  <Text style={s.muted}>classification_source: "{res.classification_source}"</Text>
                  {res.matched_rule
                    ? <Text style={s.monoSmall}>matched_rule: {"\n"}{JSON.stringify(res.matched_rule, null, 2)}</Text>
                    : res.classification_source === "rule" && <Text style={s.muted}>Regla del parser aplicada sin detalle</Text>}
                </View>
              )}

              {res.ai && (
                <View style={[s.card, { borderWidth: 1, borderColor: "#3b82f6" }]}>
                  <Text style={s.h2}>AI Agent #1 (Groq) — {res.ai.reason?.includes("mock") ? "mock" : "Groq"} · {res.ai.category} {Math.round(res.ai.confidence*100)}% · {res.ai.needs_review ? "pending_review" : "pending_ai"}</Text>
                  <Text style={s.mono}>{JSON.stringify(res.ai, null, 2)}</Text>
                  {res.ai.needs_review && <Text style={s.muted}>AI no confiado → quedará en bandeja Revisar.</Text>}
                </View>
              )}

              {res.transaction && (
                <View style={s.card}>
                  <Text style={s.h2}>Transaction {res.mocked ? "(mock)" : ""} — {res.transaction.status}</Text>
                  <Text style={s.mono}>{JSON.stringify(res.transaction, null, 2)}</Text>
                  <Text style={s.muted}>Ve a Movimientos para verla. {res.warning ?? ""}</Text>
                </View>
              )}

              {res.raw_event && (
                <View style={s.card}>
                  <Text style={s.h2}>RawEvent (inmutable §12)</Text>
                  <Text style={s.monoSmall}>id: {res.raw_event.id}{"\n"}source: {res.raw_event.source}{"\n"}sender: {res.raw_event.sender}</Text>
                </View>
              )}
            </>
          )}
        </>
      )}

      <View style={s.card}>
        <Text style={s.h2}>Cómo reenviar un email real</Text>
        <Text style={s.muted}>1. En Gmail abre el correo del banco (Santander/BCI/BancoEstado){"\n"}2. Reenviar a tu correo o copiar todo el texto (Ctrl+A){"\n"}3. Pégalo arriba en "Contenido" y pulsa Enviar{"\n"}4. Fase 3 es solo reenvío selectivo; OAuth Gmail API será Phase 3b</Text>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0b0e14" },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 6 },
  hint: { color: "#9ca3af", fontSize: 12, marginBottom: 12, lineHeight: 16 },
  label: { color: "#d1d5db", fontSize: 12, fontWeight: "600", marginTop: 10, marginBottom: 4 },
  input: { backgroundColor: "#111827", color: "#fff", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#1f2937", fontSize: 13 },
  textarea: { height: 140, textAlignVertical: "top" },
  chip: { backgroundColor: "#1f2937", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginBottom: 6 },
  chipText: { color: "#9ca3af", fontSize: 12 },
  btn: { backgroundColor: "#10b981", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 14 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "800" },
  card: { backgroundColor: "#111827", padding: 14, borderRadius: 12, marginTop: 12 },
  cardOk: { borderWidth: 1, borderColor: "#10b981" },
  cardWarn: { borderWidth: 1, borderColor: "#f59e0b" },
  cardErr: { backgroundColor: "#1f1111", padding: 12, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: "#7f1d1d" },
  err: { color: "#f87171", fontSize: 12 },
  h2: { color: "#fff", fontWeight: "700", fontSize: 13, marginBottom: 6, marginTop: 4 },
  mono: { color: "#d1d5db", fontFamily: "monospace", fontSize: 11, backgroundColor: "#0b0e14", padding: 8, borderRadius: 6 },
  monoSmall: { color: "#9ca3af", fontFamily: "monospace", fontSize: 11 },
  muted: { color: "#9ca3af", fontSize: 12, marginTop: 4 },
});
