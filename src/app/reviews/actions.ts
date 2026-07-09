"use server";

import { getSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/scope";
import { revalidatePath } from "next/cache";

// Resolving a review APPLIES the decision — same logic as the Excel-era
// apply_mapping_review.py (storage changed Excel->SQL, logic unchanged). The
// resolve_review() SQL function writes the human decision into the first_pass
// registry (retailer_product_code -> sku), flips the listing to mapped, and
// closes the queue, atomically. Because the mapping cascade reads first_pass, the
// listing maps automatically every future cycle and never returns to review.
// Admin-only: the /reviews page is admin-gated and the action re-checks the role.

export async function resolveReview(
  id: number,
  listingId: number | null,
  correctSku: string,
  productName: string,
): Promise<{ ok: boolean; error?: string }> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const sku = (correctSku || "").trim();
  if (!sku) return { ok: false, error: "Correct SKU is required" };
  const sb = getSupabase();

  if (listingId != null) {
    // Apply to first_pass + listing + close the queue, atomically (one RPC).
    const { error } = await sb.rpc("resolve_review", {
      p_listing_id: listingId,
      p_sku: sku,
      p_product_name: productName?.trim() || null,
      p_reviewer: "cloud-review",
    });
    if (error) return { ok: false, error: error.message };
  } else {
    // Fallback: a review row with no listing — just close it.
    const { error } = await sb
      .from("mapping_reviews")
      .update({
        status: "done" as const,
        correct_sku: sku,
        product_name: productName?.trim() || null,
        reviewed_by: "cloud-review",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/reviews");
  return { ok: true };
}

export async function reopenReview(id: number): Promise<{ ok: boolean; error?: string }> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const sb = getSupabase();
  const { error } = await sb
    .from("mapping_reviews")
    .update({ status: "pending", correct_sku: null, reviewed_by: null, reviewed_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/reviews");
  return { ok: true };
}
