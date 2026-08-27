import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { C } from "../../theme/tokens";
import { MIcon } from "./MIcon";

export function ScreenHeader({ left, center, right, logo }: { left?: React.ReactNode; center?: React.ReactNode; right?: React.ReactNode; logo?: boolean }) {
  return (
    <View style={s.wrap}>
      <View style={s.side}>{logo ? <Logo /> : left}</View>
      <View style={s.center}>{center}</View>
      <View style={[s.side, s.right]}>{right}</View>
    </View>
  );
}

export function Logo() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={s.logoBox}>
        <MIcon name="wallet" size={16} color="#04121F" />
      </View>
      <Text style={s.logoText}>MisGastos</Text>
    </View>
  );
}

export function HeaderIconButton({ icon, onPress }: { icon: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={s.iconBtn} onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MIcon name={icon} size={19} color={C.dim} />
    </TouchableOpacity>
  );
}

/** Chip compacto de header (IA, settings). tint opcional. */
export function HeaderChip({ icon, label, tint = C.primary, onPress }: { icon?: string; label?: string; tint?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={[s.aiChip, { backgroundColor: `${tint}26`, borderColor: `${tint}66` }]} onPress={onPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <MIcon name={(icon as any) ?? "robot-happy"} size={19} color={tint} />
      {!!label && <Text style={[s.aiText, { color: tint }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function AiChip({ onPress }: { onPress?: () => void }) {
  return <HeaderChip icon="robot-happy" label="IA" tint={C.primary} onPress={onPress} />;
}
const s = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingVertical: 10, minHeight: 48 },
  side: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  center: { alignItems: "center" },
  right: { justifyContent: "flex-end" },
  logoBox: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  logoText: { color: C.text, fontSize: 17, fontWeight: "800", letterSpacing: 0.2 },
  iconBtn: { width: 34, height: 34, borderRadius: 999, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  aiChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, marginRight: 8, borderWidth: 1, borderColor: "transparent" },
  aiText: { color: C.primary, fontSize: 13, fontWeight: "800" },
});
