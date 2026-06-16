import { getSupabase } from "@/lib/supabase";
import IniuTable, { type IniuProduct } from "./IniuTable";

export const dynamic = "force-dynamic";

export default async function IniuPage() {
  const sb = getSupabase();
  const [{ data }, links] = await Promise.all([
    sb
      .from("iniu_products")
      .select("id, sku, name, capacity, size, weight, wired_power, wireless_power, usb_ports, magsafe, image_url")
      .order("name"),
    sb.from("competitive_links").select("*", { count: "exact", head: true }),
  ]);
  return <IniuTable products={(data ?? []) as IniuProduct[]} linkCount={links.count ?? 0} />;
}
