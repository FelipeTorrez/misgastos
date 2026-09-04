import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C, R, SP, monthLabel } from "../../theme/tokens";
import { MIcon } from "./MIcon";
import { Sheet } from "./Sheet";
import { shiftMonthStable, shiftDays, daysInMonth, DateRange } from "../../lib/billingCycle";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

// Lunes (index 0) a Domingo (index 6) a partir del día 1 del mes
function firstDayOffset(y: number, m: number): number {
  const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Dom
  return (dow + 6) % 7; // 0=Lun
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }

/** Selector de rango de fechas (Sheet inferior) sin dependencia nativa. */
export function DateRangePicker({ visible, onClose, initial, onApply }: {
  visible: boolean;
  onClose: () => void;
  initial?: DateRange | null;
  onApply: (range: DateRange) => void;
}) {
  const [month, setMonth] = useState(() => (initial?.from ?? new Date().toISOString().slice(0, 7)).slice(0, 7));
  const [start, setStart] = useState<string | null>(initial?.from ?? null);
  const [end, setEnd] = useState<string | null>(initial?.to ?? null);

  const [y, m] = month.split("-").map(Number);
  const dim = daysInMonth(y!, m!);
  const offset = firstDayOffset(y!, m!);
  const cells: (number | null)[] = [
    ...Array(offset).fill(null) as (number | null)[],
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];

  const nav = (d: number) => setMonth(shiftMonthStable(`${month}-01`, d).slice(0, 7));

  function pick(d: number) {
    const date = ymd(y!, m!, d);
    if (!start || (start && end)) { setStart(date); setEnd(null); return; }
    if (date < start) { setStart(date); setEnd(start); return; }
    setEnd(date);
  }

  function clear() { setStart(null); setEnd(null); }

  function isIn(date: string) {
    if (!start || !end) return false;
    return date >= start && date <= end;
  }
  function isEdge(date: string) {
    return date === start || date === end;
  }

  const showApply = Boolean(start && end);

  return (
    <Sheet visible={visible} onClose={onClose} title="Rango de fechas">
      <View style={s.nav}>
        <TouchableOpacity style={s.navBtn} onPress={() => nav(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MIcon name="chevron-left" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={s.navLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity style={s.navBtn} onPress={() => nav(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MIcon name="chevron-right" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={s.weekRow}>
        {WEEK.map((w, i) => <Text key={i} style={s.weekDay}>{w}</Text>)}
      </View>

      <View style={s.grid}>
        {cells.map((d, i) => {
          const date = d ? ymd(y!, m!, d) : null;
          const inR = date ? isIn(date) : false;
          const edge = date ? isEdge(date) : false;
          return (
            <View key={i} style={s.cell}>
              {d ? (
                <TouchableOpacity
                  style={[s.day, inR && s.dayIn, edge && s.dayEdge]}
                  onPress={() => pick(d)}
                >
                  <Text style={[s.dayText, inR && s.dayTextIn]}>{d}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={s.summary}>
        <Text style={s.hint}>
          {start ? `Desde ${start}` : "Toca el día de inicio"} <Text style={s.hint2}>{end ? `· hasta ${end}` : ""}</Text>
        </Text>
      </View>

      <View style={s.btnRow}>
        <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: C.surfaceAlt }]} onPress={clear}>
          <Text style={s.btnText}>Limpiar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, { flex: 1, backgroundColor: C.primary, opacity: showApply ? 1 : 0.4 }]}
          disabled={!showApply}
          onPress={() => showApply && onApply({ from: start!, to: end! })}
        >
          <Text style={[s.btnText, { color: "#04121F" }]}>Aplicar</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  navBtn: { width: 32, height: 32, borderRadius: 999, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  navLabel: { color: C.text, fontWeight: "800", fontSize: 15 },
  weekRow: { flexDirection: "row", marginVertical: 6 },
  weekDay: { flex: 1, textAlign: "center", color: C.faint, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  day: { width: "100%", height: "100%", borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dayIn: { backgroundColor: C.primarySoft },
  dayEdge: { backgroundColor: C.primary },
  dayText: { color: C.text, fontSize: 14, fontWeight: "600" },
  dayTextIn: { color: "#04121F", fontWeight: "800" },
  summary: { marginTop: 8, marginBottom: 4 },
  hint: { color: C.dim, fontSize: 13 },
  hint2: { color: C.primary, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { padding: 14, borderRadius: R.md, alignItems: "center" },
  btnText: { color: C.text, fontWeight: "700" },
});
