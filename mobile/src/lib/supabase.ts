import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://localhost:54321",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "anon"
);
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
