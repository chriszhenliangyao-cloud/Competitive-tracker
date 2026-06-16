"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import { COUNTRY_NAMES, fmtMoney, titleCase } from "@/lib/format";

export type FpRow = {
  id: number;
  product_name: string | null;
  sku: string | null;
  ean: string | null;
  retailer_product_code: string | null;
  price: number | string | null;
  promo_price: number | string | null;
  currency: string | null;
  in_stock: boolean | null;
  url: string | null;
  image_url: string | null;
  capacity: string | null;
  power: string | null;
  usb_ports: string | null;
  scraped_date: string | null;
  brand: { display_name: string } | null;
  retailer: { display_name: string; country: string | null } | null;
};

export default function FirstPassTable({ rows }: { rows: FpRow[] }) {
  const [retailer, setRetailer] = useState("");
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");

  const retailers = useMemo(
    () => [...new Set(rows.map((r) => r.retailer?.display_name ?? "—"))].sort(),
    [rows],
  );
  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand?.display_name ?? "—"))].sort(), [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (retailer && (r.retailer?.display_name ?? "—") !== retailer) return false;
      if (brand && (r.brand?.display_name ?? "—") !== brand) return false;
      if (qq) {
        const hay = `${r.product_name ?? ""} ${r.sku ?? ""} ${r.retailer_product_code ?? ""} ${r.ean ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [rows, retailer, brand, q]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>First Pass</h1>
          <p>Raw heavy-extraction scrape observations (calibration data).</p>
        </div>
        <div className="pill">{rows.length} rows</div>
      </header>

      <section className="metrics">
        <Metric label="Observations" value={rows.length} />
        <Metric label="Showing" value={filtered.length} />
        <Metric label="Retailers" value={retailers.length} />
        <Metric label="Brands" value={brands.length} />
      </section>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Retailer</label>
          <select value={retailer} onChange={(e) => setRetailer(e.target.value)}>
            <option value="">All</option>
            {retailers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Brand</label>
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {titleCase(b)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group" style={{ flex: 1 }}>
          <label>Search</label>
          <input className="search" type="search" placeholder="Name, SKU, code, EAN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <section className="table-panel">
        <div className="table-head">
          <h2>Observations</h2>
          <span className="count">
            {filtered.length} of {rows.length}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th>Retailer</th>
                <th>Brand</th>
                <th>SKU</th>
                <th>Code</th>
                <th>Capacity</th>
                <th>Power</th>
                <th>Price</th>
                <th>Promo</th>
                <th>Stock</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Thumb src={r.image_url} alt={r.product_name ?? ""} />
                  </td>
                  <td>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#1d6fb8" }}>
                        {r.product_name || "—"} ↗
                      </a>
                    ) : (
                      r.product_name || "—"
                    )}
                  </td>
                  <td>
                    {r.retailer?.display_name ?? "—"}
                    {r.retailer?.country ? (
                      <span className="muted"> ({COUNTRY_NAMES[r.retailer.country] ?? r.retailer.country})</span>
                    ) : null}
                  </td>
                  <td>{titleCase(r.brand?.display_name)}</td>
                  <td className="muted">{r.sku ?? "—"}</td>
                  <td className="muted">{r.retailer_product_code ?? "—"}</td>
                  <td>{r.capacity ?? "—"}</td>
                  <td>{r.power ?? "—"}</td>
                  <td>{r.price != null ? fmtMoney(Number(r.price), r.currency) : "—"}</td>
                  <td className={r.promo_price != null ? "promo" : ""}>
                    {r.promo_price != null ? fmtMoney(Number(r.promo_price), r.currency) : "—"}
                  </td>
                  <td>{r.in_stock == null ? "—" : r.in_stock ? "Yes" : "No"}</td>
                  <td>{r.scraped_date ?? "—"}</td>
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
