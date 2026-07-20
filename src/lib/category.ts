// Product-category scoping.
//
// The schema has been multi-category from the start: `categories` holds
// powerbank (id 1) and charger (id 2), and products / listings /
// first_pass_observations / iniu_products all carry `category_id`.
// Until the charger line is imported and the UI gets a category switcher,
// EVERY page pins itself to powerbank so charger rows can never leak into
// the live boards.
//
// When the switcher lands (P3), replace the hard-coded ACTIVE_CATEGORY_ID
// with the per-request selection and keep using these helpers — the call
// sites won't have to change.

export const CATEGORY = { powerbank: 1, charger: 2 } as const;
export type CategoryKey = keyof typeof CATEGORY;

/** The category every query is scoped to right now. */
export const ACTIVE_CATEGORY_ID: number = CATEGORY.powerbank;

/**
 * Tables that carry `category_id` directly: products, listings,
 * first_pass_observations, iniu_products, import_runs.
 * Usage: `catFilter(sb.from("products").select(...))`
 */
// NOTE: T is deliberately unconstrained and the `.eq` is reached through a cast.
// Constraining it to the Supabase builder shape makes TS recurse through the
// generated query types ("Type instantiation is excessively deep").
export function catFilter<T>(q: T): T {
  return (q as unknown as { eq(col: string, val: unknown): T }).eq("category_id", ACTIVE_CATEGORY_ID);
}
