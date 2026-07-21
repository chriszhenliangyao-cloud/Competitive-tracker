"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import MultiSelect from "@/components/MultiSelect";
import Sparkline from "@/components/Sparkline";
import { COUNTRY_NAMES, fmtEUR, rrpParts, titleCase } from "@/lib/format";
import { groupWeeks } from "@/lib/weeks";
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
  // Multi-select: empty means every product, so the board opens complete. Lets
  // you pin a handful of INIU models side by side instead of one at a time.
  const [selected, setSelected] = useState<string[]>([]);

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
        if (selected.length > 0 && !selected.includes(String(p.id))) return false;
        return inCountry(ownByIniu[p.id] ?? []) || (compByIniu[p.id] ?? []).some((c) => inCountry(c.priceRows));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, selected, country, compByIniu, ownByIniu],
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Prices by Country</h1>
          <p>INIU vs mapped competitors — per-retailer price history (EUR). INIU&apos;s own price is the first row.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Static HTML snapshot of exactly what's on screen (both filters carry over). */}
          <a
            className="btn"
            href={`/api/export${
              country || selected.length
                ? "?" +
                  new URLSearchParams({
                    ...(country ? { country } : {}),
                    ...(selected.length ? { products: selected.join(",") } : {}),
                  }).toString()
                : ""
            }`}
            download
          >
            ↓ Export HTML
          </a>
          <div className="pill">{visible.length} products</div>
        </div>
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
        <MultiSelect
          label="Products"
          allLabel="All products"
          options={products.map((p) => ({ value: String(p.id), label: p.name }))}
          selected={selected}
          onChange={setSelected}
        />
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
              <td rowSpan={rows.length}>
                {(() => {
                  const { eur, native } = rrpParts(rrp, rrpCurrency);
                  return (
                    <>
                      {eur}
                      {native ? <div className="sub">{native}</div> : null}
                    </>
                  );
                })()}
              </td>
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
