"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Thumb from "@/components/Thumb";
import { fmtMoney, titleCase } from "@/lib/format";
import { updateProduct, type ProductPatch } from "./actions";

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
  updated_at: string;
  brand: { display_name: string; key: string } | null;
};

const KEY_FIELDS: (keyof LibProduct)[] = ["capacity", "wired_power", "wireless_power", "usb_ports", "size", "weight"];
const CURRENCIES = ["EUR", "PLN", "GBP", "USD"];

const filled = (p: LibProduct) => KEY_FIELDS.filter((f) => p[f] != null && String(p[f]).trim() !== "").length;

export default function LibraryTable({ products }: { products: LibProduct[] }) {
  const [rows, setRows] = useState(products);
  useEffect(() => setRows(products), [products]); // pick up server revalidations
  const [brand, setBrand] = useState("");
  const [comp, setComp] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<LibProduct | null>(null);

  const brands = useMemo(() => [...new Set(rows.map((p) => p.brand?.display_name ?? "—"))].sort(), [rows]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((p) => {
      if (brand && (p.brand?.display_name ?? "—") !== brand) return false;
      const f = filled(p);
      if (comp === "complete" && f < KEY_FIELDS.length) return false;
      if (comp === "incomplete" && f === KEY_FIELDS.length) return false;
      if (qq && !`${p.sku} ${p.name}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [rows, brand, comp, q]);

  const summary = useMemo(() => {
    const base = filtered.length || 1;
    return KEY_FIELDS.map((f) => {
      const n = filtered.filter((p) => p[f] != null && String(p[f]).trim() !== "").length;
      return { field: f, pct: Math.round((n / base) * 100) };
    });
  }, [filtered]);

  const incomplete = filtered.filter((p) => filled(p) < KEY_FIELDS.length).length;
  const label: Record<string, string> = {
    capacity: "Capacity", wired_power: "Wired", wireless_power: "Wireless",
    usb_ports: "Ports", size: "Size", weight: "Weight",
  };
  const barColor = (pct: number) => (pct >= 80 ? "var(--good)" : pct >= 50 ? "var(--warn)" : "var(--danger)");

  const onSaved = (saved: Record<string, unknown>) => {
    setRows((prev) => prev.map((r) => (r.id === saved.id ? ({ ...r, ...saved } as LibProduct) : r)));
    setEditing(null);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Library</h1>
          <p>Canonical competitor SKUs and their specs. <strong>The single source of truth</strong> — an edit here propagates to Channel, INIU, Dashboard and First Pass.</p>
        </div>
        <div className="pill">{rows.length} SKUs</div>
      </header>

      <section className="metrics">
        <Metric label="Products" value={rows.length} />
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
            {brands.map((b) => <option key={b} value={b}>{titleCase(b)}</option>)}
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
          <span className="count">{filtered.length} of {rows.length}</span>
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
                    <td><Thumb src={p.image_url} alt={p.name} /></td>
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
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`dot ${dot}`} title={`${f}/${KEY_FIELDS.length} fields`} />
                      <button className="unlink-btn" style={{ marginLeft: 8 }} onClick={() => setEditing(p)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? <EditModal product={editing} onClose={() => setEditing(null)} onSaved={onSaved} /> : null}
    </>
  );
}

function EditModal({
  product,
  onClose,
  onSaved,
}: {
  product: LibProduct;
  onClose: () => void;
  onSaved: (saved: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    name: product.name ?? "",
    ean: product.ean ?? "",
    capacity: product.capacity ?? "",
    wired_power: product.wired_power ?? "",
    wireless_power: product.wireless_power ?? "",
    usb_ports: product.usb_ports ?? "",
    size: product.size ?? "",
    weight: product.weight ?? "",
    rrp: product.rrp != null ? String(product.rrp) : "",
    rrp_currency: product.rrp_currency ?? "EUR",
    magsafe: !!product.magsafe,
  });
  const [err, setErr] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    setErr(null);
    const patch: ProductPatch = {
      name: form.name,
      ean: form.ean,
      capacity: form.capacity,
      wired_power: form.wired_power,
      wireless_power: form.wireless_power,
      usb_ports: form.usb_ports,
      size: form.size,
      weight: form.weight,
      rrp: form.rrp.trim() === "" ? null : Number(form.rrp),
      rrp_currency: form.rrp_currency || null,
      magsafe: form.magsafe,
    };
    if (patch.rrp != null && Number.isNaN(patch.rrp)) {
      setErr("RRP must be a number.");
      return;
    }
    start(async () => {
      const res = await updateProduct(product.id, patch, product.updated_at);
      if (res.ok && res.product) onSaved(res.product);
      else setErr(res.error || "Save failed");
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Edit spec</h2>
            <span className="modal-sub"><code>{product.sku}</code> · {titleCase(product.brand?.display_name)} · id {product.id}</span>
          </div>
          <button className="unlink-btn" onClick={onClose}>Close</button>
        </div>

        <div className="form-grid">
          <Field label="Product name" wide><input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="EAN"><input value={form.ean} onChange={(e) => set("ean", e.target.value)} /></Field>
          <Field label="Capacity"><input value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="20000 mAh" /></Field>
          <Field label="Wired power"><input value={form.wired_power} onChange={(e) => set("wired_power", e.target.value)} placeholder="65W" /></Field>
          <Field label="Wireless power"><input value={form.wireless_power} onChange={(e) => set("wireless_power", e.target.value)} placeholder="15W" /></Field>
          <Field label="USB ports"><input value={form.usb_ports} onChange={(e) => set("usb_ports", e.target.value)} placeholder="USB-A*1+USB-C*1" /></Field>
          <Field label="Size"><input value={form.size} onChange={(e) => set("size", e.target.value)} /></Field>
          <Field label="Weight"><input value={form.weight} onChange={(e) => set("weight", e.target.value)} /></Field>
          <Field label="RRP"><input value={form.rrp} onChange={(e) => set("rrp", e.target.value)} inputMode="decimal" placeholder="19.99" /></Field>
          <Field label="Currency">
            <select value={form.rrp_currency} onChange={(e) => set("rrp_currency", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="MagSafe">
            <label className="chk"><input type="checkbox" checked={form.magsafe} onChange={(e) => set("magsafe", e.target.checked)} /> MagSafe / magnetic</label>
          </Field>
        </div>

        <div className="modal-note">SKU and brand are the product identity and can&apos;t be changed here. Image is managed by the upload pipeline.</div>
        {err ? <div className="modal-err">{err}</div> : null}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
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
