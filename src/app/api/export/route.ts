import { getDashboardData } from "@/lib/dashboard";
import { getChargerDashboardData, type ChargerOffer } from "@/lib/dashboard-charger";
import { getCategoryKey } from "@/lib/category-server";
import { CHARGER_WEEK_COLS, TIER_LABEL, type TierKey } from "@/lib/charger-tiers";
import { getScope } from "@/lib/scope";
import { COUNTRY_NAMES, fmtEUR, rrpParts, titleCase } from "@/lib/format";
import { groupWeeks } from "@/lib/weeks";
import type { Competitor, PriceRow } from "@/app/iniu/IniuTable";

export const dynamic = "force-dynamic";

// Exports the Dashboard as a standalone HTML file for sharing offline / by email.
// Uses the SAME data loader as the page (so it can't drift) and the caller's own
// country scope (a sales user exports only their country).
//
// Which board it exports follows the category the caller is looking at, read from
// the same cookie the pages use — power banks export the INIU-vs-competitors board,
// chargers export the segment/power-band market map. Both share the shell and CSS.
//
// Images stay as their permanent public Supabase Storage URLs rather than base64:
// inlining ~300 images would blow the serverless time/size budget, and the URLs are
// public + permanent so they render anywhere with a connection.

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--bg:#f5f8f7;--fg:#13201e;--muted:#6a7a77;--surface:#fff;--subtle:#eef3f2;--line:#e2e9e7;
--line-soft:#eef3f2;--accent:#0e9b90;--accent-bg:#e3f4f2;--up:#c0392b;--down:#2d8a2d;
--mono:ui-monospace,"SF Mono",Menlo,monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.wrap{max-width:1400px;margin:0 auto}
header.top{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:18px}
h1{font-size:22px;font-weight:750;letter-spacing:-.02em;margin:0}
.sub{color:var(--muted);font-size:13px;margin:5px 0 0}
.meta{font-size:12px;color:var(--muted);text-align:right}
.meta b{color:var(--fg);font-weight:650}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-bottom:16px;box-shadow:0 1px 2px rgba(19,32,30,.05)}
.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--line-soft);background:#fbfdfc}
.panel-head h2{font-size:14.5px;font-weight:700;margin:0}
.count{font-size:12px;color:var(--muted)}
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:650;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line-soft);white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid var(--line-soft);vertical-align:middle;font-size:13px}
tr.iniu td{background:var(--accent-bg)}
td.brand-iniu{color:var(--accent);font-weight:700}
.psub{font-size:11px;color:var(--muted);margin-top:1px}
.thumb{width:34px;height:34px;border-radius:7px;object-fit:contain;background:var(--subtle);border:1px solid var(--line-soft);display:block}
.noimg{width:34px;height:34px;border-radius:7px;background:var(--subtle);border:1px solid var(--line-soft)}
.weeks{display:flex;gap:12px}
.wk{text-align:right;min-width:54px}
.wk .lbl{font-size:10px;color:#9aa6ae}
.wk .val{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:12.5px}
.wkc{text-align:right;white-space:nowrap;font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:12.5px}
th.wkc{font-family:var(--sans);font-size:11px}
.up{color:var(--up);font-weight:650}.down{color:var(--down);font-weight:650}
.muted{color:var(--muted)}
footer{margin-top:22px;font-size:11.5px;color:var(--muted);line-height:1.6}
@media print{body{background:#fff;padding:0}.panel{break-inside:avoid;box-shadow:none}}
`;

// price for a week = value at the latest date in that week the row has
const weekVal = (row: PriceRow, w: { dates: string[] }): number | null => {
  for (let i = w.dates.length - 1; i >= 0; i--) {
    const v = row.byDate[w.dates[i]];
    if (v != null) return v;
  }
  return null;
};

function groupHtml(opts: {
  image: string | null; brand: string; name: string; sku: string;
  rrp: number | null; rrpCurrency: string | null; rows: PriceRow[]; dates: string[]; own?: boolean;
}) {
  const { image, brand, name, sku, rrp, rrpCurrency, rows, dates, own } = opts;
  const weeks = groupWeeks(dates).slice(-4);
  const thumb = image
    ? `<img class="thumb" src="${esc(image)}" alt="${esc(name)}" loading="lazy">`
    : `<div class="noimg"></div>`;
  return rows
    .map((r, i) => {
      const lead =
        i === 0
          ? `<td rowspan="${rows.length}">${thumb}</td>` +
            `<td rowspan="${rows.length}"${own ? ' class="brand-iniu"' : ""}>${esc(brand)}</td>` +
            `<td rowspan="${rows.length}">${esc(name)}<div class="psub">${esc(sku)}</div></td>` +
            `<td rowspan="${rows.length}">${(() => {
              const { eur, native } = rrpParts(rrp, rrpCurrency);
              return esc(eur) + (native ? `<div class="sub">${esc(native)}</div>` : "");
            })()}</td>`
          : "";
      const cells = weeks
        .map((w, wi) => {
          const v = weekVal(r, w);
          const prev = wi > 0 ? weekVal(r, weeks[wi - 1]) : null;
          const cls = v != null && prev != null && v !== prev ? (v > prev ? "up" : "down") : "";
          return `<div class="wk" title="${esc(w.dates.join(", "))}"><div class="lbl">${esc(w.label)}</div><div class="val ${cls}">${v != null ? esc(fmtEUR(v)) : "—"}</div></div>`;
        })
        .join("");
      return `<tr${own ? ' class="iniu"' : ""}>${lead}<td>${esc(r.retailer)}${r.country ? ` <span class="muted">(${esc(r.country)})</span>` : ""}</td><td><div class="weeks">${cells}</div></td></tr>`;
    })
    .join("");
}

/** The shared document shell — both boards render into this. */
function shell(o: { title: string; h1: string; sub: string; meta: string; sections: string[]; footer: string }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<style>${CSS}</style></head>
<body><div class="wrap">
<header class="top">
  <div><h1>${esc(o.h1)}</h1>
  <p class="sub">${esc(o.sub)}</p></div>
  <div class="meta">${o.meta}</div>
</header>
${o.sections.join("\n") || '<section class="panel"><div style="padding:24px;text-align:center;color:var(--muted)">No prices for this filter.</div></section>'}
<footer>${esc(o.footer)}</footer>
</div></body></html>`;
}

const file = (html: string, name: string) =>
  new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });

