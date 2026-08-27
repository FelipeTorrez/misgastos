import { createClient } from "@supabase/supabase-js";

export const isMockMode = !process.env.SUPABASE_URL || process.env.SUPABASE_URL === "http://localhost:54321";

export const supabase = createClient(
  process.env.SUPABASE_URL ?? "http://localhost:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service_role_key",
  { auth: { persistSession: false } }
);

export function getUserId(req: any): string {
  const header = req.headers["x-user-id"];
  if (header) return header as string;
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (auth) {
    return auth;
  }
  return process.env.DEFAULT_DEV_USER_ID ?? "00000000-0000-0000-0000-000000000000";
}
