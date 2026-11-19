/**
 * Helper puro para decidir si los datos del shell son válidos o hay error real.
 * El backend (MG-008) devuelve 503 con `{ code: "db_unavailable" }` en vez de
 * lista vacía; el cliente no debe convertir eso en $0 / listas vacías.
 */

export type ShellStatus = { ok: boolean; code?: string };

export const SHELL_ERROR_MESSAGE = "No se pudieron cargar los datos";

/** Clasifica una respuesta HTTP a partir de status + body ya parseado. */
export function statusFromHttp(status: number, body?: unknown): ShellStatus {
  if (status >= 200 && status < 300) return { ok: true };
  const code =
    typeof (body as any)?.code === "string" ? (body as any).code : `http_${status}`;
  return { ok: false, code };
}

/** Clasifica un fetch rechazado (red caída, timeout, DNS). */
export function statusFromRejection(_err?: unknown): ShellStatus {
  return { ok: false, code: "network_error" };
}

/** Combina los estados de las cargas en paralelo: basta un fallo para error. */
export function combineShellStatuses(list: ShellStatus[]): ShellStatus {
  const failed = list.find((s) => !s.ok);
  if (failed) return failed;
  return { ok: true };
}

/** Mensaje a mostrar; null cuando no hay error. */
export function shellErrorMessage(s: ShellStatus): string | null {
  if (s.ok) return null;
  return SHELL_ERROR_MESSAGE;
}
