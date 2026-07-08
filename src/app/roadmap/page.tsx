import { getRoadmapData } from "@/lib/roadmap";
import Roadmap from "./Roadmap";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const data = await getRoadmapData();
  return <Roadmap data={data} />;
}
