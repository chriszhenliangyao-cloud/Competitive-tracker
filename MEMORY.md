# Project memory — state, decisions, open work

Evolving log for the cloud app. Stable architecture is in `AGENTS.md`; this file is the
"what's done / why / what's next". Keep it current; append decisions rather than rewriting history.

## Current state (cloud is live)
- Site deployed on Vercel, reads Supabase live. Pages: `/` (Prices by Country), `/channel`,
  `/iniu`, `/library`, `/reviews`, `/first-pass`, `/roadmap`.
- Data in Supabase (as of 2026-07): 936 listings, ~3.25k price_snapshots across 7 weekly dates,
  548 competitor products, 24 iniu_products, ~664 first_pass registry rows, 972 competitive_links,
  51 iniu_price_snapshots (INIU own price, 1 date 2026-06-22 so far). `raw_scrape_rows` holds ~9
  test rows from the elcorteingles/belkin map_cycle validation (run_id=1) — harmless staging.
- Images: competitor/first-pass/INIU images uploaded to Supabase Storage (`product-images/…`),
  permanent public URLs; ~80% listing-level coverage. Remaining are retailer-CDN or genuinely absent.

## Architecture decision: Model B (cloud is source of truth)
Chosen because the user needs to free local disk + use SQL. Cloud becomes the source of truth;
local machine only scrapes raw. Supersedes the earlier Model A ("local applies review decisions")
— `pull_reviews.py` is being retired.

Per-cycle flow (target):
`run_scrape_raw.py` (local scrape → `raw_scrape_rows`) → `map_cycle(run_id)` (cloud SQL maps) →
review in cloud (writes cloud directly) → dashboard live. No local apply, no dashboard regenerate.

Done for Model B: `raw_scrape_rows` table; `first_pass` upgraded to a per-(retailer,code) registry
(last_seen/is_active + unique index); `map_cycle` SQL fn (validated on real elcorteingles/belkin
cycle — memory + page-SKU-exact resolution, delisted detection, all correct); `run_scrape_raw.py`
local runner (targets from `brand_retailer_targets`).

## Pipeline evolution & gap checklist (current → target)
**Current (Model A) — local is the brain, cloud only displays:**
`run_mapped_all.py` (local scrape **+ local map** → `output/channel_mapped/*.xlsx`) →
`validate_sync.py` (read-only gate) → `push_to_supabase.py --write --all-history` →
`upload_images.py` / `upload_iniu.py` → site reads live. Pain: local disk can't be freed (the
brain depends on `output/`, `product_library/`, images, historical xlsx); map logic locked in
local Python; cloud is a passive mirror.

**Target (Model B) — cloud is the brain & single source of truth, local only scrapes raw:**
`run_scrape_raw.py` (scrape raw only → `raw_scrape_rows`) → `map_cycle()` (Postgres maps:
memory > page-SKU-exact > new_listing, no fuzzy, auto delisted-detection) → `/reviews` writes
back to cloud → site reads live. Win: local becomes a dumb scraper → raw files can be cold-archived
and deleted (disk freed); map rules live in SQL (iterable/rollbackable); no "local vs cloud" truth split.

**Built (Model B foundation, DONE):** `raw_scrape_rows` table; `first_pass` upgraded to a
per-(retailer,code) registry (last_seen/is_active + unique index); `map_cycle()` validated on a real
elcorteingles/belkin cycle (memory + page-SKU-exact + delisted all correct); `run_scrape_raw.py`
runner (targets from `brand_retailer_targets`); `/reviews` writes cloud directly.

**Step-by-step migration plan:** see `MIGRATION_MODEL_B.md` (single-experiment method — Stage A full
local push → Stage B one-cycle raw→map diff=0 → Stage C guardrails → Stage D cutover + free disk).

**Remaining before cutover (the gap):**
1. Route `supabase.co` through the proxy so local raw uploads work reliably from China.
2. **Shadow-validate**: run one `run_scrape_raw` cycle and diff `map_cycle` output vs the same-week
   local mapped file — confirm identical before trusting the cloud brain.
