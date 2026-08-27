import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C, R, SP, monthLabel } from "../../theme/tokens";
import { Sheet } from "./Sheet";
import { MIcon } from "./MIcon";
import { fmtCLP } from "../../lib/format";
import { catIcon } from "../../theme/categoryIcons";
import { Category } from "../../lib/categories";
import { Budget } from "../../lib/useShellData";
import { CategoryCircle } from "./CategoryCircle";

type Props = {
  visible: boolean;
  onClose: () => void;
  month: string;
  balance: { income: number; expense: number; balance: number };
  byCat: Record<string, number>;
  budgets: Budget[];
  cats: Category[];
};

const PROMPTS: { id: string; label: string; icon: string }[] = [
  { id: "gastado", label: "¿Cuánto llevo gastado?", icon: "wallet" },
  { id: "top", label: "¿En qué gasto más?", icon: "chart-bar" },
  { id: "presupuesto", label: "¿Voy pasado de presupuesto?", icon: "flag" },
  { id: "balance", label: "¿Cómo va mi balance?", icon: "scale-balance" },
];

export function IASheet({ visible, onClose, month, balance, byCat, budgets, cats }: Props) {
  const [answer, setAnswer] = useState<{ title: string; body: string; detail?: string } | null>(null);

  function handlePrompt(id: string) {
    const ml = monthLabel(month);
    if (id === "gastado") {
      if (balance.expense === 0) {
        setAnswer({ title: "Sin gastos este mes", body: `Aún no registraste gastos en ${ml}.`, detail: `Ingresos: ${fmtCLP(balance.income)} · Balance: ${fmtCLP(balance.balance)}` });
      } else {
        setAnswer({
          title: `Gastado en ${ml}`,
          body: `${fmtCLP(balance.expense)} en gastos`,
          detail: `Ingresos ${fmtCLP(balance.income)} · Balance ${fmtCLP(balance.balance)}${balance.balance < 0 ? " (negativo)" : ""}`,
        });
      }
      return;
    }
    if (id === "top") {
      const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      if (!entries.length) {
        setAnswer({ title: "Sin gastos por categoría", body: `No hay gastos categorizados en ${ml}.` });
        return;
      }
      const [topId, topSpent] = entries[0]!;
      const cat = cats.find(c => c.id === topId);
      const label = cat?.label ?? "Categoría";
      const pct = balance.expense ? Math.round((topSpent / balance.expense) * 100) : 0;
      setAnswer({
        title: `Gastas más en ${label}`,
        body: `${fmtCLP(topSpent)} · ${pct}% del total`,
        detail: entries.length > 1 ? `Siguiente: ${cats.find(c => c.id === entries[1]![0])?.label ?? "?"} ${fmtCLP(entries[1]![1] as number)}` : undefined,
      });
      return;
    }
    if (id === "presupuesto") {
      const catBudgets = budgets.filter(b => b.category_id);
      if (!catBudgets.length) {
        setAnswer({ title: "Sin límites definidos", body: `No tienes presupuestos en ${ml}.`, detail: `Crea límites en Presupuestos → Configurar para controlar cada categoría.` });
        return;
      }
      const over = catBudgets.filter(b => (b.pct ?? 0) >= 100);
      const warn = catBudgets.filter(b => (b.pct ?? 0) >= 70 && (b.pct ?? 0) < 100);
      if (over.length) {
        const names = over.map(b => cats.find(c => c.id === b.category_id)?.label ?? b.categories?.name ?? "?").join(", ");
        setAnswer({ title: `¡${over.length} presupuesto(s) excedido(s)!`, body: names, detail: `Revisa ${over.map(b => `${fmtCLP(b.spent)}/${fmtCLP(b.amount)}`).join(" · ")}` });
        return;
      }
      if (warn.length) {
        const names = warn.map(b => cats.find(c => c.id === b.category_id)?.label ?? "?").join(", ");
        setAnswer({ title: `Cerca del límite`, body: `${names} al ${warn[0]!.pct}%`, detail: `Aún dentro del presupuesto, pero vigila ${warn.length} categoría(s).` });
        return;
      }
      setAnswer({ title: "Vas dentro del presupuesto", body: `${catBudgets.length} categorías controladas`, detail: `Ninguna excede el 70% en ${ml}.` });
      return;
    }
    if (id === "balance") {
      const st = balance.balance < 0 ? "negativo" : balance.balance === 0 ? "en cero" : "positivo";
      setAnswer({
        title: `Balance ${st}`,
        body: fmtCLP(balance.balance),
        detail: `Ingresos ${fmtCLP(balance.income)} − Gastos ${fmtCLP(balance.expense)} = ${fmtCLP(balance.balance)} en ${ml}`,
      });
      return;
    }
  }

  return (
    <Sheet visible={visible} onClose={() => { setAnswer(null); onClose(); }} title="Asistente">
      <View style={s.headerRow}>
        <View style={s.headerIcon}><MIcon name="robot-happy" size={22} color={C.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Pregunta con tus datos reales</Text>
          <Text style={s.headerSub}>Respuestas locales del mes {monthLabel(month)} · sin LLM</Text>
        </View>
      </View>

      <View style={s.promptGrid}>
        {PROMPTS.map(p => (
          <TouchableOpacity key={p.id} style={s.promptBtn} onPress={() => handlePrompt(p.id)} activeOpacity={0.8}>
            <MIcon name={p.icon} size={18} color={C.primary} />
            <Text style={s.promptText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {answer && (
        <View style={s.answerCard}>
          <Text style={s.answerTitle}>{answer.title}</Text>
          <Text style={s.answerBody}>{answer.body}</Text>
          {answer.detail && <Text style={s.answerDetail}>{answer.detail}</Text>}
        </View>
      )}

      {!answer && (
        <Text style={s.hint}>Toca un prompt para ver la respuesta. Los presupuestos se evalúan con <Text style={{ color: C.text, fontWeight: "700" }}>ok &lt;70 · warn 70-99 · over ≥100</Text>.</Text>
      )}

      {answer && (
        <TouchableOpacity style={s.clearBtn} onPress={() => setAnswer(null)}>
          <Text style={s.clearText}>Limpiar</Text>
        </TouchableOpacity>
      )}
    </Sheet>
  );
}
const s = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 999, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(56,189,248,0.2)" },
  headerTitle: { color: C.text, fontWeight: "800", fontSize: 14 },
  headerSub: { color: C.dim, fontSize: 11, marginTop: 2 },
  promptGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  promptBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999 },
  promptText: { color: C.text, fontSize: 13, fontWeight: "600" },
  answerCard: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, gap: 4 },
  answerTitle: { color: C.text, fontWeight: "800", fontSize: 15 },
  answerBody: { color: C.primary, fontWeight: "700", fontSize: 14, marginTop: 2 },
  answerDetail: { color: C.dim, fontSize: 12, marginTop: 4, lineHeight: 16 },
  hint: { color: C.faint, fontSize: 11, lineHeight: 15 },
  clearBtn: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  clearText: { color: C.dim, fontWeight: "700", fontSize: 12 },
});
