"use client";

import { useMemo, useState, useTransition } from "react";
import Thumb from "@/components/Thumb";
import { COUNTRY_NAMES, titleCase } from "@/lib/format";
import { resolveReview } from "./actions";

export type SkuOption = { sku: string; name: string; brandKey: string };

export type ReviewRow = {
  id: number;
  listing_id: number | null;
  status: string;
  suggested_sku: string | null;
  correct_sku: string | null;
  product_name: string | null;
  image_url: string | null;
  source_file: string | null;
  created_at: string | null;
  listing: {
    status: string | null;
    retailer_product_code: string | null;
    raw_name: string | null;
    url: string | null;
    retailer: { display_name: string; country: string | null } | null;
    brand: { display_name: string; key: string } | null;
  } | null;
};

const typeLabel: Record<string, string> = {
  new_listing: "New listing",
  library_missing: "Library missing",
};
const typeBadge: Record<string, string> = {
  new_listing: "badge-new",
  library_missing: "badge-missing",
};

export default function ReviewsTable({ rows, skuOptions }: { rows: ReviewRow[]; skuOptions: SkuOption[] }) {
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<ReviewRow | null>(null);

  const brands = useMemo(
    () => [...new Set(rows.map((r) => r.listing?.brand?.display_name ?? "—"))].sort(),
    [rows],
  );

  const visible = useMemo(() => rows.filter((r) => !resolved.has(r.id)), [rows, resolved]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return visible.filter((r) => {
      if (type && r.listing?.status !== type) return false;
      if (brand && (r.listing?.brand?.display_name ?? "—") !== brand) return false;
      if (qq) {
        const hay = `${r.product_name ?? ""} ${r.listing?.raw_name ?? ""} ${r.suggested_sku ?? ""} ${
          r.listing?.retailer_product_code ?? ""
        }`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [visible, type, brand, q]);

  const pending = visible.length;
  const newCount = visible.filter((r) => r.listing?.status === "new_listing").length;
  const missCount = visible.filter((r) => r.listing?.status === "library_missing").length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Reviews</h1>
          <p>Listings awaiting manual SKU resolution. Resolving applies immediately — the listing maps now and stays mapped on every future cycle.</p>
        </div>
        <div className="pill">{pending} pending</div>
      </header>

      <section className="metrics">
        <Metric label="Pending" value={pending} />
        <Metric label="New listings" value={newCount} />
        <Metric label="Library missing" value={missCount} />
        <Metric label="Resolved (this session)" value={resolved.size} />
      </section>

      <div className="note">
        Resolving writes your decision into the mapping registry (<code>first_pass</code>): the listing
        becomes <strong>mapped</strong> right away and won&apos;t return to this queue on future scrapes.
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            <option value="new_listing">New listing</option>
            <option value="library_missing">Library missing</option>
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
          <input className="search" type="search" placeholder="Name, SKU, code…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <section className="table-panel">
        <div className="table-head">
          <h2>Pending items</h2>
          <span className="count">
            {filtered.length} of {pending}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Product</th>
                <th>Brand</th>
                <th>Retailer</th>
                <th>Code</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Thumb src={r.image_url} alt={r.product_name ?? ""} />
                  </td>
                  <td>
                    {r.product_name || r.listing?.raw_name || "—"}
                    {r.listing?.url ? (
                      <div className="sub">
                        <a href={r.listing.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          source ↗
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td>{titleCase(r.listing?.brand?.display_name)}</td>
                  <td>
                    {r.listing?.retailer?.display_name ?? "—"}
                    {r.listing?.retailer?.country ? (
                      <span className="muted"> ({COUNTRY_NAMES[r.listing.retailer.country] ?? r.listing.retailer.country})</span>
                    ) : null}
                  </td>
                  <td className="muted">{r.listing?.retailer_product_code ?? "—"}</td>
                  <td>
                    <span className={`badge ${typeBadge[r.listing?.status ?? ""] ?? "badge-skip"}`}>
                      {typeLabel[r.listing?.status ?? ""] ?? r.listing?.status ?? "—"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-primary" onClick={() => setActive(r)}>
                      Resolve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {active ? (
        <ResolveModal
          review={active}
          skuOptions={skuOptions}
          onClose={() => setActive(null)}
          onResolved={(id) => {
            setResolved((s) => new Set(s).add(id));
            setActive(null);
          }}
        />
      ) : null}
    </>
  );
}

function ResolveModal({
  review,
  skuOptions,
  onClose,
  onResolved,
}: {
  review: ReviewRow;
  skuOptions: SkuOption[];
  onClose: () => void;
  onResolved: (id: number) => void;
}) {
  const brandKey = review.listing?.brand?.key ?? "";
  const [sku, setSku] = useState(review.correct_sku || review.suggested_sku || "");
  const [name, setName] = useState(review.product_name || review.listing?.raw_name || "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const options = useMemo(
    () => skuOptions.filter((o) => !brandKey || o.brandKey === brandKey).slice(0, 500),
    [skuOptions, brandKey],
  );
  const match = options.find((o) => o.sku.toUpperCase() === sku.trim().toUpperCase());

  const submit = () => {
    setErr(null);
    start(async () => {
      const res = await resolveReview(review.id, review.listing_id, sku, name);
      if (res.ok) onResolved(review.id);
      else setErr(res.error ?? "Failed");
    });
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 22, width: "min(560px, 100%)", boxShadow: "0 8px 30px rgba(17,24,39,0.18)" }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Resolve listing</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {titleCase(review.listing?.brand?.display_name)} · {review.listing?.retailer?.display_name} ·{" "}
          {review.listing?.retailer_product_code ?? "no code"}
        </p>
        <div style={{ fontSize: 14, marginBottom: 16 }}>{review.product_name || review.listing?.raw_name}</div>

        <div className="filter-group" style={{ marginBottom: 14 }}>
          <label>Correct SKU</label>
          <input
            type="text"
            list="sku-options"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Existing SKU or new SKU…"
            style={{ width: "100%" }}
            autoFocus
          />
          <datalist id="sku-options">
            {options.map((o) => (
              <option key={o.sku} value={o.sku}>
                {o.name}
              </option>
            ))}
          </datalist>
          <div className="sub">
            {sku.trim()
              ? match
                ? `✓ existing library product: ${match.name} — maps immediately`
                : "not in library — listing will be flagged Library Missing until this SKU is added to the catalogue"
              : `${options.length} known ${titleCase(review.listing?.brand?.display_name)} SKUs`}
          </div>
        </div>

        <div className="filter-group" style={{ marginBottom: 18 }}>
          <label>Product name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
        </div>

        {err ? <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{err}</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending || !sku.trim()}>
            {pending ? "Saving…" : "Mark resolved"}
          </button>
        </div>
      </div>
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