3. Cold-archive `output/` + `product_library/` + `INIU/` to external/Storage, then delete local.
4. Cutover cleanup: purge legacy file-based `mapping_reviews` (`source_file <> 'cloud'`); clear the
   ~9 test rows in `raw_scrape_rows` (run_id=1).
5. Loose ends not blocking cutover: `push_iniu_prices.py` (INIU price still ad-hoc SQL); editing UI
   (designed, not built); Google auth (@iniushop.com); drop the 4 unused `v_*` views.

## Other key decisions
- **Reads via service-role, server-side.** RLS blocks anon; service role bypasses. Pages force-dynamic.
- **push_to_supabase does NOT own image_url** — removed from its upsert payload so re-imports never
  clobber the Storage URLs written by `upload_images.py`. (Fixed after an all-history push wiped images.)
- **Prices shown in EUR** (static FX); RRP native. INIU own price also EUR.
- **Field ownership contract** (see AGENTS.md) — added specifically to prevent cross-module drift
  when editing is introduced.
- INIU own-brand pipeline (2026-07-07): `run_iniu_prices.py` scrapes the 6 INIU channels →
  CSV → `push_iniu_prices.py` upserts `iniu_price_snapshots`. Identity = `(retailer,code)` → EAN
  fallback → UNMATCHED (no fuzzy). Bridge in `channel/iniu_code_map.json` + `iniu_ean_map.json`
  (reconstructed from the first hand-mapped cycle), auto-extended from cloud snapshot memory.
  0622 CSV: 52/56 matched; the 4 unmatched are PowerPaw ×3 + one [Outlet] listing (need catalogue
  entries — PowerPaw/P41L-P1 to be created).
- **map_cycle own-brand guard**: `map_cycle` now skips `brand_key='iniu'` so the own brand can never
  pollute competitor `listings`/`mapping_reviews` (root cause of INIU being auto-mapped last run).
  Verified with a transactional test. Delisted-detection also excludes iniu.

## Open / next work
1. **Editing (Library / First Pass / INIU) — designed, not built.** Plan: Library edits `products`
   (canonical specs); First Pass edits mapping/presence only (specs JOINed from products); INIU edits
   `iniu_products`. Server-action writes + `audit_events` + optimistic lock (`updated_at`). Phase 1 =
   make First Pass display specs from products (kill the duplicate columns) before adding edit UI.
2. **Google auth (@iniushop.com)** for writes; until then use Vercel Deployment Protection.
3. **Model B cutover**: route `supabase.co` through proxy for local uploads; shadow-validate map_cycle
   vs a real local mapped file; cold-archive source files (`output/`, `product_library/`, `INIU/`) to
   an external/Storage cold bucket; then delete local.
4. Cleanup: legacy file-based `mapping_reviews` coexist with cloud ones (UI dedupes by listing; purge
   `source_file <> 'cloud'` at cutover). INIU own price is single-date → trend fills as scrapes accrue.
5. Tidy: add PowerPaw/P41L-P1 to `iniu_products` (+ bridge) so they stop showing UNMATCHED; drop the
   4 unused `v_*` views eventually; clear the ~9 test rows in `raw_scrape_rows` (run_id=1).

## Model B cutover — READY (prepared 2026-07-07)
Everything is staged so the NEXT weekly run maps in the cloud (`run_scrape_raw` → `map_cycle`),
closing the full loop. What was prepared and verified:
- **Targets**: `brand_retailer_targets` filled to all **53** calibrated (retailer,brand) pairs, enabled
  (was 26). `run_scrape_raw` reads this list.
- **Calibration present**: `first_pass_observations` has 588 code→sku mappings → map_cycle's memory
  cascade is as good as the local mapper's.
- **Engine parity proven** (shadow test, rolled back): fed all 988 current listings back through
  `map_cycle` → **987/987 identical** to the local mapper, +2 extra maps via the page-SKU tier
  (map_cycle has it, local doesn't). Zero regressions.
- **Fixed 1 normalization divergence** (superseded 2026-07-08, see "SKU normalization" below):
  `products.sku_key` was stored with a different rule than map_cycle's `fp_norm_sku` (the malformed
  SKU `Ugreen 25742`). Realigned all 548 sku_key. The malformed row is now merged away and
  `fp_norm_sku` is brand-aware, so this specific divergence no longer exists.
