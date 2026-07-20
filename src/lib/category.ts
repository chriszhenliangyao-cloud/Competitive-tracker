// Product-category constants — CLIENT-SAFE (no next/headers here).
// Server-side resolution lives in ./category-server.ts.
//
// The schema is multi-category: `categories` holds powerbank (id 1) and charger
// (id 2); products / listings / first_pass_observations / iniu_products all carry
// `category_id`. The active category is a per-request cookie value, so every
// server component resolves the same one and the two lines never bleed together.

export const CATEGORY = { powerbank: 1, charger: 2 } as const;
export type CategoryKey = keyof typeof CATEGORY;

export const CATEGORY_KEYS = Object.keys(CATEGORY) as CategoryKey[];
export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  powerbank: "Power Banks",
  charger: "Chargers",
};

export const CATEGORY_COOKIE = "tracker_category";
export const DEFAULT_CATEGORY: CategoryKey = "powerbank";

/**
 * Scope a query on a table that carries `category_id` directly
 * (products, listings, first_pass_observations, iniu_products, import_runs).
 *
 * NOTE: T is deliberately unconstrained and `.eq` is reached through a cast.
 * Constraining it to the Supabase builder shape makes TS recurse through the
 * generated query types ("Type instantiation is excessively deep").
 */
export function catFilter<T>(q: T, categoryId: number): T {
  return (q as unknown as { eq(col: string, val: unknown): T }).eq("category_id", categoryId);
}
