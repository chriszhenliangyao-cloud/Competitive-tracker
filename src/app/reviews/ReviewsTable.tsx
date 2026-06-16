"use client";

import { useMemo, useState } from "react";
import Thumb from "@/components/Thumb";
import { COUNTRY_NAMES, titleCase } from "@/lib/format";

export type ReviewRow = {
  id: number;
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
    brand: { display_name: string } | null;
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

export default function ReviewsTable({ rows }: { rows: ReviewRow[] }) {
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [q, setQ] = useState("");

  const brands = useMemo(
    () => [...new Set(rows.map((r) => r.listing?.brand?.display_name ?? "—"))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, type, brand, q]);

  const newCount = rows.filter((r) => r.listing?.status === "new_listing").length;
  const missCount = rows.filter((r) => r.listing?.status === "library_missing").length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Reviews</h1>
          <p>Listings awaiting manual SKU resolution.</p>
        </div>
        <div className="pill">{rows.length} pending</div>
      </header>

      <section className="metrics">
        <Metric label="Pending" value={rows.length} />
        <Metric label="New listings" value={newCount} />
        <Metric label="Library missing" value={missCount} />
      </section>

      <div className="note">
        Read-only view. Approving / mapping reviews writes back to the data and needs login — that&apos;s the next phase.
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
            {filtered.length} of {rows.length}
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
                <th>Suggested SKU</th>
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
                        <a href={r.listing.url} target="_blank" rel="noreferrer" style={{ color: "#1d6fb8" }}>
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
                  <td className="muted">{r.suggested_sku ?? "—"}</td>
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