- **Loop closed**: `resolve_review` writes decisions into first_pass; map_cycle reads it next cycle.
- **Guards live**: own-brand skip, review dedupe trigger.

Next-run commands (Model B, supervised):
```
export SUPABASE_SERVICE_ROLE_KEY=<secret>            # + Clash routing supabase.co
# validate one channel first:
python channel/_supervise.py --stall-timeout 300 -- /opt/anaconda3/bin/python -u \
  channel/run_scrape_raw.py --retailer elcorteingles --brand belkin
# then the full run (map_cycle runs automatically at the end):
python channel/_supervise.py --stall-timeout 300 -- /opt/anaconda3/bin/python -u \
  channel/run_scrape_raw.py
```
Open caveats: (a) `run_scrape_raw` has no per-target resume yet — a supervisor restart re-scrapes
from scratch, and it holds all raw rows in memory until the end (upload once). Add per-retailer
incremental upload if the full run proves flaky. (b) DONE (2026-07-08): the Stage-C **partial-scrape
circuit breaker** is built into `run_scrape_raw.py`. Before upload/map it compares each
(retailer,brand)'s scraped count to last cycle's active count (`get_active_baseline` /
`apply_circuit_breaker`): a pair scraping < `CB_FLOOR` (0.5) of prior when prior ≥ `CB_MIN_PRIOR` (6)
is held back — its rows aren't uploaded, so map_cycle never sees the pair and can't delist its codes.
A 0-row pair was already safe (absent from raw); it's now reported. A genuine whole-channel delist
reads as 0/low too, so we never auto-delist on one short read — use `--force` (or it recovers next
full cycle). (c) xkom returns 0 for some brands (harmless: absent from raw, no false delist).

## Review resolution — permanent, no new layers (2026-07-07)
Principle (Chris): **we only moved storage Excel→SQL; the mapping logic is unchanged.** So don't
invent override tables or lock flags. The Excel-era `apply_mapping_review.py` wrote the human
decision into the **first_pass registry** (retailer_product_code → sku); the mapping cascade already
reads first_pass, so a resolved listing maps automatically forever and never returns to review.
- The SQL port had DROPPED that apply step (resolveReview only marked the review `done`) → decisions
  were inert and would re-queue. Fixed with SQL fn `resolve_review(listing, sku, name, reviewer)`:
  writes `first_pass_observations.sku` for that (retailer,code), flips the listing to mapped/
  library_missing, closes the queue — atomic. `resolveReview` server action now calls it.
- Takes effect on the SQL mapping path (map_cycle reads cloud first_pass). The old local-Excel
  `run_mapped_all` reads local first_pass files, so it honors decisions only once mapping runs from
  SQL (Model B) — consistent as long as resolve and map use the same store.
- Considered but REJECTED as over-design: a separate `sku_overrides` tier-0 table, and a `manual`
  lock column — unnecessary because a calibrated listing is `mapped` (not new_listing), so it never
  re-enters review and can't be clobbered.

