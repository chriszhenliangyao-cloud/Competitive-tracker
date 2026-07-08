"use client";

import { useEffect, useRef, useState } from "react";
import type { RoadmapData } from "@/lib/roadmap";
import { titleCase } from "@/lib/format";

const PB =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="6" width="15" height="12" rx="2.5"/><path d="M18 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2"/></svg>';

export default function Roadmap({ data }: { data: RoadmapData }) {
  const [layer, setLayer] = useState<string>("INIU");
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
  const renderRef = useRef<() => void>(() => {});

  useEffect(() => {
    try {
      posRef.current = JSON.parse(localStorage.getItem("roadmap_pos_v1") || "{}");
    } catch {
      posRef.current = {};
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const chart = chartRef.current;
    if (!chart) return;

    const COLS = data.columns;
    const ANCHORS = data.anchors;
    const AMAP: Record<string, (typeof ANCHORS)[number]> = {};
    ANCHORS.forEach((a) => (AMAP[a.key] = a));
    const showBrand = layer !== "INIU";
    const comp = showBrand ? data.competitors.filter((r) => r.brand === layer) : [];

    const MINP = 10, MAXP = 160, H = 600, PADT = 34, GAP = 6, axisW = 46, colGap = 16;
    const yOf = (p: number) => PADT + (MAXP - Math.max(MINP, Math.min(MAXP, p))) / (MAXP - MINP) * H;
    const eur = (n: number) => "€" + n;
    let colW = 190;
    const colX = (col: string) => axisW + COLS.indexOf(col) * (colW + colGap);
    const anchorX = (k: string) => {
      const ov = posRef.current[k];
      return ov ? ov.x : colX(AMAP[k].col);
    };
    const thumb = (img: string | null, iniu: boolean) =>
      '<div class="rm-thumb' + (iniu ? " iniu" : "") + '" title="product image">' +
      (img ? '<img src="' + img + '" loading="lazy" alt="" onerror="this.remove()"/>' : PB) +
      "</div>";

    function render() {
      const avail = (chart!.parentElement!.clientWidth || 1160) - 12;
      const w = avail < 260 ? 1160 : avail;
      colW = Math.max(160, Math.min(230, (w - axisW - (COLS.length - 1) * colGap) / COLS.length));
      const totalW = axisW + COLS.length * colW + (COLS.length - 1) * colGap;
      chart!.style.width = Math.max(totalW, w) + "px";

      let html = "";
      for (let t = 20; t <= 140; t += 20) {
        const y = yOf(t);
        html += '<div class="rm-grid" style="top:' + y + "px;left:" + axisW + "px;width:" + (totalW - axisW) + 'px"></div>';
        html += '<div class="rm-axis" style="top:' + y + 'px">€' + t + "</div>";
      }
      COLS.forEach((c) => {
        html += '<div class="rm-colhead" style="left:' + colX(c) + "px;width:" + colW + 'px">' + c + "</div>";
      });

      type Card = { iniu: boolean; key?: string; anchor?: string; n: string; p: number; x: number; y: number; moved: boolean; img: string | null };
      const cards: Card[] = [];
      ANCHORS.forEach((a) => {
        const ov = posRef.current[a.key];
        cards.push({ iniu: true, key: a.key, n: a.key, p: a.price, x: ov ? ov.x : colX(a.col), y: ov ? ov.y : yOf(a.price), moved: !!ov, img: a.image });
      });
      if (showBrand)
        comp.forEach((r) => cards.push({ iniu: false, anchor: r.anchor, n: r.name, p: r.price, x: anchorX(r.anchor), y: yOf(r.price), moved: false, img: r.image }));

      cards.forEach((cd) => {
        const esc = (cd.n || "").replace(/"/g, "&quot;");
        html +=
          '<div class="rm-card ' + (cd.iniu ? "iniu" : "comp") + (cd.moved ? " moved" : "") +
          '" data-x="' + Math.round(cd.x) + '" data-price="' + cd.p + '" data-moved="' + (cd.moved ? 1 : 0) + '"' +
          (cd.iniu ? ' data-key="' + (cd.key || "").replace(/"/g, "&quot;") + '"' : ' data-anchor="' + (cd.anchor || "").replace(/"/g, "&quot;") + '"') +
          ' style="left:' + cd.x + "px;top:" + cd.y + "px;width:" + colW + 'px">' +
          thumb(cd.img, cd.iniu) +
          '<div class="rm-cbody"><div class="rm-ctop"><span class="rm-cname">' + esc + '</span><span class="rm-cprice">' + eur(cd.p) + "</span></div></div></div>";
      });
      chart!.innerHTML = html;

      // collision: group non-moved cards by x, stack by price
      const groups: Record<string, HTMLElement[]> = {};
      let maxB = PADT + H;
      chart!.querySelectorAll<HTMLElement>('.rm-card[data-moved="0"]').forEach((el) => {
        const gx = el.dataset.x!;
        (groups[gx] = groups[gx] || []).push(el);
      });
      Object.keys(groups).forEach((gx) => {
        const g = groups[gx].sort((a, b) => parseFloat(b.dataset.price!) - parseFloat(a.dataset.price!));
        let prev = -1e9;
        g.forEach((el) => {
          const h = el.offsetHeight;
          const top = Math.max(yOf(parseFloat(el.dataset.price!)) - h / 2, prev + GAP);
          el.style.top = top + "px";
          prev = top + h;
          if (top + h > maxB) maxB = top + h;
        });
      });
      chart!.querySelectorAll<HTMLElement>('.rm-card[data-moved="1"]').forEach((el) => {
        const b = parseFloat(el.style.top) + el.offsetHeight;
        if (b > maxB) maxB = b;
      });
      chart!.style.height = maxB + 16 + "px";
      if (editing) wireDrag();
    }

    function wireDrag() {
      chart!.querySelectorAll<HTMLElement>(".rm-card.iniu").forEach((card) => {
        card.addEventListener("pointerdown", (e) => {
          if (!editing) return;
          e.preventDefault();
          const cr = chart!.getBoundingClientRect();
          const ox = e.clientX - card.offsetLeft - cr.left;
          const oy = e.clientY - card.offsetTop - cr.top;
          const key = card.dataset.key!;
          card.classList.add("dragging");
          card.setPointerCapture(e.pointerId);
          const followers = Array.from(chart!.querySelectorAll<HTMLElement>('.rm-card.comp[data-anchor="' + key + '"]'));
          const mv = (ev: PointerEvent) => {
            const nx = Math.max(0, Math.min(ev.clientX - cr.left - ox, chart!.clientWidth - card.offsetWidth));
            const ny = Math.max(0, Math.min(ev.clientY - cr.top - oy, chart!.clientHeight - card.offsetHeight));
            card.style.left = nx + "px";
            card.style.top = ny + "px";
            followers.forEach((el) => (el.style.left = nx + "px"));
          };
          const up = () => {
            card.classList.remove("dragging");
            posRef.current[key] = { x: parseFloat(card.style.left), y: parseFloat(card.style.top) };
            try { localStorage.setItem("roadmap_pos_v1", JSON.stringify(posRef.current)); } catch {}
            card.removeEventListener("pointermove", mv);
            card.removeEventListener("pointerup", up);
            render();
          };
          card.addEventListener("pointermove", mv);
          card.addEventListener("pointerup", up);
        });
      });
    }

    renderRef.current = render;
    render();
    const onResize = () => render();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [data, layer, editing, ready]);

  const resetLayout = () => {
    posRef.current = {};
    try { localStorage.setItem("roadmap_pos_v1", "{}"); } catch {}
    renderRef.current();
  };

  // stats (pure from data + layer)
  const comp = layer !== "INIU" ? data.competitors.filter((r) => r.brand === layer) : [];
  const anchorPrice: Record<string, number> = {};
  data.anchors.forEach((a) => (anchorPrice[a.key] = a.price));
  let stats: [string, string | number, string, string?][];
  if (layer === "INIU") {
    stats = [
      ["INIU series", data.columns.length, "columns"],
      ["INIU SKUs", data.anchors.length, "anchors"],
      ["Mapped rivals", data.competitors.length, "across " + data.brands.length + " brands"],
      ["Brands", data.brands.length, "with a layer"],
      ["Pick a layer", "→", "select a brand", "good"],
    ];
  } else {
    const prices = comp.map((r) => r.price);
    const under = comp.filter((r) => r.price < (anchorPrice[r.anchor] ?? 1e9)).length;
    const cols = new Set(comp.map((r) => data.anchors.find((a) => a.key === r.anchor)?.col)).size;
    stats = [
      ["Competitor SKUs", comp.length, "mapped to INIU"],
      ["Price range", prices.length ? "€" + Math.min(...prices) + "–€" + Math.max(...prices) : "—", "RRP (EUR)"],
      ["Undercut INIU", under, "below its anchor", "warn"],
      ["Segments hit", cols + " / " + data.columns.length, "INIU columns"],
      ["Cheapest", prices.length ? "€" + Math.min(...prices) : "—", titleCase(layer) + " entry", "good"],
    ];
  }

  return (
    <div className={"roadmap" + (editing ? " editing-on" : "")}>
      <style>{CSS}</style>
      <header className="page-head">
        <div>
          <h1>Roadmap</h1>
          <p>INIU&apos;s lineup is the backbone (columns = series, height = price). Pick a brand to overlay its layer — each competitor is pinned to the INIU product it maps to, so dragging an INIU card carries its rivals.</p>
        </div>
        <div className="rm-controls">
          <label className="rm-sel">
            <span>Layer</span>
            <select value={layer} onChange={(e) => setLayer(e.target.value)}>
              <option value="INIU">INIU only</option>
              {data.brands.map((b) => (
                <option key={b} value={b}>{titleCase(b)}</option>
              ))}
            </select>
          </label>
          {editing ? (
            <>
              <button className="rm-btn ghost" onClick={resetLayout}>Reset</button>
              <button className="rm-btn primary" onClick={() => setEditing(false)}>✓ Save</button>
            </>
          ) : (
            <button className="rm-btn" onClick={() => setEditing(true)}>✎ Arrange INIU</button>
          )}
        </div>
      </header>

      <section className="rm-stats">
        {stats.map((s) => (
          <div key={s[0]} className={"rm-stat" + (s[3] ? " " + s[3] : "")}>
            <span className="k">{s[0]}</span>
            <strong className="v">{s[1]}</strong>
            <span className="d">{s[2]}</span>
          </div>
        ))}
      </section>

      <section className="rm-panel">
        <div className="rm-panel-head">
          <h2>{layer === "INIU" ? "INIU lineup" : "INIU  vs  " + titleCase(layer)}</h2>
          <div className="rm-legend">
            <b><span className="rm-dot iniu" />INIU</b>
            <b><span className="rm-dot comp" />Competitor</b>
          </div>
        </div>
        {editing ? (
          <div className="rm-editbar">Drag an INIU card — its mapped competitors follow. Height stays = price.</div>
        ) : null}
        <div className="rm-scroll"><div ref={chartRef} className="rm-chart" /></div>
      </section>

      <p className="rm-foot">
        Real data — INIU backbone from <code>iniu_products</code>, competitors pinned via <code>competitive_links</code> (closest capacity, then price), prices normalised to EUR. Layout saves to your browser. Unmapped brands (e.g. new SKUs) appear once linked in the INIU review step.
      </p>
    </div>
  );
}

const CSS = `
.roadmap .rm-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.roadmap .rm-sel{display:inline-flex;align-items:center;gap:8px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}
.roadmap .rm-sel select{font:inherit;text-transform:none;letter-spacing:0;font-weight:600;color:var(--foreground);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:7px 10px;cursor:pointer}
.roadmap .rm-btn{font:inherit;font-size:13px;font-weight:650;border:1px solid var(--border);background:var(--surface);color:var(--foreground);padding:8px 13px;border-radius:9px;cursor:pointer;box-shadow:var(--shadow)}
.roadmap .rm-btn:hover{border-color:var(--border-mid)}
.roadmap .rm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.roadmap .rm-btn.ghost{border-color:transparent;background:transparent;box-shadow:none;color:var(--muted)}
.roadmap .rm-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0 14px}
.roadmap .rm-stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 15px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:3px}
.roadmap .rm-stat .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600}
.roadmap .rm-stat .v{font-size:21px;font-weight:680;font-variant-numeric:tabular-nums}
.roadmap .rm-stat .d{font-size:11.5px;color:var(--muted);opacity:.8}
.roadmap .rm-stat.good .v{color:var(--accent)} .roadmap .rm-stat.warn .v{color:var(--warn)}
.roadmap .rm-panel{background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.roadmap .rm-panel-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border-light);flex-wrap:wrap}
.roadmap .rm-panel-head h2{font-size:14px;font-weight:700;margin:0}
.roadmap .rm-legend{display:flex;gap:15px;font-size:12px;color:var(--muted)}
.roadmap .rm-legend b{display:inline-flex;align-items:center;gap:6px;font-weight:500}
.roadmap .rm-dot{width:9px;height:9px;border-radius:3px}
.roadmap .rm-dot.iniu{background:var(--accent)} .roadmap .rm-dot.comp{background:#5b76a8}
.roadmap .rm-editbar{padding:8px 18px;background:var(--accent-bg);border-bottom:1px solid var(--border-light);font-size:12.5px;color:var(--accent);font-weight:600}
.roadmap .rm-scroll{overflow-x:auto;padding:6px}
.roadmap .rm-chart{position:relative;user-select:none;min-height:400px}
.roadmap .rm-axis{position:absolute;left:0;font-size:11px;color:var(--muted);opacity:.75;transform:translateY(-50%);width:42px;text-align:right;font-variant-numeric:tabular-nums}
.roadmap .rm-grid{position:absolute;height:1px;background:var(--border-light);pointer-events:none}
.roadmap .rm-colhead{position:absolute;top:0;text-align:center;font-size:12px;font-weight:700;color:var(--foreground);pointer-events:none}
.roadmap .rm-card{position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:6px 8px;display:flex;gap:8px;align-items:flex-start;box-shadow:var(--shadow);transition:box-shadow .12s,transform .12s,left .18s ease,top .18s ease;touch-action:none}
.roadmap .rm-card.iniu{border-color:var(--accent);background:var(--accent-bg)}
.roadmap .rm-card.comp{border-left:3px solid #5b76a8}
.roadmap .rm-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.13);z-index:6}
.roadmap.editing-on .rm-card.iniu{cursor:grab}
.roadmap .rm-card.dragging{cursor:grabbing;z-index:20;box-shadow:0 12px 30px rgba(0,0,0,.22);transition:none}
.roadmap .rm-card.moved::after{content:"";position:absolute;top:-4px;right:-4px;width:8px;height:8px;border-radius:50%;background:var(--accent);border:1.5px solid var(--surface)}
.roadmap .rm-thumb{flex:0 0 auto;width:28px;height:28px;border-radius:6px;background:var(--subtle);border:1px solid var(--border-light);display:flex;align-items:center;justify-content:center;color:var(--muted);margin-top:1px;overflow:hidden}
.roadmap .rm-thumb.iniu{color:var(--accent);border-color:var(--accent)}
.roadmap .rm-thumb img{width:100%;height:100%;object-fit:contain}
.roadmap .rm-thumb svg{width:15px;height:15px}
.roadmap .rm-cbody{min-width:0;flex:1}
.roadmap .rm-ctop{display:flex;justify-content:space-between;gap:6px;align-items:baseline}
.roadmap .rm-cname{font-size:11.5px;font-weight:600;line-height:1.2}
.roadmap .rm-card.iniu .rm-cname{font-weight:700}
.roadmap .rm-cprice{flex:0 0 auto;font-size:12px;font-weight:680;font-variant-numeric:tabular-nums}
.roadmap .rm-card.iniu .rm-cprice{color:var(--accent)} .roadmap .rm-card.comp .rm-cprice{color:#5b76a8}
.roadmap .rm-foot{color:var(--muted);opacity:.85;font-size:11.5px;margin-top:13px;line-height:1.5}
@media (max-width:720px){.roadmap .rm-stats{grid-template-columns:repeat(2,1fr)}}
@media (prefers-reduced-motion:reduce){.roadmap .rm-card{transition:none}}
`;
