import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  Bot,
  Settings,
  Tag,
  FlaskConical,
  Palette,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  Plus,
  X,
  Trash2,
  Copy,
  Target,
  LayoutGrid,
  Receipt,
  ChartBar,
  Flag,
  Scale,
  Zap,
  House,
  Heart,
  Check,
} from "lucide-react-native";

/**
 * SSOT de iconografía FUNCIONAL (navegación, acciones, estados).
 * Mapea los nombres históricos usados por la UI (vía MIcon) a componentes
 * Lucide. Pantallas consumen <AppIcon name="..." /> y nunca importan la
 * librería. Nota: Lucide v0.577 renombra BarChart*→ChartBar* y Home→House.
 */
export type AppIconName =
  | "wallet"
  | "chevron-left"
  | "chevron-right"
  | "robot-happy"
  | "bot"
  | "cog"
  | "settings"
  | "tag"
  | "flask"
  | "palette"
  | "trending-down"
  | "trending-up"
  | "swap-horizontal"
  | "arrow-left-right"
  | "plus"
  | "close"
  | "trash-can"
  | "copy"
  | "target"
  | "view-grid"
  | "receipt"
  | "chart-bar"
  | "flag"
  | "scale-balance"
  | "zap"
  | "home"
  | "heart"
  | "check";

export const APP_ICONS: Record<AppIconName, React.ComponentType<{ size?: number | string; color?: string; strokeWidth?: number }>> = {
  wallet: Wallet,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "robot-happy": Bot,
  bot: Bot,
  cog: Settings,
  settings: Settings,
  tag: Tag,
  flask: FlaskConical,
  palette: Palette,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
  "swap-horizontal": ArrowLeftRight,
  "arrow-left-right": ArrowLeftRight,
  plus: Plus,
  close: X,
  "trash-can": Trash2,
  copy: Copy,
  target: Target,
  "view-grid": LayoutGrid,
  receipt: Receipt,
  "chart-bar": ChartBar,
  flag: Flag,
  "scale-balance": Scale,
  zap: Zap,
  home: House,
  heart: Heart,
  check: Check,
};