## Competitor hide — durable, reversible, re-import-safe (2026-07-08)
Curating competitors on `/iniu` must **hide, not delete**. A hard delete of the `competitive_links`
row is not durable: `upload_iniu.py --write` (re-run after every push that adds new products) rebuilds
links from the INIU spec xlsx and would re-insert any pair still listed there → the removal silently
comes back. Same class of bug as the review-permanence one.
- Where the OLD local dashboard stored hides (investigated): its only **persistent** competitor
  removal was `/api/remove-mapping` (server.py), which edits `INIU/INIU_PowerBank_Spec_Sheet.xlsx`
  directly (drops the SKU from that INIU row's Competitive SKU cols). The cloud's 972 links were built
  from that already-edited sheet, so past removals are already reflected. The dashboard's cosmetic
  "exclude" ×-toggle (`excludedCompetitiveSkus`) stored **nothing** — in-memory only, lost on refresh.
- Cloud solution (chosen over a soft-delete column): new table **`hidden_competitive_links`**
  (iniu_product_id, competitor_product_id, hidden_by, reason, hidden_at; unique(iniu,comp); FK CASCADE;
  RLS on, service-role only). Decoupled from `competitive_links` on purpose — survives even a full
  link rebuild, and "show me what I hid" is one query. `competitive_links` stays complete; all three
  read paths (`page.tsx`, `iniu/page.tsx`, `lib/roadmap.ts`) mask hidden pairs at read time, so a
  hidden competitor never appears on any board and `upload_iniu.py` needs **no change** (it re-inserts
  the link, the reader hides it). Loop closed.
- UI: `/iniu` per-row **Hide** (optimistic, reversible, no confirm) + **Show hidden (N)** toggle that
  greys hidden rows with **Unhide**. Catalogue shows visible count + `(N hidden)`. `hidden_by` = the
  signed-in email (audit trail the old dashboard lacked).

## Role + country access control (2026-07-08)
Users split admin/sales in `src/lib/access.ts` (`USERS` map = single source; `ALLOWED_EMAILS`
derived from its keys). Admin (Chris/Julio/Jiwen) → all countries. Sales → one country each: Victor
FR, Juan ES, Slawomir + Lukasz PL. Requirement: sales see only their country's channels + the
competitors sold there, on Dashboard / Channel / Roadmap.
- **Enforcement is app-layer, NOT Postgres RLS** — all reads use the service-role key which bypasses
  RLS, so RLS policies would do nothing. Instead: (1) middleware redirects non-admins off the
  admin-only pages (`/iniu`, `/library`, `/reviews`, `/first-pass`); (2) the three sales-facing pages
  filter data to the caller's countries **server-side** (`getScope()`/`allowsCountry()` in
  `src/lib/scope.ts`) before shipping props, so the browser physically never gets other countries'
  rows. This is genuine enforcement (server boundary), just not DB-RLS. Sidebar hides admin-only
  links for sales (cosmetic; middleware is the hard gate).
- Country codes are ISO-2 matching `retailers.country` (FR/ES/PL/DE; nobody owns DE→sales can't see
  Coolblue, admins can). Roadmap scopes competitors via a listings→retailer.country presence index;
  the INIU backbone columns stay the full lineup for everyone. Decision (Chris): the other four pages
  are **admin-only**, not country-scoped-for-sales.

## First Pass reads canonical specs (single source of truth) (2026-07-08)
Goal (Chris): the three modules (Library / First Pass / Reviews) must be consistent in real time —
edit in one place, the others reflect it; and a scrape+map cycle must never scramble or clobber data.
Audit result:
- **Identity/mapping line already solid**: `resolve_review` writes BOTH `first_pass.sku` (code→sku
  memory) and `listings.product_id` for the same (retailer, code), using the same `fp_norm_sku`
  normalization as `map_cycle`. `map_cycle`'s cascade reads listings then first_pass (memory tier
  highest), so a resolved code re-resolves to the same SKU every cycle — never returns to review,
  never clobbered (`first_pass.sku = coalesce(this-cycle, existing)`). `map_cycle` only READS
  `products` (never writes specs), so scraping can't scramble Library specs.
- **The one drift fixed**: the First Pass page used to display `first_pass_observations`'s own frozen
  `capacity/power/usb_ports` (heavy-scrape legacy; `map_cycle` never updates them). Proven stale — e.g.
  the same SKU A1664H11 had `30W` at one retailer and `15W` at another; a code with frozen `"3 A"`
  where Library correctly has no wired_power. Now First Pass resolves specs via the code's mapping
  (`listings.product_id` → products; secondary exact-SKU) and shows canonical, with a "raw" fallback
  badge for unmapped codes. Coverage: 522/664 canonical, 141 raw-fallback, 1 no-specs. A Library edit
  now propagates to First Pass instantly. **The mapping resolution and the spec display are one logic**
  (both anchored on retailer_product_code), so the three modules read one source.
