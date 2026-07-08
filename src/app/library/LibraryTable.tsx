"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import { fmtMoney, titleCase } from "@/lib/format";

export type LibProduct = {
  id: number;
  sku: string;
  name: string;
  ean: string | null;
  capacity: string | null;
  wired_power: string | null;
  wireless_power: string | null;
  usb_ports: string | null;
  magsafe: boolean | null;
  size: string | null;
  weight: string | null;
  rrp: number | string | null;
  rrp_currency: string | null;
  image_url: string | null;
  source_type: string | null;
  brand: { display_name: string; key: string } | null;
};

const KEY_FIELDS: (keyof LibProduct)[] = [
  "capacity",
  "wired_power",
  "wireless_power",
  "usb_ports",
  "size",
  "weight",
];

const filled = (p: LibProduct) => KEY_FIELDS.filter((f) => p[f] != null && String(p[f]).trim() !== "").length;

export default function LibraryTable({ products }: { products: LibProduct[] }) {
  const [brand, setBrand] = useState("");
  const [comp, setComp] = useState("");
  const [q, setQ] = useState("");

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand?.display_name ?? "—"))].sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return products.filter((p) => {
      if (brand && (p.brand?.display_name ?? "—") !== brand) return false;
      const f = filled(p);
      if (comp === "complete" && f < KEY_FIELDS.length) return false;
      if (comp === "incomplete" && f === KEY_FIELDS.length) return false;
      if (qq && !`${p.sku} ${p.name}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [products, brand, comp, q]);

  const summary = useMemo(() => {
    const base = filtered.length || 1;
    return KEY_FIELDS.map((f) => {
      const n = filtered.filter((p) => p[f] != null && String(p[f]).trim() !== "").length;
      return { field: f, pct: Math.round((n / base) * 100) };
    });
  }, [filtered]);

  const incomplete = filtered.filter((p) => filled(p) < KEY_FIELDS.length).length;
  const label: Record<string, string> = {
    capacity: "Capacity",
    wired_power: "Wired",
    wireless_power: "Wireless",
    usb_ports: "Ports",
    size: "Size",
    weight: "Weight",
  };
  const barColor = (pct: number) => (pct >= 80 ? "var(--good)" : pct >= 50 ? "var(--warn)" : "var(--danger)");

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Library</h1>
          <p>Canonical competitor SKUs and their specs.</p>
        </div>
        <div className="pill">{products.length} SKUs</div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={products.length} />
        <Metric label="Showing" value={filtered.length} />
        <Metric label="Incomplete" value={incomplete} />
        <Metric label="Brands" value={brands.length} />
      </section>

      <div className="panel">
        <h2>Field completeness</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 14 }}>
          {summary.map((s) => (
            <div key={s.field}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>
                <span>{label[s.field]}</span>
                <strong style={{ color: "var(--foreground)" }}>{s.pct}%</strong>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: "var(--border-light)", overflow: "hidden" }}>
                <div style={{ width: `${s.pct}%`, height: "100%", background: barColor(s.pct) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="filter-bar">
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
        <div className="filter-group">
          <label>Completeness</label>
          <select value={comp} onChange={(e) => setComp(e.target.value)}>
            <option value="">All</option>
            <option value="incomplete">Incomplete only</option>
            <option value="complete">Complete only</option>
          </select>
        </div>
        <div className="filter-group" style={{ flex: 1 }}>
          <label>Search</label>
          <input className="search" type="search" placeholder="SKU or name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <section className="table-panel">
        <div className="table-head">
          <h2>Products</h2>
          <span className="count">
            {filtered.length} of {products.length}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>SKU</th>
                <th>Product</th>
                <th>Brand</th>
                <th>EAN</th>
                <th>Capacity</th>
                <th>Wired</th>
                <th>Wireless</th>
                <th>Ports</th>
                <th>MagSafe</th>
                <th>Size</th>
                <th>Weight</th>
                <th>RRP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const f = filled(p);
                const dot = f === KEY_FIELDS.length ? "dot-green" : f >= 3 ? "dot-amber" : "dot-gray";
                return (
                  <tr key={p.id}>
                    <td>
                      <Thumb src={p.image_url} alt={p.name} />
                    </td>
                    <td className="muted">{p.sku}</td>
                    <td>{p.name}</td>
                    <td>{titleCase(p.brand?.display_name)}</td>
                    <td className="muted">{p.ean ?? "—"}</td>
                    <td>{p.capacity ?? "—"}</td>
                    <td>{p.wired_power ?? "—"}</td>
                    <td>{p.wireless_power ?? "—"}</td>
                    <td>{p.usb_ports ?? "—"}</td>
                    <td>{p.magsafe ? <span className="badge badge-magsafe">Yes</span> : "—"}</td>
                    <td>{p.size ?? "—"}</td>
                    <td>{p.weight ?? "—"}</td>
                    <td>{p.rrp != null ? fmtMoney(Number(p.rrp), p.rrp_currency) : "—"}</td>
                    <td>
                      <span className={`dot ${dot}`} title={`${f}/${KEY_FIELDS.length} fields`} />
                    </td>
                  </tr>
                );
              })}
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
