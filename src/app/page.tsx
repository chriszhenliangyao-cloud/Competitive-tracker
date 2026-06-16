import { createClient } from "@supabase/supabase-js";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type StatusRow = {
  status: string;
  count: number;
};

type DashboardRow = {
  retailer: string | null;
  brand: string | null;
  status: string | null;
  product_name: string | null;
  raw_name: string | null;
  price: number | null;
  promo_price: number | null;
  currency: string | null;
  scraped_date: string | null;
};

// Server-only. This page is a dynamic Server Component, so the service-role key
// never reaches the browser. NEVER import this module into a client component.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getData() {
  const supabase = getSupabase();

  const [{ count: listingCount }, { count: snapshotCount }, { count: reviewCount }] =
    await Promise.all([
      supabase.from("listings").select("*", { count: "exact", head: true }),
      supabase.from("price_snapshots").select("*", { count: "exact", head: true }),
      supabase
        .from("mapping_reviews")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  const { data: latestRows, error: latestError } = await supabase
    .from("v_dashboard_latest")
    .select(
      "retailer, brand, status, product_name, raw_name, price, promo_price, currency, scraped_date",
    )
    .order("scraped_date", { ascending: false })
    .limit(12);

  if (latestError) {
    throw latestError;
  }

  const statusCounts = (latestRows ?? []).reduce<Record<string, number>>((acc, row) => {
    const key = row.status ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    listingCount: listingCount ?? 0,
    snapshotCount: snapshotCount ?? 0,
    reviewCount: reviewCount ?? 0,
    statusRows: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    latestRows: (latestRows ?? []) as DashboardRow[],
  };
}

export default async function Home() {
  const { listingCount, snapshotCount, reviewCount, statusRows, latestRows } = await getData();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1>Competitive Tracker</h1>
          <p>Supabase connected dashboard for INIU powerbank market tracking.</p>
        </div>
        <div className={styles.status}>Live data</div>
      </header>

      <section className={styles.metrics} aria-label="Data summary">
        <Metric label="Listings" value={listingCount} />
        <Metric label="Price snapshots" value={snapshotCount} />
        <Metric label="Pending reviews" value={reviewCount} tone="warn" />
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <h2>Latest Status Sample</h2>
          <div className={styles.statusList}>
            {statusRows.map((row: StatusRow) => (
              <div className={styles.statusRow} key={row.status}>
                <span>{row.status}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Connection Check</h2>
          <p className={styles.panelText}>
            The app is reading Vercel environment variables and querying Supabase views at
            render time.
          </p>
        </div>
      </section>

      <section className={styles.tablePanel}>
        <div className={styles.tableHeader}>
          <h2>Recent Channel Listings</h2>
          <span>{latestRows.length} rows</span>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Retailer</th>
                <th>Brand</th>
                <th>Status</th>
                <th>Product</th>
                <th>Price</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {latestRows.map((row, index) => (
                <tr key={`${row.retailer}-${row.brand}-${index}`}>
                  <td>{row.retailer ?? "-"}</td>
                  <td>{row.brand ?? "-"}</td>
                  <td>{row.status ?? "-"}</td>
                  <td>{row.product_name ?? row.raw_name ?? "-"}</td>
                  <td>
                    {formatPrice(row.promo_price ?? row.price, row.currency)}
                  </td>
                  <td>{row.scraped_date ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  return (
    <div className={`${styles.metric} ${tone === "warn" ? styles.warn : ""}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function formatPrice(value: number | null, currency: string | null) {
  if (value == null) return "-";
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency ?? ""}`.trim();
}
