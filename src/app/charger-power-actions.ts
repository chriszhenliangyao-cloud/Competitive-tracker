"use server";

import { getSupabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/scope";
import { revalidatePath } from "next/cache";

// Editing power from the charger dashboard.
//
// Power has TWO homes and the field-ownership contract decides which one an edit
// writes, per row — there is no third store and nothing is ever copied:
//
//   mapped listing   -> products.wired_power   (the Library IS the source of
//                       truth; the edit shows up in Library, First Pass, Channel
//                       and every other view that JOINs products)
//   unmapped listing -> first_pass_observations.power  (no library row exists to
//                       edit — these are codes still sitting in the review queue)
//
// The unmapped path also sets `power_manual`, because map_cycle fills that column
// with `coalesce(scraped, existing)`: without the flag, the next scrape that reads
// any wattage — including a wrong one off a noisy page — would silently replace
// what a person typed. With it, map_cycle leaves the value alone. Once such a
// listing is mapped in /reviews, the Library value takes over on read and this
// row goes back to being the raw fallback it is meant to be.

type Result = { ok: boolean; error?: string; power?: string | null };

async function sessionEmail(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** "65", "65w", " 65 W " -> "65 W". Anything else is kept verbatim. */
function normalisePower(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,3})\s*w?$/i.exec(s);
  return m ? `${m[1]} W` : s;
}

export async function updateChargerPower(
  target: { productId: number | null; listingIds: number[] },
  raw: string,
): Promise<Result> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };

  const power = normalisePower(raw);
  const sb = getSupabase();
  const actor = await sessionEmail();

  // --- mapped: the Library owns it -------------------------------------------
  if (target.productId != null) {
    const read = await sb
      .from("products")
      .select("id,updated_at,wired_power,category_id")
      .eq("id", target.productId)
      .single();
    const before = read.data as { id: number; updated_at: string; wired_power: string | null; category_id: number } | null;
    if (read.error || !before) return { ok: false, error: read.error?.message || "Product not found" };

    const write = await sb
      .from("products")
      .update({ wired_power: power })
      .eq("id", target.productId)
      .eq("updated_at", before.updated_at) // same optimistic lock the Library editor uses
      .select("id,wired_power")
      .single();
    if (write.error) return { ok: false, error: write.error.message };
    if (!write.data) return { ok: false, error: "This product changed since the page loaded — reload and re-apply." };

    await sb.from("audit_events").insert({
      actor_email: actor,
      action: "update",
      entity_table: "products",
      entity_id: target.productId,
      before_data: { wired_power: before.wired_power },
      after_data: { wired_power: power },
    });

    for (const p of ["/", "/library", "/channel", "/first-pass"]) revalidatePath(p);
    return { ok: true, power };
  }

  // --- unmapped: no library row exists, so the raw fallback holds it ----------
  if (target.listingIds.length === 0) return { ok: false, error: "Nothing to update" };

  // A dashboard row can span retailers (the same product name at several shops);
  // each listing points at its own (retailer, code) first_pass registry entry.
  const ls = await sb
    .from("listings")
    .select("id,retailer_id,retailer_product_code,category_id,product_id")
    .in("id", target.listingIds);
  if (ls.error) return { ok: false, error: ls.error.message };
  const rows = (ls.data ?? []) as {
    id: number; retailer_id: number; retailer_product_code: string | null; category_id: number; product_id: number | null;
  }[];

  let written = 0;
  for (const l of rows) {
    // Guard: if it turns out to be mapped, its specs belong to the Library —
    // don't write a shadow value into the raw fallback.
    if (l.product_id != null || !l.retailer_product_code) continue;
    const up = await sb
      .from("first_pass_observations")
      .update({ power, power_manual: power != null })
      .eq("retailer_id", l.retailer_id)
      .eq("retailer_product_code", l.retailer_product_code)
      .eq("category_id", l.category_id);
    if (up.error) return { ok: false, error: up.error.message };
    written++;
  }
  if (written === 0) return { ok: false, error: "No unmapped channel rows to update" };

  await sb.from("audit_events").insert({
    actor_email: actor,
    action: "update",
    entity_table: "first_pass_observations",
    entity_id: rows[0]?.id ?? null,
    before_data: { listing_ids: target.listingIds },
    after_data: { power, power_manual: power != null, rows: written },
  });

  for (const p of ["/", "/first-pass"]) revalidatePath(p);
  return { ok: true, power };
}
