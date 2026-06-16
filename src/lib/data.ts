import { getSupabase } from "./supabase";

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
  first_seen: string | null;
  last_seen: string | null;
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

export async function getChannelRows(): Promise<ChannelRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("listings")
    .select(
      `id, status, mapping_method, retailer_product_code, raw_name, raw_sku, raw_ean, url, first_seen, last_seen,
       brand:brands(key, display_name),
       retailer:retailers(key, display_name, country, currency),
       product:products(sku, name, capacity, wired_power, wireless_power, size, weight, usb_ports, magsafe, ean, rrp, rrp_currency, image_url),
       snapshots:price_snapshots(scraped_date, price, promo_price, currency, in_stock)`,
    )
    .limit(5000);
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const product = r.product as ChannelRow["product"];
    return {
      ...r,
      product: product
        ? { ...product, rrp: num(product.rrp) }
        : null,
      snapshots: ((r.snapshots as Snapshot[]) ?? []).map((s) => ({
        ...s,
        price: num(s.price),
        promo_price: num(s.promo_price),
      })),
    } as ChannelRow;
  });
}
