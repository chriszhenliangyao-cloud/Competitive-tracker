import { getSupabase } from "@/lib/supabase";
import FirstPassTable, { type FpRow } from "./FirstPassTable";

export const dynamic = "force-dynamic";

export default async function FirstPassPage() {
  const sb = getSupabase();
  const { data } = await sb
    .from("first_pass_observations")
    .select(
      `id, product_name, sku, ean, retailer_product_code, price, promo_price, currency, in_stock, url, image_url,
       capacity, power, usb_ports, scraped_date,
       brand:brands(display_name), retailer:retailers(display_name, country)`,
    )
    .limit(5000);
  return <FirstPassTable rows={(data ?? []) as unknown as FpRow[]} />;
}
