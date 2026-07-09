// Server-only: uses cookie-bound auth. Never import from a "use client" module.
import { cache } from "react";
import { createClient } from "./supabase/server";
import { userFor } from "./access";

// The signed-in user's viewing scope, resolved once per request.
// countries === null  → admin, sees everything.
// countries === []    → sees nothing (unknown/unauthenticated — defensive default).
// countries === [..]  → sales, limited to those ISO-2 country codes.
export type Scope = { email: string | null; role: "admin" | "sales" | null; countries: string[] | null };

export const getScope = cache(async (): Promise<Scope> => {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    const email = data.user?.email ?? null;
    const u = userFor(email);
    if (!u) return { email, role: null, countries: [] };
    return { email, role: u.role, countries: u.countries };
  } catch {
    return { email: null, role: null, countries: [] };
  }
});

// True if this scope may see data for the given country.
export function allowsCountry(scope: Scope, country: string | null | undefined): boolean {
  if (scope.countries === null) return true; // admin
  if (!country) return false; // scoped users don't see country-less rows
  return scope.countries.includes(country);
}

// Authorization gate for mutating server actions. Middleware already blocks the
// admin-only PAGES, but server actions dispatch by action-id and could in theory be
// replayed to an allowed path, so every write re-checks the caller's role here (all
// current write actions live on admin-only pages). Returns null when authorized, or
// an error string to return straight to the caller.
export async function requireAdmin(): Promise<string | null> {
  const scope = await getScope();
  return scope.role === "admin" ? null : "Not authorized";
}
