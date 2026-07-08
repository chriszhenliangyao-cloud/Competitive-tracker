import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// HARD gate: only @iniushop.com may use the app. The Google `hd` hint + a
// Workspace "Internal" consent screen restrict who can authenticate; this is
// the server-side enforcement so a non-domain session can never reach a page.
const ALLOWED_DOMAIN = "iniushop.com";
type CookieToSet = { name: string; value: string; options?: CookieOptions };

const isDomainUser = (email: string | null | undefined) =>
  (email ?? "").toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the token cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Auth routes always render (login / callback / signout). Avoids redirect loops.
  if (path.startsWith("/auth")) {
    if (user && isDomainUser(user.email) && path === "/auth/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Every other route requires a valid @iniushop.com session.
  if (!user || !isDomainUser(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    if (user) url.searchParams.set("error", "domain");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
