import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client (auth only — data reads still go through the
// service-role client in src/lib/supabase.ts, server-side).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
