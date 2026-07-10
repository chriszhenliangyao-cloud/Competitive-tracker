<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# INIU Competitive Tracker — Cloud App (agent context)

European powerbank competitive-intelligence dashboard for INIU. **This repo is the
Next.js web app** (deployed to Vercel, reads Supabase/Postgres). It is the cloud port of a
local Python scraping + dashboard system. Read this file **and `MEMORY.md`** before working.

---

## Source-of-truth & deploy (read first)
- Two working contexts, don't confuse them:
  - **In the full project** (`~/Desktop/competitive追踪`): the app's canonical source is
    `competitive追踪/web`. Edit there, then `rsync` into this repo clone (`Copetitive-tracker`).
  - **Only this repo cloned from GitHub**: edit it directly and push. But the **pipeline scripts
    (scraping, Supabase push, image upload) are NOT in this repo** — they live in the parent
    project and cannot be run from a repo-only clone. This repo is web app only.
- **Deploy = commit + push this repo** → Vercel (git-connected) builds & deploys. No manual build.
- Local check before pushing: `npm run build` (Next 16.2.9, App Router, Turbopack, React 19).
- `vercel.json` pins `{"framework":"nextjs"}` — **required**; without it Vercel served the root as
  404 (the project's Framework Preset was null). Don't remove it.
- Vercel project `competitive-tracker` (id `prj_qQtx1u1XPYvJVVNdvWVbLfBn8Qy5`, team
  `team_RlytDrz5A1dh3WgC9GFzWXgo`) → live domain **https://iniu-emea-competitive.vercel.app**.
  ⚠️ The old domain `iniu-emea-competitive-tracker.vercel.app` was **renamed away on 2026-07-10**:
  hostnames containing the word **`tracker`** get killed by ad/tracking blocklists (corporate DNS
  filters, uBlock/AdGuard, NextDNS) — the connection is reset before any HTTP response
  (`ERR_CONNECTION_CLOSED`), so it looks like the site is down when it isn't. **Never put `tracker`
  (or `analytics`, `telemetry`, `pixel`) in a public hostname.**
- Auth code uses `window.location.origin`/request origin — no domain is hardcoded, so a domain change
  needs only the Supabase Auth **Site URL + Redirect URLs** updated, not code. Both must be `https://`
  and the exact callback must be allow-listed, or Supabase silently falls back to Site URL and the
  user bounces back to the login page. See "Auth URL configuration" below.
- Supabase project ref `upoyfwfglymcubsuopfn`. See "Pipeline" for the parent-project scripts.

## Architecture
- **Next.js App Router**; every page is `export const dynamic = "force-dynamic"` →
  server-rendered per request, live from Supabase (no static caching of data).
- **All DB reads use the service-role key, server-side only** (`src/lib/supabase.ts`).
  NEVER expose it to the browser; NEVER import that module into a `"use client"` component.
  Env vars (set in Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Data volumes are small (hundreds–few thousand rows) → server fetches everything and ships it
  to a client component that does filtering/search/sort in-browser.
- Prices normalized to **EUR** for comparison via static FX (`src/lib/format.ts`); RRP shown native.
- Writes (Reviews "Resolve", INIU Hide/Unhide, **Library spec edit**) go through **server actions**
  using the service-role client. Library edit (`src/app/library/actions.ts::updateProduct`) writes
  `products` with an **`updated_at` optimistic lock** (a stale edit is rejected, not clobbered) and
  logs before/after to **`audit_events`**; it only touches spec fields (never sku/sku_key/brand
  identity or image_url). Editable fields propagate to every JOINing view via `revalidatePath`.
- **Auth + RBAC** (Google login, `src/lib/access.ts` is the single source of truth):
  - `USERS` maps each of the 7 allowed emails → `{role, countries}`. `ALLOWED_EMAILS` is derived
    from its keys. `role: "admin"` → `countries: null` (sees all); `role: "sales"` → country-scoped
    (ISO-2 list, e.g. Victor FR, Juan ES, Slawomir/Lukasz PL).
  - **Reads use the service-role key → Postgres RLS does NOT apply.** Access control is enforced in
    the app, two layers: (1) **middleware** (`src/lib/supabase/middleware.ts`) blocks the login gate
    AND redirects non-admins away from `ADMIN_ONLY` pages (`/iniu`, `/library`, `/reviews`,
    `/first-pass`); (2) **server-side data filtering** — Dashboard (`/`), Channel (`/channel`),
    Roadmap (`/roadmap`) filter rows to the caller's countries via `getScope()`/`allowsCountry()`
    (`src/lib/scope.ts`) BEFORE shipping props, so the browser never receives other countries' data.
    Sidebar also hides admin-only links for sales (cosmetic; middleware is the real gate).
  - To change who/role/country: edit `src/lib/access.ts` and push. Do NOT try to enforce this with
    RLS policies — service-role bypasses them; keep enforcement in middleware + page filters.

## Pages (and what each reads)
| Route | Purpose | Main tables |
|---|---|---|
| `/` | **Prices by Country** — INIU vs mapped competitors, per-retailer price history + trend; INIU's own price is the first row; hidden pairs filtered out | iniu_products, competitive_links→products, hidden_competitive_links, price_snapshots, iniu_price_snapshots |
| `/channel` | Retailer listings grouped by product; brand/country/retailer/status/magsafe/capacity filters; drill-in price chart | listings, products, price_snapshots |
| `/iniu` | INIU catalogue; click → competitive comparison (General/Price tabs) + INIU own channel price; per-row **Hide/Unhide** curates competitors (writes `hidden_competitive_links`, "Show hidden" toggle) | iniu_products, competitive_links, hidden_competitive_links, price_snapshots, iniu_price_snapshots |
| `/library` | Competitor SKU library (canonical specs) — **editable**: Edit → modal → `updateProduct` (optimistic lock + audit); the single source of truth for specs | products, audit_events |
| `/reviews` | Pending mapping reviews; **Resolve writes back** | mapping_reviews, listings |
| `/first-pass` | Per-channel registry keyed by retailer product code; specs resolved from the mapped `products` (canonical, "Library" badge) with raw scrape fallback ("raw" badge) | first_pass_observations, listings, products |

## FIELD OWNERSHIP — the consistency contract (do not violate)
Every field has ONE home table. Every view JOINs to the home; editing writes the home.
**Never copy a field into a second table** — that is exactly how modules drift out of sync.

| Field class | Home (source of truth) | Edited via |
|---|---|---|
| Competitor specs/identity: capacity, wired_power, wireless_power, usb_ports, size, weight, magsafe, ean, name, rrp, image_url | **`products`** | Library page |
| INIU's own specs | **`iniu_products`** | INIU page |
| Channel mapping & presence: retailer_product_code→SKU, status, first_seen/last_seen/is_active | **`first_pass_observations`** / **`listings`** | First Pass / Reviews |
| Competitor price history | **`price_snapshots`** | not hand-edited (from scrapes) |
| INIU own price history | **`iniu_price_snapshots`** | ingested from INIU channel scrape |
| INIU ↔ competitor links | **`competitive_links`** | INIU review step |
| "Not a real competitor" hide flags | **`hidden_competitive_links`** | INIU page (Hide / Unhide) |

> Hiding, not deleting: the INIU page's per-row **Hide** button does NOT delete the
> `competitive_links` row (that gets rebuilt from the INIU spec by `upload_iniu.py` every run, so a
> delete would come back). It inserts into **`hidden_competitive_links`**; all three read paths
> (home, INIU, Roadmap) filter these pairs out. A "Show hidden (N)" toggle un-hides. This is the
> durable analog of the old local dashboard, whose only *persistent* competitor removal edited the
> INIU spec xlsx directly (its cosmetic "exclude" toggle stored nothing). See MEMORY.md → hide.

> DONE (2026-07-08): the First Pass page no longer displays `first_pass_observations`'s own
> (frozen, legacy) spec columns. It resolves each row to its canonical `products` row the same way
> `map_cycle` does — **primary = the code's `listings.product_id`** (the mapping outcome), secondary =
> exact SKU for legacy rows with no listing — and shows those specs (badge "Library"); unmapped codes
> fall back to the raw scrape (badge "raw"). So a Library edit propagates to First Pass instantly. The
> legacy spec columns remain in the table but are only the unmapped fallback; `map_cycle` never writes
> them. (Do not re-point First Pass at its own spec columns.)

## Supabase — key tables
`brands, retailers, categories` (dimensions) · `products` (competitor library) ·
`iniu_products` (INIU catalogue) · `listings` (retailer listings, FK product_id) ·
`price_snapshots` (per listing×date) · `first_pass_observations` (registry per retailer×code:
first_seen/last_seen/is_active, partial-unique on (retailer_id, retailer_product_code)) ·
`mapping_reviews` (review queue; cloud rows use source_file='cloud'; a BEFORE INSERT trigger
`trg_mapping_reviews_dedupe_pending` enforces **at most one PENDING review per listing** — a second
pending insert for the same listing is silently skipped, so an unreviewed listing can't pile up a
review row every cycle) ·
`competitive_links` (iniu↔competitor) · `hidden_competitive_links` (human hide-list masking
competitive_links pairs at read time; see Field-ownership note) ·
`iniu_price_snapshots` (INIU own per retailer×date) ·
`raw_scrape_rows` (Model B staging) · `brand_retailer_targets` (**which retailer×brand to scrape** —
add/remove a channel by toggling `is_enabled` here; `run_scrape_raw.py` reads it) ·
`import_runs` / `import_files` / `audit_events` (audit is empty; editing will write it).
- Legacy views `v_dashboard_latest`, `v_dashboard_history`, `v_review_queue`,
  `v_iniu_competitive_matrix` exist from the initial schema but the app does **NOT** use them
  (it queries base tables directly). Safe to ignore / eventually drop.
- RLS is ON everywhere and **locked down (2026-07-08)**: the broad `authenticated`/`anon` policies
  were DROPPED, so no anon or authenticated role can read/write any table or view directly (verified
  0 rows for both). The ONLY data path is the **service-role** client (server-side, behind the
  email-allow-list middleware). Do NOT re-add `to authenticated`/`to anon` policies — that reopens a
  direct-REST hole that bypasses the app gate. Views use `security_invoker=on` so base-table RLS applies.

## How to run locally → upload competitive data to cloud (operator runbook)
All pipeline scripts run from the **parent project root** (`~/Desktop/competitive追踪`), not this
web repo. They auto-read the Supabase URL from `web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`); the
only secret you must supply is the **service-role key** (never in git, never in the browser):

```bash
cd ~/Desktop/competitive追踪
export SUPABASE_SERVICE_ROLE_KEY=<service_role secret>   # from Supabase → Settings → API
# From mainland China, ensure Clash routes supabase.co through a node first (else uploads hang).
```

**Model B (target flow — scrape raw, map in the cloud):**
```bash
# 1. Dry-run first: scrape the enabled targets, print counts, write nothing.
python3 channel/run_scrape_raw.py --dry-run
# 2. Real run: scrape → insert raw_scrape_rows → call map_cycle() in Postgres.
python3 channel/run_scrape_raw.py                      # optional: --retailer fnac --brand belkin
# 3. Review whatever landed in mapping_reviews via the /reviews page (writes back to cloud).
```
Targets come from the `brand_retailer_targets` table (toggle `is_enabled` to add/remove a channel).
`--date YYYY-MM-DD` overrides the cycle date; `--no-map` uploads raw without mapping.
**Partial-scrape circuit breaker**: before upload/map, `run_scrape_raw` compares each
(retailer,brand)'s scraped count to last cycle's active count and **holds back any pair that scraped
abnormally short** (< 50% of prior when prior ≥ 6) so a blocked/partial scrape can't falsely delist
its codes via map_cycle. A held-back pair is logged and simply not updated this cycle (recovers next
full run). If a channel genuinely dropped a lot, re-run with `--force` to push it through.
**Incremental upload + resume**: rows are uploaded **per retailer as it finishes** (not all at the
end), so a crash keeps what's already uploaded. Re-running **auto-resumes** today's unfinished run —
it skips pairs already uploaded and finishes the rest, then maps once over the whole run. Use
`--fresh` to start a brand-new run instead of resuming.

**Model A (current/legacy flow — map locally, then push mapped files):**
```bash
python3 channel/run_mapped_all.py                       # scrape + map locally → output/channel_mapped/*.xlsx
python3 cloud/pipeline/validate_sync.py                 # read-only gate: cloud vs local, no writes
python3 cloud/pipeline/push_to_supabase.py              # DRY-RUN preview (default, no --write)
python3 cloud/pipeline/push_to_supabase.py --write --all-history   # actually upsert listings/prices/library/first-pass
python3 cloud/pipeline/upload_images.py --write --no-upload        # link Storage images for any NEW rows
python3 cloud/pipeline/upload_iniu.py --write                      # INIU images + competitive_links
```
Every write script is **dry-run by default** — add `--write` only after the dry-run/validate looks right.
The web app reads Supabase live, so a successful push shows up on the site immediately (no redeploy).

## Pipeline scripts (parent project; run locally with `SUPABASE_SERVICE_ROLE_KEY`)
- `channel/run_scrape_raw.py` — **Model B**: scrape raw → `raw_scrape_rows` → rpc `map_cycle`.
- `channel/run_mapped_all.py` / `run_mapped.py` — legacy local scrape + map → mapped xlsx.
- `cloud/pipeline/push_to_supabase.py` — push local mapped/library/first-pass → Supabase.
  **Deliberately does NOT push image_url** (owned by upload_images). Flags: `--write --scope all --all-history`.
- `cloud/pipeline/upload_images.py` — local PNGs → Storage; rewrites products/first_pass/reviews image_url.
  `--no-upload` (DB-only, files already in Storage), `--reviews-only`, `--report`.
- `cloud/pipeline/upload_iniu.py` — INIU embedded images → Storage + populate `competitive_links`.
- `cloud/pipeline/validate_sync.py` — read-only cross-check cloud vs local mapped files (gate before writes).
- `cloud/pipeline/pull_reviews.py` — (Model A, being retired) export cloud review decisions → local workbook.
- **INIU own prices** (`iniu_price_snapshots`) have their OWN lane — INIU is our own brand and never
  goes through competitor mapping:
  - `channel/run_iniu_prices.py` — scrape the 6 INIU channels (price-only) → `output/iniu_output/channel_powerbanks_iniu_<date>.csv`.
  - `cloud/pipeline/push_iniu_prices.py` — ingest that CSV → `iniu_price_snapshots`. Identity cascade
    (no fuzzy): `(retailer_key, retailer_product_code)` → EAN fallback → else UNMATCHED report.
    Bridge bootstrapped from `channel/iniu_code_map.json` + `iniu_ean_map.json`, and extended from
    cloud MEMORY (existing snapshots) at runtime. Dry-run by default; `--write` to upsert.
  - PowerPaw / P41L rows show as UNMATCHED until those products are added to `iniu_products` + the bridge.
- **After a `push_to_supabase --write` that adds NEW products/first_pass rows**, re-run
  `upload_images.py --write --no-upload` (links their Storage images) + `upload_iniu.py --write`.
  (Existing image_url is preserved by push; only new rows start null.)

## map_cycle (cloud mapping engine — SQL function)
`map_cycle(run_id)` resolves each `raw_scrape_rows` row → status. Precedence:
**MEMORY (listings/first_pass code→name cascade, human-verified wins) > PAGE-SKU exact library
hit (`Scrape SKU (library hit)`) > new_listing**. Upserts `listings` + `price_snapshots` +
`first_pass` registry; auto-resolves reviews when a listing maps; creates `mapping_reviews`
(source_file='cloud') for new/library-missing; marks `is_active=false` (delisted) for
first_pass rows whose last_seen didn't advance. Strictly exact matching — **no fuzzy**.
- **Own-brand guard**: `map_cycle` skips `brand_key='iniu'` entirely (returns `own_brand_skipped`
  count) — INIU never creates competitor listings/reviews. Its prices go via `push_iniu_prices.py`
  → `iniu_price_snapshots`. Delisted-detection also excludes iniu. (Fixed 2026-07-07 after INIU rows
  were wrongly auto-mapped into the review queue.)

## Core rules (don't relearn)
- **SKU = product identity; Retailer Product Code = channel identity; EAN = metadata.**
- **No fuzzy matching** — unresolved rows → `new_listing` for manual review.
- **First-party only** (marketplace filtered inside the scrapers, not the mapper).
- Images: permanent images live in **Supabase Storage** (`product-images/<brand>/<sku|ean>.png` from
  the pipeline; `product-images/cloud/<id>-<ts>.<ext>` for dashboard uploads); retailer CDN URLs are
  transient fallbacks (a broken one usually means the product delisted).
- **Library image upload**: the Library editor can upload a screenshot/photo per product
  (`uploadProductImage`) → Storage `cloud/` namespace → sets `products.image_url` + `image_path`.
  So `image_url` now has a SECOND writer (the dashboard) besides `upload_images.py`. Under Model B
  that's fine; the guardrail is the same as products specs — do NOT run Model-A `upload_images.py`,
  it could overwrite cloud-uploaded URLs.

## Gotchas
- **Supabase free tier auto-pauses after ~7 days idle.** A paused project loses its DNS →
  Vercel serverless throws `ENOTFOUND upoyfwfglymcubsuopfn.supabase.co` → whole site 500s. Fix:
  Restore in Supabase; if Vercel still 500s, redeploy to clear the cached DNS failure. Consider Pro.
- From mainland China, `*.vercel.app` and `supabase.co` need the local proxy (Clash) to route those
  domains through a node, else `ERR_CONNECTION_CLOSED` / blocked uploads. **Also `accounts.google.com`
  is fully blocked in China** — since sign-in is Google OAuth, a China-based user can NEVER log in
  without a proxy, no matter the domain. (Switching to Supabase email/magic-link auth would remove
  that dependency; not done.)
- **Auth URL configuration** (Supabase → Authentication → URL Configuration). Getting this wrong makes
  login "succeed" then bounce straight back to the login page — because Supabase silently ignores an
  un-allow-listed `redirect_to` and falls back to Site URL (no `?code=`, so no session):
  - **Site URL**: `https://iniu-emea-competitive.vercel.app` — must be `https`, no trailing slash, no wildcard.
  - **Redirect URLs** must include the exact callback the app sends (`${origin}/auth/callback`):
    `https://iniu-emea-competitive.vercel.app/auth/callback`, plus `https://iniu-emea-competitive.vercel.app/**`
    and `http://localhost:3000/auth/callback` for local dev.
  - Entries with no scheme (`iniu-emea-competitive.vercel.app`) or the wrong scheme (`http://…`) are
    silently invalid. Google Cloud Console needs **no** change on a domain rename — Google always calls
    back to `https://upoyfwfglymcubsuopfn.supabase.co/auth/v1/callback`, never your domain.
  - Never allow-list `https://*.vercel.app/**` — any vercel.app site could then receive your auth code.
- `push_to_supabase` intentionally does not manage `image_url`; that column is owned end-to-end by
  `upload_images.py`. Do not add it back to the push payload.
