import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 so the browser issues a GET to the login page after the POST.
  return NextResponse.redirect(new URL("/auth/login", request.url), { status: 303 });
}
