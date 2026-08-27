import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, TextInput } from "react-native";
import { useEffect, useState } from "react";
import { API_URL } from "../lib/supabase";
import { fetchCategories, Category } from "../lib/categories";

export function Reglas() {
  const [rules, setRules] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [newMerchant, setNewMerchant] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadRules();
    fetchCategories().then(setCategories);
  }, []);

  async function loadRules() {
    try {
      const res = await fetch(`${API_URL}/v1/rules`);
      if (!res.ok) { setRules([]); return; }
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch { setRules([]); }
  }

  async function createRule(categoryId: string) {
    const merchant = newMerchant.trim().toLowerCase();
    if (!merchant) {
      Alert.alert("Falta merchant", "Escribe o selecciona un merchant primero.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/v1/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_normalized: merchant, preferred_category_id: categoryId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Error al crear regla", `Backend respondió ${res.status}: ${JSON.stringify(err)}`);
        return;
      }
      setNewMerchant("");
      setShowCreate(false);
      loadRules();
    } catch (e: any) {
      Alert.alert("Error de red", `No se pudo conectar a ${API_URL}: ${e?.message ?? e}`);
    }
  }

  async function updateRule(ruleId: string, categoryId: string) {
    try {
      const res = await fetch(`${API_URL}/v1/rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_category_id: categoryId }),
      });
      if (!res.ok) {
        Alert.alert("Error", `No se pudo actualizar (HTTP ${res.status})`);
        return;
      }
      setEditingRule(null);
      loadRules();
    } catch (e: any) {
      Alert.alert("Error de red", String(e?.message ?? e));
    }
  }

  async function deleteRule(ruleId: string) {
    Alert.alert("Eliminar regla", "¿Estás seguro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        try {
          await fetch(`${API_URL}/v1/rules/${ruleId}`, { method: "DELETE" });
          loadRules();
        } catch {}
      }}
    ]);
  }

  function getCategoryLabel(catId: string) {
    return categories.find(c => c.id === catId)?.label ?? catId;
  }

  // Edit mode
  if (editingRule) {
    return (
      <View style={s.bg}>
        <Text style={s.title}>Editar Regla</Text>
        <Text style={s.muted}>Merchant: {editingRule.merchant_normalized}</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>Cambiar categoría a:</Text>
        {categories.map(cat => (
          <TouchableOpacity key={cat.id} style={[s.catBtn, editingRule.preferred_category_id === cat.id && s.catActive]} onPress={() => updateRule(editingRule.id, cat.id)}>
            <Text style={[s.catText, editingRule.preferred_category_id === cat.id && s.catTextActive]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.btn, { backgroundColor: "#6b7280", marginTop: 12 }]} onPress={() => setEditingRule(null)}>
          <Text style={s.btnText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Create mode
  if (showCreate) {
    return (
      <View style={s.bg}>
        <Text style={s.title}>Nueva Regla</Text>
        <Text style={s.muted}>Merchant (ej: spotify, uber, lider):</Text>
        <View style={s.inputRow}>
          {["spotify", "uber", "jumbo", "netflix"].map(m => (
            <TouchableOpacity key={m} style={s.chip} onPress={() => setNewMerchant(m)}>
              <Text style={s.chipText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={s.input}
          value={newMerchant}
          onChangeText={setNewMerchant}
          placeholder="Escribe o selecciona..."
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[s.muted, { marginTop: 12 }]}>Categoría preferida:</Text>
        {categories.map(cat => (
          <TouchableOpacity key={cat.id} style={s.catBtn} onPress={() => createRule(cat.id)}>
            <Text style={s.catText}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[s.btn, { backgroundColor: "#6b7280", marginTop: 12 }]} onPress={() => { setShowCreate(false); setNewMerchant(""); }}>
          <Text style={s.btnText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.bg}>
      <Text style={s.title}>Reglas Personales</Text>
      <Text style={s.muted}>Merchant → Categoría. El AI las aplicará automáticamente.</Text>

      <FlatList
        data={rules}
        keyExtractor={i => i.id}
        ListEmptyComponent={<Text style={[s.muted, { marginTop: 40, textAlign: "center" }]}>No hay reglas aún. Crea una para empezar.</Text>}
        renderItem={({ item }) => (
          <View style={s.ruleCard}>
            <View style={{ flex: 1 }}>
              <Text style={s.ruleMerchant}>{item.merchant_normalized}</Text>
              <Text style={s.ruleCat}>→ {getCategoryLabel(item.preferred_category_id)}</Text>
              {item.hits_count > 0 && <Text style={s.ruleHits}>Usada {item.hits_count} vez{item.hits_count > 1 ? "es" : ""}</Text>}
            </View>
            <TouchableOpacity style={s.editBtn} onPress={() => setEditingRule(item)}>
              <Text style={s.editBtnText}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.deleteBtn} onPress={() => deleteRule(item.id)}>
              <Text style={s.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
        <Text style={s.fabText}>+ Nueva Regla</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0b0e14", padding: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 4 },
  muted: { color: "#9ca3af", fontSize: 13, marginBottom: 8 },
  ruleCard: { backgroundColor: "#111827", padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  ruleMerchant: { color: "#fff", fontWeight: "700", fontSize: 16 },
  ruleCat: { color: "#10b981", fontSize: 13, marginTop: 2 },
  ruleHits: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  editBtn: { backgroundColor: "#1f2937", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  editBtnText: { color: "#60a5fa", fontSize: 13, fontWeight: "600" },
  deleteBtn: { backgroundColor: "#1f2937", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  deleteBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  catBtn: { backgroundColor: "#1f2937", padding: 12, borderRadius: 10, marginBottom: 6 },
  catText: { color: "#d1d5db", fontSize: 14 },
  catActive: { backgroundColor: "#10b981" },
  catTextActive: { color: "#fff", fontWeight: "700" },
  btn: { padding: 14, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  inputRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { backgroundColor: "#1f2937", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  chipText: { color: "#9ca3af", fontSize: 13 },
  input: { backgroundColor: "#1f2937", padding: 12, borderRadius: 10, color: "#fff", fontSize: 14, marginBottom: 8 },
  fab: { position: "absolute", right: 16, bottom: 24, backgroundColor: "#10b981", paddingHorizontal: 20, paddingVertical: 14, borderRadius: 28 },
  fabText: { color: "#fff", fontWeight: "800" },
});
