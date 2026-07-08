"use client";

import { useMemo, useState } from "react";
import type { ChannelRow } from "@/lib/data";
import { COUNTRY_NAMES, effectivePrice, fmtEUR, titleCase, toEUR } from "@/lib/format";
import Thumb from "@/components/Thumb";
import PriceChart from "@/components/PriceChart";

type Listing = {
  id: number;
  retailer: string;
  retailerKey: string;
  country: string | null;
  code: string | null;
  status: string | null;
  url: string | null;
  byDate: Map<string, { eur: number | null; promo: boolean }>;
};

type Product = {
  key: string;
  title: string;
  sku: string | null;
  brand: string;
  image: string | null;
  capacity: string | null;
  wired: string | null;
  wireless: string | null;
  magsafe: boolean;
  listings: Listing[];
  status: string; // rollup: any new_listing/library_missing else mapped
  dates: string[]; // all dates across listings, sorted asc
};

const firstNum = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const m = String(s).replace(/[ ,]/g, "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
};

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

function buildProducts(rows: ChannelRow[]): Product[] {
  const map = new Map<string, Product>();
  for (const r of rows) {
    const sku = r.product?.sku || r.raw_sku || null;
    const key = sku ? `sku:${sku.toUpperCase()}` : `name:${(r.raw_name || "").toLowerCase()}`;
    let p = map.get(key);
    if (!p) {
      p = {
        key,
        title: r.product?.name || r.raw_name || sku || "(unnamed)",
        sku,
        brand: r.brand?.display_name || "—",
        image: r.image || null,
        capacity: r.product?.capacity ?? null,
        wired: r.product?.wired_power ?? null,
        wireless: r.product?.wireless_power ?? null,
        magsafe: !!r.product?.magsafe,
        listings: [],
        status: "mapped",
        dates: [],
      };
      map.set(key, p);
    }
    if (!p.image && r.image) p.image = r.image;
    const byDate = new Map<string, { eur: number | null; promo: boolean }>();
    for (const s of r.snapshots) {
      if (!s.scraped_date) continue;
      const eff = effectivePrice(s.price, s.promo_price);
      byDate.set(s.scraped_date, {
        eur: toEUR(eff, s.currency),
        promo: s.promo_price != null && s.price != null && s.promo_price < s.price,
      });
    }
    p.listings.push({
      id: r.id,
      retailer: r.retailer?.display_name || "—",
      retailerKey: r.retailer?.key || "",
      country: r.retailer?.country ?? null,
      code: r.retailer_product_code,
      status: r.status,
      url: r.url,
      byDate,
    });
    if (r.status === "new_listing" || r.status === "library_missing") p.status = r.status;
  }
  for (const p of map.values()) {
    const ds = new Set<string>();
    p.listings.forEach((l) => l.byDate.forEach((_, d) => ds.add(d)));
    p.dates = [...ds].sort();
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export default function ChannelBrowser({ rows }: { rows: ChannelRow[] }) {
  const products = useMemo(() => buildProducts(rows), [rows]);

  const [brand, setBrand] = useState("");
  const [country, setCountry] = useState("");
  const [retailer, setRetailer] = useState("");
  const [status, setStatus] = useState("");
  const [magsafe, setMagsafe] = useState("");
  const [capMin, setCapMin] = useState("");
  const [capMax, setCapMax] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const opts = useMemo(() => {
    const brands = new Set<string>();
    const countries = new Set<string>();
    const retailers = new Set<string>();
    const caps = new Set<number>();
    for (const p of products) {
      brands.add(p.brand);
      const c = firstNum(p.capacity);
      if (c) caps.add(c);
      for (const l of p.listings) {
        retailers.add(l.retailer);
        if (l.country) countries.add(l.country);
      }
    }
    return {
      brands: [...brands].sort(),
      countries: [...countries].sort(),
      retailers: [...retailers].sort(),
      caps: [...caps].sort((a, b) => a - b),
    };
  }, [products]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const cmin = capMin ? Number(capMin) : null;
    const cmax = capMax ? Number(capMax) : null;
    return products.filter((p) => {
      if (brand && p.brand !== brand) return false;
      if (magsafe === "yes" && !p.magsafe) return false;
      if (magsafe === "no" && p.magsafe) return false;
      const cap = firstNum(p.capacity);
      if (cmin != null && (cap == null || cap < cmin)) return false;
      if (cmax != null && (cap == null || cap > cmax)) return false;
      // listing-level filters
      const ls = p.listings.filter((l) => {
        if (country && l.country !== country) return false;
        if (retailer && l.retailer !== retailer) return false;
        if (status && l.status !== status) return false;
        return true;
      });
      if (country || retailer || status) {
        if (ls.length === 0) return false;
      }
      if (qq) {
        const hay = `${p.title} ${p.sku ?? ""} ${p.brand}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [products, brand, country, retailer, status, magsafe, capMin, capMax, q]);

  const kpis = useMemo(() => {
    const retailers = new Set<string>();
    const countries = new Set<string>();
    let listings = 0;
    let promos = 0;
    let mapped = 0;
    let nu = 0;
    for (const p of filtered) {
      for (const l of p.listings) {
        listings++;
        retailers.add(l.retailer);
        if (l.country) countries.add(l.country);
        if (l.status === "mapped") mapped++;
        if (l.status === "new_listing") nu++;
        const last = p.dates[p.dates.length - 1];
        if (last && l.byDate.get(last)?.promo) promos++;
      }
    }
    return { products: filtered.length, listings, retailers: retailers.size, countries: countries.size, promos, mapped, nu };
  }, [filtered]);

  const selectedProduct = selected ? products.find((p) => p.key === selected) ?? null : null;

  if (selectedProduct) {
    return <Detail product={selectedProduct} onBack={() => setSelected(null)} />;
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Channel</h1>
          <p>Retailer listings grouped by product. Prices normalized to EUR for comparison.</p>
        </div>
        <div className="pill">{kpis.products} products</div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={kpis.products} />
        <Metric label="Listings" value={kpis.listings} />
        <Metric label="Retailers" value={kpis.retailers} />
        <Metric label="Countries" value={kpis.countries} />
        <Metric label="Mapped" value={kpis.mapped} />
        <Metric label="New" value={kpis.nu} />
        <Metric label="Promos" value={kpis.promos} />
      </section>

      <div className="filter-bar">
        <Sel label="Brand" value={brand} set={setBrand} opts={opts.brands} render={titleCase} />
        <Sel
          label="Country"
          value={country}
          set={setCountry}
          opts={opts.countries}
          render={(c) => COUNTRY_NAMES[c] ?? c}
        />
        <Sel label="Retailer" value={retailer} set={setRetailer} opts={opts.retailers} />
        <Sel
          label="Status"
          value={status}
          set={setStatus}
          opts={["mapped", "new_listing", "library_missing", "skip"]}
          render={(s) => statusLabel[s] ?? s}
        />
        <div className="filter-group">
          <label>MagSafe</label>
          <select value={magsafe} onChange={(e) => setMagsafe(e.target.value)}>
            <option value="">All</option>
            <option value="yes">MagSafe only</option>
            <option value="no">Non-MagSafe</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Capacity (mAh)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={capMin} onChange={(e) => setCapMin(e.target.value)} style={{ minWidth: 90 }}>
              <option value="">Min</option>
              {opts.caps.map((c) => (
                <option key={c} value={c}>
                  {c.toLocaleString()}
                </option>
              ))}
            </select>
            <select value={capMax} onChange={(e) => setCapMax(e.target.value)} style={{ minWidth: 90 }}>
              <option value="">Max</option>
              {opts.caps.map((c) => (
                <option key={c} value={c}>
                  {c.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="filter-group" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            className="search"
            type="search"
            placeholder="Product, SKU, brand…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="table-panel">
          <div className="empty">No products match these filters.</div>
        </div>
      ) : (
        <div className="card-grid">
          {filtered.map((p) => (
            <Card key={p.key} p={p} onOpen={() => setSelected(p.key)} country={country} retailer={retailer} status={status} />
          ))}
        </div>
      )}
    </>
  );
}

function Card({
  p,
  onOpen,
  country,
  retailer,
  status,
}: {
  p: Product;
  onOpen: () => void;
  country: string;
  retailer: string;
  status: string;
}) {
  const dates = p.dates.slice(-4);
  const listings = p.listings.filter((l) => {
    if (country && l.country !== country) return false;
    if (retailer && l.retailer !== retailer) return false;
    if (status && l.status !== status) return false;
    return true;
  });
  const cls = `pcard${p.status === "new_listing" ? " is-new" : ""}`;
  const specBits = [p.capacity, p.wired, p.wireless].filter(Boolean).join(" · ");
  return (
    <div className={cls} onClick={onOpen}>
      <div className="pcard-head">
        <Thumb src={p.image} alt={p.title} large />
        <div style={{ minWidth: 0 }}>
          <div className="pcard-title">{p.title}</div>
          <div className="pcard-sku">
            {p.sku ?? "—"} · {titleCase(p.brand)}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.status === "new_listing" ? <span className="badge badge-new">NEW</span> : null}
            {p.magsafe ? <span className="badge badge-magsafe">MagSafe</span> : null}
          </div>
        </div>
      </div>
      {specBits ? <div className="sub" style={{ marginTop: 10 }}>{specBits}</div> : null}
      <table className="price-table">
        <thead>
          <tr>
            <th>Retailer</th>
            {dates.map((d) => (
              <th key={d}>{d.slice(5)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            let prev: number | null = null;
            return (
              <tr key={l.id}>
                <td>
                  {l.retailer}
                  {l.country ? <span className="muted"> ({l.country})</span> : null}
                  {l.status === "library_missing" ? <span className="out">missing</span> : null}
                </td>
                {dates.map((d) => {
                  const cell = l.byDate.get(d);
                  const v = cell?.eur ?? null;
                  let cls2 = "";
                  if (v != null && prev != null && v !== prev) cls2 = v > prev ? "chg-up" : "chg-down";
                  if (cell?.promo) cls2 = "promo";
                  if (v != null) prev = v;
                  return (
                    <td key={d} className={cls2}>
                      {v != null ? fmtEUR(v) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ product, onBack }: { product: Product; onBack: () => void }) {
  // series per retailer for the chart
  const series = product.listings.map((l) => ({
    label: `${l.retailer}${l.country ? ` (${l.country})` : ""}`,
    points: product.dates
      .map((d) => ({ date: d, value: l.byDate.get(d)?.eur ?? null }))
      .filter((pt) => pt.value != null) as { date: string; value: number }[],
  }));

  return (
    <>
      <header className="page-head">
        <div>
          <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>
            ← Back
          </button>
          <h1>{product.title}</h1>
          <p>
            {product.sku ?? "—"} · {titleCase(product.brand)}
            {product.capacity ? ` · ${product.capacity}` : ""}
            {product.wired ? ` · ${product.wired}` : ""}
            {product.magsafe ? " · MagSafe" : ""}
          </p>
        </div>
        <Thumb src={product.image} alt={product.title} large />
      </header>

      <div className="panel">
        <h2>Price history (EUR)</h2>
        <div style={{ marginTop: 14 }}>
          <PriceChart series={series} />
        </div>
      </div>

      <section className="table-panel">
        <div className="table-head">
          <h2>Listings</h2>
          <span className="count">{product.listings.length} retailers</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Retailer</th>
                <th>Country</th>
                <th>Code</th>
                <th>Status</th>
                {product.dates.slice(-6).map((d) => (
                  <th key={d}>{d.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {product.listings.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                        {l.retailer} ↗
                      </a>
                    ) : (
                      l.retailer
                    )}
                  </td>
                  <td>{l.country ? COUNTRY_NAMES[l.country] ?? l.country : "—"}</td>
                  <td className="muted">{l.code ?? "—"}</td>
                  <td>
                    <span className={`badge ${statusBadge[l.status ?? ""] ?? "badge-skip"}`}>
                      {statusLabel[l.status ?? ""] ?? l.status ?? "—"}
                    </span>
                  </td>
                  {product.dates.slice(-6).map((d) => {
                    const cell = l.byDate.get(d);
                    return (
                      <td key={d} className={cell?.promo ? "promo" : ""}>
                        {cell?.eur != null ? fmtEUR(cell.eur) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function Sel({
  label,
  value,
  set,
  opts,
  render,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  opts: string[];
  render?: (v: string) => string;
}) {
  return (
    <div className="filter-group">
      <label>{label}</label>
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">All</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}
