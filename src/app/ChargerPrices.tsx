"use client";

import { useMemo, useState, useTransition } from "react";
import Thumb from "@/components/Thumb";
import MultiSelect from "@/components/MultiSelect";
import { updateChargerPower } from "./charger-power-actions";
import { COUNTRY_NAMES, displayCurrency, fmtPrice, titleCase } from "@/lib/format";
import { groupWeeks } from "@/lib/weeks";
import { CHARGER_WEEK_COLS } from "@/lib/charger-tiers";
import type { ChargerDashboardData, ChargerOffer, ChargerProduct, ChargerSection } from "@/lib/dashboard-charger";

// Charger dashboard: the market grouped by segment (wall / car / desktop / cable,
// split by wattage) instead of by INIU product, because there are no INIU
// chargers to anchor on. Same row/week layout as Prices by Country.

export default function ChargerPrices({ data }: { data: ChargerDashboardData }) {
  const [country, setCountry] = useState("");
  // Multi-select: empty means "all", so the board opens complete. There are 14
  // segments and they get compared in groups (e.g. the three laptop-class wall
  // bands together), which one-at-a-time couldn't do.
  const [segments, setSegments] = useState<string[]>([]);
  const { sections, countries, stats, canEdit } = data;


  // Week columns are computed ONCE over every date in the dataset, not per
  // product: a product only scraped in some weeks would otherwise get its own
  // narrower column set and the prices would no longer line up down the table.
  // A row with nothing that week shows "—".
  const weeks = useMemo(() => {
    const all = new Set<string>();
    for (const s of sections) for (const p of s.products) for (const d of p.dates) all.add(d);
    return groupWeeks([...all].sort()).slice(-CHARGER_WEEK_COLS);
  }, [sections]);

  const inC = (r: ChargerOffer) => !country || r.country === country;

  const visible = useMemo(
    () =>
      sections
        .filter((s) => segments.length === 0 || segments.includes(s.key))
        .map((s) => ({ ...s, products: s.products.filter((p) => p.rows.some(inC)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, segments, country],
  );

  const shownCount = visible.reduce((n, s) => n + s.products.length, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Charger Market</h1>
          <p>
            Competitor chargers by segment and power band — per-retailer price history.{" "}
            <strong>Poland in PLN</strong>, every other market in EUR. No INIU chargers yet, so this
            is the market map rather than a head-to-head.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Static HTML snapshot of exactly what's on screen (both filters carry over). */}
          <a
            className="btn"
            href={`/api/export${
              country || segments.length
                ? "?" +
                  new URLSearchParams({
                    ...(country ? { country } : {}),
                    ...(segments.length ? { segments: segments.join(",") } : {}),
                  }).toString()
                : ""
            }`}
            download
          >
            ↓ Export HTML
          </a>
          <div className="pill">{shownCount} products</div>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={stats.products} />
        <Metric label="Listings" value={stats.listings} />
        <Metric label="Retailers" value={stats.retailers} />
        <Metric label="Unmapped" value={stats.unmapped} />
      </section>

      <div className="filter-bar">
        <MultiSelect
          label="Segments"
          allLabel="All segments"
          options={sections.map((x) => ({ value: x.key, label: x.label, hint: String(x.products.length) }))}
          selected={segments}
          onChange={setSegments}
        />
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
        visible.map((s) => <Section key={s.key} section={s} inC={inC} weeks={weeks} canEdit={canEdit} />)
      )}
    </>
  );
}

type Week = { key: string; label: string; dates: string[] };

function Section({
  section,
  inC,
  weeks,
  canEdit,
}: {
  section: ChargerSection;
  inC: (r: ChargerOffer) => boolean;
  weeks: Week[];
  canEdit: boolean;
}) {
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
              {weeks.map((w) => (
                <th key={w.key} title={w.dates.join(", ")} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.products.map((p) => (
              <ProductRows key={p.key} product={p} inC={inC} weeks={weeks} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductRows({
  product,
  inC,
  weeks,
  canEdit,
}: {
  product: ChargerProduct;
  inC: (r: ChargerOffer) => boolean;
  weeks: Week[];
  canEdit: boolean;
}) {
  const rows = product.rows.filter(inC);
  if (rows.length === 0) return null;
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
                <PowerCell product={product} canEdit={canEdit} />
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
          {weeks.map((w, wi) => {
            const v = weekVal(r, w);
            // Compare against the most recent EARLIER week that has a price, not
            // the adjacent column — with gaps, the neighbour is often empty and
            // a real price change would render as unchanged.
            let prev: number | null = null;
            for (let k = wi - 1; k >= 0 && prev == null; k--) prev = weekVal(r, weeks[k]);
            let cls = "";
            if (v != null && prev != null && v !== prev) cls = v > prev ? "chg-up" : "chg-down";
            return (
              <td key={w.key} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {v != null ? <span className={cls}>{fmtPrice(v, displayCurrency(r.country))}</span> : <span className="muted">—</span>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

// Inline power editor. Which table the write lands in is decided server-side by
// whether the row is mapped (Library) or not (first_pass raw fallback) — see
// charger-power-actions.ts. Shown to admins only; the action re-checks.
function PowerCell({ product, canEdit }: { product: ChargerProduct; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(product.watt ?? "");
  const [shown, setShown] = useState(product.watt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return <>{shown ?? "—"}</>;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateChargerPower(
        { productId: product.productId, listingIds: product.listingIds },
        value,
      );
      if (res.ok) {
        setShown(res.power ?? null);
        setEditing(false);
      } else {
        setError(res.error ?? "Could not save");
      }
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="cell-edit"
        title={product.productId ? "Edit — saves to the Library" : "Edit — saves to this channel row"}
        onClick={() => {
          setValue(shown ?? "");
          setEditing(true);
        }}
      >
        {shown ?? <span className="muted">— add</span>}
      </button>
    );
  }

  return (
    <div style={{ minWidth: 96 }}>
      <input
        autoFocus
        className="cell-input"
        value={value}
        placeholder="e.g. 65"
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button type="button" className="cell-ok" onClick={save} disabled={pending}>
          {pending ? "…" : "Save"}
        </button>
        <button type="button" className="cell-cancel" onClick={() => setEditing(false)} disabled={pending}>
          Cancel
        </button>
      </div>
      <div className="sub">{product.productId ? "→ Library" : "→ channel row"}</div>
      {error ? <div className="sub" style={{ color: "var(--up, #c0392b)" }}>{error}</div> : null}
    </div>
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
