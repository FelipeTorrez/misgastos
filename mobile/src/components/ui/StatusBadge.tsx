import { View, Text, StyleSheet } from "react-native";
import { C } from "../../theme/tokens";

const MAP: Record<string, { label: string; fg: string; bg: string }> = {
  pending_ai: { label: "Pendiente IA", fg: "#7DD3FC", bg: "rgba(56,189,248,0.14)" },
  pending_review: { label: "Por revisar", fg: "#FCD34D", bg: "rgba(251,191,36,0.14)" },
  confirmed: { label: "Confirmado", fg: "#6EE7B7", bg: "rgba(52,211,153,0.14)" },
  corrected: { label: "Corregido", fg: "#A5B4FC", bg: "rgba(129,140,248,0.16)" },
  duplicate: { label: "Duplicado", fg: "#94A3B8", bg: "rgba(148,163,184,0.14)" },
  ignored: { label: "Ignorado", fg: "#94A3B8", bg: "rgba(148,163,184,0.14)" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, fg: C.dim, bg: "rgba(148,163,184,0.14)" };
  return (
    <View style={[s.badge, { backgroundColor: m.bg }]}>
      <Text style={[s.text, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  text: { fontSize: 11, fontWeight: "700" },
});
