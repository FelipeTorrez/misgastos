import { useRef } from "react";
import { View, Text, StyleSheet, Animated, PanResponder } from "react-native";
import { C } from "../../theme/tokens";
import { MIcon } from "./MIcon";

/**
 * Fila deslizable: swipe a la izquierda revela fondo rojo "Borrar" y elimina al soltar.
 * Se reutiliza en Movimientos (transacciones) y Presupuestos (limites).
 */
export function SwipeRow({ children, onDelete, deleteLabel = "Borrar" }: {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
}) {
  const tx = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => { if (g.dx < 0) tx.setValue(Math.max(g.dx, -90)); },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          Animated.timing(tx, { toValue: -400, duration: 180, useNativeDriver: false }).start(() => onDelete());
        } else {
          Animated.spring(tx, { toValue: 0, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(tx, { toValue: 0, useNativeDriver: false }).start(),
    })
  ).current;
  return (
    <View style={s.swipeWrap}>
      <View style={s.deleteBg}><MIcon name="trash-can" size={20} color="#fff" /><Text style={s.deleteText}>{deleteLabel}</Text></View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...pan.panHandlers}>{children}</Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  swipeWrap: { marginBottom: 8, borderRadius: 12, overflow: "hidden" },
  deleteBg: { position: "absolute", right: 0, top: 0, bottom: 0, width: 90, backgroundColor: C.negative, alignItems: "center", justifyContent: "center", borderRadius: 12, flexDirection: "row", gap: 4 },
  deleteText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
