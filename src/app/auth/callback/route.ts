import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_DOMAIN = "iniushop.com";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = (user?.email ?? "").toLowerCase();
      // Hard domain gate: reject + sign out any non-company account.
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/auth/login?error=domain`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
