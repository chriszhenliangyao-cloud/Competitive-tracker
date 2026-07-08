import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail, userFor } from "@/lib/access";

// Curation / cross-country pages restricted to admins. Sales users are limited to
// the country-scoped views (Dashboard / Channel / Roadmap).
const ADMIN_ONLY = ["/iniu", "/library", "/reviews", "/first-pass"];

// HARD gate: only the allow-listed accounts (src/lib/access.ts) may use the app.
// Server-side enforcement so a session outside the list can never reach a page.
type CookieToSet = { name: string; value: string; options?: CookieOptions };

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
    if (user && isAllowedEmail(user.email) && path === "/auth/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Every other route requires an allow-listed session.
  if (!user || !isAllowedEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    if (user) url.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(url);
  }

  // Role gate: non-admins can't reach the admin-only pages (redirect home).
  const role = userFor(user.email)?.role;
  if (role !== "admin" && ADMIN_ONLY.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
