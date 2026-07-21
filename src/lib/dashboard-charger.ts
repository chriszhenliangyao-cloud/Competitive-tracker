import { getSupabase } from "@/lib/supabase";
import { catFilter } from "@/lib/category";
import { getCategoryId } from "@/lib/category-server";
import { getScope, allowsCountry } from "@/lib/scope";
import { effectivePrice, toEUR } from "@/lib/format";
import { CHARGER_TIERS, tierOf, type TierKey } from "@/lib/charger-tiers";
import type { PriceRow } from "@/app/iniu/IniuTable";

// Dashboard data for the charger line.
//
// The powerbank dashboard hangs everything off INIU products (INIU's own price
// first, mapped competitors under it). There are no INIU chargers, so that
// backbone doesn't exist here — instead the market is grouped by segment
// (wall / car / desktop / cable, split by wattage), which is how the category is
// actually merchandised. Same table shape as the powerbank view: one row per
// product, its retailers underneath, prices per ISO week in EUR.
//
// Products come from LISTINGS rather than the library, because 73% of charger
// listings are still unmapped (new_listing) — reading the library only would
// hide most of what's actually on shelf.

/** A retailer offer: the shared price history plus this retailer's link/state. */
export type ChargerOffer = PriceRow & {
  url: string | null;
  inStock: boolean | null;
  onPromo: boolean;
};

export type ChargerProduct = {
  key: string;
  name: string;
  brand: string;
  sku: string | null;
  watt: string | null;
  ports: string | null;
  image: string | null;
  mapped: boolean;
  rows: ChargerOffer[];
  dates: string[];
};
export type ChargerSection = { key: TierKey; label: string; sub: string; products: ChargerProduct[] };
export type ChargerDashboardData = {
  sections: ChargerSection[];
  countries: string[];
  stats: { products: number; listings: number; retailers: number; unmapped: number };
};

// (retailer code | sku | ean) -> scraped image url, for products with no library image.
async function getFirstPassImages(catId: number): Promise<Map<string, string>> {
  const sb = getSupabase();
  const { data } = await catFilter(
    sb
      .from("first_pass_observations")
      .select("sku, ean, retailer_product_code, image_url")
      .not("image_url", "is", null)
      .limit(20000),
    catId,
  );
  const idx = new Map<string, string>();
  for (const o of (data ?? []) as unknown as {
    sku: string | null; ean: string | null; retailer_product_code: string | null; image_url: string | null;
  }[]) {
    if (!o.image_url) continue;
    for (const k of [o.retailer_product_code, o.sku, o.ean]) {
      const kk = (k ?? "").trim().toUpperCase();
      if (kk && !idx.has(kk)) idx.set(kk, o.image_url);
    }
  }
  return idx;
}

export async function getChargerDashboardData(): Promise<ChargerDashboardData> {
  const sb = getSupabase();
  const catId = await getCategoryId();

  // Products without their own image borrow the scraped first-pass image, the
  // same fallback the powerbank Channel view uses — otherwise anything not in
  // the library renders as a blank tile.
  const [{ data }, fpImg] = await Promise.all([
    catFilter(
      sb
        .from("listings")
      .select(
        `id, raw_name, raw_sku, raw_ean, status, retailer_product_code, url,
         brand:brands(display_name),
         retailer:retailers(display_name, country),
         product:products(id, sku, name, wired_power, usb_ports, image_url),
         snapshots:price_snapshots(scraped_date, price, promo_price, currency, in_stock)`,
        )
        .limit(20000),
      catId,
    ),
    getFirstPassImages(catId),
  ]);

  type L = {
    id: number;
    raw_name: string | null;
    raw_sku: string | null;
    raw_ean: string | null;
    status: string | null;
    retailer_product_code: string | null;
    url: string | null;
    brand: { display_name: string } | null;
    retailer: { display_name: string; country: string | null } | null;
    product: { id: number; sku: string; name: string; wired_power: string | null; usb_ports: string | null; image_url: string | null } | null;
    snapshots: { scraped_date: string | null; price: number | null; promo_price: number | null; currency: string | null; in_stock: boolean | null }[];
  };

  const scope = await getScope();
  const countries = new Set<string>();
  // group by the mapped product when known, else by the listing's own name, so
  // the same product across retailers collapses into one row wherever possible
  const byKey = new Map<string, ChargerProduct>();
  let listingCount = 0;
  let unmapped = 0;

  for (const l of (data ?? []) as unknown as L[]) {
    const country = l.retailer?.country ?? null;
    if (scope.countries !== null && !allowsCountry(scope, country)) continue;
    if (country) countries.add(country);

    const name = l.product?.name || l.raw_name || "—";
    const key = l.product?.id ? `p${l.product.id}` : `n:${(l.raw_name ?? "").toLowerCase().trim()}`;

    // price per date, plus the newest snapshot's stock/promo state
    const byDate: Record<string, number | null> = {};
    let latest = "";
    let inStock: boolean | null = null;
    let onPromo = false;
    for (const s of l.snapshots ?? []) {
      if (!s.scraped_date) continue;
      byDate[s.scraped_date] = toEUR(effectivePrice(s.price, s.promo_price), s.currency);
      if (s.scraped_date >= latest) {
        latest = s.scraped_date;
        inStock = s.in_stock;
        onPromo = s.promo_price != null && s.price != null && s.promo_price < s.price;
      }
    }

    let p = byKey.get(key);
    if (!p) {
      p = {
        key,
        name,
        brand: l.brand?.display_name ?? "—",
        sku: l.product?.sku ?? l.raw_sku ?? null,
        watt: l.product?.wired_power ?? null,
        ports: l.product?.usb_ports ?? null,
        image:
          l.product?.image_url ??
          fpImg.get((l.retailer_product_code ?? "").trim().toUpperCase()) ??
          fpImg.get((l.raw_sku ?? "").trim().toUpperCase()) ??
          fpImg.get((l.raw_ean ?? "").trim().toUpperCase()) ??
          null,
        mapped: !!l.product?.id,
        rows: [],
        dates: [],
      };
      byKey.set(key, p);
    }
    if (!p.image) {
      p.image =
        l.product?.image_url ??
        fpImg.get((l.retailer_product_code ?? "").trim().toUpperCase()) ??
        fpImg.get((l.raw_sku ?? "").trim().toUpperCase()) ??
        fpImg.get((l.raw_ean ?? "").trim().toUpperCase()) ??
        null;
    }
    p.rows.push({
      retailer: l.retailer?.display_name ?? "—",
      country,
      code: null,
      byDate,
      url: l.url,
      inStock,
      onPromo,
    });
    listingCount++;
    if (!l.product?.id) unmapped++;
  }

  // bucket products into the 7 segments
  const buckets = new Map<TierKey, ChargerProduct[]>();
  const retailers = new Set<string>();
  for (const p of byKey.values()) {
    p.dates = [...new Set(p.rows.flatMap((r) => Object.keys(r.byDate)))].sort();
    p.rows.forEach((r) => retailers.add(r.retailer));
    const t = tierOf(p.name, p.watt);
    const arr = buckets.get(t) ?? [];
    arr.push(p);
    buckets.set(t, arr);
  }

  const sections: ChargerSection[] = CHARGER_TIERS.map((t) => ({
    key: t.key,
    label: t.label,
    sub: t.sub,
    products: (buckets.get(t.key) ?? []).sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name)),
  }));

  return {
    sections,
    countries: [...countries].sort(),
    stats: { products: byKey.size, listings: listingCount, retailers: retailers.size, unmapped },
  };
}
