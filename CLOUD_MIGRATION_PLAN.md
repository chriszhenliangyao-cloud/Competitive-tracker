# Competitive Tracker 上云整体规划

> 目标：把 INIU 欧洲竞品追踪从「纯本地」升级为「本地抓取 + 云端存储/展示」。
> 本轮范围：**charger 先行上云**；powerbank 暂留本地（schema 已为多品类预留，后续平移）。
> 抓取继续在 Mac 本地跑，云端只负责**存数据 + 出看板**。
>
> 决策记录（本次确认）：① 本轮只交付规划文档 · ② 只做 charger 上云 · ③ 抓取留本地，云端只存+展示。

---

## 0. 一页速览

```
┌─ 本地（Mac）─────────────────┐      ┌─ 云端 ──────────────────────────┐
│ Playwright + CloakBrowser    │      │ Supabase「Copetitive-tracker」  │
│ run_first_pass / run_mapped  │      │  ├ Postgres（产品库/listing/快照）│
│        ↓ 产出 CSV + 图片      │ push │  ├ Storage（商品图，永久 URL）    │
│ push_to_supabase.py ─────────┼──────┼─→├ Auth（邮箱登录 + 白名单）       │
└──────────────────────────────┘      │  └ RLS（白名单只读 + 网页审核写）  │
                                       │              ↑ 公开 anon key      │
                  GitHub「Copetitive-tracker」 ──→ Vercel 自动部署          │
                     web/ 静态前端  ──────────────→ index.html 看板         │
                                                    review.html 审核        │
                                       └─────────────────────────────────┘
```

核心判断：**抓取永远不上 Vercel**。Vercel 是 serverless，跑不动 Playwright + CloakBrowser
（~200MB Chromium 二进制、DataDome 反爬、长时任务、headed 浏览器）。所以分三层：
本地抓取 → push 桥接 → 云端（DB + 静态看板）。这也正是 `插头/cloud` 已经搭好的形态。

---

## 1. 现状盘点（规划的起点）

### 1.1 Powerbank 本地流程（作为 charger 的参照样板）

完整链路四步，charger 要在云端复刻的就是这套逻辑：

| 阶段 | 脚本 | 做什么 | 产出 |
|---|---|---|---|
| ① 首跑（重，按新品牌/渠道一次性） | `channel/run_first_pass.py` | 深度抓全字段（规格/图/EAN…） | `output/channel_first_pass/<retailer>/<brand>/*.xlsx` |
| ② 周度（轻） | `channel/run_mapped_all.py` | 只抓价/促/库存，并映射到已标定 SKU | `output/channel_mapped/<retailer>/<brand>/*.xlsx,csv` |
| ③ 映射 | `mapped_output.py` | **精确**匹配 SKU / EAN，绝不模糊；解析不了 → "New Listing" | mapped 表 + report |
| ④ 审核 + 看板 | `apply_mapping_review.py` → `dashboard/server.py` | xlsx 审核工作簿回填 → Flask 看板（localhost:8080） | 本地 HTML 看板 |

数据铁律（云端原样继承）：
- **SKU = 产品身份 · 零售商商品码 = 渠道身份 · EAN = 对账元数据**
- **不做模糊匹配**，解析不了进人工审核
- **只第一方**（过滤 marketplace）
- 稳定规格/图来自产品库，不每次重猜
- Fnac 走 CloakBrowser 过 DataDome（`config.CLOAK_RETAILERS = {"fnac"}`）

本地这套的几个痛点，正是上云要顺手解决的：
- 上看板靠改 `generate_dashboard.py` 里**硬编码 BRANDS 列表** → 云端用 `category_brands.is_active` 数据驱动
- 审核靠 **xlsx 工作簿**（且默认指向 2026-05-11 的陈旧文件，易踩坑）→ 云端用 `review.html` 直接写库
- INIU 竞品对标**手填** → 云端用 `competitive_links` 表手工维护（保留人工，但进库）

### 1.2 云端基础（已建好的部分，别重复造）

`插头/cloud/` 里 charger 上云的骨架其实已经搭起来了，且**线上是活的**：

- **Supabase 项目**：`Copetitive-tracker`（ref `upoyfwfglymcubsuopfn`，区域 eu-west-1，状态 ACTIVE）
- **Schema v2 已部署且空表就绪**：`categories`(已种2行) `brands` `category_brands` `retailers`
  `products` `listings` `price_snapshots` `competitive_links` `jobs` `allowed_emails`(已种 owner 邮箱)。
  全部开了 RLS，视图 `v_dashboard` / `v_review` 已建。
- **桥接脚本**：`插头/cloud/pipeline/push_to_supabase.py`，含「防覆盖三原则」。
- **前端**：`插头/cloud/web/index.html`（看板）+ `review.html`（审核）+ `config.js`（已填 publishable key）。
- **charger 首跑数据已存在**：`插头/output/*/channel_chargers_<brand>_20260514.csv`，正好是 push 脚本认的命名。

### 1.3 还差什么（本规划要补齐的缺口）

