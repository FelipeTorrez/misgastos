import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, Alert } from "react-native";
import { useEffect, useState } from "react";
import { fmtCLP, fmtDate } from "../lib/format";
import { API_URL } from "../lib/supabase";
import { Category } from "../lib/categories";
import { C, R } from "../theme/tokens";
import { MIcon } from "../components/ui/MIcon";
import { CategoryCircle } from "../components/ui/CategoryCircle";
import { SwipeRow } from "../components/ui/SwipeRow";
import { toTitleCase } from "./Categorias";

const STATUS_COLORS: Record<string, string> = {
  pending_review: "#f59e0b",
  pending_ai: "#3b82f6",
  confirmed: "#10b981",
  corrected: "#60a5fa",
  duplicate: "#6b7280",
  ignored: "#6b7280",
};

export function Movimientos({ txs, cats, month, filterCategory, onClearFilter, onRefresh }: {
  txs: any[];
  cats: Category[];
  month: string;
  filterCategory?: { id: string; label: string; slug: string } | null;
  onClearFilter?: () => void;
  onRefresh?: () => void;
}) {
  const [local, setLocal] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed">("all");
  const [editingTx, setEditingTx] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { setLocal(txs); }, [txs]);
  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  async function confirmTx(tx: any) {
    setLocal(prev => prev.map(t => (t.id === tx.id ? { ...t, status: "confirmed" } : t)));
    try {
      await fetch(`${API_URL}/v1/transactions/${tx.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "confirmed" }),
      });
    } catch {}
    onRefresh?.();
  }

  async function deleteTx(tx: any) {
    setLocal(prev => prev.filter(t => t.id !== tx.id));
    try {
      await fetch(`${API_URL}/v1/transactions/${tx.id}`, { method: "DELETE" });
    } catch {}
    notify("Movimiento borrado");
    onRefresh?.();
  }

  async function editCategory(tx: any, categoryId: string) {
    const doPatch = async (updateRule: boolean) => {
      const res = await fetch(`${API_URL}/v1/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId, status: "corrected", update_rule: updateRule }),
      }).catch(() => null);
      if (!res || !res.ok) { notify(`Error al corregir categoría`); return; }
      setEditingTx(null);
      onRefresh?.();
    };
    try {
      const rRes = await fetch(`${API_URL}/v1/rules`);
      const rules = rRes.ok ? await rRes.json() : [];
      const norm = (tx.merchant || "").toLowerCase().trim();
      const existing = (rules as any[]).find(r => r.merchant_normalized === norm);
      if (existing && existing.preferred_category_id !== categoryId) {
        const oldLabel = cats.find(c => c.id === existing.preferred_category_id)?.label ?? "otra categoría";
        const newLabel = cats.find(c => c.id === categoryId)?.label ?? categoryId;
        Alert.alert(
          "¿Cambiar preferencia?",
          `Ya tienes una regla: "${toTitleCase(tx.merchant)} → ${oldLabel}". ¿Quieres cambiarla a "${newLabel}" para los próximos movimientos?`,
          [
            { text: `Mantener ${oldLabel}`, style: "cancel", onPress: () => doPatch(false) },
            { text: `Cambiar a ${newLabel}`, onPress: () => doPatch(true) },
          ]
        );
        return;
      }
      await doPatch(true);
    } catch {
      await doPatch(true);
    }
  }

  const filtered = local.filter(tx => {
    if (filterCategory && tx.category_id !== filterCategory.id) return false;
    if (filter === "pending") return tx.status === "pending_review" || tx.status === "pending_ai";
    if (filter === "confirmed") return tx.status === "confirmed" || tx.status === "corrected";
    return true;
  });
  const pendingCount = local.filter(tx => tx.status === "pending_review" || tx.status === "pending_ai").length;

  return (
    <View style={{ flex: 1 }}>
      {toast && (
        <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
      )}

      <View style={s.topBar}>
        <View style={s.filterRow}>
          {(["all", "pending", "confirmed"] as const).map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f === "all" ? "Todas" : f === "pending" ? `Pendientes (${pendingCount})` : "Confirmadas"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {filterCategory && (
          <View style={s.activeFilterWrap}>
            <View style={s.activeFilterChip}>
              <CategoryCircle slug={filterCategory.slug} size={20} />
              <Text style={s.activeFilterLabel}>{filterCategory.label}</Text>
              <TouchableOpacity onPress={onClearFilter} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MIcon name="close" size={14} color={C.dim} />
              </TouchableOpacity>
            </View>
            <Text style={s.activeFilterHint}>Filtrado — toca × para ver todo</Text>
          </View>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        ListEmptyComponent={<Text style={s.muted}>{filterCategory ? "Sin movimientos en esta categoría." : "Aún no hay movimientos este mes. Usa el botón +."}</Text>}
        renderItem={({ item }) => (
          <SwipeRow onDelete={() => deleteTx(item)}>
            <View style={[s.row, item.status === "pending_review" && s.rowPending]}>
              <CategoryCircle slug={item.category_id ? cats.find(c => c.id === item.category_id)?.slug ?? undefined : undefined} size={36} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={s.rowHeader}>
                  <Text style={s.merchant}>{toTitleCase(item.merchant)}</Text>
                  <View style={[s.badge, { backgroundColor: STATUS_COLORS[item.status] ?? "#6b7280" }]}>
                    <Text style={s.badgeText}>{item.status}</Text>
                  </View>
                </View>
                <Text style={s.meta}>{(cats.find(c => c.id === item.category_id)?.label ?? (item.type === "income" ? "Ingreso" : item.type === "transfer" ? "Transferencia" : "Sin categoría"))} · {fmtDate(item.date)}</Text>
              </View>
              <Text style={[s.amount, { color: item.type === "income" ? "#34d399" : "#fff" }]}>{item.type === "income" ? "+" : "-"}{fmtCLP(item.amount)}</Text>
              {(item.status === "pending_review" || item.status === "pending_ai") && (
                <View style={s.actions}>
                  <TouchableOpacity style={s.confirmBtn} onPress={() => confirmTx(item)}><Text style={s.confirmBtnText}>✓</Text></TouchableOpacity>
                  <TouchableOpacity style={s.editBtn} onPress={() => setEditingTx(item)}><Text style={s.editBtnText}>✎</Text></TouchableOpacity>
                </View>
              )}
              {item.status === "confirmed" && (
                <TouchableOpacity style={s.editBtn} onPress={() => setEditingTx(item)}><Text style={s.editBtnText}>✎</Text></TouchableOpacity>
              )}
            </View>
          </SwipeRow>
        )}
      />

      <Modal visible={!!editingTx} transparent animationType="fade" onRequestClose={() => setEditingTx(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Editar categoría</Text>
            <Text style={s.modalMerchant}>{editingTx?.merchant} — {editingTx ? fmtCLP(editingTx.amount) : ""}</Text>
            {cats.map(cat => (
              <TouchableOpacity key={cat.id} style={s.catBtn} onPress={() => editingTx && editCategory(editingTx, cat.id)}>
                <Text style={s.catText}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.catBtn, { backgroundColor: C.surfaceAlt }]} onPress={() => setEditingTx(null)}>
              <Text style={[s.catText, { color: C.dim }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  topBar: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  filterRow: { flexDirection: "row", gap: 8 },
  filterBtn: { backgroundColor: C.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  filterActive: { backgroundColor: C.surface, borderColor: C.primary },
  filterText: { color: C.dim, fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: C.text },
  activeFilterWrap: { alignItems: "flex-start", marginTop: 10, gap: 4 },
  activeFilterChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: "flex-start" },
  activeFilterLabel: { color: C.text, fontWeight: "700", fontSize: 13 },
  activeFilterHint: { color: C.faint, fontSize: 11 },
  toast: { position: "absolute", top: 14, left: 14, right: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 14, borderRadius: R.lg, zIndex: 100 },
  toastText: { color: C.text, fontWeight: "700", textAlign: "center" },
  muted: { color: C.dim, textAlign: "center", marginTop: 40 },
  row: { backgroundColor: C.surface, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center" },
  rowPending: { borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  merchant: { color: C.text, fontWeight: "600" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  meta: { color: C.dim, fontSize: 12 },
  amount: { fontWeight: "800", marginLeft: 8 },
  actions: { flexDirection: "row", marginLeft: 8, gap: 4 },
  confirmBtn: { backgroundColor: "#10b981", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  editBtn: { backgroundColor: C.surfaceAlt, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  editBtnText: { color: C.primary, fontSize: 14, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  modal: { backgroundColor: C.surface, padding: 20, borderRadius: R.lg, width: "88%", borderWidth: 1, borderColor: C.border },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  modalMerchant: { color: C.dim, marginBottom: 16 },
  catBtn: { backgroundColor: C.surfaceAlt, padding: 14, borderRadius: 10, marginBottom: 6 },
  catText: { color: C.text, fontSize: 14 },
});
