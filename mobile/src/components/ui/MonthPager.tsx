import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C, monthLabel, shiftMonth } from "../../theme/tokens";
import { MIcon } from "./MIcon";

export function MonthPager({ month, value, onChange }: { month?: string; value?: string; onChange: (m: string) => void }) {
  const current = month ?? value ?? "2026-01";
  return (
    <View style={s.wrap}>
      <TouchableOpacity style={s.btn} onPress={() => onChange(shiftMonth(current, -1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MIcon name="chevron-left" size={22} color={C.text} />
      </TouchableOpacity>
      <Text style={s.label}>{monthLabel(current)}</Text>
      <TouchableOpacity style={s.btn} onPress={() => onChange(shiftMonth(current, 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MIcon name="chevron-right" size={22} color={C.text} />
      </TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: C.surfaceAlt, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 4, gap: 4 },
  btn: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  label: { color: C.text, fontSize: 14, fontWeight: "800", minWidth: 112, textAlign: "center", textAlignVertical: "center" },
});
