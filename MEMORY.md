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

## Other key decisions
- **Reads via service-role, server-side.** RLS blocks anon; service role bypasses. Pages force-dynamic.
- **push_to_supabase does NOT own image_url** — removed from its upsert payload so re-imports never
  clobber the Storage URLs written by `upload_images.py`. (Fixed after an all-history push wiped images.)
- **Prices shown in EUR** (static FX); RRP native. INIU own price also EUR.
- **Field ownership contract** (see AGENTS.md) — added specifically to prevent cross-module drift
  when editing is introduced.
- INIU price data (`channel_powerbanks_iniu_*.csv`) mapped to catalogue by SKU + product-name color
  parsing (BK/negra=Black, Tytanowy=Natural Titanium, Beżowy→White, Coolblue P76=Black, etc.);
  PowerPaw/P41L-P1 skipped (not in catalogue — user to create). **Loaded ad-hoc via SQL — no
  `push_iniu_prices.py` script yet** (TODO); re-doing this for a new CSV means re-running that SQL.

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
5. Missing scripts/tidy: write `push_iniu_prices.py` (INIU price load is ad-hoc SQL today); drop the
   4 unused `v_*` views eventually; clear the ~9 test rows in `raw_scrape_rows` (run_id=1).

## Data-quality notes
- Some INIU SKUs list twice at one retailer (e.g. komputronik P64-P1) → unique (product,retailer,date)
  keeps one. 16 competitor SKUs have no specs (mostly review-added) — fill via Library editing.
- 6 competitor pairs share a Storage image = duplicate SKU/EAN in the source library (worth merging).
- The global audit confirmed the DB faithfully mirrors local; "stale" pairs (e.g. xkom/ugreen last_seen
  2026-05-20) are scraping-coverage gaps, not missing data (xkom search returns 0 ugreen now).
