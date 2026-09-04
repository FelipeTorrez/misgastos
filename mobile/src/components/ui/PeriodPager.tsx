import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C, monthLabel, shiftMonth } from "../../theme/tokens";
import { MIcon } from "./MIcon";
import { DateRange, rangeLabel, shiftCycle } from "../../lib/billingCycle";
import { Period } from "../../lib/useShellData";

/** Control del mes/ciclo: chevrons + etiqueta + botón para abrir rango/ciclo. */
export function PeriodPager({ period, onChange, onOpenRange, showClear, onClear }: {
  period: Period;
  onChange: (p: Period) => void;
  onOpenRange: () => void;
  showClear?: boolean;
  onClear?: () => void;
}) {
  const isRange = period.type === "range";

  const go = (delta: number) => {
    if (isRange) onChange({ type: "range", ...shiftCycle(period as { type: "range"; from: string; to: string }, delta) });
    else onChange({ type: "month", month: shiftMonth((period as any).month, delta) });
  };

  const label = isRange ? rangeLabel(period as DateRange) : monthLabel((period as any).month);

  return (
    <View style={s.row}>
      <View style={s.pagerWrap}>
        <TouchableOpacity style={s.noPad} onPress={() => go(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MIcon name="chevron-left" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.center} onPress={onOpenRange} activeOpacity={0.8}>
          <Text style={s.label} numberOfLines={1}>{label}</Text>
          <Text style={s.sub}>{isRange ? "ciclo" : "mes"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.noPad} onPress={() => go(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MIcon name="chevron-right" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.rangeBtn} onPress={onOpenRange} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MIcon name="calendar-month" size={16} color={C.primary} />
        </TouchableOpacity>
        {showClear && (
          <TouchableOpacity style={s.rangeBtn} onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MIcon name="close-circle" size={16} color={C.dim} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  pagerWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceAlt, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 4, gap: 4, maxWidth: "92%" },
  noPad: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  center: { flexDirection: "column", alignItems: "center", minWidth: 110 },
  label: { color: C.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
  sub: { color: C.faint, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  rangeBtn: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center", marginLeft: 2 },
});
