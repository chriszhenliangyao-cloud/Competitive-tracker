// Shared formatting + FX helpers, ported from the original dashboard conventions.

// Static fallback FX rates -> EUR (the original fetches live rates; we use the
// same fallback table so cross-retailer comparison stays consistent in the cloud).
export const FX_TO_EUR: Record<string, number> = {
  EUR: 1,
  PLN: 0.235,
  GBP: 1.17,
  USD: 0.92,
};

export const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  NL: "Netherlands",
  PL: "Poland",
  DE: "Germany",
  UK: "United Kingdom",
  GB: "United Kingdom",
  ES: "Spain",
  IT: "Italy",
  BE: "Belgium",
};

export function toEUR(value: number | null | undefined, currency: string | null | undefined): number | null {
  if (value == null) return null;
  const rate = FX_TO_EUR[(currency || "EUR").toUpperCase()];
  if (rate == null) return null;
  return value * rate;
}

export function fmtMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return "—";
  const cur = (currency || "EUR").toUpperCase();
  const n = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (cur === "EUR") return `€${n}`;
  if (cur === "PLN") return `${n} zł`;
  if (cur === "GBP") return `£${n}`;
  if (cur === "USD") return `$${n}`;
  return `${n} ${cur}`;
}

export function fmtEUR(value: number | null | undefined): string {
  if (value == null) return "—";
  return `€${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * RRP for the comparison boards (Dashboard / INIU / HTML export).
 *
 * Those tables already normalise every price column to EUR, so an RRP left in
 * its own currency was the one figure you couldn't read across a row — a Polish
 * "229.00 zł" sitting next to Spanish EUR prices. 203 of 529 RRPs are non-EUR
 * (188 PLN, 15 GBP), so this was most of a column.
 *
 * Returns the EUR figure plus the original, which callers show underneath: the
 * native value is what the source actually stated and the EUR one is our static
 * FX applied to it, so we don't silently replace it.
 *
 * The Library and First Pass pages deliberately keep native — the Library is the
 * catalogue of record and First Pass shows what a retailer actually charges.
 */
export function rrpParts(
  value: number | null | undefined,
  currency: string | null | undefined,
): { eur: string; native: string | null } {
  if (value == null) return { eur: "—", native: null };
  const cur = (currency || "EUR").toUpperCase();
  const eur = toEUR(value, cur);
  // Unknown currency: no rate to apply, so show what we have rather than invent one.
  if (eur == null) return { eur: fmtMoney(value, cur), native: null };
  return { eur: fmtEUR(eur), native: cur === "EUR" ? null : fmtMoney(value, cur) };
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split(/[\s_-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Effective price = promo if it exists and is meaningfully below list, else list.
export function effectivePrice(price: number | null, promo: number | null): number | null {
  if (promo != null && promo > 0.01 && (price == null || promo < price)) return promo;
  return price ?? promo ?? null;
}
