import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service_role_key",
  { auth: { persistSession: false } }
);

export function getUserId(req: any): string {
  // Phase 1: x-user-id header para dev; en prod se usa JWT de Supabase Auth
  const header = req.headers["x-user-id"];
  if (header) return header as string;
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (auth) {
    // TODO: verify JWT via supabase.auth.getUser(auth)
    return auth;
  }
  return "00000000-0000-0000-0000-000000000000"; // dev fallback
}
