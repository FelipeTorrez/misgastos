/**
 * Phase 6 — Wrapper para NotificationListenerService
 * - En dev-build/release con nativo: usa NotificationListenerModule.kt
 * - En Expo Go / web: mock que simula notificación bancaria
 */
import { Platform, NativeEventEmitter } from "react-native";
import { API_URL } from "../lib/supabase";

let NativeModule: any = null;
try {
  // @ts-ignore — solo existe en dev-build/release con nativo
  NativeModule = require("react-native").NativeModules?.NotificationListener;
} catch {}

// Sincronizado con mobile/src/native/allowlist.json y backend/src/modules/ingestion/allowlist.ts
const ALLOWLIST = [
  "cl.android", "com.falabella.falabellaApp", "com.mercadopago.wallet",
  "cl.bancochile", "cl.bci", "cl.santander", "cl.bancoestado",
  "cl.scotiabank", "cl.itau",
  "com.google.android.apps.walletnfcrel", "com.google.android.apps.nbu.paisa",
  "com.google.android.gms",
  "com.mach", "com.tenpo", "cl.tenpo",
];
// En debug permitimos nuestras propias notificaciones de prueba
const DEBUG_ALLOW = ["com.misgastos.app"];

export type BankNotification = {
  packageName: string;
  title: string;
  text: string;
  postedAt: string;
};

// Configura el reenvío NATIVO (el service hace el POST directo). Llamar 1 vez al montar.
export function setApiUrl(url: string): void {
  try { (NativeModule as any)?.setApiUrl?.(url); } catch {}
}

export async function hasPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || !NativeModule) return false;
  try { return await NativeModule.hasPermission(); } catch { return false; }
}

export async function requestPermission(): Promise<void> {
  if (Platform.OS !== "android" || !NativeModule) return;
  try { await NativeModule.requestPermission(); } catch {}
}

export function startListening(onNotification: (n: BankNotification) => void): () => void {
  if (Platform.OS !== "android" || !NativeModule) {
    console.log("[NotificationListener] mock mode — Expo Go/web no tiene acceso a notificaciones de otros apps (§11.3)");
    return () => {};
  }
  try {
    const Emitter = new NativeEventEmitter(NativeModule);
    const sub = Emitter.addListener("onNotificationPosted", (n: BankNotification) => {
      const isSelf = n.packageName === "com.misgastos.app" && n.title.includes("Test");
      if (!isSelf && !ALLOWLIST.some(pkg => n.packageName.startsWith(pkg)) && !DEBUG_ALLOW.some(pkg => n.packageName.startsWith(pkg) && n.title.includes("Test"))) return;
      onNotification(n);
    });
    // compatibilidad: algunos builds exponen addListener directo en el módulo
    // @ts-ignore
    if (!sub && (NativeModule as any).addListener) {
      const s2: any = (NativeModule as any).addListener("onNotificationPosted", onNotification);
      return () => s2.remove();
    }
    // @ts-ignore
    NativeModule.startListening?.();
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

// --- Cola offline: si el backend no está alcanzable (fuera de LAN), guarda y reintenta.
const queue: BankNotification[] = [];
let flushing = false;

async function postOne(n: BankNotification): Promise<boolean> {
  try {
    const raw = `${n.title} ${n.text}`.trim();
    const res = await fetch(`${API_URL}/v1/ingestion/notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw_content: raw,
        sender: n.packageName,
        subject: n.title,
        external_id: `notif-${n.packageName}-${Date.now()}`,
        received_at: n.postedAt,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Envía notificación al backend §11.2; si falla, la encola y reintenta luego (retorno a LAN).
export async function forwardToBackend(n: BankNotification): Promise<any> {
  const ok = await postOne(n);
  if (!ok) queue.push(n);
  return { ok, queued: !ok };
}

// Reintenta todo lo encolado (llámalo al volver a LAN / abrir app).
export async function flushQueue(): Promise<number> {
  if (flushing) return queue.length;
  flushing = true;
  let sent = 0;
  while (queue.length) {
    const ok = await postOne(queue[0]!);
    if (ok) { queue.shift(); sent++; }
    else break;
  }
  flushing = false;
  return sent;
}

// Reenvía notificaciones activas en la bandeja (las que siguen en pantalla).
export async function resendActive(): Promise<void> {
  if (Platform.OS !== "android" || !NativeModule?.resendActive) return;
  try { await NativeModule.resendActive(); } catch {}
}

export async function postTestNotificationVisible(title: string, text: string): Promise<void> {
  if (Platform.OS !== "android" || !NativeModule?.postTestNotification) return;
  try { await NativeModule.postTestNotification(title, text); } catch {}
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
