import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";
import { C, R, SP } from "../../theme/tokens";
import { MIcon } from "./MIcon";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type FabAction = { icon: string; label: string; color: string; onPress: () => void };

/** FAB premium: expande hacia arriba con animaciÃ³n spring y backdrop. */
export function FabMenu({ actions, onSelect }: { actions?: FabAction[]; onSelect?: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const defaultActions: FabAction[] = [
    { icon: "trending-down", label: "Gasto", color: C.negative, onPress: () => onSelect?.("Gasto") },
    { icon: "trending-up", label: "Ingreso", color: C.positive, onPress: () => onSelect?.("Ingreso") },
    { icon: "swap-horizontal", label: "Transferencia", color: C.primary, onPress: () => onSelect?.("Transferencia") },
  ];
  const list = actions ?? (onSelect ? defaultActions : []);
  const toggle = () => {
    LayoutAnimation.configureNext({
      duration: 260,
      create: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.scaleXY, springDamping: 0.7 },
      update: { type: LayoutAnimation.Types.spring, springDamping: 0.8 },
      delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    });
    setOpen(o => !o);
  };
  return (
    <View style={s.wrap} pointerEvents="box-none">
      {open && (
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={toggle} />
      )}
      <View style={s.stack} pointerEvents={open ? "auto" : "box-none"}>
        {open && list.slice().reverse().map(a => (
          <TouchableOpacity key={a.label} style={s.actionRow} onPress={() => { toggle(); a.onPress(); }} activeOpacity={0.8}>
            <View style={s.actionLabelPill}>
              <Text style={s.actionLabel}>{a.label}</Text>
            </View>
            <View style={[s.miniFab, { backgroundColor: a.color }]}>
              <MIcon name={a.icon} size={22} color="#04121F" />
            </View>
          </TouchableOpacity>
        ))}
        {list.length > 0 && (
          <TouchableOpacity style={[s.fab, open && s.fabOpen]} onPress={toggle} activeOpacity={0.85}>
            <MIcon name={open ? "close" : "plus"} size={30} color="#04121F" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { position: "absolute", right: 18, bottom: 22 },
  backdrop: { position: "absolute", top: -800, left: -500, right: -18, bottom: 0, backgroundColor: "rgba(3,8,18,0.65)" },
  stack: { alignItems: "flex-end", gap: SP.md },
  actionRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  actionLabelPill: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill },
  actionLabel: { color: C.text, fontSize: 15, fontWeight: "700" },
  miniFab: { width: 48, height: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  fab: {
    width: 62, height: 62, borderRadius: 999, backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#38BDF8", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  fabOpen: { transform: [{ rotate: "135deg" }], backgroundColor: C.surfaceAlt },
});
