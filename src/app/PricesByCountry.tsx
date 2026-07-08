"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import Sparkline from "@/components/Sparkline";
import { COUNTRY_NAMES, fmtEUR, fmtMoney, titleCase } from "@/lib/format";
import type { Competitor, PriceRow } from "./iniu/IniuTable";

export type Prod = { id: number; name: string; sku: string; image_url: string | null };

export default function PricesByCountry({
  products,
  compByIniu,
  ownByIniu,
}: {
  products: Prod[];
  compByIniu: Record<number, Competitor[]>;
  ownByIniu: Record<number, PriceRow[]>;
}) {
  const [country, setCountry] = useState("");
  const [product, setProduct] = useState(""); // "" = show all

  const countries = useMemo(() => {
    const s = new Set<string>();
    Object.values(compByIniu).forEach((cs) => cs.forEach((c) => c.priceRows.forEach((r) => r.country && s.add(r.country))));
    Object.values(ownByIniu).forEach((rows) => rows.forEach((r) => r.country && s.add(r.country)));
    return [...s].sort();
  }, [compByIniu, ownByIniu]);

  const inCountry = (rows: PriceRow[]) => rows.some((r) => !country || r.country === country);

  const visible = useMemo(
    () =>
      products.filter((p) => {
        if (product && String(p.id) !== product) return false;
        return inCountry(ownByIniu[p.id] ?? []) || (compByIniu[p.id] ?? []).some((c) => inCountry(c.priceRows));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, product, country, compByIniu, ownByIniu],
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Prices by Country</h1>
          <p>INIU vs mapped competitors — per-retailer price history (EUR). INIU&apos;s own price is the first row.</p>
        </div>
        <div className="pill">{visible.length} products</div>
      </header>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Country</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_NAMES[c] ?? c}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Product</label>
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Show all</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="table-panel">
          <div className="empty">No prices for this filter.</div>
        </div>
      ) : (
        visible.map((p) => (
          <ProductSection
            key={p.id}
            product={p}
            competitors={compByIniu[p.id] ?? []}
            ownRows={ownByIniu[p.id] ?? []}
            country={country}
          />
        ))
      )}
    </>
  );
}

function ProductSection({
  product,
  competitors,
  ownRows,
  country,
}: {
  product: Prod;
  competitors: Competitor[];
  ownRows: PriceRow[];
  country: string;
}) {
  const inC = (r: PriceRow) => !country || r.country === country;
  const own = ownRows.filter(inC);
  const ownDates = [...new Set(own.flatMap((r) => Object.keys(r.byDate)))].sort();
  const comps = competitors.filter((c) => c.priceRows.some(inC));
  if (own.length === 0 && comps.length === 0) return null;

  return (
    <section className="table-panel">
      <div className="table-head">
        <h2>{product.name}</h2>
        <span className="count">{comps.length} competitors</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Brand</th>
              <th>Product</th>
              <th>RRP</th>
              <th>Retailer</th>
              <th>Price history (EUR)</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {own.length > 0 ? (
              <Group
                image={product.image_url}
                brand="INIU"
                name={product.name}
                sku={product.sku}
                rrp={null}
                rrpCurrency={null}
                rows={own}
                dates={ownDates}
                own
              />
            ) : null}
            {comps.map((c) => (
              <Group
                key={c.id}
                image={c.image_url}
                brand={titleCase(c.brand)}
                name={c.name}
                sku={c.sku}
                rrp={c.rrp}
                rrpCurrency={c.rrp_currency}
                rows={c.priceRows.filter(inC)}
                dates={c.dates}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ISO-8601 week of a "YYYY-MM-DD" date (weeks start Monday). Same-week dates
// share a key so a scrape that straddled two days collapses into one column.
function isoWeek(dateStr: string): { key: string; label: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  dt.setUTCDate(dt.getUTCDate() - day + 3); // Thursday of this week
  const isoYear = dt.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * 24 * 3600 * 1000));
  return { key: `${isoYear}-W${String(week).padStart(2, "0")}`, label: `W${week}` };
}

// Group a sorted date list into ISO weeks (ascending).
function groupWeeks(dates: string[]): { key: string; label: string; dates: string[] }[] {
  const map = new Map<string, { key: string; label: string; dates: string[] }>();
  for (const d of dates) {
    const { key, label } = isoWeek(d);
    if (!map.has(key)) map.set(key, { key, label, dates: [] });
    map.get(key)!.dates.push(d);
  }
  const weeks = [...map.values()];
  weeks.forEach((w) => w.dates.sort());
  weeks.sort((a, b) => a.key.localeCompare(b.key));
  return weeks;
}

function Group({
  image,
  brand,
  name,
  sku,
  rrp,
  rrpCurrency,
  rows,
  dates,
  own,
}: {
  image: string | null;
  brand: string;
  name: string;
  sku: string;
  rrp: number | null;
  rrpCurrency: string | null;
  rows: PriceRow[];
  dates: string[];
  own?: boolean;
}) {
  const bg = own ? "var(--accent-bg)" : undefined;
  const weeks = groupWeeks(dates).slice(-4);
  // Price for a week = the value at the latest date in that week the row has.
  const weekVal = (row: PriceRow, w: { dates: string[] }): number | null => {
    for (let i = w.dates.length - 1; i >= 0; i--) {
      const v = row.byDate[w.dates[i]];
      if (v != null) return v;
    }
    return null;
  };
  return (
    <>
      {rows.map((r, i) => (
        <tr key={`${sku}-${r.retailer}-${i}`} style={bg ? { background: bg } : undefined}>
          {i === 0 ? (
            <>
              <td rowSpan={rows.length}>
                <Thumb src={image} alt={name} />
              </td>
              <td rowSpan={rows.length} style={own ? { color: "var(--accent)", fontWeight: 700 } : undefined}>
                {brand}
              </td>
              <td rowSpan={rows.length}>
                {name}
                <div className="sub">{sku}</div>
              </td>
              <td rowSpan={rows.length}>{rrp != null ? fmtMoney(rrp, rrpCurrency) : "—"}</td>
            </>
          ) : null}
          <td>
            {r.retailer}
            {r.country ? <span className="muted"> ({r.country})</span> : null}
          </td>
          <td>
            <div style={{ display: "flex", gap: 10 }}>
              {weeks.map((w, wi) => {
                const v = weekVal(r, w);
                const prev = wi > 0 ? weekVal(r, weeks[wi - 1]) : null;
                let cls = "";
                if (v != null && prev != null && v !== prev) cls = v > prev ? "chg-up" : "chg-down";
                return (
                  <div key={w.key} title={w.dates.join(", ")} style={{ textAlign: "right", minWidth: 52 }}>
                    <div style={{ fontSize: 10, color: "#9aa6ae" }}>{w.label}</div>
                    <div className={cls}>{v != null ? fmtEUR(v) : "—"}</div>
                  </div>
                );
              })}
            </div>
          </td>
          <td>
            <Sparkline values={weeks.map((w) => weekVal(r, w))} />
          </td>
        </tr>
      ))}
    </>
  );
}
