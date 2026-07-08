import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/access";
import { NextResponse } from "next/server";

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
      // Hard gate: reject + sign out any account not on the allow-list.
      if (!isAllowedEmail(user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/auth/login?error=unauthorized`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