- **Cycle guardrail (must hold before enabling Library editing)**: Model-A `push_to_supabase`
  overwrites `products` from local xlsx (and recomputes `sku_key` with the old rule, reverting the
  Ugreen alignment). Once you edit Library in the cloud, do NOT run the Model-A library push or it
  reverts your edits — `products` must be cloud-sourced (Model B). `map_cycle` itself is spec-safe.

## SKU normalization is brand-aware (fp_norm_sku ports the per-brand rules) (2026-07-08)
The match key `fp_norm_sku(sku, bkey)` used to only special-case Ugreen (strip 3-char `UGR`), which
(a) mangled the malformed `Ugreen 25742` → `EEN25742` (the "UGR" heuristic ate the brand word
`UGREEN`), and (b) didn't collapse other variant forms. The parent project's per-brand SKU rules
live in `channel/scrapers/sku_rules.py` (`clean_<brand>_sku`: strip brand prefix + strict regex,
applied at SCRAPE time) plus `apply_mapping_review.sku_key` / `generate_dashboard.canonical_display`
(match/display: belkin case-fold + ugreen UGR). The comprehensive charger set is in `插头/` — a
SEPARATE charger pipeline, not ours. Cloud only had the thin Ugreen rule.
- **Fixed**: `fp_norm_sku` now ports all powerbank brand prefixes into the single DB normalizer so the
  match key is self-sufficient (doesn't depend on upstream Python cleaning that won't run for
  cloud-entered SKUs): ugreen (UGREEN/UGR/UG before a digit → bare, keep trailing colour letter),
  baseus (BASEUS only — NOT bare "BS", which is a real model prefix e.g. `BS-CH001`), belkin,
  cellularline, sbs, xtorm, xline, anker, fresh-n-rebel (FRESHNREBEL/FNR). Deliberately NOT stripped:
  hyphens (Baseus `P…-00`) and trailing colour letters (Ugreen `35524` vs `35524B` are DISTINCT rows).
- **Validated**: 0 new collisions, **0 key changes on existing data** (every current library SKU was
  already clean — my full scan found exactly one dirty row, the Ugreen one) → zero regression; the
  rules are purely forward-looking robustness for Model B cloud editing. `map_cycle` + `resolve_review`
  call `fp_norm_sku` so they inherit it automatically.
- **Merged the one dirty duplicate**: `Ugreen 25742` (id 499, an empty stub with 1 listing, no specs)
  → the clean `25742` (id 463, full specs). Repointed listing 198 + first_pass 116, deleted 499. That
  listing now shows canonical specs instead of a blank stub. This removes the old Model-A-push caveat
  for that row (it's gone); the general guardrail (don't run Model-A library push once editing in the
  cloud) still stands. DB-only migration (`fp_norm_sku_all_brand_prefixes_v2`); no web code change.

## Data-quality notes
- **Review de-duplication (2026-07-07)**: `mapping_reviews` had grown to 867 pending rows but only
  351 distinct listings — Model A `push_to_supabase` used a date-stamped `source_file` in the dedupe
  key `(listing_id, source_file, source_row)`, so every cycle re-recorded an unreviewed listing (one
  listing had 6). Fixed: (1) one-time cleanup collapsed to 1 pending per listing (867→351); (2) trigger
  `trg_mapping_reviews_dedupe_pending` blocks a 2nd pending review per listing (stops *unresolved*
  ones duplicating). Resolution permanence is handled by `resolve_review` above (writes first_pass).
- Some INIU SKUs list twice at one retailer (e.g. komputronik P64-P1) → unique (product,retailer,date)
  keeps one. 16 competitor SKUs have no specs (mostly review-added) — fill via Library editing.
- 6 competitor pairs share a Storage image = duplicate SKU/EAN in the source library (worth merging).
- The global audit confirmed the DB faithfully mirrors local; "stale" pairs (e.g. xkom/ugreen last_seen
  2026-05-20) are scraping-coverage gaps, not missing data (xkom search returns 0 ugreen now).
