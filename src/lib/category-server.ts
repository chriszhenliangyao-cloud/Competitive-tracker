import { cache } from "react";
import { cookies } from "next/headers";
import { CATEGORY, CATEGORY_COOKIE, DEFAULT_CATEGORY, type CategoryKey } from "./category";

// Server-only: resolves the active category from the cookie. Kept apart from
// ./category.ts so client components can import the constants/types without
// pulling in next/headers.

const isCategoryKey = (v: string | undefined): v is CategoryKey =>
  !!v && Object.prototype.hasOwnProperty.call(CATEGORY, v);

/** Active category for this request (cookie-backed, defaults to powerbank). */
export const getCategoryKey = cache(async (): Promise<CategoryKey> => {
  try {
    const v = (await cookies()).get(CATEGORY_COOKIE)?.value;
    return isCategoryKey(v) ? v : DEFAULT_CATEGORY;
  } catch {
    return DEFAULT_CATEGORY; // not in a request scope
  }
});

export const getCategoryId = cache(async (): Promise<number> => CATEGORY[await getCategoryKey()]);
