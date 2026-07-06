"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import Sparkline from "@/components/Sparkline";
import { COUNTRY_NAMES, fmtEUR, fmtMoney, titleCase } from "@/lib/format";
import type { Competitor } from "./iniu/IniuTable";

export type Prod = { id: number; name: string; sku: string };

export default function PricesByCountry({
  products,
  compByIniu,
}: {
  products: Prod[];
  compByIniu: Record<number, Competitor[]>;
}) {
  const [country, setCountry] = useState("");
  const [product, setProduct] = useState(""); // "" = show all

  const countries = useMemo(() => {
    const s = new Set<string>();
    Object.values(compByIniu).forEach((cs) =>
      cs.forEach((c) => c.priceRows.forEach((r) => r.country && s.add(r.country))),
    );
    return [...s].sort();
  }, [compByIniu]);

  const visible = useMemo(
    () =>
      products.filter((p) => {
        if (product && String(p.id) !== product) return false;
        return (compByIniu[p.id] ?? []).some((c) => c.priceRows.some((r) => !country || r.country === country));
      }),
    [products, product, country, compByIniu],
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Prices by Country</h1>
          <p>INIU products vs mapped competitors — per-retailer price history (EUR).</p>
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
          <div className="empty">No priced competitors for this filter.</div>
        </div>
      ) : (
        visible.map((p) => (
          <ProductSection key={p.id} product={p} competitors={compByIniu[p.id] ?? []} country={country} />
        ))
      )}
    </>
  );
}

function ProductSection({
  product,
  competitors,
  country,
}: {
  product: Prod;
  competitors: Competitor[];
  country: string;
}) {
  const comps = competitors.filter((c) => c.priceRows.some((r) => !country || r.country === country));
  if (comps.length === 0) return null;
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
            {comps.map((c) => {
              const rows = c.priceRows.filter((r) => !country || r.country === country);
              const dates = c.dates.slice(-4);
              return rows.map((r, i) => (
                <tr key={`${c.id}-${r.retailer}-${i}`}>
                  {i === 0 ? (
                    <>
                      <td rowSpan={rows.length}>
                        <Thumb src={c.image_url} alt={c.name} />
                      </td>
                      <td rowSpan={rows.length}>{titleCase(c.brand)}</td>
                      <td rowSpan={rows.length}>
                        {c.name}
                        <div className="sub">{c.sku}</div>
                      </td>
                      <td rowSpan={rows.length}>{c.rrp != null ? fmtMoney(c.rrp, c.rrp_currency) : "—"}</td>
                    </>
                  ) : null}
                  <td>
                    {r.retailer}
                    {r.country ? <span className="muted"> ({r.country})</span> : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 10 }}>
                      {dates.map((d, di) => {
                        const v = r.byDate[d] ?? null;
                        const prev = di > 0 ? r.byDate[dates[di - 1]] ?? null : null;
                        let cls = "";
                        if (v != null && prev != null && v !== prev) cls = v > prev ? "chg-up" : "chg-down";
                        return (
                          <div key={d} style={{ textAlign: "right", minWidth: 52 }}>
                            <div style={{ fontSize: 10, color: "#9aa6ae" }}>{d.slice(5)}</div>
                            <div className={cls}>{v != null ? fmtEUR(v) : "—"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <Sparkline values={dates.map((d) => r.byDate[d] ?? null)} />
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
