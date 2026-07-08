import { getChannelRows } from "@/lib/data";
import { getScope, allowsCountry } from "@/lib/scope";
import ChannelBrowser from "./ChannelBrowser";

export const dynamic = "force-dynamic";

export default async function ChannelPage() {
  const [rows, scope] = await Promise.all([getChannelRows(), getScope()]);
  // Country scope: sales users only see retailers in their country (filtered
  // server-side — the browser never receives other countries' rows). Admins: all.
  const visible = scope.countries === null ? rows : rows.filter((r) => allowsCountry(scope, r.retailer?.country));
  return <ChannelBrowser rows={visible} />;
}
