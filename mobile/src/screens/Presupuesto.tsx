import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Pressable } from "react-native";
import { C, R, shiftMonth, monthLabel } from "../theme/tokens";
import { Budget } from "../lib/useShellData";
import { Category } from "../lib/categories";
import { CategoryCircle } from "../components/ui/CategoryCircle";
import { Progress } from "../components/ui/Progress";
import { Sheet } from "../components/ui/Sheet";
import { SwipeRow } from "../components/ui/SwipeRow";
import { MIcon } from "../components/ui/MIcon";
import { API_URL } from "../lib/supabase";
import { fmtCLP } from "../lib/format";

export function Presupuesto({ budgets, cats, month, onRefresh }: {
  budgets: Budget[];
  cats: Category[];
  month: string;
  onRefresh?: () => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const expenseCats = cats.filter(c => c.type === "expense");
  const rows = useMemo(() => {
    return budgets
      .filter((b): b is Budget => Boolean(b.category_id))
      .slice()
      .sort((a, b) => b.amount - a.amount || (a.categories?.name ?? "").localeCompare(b.categories?.name ?? "", "es"));
  }, [budgets]);
  const selected = cats.find(c => c.id === selectedId);
  const existing = budgets.find(b => b.category_id === selectedId) as Budget | undefined;

  function catForBudget(b: Budget): Category {
    return cats.find(c => c.id === b.category_id) ?? { id: b.category_id!, label: b.categories?.name ?? "", slug: b.categories?.slug ?? "", type: "expense" };
  }
  function openConfig() { setConfigOpen(true); setSelectedId(null); setAmountText(""); }
  function pickCat(c: Category) {
    setSelectedId(c.id);
    const b = budgets.find(x => x.category_id === c.id);
    setAmountText(b ? String(b.amount) : "");
  }
  function editBudget(b: Budget) { pickCat(catForBudget(b)); setConfigOpen(true); }

  async function save() {
    if (!selectedId) return;
    const amt = parseInt(amountText.replace(/\D/g, ""), 10);
    if (!amt) { notify("Ingresa un monto válido"); return; }
    try {
      const res = await fetch(`${API_URL}/v1/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: selectedId, amount: amt, month: `${month}-01` }),
      });
      if (!res.ok) { notify("No se pudo guardar el límite"); return; }
      setConfigOpen(false);
      onRefresh?.();
      notify("Límite guardado");
    } catch { notify("Error de red"); }
  }

  async function deleteBudget(b: Budget, closeAfter?: boolean) {
    try {
      const res = await fetch(`${API_URL}/v1/budgets/${b.id}`, { method: "DELETE" });
      if (!res.ok) { notify("No se pudo quitar el límite"); return; }
      if (closeAfter) setConfigOpen(false);
      onRefresh?.();
      notify("Límite eliminado");
    } catch { notify("Error de red"); }
  }

  async function copyPrev() {
    const prev = shiftMonth(month, -1);
    try {
      const res = await fetch(`${API_URL}/v1/budgets?month=${prev}-01`);
      const list = res.ok ? await res.json() : [];
      const withCat = (Array.isArray(list) ? list : []).filter((b: any) => b.category_id);
      if (withCat.length === 0) { notify(`No hay presupuestos en ${monthLabel(prev)} para copiar`); return; }
      let ok = 0;
      for (const b of withCat) {
        if (budgets.find(x => x.category_id === b.category_id)) continue;
        const r = await fetch(`${API_URL}/v1/budgets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category_id: b.category_id, amount: b.amount, month: `${month}-01` }),
        });
        if (r.ok) ok++;
      }
      onRefresh?.();
      notify(ok > 0 ? `${ok} presupuestos importados desde ${monthLabel(prev)}` : "Nada nuevo para importar (ya estaban definidos)");
    } catch { notify("Error de red al copiar"); }
  }

  const preview = amountText ? parseInt(amountText.replace(/\D/g, ""), 10) : 0;

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
      {toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}

      <View style={s.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Metas & Presupuestos</Text>
          <Text style={s.subtitle}>Límites mensuales por categoría</Text>
        </View>
        <TouchableOpacity style={s.configBtn} onPress={openConfig} activeOpacity={0.8}>
          <MIcon name="cog" size={14} color="#04121F" />
          <Text style={s.configText}>Configurar</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.hint}>Desliza para borrar · Toca para editar</Text>

      {rows.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}><MIcon name="target" size={28} color={C.primary} /></View>
          <Text style={s.emptyTitle}>Aún no has definido límites</Text>
          <Text style={s.emptySub}>Configura tus categorías o copia las del mes anterior.</Text>
          <View style={s.emptyBtns}>
            <TouchableOpacity style={s.primaryBtn} onPress={openConfig} activeOpacity={0.85}>
              <MIcon name="cog" size={14} color="#04121F" />
              <Text style={s.primaryBtnText}>Configurar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={copyPrev} activeOpacity={0.85}>
              <MIcon name="content-copy" size={14} color={C.primary} />
              <Text style={s.ghostBtnText}>Copiar del mes anterior</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 8 }}>
          {rows.map(b => {
            const cat = cats.find(c => c.id === b.category_id);
            const slug = b.categories?.slug ?? cat?.slug;
            const name = b.categories?.name ?? cat?.label ?? "Categoría";
            return (
              <SwipeRow key={b.id} onDelete={() => deleteBudget(b)}>
                <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} onPress={() => editBudget(b)}>
                  <CategoryCircle slug={slug} size={40} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={s.rowHead}>
                      <Text style={s.name}>{name}</Text>
                      <Text style={s.spent}>{fmtCLP(b.spent)}</Text>
                    </View>
                    <Text style={s.limit}>de {fmtCLP(b.amount)}</Text>
                    <View style={{ marginTop: 8 }}>
                      <Progress pct={b.pct ?? 0} height={7} />
                    </View>
                  </View>
                  <MIcon name="chevron-right" size={18} color={C.faint} />
                </Pressable>
              </SwipeRow>
            );
          })}
        </View>
      )}

      <Sheet visible={configOpen} onClose={() => setConfigOpen(false)} title="Configurar límites">
        <Text style={s.hint}>Elige una categoría y define su límite mensual</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
          {expenseCats.map(c => (
            <TouchableOpacity
              key={c.id}
              style={[s.catChip, selectedId === c.id && s.catChipActive]}
              onPress={() => pickCat(c)}
            >
              <CategoryCircle slug={c.slug} size={34} />
              <Text style={[s.catChipLabel, selectedId === c.id && s.catChipLabelActive]} numberOfLines={1}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {selected ? (
          <View style={{ marginTop: 8 }}>
            <Text style={s.limLabel}>Límite mensual — {selected.label}</Text>
            <View style={s.amtRow}>
              <TextInput
                style={s.input}
                placeholder="0"
                placeholderTextColor={C.faint}
                keyboardType="numeric"
                value={amountText}
                onChangeText={setAmountText}
                autoFocus
              />
              <Text style={s.clp}>CLP</Text>
            </View>
            {preview > 0 && <Text style={s.preview}>{fmtCLP(preview)}</Text>}

            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.surfaceAlt }]} onPress={() => setConfigOpen(false)}>
                <Text style={s.btnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.primary }]} onPress={save}>
                <Text style={[s.btnText, { color: "#04121F" }]}>Guardar</Text>
              </TouchableOpacity>
            </View>

            {existing && (
              <TouchableOpacity style={s.removeBtn} onPress={() => existing && deleteBudget(existing, true)}>
                <MIcon name="trash-can" size={15} color={C.negative} />
                <Text style={s.removeText}>Quitar límite ({fmtCLP(existing.amount)})</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={s.hint}>Toca una categoría para continuar</Text>
        )}
      </Sheet>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  toast: { position: "absolute", top: 10, left: 0, right: 0, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 12, borderRadius: R.lg, zIndex: 50 },
  toastText: { color: C.text, fontWeight: "700", textAlign: "center" },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: C.text, fontSize: 18, fontWeight: "800" },
  subtitle: { color: C.dim, fontSize: 12, marginTop: 2 },
  hint: { color: C.faint, fontSize: 11, marginTop: 8, marginBottom: 6 },
  configBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill },
  configText: { color: "#04121F", fontWeight: "800", fontSize: 12 },
  row: { backgroundColor: C.surface, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center" },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: C.text, fontWeight: "700", fontSize: 15 },
  spent: { color: C.text, fontWeight: "800", fontSize: 14 },
  limit: { color: C.dim, fontSize: 12, marginTop: 1 },
  empty: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 16, gap: 6 },
  emptyIcon: { width: 64, height: 64, borderRadius: 999, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptySub: { color: C.dim, fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyBtns: { marginTop: 16, gap: 10, width: "100%", alignItems: "center" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 11, borderRadius: R.pill },
  primaryBtnText: { color: "#04121F", fontWeight: "800", fontSize: 13 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: C.primary },
  ghostBtnText: { color: C.primary, fontWeight: "700", fontSize: 13 },
  catScroll: { gap: 10, paddingVertical: 4, paddingRight: 16, paddingBottom: 4 },
  catChip: { alignItems: "center", gap: 6, padding: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, width: 92, marginRight: 8 },
  catChipActive: { borderColor: C.primary, backgroundColor: C.primarySoft },
  catChipLabel: { color: C.dim, fontSize: 11, fontWeight: "600", textAlign: "center" },
  catChipLabelActive: { color: C.primary },
  limLabel: { color: C.text, fontWeight: "700", fontSize: 13, marginBottom: 4 },
  amtRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  input: { flex: 1, backgroundColor: C.surfaceAlt, color: C.text, padding: 12, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, fontSize: 16, fontWeight: "700" },
  clp: { color: C.dim, fontWeight: "800", fontSize: 14 },
  preview: { color: C.primary, fontWeight: "700", fontSize: 14, marginTop: 8 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { padding: 14, borderRadius: R.md, alignItems: "center" },
  btnText: { color: C.text, fontWeight: "700" },
  removeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, padding: 12, borderRadius: R.md, backgroundColor: "rgba(248,113,113,0.10)", borderWidth: 1, borderColor: C.negative },
  removeText: { color: C.negative, fontWeight: "700", fontSize: 13 },
});
