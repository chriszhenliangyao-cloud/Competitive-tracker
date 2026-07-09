"use server";

import { getSupabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/scope";
import { revalidatePath } from "next/cache";

type Result = { ok: boolean; error?: string };

// Current signed-in user's email (for the hidden_by audit trail). Best-effort.
async function sessionEmail(): Promise<string | null> {
  try {
    const sb = await createClient();
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

// Hide a competitor from an INIU product's competitor set WITHOUT deleting the
// competitive_links row. The link stays (it's rebuilt from the INIU spec by
// upload_iniu.py); we record the human "this isn't a real competitor" decision in
// hidden_competitive_links, and every board masks the pair at read time. This makes
// the decision durable: a re-import can't resurrect it, and the hidden list is a
// simple query. Affects the INIU page, the home Prices-by-Country view, and Roadmap.
export async function hideCompetitor(iniuId: number, competitorId: number): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const sb = getSupabase();
  const email = await sessionEmail();
  const { error } = await sb
    .from("hidden_competitive_links")
    .insert({ iniu_product_id: iniuId, competitor_product_id: competitorId, hidden_by: email });
  if (error && !/duplicate|unique|23505/i.test(error.message)) return { ok: false, error: error.message };
  revalidatePath("/iniu");
  revalidatePath("/");
  revalidatePath("/roadmap");
  return { ok: true };
}

// Un-hide: drop the row from hidden_competitive_links so the pair shows again.
export async function unhideCompetitor(iniuId: number, competitorId: number): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  const sb = getSupabase();
  const { error } = await sb
    .from("hidden_competitive_links")
    .delete()
    .eq("iniu_product_id", iniuId)
    .eq("competitor_product_id", competitorId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/iniu");
  revalidatePath("/");
  revalidatePath("/roadmap");
  return { ok: true };
}
