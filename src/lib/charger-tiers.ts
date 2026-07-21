// Charger segmentation: form factor first, then wattage.
//
// Power banks are organised by capacity; chargers are organised by what the
// product IS (wall / car / desktop / wireless / cable) and then, for wall, by
// power band — that is how the category is merchandised and priced.
//
// Order matters. Wireless is decided first (a wireless base often mentions a
// bundled cable), then cable — which must NOT catch a charger that merely ships
// with one: in this data ~80 listings read "Chargeur + Cable Adeqwat 65W" or
// "…avec câble" against 43 genuine standalone cables. So a cable only counts
// when the cable word is the head noun.

export type TierKey =
  | "wall_45" | "wall_45_65" | "wall_65_70" | "wall_100_140" | "wall_140"
  | "wall_unknown"
  | "car"
  | "desk_lo" | "desk_hi"
  | "wireless"
  | "cable_lo" | "cable_hi";

export type Tier = { key: TierKey; label: string; sub: string };

export const CHARGER_TIERS: Tier[] = [
  // Wall is the bulk of the category, so it carries the full power ladder.
  // The other form factors stay single/coarse: car is 19/32 under 45W and
  // wireless 49/55, so splitting them the same way would be ~20 empty sections.
  { key: "wall_45",      label: "Wall ≤45W",       sub: "Phone / tablet" },
  { key: "wall_45_65",   label: "Wall 45–65W",     sub: "Between the two standard ratings" },
  { key: "wall_65_70",   label: "Wall 65–70W",     sub: "The 65–70W class" },
  { key: "wall_100_140", label: "Wall 100–140W",   sub: "Laptop / multi-device" },
  { key: "wall_140",     label: "Wall ≥140W",      sub: "High-power multi-port" },
  // Not folded into <45W: that would assert a wattage we never read. These are
  // listings whose page stated no power — they move into a band once a scrape
  // picks one up.
  { key: "wall_unknown", label: "Wall · W unknown", sub: "No power on the page" },
  { key: "car",      label: "Car",           sub: "All wattages" },
  { key: "desk_lo",  label: "Desktop ≤200W", sub: "Desk hub" },
  { key: "desk_hi",  label: "Desktop >200W", sub: "High-power station" },
  { key: "wireless", label: "Wireless",      sub: "Induction / MagSafe / Qi, all wattages" },
  { key: "cable_lo", label: "Cable ≤150W",   sub: "Standalone cable" },
  { key: "cable_hi", label: "Cable >150W",   sub: "High-power cable" },
];

export const TIER_LABEL: Record<TierKey, string> = Object.fromEntries(
  CHARGER_TIERS.map((t) => [t.key, t.label]),
) as Record<TierKey, string>;

// Multi-port totals get mis-parsed out of names (e.g. "1003W"), so anything
// above this is treated as an unknown wattage rather than plotted as real.
export const MAX_PLAUSIBLE_W = 300;

/** Trailing ISO weeks that get their own price column. Lives here so the page and
 *  the HTML export can't drift — the export must show the same columns. */
export const CHARGER_WEEK_COLS = 6;

/** "100 W" / "100W" / "1003W" -> watts, or null when implausible/absent. */
export function wattOf(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return n > 0 && n <= MAX_PLAUSIBLE_W ? n : null;
}

const CHARGER_WORD =
  /chargeur|ładowarka|ladowarka|cargador|caricabatterie|charger|netzteil|zasilacz|ladeger[äa]t|oplader/i;
const CABLE_WORD = /\b(kabel|câble|cable|cavo|przewód|przewod)\b/i;
const CAR_WORD = /allume[- ]?cigare|samochod|\bcar charger\b|voiture|coche|\bkfz\b|auto[- ]?ladeger|\bcar\b/i;
const DESK_WORD = /desktop|sobremesa|stacja|station|bureau|biurk/i;
// Checked against the CURRENT charger data: 51 listings match, all of them
// genuinely wireless, and nothing wireless is missed. Note `usb_ports` is NOT
// used — its three remaining "+Wireless" hits are all plain wall chargers
// ("Chargeur Belkin Secteur Usb-C 100W"), i.e. the spec parser picking up the
// word off the page. Names are the reliable signal here.
const WIRELESS_WORD =
  /induction|inducci|indukc|induktion|sans fil|wireless|kabellos|bezprzewod|inal[áa]mbric|magsafe|magnetyczn|magnetic|magn[ée]tique|aimant|\bqi2?\b/i;
// Deliberately NOT here: Spanish "magnético". In this data it describes a
// magnetic RETRACTABLE CABLE on car chargers ("Baseus PrimeTrip VR2 Max …
// Sistema retráctil magnético"), which is not wireless charging. The genuinely
// wireless Spanish listings all say "inalámbrica" as well.

/**
 * Classify a charger-category product/listing into one of the 14 tiers.
 * `name` is the product or raw listing name; `power` the wired_power/power field.
 */
export function tierOf(name: string | null | undefined, power: string | null | undefined): TierKey {
  const n = String(name ?? "");
  const w = wattOf(power);

  // 1. Wireless — its own tier whatever the form factor or wattage, so a
  //    wireless car mount and a wireless 3-in-1 station sit together rather than
  //    scattered across car/desktop. Runs FIRST: these names often mention a
  //    bundled cable ("Base de carga … Con cable") and Spanish "carga" is not a
  //    charger word, so the cable rule below would otherwise claim them.
  if (WIRELESS_WORD.test(n)) return "wireless";

  // 2. Standalone cable.
  const cableAt = n.search(CABLE_WORD);
  if (cableAt >= 0) {
    const before = n.slice(0, cableAt);
    // A standalone cable leads with the cable word ("Cable USB-C — CellularLine…").
    // Anything where the cable is appended to something else is a charger with a
    // bundled cable, which shows up two ways: a charger word earlier in the name,
    // or a "+" joining it on ("Ugreen X513 30W GaN 1x USB-C + kabel USB-C 1m",
    // which names no charger at all so the word test alone misses it).
    if (!CHARGER_WORD.test(before) && !before.includes("+")) {
      return (w ?? 0) > 150 ? "cable_hi" : "cable_lo";
    }
  }

  // 3. Car charger — one tier regardless of wattage.
  if (CAR_WORD.test(n)) return "car";

  // 4. Desktop / station, split at 200W.
  if (DESK_WORD.test(n)) return (w ?? 0) > 200 ? "desk_hi" : "desk_lo";

  // 5. Everything else is a wall charger, on the power ladder. The bands follow
  //    the standard ratings the category is sold on (45 / 65 / 100 / 140), so
  //    they are narrow and unevenly spaced rather than regular:
  //      ≤45 · 45<x<65 · 65≤x<100 · 100≤x<140 · ≥140
  //    The 65–70W band is labelled for what it holds but actually runs to <100:
  //    stopping at 70 would leave 71–99W with no tier at all, so a future 80W
  //    charger would just vanish from the board. Nothing sits there today — wall
  //    wattages jump 67 → 70 → 100 — so no current row is affected.
  if (w == null) return "wall_unknown";
  if (w <= 45) return "wall_45";
  if (w < 65) return "wall_45_65";
  if (w < 100) return "wall_65_70";
  if (w < 140) return "wall_100_140";
  return "wall_140";
}
