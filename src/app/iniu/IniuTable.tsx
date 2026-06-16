"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";

export type IniuProduct = {
  id: number;
  sku: string;
  name: string;
  capacity: string | null;
  size: string | null;
  weight: string | null;
  wired_power: string | null;
  wireless_power: string | null;
  usb_ports: string | null;
  magsafe: boolean | null;
  image_url: string | null;
};

export default function IniuTable({ products, linkCount }: { products: IniuProduct[]; linkCount: number }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return products;
    return products.filter((p) =>
      `${p.sku} ${p.name} ${p.capacity ?? ""} ${p.wired_power ?? ""} ${p.usb_ports ?? ""} ${p.magsafe ? "magsafe" : ""}`
        .toLowerCase()
        .includes(qq),
    );
  }, [products, q]);

  const magsafeCount = products.filter((p) => p.magsafe).length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>INIU Products</h1>
          <p>INIU&apos;s own powerbank catalogue (reference specs).</p>
        </div>
        <div className="pill">{products.length} products</div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={products.length} />
        <Metric label="MagSafe" value={magsafeCount} />
        <Metric label="Competitive links" value={linkCount} />
      </section>

      {linkCount === 0 ? (
        <div className="note">
          INIU↔competitor mappings aren&apos;t in the cloud yet — those links live in the local INIU spreadsheet&apos;s
          &ldquo;Competitive SKU&rdquo; columns and haven&apos;t been pushed. Once they&apos;re migrated, this page will show
          a side-by-side comparison per INIU product.
        </div>
      ) : null}

      <div className="filter-bar">
        <div className="filter-group" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            className="search"
            type="search"
            placeholder="SKU, name, capacity, power…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <section className="table-panel">
        <div className="table-head">
          <h2>Catalogue</h2>
          <span className="count">
            {filtered.length} of {products.length}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th>Capacity</th>
                <th>Wired</th>
                <th>Wireless</th>
                <th>Size</th>
                <th>Weight</th>
                <th>Ports</th>
                <th>MagSafe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Thumb src={p.image_url} alt={p.name} />
                  </td>
                  <td>
                    {p.name}
                    <div className="sub">{p.sku}</div>
                  </td>
                  <td>{p.capacity ?? "—"}</td>
                  <td>{p.wired_power ?? "—"}</td>
                  <td>{p.wireless_power ?? "—"}</td>
                  <td>{p.size ?? "—"}</td>
                  <td>{p.weight ?? "—"}</td>
                  <td>{p.usb_ports ?? "—"}</td>
                  <td>{p.magsafe ? <span className="badge badge-magsafe">MagSafe</span> : "—"}</td>
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
