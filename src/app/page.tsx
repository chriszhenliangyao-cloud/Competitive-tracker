import { getSupabase } from "@/lib/supabase";
import { getChannelRows } from "@/lib/data";
import { effectivePrice, toEUR } from "@/lib/format";
import PricesByCountry, { type Prod } from "./PricesByCountry";
import type { Competitor, PriceRow } from "./iniu/IniuTable";

export const dynamic = "force-dynamic";

type LinkRow = {
  iniu_product_id: number;
  competitor: {
    id: number;
    sku: string;
    name: string;
    image_url: string | null;
    rrp: number | string | null;
    rrp_currency: string | null;
    brand: { display_name: string } | null;
  } | null;
};

export default async function Home() {
  const sb = getSupabase();
  const [iniuRes, linkRes, hiddenRes, channel, priceRes] = await Promise.all([
    sb.from("iniu_products").select("id, sku, name, image_url").order("name"),
    sb
      .from("competitive_links")
      .select("iniu_product_id, competitor:products(id, sku, name, image_url, rrp, rrp_currency, brand:brands(display_name))")
      .limit(20000),
    sb.from("hidden_competitive_links").select("iniu_product_id, competitor_product_id").limit(100000),
    getChannelRows(),
    sb
      .from("iniu_price_snapshots")
      .select("iniu_product_id, scraped_date, price, promo_price, currency, country, retailer_product_code, retailer:retailers(display_name)")
      .order("scraped_date"),
  ]);

  // Pairs the user hid on the INIU page — masked from the comparison here too.
  const hiddenSet = new Set<string>(
    ((hiddenRes.data ?? []) as unknown as { iniu_product_id: number; competitor_product_id: number }[]).map(
      (h) => `${h.iniu_product_id}|${h.competitor_product_id}`,
    ),
  );

  // INIU's own per-retailer price history (EUR)
  const ownByIniu: Record<number, PriceRow[]> = {};
  const ownIndex = new Map<string, PriceRow>();
  for (const s of (priceRes.data ?? []) as unknown as {
    iniu_product_id: number;
    scraped_date: string | null;
    price: number | string | null;
    promo_price: number | string | null;
    currency: string | null;
    country: string | null;
    retailer_product_code: string | null;
    retailer: { display_name: string } | null;
  }[]) {
    if (!s.scraped_date) continue;
    const ret = s.retailer?.display_name ?? "—";
    const key = `${s.iniu_product_id}|${ret}`;
    let row = ownIndex.get(key);
    if (!row) {
      row = { retailer: ret, country: s.country, code: s.retailer_product_code, byDate: {} };
      ownIndex.set(key, row);
      (ownByIniu[s.iniu_product_id] ||= []).push(row);
    }
    row.byDate[s.scraped_date] = toEUR(
      effectivePrice(s.price != null ? Number(s.price) : null, s.promo_price != null ? Number(s.promo_price) : null),
      s.currency,
    );
  }

  // per-competitor-SKU price history (EUR) across retailers
  const chRows = new Map<string, PriceRow[]>();
  const chDates = new Map<string, Set<string>>();
  for (const r of channel) {
    const sku = r.product?.sku;
    if (!sku) continue;
    const k = sku.toUpperCase();
    const byDate: Record<string, number | null> = {};
    for (const s of r.snapshots) {
      if (!s.scraped_date) continue;
      byDate[s.scraped_date] = toEUR(effectivePrice(s.price, s.promo_price), s.currency);
    }
    if (!chRows.has(k)) chRows.set(k, []);
    chRows.get(k)!.push({
      retailer: r.retailer?.display_name ?? "—",
      country: r.retailer?.country ?? null,
      code: r.retailer_product_code,
      byDate,
    });
    if (!chDates.has(k)) chDates.set(k, new Set());
    Object.keys(byDate).forEach((d) => chDates.get(k)!.add(d));
  }

  const compByIniu: Record<number, Competitor[]> = {};
  for (const link of (linkRes.data ?? []) as unknown as LinkRow[]) {
    const c = link.competitor;
    if (!c) continue;
    if (hiddenSet.has(`${link.iniu_product_id}|${c.id}`)) continue;
    const k = (c.sku || "").toUpperCase();
    (compByIniu[link.iniu_product_id] ||= []).push({
      id: c.id,
      sku: c.sku,
      name: c.name,
      brand: c.brand?.display_name ?? "—",
      capacity: null,
      wired_power: null,
      wireless_power: null,
      size: null,
      weight: null,
      usb_ports: null,
      magsafe: false,
      image_url: c.image_url,
      rrp: c.rrp != null ? Number(c.rrp) : null,
      rrp_currency: c.rrp_currency,
      priceRows: chRows.get(k) ?? [],
      dates: [...(chDates.get(k) ?? [])].sort(),
      hidden: false,
    });
  }

  const products = (iniuRes.data ?? []) as Prod[];
  return <PricesByCountry products={products} compByIniu={compByIniu} ownByIniu={ownByIniu} />;
}
