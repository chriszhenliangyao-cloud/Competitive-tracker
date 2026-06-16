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
