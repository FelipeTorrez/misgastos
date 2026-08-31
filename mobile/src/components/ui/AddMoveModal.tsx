import { useState, useEffect } from "react";
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { API_URL } from "../../lib/supabase";
import { C, R } from "../../theme/tokens";
import { Category } from "../../lib/categories";

/** Modal global para agregar Gasto/Ingreso. Disparado por el FAB expandible. */
export function AddMoveModal({ visible, onClose, cats, onAdded, initialType = "expense" }: {
  visible: boolean;
  onClose: () => void;
  cats: Category[];
  onAdded?: () => void;
  initialType?: "expense" | "income";
}) {
  const [type, setType] = useState<"expense" | "income">(initialType);
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setType(initialType);
      setMerchant("");
      setAmount("");
      setCat(null);
      setToast(null);
    }
  }, [visible, initialType]);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  async function save() {
    const amt = parseInt(amount.replace(/\D/g, ""), 10);
    if (!merchant.trim() || !amt) { notify("Completa comercio y monto"); return; }
    try {
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const res = await fetch(`${API_URL}/v1/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: merchant.trim(), amount: amt, type, category_id: cat, date: `${localDate}T12:00:00Z` }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(`Error ${res.status}: ${JSON.stringify(err).slice(0, 120)}`);
        return;
      }
      setMerchant(""); setAmount(""); setCat(null); setType("expense");
      onAdded?.();
      onClose();
    } catch (e: any) {
      notify(`Error de red: ${e?.message ?? e}`);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        {toast && (
          <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
        )}
        <View style={s.modal}>
          <Text style={s.title}>Agregar movimiento</Text>
          <View style={s.typeRow}>
            {(["expense", "income"] as const).map(t => (
              <TouchableOpacity key={t} style={[s.typeBtn, type === t && s.typeActive]} onPress={() => setType(t)}>
                <Text style={[s.typeText, type === t && s.typeTextActive]}>{t === "expense" ? "Gasto" : "Ingreso"}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.input} placeholder="Comercio (ej: Lider)" placeholderTextColor={C.faint} value={merchant} onChangeText={setMerchant} />
          <TextInput style={s.input} placeholder="Monto CLP (ej: 15990)" placeholderTextColor={C.faint} keyboardType="numeric" value={amount} onChangeText={setAmount} />
          <Text style={s.muted}>Categoría (opcional)</Text>
          <View style={s.chipRow}>
            {cats.slice(0, 8).map(c => (
              <TouchableOpacity key={c.id} style={[s.chip, cat === c.id && s.chipActive]} onPress={() => setCat(cat === c.id ? null : c.id)}>
                <Text style={[s.chipText, cat === c.id && s.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.surfaceAlt }]} onPress={onClose}><Text style={s.btnText}>Cancelar</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.primary }]} onPress={save}><Text style={[s.btnText, { color: "#04121F" }]}>Guardar</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  toast: { position: "absolute", top: 16, left: 14, right: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 14, borderRadius: R.lg, zIndex: 100 },
  toastText: { color: C.text, fontWeight: "700", textAlign: "center" },
  modal: { backgroundColor: C.surface, padding: 20, borderRadius: R.lg, width: "88%", borderWidth: 1, borderColor: C.border },
  title: { color: C.text, fontSize: 18, fontWeight: "800", marginBottom: 12 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, padding: 10, borderRadius: R.sm, backgroundColor: C.surfaceAlt, alignItems: "center", borderWidth: 1, borderColor: C.border },
  typeActive: { borderColor: C.primary },
  typeText: { color: C.dim, fontWeight: "600" },
  typeTextActive: { color: C.text },
  input: { backgroundColor: C.surfaceAlt, color: C.text, padding: 12, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  muted: { color: C.dim, fontSize: 11, marginTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  chip: { backgroundColor: C.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.primarySoft, borderColor: C.primary },
  chipText: { color: C.dim, fontSize: 12 },
  chipTextActive: { color: C.primary, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { padding: 14, borderRadius: R.md, alignItems: "center" },
  btnText: { color: C.text, fontWeight: "700" },
});
