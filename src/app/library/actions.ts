"use server";

import { getSupabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/scope";
import { revalidatePath } from "next/cache";

// Library is the ONE home for competitor specs (field-ownership contract). Editing
// here writes `products`; Channel / INIU / Dashboard / First Pass all JOIN from it,
// so one edit propagates everywhere. NOT editable: sku/sku_key/brand (identity —
// changing them would break the mapping key) and image_url (owned by the
// upload_images pipeline). Concurrency-safe via the updated_at optimistic lock;
// every change is written to audit_events (who/before/after).

const EDITABLE = [
  "name", "ean", "capacity", "wired_power", "wireless_power",
  "usb_ports", "size", "weight", "rrp", "rrp_currency", "magsafe",
] as const;

const SELECT = "id,updated_at," + EDITABLE.join(",");

export type ProductPatch = Partial<Record<(typeof EDITABLE)[number], string | number | boolean | null>>;
type Result = { ok: boolean; error?: string; conflict?: boolean; product?: Record<string, unknown> };

async function sessionEmail(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function updateProduct(
  id: number,
  patch: ProductPatch,
  expectedUpdatedAt: string,
): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const sb = getSupabase();

  // whitelist + normalise empties to null
  const clean: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (k in patch) {
      const v = patch[k];
      clean[k] = typeof v === "string" && v.trim() === "" ? null : v;
    }
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: "Nothing to update" };

  // read current row (for the audit trail + to detect a stale edit)
  const readRes = await sb.from("products").select(SELECT).eq("id", id).single();
  const before = readRes.data as unknown as (Record<string, unknown> & { updated_at: string }) | null;
  if (readRes.error || !before) return { ok: false, error: readRes.error?.message || "Product not found" };
  if (expectedUpdatedAt && before.updated_at !== expectedUpdatedAt) {
    return { ok: false, conflict: true, error: "This product changed since you opened it — reload and re-apply." };
  }

  // optimistic lock: only write if updated_at is still what we read
  const writeRes = await sb
    .from("products")
    .update(clean)
    .eq("id", id)
    .eq("updated_at", before.updated_at)
    .select(SELECT)
    .single();
  const after = writeRes.data as unknown as Record<string, unknown> | null;
  if (writeRes.error) return { ok: false, error: writeRes.error.message };
  if (!after) return { ok: false, conflict: true, error: "Concurrent edit — reload and re-apply." };

  await sb.from("audit_events").insert({
    actor_email: await sessionEmail(),
    action: "update",
    entity_table: "products",
    entity_id: id,
    before_data: before,
    after_data: after,
  });

  // propagate to every view that JOINs products for specs
  for (const p of ["/library", "/", "/iniu", "/channel", "/first-pass"]) revalidatePath(p);
  return { ok: true, product: after };
}
