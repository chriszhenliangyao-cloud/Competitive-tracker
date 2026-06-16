import { getChannelRows } from "@/lib/data";
import ChannelBrowser from "./ChannelBrowser";

export const dynamic = "force-dynamic";

export default async function ChannelPage() {
  const rows = await getChannelRows();
  return <ChannelBrowser rows={rows} />;
}
