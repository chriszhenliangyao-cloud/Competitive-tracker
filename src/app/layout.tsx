import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./Sidebar";
import { getSupabase } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Competitive Tracker",
  description: "INIU competitive market dashboard",
};

export const dynamic = "force-dynamic";

async function getCounts() {
  try {
    const sb = getSupabase();
    const head = { count: "exact" as const, head: true };
    const [listings, iniu, products, firstPass, reviews] = await Promise.all([
      sb.from("listings").select("*", head),
      sb.from("iniu_products").select("*", head),
      sb.from("products").select("*", head),
      sb.from("first_pass_observations").select("*", head),
      sb.from("mapping_reviews").select("*", head).eq("status", "pending"),
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
  const counts = await getCounts();
  return (
    <html lang="en">
      <body>
        <div className="app">
          <Sidebar counts={counts} />
          <main className="content">
            <div className="content-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
