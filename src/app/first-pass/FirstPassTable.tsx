"use client";

import { useMemo, useState, useTransition } from "react";
import { updateFirstPassSpecs, setFirstPassSku } from "./actions";
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
  mapped: boolean; // true → specs are canonical (from Library/products); false → raw scrape fallback
  scraped_date: string | null;
  brand: { display_name: string } | null;
  retailer: { display_name: string; country: string | null } | null;
};

export default function FirstPassTable({ rows, canEdit }: { rows: FpRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<FpRow | null>(null);
  const [patched, setPatched] = useState<Record<number, Partial<FpRow>>>({});
  const withPatch = (r: FpRow): FpRow => ({ ...r, ...(patched[r.id] ?? {}) });
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
          <p>
            Per-channel registry keyed by retailer product code. Specs come from the mapped{" "}
            <strong>Library</strong> product (single source of truth) — a Library edit shows here instantly.
            Unmapped codes fall back to their raw scrape, marked <span className="fp-src raw">raw</span>.
          </p>
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
                <th>Specs</th>
                <th>Price</th>
                <th>Promo</th>
                <th>Stock</th>
                <th>Date</th>
                {canEdit ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((raw) => {
                const r = withPatch(raw);
                return (
                <tr key={r.id}>
                  <td>
                    <Thumb src={r.image_url} alt={r.product_name ?? ""} />
                  </td>
                  <td>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
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
                  <td>
                    {r.mapped ? (
                      <span className="fp-src lib" title="Specs from the mapped Library product">
                        Library
                      </span>
                    ) : r.capacity || r.power ? (
                      <span className="fp-src raw" title="Unmapped code — specs are the raw scrape (unverified)">
                        raw
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{r.price != null ? fmtMoney(Number(r.price), r.currency) : "—"}</td>
                  <td className={r.promo_price != null ? "promo" : ""}>
                    {r.promo_price != null ? fmtMoney(Number(r.promo_price), r.currency) : "—"}
                  </td>
                  <td>{r.in_stock == null ? "—" : r.in_stock ? "Yes" : "No"}</td>
                  <td>{r.scraped_date ?? "—"}</td>
                  {canEdit ? (
                    <td>
                      <button className="unlink-btn" onClick={() => setEditing(r)}>Edit</button>
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? (
        <FpEditModal
          row={withPatch(editing)}
          onClose={() => setEditing(null)}
          onPatch={(id, patch) => setPatched((cur) => ({ ...cur, [id]: { ...(cur[id] ?? {}), ...patch } }))}
        />
      ) : null}
    </>
  );
}

// Edit a registry row. Two separate saves on purpose, because they are two
// different kinds of write with different blast radii: the SKU is the MAPPING
// decision (goes through resolve_review, moves the listing with it), the rest are
// SPECS that land in the Library when the code is mapped and in this row's own raw
// columns when it isn't. The modal says which, so it is never a surprise.
function FpEditModal({
  row,
  onClose,
  onPatch,
}: {
  row: FpRow;
  onClose: () => void;
  onPatch: (id: number, patch: Partial<FpRow>) => void;
}) {
  const [form, setForm] = useState({
    product_name: row.product_name ?? "",
    ean: row.ean ?? "",
    capacity: row.capacity ?? "",
    power: row.power ?? "",
    usb_ports: row.usb_ports ?? "",
    image_url: row.image_url ?? "",
  });
  const [sku, setSku] = useState(row.sku ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [savingSpecs, startSpecs] = useTransition();
  const [savingSku, startSku] = useTransition();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const saveSpecs = () => {
    setErr(null);
    setNote(null);
    startSpecs(async () => {
      const res = await updateFirstPassSpecs(row.id, form);
      if (res.ok) {
        onPatch(row.id, { ...form });
        setNote(res.routedTo === "library" ? "Saved to the Library — visible everywhere." : "Saved on this channel row.");
      } else setErr(res.error || "Save failed");
    });
  };

  const saveSku = () => {
    setErr(null);
    setNote(null);
    startSku(async () => {
      const res = await setFirstPassSku(row.id, sku, form.product_name);
      if (res.ok) {
        onPatch(row.id, { sku: sku.trim() || null });
        setNote("Mapping saved — the listing and the review queue moved with it.");
      } else setErr(res.error || "Save failed");
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Edit channel row</h2>
            <span className="modal-sub">
              <code>{row.retailer_product_code ?? "—"}</code> · {titleCase(row.retailer?.display_name)} ·{" "}
              {row.mapped ? "mapped → specs live in the Library" : "unmapped → specs live on this row"}
            </span>
          </div>
          <button className="unlink-btn" onClick={onClose}>Close</button>
        </div>

        <div className="form-grid">
          <Field label="SKU — the mapping decision" wide>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={sku} onChange={(e) => setSku(e.target.value)} disabled={savingSku} placeholder="leave blank to unmap" />
              <button className="btn" type="button" onClick={saveSku} disabled={savingSku}>
                {savingSku ? "…" : "Save mapping"}
              </button>
            </div>
            <p className="field-note">
              Saved on its own: this is what the channel code resolves to, so it also moves the listing
              and closes the review — the same path the Reviews page uses.
            </p>
          </Field>

          <Field label="Product name" wide>
            <input value={form.product_name} onChange={(e) => set("product_name", e.target.value)} />
          </Field>
          <Field label="EAN"><input value={form.ean} onChange={(e) => set("ean", e.target.value)} /></Field>
          <Field label="Capacity"><input value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="20000 mAh" /></Field>
          <Field label="Power"><input value={form.power} onChange={(e) => set("power", e.target.value)} placeholder="65W" /></Field>
          <Field label="USB ports"><input value={form.usb_ports} onChange={(e) => set("usb_ports", e.target.value)} placeholder="USB-A*1+USB-C*1" /></Field>
          <Field label="Image URL" wide><input value={form.image_url} onChange={(e) => set("image_url", e.target.value)} /></Field>
        </div>

        {err ? <p className="modal-err">{err}</p> : null}
        {note ? <p className="field-note" style={{ color: "var(--accent)" }}>{note}</p> : null}

        <div className="modal-foot">
          <span className="field-note">
            {row.mapped
              ? "Specs save to the Library product this code maps to."
              : "Specs save to this row; power and ports are marked manual so the next scrape won't overwrite them."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn btn-primary" onClick={saveSpecs} disabled={savingSpecs}>
              {savingSpecs ? "Saving…" : "Save specs"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={"form-field" + (wide ? " wide" : "")}>
      <label>{label}</label>
      {children}
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
