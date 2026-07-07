# Project memory — state, decisions, open work

Evolving log for the cloud app. Stable architecture is in `AGENTS.md`; this file is the
"what's done / why / what's next". Keep it current; append decisions rather than rewriting history.

## Current state (cloud is live)
- Site deployed on Vercel, reads Supabase live. Pages: `/` (Prices by Country), `/channel`,
  `/iniu`, `/library`, `/reviews`, `/first-pass`.
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

## Data-quality notes
- Some INIU SKUs list twice at one retailer (e.g. komputronik P64-P1) → unique (product,retailer,date)
  keeps one. 16 competitor SKUs have no specs (mostly review-added) — fill via Library editing.
- 6 competitor pairs share a Storage image = duplicate SKU/EAN in the source library (worth merging).
- The global audit confirmed the DB faithfully mirrors local; "stale" pairs (e.g. xkom/ugreen last_seen
  2026-05-20) are scraping-coverage gaps, not missing data (xkom search returns 0 ugreen now).
