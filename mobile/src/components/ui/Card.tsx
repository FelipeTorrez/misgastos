import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { C, R, SP } from "../../theme/tokens";

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; padded?: boolean }) {
  return <View style={[s.card, padded && s.padded, style]}>{children}</View>;
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{title}</Text>
      {actionLabel && (
        <Text style={s.sectionAction} onPress={onAction}>{actionLabel}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border },
  padded: { padding: SP.lg },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SP.xl, marginBottom: SP.sm },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  sectionAction: { fontSize: 13, fontWeight: "600", color: C.primary },
});
