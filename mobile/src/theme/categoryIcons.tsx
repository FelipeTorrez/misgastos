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
  vivienda: { icon: "home", color: "#2DD4BF", label: "Vivienda" },
  servicios: { icon: "flash", color: "#FBBF24", label: "Servicios" },
  alimentacion: { icon: "cart", color: "#4ADE80", label: "Alimentación" },
  restaurantes: { icon: "silverware-fork", color: "#FB923C", label: "Restaurantes y Café" },
  transporte: { icon: "car", color: "#60A5FA", label: "Transporte" },
  salud: { icon: "heart", color: "#F87171", label: "Salud" },
  entretenimiento: { icon: "gamepad-variant", color: "#E879F9", label: "Diversión" },
  compras: { icon: "shopping", color: "#F472B6", label: "Compras" },
  hogar: { icon: "spray-bottle", color: "#A3E635", label: "Hogar y Aseo" },
  suscripciones: { icon: "television", color: "#C084FC", label: "Suscripciones" },
  deudas: { icon: "credit-card", color: "#FCA5A5", label: "Deudas" },
  ahorro: { icon: "piggy-bank", color: "#22D3EE", label: "Ahorro" },
  transferencias: { icon: "swap-horizontal", color: C.primary, label: "Transferencias" },
  otros: { icon: "dots-horizontal", color: C.dim, label: "Otros" },
};

const FALLBACK = CATEGORY_ICONS.otros!;

/** Acepta slug; cae a "otros" si no matchea. */
export function catIcon(slug?: string | null): CatIcon {
  return CATEGORY_ICONS[slug ?? ""] ?? FALLBACK;
}
