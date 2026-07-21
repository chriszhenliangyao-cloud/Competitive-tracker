"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import { COUNTRY_NAMES, fmtEUR, titleCase } from "@/lib/format";
import { groupWeeks } from "@/lib/weeks";
import type { ChargerDashboardData, ChargerOffer, ChargerProduct, ChargerSection } from "@/lib/dashboard-charger";

// Charger dashboard: the market grouped by segment (wall / car / desktop / cable,
// split by wattage) instead of by INIU product, because there are no INIU
// chargers to anchor on. Same row/week layout as Prices by Country.

export default function ChargerPrices({ data }: { data: ChargerDashboardData }) {
  const [country, setCountry] = useState("");
  const [segment, setSegment] = useState("");
  const { sections, countries, stats } = data;

  const inC = (r: ChargerOffer) => !country || r.country === country;

  const visible = useMemo(
    () =>
      sections
        .filter((s) => !segment || s.key === segment)
        .map((s) => ({ ...s, products: s.products.filter((p) => p.rows.some(inC)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, segment, country],
  );

  const shownCount = visible.reduce((n, s) => n + s.products.length, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Charger Market</h1>
          <p>
            Competitor chargers by segment and power band — per-retailer price history (EUR).
            No INIU chargers yet, so this is the market map rather than a head-to-head.
          </p>
        </div>
        <div className="pill">{shownCount} products</div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={stats.products} />
        <Metric label="Listings" value={stats.listings} />
        <Metric label="Retailers" value={stats.retailers} />
        <Metric label="Unmapped" value={stats.unmapped} />
      </section>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Segment</label>
          <select value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="">All segments</option>
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({s.products.length})
              </option>
            ))}
          </select>
        </div>
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
      </div>

      {shownCount === 0 ? (
        <div className="table-panel">
          <div className="empty">No chargers match these filters.</div>
        </div>
      ) : (
        visible.map((s) => <Section key={s.key} section={s} inC={inC} />)
      )}
    </>
  );
}

function Section({ section, inC }: { section: ChargerSection; inC: (r: ChargerOffer) => boolean }) {
  if (section.products.length === 0) return null;
  return (
    <section className="table-panel">
      <div className="table-head">
        <h2>
          {section.label} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: 12 }}>· {section.sub}</span>
        </h2>
        <span className="count">{section.products.length} products</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Brand</th>
              <th>Product</th>
              <th>Power</th>
              <th>Retailer</th>
              <th>Price history (EUR)</th>
            </tr>
          </thead>
          <tbody>
            {section.products.map((p) => (
              <ProductRows key={p.key} product={p} inC={inC} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductRows({ product, inC }: { product: ChargerProduct; inC: (r: ChargerOffer) => boolean }) {
  const rows = product.rows.filter(inC);
  if (rows.length === 0) return null;
  const weeks = groupWeeks(product.dates).slice(-4);
  // price for a week = value at the latest date in that week the row has
  const weekVal = (row: ChargerOffer, w: { dates: string[] }): number | null => {
    for (let i = w.dates.length - 1; i >= 0; i--) {
      const v = row.byDate[w.dates[i]];
      if (v != null) return v;
    }
    return null;
  };

  return (
    <>
      {rows.map((r, i) => (
        <tr key={`${product.key}-${r.retailer}-${i}`}>
          {i === 0 ? (
            <>
              <td rowSpan={rows.length}>
                <Thumb src={product.image} alt={product.name} />
              </td>
              <td rowSpan={rows.length}>{titleCase(product.brand)}</td>
              <td rowSpan={rows.length}>
                {product.name}
                <div className="sub">
                  {product.sku ?? "—"}
                  {!product.mapped ? <span className="fp-src raw" style={{ marginLeft: 6 }}>unmapped</span> : null}
                </div>
              </td>
              <td rowSpan={rows.length}>
                {product.watt ?? "—"}
                {product.ports ? <div className="sub">{product.ports}</div> : null}
              </td>
            </>
          ) : null}
          <td>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                {r.retailer} ↗
              </a>
            ) : (
              r.retailer
            )}
            {r.country ? <span className="muted"> ({r.country})</span> : null}
            <div style={{ display: "flex", gap: 5, marginTop: 3 }}>
              {r.inStock === false ? <span className="fp-src raw">out of stock</span> : null}
              {r.onPromo ? <span className="fp-src lib">promo</span> : null}
            </div>
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
        </tr>
      ))}
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
