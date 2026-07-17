import { getDashboardData } from "@/lib/dashboard";
import PricesByCountry from "./PricesByCountry";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Shared with the HTML export (/api/export) so the two can't drift.
  const { products, compByIniu, ownByIniu } = await getDashboardData();
  return <PricesByCountry products={products} compByIniu={compByIniu} ownByIniu={ownByIniu} />;
}
