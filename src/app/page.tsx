import { getSupabase } from "@/lib/supabase";
import { getChannelRows, type ChannelRow } from "@/lib/data";
import { COUNTRY_NAMES, effectivePrice, fmtMoney, titleCase } from "@/lib/format";
import Thumb from "@/components/Thumb";

export const dynamic = "force-dynamic";

function latestSnap(r: ChannelRow) {
  return [...r.snapshots]
    .filter((s) => s.scraped_date)
    .sort((a, b) => (a.scraped_date! < b.scraped_date! ? 1 : -1))[0];
}

export default async function Home() {
  const sb = getSupabase();
  const [rows, iniuRes, reviewRes] = await Promise.all([
    getChannelRows(),
    sb.from("iniu_products").select("*", { count: "exact", head: true }),
    sb.from("mapping_reviews").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const byStatus: Record<string, number> = {};
  const retailers = new Set<string>();
  const brands = new Set<string>();
  const countries = new Set<string>();
  let snapCount = 0;
  let promoCount = 0;
  for (const r of rows) {
    byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
    if (r.retailer?.display_name) retailers.add(r.retailer.display_name);
    if (r.brand?.display_name) brands.add(r.brand.display_name);
    if (r.retailer?.country) countries.add(r.retailer.country);
    snapCount += r.snapshots.length;
    const s = latestSnap(r);
    if (s && s.promo_price != null && s.price != null && s.promo_price < s.price) promoCount++;
  }

  // by-brand breakdown
  const brandAgg = new Map<string, { total: number; mapped: number; nu: number }>();
  for (const r of rows) {
    const b = r.brand?.display_name ?? "—";
    const a = brandAgg.get(b) ?? { total: 0, mapped: 0, nu: 0 };
    a.total++;
    if (r.status === "mapped") a.mapped++;
    if (r.status === "new_listing") a.nu++;
    brandAgg.set(b, a);
  }
  const brandRows = [...brandAgg.entries()].sort((a, b) => b[1].total - a[1].total);

  // recent listings
  const recent = [...rows]
    .map((r) => ({ r, s: latestSnap(r) }))
    .filter((x) => x.s?.scraped_date)
    .sort((a, b) => (a.s!.scraped_date! < b.s!.scraped_date! ? 1 : -1))
    .slice(0, 12);

  const statusLabel: Record<string, string> = {
    mapped: "Mapped",
    new_listing: "New listing",
    library_missing: "Library missing",
    skip: "Skipped",
  };
  const statusBadge: Record<string, string> = {
    mapped: "badge-mapped",
    new_listing: "badge-new",
    library_missing: "badge-missing",
    skip: "badge-skip",
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>European powerbank competitive intelligence for INIU — live from Supabase.</p>
        </div>
        <div className="pill">Live data</div>
      </header>

      <section className="metrics">
        <Metric label="Listings" value={rows.length} />
        <Metric label="Mapped" value={byStatus.mapped ?? 0} />
        <Metric label="New listings" value={byStatus.new_listing ?? 0} />
        <Metric label="Pending reviews" value={reviewRes.count ?? 0} warn />
        <Metric label="Retailers" value={retailers.size} />
        <Metric label="Brands" value={brands.size} />
        <Metric label="Countries" value={countries.size} />
        <Metric label="Price snapshots" value={snapCount} />
        <Metric label="Promos live" value={promoCount} />
        <Metric label="INIU products" value={iniuRes.count ?? 0} />
      </section>

      <section className="table-panel">
        <div className="table-head">
          <h2>Coverage by brand</h2>
          <span className="count">{brandRows.length} brands</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Listings</th>
                <th>Mapped</th>
                <th>New</th>
              </tr>
            </thead>
            <tbody>
              {brandRows.map(([b, a]) => (
                <tr key={b}>
                  <td>{titleCase(b)}</td>
                  <td>{a.total}</td>
                  <td>{a.mapped}</td>
                  <td>{a.nu}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-panel">
        <div className="table-head">
          <h2>Recent listings</h2>
          <span className="count">{recent.length} rows</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th>Brand</th>
                <th>Retailer</th>
                <th>Status</th>
                <th>Price</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(({ r, s }) => (
                <tr key={r.id}>
                  <td>
                    <Thumb src={r.product?.image_url} alt={r.product?.name} />
                  </td>
                  <td>
                    {r.product?.name ?? r.raw_name ?? "—"}
                    {r.product?.sku ? <div className="sub">{r.product.sku}</div> : null}
                  </td>
                  <td>{titleCase(r.brand?.display_name)}</td>
                  <td>
                    {r.retailer?.display_name ?? "—"}
                    {r.retailer?.country ? (
                      <span className="muted"> ({COUNTRY_NAMES[r.retailer.country] ?? r.retailer.country})</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`badge ${statusBadge[r.status ?? ""] ?? "badge-skip"}`}>
                      {statusLabel[r.status ?? ""] ?? r.status ?? "—"}
                    </span>
                  </td>
                  <td>{fmtMoney(effectivePrice(s!.price, s!.promo_price), s!.currency)}</td>
                  <td>{s!.scraped_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`metric${warn ? " warn" : ""}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}
