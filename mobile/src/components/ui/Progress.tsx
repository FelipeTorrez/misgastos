import { View, StyleSheet } from "react-native";
import { C, progressState, stateColor } from "../../theme/tokens";
import { CategoryCircle } from "./CategoryCircle";

/**
 * Barra de progreso con estado (ok/warn/over) o color custom.
 * `color` (opcional) fuerza un color (p.ej. tinte de categoría para distribución).
 * slug opcional → muestra el icono de la categoría al final de la barra.
 */
export function Progress({ pct, height = 8, state, slug, color }: { pct: number; height?: number; state?: "ok" | "warn" | "over"; slug?: string | null; color?: string }) {
  const st = state ?? progressState(pct);
  const width = Math.max(0, Math.min(100, pct));
  const fill = color ?? stateColor(st);
  if (slug) {
    return (
      <View style={s.withIcon}>
        <View style={[s.track, { height, flex: 1 }]}>
          <View style={[s.fill, { width: `${width}%`, backgroundColor: fill }]} />
        </View>
        <CategoryCircle slug={slug} size={28} />
      </View>
    );
  }
  return (
    <View style={[s.track, { height }]}>
      <View style={[s.fill, { width: `${width}%`, backgroundColor: fill }]} />
    </View>
  );
}
const s = StyleSheet.create({
  track: { backgroundColor: C.surfaceAlt, borderRadius: 999, overflow: "hidden", width: "100%" },
  fill: { height: "100%", borderRadius: 999 },
  withIcon: { flexDirection: "row", alignItems: "center", gap: 10 },
});
