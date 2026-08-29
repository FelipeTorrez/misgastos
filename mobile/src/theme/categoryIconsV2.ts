import type { IconWeight } from "phosphor-react-native";

/**
 * SSOT de iconografía SEMÁNTICA v2.
 * Cada categoría define la identidad visual: icono Phosphor, peso por defecto,
 * color de acento y color de fondo (tint). La app NUNCA importa la librería
 * de iconos directamente — solo esta meta + <CategoryIcon />.
 *
 * Motivación: MaterialCommunityIcons se sentía sobrio/genérico. Se busca
 * expresividad cercana a un emoji pero con consistencia fintech moderna.
 */

export type CategoryMeta = {
  phosphor: string;
  weight: IconWeight;
  color: string;
  bg: string;
  label: string;
};

export const CATEGORY_V2: Record<string, CategoryMeta> = {
  vivienda: { phosphor: "House", weight: "fill", color: "#2DD4BF", bg: "#2DD4BF22", label: "Vivienda" },
  servicios: { phosphor: "Lightning", weight: "fill", color: "#FBBF24", bg: "#FBBF2422", label: "Servicios" },
  alimentacion: { phosphor: "ShoppingCart", weight: "fill", color: "#4ADE80", bg: "#4ADE8022", label: "Alimentación" },
  restaurantes: { phosphor: "ForkKnife", weight: "fill", color: "#FB923C", bg: "#FB923C22", label: "Restaurantes y Café" },
  transporte: { phosphor: "Car", weight: "fill", color: "#60A5FA", bg: "#60A5FA22", label: "Transporte" },
  salud: { phosphor: "Heart", weight: "fill", color: "#F87171", bg: "#F8717122", label: "Salud" },
  entretenimiento: { phosphor: "GameController", weight: "fill", color: "#E879F9", bg: "#E879F922", label: "Diversión" },
  compras: { phosphor: "ShoppingBag", weight: "fill", color: "#F472B6", bg: "#F472B622", label: "Compras" },
  hogar: { phosphor: "SprayBottle", weight: "fill", color: "#A3E635", bg: "#A3E63522", label: "Hogar y Aseo" },
  suscripciones: { phosphor: "MonitorPlay", weight: "fill", color: "#C084FC", bg: "#C084FC22", label: "Suscripciones" },
  deudas: { phosphor: "CreditCard", weight: "fill", color: "#FCA5A5", bg: "#FCA5A522", label: "Deudas" },
  ahorro: { phosphor: "PiggyBank", weight: "fill", color: "#22D3EE", bg: "#22D3EE22", label: "Ahorro" },
  transferencias: { phosphor: "ArrowsLeftRight", weight: "fill", color: "#38BDF8", bg: "#38BDF822", label: "Transferencias" },
  otros: { phosphor: "DotsThree", weight: "fill", color: "#94A3B8", bg: "#94A3B822", label: "Otros" },
};

const FALLBACK = CATEGORY_V2.otros!;

/** Acepta slug; cae a "otros" si no matchea. */
export function categoryMeta(slug?: string | null): CategoryMeta {
  return CATEGORY_V2[slug ?? ""] ?? FALLBACK;
}

/** Corresponde al respaldo visul: {@link categoryMeta} */
export const CATEGORY_SLUGS = Object.keys(CATEGORY_V2);
