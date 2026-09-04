import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { C, R, SP } from "../../theme/tokens";
import { MIcon } from "./MIcon";
import { currentCycle, rangeLabel } from "../../lib/billingCycle";

/** Prompt de onboarding: ¿este es tu ciclo de facturación? */
export function CyclePrompt({ visible, day, onDayChange, onAccept, onDecline }: {
  visible: boolean;
  day: number;
  onDayChange: (d: number) => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const preview = currentCycle(day);
  const stepper = (d: number) => onDayChange(Math.min(28, Math.max(1, day + d)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.icon}><MIcon name="calendar-refresh" size={26} color={C.primary} /></View>
          <Text style={s.title}>¿Tu ciclo de facturación?</Text>
          <Text style={s.sub}>MisGastos puede mostrar tu ciclo en lugar del mes calendario, con balance y presupuestos prorrateados.</Text>

          <View style={s.dayRow}>
            <TouchableOpacity style={s.stepper} onPress={() => stepper(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MIcon name="minus" size={18} color={C.text} />
            </TouchableOpacity>
            <View style={s.dayBox}>
              <Text style={s.dayText}>Día {day}</Text>
              <Text style={s.dayPreview}>{rangeLabel(preview)}</Text>
            </View>
            <TouchableOpacity style={s.stepper} onPress={() => stepper(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MIcon name="plus" size={18} color={C.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={onAccept} activeOpacity={0.85}>
            <MIcon name="check" size={16} color="#04121F" />
            <Text style={s.primaryText}>Sí, usar mi ciclo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={onDecline} activeOpacity={0.8}>
            <Text style={s.ghostText}>No, usar mes calendario</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(2,6,14,0.75)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: SP.xl, gap: SP.md, alignItems: "center" },
  icon: { width: 56, height: 56, borderRadius: 999, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  title: { color: C.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  sub: { color: C.dim, fontSize: 13, textAlign: "center", lineHeight: 19 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  stepper: { width: 44, height: 44, borderRadius: R.md, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  dayBox: { flex: 1, alignItems: "center", gap: 2 },
  dayText: { color: C.text, fontSize: 16, fontWeight: "800" },
  dayPreview: { color: C.primary, fontSize: 12, fontWeight: "600" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 13, borderRadius: R.pill, width: "100%", justifyContent: "center" },
  primaryText: { color: "#04121F", fontWeight: "800", fontSize: 14 },
  ghostBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, width: "100%", alignItems: "center" },
  ghostText: { color: C.dim, fontWeight: "700", fontSize: 13 },
});
