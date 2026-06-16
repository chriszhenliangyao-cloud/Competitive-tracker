import { getSupabase } from "@/lib/supabase";
import ReviewsTable, { type ReviewRow } from "./ReviewsTable";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const sb = getSupabase();
  const { data } = await sb
    .from("mapping_reviews")
    .select(
      `id, status, suggested_sku, correct_sku, product_name, image_url, source_file, created_at,
       listing:listings(status, retailer_product_code, raw_name, url,
         retailer:retailers(display_name, country),
         brand:brands(display_name))`,
    )
    .eq("status", "pending")
    .limit(5000);
  return <ReviewsTable rows={(data ?? []) as unknown as ReviewRow[]} />;
}
