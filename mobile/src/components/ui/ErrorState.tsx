import { Text, StyleSheet, TouchableOpacity, View } from "react-native";
import { C } from "../../theme/tokens";
import { MIcon } from "./MIcon";

/** Banda discreta de error de carga con reintento. No pisa los datos previos. */
export function ErrorState({ message, onRetry }: {
  message?: string | null;
  onRetry?: () => void;
}) {
  return (
    <View style={s.wrap} accessibilityRole="alert">
      <MIcon name="alert-circle" size={16} color={C.warning} />
      <Text style={s.text}>{message ?? "No se pudieron cargar los datos"}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} accessibilityRole="button" accessibilityLabel="Reintentar">
          <Text style={s.retry}>Reintentar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(251,191,36,0.10)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(251,191,36,0.25)",
  },
  text: { color: C.warning, fontSize: 13, fontWeight: "600" },
  retry: { color: C.text, fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
});
