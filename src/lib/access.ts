// Single source of truth for who may use the app AND what they may see.
// Only these exact accounts pass — a valid @iniushop.com address NOT listed
// here is still rejected. To grant/revoke access or change a country: edit this
// map and push.
//
// role "admin"  → sees every country (countries: null).
// role "sales"  → country-scoped: on Dashboard / Channel / Roadmap they only see
//                 their own country's retailers and the competitors sold there.
//                 (Country codes are ISO-2, matching retailers.country: FR/ES/PL/DE.)

export type Role = "admin" | "sales";
export type AppUser = { role: Role; countries: string[] | null }; // null = all countries

export const USERS: Record<string, AppUser> = {
  "chris.yao@iniushop.com": { role: "admin", countries: null },
  "julio.pu@iniushop.com": { role: "admin", countries: null },
  "jiwen.wang@iniushop.com": { role: "admin", countries: null },
  "victor.rosiere@iniushop.com": { role: "sales", countries: ["FR"] },
  "juan.cabrera@iniushop.com": { role: "sales", countries: ["ES"] },
  "slawomir.stanik@iniushop.com": { role: "sales", countries: ["PL"] },
  "lukasz.lyzwa@iniushop.com": { role: "sales", countries: ["PL"] },
};

export const ALLOWED_EMAILS = new Set<string>(Object.keys(USERS));

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

export function userFor(email: string | null | undefined): AppUser | null {
  if (!email) return null;
  return USERS[email.trim().toLowerCase()] ?? null;
}
