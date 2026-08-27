import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from "react-native";
import { C, R, SP } from "../../theme/tokens";

/** Sheet inferior redondeada. Cerrar tocando el backdrop o el asa. */
export function Sheet({ visible, onClose, title, children }: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback>
            <View style={s.panel}>
              <View style={s.handle} />
              {title && <Text style={s.title}>{title}</Text>}
              {children}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(2,6,14,0.65)", justifyContent: "flex-end" },
  panel: { backgroundColor: C.surface, borderTopLeftRadius: R.lg + 6, borderTopRightRadius: R.lg + 6, padding: SP.lg, paddingBottom: SP.xxl, borderWidth: 1, borderColor: C.border, gap: SP.md },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: C.surfaceAlt, marginTop: -4 },
  title: { color: C.text, fontSize: 17, fontWeight: "800" },
});
