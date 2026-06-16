import { getSupabase } from "@/lib/supabase";
import { getChannelRows } from "@/lib/data";
import { effectivePrice, toEUR } from "@/lib/format";
import IniuTable, { type IniuProduct, type Competitor } from "./IniuTable";

export const dynamic = "force-dynamic";

type LinkRow = {
  iniu_product_id: number;
  competitor: {
    id: number;
    sku: string;
    name: string;
    capacity: string | null;
    wired_power: string | null;
    wireless_power: string | null;
    size: string | null;
    weight: string | null;
    usb_ports: string | null;
    magsafe: boolean | null;
    image_url: string | null;
    rrp: number | string | null;
    rrp_currency: string | null;
    brand: { display_name: string } | null;
  } | null;
};

export default async function IniuPage() {
  const sb = getSupabase();
  const [iniuRes, linkRes, channel] = await Promise.all([
    sb
      .from("iniu_products")
      .select("id, sku, name, capacity, size, weight, wired_power, wireless_power, usb_ports, magsafe, image_url")
      .order("name"),
    sb
      .from("competitive_links")
      .select(
        `iniu_product_id,
         competitor:products(id, sku, name, capacity, wired_power, wireless_power, size, weight, usb_ports, magsafe, image_url, rrp, rrp_currency, brand:brands(display_name))`,
      )
      .limit(20000),
    getChannelRows(),
  ]);

  // lowest current EUR price + retailer set per competitor SKU
  const priceMap = new Map<string, number | null>();
  const retailerSets = new Map<string, Set<string>>();
  for (const r of channel) {
    const sku = r.product?.sku;
    if (!sku) continue;
    const k = sku.toUpperCase();
    const latest = [...r.snapshots]
      .filter((s) => s.scraped_date)
      .sort((a, b) => (a.scraped_date! < b.scraped_date! ? 1 : -1))[0];
    if (!retailerSets.has(k)) retailerSets.set(k, new Set());
    if (r.retailer?.display_name) retailerSets.get(k)!.add(r.retailer.display_name);
    if (!latest) continue;
    const eur = toEUR(effectivePrice(latest.price, latest.promo_price), latest.currency);
    if (eur == null) continue;
    const cur = priceMap.get(k);
    if (cur == null || eur < cur) priceMap.set(k, eur);
  }

  const compByIniu: Record<number, Competitor[]> = {};
  for (const link of (linkRes.data ?? []) as unknown as LinkRow[]) {
    const c = link.competitor;
    if (!c) continue;
    const k = (c.sku || "").toUpperCase();
    (compByIniu[link.iniu_product_id] ||= []).push({
      id: c.id,
      sku: c.sku,
      name: c.name,
      brand: c.brand?.display_name ?? "—",
      capacity: c.capacity,
      wired_power: c.wired_power,
      wireless_power: c.wireless_power,
      size: c.size,
      weight: c.weight,
      usb_ports: c.usb_ports,
      magsafe: !!c.magsafe,
      image_url: c.image_url,
      rrp: c.rrp != null ? Number(c.rrp) : null,
      rrp_currency: c.rrp_currency,
      priceEUR: priceMap.get(k) ?? null,
      retailers: retailerSets.get(k)?.size ?? 0,
    });
  }

  return <IniuTable products={(iniuRes.data ?? []) as IniuProduct[]} compByIniu={compByIniu} />;
}
