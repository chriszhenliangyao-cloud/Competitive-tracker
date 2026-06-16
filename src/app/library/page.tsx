import { getSupabase } from "@/lib/supabase";
import LibraryTable, { type LibProduct } from "./LibraryTable";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const sb = getSupabase();
  const { data } = await sb
    .from("products")
    .select(
      "id, sku, name, ean, capacity, wired_power, wireless_power, usb_ports, magsafe, size, weight, rrp, rrp_currency, image_url, source_type, brand:brands(display_name, key)",
    )
    .order("name")
    .limit(5000);
  return <LibraryTable products={(data ?? []) as unknown as LibProduct[]} />;
}
