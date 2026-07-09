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

const IMG_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_IMG_BYTES = 5 * 1024 * 1024;

type ImgResult = { ok: boolean; error?: string; url?: string; updatedAt?: string };

// Upload a product image (e.g. a screenshot) straight from the Library editor into
// Supabase Storage, and point products.image_url/image_path at it. Fills the gap
// where old-system images never synced. Own namespace `cloud/<id>-<ts>` so it never
// collides with the upload_images.py pipeline convention (<brand>/<sku>.png).
export async function uploadProductImage(
  id: number,
  expectedUpdatedAt: string,
  formData: FormData,
): Promise<ImgResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file provided" };
  const ext = IMG_TYPES[file.type];
  if (!ext) return { ok: false, error: "Only PNG, JPEG or WebP images are allowed" };
  if (file.size > MAX_IMG_BYTES) return { ok: false, error: "Image is larger than 5 MB" };

  const sb = getSupabase();
  const path = `cloud/${id}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from("product-images")
    .upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: `Storage upload failed: ${upErr.message}` };

  const url = sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;

  // record on the product (optimistic lock, same as spec edits)
  const readRes = await sb.from("products").select("id,updated_at,image_url,image_path").eq("id", id).single();
  const before = readRes.data as unknown as { updated_at: string } | null;
  if (readRes.error || !before) return { ok: false, error: readRes.error?.message || "Product not found" };
  if (expectedUpdatedAt && before.updated_at !== expectedUpdatedAt) {
    return { ok: false, error: "This product changed since you opened it — reload and re-apply." };
  }
  const writeRes = await sb
    .from("products")
    .update({ image_url: url, image_path: path })
    .eq("id", id)
    .eq("updated_at", before.updated_at)
    .select("id,updated_at,image_url")
    .single();
  const after = writeRes.data as unknown as { updated_at: string } | null;
  if (writeRes.error || !after) return { ok: false, error: writeRes.error?.message || "Concurrent edit — reload and re-apply." };

  await sb.from("audit_events").insert({
    actor_email: await sessionEmail(),
    action: "update_image",
    entity_table: "products",
    entity_id: id,
    before_data: before,
    after_data: { updated_at: after.updated_at, image_url: url, image_path: path },
  });

  for (const p of ["/library", "/", "/iniu", "/channel", "/first-pass"]) revalidatePath(p);
  return { ok: true, url, updatedAt: after.updated_at };
}
