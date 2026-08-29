import { View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { fmtCLP, fmtDate } from "../lib/format";
import { API_URL } from "../lib/supabase";
import { Category } from "../lib/categories";
import { C, R } from "../theme/tokens";
import { MIcon } from "../components/ui/MIcon";
import { CategoryCircle } from "../components/ui/CategoryCircle";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SwipeRow } from "../components/ui/SwipeRow";
import { Sheet } from "../components/ui/Sheet";
import { toTitleCase } from "./Categorias";

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
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [savePref, setSavePref] = useState(true);
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

  function openEdit(tx: any) {
    setEditingTx(tx);
    setSelectedCat(tx.category_id ?? null);
    setSavePref(true);
  }

  async function saveCategory() {
    if (!editingTx || !selectedCat) { notify("Elige una categoría"); return; }
    try {
      const res = await fetch(`${API_URL}/v1/transactions/${editingTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: selectedCat, status: "corrected", update_rule: savePref }),
      }).catch(() => null);
      if (!res || !res.ok) { notify("Error al guardar categoría"); return; }
      setEditingTx(null);
      onRefresh?.();
      notify(savePref ? "Categoría y preferencia guardadas" : "Categoría actualizada");
    } catch {
      notify("Error de red");
    }
  }

  const filtered = local.filter(tx => {
    if (filterCategory && tx.category_id !== filterCategory.id) return false;
    if (filter === "pending") return tx.status === "pending_review" || tx.status === "pending_ai";
    if (filter === "confirmed") return tx.status === "confirmed" || tx.status === "corrected";
    return true;
  });
  const pendingCount = local.filter(tx => tx.status === "pending_review" || tx.status === "pending_ai").length;
  const isPending = (tx: any) => tx.status === "pending_review" || tx.status === "pending_ai";

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
            <Pressable style={({ pressed }) => [s.row, isPending(item) && s.rowPending, pressed && { opacity: 0.75 }]} onPress={() => openEdit(item)}>
              <View style={{ flexShrink: 0 }}>
                <CategoryCircle slug={item.category_id ? cats.find(c => c.id === item.category_id)?.slug ?? undefined : undefined} size={36} />
              </View>
              <View style={s.center}>
                <View style={s.rowHeader}>
                  <Text style={s.merchant} numberOfLines={1} ellipsizeMode="tail">{toTitleCase(item.merchant)}</Text>
                  <View style={{ flexShrink: 0 }}>
                    <StatusBadge status={item.status} />
                  </View>
                </View>
                <Text style={s.meta} numberOfLines={1} ellipsizeMode="tail">{(item.counterparty ? `Recibido de ${item.counterparty}` : (cats.find(c => c.id === item.category_id)?.label ?? (item.type === "income" ? "Ingreso" : item.type === "transfer" ? "Transferencia" : "Sin categoría")))} · {fmtDate(item.date)}</Text>
              </View>
              {(() => {
                const sign = item.type === "income" ? "+" : item.type === "transfer" ? "±" : "-";
                const color = item.type === "income" ? "#34d399" : item.type === "transfer" ? C.dim : "#fff";
                return <Text style={[s.amount, { color }]}>{sign}{fmtCLP(item.amount)}</Text>;
              })()}
              {isPending(item) ? (
                <TouchableOpacity style={s.confirmBtn} onPress={() => confirmTx(item)}><Text style={s.confirmBtnText}>✓</Text></TouchableOpacity>
              ) : (
                <MIcon name="chevron-right" size={18} color={C.faint} />
              )}
            </Pressable>
          </SwipeRow>
        )}
      />

      <Sheet visible={!!editingTx} onClose={() => setEditingTx(null)} title="Categoría del movimiento">
        {editingTx && (
          <>
            <View style={s.summary}>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryMerchant} numberOfLines={1} ellipsizeMode="tail">{toTitleCase(editingTx.merchant)}</Text>
                <Text style={s.summaryMeta}>{fmtDate(editingTx.date)} · {fmtCLP(editingTx.amount)}</Text>
              </View>
              <StatusBadge status={editingTx.status} />
            </View>

            <Text style={s.hint}>Elige una categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
              {cats.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.catChip, selectedCat === c.id && s.catChipActive]}
                  onPress={() => setSelectedCat(c.id)}
                >
                  <CategoryCircle slug={c.slug} size={34} />
                  <Text style={[s.catChipLabel, selectedCat === c.id && s.catChipLabelActive]} numberOfLines={1}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={s.toggleRow} onPress={() => setSavePref(p => !p)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Guardar para este comercio</Text>
                <Text style={s.toggleSub} numberOfLines={2}>Aplicar a futuros movimientos de "{toTitleCase(editingTx.merchant)}"</Text>
              </View>
              <View style={[s.switch, savePref && s.switchOn]}>
                <View style={[s.switchThumb, savePref && s.switchThumbOn]} />
              </View>
            </TouchableOpacity>

            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.surfaceAlt }]} onPress={() => setEditingTx(null)}>
                <Text style={s.btnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.primary, opacity: selectedCat ? 1 : 0.5 }]} onPress={saveCategory} disabled={!selectedCat}>
                <Text style={[s.btnText, { color: "#04121F" }]}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </Sheet>
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
  row: { backgroundColor: C.surface, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 68 },
  rowPending: { borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  center: { flex: 1, minWidth: 0, justifyContent: "center" },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  merchant: { color: C.text, fontWeight: "600", flex: 1, minWidth: 0 },
  meta: { color: C.dim, fontSize: 12 },
  amount: { fontWeight: "800", flexShrink: 0 },
  confirmBtn: { backgroundColor: "#10b981", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, padding: 12, borderRadius: R.md },
  summaryMerchant: { color: C.text, fontWeight: "700", fontSize: 15 },
  summaryMeta: { color: C.dim, fontSize: 12, marginTop: 2 },
  hint: { color: C.faint, fontSize: 11, marginTop: 8, marginBottom: 6 },
  catScroll: { gap: 10, paddingVertical: 4, paddingRight: 16, paddingBottom: 4 },
  catChip: { alignItems: "center", gap: 6, padding: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, width: 92, marginRight: 8 },
  catChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  catChipLabel: { color: C.dim, fontSize: 11, fontWeight: "600", textAlign: "center" },
  catChipLabelActive: { color: C.primary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 12, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  toggleLabel: { color: C.text, fontWeight: "700", fontSize: 13 },
  toggleSub: { color: C.dim, fontSize: 11, marginTop: 2 },
  switch: { width: 46, height: 28, borderRadius: 999, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: C.primary, borderColor: C.primary },
  switchThumb: { width: 20, height: 20, borderRadius: 999, backgroundColor: C.dim, alignSelf: "flex-start" },
  switchThumbOn: { alignSelf: "flex-end", backgroundColor: "#04121F" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { padding: 14, borderRadius: R.md, alignItems: "center" },
  btnText: { color: C.text, fontWeight: "700" },
});
