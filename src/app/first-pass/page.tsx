import { getSupabase } from "@/lib/supabase";
import FirstPassTable, { type FpRow } from "./FirstPassTable";

export const dynamic = "force-dynamic";

type FpRaw = {
  id: number;
  product_name: string | null;
  sku: string | null;
  ean: string | null;
  retailer_id: number | null;
  brand_id: number | null;
  retailer_product_code: string | null;
  price: number | string | null;
  promo_price: number | string | null;
  currency: string | null;
  in_stock: boolean | null;
  url: string | null;
  image_url: string | null;
  capacity: string | null;
  power: string | null;
  usb_ports: string | null;
  scraped_date: string | null;
  brand: { display_name: string } | null;
  retailer: { display_name: string; country: string | null } | null;
};

type Prod = {
  id: number;
  sku: string | null;
  brand_id: number | null;
  capacity: string | null;
  wired_power: string | null;
  usb_ports: string | null;
};

const up = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

export default async function FirstPassPage() {
  const sb = getSupabase();
  // Specs are NOT read from first_pass's own (frozen, legacy) columns anymore.
  // They come from the CANONICAL products row that the retailer_product_code is
  // mapped to — resolved the same way map_cycle does: primary = the code's
  // listings.product_id (the human-verified/auto mapping outcome), secondary =
  // exact SKU match for legacy rows with no listing. This makes a Library edit
  // show here instantly (single source of truth); unmapped rows fall back to the
  // raw scrape (marked "raw") as curation input.
  const [fpRes, listRes, prodRes] = await Promise.all([
    sb
      .from("first_pass_observations")
      .select(
        `id, product_name, sku, ean, retailer_id, brand_id, retailer_product_code, price, promo_price, currency,
         in_stock, url, image_url, capacity, power, usb_ports, scraped_date,
         brand:brands(display_name), retailer:retailers(display_name, country)`,
      )
      .limit(5000),
    sb.from("listings").select("retailer_id, retailer_product_code, product_id").not("product_id", "is", null).limit(20000),
    sb.from("products").select("id, sku, brand_id, capacity, wired_power, usb_ports").limit(5000),
  ]);

  const products = (prodRes.data ?? []) as unknown as Prod[];
  const productsById = new Map<number, Prod>();
  const productsByBrandSku = new Map<string, Prod>();
  for (const p of products) {
    productsById.set(p.id, p);
    if (p.sku) productsByBrandSku.set(`${p.brand_id}|${up(p.sku)}`, p);
  }
  // (retailer_id | UPPER code) -> resolved product_id (the mapping outcome).
  const codeToProduct = new Map<string, number>();
  for (const l of (listRes.data ?? []) as unknown as { retailer_id: number | null; retailer_product_code: string | null; product_id: number | null }[]) {
    if (l.product_id == null || !l.retailer_product_code) continue;
    codeToProduct.set(`${l.retailer_id}|${up(l.retailer_product_code)}`, l.product_id);
  }

  const rows: FpRow[] = ((fpRes.data ?? []) as unknown as FpRaw[]).map((r) => {
    // primary: the product this code is mapped to; secondary: exact SKU (legacy rows w/o listing)
    let prod = r.retailer_product_code
      ? productsById.get(codeToProduct.get(`${r.retailer_id}|${up(r.retailer_product_code)}`) ?? -1)
      : undefined;
    if (!prod && r.sku) prod = productsByBrandSku.get(`${r.brand_id}|${up(r.sku)}`);
    const mapped = !!prod;
    return {
      id: r.id,
      product_name: r.product_name,
      sku: r.sku,
      ean: r.ean,
      retailer_product_code: r.retailer_product_code,
      price: r.price,
      promo_price: r.promo_price,
      currency: r.currency,
      in_stock: r.in_stock,
      url: r.url,
      image_url: r.image_url,
      // canonical when mapped, raw scrape as fallback when not
      capacity: mapped ? prod!.capacity : r.capacity,
      power: mapped ? prod!.wired_power : r.power,
      usb_ports: mapped ? prod!.usb_ports : r.usb_ports,
      mapped,
      scraped_date: r.scraped_date,
      brand: r.brand,
      retailer: r.retailer,
    };
  });

  return <FirstPassTable rows={rows} />;
}
