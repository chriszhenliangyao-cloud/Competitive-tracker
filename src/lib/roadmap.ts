import { getSupabase } from "@/lib/supabase";
import { toEUR } from "@/lib/format";

// INIU-anchored roadmap data. INIU products (collapsed to base models) are the
// backbone columns; each competitor is pinned to the INIU product it maps to
// via competitive_links (primary = closest capacity, then price). All prices EUR.

export type Anchor = { key: string; col: string; price: number; image: string | null };
export type Comp = { anchor: string; brand: string; name: string; price: number; image: string | null };
export type RoadmapData = { columns: string[]; anchors: Anchor[]; competitors: Comp[]; brands: string[] };

const COLUMN_ORDER = ["MagPro Slim", "MagPro", "Pocket Power", "Pocket Neo", "Pocket Pro", "Leopard"];

// INIU sku -> {column, base model}. Colour variants collapse to one base model.
function iniuAnchor(sku: string): { col: string; base: string } | null {
  const s = (sku || "").toUpperCase().trim();
  if (s.startsWith("P76")) return { col: "MagPro Slim", base: "MagPro Slim 10K" };
  if (s.startsWith("P75")) return { col: "MagPro Slim", base: "MagPro Slim 5K" };
  if (s.startsWith("P72")) return { col: "MagPro", base: "MagPro 10K" };
  if (s.startsWith("PX51")) return { col: "MagPro", base: "MagPro Neo 10K" };
  if (s.startsWith("PX21")) return { col: "Pocket Neo", base: "Pocket Neo 20K" };
  if (s.startsWith("PX11")) return { col: "Pocket Neo", base: "Pocket Neo 10K" };
  if (s.startsWith("P51L")) return { col: "Pocket Power", base: "Pocket Power 20K" };
  if (s.startsWith("P61L")) return { col: "Pocket Power", base: "Pocket Power 10K" };
  if (s.startsWith("P64")) return { col: "Leopard", base: "Leopard 140W" };
  if (s.startsWith("P63")) return { col: "Leopard", base: "Leopard 100W" };
  if (s.startsWith("P62")) return { col: "Leopard", base: "Leopard 65W" };
  if (s.startsWith("PPT51")) return { col: "Pocket Pro", base: "Pocket Pro Slim 10K" };
  if (s.startsWith("PPT01")) return { col: "Pocket Pro", base: "Pocket Pro 10K" };
  return null;
}

const capNum = (c: unknown) => {
  const m = String(c ?? "").replace(/[^\d]/g, "");
  return m ? parseInt(m, 10) : 0;
};

