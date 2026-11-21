import { View, Text, FlatList, ScrollView, StyleSheet, TextInput, TouchableOpacity, Pressable } from "react-native";
import { useEffect, useState } from "react";
import { fmtCLP, fmtDate, fmtWallDate, shortDate } from "../lib/format";
import { filterTxs } from "../lib/search";
import { isDescartado, splitDescartados } from "../lib/visibleTxs";
import { API_URL } from "../lib/supabase";
import { Category } from "../lib/categories";
import { C, R, T } from "../theme/tokens";
import { needsAudit, provenanceLabel } from "../lib/classification";
import { reviewQueue } from "../lib/audit";
import { MIcon } from "../components/ui/MIcon";
import { CategoryCircle } from "../components/ui/CategoryCircle";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SwipeRow } from "../components/ui/SwipeRow";
import { Sheet } from "../components/ui/Sheet";
import { toTitleCase } from "./Categorias";

function ClassificationChip({ tx }: { tx: any }) {
  const audit = needsAudit(tx ?? {});
  return (
    <View style={[s.classChip, audit && s.classChipAudit]}>
      <Text style={[s.classChipText, audit && s.classChipTextAudit]}>{provenanceLabel(tx ?? {})}</Text>
    </View>
  );
}

export function Movimientos({ txs, truncated, limit, cats, month, filterCategory, onClearFilter, onRefresh }: {
  txs: any[];
  truncated?: boolean;
  limit?: number;
  cats: Category[];
  month: string;
  filterCategory?: { id: string; label: string; slug: string } | null;
  onClearFilter?: () => void;
  onRefresh?: () => void;
}) {
  const [local, setLocal] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "review">("all");
  const [q, setQ] = useState("");
  const [showDescartados, setShowDescartados] = useState(false);
  const [editingTx, setEditingTx] = useState<any>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [savePref, setSavePref] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [rawEvent, setRawEvent] = useState<any>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [rawTextExpanded, setRawTextExpanded] = useState(false);

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
    setRawEvent(null);
    setRawError(null);
    setRawLoading(false);
    setRawExpanded(false);
    setRawTextExpanded(false);
  }

  async function loadRawEvent() {
    if (rawEvent) { setRawExpanded(v => !v); return; }
    if (!editingTx || rawLoading) return;
    setRawLoading(true);
    setRawError(null);
    try {
      const res = await fetch(`${API_URL}/v1/transactions/${editingTx.id}`).catch(() => null);
      if (!res || !res.ok) { setRawError("No se pudo cargar el correo original"); return; }
      const j = await res.json().catch(() => null);
      if (!j?.raw_event) { setRawError("Este movimiento no tiene correo original guardado"); return; }
      setRawEvent(j.raw_event);
      setRawExpanded(true);
    } catch {
      setRawError("Error de red");
    } finally {
      setRawLoading(false);
    }
  }

  // Recupera un falso duplicado/descartado: la dedup lo sacó del balance por
  // error y queda oculto en "Ver descartados". Vuelve a confirmed sin vínculo.
  async function restoreTx() {
    if (!editingTx) return;
    try {
      const res = await fetch(`${API_URL}/v1/transactions/${editingTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      }).catch(() => null);
      if (!res || !res.ok) { notify("No se pudo recuperar el movimiento"); return; }
      setLocal(prev => prev.map(t => (t.id === editingTx.id ? { ...t, status: "confirmed", duplicate_of: null } : t)));
      setEditingTx(null);
      onRefresh?.();
      notify("Movimiento recuperado");
    } catch {
      notify("Error de red");
    }
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

  const { visibles, descartados } = splitDescartados(local);
  const base = showDescartados ? local : visibles;
  const filtered = base.filter(tx => {
    if (filterCategory && tx.category_id !== filterCategory.id) return false;
    if (filter === "pending") return tx.status === "pending_review" || tx.status === "pending_ai";
    if (filter === "confirmed") return tx.status === "confirmed" || tx.status === "corrected";
    return true;
  });
  // La búsqueda por comercio filtra sobre la lista ya cargada (no dispara red);
  // complementa el aviso de truncado: solo busca dentro de los movimientos visibles.
  const searched = filterTxs(filtered, q);
  const reviewCount = reviewQueue(base).count;
  const displayed = filter === "review" ? reviewQueue(searched).items : searched;
  const searching = q.trim().length > 0;
  const pendingCount = base.filter(tx => tx.status === "pending_review" || tx.status === "pending_ai").length;
  const isPending = (tx: any) => tx.status === "pending_review" || tx.status === "pending_ai";  const reviewReason = (tx: any): string | null => tx.review_reason ?? tx.metadata?.review_reason ?? null;
  const reviewLabel = (r: string | null) =>
    r === "payment_processor"
      ? "Procesador de pago: el banco no muestra el comercio real — elige la categoría."
      : r ? `Motivo: ${r}` : null;

  return (
    <View style={{ flex: 1 }}>
      {toast && (
        <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>
      )}

      <View style={s.topBar}>
        <View style={s.filterRow}>
          {(["all", "pending", "confirmed", "review"] as const).map(f => (
            <TouchableOpacity key={f} style={[s.filterBtn, filter === f && s.filterActive]} onPress={() => setFilter(f)}>
              <Text style={[s.filterText, filter === f && s.filterTextActive]}>
                {f === "all" ? "Todas" : f === "pending" ? `Pendientes (${pendingCount})` : f === "confirmed" ? "Confirmadas" : `Revisar (${reviewCount})`}
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
        <View style={s.searchBox}>
          <MIcon name="magnify" size={16} color={C.faint} />
          <TextInput
            style={s.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Buscar comercio o monto"
            placeholderTextColor={C.faint}
            returnKeyType="search"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MIcon name="close" size={16} color={C.dim} />
            </TouchableOpacity>
          )}
        </View>
        {descartados.length > 0 && (
          <TouchableOpacity onPress={() => setShowDescartados(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.descartadosToggle}>
              {showDescartados ? "Ocultar descartados" : `Ver descartados (${descartados.length})`}
            </Text>
          </TouchableOpacity>
        )}
        {searching && <Text style={s.searchCount}>{displayed.length} movimientos</Text>}
      </View>

      <FlatList
        data={displayed}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        ListHeaderComponent={truncated ? (
          <Text style={s.truncatedBanner}>Mostrando los {limit ?? 100} movimientos más recientes de este periodo</Text>
        ) : null}
        ListEmptyComponent={<Text style={s.muted}>{searching ? `Sin resultados para "${q.trim()}"` : filter === "review" ? "Nada por revisar." : filterCategory ? "Sin movimientos en esta categoría." : "Aún no hay movimientos este mes. Usa el botón +."}</Text>}
        renderItem={({ item }) => {
          const needsAction = item.status === "pending_review" || item.status === "pending_ai";
          return (
          <SwipeRow onDelete={() => deleteTx(item)}>
            <Pressable style={({ pressed }) => [s.row, isPending(item) && s.rowPending, pressed && { opacity: 0.75 }]} onPress={() => openEdit(item)}>
              <View style={{ flexShrink: 0 }}>
                <CategoryCircle slug={item.category_id ? cats.find(c => c.id === item.category_id)?.slug ?? undefined : undefined} size={36} />
              </View>
              <View style={s.center}>
                <View style={s.rowHeader}>
                  <Text style={s.merchant} numberOfLines={1} ellipsizeMode="tail">{toTitleCase(item.merchant)}</Text>
                </View>
                <View style={s.metaRow}>
                  {needsAction || (showDescartados && isDescartado(item)) ? (
                    <View style={{ flexShrink: 0 }}>
                      <StatusBadge status={item.status} />
                    </View>
                  ) : (
                    <ClassificationChip tx={item} />
                  )}
                  <Text style={s.meta} numberOfLines={1} ellipsizeMode="tail">{(item.counterparty ? `Recibido de ${item.counterparty}` : (cats.find(c => c.id === item.category_id)?.label ?? (item.type === "income" ? "Ingreso" : item.type === "transfer" ? "Transferencia" : "Sin categoría")))} · {shortDate(item.date)}</Text>
                </View>
                {showDescartados && item.status === "duplicate" && item.duplicate_of && (
                  <Text style={s.duplicateOf} numberOfLines={1} ellipsizeMode="tail">
                    {(() => {
                      const orig = local.find(t => t.id === item.duplicate_of)?.merchant;
                      return orig ? `Duplicado de ${toTitleCase(orig)}` : "Duplicado de otro movimiento";
                    })()}
                  </Text>
                )}
                {isPending(item) && reviewLabel(reviewReason(item)) && (
                  <Text style={s.reviewReason} numberOfLines={2} ellipsizeMode="tail">{reviewLabel(reviewReason(item))}</Text>
                )}
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
          );
        }}
      />

      <Sheet visible={!!editingTx} onClose={() => setEditingTx(null)} title="Categoría del movimiento">
        {editingTx && (
          <>
            <View style={s.summary}>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryMerchant} numberOfLines={1} ellipsizeMode="tail">{toTitleCase(editingTx.merchant)}</Text>
                <Text style={s.summaryMeta}>{fmtWallDate(editingTx.date)} · {fmtCLP(editingTx.amount)}</Text>
              </View>
              <View style={s.summaryBadges}>
                <StatusBadge status={editingTx.status} />
                <ClassificationChip tx={editingTx} />
              </View>
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

            <TouchableOpacity style={s.rawBtn} onPress={loadRawEvent} activeOpacity={0.8}>
              <MIcon name="email-outline" size={16} color={C.primary} />
              <Text style={s.rawBtnText}>
                {rawLoading ? "Cargando correo…" : rawEvent ? (rawExpanded ? "Ocultar correo original" : "Ver correo original") : "Ver correo original"}
              </Text>
            </TouchableOpacity>
            {rawError && <Text style={s.rawError}>{rawError}</Text>}
            {rawEvent && rawExpanded && (
              <View style={s.rawBox}>
                <Text style={s.rawMeta} numberOfLines={1} ellipsizeMode="tail">
                  {rawEvent.sender ?? "Remitente desconocido"}{rawEvent.received_at ? ` · ${fmtDate(rawEvent.received_at)}` : ""}
                </Text>
                {!!rawEvent.subject && <Text style={s.rawSubject} numberOfLines={1} ellipsizeMode="tail">{rawEvent.subject}</Text>}
                <Text style={s.rawContent} numberOfLines={rawTextExpanded ? undefined : 4}>{rawEvent.raw_content}</Text>
                <TouchableOpacity onPress={() => setRawTextExpanded(v => !v)} activeOpacity={0.8}>
                  <Text style={s.rawToggle}>{rawTextExpanded ? "Ver menos" : "Ver más"}</Text>
                </TouchableOpacity>
              </View>
            )}

            {(editingTx.status === "duplicate" || editingTx.status === "ignored") && (
              <TouchableOpacity style={s.restoreBtn} onPress={restoreTx} activeOpacity={0.8}>
                <MIcon name="backup-restore" size={16} color={C.primary} />
                <Text style={s.restoreBtnText}>No era duplicado · recuperarlo</Text>
              </TouchableOpacity>
            )}

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
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterBtn: { backgroundColor: C.surfaceAlt, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  filterActive: { backgroundColor: C.surface, borderColor: C.primary },
  filterText: { color: C.dim, fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: C.text },
  activeFilterWrap: { alignItems: "flex-start", marginTop: 10, gap: 4 },
  activeFilterChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: "flex-start" },
  activeFilterLabel: { color: C.text, fontWeight: "700", fontSize: 13 },
  activeFilterHint: { color: C.faint, fontSize: 11 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  searchInput: { flex: 1, color: C.text, fontSize: 14, padding: 0 },
  searchCount: { color: C.dim, fontSize: 12, marginTop: 6 },
  descartadosToggle: { color: C.faint, fontSize: 12, marginTop: 6, textDecorationLine: "underline" },
  duplicateOf: { color: C.faint, fontSize: 11, marginTop: 2 },
  toast: { position: "absolute", top: 14, left: 14, right: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 14, borderRadius: R.lg, zIndex: 100 },
  toastText: { color: C.text, fontWeight: "700", textAlign: "center" },
  muted: { color: C.dim, textAlign: "center", marginTop: 40 },
  truncatedBanner: { color: C.dim, fontSize: 12, textAlign: "center", marginBottom: 12 },
  row: { backgroundColor: C.surface, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 68 },
  rowPending: { borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  center: { flex: 1, minWidth: 0, justifyContent: "center" },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flex: 1 },
  badges: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  classChip: { flexShrink: 0, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  classChipAudit: { backgroundColor: "rgba(251,191,36,0.14)", borderColor: "rgba(251,191,36,0.35)" },
  classChipText: { fontSize: 11, fontWeight: "700", color: C.dim },
  classChipTextAudit: { color: C.warning },
  merchant: { color: C.text, fontWeight: "600", flex: 1, minWidth: 0 },
  meta: { color: C.dim, fontSize: 12, flex: 1, minWidth: 0 },
  reviewReason: { color: "#f59e0b", fontSize: 11, marginTop: 2 },
  amount: { ...T.num, fontWeight: "800", flexShrink: 0 },
  confirmBtn: { backgroundColor: "#10b981", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, padding: 12, borderRadius: R.md },
  summaryBadges: { alignItems: "flex-end", gap: 6 },
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
  rawBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, padding: 12, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  rawBtnText: { color: C.primary, fontWeight: "700", fontSize: 13 },
  rawError: { color: C.warning, fontSize: 12, marginTop: 8 },
  rawBox: { marginTop: 8, padding: 12, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, gap: 6 },
  rawMeta: { color: C.dim, fontSize: 12 },
  rawSubject: { color: C.text, fontWeight: "700", fontSize: 13 },
  rawContent: { color: C.text, fontSize: 12, lineHeight: 17 },
  rawToggle: { color: C.primary, fontWeight: "700", fontSize: 12, marginTop: 2 },
  restoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, padding: 12, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.primary },
  restoreBtnText: { color: C.primary, fontWeight: "700", fontSize: 13 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { padding: 14, borderRadius: R.md, alignItems: "center" },
  btnText: { color: C.text, fontWeight: "700" },
});
