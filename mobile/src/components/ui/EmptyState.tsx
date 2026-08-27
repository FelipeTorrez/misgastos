import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { C, R, SP } from "../../theme/tokens";
import { MIcon } from "./MIcon";

export function EmptyState({ icon = "wallet", title, subtitle, ctaLabel, cta, onCta }: {
  icon?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  cta?: string;
  onCta?: () => void;
}) {
  const iconName = (icon as any) === "wallet-outline" ? "wallet" : (icon as any) === "receipt-outline" ? "receipt" : (icon as any) ?? "wallet";
  const label = ctaLabel ?? cta;
  return (
    <View style={s.wrap}>
      <View style={s.iconCircle}><MIcon name={iconName} size={26} color={C.primary} /></View>
      <Text style={s.title}>{title}</Text>
      {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      {label && onCta && (
        <TouchableOpacity style={s.cta} onPress={onCta}>
          <Text style={s.ctaText}>{label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 999, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: SP.md },
  title: { color: C.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  subtitle: { color: C.dim, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  cta: { marginTop: SP.lg, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.pill },
  ctaText: { color: "#04121F", fontWeight: "800", fontSize: 14 },
});
