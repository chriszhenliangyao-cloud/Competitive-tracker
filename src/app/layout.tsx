import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./Sidebar";
import { getSupabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, userFor } from "@/lib/access";
import { catFilter, ACTIVE_CATEGORY_ID } from "@/lib/category";

export const metadata: Metadata = {
  title: "Competitive Tracker",
  description: "INIU competitive market dashboard",
};

export const dynamic = "force-dynamic";

async function getCounts() {
  try {
    const sb = getSupabase();
    const head = { count: "exact" as const, head: true };
    // Counts are category-scoped so the badges match what each page shows.
    // mapping_reviews has no category_id — it inherits it via its listing.
    const [listings, iniu, products, firstPass, reviews] = await Promise.all([
      catFilter(sb.from("listings").select("*", head)),
      catFilter(sb.from("iniu_products").select("*", head)),
      catFilter(sb.from("products").select("*", head)),
      catFilter(sb.from("first_pass_observations").select("*", head)),
      sb
        .from("mapping_reviews")
        .select("*, listing:listings!inner(category_id)", head)
        .eq("status", "pending")
        .eq("listing.category_id", ACTIVE_CATEGORY_ID),
    ]);
    return {
      channel: listings.count ?? 0,
      iniu: iniu.count ?? 0,
      library: products.count ?? 0,
      firstPass: firstPass.count ?? 0,
      reviews: reviews.count ?? 0,
    };
  } catch {
    return { channel: 0, iniu: 0, library: 0, firstPass: 0, reviews: 0 };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authed = isAllowedEmail(user?.email);
  const isAdmin = userFor(user?.email)?.role === "admin";

  return (
    <html lang="en">
      <body>
        {authed ? (
          <div className="app">
            <Sidebar counts={await getCounts()} userEmail={user!.email!} isAdmin={isAdmin} />
            <main className="content">
              <div className="content-inner">{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
