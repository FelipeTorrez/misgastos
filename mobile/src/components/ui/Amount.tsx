import { Text, StyleSheet, TextStyle } from "react-native";
import { C } from "../../theme/tokens";
import { fmtCLP } from "../../lib/format";

type Tone = "auto" | "income" | "expense" | "neutral";

/**
 * Monto con jerarquía fintech: valor protagonista, signo/símbolo discreto.
 * tone=auto colorea según el valor; positive/negative son sinónimos de income/expense.
 * showSign/signed fuerza el signo +/− explícito.
 */
export function Amount({ value, tone = "neutral", size = "md", signed, showSign }: { value: number; tone?: Tone | "positive" | "negative"; size?: "xl" | "lg" | "md" | "sm"; signed?: boolean; showSign?: boolean }) {
  const sizes: Record<string, TextStyle> = {
    xl: { fontSize: 36, fontWeight: "800" },
    lg: { fontSize: 18, fontWeight: "700" },
    md: { fontSize: 15, fontWeight: "600" },
    sm: { fontSize: 13, fontWeight: "600" },
  };
  const t: Tone = (tone as string) === "positive" ? "income" : (tone as string) === "negative" ? "expense" : (tone as Tone);
  let color: string = C.text;
  if (t === "income") color = C.positive;
  else if (t === "expense") color = C.negative;
  else if (t === "auto") color = value > 0 ? C.positive : value < 0 ? C.negative : C.text;

  const forceSign = showSign || signed;
  const sign = forceSign ? (value > 0 ? "+" : value < 0 ? "-" : "") : t === "income" ? "+" : "";

  return (
    <Text style={[sizes[size], { color }]}>
      {!!sign && <Text style={s.sym}>{sign}</Text>}
      {fmtCLP(Math.abs(value))}
    </Text>
  );
}
const s = StyleSheet.create({ sym: { opacity: 0.7 } });
