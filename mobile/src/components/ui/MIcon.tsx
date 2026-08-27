import { Text, TextStyle } from "react-native";

/**
 * Icono MaterialCommunityIcons renderizado como texto crudo con fontFamily.
 * Evita el bug de @expo/vector-icons/createIconSet que usa String.fromCharCode
 * (trunca codepoints > 0xFFFF, como casi todos los de MCI).
 */
const glyphMap: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json");

export function MIcon({ name, size = 22, color = "#fff", style }: { name: string; size?: number; color?: string; style?: TextStyle }) {
  const cp = glyphMap[name];
  if (cp == null) return null;
  return (
    <Text style={[{ fontFamily: "MaterialCommunityIcons", fontSize: size, color } as TextStyle, style]}>
      {String.fromCodePoint(cp)}
    </Text>
  );
}
