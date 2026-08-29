import { categoryMeta } from "../../theme/categoryIconsV2";
import * as Phosphor from "phosphor-react-native";
import type { IconWeight } from "phosphor-react-native";

type Variant = IconWeight;

type IconCmp = React.ComponentType<{
  size?: number | string;
  color?: string;
  weight?: Variant;
  duotoneColor?: string;
  duotoneOpacity?: number;
}>;

/** Resuelve el componente Phosphor por nombre guardado en la meta. Si la librería
 * cambia, solo cambia este lookup — las pantallas usan CategoryIcon por slug. */
function resolveIcon(name: string): IconCmp | null {
  const icon = (Phosphor as unknown as Record<string, IconCmp>)[name];
  return typeof icon === "function" ? icon : null;
}

/**
 * Icono SEMÁNTICO (categoría). Recibe slug + variant y resuelve color/tinte desde
 * la SSOT. Nunca renderiza con el color por defecto: usa el color de la categoría.
 *
 * Ej: <CategoryIcon slug="alimentacion" size={20} variant="duotone" />
 */
export function CategoryIcon({
  slug,
  size = 24,
  variant,
  color,
}: {
  slug?: string | null;
  size?: number;
  variant?: Variant;
  color?: string;
}) {
  const meta = categoryMeta(slug);
  const Icon = resolveIcon(meta.phosphor);
  if (!Icon) return null;
  const w = variant ?? meta.weight;
  // fill = sólido y vivo (preferencia del usuario). duotone más expresivo
  // sube opacidad secundaria 0.2 → 0.32 cuando se use duotone
  if (w === "duotone") {
    return <Icon size={size} color={color ?? meta.color} weight={w} duotoneOpacity={0.32} />;
  }
  return <Icon size={size} color={color ?? meta.color} weight={w} />;
}