1. **GitHub 仓库是空 clone**（只有 `.git` + 一行 `.gitignore`）——结构/代码/README 都还没进去。
2. **Vercel 尚未部署**——前端还没接上线。
3. **Supabase 里没有业务数据**——push 还没真正跑过（products/listings/snapshots 全 0 行）。
4. **`插头/product_library/` 是空的**——但注意：云端设计里 canonical 产品库**直接落在 Supabase `products` 表**
   （push 从抓取 CSV 建档），本地不再依赖产品库文件，这个"空"在云端路线下不阻塞。

---

## 2. 目标架构（charger）

### 2.1 三层职责

| 层 | 跑在哪 | 组件 | 职责 |
|---|---|---|---|
| 抓取层 | Mac 本地 | Playwright + CloakBrowser，`插头/channel/run_all.py` | 抓 charger，产 CSV + 图片 |
| 桥接层 | Mac 本地（手动跑） | `cloud/pipeline/push_to_supabase.py --category charger` | CSV/图 → Supabase，幂等可重跑 |
| 云端层 | Supabase + Vercel | Postgres / Storage / Auth / 静态前端 | 存数据、出看板、网页审核、白名单登录 |

### 2.2 防覆盖三原则（push 脚本的承诺，照搬到 charger）

库是唯一真相，文件只进不出：

1. **products 只增不改**——审核补全的规格/图片，下次抓取**绝不冲掉**（图片只在为空时补）。
2. **listings 只增 + 刷 `last_seen`**——`status`/`product_id`/`reviewed_*`/`mapping_method` 只有人能改。
3. **price_snapshots 按 (listing, date) 幂等 upsert**——同日重跑安全，历史只增。

### 2.3 映射规则（与 powerbank 一致，不模糊匹配）

- 新 listing 带厂商 SKU → 建/关联 product，`status='mapped'`，`mapping_method='sku_exact'`
- 新 listing 无 SKU → `status='new_listing'`，等 `review.html` 人工裁决
- 品牌数据齐了，**手动**置 `category_brands.is_active=true` 才上看板（替代硬编码 BRANDS）

---

## 3. GitHub 仓库规划（Copetitive-tracker）

### 3.1 建议目录结构（charger 上云，monorepo 预留多品类）

```
Copetitive-tracker/
├─ README.md                  # 平台说明 + 周度操作 + 部署步骤
├─ CLOUD_MIGRATION_PLAN.md    # 本文档
├─ .gitignore                 # 见 3.2
├─ .env.example               # 列出需要的环境变量名（无真实值）
├─ cloud/
│  ├─ migrations/             # 002_platform_v2.sql（当前 schema，001 已废弃）
│  ├─ pipeline/
│  │  └─ push_to_supabase.py  # 本地→云桥接
│  └─ web/                    # ← Vercel Root Directory 指向这里
│     ├─ index.html           # 看板
│     ├─ review.html          # 网页审核
│     └─ config.js            # 只放 publishable key（公开，安全靠 RLS）
└─ charger/                   # charger 抓取代码（从「插头」迁入并改英文名）
   ├─ channel/                # scrapers + run_all + config
   └─ docs/                   # charger 运维记录
```

迁移要点：把 `插头/`（中文名，git/CI/URL 都会出问题）内容平移成英文 `charger/`，
`cloud/` 提到仓库顶层（它本就是跨品类的）。powerbank 代码**本轮先不进仓库**（决策②）。

### 3.2 `.gitignore`（关键：数据和密钥不进 git）

```
.DS_Store
.env
*.env
__pycache__/
*.pyc
# 抓取产出与图片：体积大且是「派生数据」，云端真相在 Supabase
output/
*.xlsx
*.csv
channel_product_images/
# 本地缓存/浏览器
.playwright-mcp/
*.db
```

只提交**代码、schema、前端、文档**。抓取结果（CSV/图/xlsx）和 SQLite 缓存不进 git——
它们要么是派生数据，要么唯一真相已在 Supabase。

### 3.3 密钥纪律（务必）

- `config.js` 里的 **publishable / anon key 可以进仓库**（公开 key，安全由 RLS 保证）。
- **`SUPABASE_SERVICE_KEY`（service_role）永远不进 git、不进前端**——只在本地 push 时
  `export` 到环境变量。一旦泄露等于绕过所有 RLS。
- `.env.example` 只写变量名占位，真实 `.env` 被 ignore。

### 3.4 push 工作流

```bash
cd Copetitive-tracker
git add -A && git commit -m "..." && git push   # 推到 GitHub → Vercel 自动部署 web/
```

前端纯静态、无构建步骤，每次 push web/ 下文件改动即触发 Vercel 重新部署。

---

## 4. Supabase 规划

### 4.1 已就绪，无需重建

Schema v2（`cloud/migrations/002_platform_v2.sql`）已部署。关键设计：
- `categories` 维度从第一天就在 → charger / powerbank 共表，未来 powerbank 平移零改表。
- `products.specs jsonb` 兜底品类特有字段，避免日后频繁改表。
- `retailers.channel_type`（retail / dtc）区分渠道与品牌官网。
- 视图 `v_dashboard`（mapped + 品牌已激活）、`v_review`（待处理 new_listing）前端直接读。

