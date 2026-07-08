import { getRoadmapData } from "@/lib/roadmap";
import { getScope } from "@/lib/scope";
import Roadmap from "./Roadmap";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const scope = await getScope();
  // Sales see only competitors sold in their country; admins (countries=null) see all.
  const data = await getRoadmapData(scope.countries);
  return <Roadmap data={data} />;
}
