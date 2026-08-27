/**
 * Mapa de categorías → icono MaterialCommunityIcons + tinte + etiqueta es-CL.
 * El tinte por categoría es el único color decorativo permitido
 * (patrón Copilot Money: lienzo neutro + acentos controlados).
 *
 * NOTA: se usa MaterialCommunityIcons porque Ionicons en esta versión del paquete
 * tiene los glifos desalineados con su TTF en builds release (verificado on-device).
 */
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "./tokens";

export type CatIcon = { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; label: string };

export const CATEGORY_ICONS: Record<string, CatIcon> = {
  supermercado: { icon: "cart", color: "#4ADE80", label: "Supermercado" },
  restaurantes: { icon: "silverware-fork", color: "#FB923C", label: "Restaurantes" },
  transporte: { icon: "car", color: "#60A5FA", label: "Transporte" },
  suscripciones: { icon: "television", color: "#C084FC", label: "Suscripciones" },
  servicios: { icon: "flash", color: "#FBBF24", label: "Servicios" },
  vivienda: { icon: "home", color: "#2DD4BF", label: "Vivienda" },
  salud: { icon: "heart", color: "#F87171", label: "Salud" },
  educacion: { icon: "book-open-variant", color: "#818CF8", label: "Educación" },
  entretenimiento: { icon: "gamepad-variant", color: "#E879F9", label: "Entretenimiento" },
  compras: { icon: "shopping", color: "#F472B6", label: "Compras" },
  deudas: { icon: "credit-card", color: "#FCA5A5", label: "Deudas" },
  alimentacion: { icon: "food", color: "#A3E635", label: "Alimentación" },
  transferencias: { icon: "swap-horizontal", color: C.primary, label: "Transferencias" },
  otros: { icon: "dots-horizontal", color: C.dim, label: "Otros" },
};

const FALLBACK = CATEGORY_ICONS.otros!;

/** Acepta slug; cae a "otros" si no matchea. */
export function catIcon(slug?: string | null): CatIcon {
  return CATEGORY_ICONS[slug ?? ""] ?? FALLBACK;
}