/** Charger board: one panel per segment, week columns as real table columns —
 *  the same shape the page renders, including the shared week set. */
async function chargerExport(country: string, segments: Set<string>, stamp: string, now: Date, scopeLabel: string) {
  const { sections: tiers, stats } = await getChargerDashboardData();

  // Same rule as the page: one week set over the whole dataset, so every row
  // lines up. Computed BEFORE filtering so the columns don't shift with a filter.
  const allDates = new Set<string>();
  for (const t of tiers) for (const p of t.products) for (const d of p.dates) allDates.add(d);
  const weeks = groupWeeks([...allDates].sort()).slice(-CHARGER_WEEK_COLS);

  const inC = (r: ChargerOffer) => !country || r.country === country;
  const cellVal = (row: ChargerOffer, w: { dates: string[] }): number | null => {
    for (let i = w.dates.length - 1; i >= 0; i--) {
      const v = row.byDate[w.dates[i]];
      if (v != null) return v;
    }
    return null;
  };

  const panels: string[] = [];
  let shown = 0;

  for (const t of tiers) {
    if (segments.size > 0 && !segments.has(t.key)) continue;
    const products = t.products.filter((p) => p.rows.some(inC));
    if (products.length === 0) continue;
    shown += products.length;

    const body = products
      .map((p) => {
        const rows = p.rows.filter(inC);
        const thumb = p.image
          ? `<img class="thumb" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
          : `<div class="noimg"></div>`;
        return rows
          .map((r, i) => {
            const lead =
              i === 0
                ? `<td rowspan="${rows.length}">${thumb}</td>` +
                  `<td rowspan="${rows.length}">${esc(titleCase(p.brand))}</td>` +
                  `<td rowspan="${rows.length}">${esc(p.name)}<div class="psub">${esc(p.sku ?? "—")}${p.mapped ? "" : " · unmapped"}</div></td>` +
                  `<td rowspan="${rows.length}">${esc(p.watt ?? "—")}${p.ports ? `<div class="psub">${esc(p.ports)}</div>` : ""}</td>`
                : "";
            const retailer =
              (r.url ? `<a href="${esc(r.url)}">${esc(r.retailer)}</a>` : esc(r.retailer)) +
              (r.country ? ` <span class="muted">(${esc(r.country)})</span>` : "") +
              (r.inStock === false ? ` <span class="muted">· out of stock</span>` : "") +
              (r.onPromo ? ` <span class="down">· promo</span>` : "");
            const cells = weeks
              .map((w, wi) => {
                const v = cellVal(r, w);
                // vs the most recent EARLIER week with a price, not the adjacent
                // column, which is often empty once coverage has gaps.
                let prev: number | null = null;
                for (let k = wi - 1; k >= 0 && prev == null; k--) prev = cellVal(r, weeks[k]);
                const cls = v != null && prev != null && v !== prev ? (v > prev ? "up" : "down") : "";
                return `<td class="wkc ${cls}">${v != null ? esc(fmtEUR(v)) : '<span class="muted">—</span>'}</td>`;
              })
              .join("");
            return `<tr>${lead}<td>${retailer}</td>${cells}</tr>`;
          })
          .join("");
      })
      .join("");

    panels.push(
      `<section class="panel"><div class="panel-head"><h2>${esc(t.label)} <span class="count">· ${esc(t.sub)}</span></h2>` +
        `<span class="count">${products.length} products</span></div>` +
        `<div class="tw"><table><thead><tr><th></th><th>Brand</th><th>Product</th><th>Power</th><th>Retailer</th>` +
        weeks.map((w) => `<th class="wkc" title="${esc(w.dates.join(", "))}">${esc(w.label)}</th>`).join("") +
        `</tr></thead><tbody>${body}</tbody></table></div></section>`,
    );
  }

  const scopeTxt = country ? (COUNTRY_NAMES[country] ?? country) : scopeLabel;
  const html = shell({
    title: `INIU Charger Market — ${stamp}`,
    h1: "Charger Market",
    sub: "Competitor chargers by segment and power band — per-retailer price history (EUR). No INIU chargers yet, so this is the market map rather than a head-to-head.",
    meta:
      `<div>Exported <b>${esc(now.toISOString().slice(0, 16).replace("T", " "))} UTC</b></div>` +
      `<div>Scope: <b>${esc(scopeTxt)}</b></div>` +
      `<div>Segments: <b>${esc(segments.size ? [...segments].map((k) => TIER_LABEL[k as TierKey] ?? k).join(", ") : "All")}</b></div>` +
      `<div><b>${shown}</b> products · ${stats.unmapped} unmapped</div>`,
    sections: panels,
    footer:
      "Snapshot exported from the INIU Competitive Tracker. Prices normalised to EUR; each column is an ISO week (the latest scrape in that week), and a blank week means no price was scraped. Product images load from the hosted image store, so keep a connection to see them.",
  });
  return file(html, `iniu-chargers-${stamp}${country ? "-" + country : ""}${segments.size === 1 ? "-" + [...segments][0] : ""}.html`);
}

export async function GET(request: Request) {
  const scope = await getScope();
  if (!scope.email) return new Response("Not authorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const country = params.get("country") || "";

  // Follow the board the caller is on, not a hard-coded category.
  if ((await getCategoryKey()) === "charger") {
    const nowC = new Date();
    // Empty set = every segment, matching the board's "All segments".
    const segments = new Set((params.get("segments") || "").split(",").map((x) => x.trim()).filter(Boolean));
    return chargerExport(country, segments, nowC.toISOString().slice(0, 10), nowC,
      scope.countries === null ? "All countries" : scope.countries.join(", "));
  }

  // Empty set = every product, matching the board's "All products".
  const picked = new Set((params.get("products") || "").split(",").map((x) => x.trim()).filter(Boolean));
  const { products, compByIniu, ownByIniu, scopeLabel } = await getDashboardData();

  const inC = (r: PriceRow) => !country || r.country === country;
  const sections: string[] = [];
  let shown = 0;

  for (const p of products) {
    if (picked.size > 0 && !picked.has(String(p.id))) continue;
    const own = (ownByIniu[p.id] ?? []).filter(inC);
    const comps = (compByIniu[p.id] ?? []).filter((c: Competitor) => c.priceRows.some(inC));
    if (own.length === 0 && comps.length === 0) continue;
    shown++;
    const ownDates = [...new Set(own.flatMap((r) => Object.keys(r.byDate)))].sort();
    const body =
      (own.length
        ? groupHtml({ image: p.image_url, brand: "INIU", name: p.name, sku: p.sku, rrp: null, rrpCurrency: null, rows: own, dates: ownDates, own: true })
        : "") +
      comps
        .map((c: Competitor) =>
          groupHtml({
            image: c.image_url, brand: titleCase(c.brand), name: c.name, sku: c.sku,
            rrp: c.rrp, rrpCurrency: c.rrp_currency, rows: c.priceRows.filter(inC), dates: c.dates,
          }),
        )
        .join("");
    sections.push(
      `<section class="panel"><div class="panel-head"><h2>${esc(p.name)}</h2><span class="count">${comps.length} competitors</span></div>` +
        `<div class="tw"><table><thead><tr><th></th><th>Brand</th><th>Product</th><th>RRP</th><th>Retailer</th><th>Price history (EUR)</th></tr></thead>` +
        `<tbody>${body}</tbody></table></div></section>`,
    );
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const scopeTxt = country ? (COUNTRY_NAMES[country] ?? country) : scopeLabel;

  const html = shell({
    title: `INIU Prices by Country — ${stamp}`,
    h1: "Prices by Country",
    sub: "INIU vs mapped competitors — per-retailer price history (EUR). INIU's own price is the first row of each product.",
    meta:
      `<div>Exported <b>${esc(now.toISOString().slice(0, 16).replace("T", " "))} UTC</b></div>` +
      `<div>Scope: <b>${esc(scopeTxt)}</b></div>` +
      // say plainly when this is a subset, so an emailed file isn't read as the full catalogue
      `<div><b>${shown}</b> products${picked.size ? ` <span class="muted">(selected of ${products.length})</span>` : ""}</div>`,
    sections,
    footer:
      "Snapshot exported from the INIU Competitive Tracker. Prices normalised to EUR; each column is an ISO week (the latest scrape in that week). Product images load from the hosted image store, so keep a connection to see them.",
  });

  return file(html, `iniu-prices-${stamp}${country ? "-" + country : ""}.html`);
}
