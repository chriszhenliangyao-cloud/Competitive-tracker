import { getDashboardData } from "@/lib/dashboard";
import { getChargerDashboardData } from "@/lib/dashboard-charger";
import { getCategoryKey } from "@/lib/category-server";
import PricesByCountry from "./PricesByCountry";
import ChargerPrices from "./ChargerPrices";

export const dynamic = "force-dynamic";

export default async function Home() {
  // The two lines need different backbones: power banks hang off INIU products
  // (INIU price vs mapped competitors), chargers have no INIU anchor yet so they
  // are grouped by market segment instead.
  const category = await getCategoryKey();

  if (category === "charger") {
    return <ChargerPrices data={await getChargerDashboardData()} />;
  }

  // Shared with the HTML export (/api/export) so the two can't drift.
  const { products, compByIniu, ownByIniu } = await getDashboardData();
  return <PricesByCountry products={products} compByIniu={compByIniu} ownByIniu={ownByIniu} />;
}
