"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CATEGORY, CATEGORY_COOKIE, type CategoryKey } from "@/lib/category";

// Switch the whole app between product lines. The choice lives in a cookie so
// every server component resolves the same category on the next render; the
// layout-level revalidate makes all pages (and the sidebar counts) re-fetch.
export async function setCategory(key: CategoryKey): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(CATEGORY, key)) return;
  (await cookies()).set(CATEGORY_COOKIE, key, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
