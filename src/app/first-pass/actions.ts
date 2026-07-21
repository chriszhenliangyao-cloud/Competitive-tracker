"use server";

import { getSupabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/scope";
import { revalidatePath } from "next/cache";

// Editing from the First Pass registry.
//
// First Pass is a per-(retailer, code) channel record, and it owns exactly two
// kinds of field. Editing has to respect that split or the modules drift apart
// again — which is the whole point of the field-ownership contract:
//
//   MAPPING (code → SKU)  — genuinely lives here. Writing it goes through the
//     `resolve_review` SQL function, the same path the Reviews page uses, so
//     `first_pass.sku`, `listings.product_id` and the review queue all move
//     together. Setting it by hand would leave the listing pointing at the old
//     product until someone noticed.
//
//   SPECS (name / ean / capacity / power / ports / image) — belong to the
//     Library once the code is mapped, because the Library row is what every
//     view JOINs. So a spec edit on a MAPPED row writes `products`, not the
//     frozen first_pass columns; editing those would recreate exactly the stale
//     duplicate the First Pass page was fixed to stop displaying. Only an
//     UNMAPPED code — which has no Library row to write — falls back to its own
//     columns, and then power/usb_ports are flagged `*_manual` so the next
//     scrape can't overwrite what a person typed.
//
// Chris-only (`requireEditor`), audited, and every affected view is revalidated.

type Result = { ok: boolean; error?: string; routedTo?: "library" | "channel-row" };

/** Spec fields, and where each one lives in the two tables. */
const SPEC_FIELDS = {
  product_name: "name",
  ean: "ean",
  capacity: "capacity",
  power: "wired_power",
  usb_ports: "usb_ports",
  image_url: "image_url",
} as const;
type SpecKey = keyof typeof SPEC_FIELDS;

export type FirstPassPatch = Partial<Record<SpecKey, string | null>>;

async function sessionEmail(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

const clean = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * Spec edit on a First Pass row. Routed by whether the code is mapped:
 * mapped → the Library product; unmapped → this row's own raw columns.
 */
export async function updateFirstPassSpecs(rowId: number, patch: FirstPassPatch): Promise<Result> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };
  const sb = getSupabase();
  const actor = await sessionEmail();

  const rowRes = await sb
    .from("first_pass_observations")
    .select("id, retailer_id, retailer_product_code, category_id, product_name, ean, capacity, power, usb_ports, image_url")
    .eq("id", rowId)
    .single();
  const row = rowRes.data as (Record<string, unknown> & { retailer_id: number; retailer_product_code: string | null; category_id: number }) | null;
  if (rowRes.error || !row) return { ok: false, error: rowRes.error?.message || "Row not found" };

  // the mapping outcome for this exact (retailer, code) — same anchor map_cycle uses
  const listRes = await sb
    .from("listings")
    .select("id, product_id")
    .eq("retailer_id", row.retailer_id)
    .eq("category_id", row.category_id)
    .eq("retailer_product_code", row.retailer_product_code ?? "")
    .not("product_id", "is", null)
    .limit(1);
  const productId = (listRes.data ?? [])[0]?.product_id as number | undefined;

  // --- mapped: the Library owns these fields ---------------------------------
  if (productId) {
    const before = await sb
      .from("products")
      .select("id, updated_at, name, ean, capacity, wired_power, usb_ports, image_url")
      .eq("id", productId)
      .single();
    const cur = before.data as (Record<string, unknown> & { updated_at: string }) | null;
    if (before.error || !cur) return { ok: false, error: before.error?.message || "Library product not found" };

    const upd: Record<string, unknown> = {};
    for (const [fpKey, prodKey] of Object.entries(SPEC_FIELDS) as [SpecKey, string][]) {
      if (fpKey in patch) upd[prodKey] = clean(patch[fpKey]);
    }
    if (Object.keys(upd).length === 0) return { ok: false, error: "Nothing to update" };

    const write = await sb
      .from("products")
      .update(upd)
      .eq("id", productId)
      .eq("updated_at", cur.updated_at) // same optimistic lock as the Library editor
      .select("id")
      .single();
    if (write.error) return { ok: false, error: write.error.message };
    if (!write.data) return { ok: false, error: "This product changed since the page loaded — reload and re-apply." };

    await sb.from("audit_events").insert({
      actor_email: actor,
      action: "update",
      entity_table: "products",
      entity_id: productId,
      before_data: cur,
      after_data: upd,
    });
    for (const p of ["/first-pass", "/library", "/", "/iniu", "/channel"]) revalidatePath(p);
    return { ok: true, routedTo: "library" };
  }

  // --- unmapped: no Library row exists, so the raw fallback holds it ----------
  const upd: Record<string, unknown> = {};
  for (const k of Object.keys(SPEC_FIELDS) as SpecKey[]) {
    if (k in patch) upd[k] = clean(patch[k]);
  }
  if (Object.keys(upd).length === 0) return { ok: false, error: "Nothing to update" };
  // map_cycle overwrites these two with whatever the next scrape reads unless flagged
  if ("power" in upd) upd.power_manual = upd.power != null;
  if ("usb_ports" in upd) upd.usb_ports_manual = upd.usb_ports != null;

  const write = await sb.from("first_pass_observations").update(upd).eq("id", rowId).select("id").single();
  if (write.error) return { ok: false, error: write.error.message };

  await sb.from("audit_events").insert({
    actor_email: actor,
    action: "update",
    entity_table: "first_pass_observations",
    entity_id: rowId,
    before_data: row,
    after_data: upd,
  });
  for (const p of ["/first-pass", "/"]) revalidatePath(p);
  return { ok: true, routedTo: "channel-row" };
}

/**
 * The mapping decision (code → SKU). Delegates to `resolve_review` so first_pass,
 * the listing and the review queue stay one atomic story — see the note above.
 */
export async function setFirstPassSku(rowId: number, sku: string, productName?: string): Promise<Result> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };
  const sb = getSupabase();

  const rowRes = await sb
    .from("first_pass_observations")
    .select("id, retailer_id, retailer_product_code, category_id")
    .eq("id", rowId)
    .single();
  const row = rowRes.data as { retailer_id: number; retailer_product_code: string | null; category_id: number } | null;
  if (rowRes.error || !row) return { ok: false, error: rowRes.error?.message || "Row not found" };
  if (!row.retailer_product_code) return { ok: false, error: "This row has no retailer product code to map" };

  const listRes = await sb
    .from("listings")
    .select("id")
    .eq("retailer_id", row.retailer_id)
    .eq("category_id", row.category_id)
    .eq("retailer_product_code", row.retailer_product_code)
    .limit(1);
  const listingId = (listRes.data ?? [])[0]?.id as number | undefined;

  if (listingId) {
    const { error } = await sb.rpc("resolve_review", {
      p_listing_id: listingId,
      p_sku: clean(sku),
      p_product_name: productName ?? null,
      p_reviewer: (await sessionEmail()) ?? "first-pass",
    });
    if (error) return { ok: false, error: error.message };
  } else {
    // A legacy registry row with no listing behind it: nothing to keep in sync,
    // so write the memory directly. map_cycle will pick it up next cycle.
    const { error } = await sb.from("first_pass_observations").update({ sku: clean(sku) }).eq("id", rowId);
    if (error) return { ok: false, error: error.message };
  }

  for (const p of ["/first-pass", "/reviews", "/library", "/", "/channel"]) revalidatePath(p);
  return { ok: true };
}
