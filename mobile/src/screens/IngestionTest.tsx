import { useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { API_URL } from "../lib/supabase";

const EXAMPLES = [
  { label: "Santander compra", raw: "Santander: Compra por $32.990 en Lider con tarjeta terminada en 1234 - 24/08/2026 15:30\nMonto: $32.990\nComercio: Lider", sender: "santander@notificaciones.cl", subject: "Compra realizada" },
  { label: "BCI transferencia", raw: "BCI te informa: Transferencia recibida Monto: $250.000 - 06/08/2026 09:15 - BancoEstado\nDe: Juan Perez", sender: "bci@bci.cl", subject: "Transferencia recibida" },
  { label: "BancoEstado giro", raw: "BancoEstado: Giro por $20.000 en Cajero ATM - 14/08/2026 18:00 - tarjeta ****5678", sender: "bancoestado@bancoestado.cl", subject: "Giro realizado" },
];

export function IngestionTest() {
  const [raw, setRaw] = useState(EXAMPLES[0].raw);
  const [sender, setSender] = useState(EXAMPLES[0].sender);
  const [subject, setSubject] = useState(EXAMPLES[0].subject);
  const [externalId, setExternalId] = useState(`test-${Date.now()}`);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setLoading(true); setErr(null); setRes(null);
    try {
      const r = await fetch(`${API_URL}/v1/ingestion/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": "demo" },
        body: JSON.stringify({ raw_content: raw, sender, subject, external_id: externalId })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || JSON.stringify(j));
      setRes(j);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.title}>Probar Email Real</Text>
      <Text style={s.hint}>Pega el contenido de un email bancario reenviado (copia el texto del correo). El parser §14 lo convierte sin IA.</Text>

      <Text style={s.label}>Ejemplos chilenos (toca para cargar)</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {EXAMPLES.map(ex => (
          <TouchableOpacity key={ex.label} onPress={() => { setRaw(ex.raw); setSender(ex.sender); setSubject(ex.subject); setExternalId(`test-${Date.now()}`); }} style={s.chip}>
            <Text style={s.chipText}>{ex.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>Remitente</Text>
      <TextInput value={sender} onChangeText={setSender} style={s.input} placeholder="santander@..." placeholderTextColor="#6b7280" />
      <Text style={s.label}>Asunto</Text>
      <TextInput value={subject} onChangeText={setSubject} style={s.input} placeholder="Compra realizada" placeholderTextColor="#6b7280" />
      <Text style={s.label}>External ID (para no duplicar)</Text>
      <TextInput value={externalId} onChangeText={setExternalId} style={s.input} placeholderTextColor="#6b7280" />
      <Text style={s.label}>Contenido del email (raw_content) *</Text>
      <TextInput value={raw} onChangeText={setRaw} style={[s.input, s.textarea]} multiline numberOfLines={8} placeholder="Pega aquí el texto del email..." placeholderTextColor="#6b7280" />

      <TouchableOpacity onPress={send} disabled={loading || !raw.trim()} style={[s.btn, (!raw.trim()||loading)&&s.btnDisabled]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Enviar a Ingestión → Parser</Text>}
      </TouchableOpacity>

      <Text style={s.hint}>Flujo: Banco → Email → Gmail (reenvío) → Ingestion → RawEvent §12 → Parser §14 → Transaction (pending_ai/review) · Idempotencia por external_id</Text>

      {err && <View style={s.cardErr}><Text style={s.err}>{err}</Text><Text style={s.muted}>¿Backend corriendo? `cd backend; npm run dev` en :3000. Web usa API_URL={API_URL}</Text></View>}

      {res && (
        <>
          <View style={[s.card, res.transaction ? s.cardOk : s.cardWarn]}>
            <Text style={s.h2}>{res.dedup ? "⚠️ Duplicado ignorado" : res.transaction ? "✅ Transaction creada" : "⚠️ Sin monto — revisión manual"}</Text>
            {res.dedup && <Text style={s.muted}>Ya existía external_id {externalId}</Text>}
          </View>

          <View style={s.card}>
            <Text style={s.h2}>Parsed (determinístico §14)</Text>
            <Text style={s.mono}>{JSON.stringify(res.parsed, null, 2)}</Text>
            <Text style={s.h2}>Normalized (500c, RUT oculto)</Text>
            <Text style={s.monoSmall}>{res.normalized}</Text>
          </View>

          {res.transaction && (
            <View style={s.card}>
              <Text style={s.h2}>Transaction</Text>
              <Text style={s.mono}>{JSON.stringify(res.transaction, null, 2)}</Text>
              <Text style={s.muted}>Ve a Movimientos para verla (filtra demo vs real con x-user-id).</Text>
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
