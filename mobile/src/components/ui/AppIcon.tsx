import { APP_ICONS, AppIconName } from "../../theme/appIcons";
import { C } from "../../theme/tokens";

/**
 * Icono FUNCIONAL (navegación, acciones, estados).
 * Envuelve Lucide con la paleta de MisGastos por defecto. Los nombres son los
 * históricos de la UI, no los de la librería → cambiar de librería no toca pantallas.
 */
export function AppIcon({
  name,
  size = 22,
  color = C.dim,
  strokeWidth = 2,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const Icon = APP_ICONS[name] ?? APP_ICONS.settings;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}
