import { View, Text, StyleSheet } from "react-native";
import { categoryMeta } from "../../theme/categoryIconsV2";
import { CategoryIcon } from "./CategoryIcon";

/** Hex + alfa (RRGGBBAA); si el color no es hex de 6, devuelve el color tal cual. */
function alpha(hex: string, a: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${a}` : hex;
}

/**
 * Icono de categoría duotone: tinte del color de la categoría al 16% + anillo
 * al 35% + glifo outline del mismo color (un solo grosor, 24x24 base).
 * El color de la categoría identifica; el verde/rojo queda reservado a estado.
 */
export function CategoryCircle({ slug, size = 40 }: { slug?: string | null; size?: number }) {
  const ci = categoryMeta(slug);
  return (
    <View
      style={[
        s.circle,
        {
          width: size,
          height: size,
          backgroundColor: alpha(ci.color, "29"),
          borderColor: alpha(ci.color, "59"),
        },
      ]}
    >
      <CategoryIcon slug={slug} size={size * 0.52} variant="regular" />
    </View>
  );
}

export function CategoryTag({ name, slug }: { name: string; slug?: string | null }) {
  const ci = categoryMeta(slug);
  return (
    <View style={[s.tag, { backgroundColor: `${ci.color}1E` }]}>
      <CategoryIcon slug={slug} size={12} />
      <Text style={[s.tagText, { color: ci.color }]}>{name}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: "600" },
});
