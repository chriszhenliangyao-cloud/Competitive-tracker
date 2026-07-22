// Single source of truth for who may use the app AND what they may see.
// Only these exact accounts pass — the gate is this list, NOT the email domain,
// so an @iniushop.com address that isn't listed is rejected and an outside
// address that is listed gets in. To grant/revoke access or change a country:
// edit this map and push.
//
// Adding an address outside iniushop.com also needs the `hd` hint dropped from
// the Google button (see auth/login/GoogleLoginButton.tsx) — with it set,
// Google's account chooser never offers them their own account.
//
// role "admin"  → sees every country (countries: null).
// role "sales"  → country-scoped: on Dashboard / Channel / Roadmap they only see
//                 their own country's retailers and the competitors sold there.
//                 (Country codes are ISO-2, matching retailers.country: FR/ES/PL/DE.)

export type Role = "admin" | "sales";
export type AppUser = {
  role: Role;
  countries: string[] | null; // null = all countries
  /** May change catalogue DATA (Library / First Pass fields, dashboard power).
   *  Separate from `role`: an admin sees everything and can work the review
   *  queue, but editing product identity and specs is narrower still — a wrong
   *  SKU rewrites the mapping key every future cycle resolves through. */
  canEdit?: boolean;
};

export const USERS: Record<string, AppUser> = {
  "chris.yao@iniushop.com": { role: "admin", countries: null, canEdit: true },
  "julio.pu@iniushop.com": { role: "admin", countries: null },
  "jiwen.wang@iniushop.com": { role: "admin", countries: null },
  // Kevin Xiao (Bueno Tech, external) — full visibility, no catalogue-data editing.
  // His work address kevin.xiao@bueno-tech2025.com has no Google account behind it
  // ("couldn't find your Google Account"), and sign-in here is Google-only, so the
  // entry has to be the Gmail he actually signs in with.
  "shawkalent@gmail.com": { role: "admin", countries: null },
  // Chris's personal Gmail — second way in, and the account the external sign-in
  // path was proven on. Deliberately WITHOUT canEdit: catalogue edits stay on the
  // work account, so a personal address can never rewrite product identity.
  "chriszhenliang.yao@gmail.com": { role: "admin", countries: null },
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

/** Everyone else is read-only on catalogue data. */
export function canEditData(email: string | null | undefined): boolean {
  return userFor(email)?.canEdit === true;
}
