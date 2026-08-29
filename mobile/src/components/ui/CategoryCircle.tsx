import { View, Text, StyleSheet } from "react-native";
import { categoryMeta } from "../../theme/categoryIconsV2";
import { CategoryIcon } from "./CategoryIcon";

export function CategoryCircle({ slug, size = 40 }: { slug?: string | null; size?: number }) {
  const ci = categoryMeta(slug);
  return (
    <View style={[s.circle, { width: size, height: size, backgroundColor: ci.bg }]}>
      <CategoryIcon slug={slug} size={size * 0.52} />
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
  circle: { alignItems: "center", justifyContent: "center", borderRadius: 999 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: "600" },
});
