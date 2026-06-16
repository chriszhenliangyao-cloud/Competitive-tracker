"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import { fmtEUR, fmtMoney, titleCase } from "@/lib/format";

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

export type Competitor = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  capacity: string | null;
  wired_power: string | null;
  wireless_power: string | null;
  size: string | null;
  weight: string | null;
  usb_ports: string | null;
  magsafe: boolean;
  image_url: string | null;
  rrp: number | null;
  rrp_currency: string | null;
  priceEUR: number | null;
  retailers: number;
};

export default function IniuTable({
  products,
  compByIniu,
}: {
  products: IniuProduct[];
  compByIniu: Record<number, Competitor[]>;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const totalLinks = useMemo(
    () => Object.values(compByIniu).reduce((n, arr) => n + arr.length, 0),
    [compByIniu],
  );

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
  const mappedCount = products.filter((p) => (compByIniu[p.id]?.length ?? 0) > 0).length;

  const selectedProduct = selected != null ? products.find((p) => p.id === selected) ?? null : null;
  if (selectedProduct) {
    return (
      <Compare
        product={selectedProduct}
        competitors={compByIniu[selectedProduct.id] ?? []}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>INIU Products</h1>
          <p>INIU&apos;s catalogue with mapped competitors. Click a product for the comparison.</p>
        </div>
        <div className="pill">{products.length} products</div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={products.length} />
        <Metric label="MagSafe" value={magsafeCount} />
        <Metric label="With competitors" value={mappedCount} />
        <Metric label="Competitor links" value={totalLinks} />
      </section>

      {totalLinks === 0 ? (
        <div className="note">
          No competitor links yet. Run <code>cloud/pipeline/upload_iniu.py --write</code> to migrate the INIU
          spreadsheet&apos;s &ldquo;Competitive SKU&rdquo; columns — then each product shows its side-by-side comparison here.
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
                <th>Ports</th>
                <th>MagSafe</th>
                <th>Competitors</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const n = compByIniu[p.id]?.length ?? 0;
                return (
                  <tr key={p.id} className={n > 0 ? "clickable" : ""} onClick={() => n > 0 && setSelected(p.id)}>
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
                    <td>{p.usb_ports ?? "—"}</td>
                    <td>{p.magsafe ? <span className="badge badge-magsafe">MagSafe</span> : "—"}</td>
                    <td>
                      {n > 0 ? <span className="badge badge-mapped">{n}</span> : <span className="muted">—</span>}
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

function Compare({
  product,
  competitors,
  onBack,
}: {
  product: IniuProduct;
  competitors: Competitor[];
  onBack: () => void;
}) {
  const ranked = [...competitors].sort((a, b) => {
    if (a.priceEUR == null && b.priceEUR == null) return a.brand.localeCompare(b.brand);
    if (a.priceEUR == null) return 1;
    if (b.priceEUR == null) return -1;
    return a.priceEUR - b.priceEUR;
  });
  const prices = competitors.map((c) => c.priceEUR).filter((v): v is number => v != null);
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;

  return (
    <>
      <header className="page-head">
        <div>
          <button className="btn" onClick={onBack} style={{ marginBottom: 12 }}>
            ← Back
          </button>
          <h1>{product.name}</h1>
          <p>
            {product.sku}
            {product.capacity ? ` · ${product.capacity}` : ""}
            {product.wired_power ? ` · ${product.wired_power}` : ""}
            {product.wireless_power ? ` · ${product.wireless_power} wireless` : ""}
            {product.magsafe ? " · MagSafe" : ""}
          </p>
        </div>
        <Thumb src={product.image_url} alt={product.name} large />
      </header>

      <section className="metrics">
        <Metric label="Competitors" value={competitors.length} />
        <Metric label="Priced in channel" value={prices.length} />
        <MetricText label="Cheapest" value={lo != null ? fmtEUR(lo) : "—"} />
        <MetricText label="Most expensive" value={hi != null ? fmtEUR(hi) : "—"} />
      </section>

      <section className="table-panel">
        <div className="table-head">
          <h2>Mapped competitors</h2>
          <span className="count">{competitors.length} SKUs</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Brand</th>
                <th>Product</th>
                <th>Capacity</th>
                <th>Wired</th>
                <th>Wireless</th>
                <th>MagSafe</th>
                <th>RRP</th>
                <th>Channel (EUR)</th>
                <th>Retailers</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Thumb src={c.image_url} alt={c.name} />
                  </td>
                  <td>{titleCase(c.brand)}</td>
                  <td>
                    {c.name}
                    <div className="sub">{c.sku}</div>
                  </td>
                  <td>{c.capacity ?? "—"}</td>
                  <td>{c.wired_power ?? "—"}</td>
                  <td>{c.wireless_power ?? "—"}</td>
                  <td>{c.magsafe ? <span className="badge badge-magsafe">Yes</span> : "—"}</td>
                  <td>{c.rrp != null ? fmtMoney(c.rrp, c.rrp_currency) : "—"}</td>
                  <td>{c.priceEUR != null ? fmtEUR(c.priceEUR) : "—"}</td>
                  <td>{c.retailers > 0 ? c.retailers : "—"}</td>
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
function MetricText({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
