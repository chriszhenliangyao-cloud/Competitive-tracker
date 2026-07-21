"use client";

import { useMemo, useState, useTransition } from "react";
import Thumb from "@/components/Thumb";
import Sparkline from "@/components/Sparkline";
import { COUNTRY_NAMES, fmtEUR, rrpParts, titleCase } from "@/lib/format";
import { hideCompetitor, unhideCompetitor } from "./actions";

export type PriceRow = {
  retailer: string;
  country: string | null;
  code: string | null;
  byDate: Record<string, number | null>;
};

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
  priceRows: PriceRow[];
  dates: string[];
  hidden: boolean;
};

export default function IniuTable({
  products,
  compByIniu,
  ownByIniu,
}: {
  products: IniuProduct[];
  compByIniu: Record<number, Competitor[]>;
  ownByIniu: Record<number, PriceRow[]>;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  // Counts reflect visible (non-hidden) competitors — hidden pairs are masked everywhere.
  const visibleCount = (id: number) => (compByIniu[id] ?? []).filter((c) => !c.hidden).length;
  const totalLinks = useMemo(
    () => Object.values(compByIniu).reduce((n, arr) => n + arr.filter((c) => !c.hidden).length, 0),
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
  const mappedCount = products.filter((p) => visibleCount(p.id) > 0).length;

  const selectedProduct = selected != null ? products.find((p) => p.id === selected) ?? null : null;
  if (selectedProduct) {
    return (
      <Compare
        product={selectedProduct}
        competitors={compByIniu[selectedProduct.id] ?? []}
        ownRows={ownByIniu[selectedProduct.id] ?? []}
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
                <th>Channels</th>
                <th>MagSafe</th>
                <th>Competitors</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const total = compByIniu[p.id]?.length ?? 0;
                const n = visibleCount(p.id);
                const hiddenN = total - n;
                return (
                  <tr key={p.id} className={total > 0 ? "clickable" : ""} onClick={() => total > 0 && setSelected(p.id)}>
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
                    <td>
                      {(ownByIniu[p.id]?.length ?? 0) > 0 ? (
                        <span className="badge badge-mapped" title="Retailers with an INIU price">
                          {ownByIniu[p.id].length}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{p.magsafe ? <span className="badge badge-magsafe">MagSafe</span> : "—"}</td>
                    <td>
                      {n > 0 ? <span className="badge badge-mapped">{n}</span> : <span className="muted">—</span>}
                      {hiddenN > 0 ? (
                        <span className="muted" style={{ marginLeft: 6, fontSize: 11 }} title={`${hiddenN} hidden`}>
                          ({hiddenN} hidden)
                        </span>
                      ) : null}
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
  ownRows,
  onBack,
}: {
  product: IniuProduct;
  competitors: Competitor[];
  ownRows: PriceRow[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"general" | "price">("general");
  const [brand, setBrand] = useState("");
  const [retailer, setRetailer] = useState("");
  const [country, setCountry] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [override, setOverride] = useState<Map<number, boolean>>(new Map());
  const [busy, setBusy] = useState<number | null>(null);
  const [, start] = useTransition();

  // Effective hidden state = optimistic local override, else the server value.
  const isHidden = (c: Competitor) => (override.has(c.id) ? override.get(c.id)! : c.hidden);

  // Curation: hide (not delete) a competitor that shouldn't be mapped here, or bring it back.
  const setHidden = (c: Competitor, val: boolean) => {
    setBusy(c.id);
    start(async () => {
      const res = val ? await hideCompetitor(product.id, c.id) : await unhideCompetitor(product.id, c.id);
      setBusy(null);
      if (res.ok) setOverride((prev) => new Map(prev).set(c.id, val));
      else window.alert(res.error || "Action failed");
    });
  };

  const hiddenCount = useMemo(() => competitors.filter((c) => isHidden(c)).length, [competitors, override]);
  // What the tables render: visible always; hidden only when "Show hidden" is on.
  const live = useMemo(
    () => competitors.filter((c) => showHidden || !isHidden(c)),
    [competitors, showHidden, override],
  );

  const opts = useMemo(() => {
    const brands = new Set<string>();
    const retailers = new Set<string>();
    const countries = new Set<string>();
    for (const c of live) {
      brands.add(c.brand);
      for (const r of c.priceRows) {
        retailers.add(r.retailer);
        if (r.country) countries.add(r.country);
      }
    }
    return {
      brands: [...brands].sort(),
      retailers: [...retailers].sort(),
      countries: [...countries].sort(),
    };
  }, [live]);

  const shown = useMemo(() => {
    return live.filter((c) => {
      if (brand && c.brand !== brand) return false;
      if (retailer && !c.priceRows.some((r) => r.retailer === retailer)) return false;
      if (country && !c.priceRows.some((r) => r.country === country)) return false;
      return true;
    });
  }, [live, brand, retailer, country]);

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
            {product.magsafe ? " · MagSafe" : ""}
          </p>
        </div>
        <Thumb src={product.image_url} alt={product.name} large />
      </header>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={`btn${tab === "general" ? " btn-primary" : ""}`} onClick={() => setTab("general")}>
            General Info
          </button>
          <button className={`btn${tab === "price" ? " btn-primary" : ""}`} onClick={() => setTab("price")}>
            Price
          </button>
          {hiddenCount > 0 ? (
            <button
              className={`btn${showHidden ? " btn-primary" : ""}`}
              onClick={() => setShowHidden((v) => !v)}
              title="Show/hide the competitors you've hidden"
            >
              {showHidden ? "Hide hidden" : `Show hidden (${hiddenCount})`}
            </button>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Sel label="Brand" value={brand} set={setBrand} opts={opts.brands} render={titleCase} />
          <Sel label="Retailer" value={retailer} set={setRetailer} opts={opts.retailers} />
          <Sel label="Country" value={country} set={setCountry} opts={opts.countries} render={(c) => COUNTRY_NAMES[c] ?? c} />
        </div>
      </div>

      {tab === "price" && ownRows.length > 0 ? (
        <section className="table-panel" style={{ borderColor: "var(--accent-border)" }}>
          <div className="table-head" style={{ background: "var(--accent-bg)" }}>
            <h2 style={{ color: "var(--accent)" }}>INIU own channel price</h2>
            <span className="count">{ownRows.length} retailers</span>
          </div>
          <div className="table-wrap">
            <OwnPriceTable product={product} rows={ownRows} retailer={retailer} country={country} />
          </div>
        </section>
      ) : null}

      <section className="table-panel">
        <div className="table-head">
          <h2>{tab === "general" ? "Competitive specs" : "Competitive pricing"}</h2>
          <span className="count">
            {shown.length} of {live.length}
          </span>
        </div>
        <div className="table-wrap">
          {tab === "general" ? (
            <GeneralTable competitors={shown} isHidden={isHidden} onToggleHide={setHidden} busy={busy} />
          ) : (
            <PriceTable competitors={shown} retailer={retailer} country={country} isHidden={isHidden} onToggleHide={setHidden} busy={busy} />
          )}
        </div>
      </section>
    </>
  );
}

function GeneralTable({
  competitors,
  isHidden,
  onToggleHide,
  busy,
}: {
  competitors: Competitor[];
  isHidden: (c: Competitor) => boolean;
  onToggleHide: (c: Competitor, val: boolean) => void;
  busy: number | null;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Brand</th>
          <th>Product</th>
          <th>Capacity</th>
          <th>Wired</th>
          <th>Wireless</th>
          <th>Size</th>
          <th>Weight</th>
          <th>Ports</th>
          <th>MagSafe</th>
          <th>RRP</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {competitors.map((c) => {
          const hidden = isHidden(c);
          return (
            <tr key={c.id} className={hidden ? "row-hidden" : ""}>
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
              <td>{c.size ?? "—"}</td>
              <td>{c.weight ?? "—"}</td>
              <td>{c.usb_ports ?? "—"}</td>
              <td>{c.magsafe ? <span className="badge badge-magsafe">Yes</span> : "—"}</td>
              <td><Rrp value={c.rrp} currency={c.rrp_currency} /></td>
              <td>
                <HideBtn hidden={hidden} onClick={() => onToggleHide(c, !hidden)} busy={busy === c.id} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Hide = mask this competitor (kept in DB, reversible). Unhide brings it back.
function HideBtn({ hidden, onClick, busy }: { hidden: boolean; onClick: () => void; busy: boolean }) {
  return (
    <button
      className={`unlink-btn${hidden ? " is-hidden" : ""}`}
      title={hidden ? "Bring this competitor back" : "Not a competitor — hide it"}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {busy ? "…" : hidden ? "Unhide" : "Hide"}
    </button>
  );
}

function PriceTable({
  competitors,
  retailer,
  country,
  isHidden,
  onToggleHide,
  busy,
}: {
  competitors: Competitor[];
  retailer: string;
  country: string;
  isHidden: (c: Competitor) => boolean;
  onToggleHide: (c: Competitor, val: boolean) => void;
  busy: number | null;
}) {
  return (
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
          <th></th>
        </tr>
      </thead>
      <tbody>
        {competitors.map((c) => {
          const hidden = isHidden(c);
          const dates = c.dates.slice(-4);
          const rows = c.priceRows.filter(
            (r) => (!retailer || r.retailer === retailer) && (!country || r.country === country),
          );
          if (rows.length === 0) {
            return (
              <tr key={c.id} className={hidden ? "row-hidden" : ""}>
                <td>
                  <Thumb src={c.image_url} alt={c.name} />
                </td>
                <td>{titleCase(c.brand)}</td>
                <td>
                  {c.name}
                  <div className="sub">{c.sku}</div>
                </td>
                <td><Rrp value={c.rrp} currency={c.rrp_currency} /></td>
                <td className="muted" colSpan={3}>
                  no channel listing
                </td>
                <td>
                  <HideBtn hidden={hidden} onClick={() => onToggleHide(c, !hidden)} busy={busy === c.id} />
                </td>
              </tr>
            );
          }
          return rows.map((r, i) => (
            <tr key={`${c.id}-${r.retailer}-${i}`} className={hidden ? "row-hidden" : ""}>
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
                  <td rowSpan={rows.length}><Rrp value={c.rrp} currency={c.rrp_currency} /></td>
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
              {i === 0 ? (
                <td rowSpan={rows.length}>
                  <HideBtn hidden={hidden} onClick={() => onToggleHide(c, !hidden)} busy={busy === c.id} />
                </td>
              ) : null}
            </tr>
          ));
        })}
      </tbody>
    </table>
  );
}

function OwnPriceTable({
  product,
  rows,
  retailer,
  country,
}: {
  product: IniuProduct;
  rows: PriceRow[];
  retailer: string;
  country: string;
}) {
  const dates = [...new Set(rows.flatMap((r) => Object.keys(r.byDate)))].sort().slice(-4);
  const filtered = rows.filter((r) => (!retailer || r.retailer === retailer) && (!country || r.country === country));
  if (filtered.length === 0) return <div className="empty">No INIU price for this filter.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>Product</th>
          <th>Retailer</th>
          <th>Price history (EUR)</th>
          <th>Trend</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((r, i) => (
          <tr key={`${r.retailer}-${i}`}>
            {i === 0 ? (
              <>
                <td rowSpan={filtered.length}>
                  <Thumb src={product.image_url} alt={product.name} />
                </td>
                <td rowSpan={filtered.length}>
                  {product.name}
                  <div className="sub">{product.sku}</div>
                </td>
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
        ))}
      </tbody>
    </table>
  );
}

/** RRP in EUR (so it reads against the EUR price columns) over the original. */
function Rrp({ value, currency }: { value: number | null; currency: string | null }) {
  const { eur, native } = rrpParts(value, currency);
  return (
    <>
      {eur}
      {native ? <div className="sub">{native}</div> : null}
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
