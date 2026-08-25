/**
 * Phase 6 — Wrapper para NotificationListenerService
 * - En dev-build: usa módulo nativo (a implementar en android/app/src/main/java/com/misgastos/NotificationListener.kt)
 * - En Expo Go / web: mock que simula notificación bancaria
 */
import { Platform } from "react-native";
import { API_URL } from "../lib/supabase";

let NativeModule: any = null;
try {
  // @ts-ignore — solo existe en dev-build
  NativeModule = require("react-native").NativeModules?.NotificationListener;
} catch {}

const ALLOWLIST = ["cl.bancoestado", "cl.bci", "cl.santander", "com.mach", "com.tenpo", "cl.mercadopago"];

export type BankNotification = {
  packageName: string;
  title: string;
  text: string;
  postedAt: string;
};

export async function hasPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || !NativeModule) return false;
  try { return await NativeModule.hasPermission(); } catch { return false; }
}

export async function requestPermission(): Promise<void> {
  if (Platform.OS !== "android" || !NativeModule) return;
  try { await NativeModule.requestPermission(); } catch {}
}

export function startListening(onNotification: (n: BankNotification) => void): () => void {
  if (Platform.OS !== "android" || !NativeModule?.addListener) {
    console.log("[NotificationListener] mock mode — Expo Go/web no tiene acceso a notificaciones de otros apps (§11.3)");
    return () => {};
  }
  const sub = NativeModule.addListener("onNotificationPosted", (n: BankNotification) => {
    if (!ALLOWLIST.some(pkg => n.packageName.includes(pkg.split(".").pop()!))) return;
    onNotification(n);
  });
  NativeModule.startListening?.();
  return () => sub.remove();
}

// Envía notificación capturada al backend §11.2: Notificación → App → Backend
export async function forwardToBackend(n: BankNotification): Promise<any> {
  const raw = `${n.title} ${n.text}`.trim();
  const res = await fetch(`${API_URL}/v1/ingestion/notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-id": "demo" },
    body: JSON.stringify({
      raw_content: raw,
      sender: n.packageName,
      subject: n.title,
      external_id: `notif-${n.packageName}-${Date.now()}`,
      received_at: n.postedAt,
    }),
  });
  return res.json();
}

// Mock para probar en web/Expo Go sin banco real
export async function simulateBankNotification(text: string, merchant = "Lider"): Promise<any> {
  const mock: BankNotification = {
    packageName: "cl.santander.mock",
    title: "Compra realizada",
    text,
    postedAt: new Date().toISOString(),
  };
  return forwardToBackend(mock);
}
