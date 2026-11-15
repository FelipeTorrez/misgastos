import { View, Text, StyleSheet } from "react-native";
import { Svg, Path } from "react-native-svg";
import { C } from "../../theme/tokens";
import type { DonutSegment } from "../../lib/donut";

export type DonutChartProps = {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  onPressSegment?: (key: string) => void;
};

/**
 * Dona SVG (anillo por stroke). Cada segmento es tappable.
 * La geometría del path viene de buildDonutSegments (viewBox 200x200).
 */
export function DonutChart({
  segments,
  size = 200,
  thickness = 30,
  centerLabel,
  centerValue,
  onPressSegment,
}: DonutChartProps) {
  return (
    <View style={[s.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        {segments.map((seg) => (
          <Path
            key={seg.key}
            d={seg.path}
            stroke={seg.color}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="butt"
            onPress={() => onPressSegment?.(seg.key)}
            accessibilityLabel={`${seg.label} ${seg.pct}%`}
          />
        ))}
      </Svg>
      {(centerValue || centerLabel) && (
        <View style={s.center} pointerEvents="none">
          {!!centerValue && <Text style={s.value}>{centerValue}</Text>}
          {!!centerLabel && <Text style={s.label}>{centerLabel}</Text>}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignSelf: "center", alignItems: "center", justifyContent: "center" },
  center: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { color: C.text, fontSize: 18, fontWeight: "800" },
  label: { color: C.dim, fontSize: 12, marginTop: 2 },
});
