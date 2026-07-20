import { getSupabase } from "@/lib/supabase";
import { catFilter } from "@/lib/category";
import { getCategoryId } from "@/lib/category-server";
import ReviewsTable, { type ReviewRow, type SkuOption } from "./ReviewsTable";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const sb = getSupabase();
  const catId = await getCategoryId();
  const [{ data }, prodRes] = await Promise.all([
    sb
      .from("mapping_reviews")
      .select(
        `id, listing_id, status, suggested_sku, correct_sku, product_name, image_url, source_file, created_at,
         listing:listings!inner(category_id, status, retailer_product_code, raw_name, url,
           retailer:retailers(display_name, country),
           brand:brands(display_name, key))`,
      )
      .eq("listing.category_id", catId)
      .eq("status", "pending")
      .order("id", { ascending: false })
      .limit(20000),
    catFilter(sb.from("products").select("sku, name, brand:brands(display_name, key)").limit(5000), catId),
  ]);

  // all-history import creates one pending review per (file,row); collapse to one
  // per listing (latest) so the queue shows distinct unresolved products.
  const seen = new Set<number>();
  const deduped = ((data ?? []) as unknown as ReviewRow[]).filter((r) => {
    const lid = r.listing_id;
    if (lid == null) return true;
    if (seen.has(lid)) return false;
    seen.add(lid);
    return true;
  });

  const skuOptions: SkuOption[] = ((prodRes.data ?? []) as unknown as {
    sku: string;
    name: string;
    brand: { display_name: string; key: string } | null;
  }[]).map((p) => ({ sku: p.sku, name: p.name, brandKey: p.brand?.key ?? "" }));

  return <ReviewsTable rows={deduped} skuOptions={skuOptions} />;
}