### 4.2 Storage 与 Auth

- **Storage bucket `charger-images`**（多品类共用，路径前缀 `{category}/{brand}/{sku}.png` 区分），
  公开读，永久 URL；push 脚本只在缺图时上传。
- **Auth**：邮箱登录（magic link / OTP）。`allowed_emails` 白名单 + `is_allowed()` 函数做闸门，
  RLS 保证「白名单邮箱只读 + 可做网页审核写」，匿名/非白名单看不到数据。
  加人：`insert into allowed_emails (email, note) values ('xxx@yyy', '备注');`

### 4.3 运维 SQL 备忘

```sql
-- 品牌数据齐了，上看板：
update category_brands set is_active = true
 where brand_id  = (select id from brands where key='anker')
   and category_id = (select id from categories where key='charger');
```

---

## 5. Vercel 部署规划

1. Vercel 导入 GitHub 仓库 `Copetitive-tracker`。
2. **Root Directory = `cloud/web`**，Framework = Other，**无构建命令**（纯静态）。
3. 无需配 env（前端只用公开 key，写在 `config.js`）。
4. Supabase Auth 里把 Vercel 域名加进 **Redirect URLs / Site URL**，magic link 才能跳回。
5. 之后每次 `git push` 改动 `cloud/web/` → 自动重新部署。

---

## 6. 分阶段路线图（charger 上云）

> 全程「抓取留本地、云端只存+展示」，每阶段都可独立验收。

**Phase 0 — 仓库落地**（先做）
把 `插头/` 平移为英文 `charger/`、`cloud/` 提顶层、写 README + `.gitignore` + `.env.example`，
首次 commit & push。验收：GitHub 上能看到干净结构，无数据/无密钥。

**Phase 1 — 打通一条 charger 数据上云**
本地已有 `channel_chargers_*_20260514.csv`，直接：
```bash
export SUPABASE_SERVICE_KEY='<service_role secret>'
python3 cloud/pipeline/push_to_supabase.py --category charger --dry-run   # 先看数量
python3 cloud/pipeline/push_to_supabase.py --category charger             # 实推
```
验收：Supabase `products/listings/price_snapshots` 有数据，Storage 有图。

**Phase 2 — 前端上线**
按第 5 节部署 Vercel + 配 Auth 域名。验收：白名单邮箱登录后能看到 charger 看板。

**Phase 3 — 激活 + 审核闭环**
`review.html` 清掉 new_listing（填 SKU 直接写库）→ 品牌数据齐 → `category_brands.is_active=true`
上看板 → 手工维护 `competitive_links` 做 INIU 对标。验收：看板呈现已激活品牌 + 周环比。

**Phase 4 — 周度操作固化**
形成周度 SOP：本地 `run_all`（charger）→ `push_to_supabase.py --category charger` →
线上 review 清单 → 看板查环比。写进 `charger/docs/RUNBOOK_weekly.md`。

**Phase 5（以后，非本轮）**
- powerbank 平移上云（schema 已支持，主要工作：把 powerbank 的 xlsx 产出适配 push 的 CSV 读取）。
- `jobs` 表驱动「看板一键 Run All」：Mac 常驻 runner 轮询 jobs → 跑 run_all → 回写进度，迈向半自动。

---

## 7. 风险与已知坑

| 风险/坑 | 说明 | 对策 |
|---|---|---|
| service_role key 泄露 | 绕过全部 RLS，等于数据库裸奔 | 只在本地 env；绝不进 git/前端；`.gitignore` 兜底 |
| 中文目录名「插头」 | git/Vercel/URL 对非 ASCII 路径易出问题 | 迁移时改英文 `charger/` |
| powerbank 产出是 xlsx，push 读 CSV | `CSV_PATTERN` 有 powerbank 正则，但 powerbank 实际存 xlsx | 本轮不涉及；Phase 5 迁移时加 xlsx 读取或导出 CSV |
| `product_library` 空 | 本地 charger 产品库目录为空 | 云端 canonical 库在 Supabase `products`，由 push 从抓取 CSV 建档，不阻塞 |
| 误以为要重建 schema | v2 已部署 | 别重跑建表；只在改结构时新增 migration 文件 |
| 上看板忘了激活 | 数据进库但 `is_active=false` 看板不显示 | 牢记激活 SQL（第 4.3 节）是上看板最后一步 |
| 抓取想搬上 Vercel | serverless 跑不动 Playwright/CloakBrowser/DataDome | 架构上明确：抓取永远本地 |
| Fnac DataDome | 仅本地 CloakBrowser 能过 | 维持本地抓取，与上云解耦 |

---

## 8. 下一步

本轮交付为规划文档。批准后建议从 **Phase 0（仓库落地）** 起步——风险最低、且能立刻让
`插头/cloud` 的既有成果进入可 git push、可被 Vercel 拉取的状态。需要我开始时告诉我即可。
