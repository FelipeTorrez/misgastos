import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from "react-native";
import { C } from "../../theme/tokens";
import { Card } from "./Card";

export function ListRow({ left, title, subtitle, right, subRight, onPress, style }: {
  left?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  subRight?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const Body = (
    <View style={s.row}>
      {left}
      <View style={s.center}>
        {title}
        {subtitle}
      </View>
      <View style={s.right}>
        {right}
        {subRight}
      </View>
    </View>
  );
  if (onPress) return <Card style={[s.pressable, style]} padded={false}><TouchableOpacity activeOpacity={0.7} onPress={onPress}>{Body}</TouchableOpacity></Card>;
  return <Card style={style} padded={false}>{Body}</Card>;
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  pressable: { overflow: "hidden" },
  center: { flex: 1 },
  right: { alignItems: "flex-end" },
  day: { color: C.dim, fontSize: 12, fontWeight: "700", marginTop: 14, marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase" },
});

export function RowText({ main, sub, color }: { main: string; sub?: string; color?: string }) {
  return (
    <>
      <Text style={{ color: color ?? C.text, fontWeight: "600", fontSize: 15 }}>{main}</Text>
      {sub && <Text style={{ color: C.dim, fontSize: 12, marginTop: 2 }}>{sub}</Text>}
    </>
  );
}

export function DayHeader({ label }: { label: string }) {
  return <Text style={s.day}>{label}</Text>;
}