function cleanName(n: string): string {
  const s = n
    .replace(/power ?bank/gi, "")
    .replace(/batterie externe|batería externa|powerbank/gi, "")
    .replace(/\b(belkin|anker|cellularline|celly|baseus|ugreen|xtorm|sbs)\b/gi, "")
    .replace(/\b(noir|blanc|czarny|biały|schwarz|weiß|weiss|negro|plata|szary|niebieski|bleu|grise|rosa|silber|srebrny|zielony|czerwony|orange|blue|black|white)\b/gi, "")
    .replace(/[,–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 3 ? s : n;
}

type IniuRow = { id: number; sku: string; name: string; capacity: string | null; image_url: string | null };
type PriceRow = { iniu_product_id: number; price: number | string | null; currency: string | null };
type LinkRow = { iniu_product_id: number; competitor_product_id: number };
type ProdRow = {
  id: number; name: string; rrp: number | string | null; rrp_currency: string | null;
  capacity: string | null; image_url: string | null; brand: { key: string } | null;
};

export async function getRoadmapData(): Promise<RoadmapData> {
  const sb = getSupabase();
  const [iniuRes, priceRes, linkRes, hiddenRes, prodRes] = await Promise.all([
    sb.from("iniu_products").select("id,sku,name,capacity,image_url"),
    sb.from("iniu_price_snapshots").select("iniu_product_id,price,currency"),
    sb.from("competitive_links").select("iniu_product_id,competitor_product_id").limit(100000),
    sb.from("hidden_competitive_links").select("iniu_product_id,competitor_product_id").limit(100000),
    sb.from("products").select("id,name,rrp,rrp_currency,capacity,image_url,brand:brands(key)"),
  ]);
  const iniu = (iniuRes.data ?? []) as unknown as IniuRow[];
  const prices = (priceRes.data ?? []) as unknown as PriceRow[];
  // Drop hidden pairs so hidden competitors never appear on the Roadmap.
  const hiddenSet = new Set<string>(
    ((hiddenRes.data ?? []) as unknown as { iniu_product_id: number; competitor_product_id: number }[]).map(
      (h) => `${h.iniu_product_id}|${h.competitor_product_id}`,
    ),
  );
  const links = ((linkRes.data ?? []) as unknown as LinkRow[]).filter(
    (l) => !hiddenSet.has(`${l.iniu_product_id}|${l.competitor_product_id}`),
  );
  const prods = (prodRes.data ?? []) as unknown as ProdRow[];

  // INIU product -> avg EUR own-channel price
  const eurAgg = new Map<number, { sum: number; n: number }>();
  for (const p of prices) {
    const e = toEUR(p.price != null ? Number(p.price) : null, p.currency);
    if (e == null) continue;
    const cur = eurAgg.get(p.iniu_product_id) ?? { sum: 0, n: 0 };
    cur.sum += e; cur.n += 1; eurAgg.set(p.iniu_product_id, cur);
  }

  // collapse INIU into base-model anchors
  const anchorAgg = new Map<string, { col: string; prices: number[]; cap: number; image: string | null }>();
  const iniuIdToAnchor = new Map<number, string>();
  for (const i of iniu) {
    const a = iniuAnchor(i.sku);
    if (!a) continue;
    iniuIdToAnchor.set(i.id, a.base);
    const ag = anchorAgg.get(a.base) ?? { col: a.col, prices: [], cap: 0, image: null };
    const pe = eurAgg.get(i.id);
    if (pe) ag.prices.push(pe.sum / pe.n);
    ag.cap = Math.max(ag.cap, capNum(i.capacity));
    if (!ag.image && i.image_url) ag.image = i.image_url;
    anchorAgg.set(a.base, ag);
  }
  // per-column avg (fallback for anchors with no price)
  const colPrices: Record<string, number[]> = {};
  anchorAgg.forEach((ag) => { if (ag.prices.length) (colPrices[ag.col] ??= []).push(...ag.prices); });
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

  const anchors: Anchor[] = [];
  const anchorPrice = new Map<string, number>();
  const anchorCap = new Map<string, number>();
  anchorAgg.forEach((ag, key) => {
    let price = avg(ag.prices);
    if (isNaN(price)) price = avg(colPrices[ag.col] ?? []);
    if (isNaN(price)) price = 50;
    price = Math.round(price);
    anchors.push({ key, col: ag.col, price, image: ag.image });
    anchorPrice.set(key, price);
    anchorCap.set(key, ag.cap);
  });

  // competitor -> its INIU links
  const linksByComp = new Map<number, number[]>();
  for (const l of links) {
    const arr = linksByComp.get(l.competitor_product_id) ?? [];
    arr.push(l.iniu_product_id);
    linksByComp.set(l.competitor_product_id, arr);
  }

  const competitors: Comp[] = [];
  const brands = new Set<string>();
  for (const p of prods) {
    const linkIds = linksByComp.get(p.id);
    if (!linkIds || !linkIds.length) continue;
    const eur = toEUR(p.rrp != null ? Number(p.rrp) : null, p.rrp_currency ?? "EUR");
    if (eur == null) continue;
    const pcap = capNum(p.capacity);
    // primary anchor: closest capacity, then closest price
    let best: { key: string; capDiff: number; prDiff: number } | null = null;
    for (const iid of linkIds) {
      const akey = iniuIdToAnchor.get(iid);
      if (!akey) continue;
      const capDiff = Math.abs((anchorCap.get(akey) ?? 0) - pcap);
      const prDiff = Math.abs((anchorPrice.get(akey) ?? 9999) - eur);
      if (!best || capDiff < best.capDiff || (capDiff === best.capDiff && prDiff < best.prDiff)) {
        best = { key: akey, capDiff, prDiff };
      }
    }
    if (!best) continue;
    const brand = p.brand?.key ?? "?";
    brands.add(brand);
    competitors.push({ anchor: best.key, brand, name: cleanName(p.name ?? ""), price: Math.round(eur), image: p.image_url ?? null });
  }

  const columns = COLUMN_ORDER.filter((c) => anchors.some((a) => a.col === c));
  return { columns, anchors, competitors, brands: [...brands].sort() };
}
