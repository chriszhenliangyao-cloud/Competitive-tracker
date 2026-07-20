import { getSupabase } from "./supabase";
import { catFilter } from "./category";
import { getCategoryId } from "./category-server";

export type Snapshot = {
  scraped_date: string | null;
  price: number | null;
  promo_price: number | null;
  currency: string | null;
  in_stock: boolean | null;
};

export type ChannelRow = {
  id: number;
  status: string | null;
  mapping_method: string | null;
  retailer_product_code: string | null;
  raw_name: string | null;
  raw_sku: string | null;
  raw_ean: string | null;
  url: string | null;
  brand_id: number | null;
  first_seen: string | null;
  last_seen: string | null;
  image: string | null; // resolved: product image, else first-pass fallback
  brand: { key: string; display_name: string } | null;
  retailer: { key: string; display_name: string; country: string | null; currency: string | null } | null;
  product: {
    sku: string;
    name: string;
    capacity: string | null;
    wired_power: string | null;
    wireless_power: string | null;
    size: string | null;
    weight: string | null;
    usb_ports: string | null;
    magsafe: boolean | null;
    ean: string | null;
    rrp: number | null;
    rrp_currency: string | null;
    image_url: string | null;
  } | null;
  snapshots: Snapshot[];
};

const num = (v: unknown): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const normId = (s: string | null | undefined): string => {
  let k = (s || "").trim().toUpperCase().replace(/\s/g, "");
  if (k.endsWith("_CONVERTED")) k = k.slice(0, -"_CONVERTED".length);
  if (k.startsWith("UGR") && k.length > 5) k = k.slice(3);
  return k;
};

// Build a brand-scoped index of first-pass images keyed by SKU / EAN / retailer code,
// so products lacking their own image can borrow the matching first-pass image.
async function getFirstPassImageIndex(): Promise<Map<string, string>> {
  const sb = getSupabase();
  const catId = await getCategoryId();
  const { data } = await catFilter(
    sb
      .from("first_pass_observations")
      .select("brand_id, sku, ean, retailer_product_code, image_url")
      .not("image_url", "is", null)
      .limit(20000),
    catId,
  );
  const idx = new Map<string, string>();
  for (const o of (data ?? []) as Record<string, unknown>[]) {
    const url = o.image_url as string;
    if (!url) continue;
    for (const ident of [o.sku, o.ean, o.retailer_product_code] as (string | null)[]) {
      const k = normId(ident);
      if (k) idx.set(`${o.brand_id}|${k}`, url);
    }
  }
  return idx;
}

export async function getChannelRows(): Promise<ChannelRow[]> {
  const sb = getSupabase();
  const catId = await getCategoryId();
  const [{ data, error }, fpImages] = await Promise.all([
    catFilter(
      sb
        .from("listings")
        .select(
          `id, status, mapping_method, retailer_product_code, raw_name, raw_sku, raw_ean, url, brand_id, first_seen, last_seen,
         brand:brands(key, display_name),
         retailer:retailers(key, display_name, country, currency),
         product:products(sku, name, capacity, wired_power, wireless_power, size, weight, usb_ports, magsafe, ean, rrp, rrp_currency, image_url),
         snapshots:price_snapshots(scraped_date, price, promo_price, currency, in_stock)`,
        )
        .limit(5000),
      catId,
    ),
    getFirstPassImageIndex(),
  ]);
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const product = r.product as ChannelRow["product"];
    const brandId = r.brand_id as number | null;
    let image = product?.image_url || null;
    if (!image) {
      for (const ident of [product?.sku, product?.ean, r.raw_sku, r.raw_ean, r.retailer_product_code] as (
        | string
        | null
      )[]) {
        const k = normId(ident);
        if (k) {
          const hit = fpImages.get(`${brandId}|${k}`);
          if (hit) {
            image = hit;
            break;
          }
        }
      }
    }
    return {
      ...r,
      image,
      product: product ? { ...product, rrp: num(product.rrp) } : null,
      snapshots: ((r.snapshots as Snapshot[]) ?? []).map((s) => ({
        ...s,
        price: num(s.price),
        promo_price: num(s.promo_price),
      })),
    } as ChannelRow;
  });
}
