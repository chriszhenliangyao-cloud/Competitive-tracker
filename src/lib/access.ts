// Single source of truth for who may use the app.
// Only these exact accounts pass — a valid @iniushop.com address NOT listed
// here is still rejected. To grant/revoke access: edit this list and push.
export const ALLOWED_EMAILS = new Set<string>([
  "chris.yao@iniushop.com",
  "julio.pu@iniushop.com",
  "jiwen.wang@iniushop.com",
  "lukasz.lyzwa@iniushop.com",
  "juan.cabrera@iniushop.com",
  "victor.rosiere@iniushop.com",
  "slawomir.stanik@iniushop.com",
]);

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.has(email.trim().toLowerCase());
}
