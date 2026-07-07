# Model B 迁移 — step-by-step 优化方案

目标:从 **Model A(本地是大脑,云端只展示)** 迁到 **Model B(云端是大脑+唯一真相,本地只抓原始)**,
最终释放本地磁盘。架构/流程背景见 `AGENTS.md`,状态/决策见 `MEMORY.md`。

**方法论:单次实验、层层验证。** 不做多周期并跑;每一步先证明一件事,产出即下一步的输入,
上一步不达标不进下一步。任何写操作**默认 dry-run,核对无误才 `--write`**。

前置(每次开跑):
```bash
cd ~/Desktop/competitive追踪
export SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
# 国内先让 Clash 把 supabase.co 走节点
```

---

## Stage A — 实验一:本地数据能否「完整」推送到云端
证明 Model A 的推送链路把本地成品**一比一**灌进云端,无丢行、无丢图。这是 Model B 的地板:
连全量推送都不完整,谈不上让云端当真相。

- **A1 · 预演核对** — `python3 cloud/pipeline/push_to_supabase.py`(默认 dry-run)
  - 看输出的将写行数(listings / price_snapshots / library / first_pass)。
  - ✅ 通过标准:预演数字和本地 `output/channel_mapped/` 里的行数吻合,无报错。
- **A2 · 全量写入** — `python3 cloud/pipeline/push_to_supabase.py --write --all-history`
  - `--all-history` = 推所有历史 mapped 文件,不只最新,价格曲线才有历史。
- **A3 · 一比一核对** — `python3 cloud/pipeline/validate_sync.py`(只读)
  - 云端 listings / price 日期数 / library / first_pass 计数 == 本地。
  - ✅ 通过标准:validate 无非键错误;差异要么为 0,要么能解释(如本地已知重复)。
- **A4 · 补图** — `python3 cloud/pipeline/upload_images.py --write --no-upload`(图已在 Storage)
  再 `python3 cloud/pipeline/upload_iniu.py --write`。
  - ✅ 通过标准:网站每页缩略图覆盖率回到基线(~80% listing 级),无整片 N/A。

**Stage A 出口(=Stage B 入口):** 云端是本地的忠实镜像,且网站读得到、显示正常。
只有确认「推送本身完整」,后面 raw→map 的 diff 才有可信基准线对拍。

---

## Stage B — 实验二:一个周期能否「raw 上云 → 云端 map」
证明 Model B 的新链路(本地只抓 → `raw_scrape_rows` → `map_cycle` 云端映射)结果**与本地映射一致**。
只做**一次**,且刻意选一个**已验证过的小 scope**(elcorteingles / belkin,map_cycle 已在它上面跑通),
把变量降到最低。

- **B0 · 连接自检** — 用上面已打通的代理,`run_scrape_raw.py --dry-run` 能连云、能列出 enabled targets。
  - ✅ 通过标准:dry-run 打印出目标清单,不报连接错。
- **B1 · 空跑看抓取量** — `python3 channel/run_scrape_raw.py --retailer elcorteingles --brand belkin --dry-run`
  - ✅ 通过标准:抓取行数 **>0 且量级合理**(和 Stage A 里同 scope 的行数同数量级)。
    ⚠️ 若为 0 → 是抓取被拦,不是没数据,**停,别继续**(否则会误判全线下架)。
- **B2 · 只传 raw,先不 map** — 同命令去掉 `--dry-run`、加 `--no-map`
  - 核对 `raw_scrape_rows`(本 run_id)行数 == B1 抓取数。
  - ✅ 通过标准:raw 入库无丢行,run_id 隔离干净。
- **B3 · 触发云端映射** — 对该 run_id 调用 `map_cycle()`(或去掉 `--no-map` 重跑一轮)。
  - 看 `mapping_reviews`(source_file='cloud')、`listings`、`price_snapshots` 变化。
- **B4 · 单次 diff 对拍** — `map_cycle` 输出 vs **同 scope 的本地 mapped 文件**,逐 SKU/价格/状态比。
  - ✅ 通过标准(实验的最终验收):**diff = 0**,或每条差异都能解释(如新的更准)。

**Stage B 出口:** 一个真实周期证明「本地抓 → 云端 map」= 本地映射。云端大脑可信。
未通过就回到 map_cycle / scraper 修,不进 Stage C。

---

## Stage C — 实验通过后再补「自动化内功」(把人肉质检翻译成系统)
Stage A/B 是人在旁边盯着核对;要日常无人值守跑,必须把这些校验固化进系统。**这是 cutover 的前提,不是收尾。**

- **C1 · `scrape_runs` 运行台账** — 每次跑开一条 run(run_id、时间、状态、每 target 行数、错误)。
  失败可按 run_id 整批清 raw 重跑(幂等)。取代现在裸整数 run_id(还留着 run_id=1 测试行)。
- **C2 · 0 行熔断(最高优先级安全阀)** — 某 (retailer,brand) 本轮 0 行但历史有 N 行 →
  记 `scrape_failed`,`map_cycle` **跳过该 scope 的下架检测**。杜绝「一次抓取事故 = 全线误判下架」。
- **C3 · map_cycle 回归夹具** — 留 2–3 组 golden 输入;改 SQL 前后跑一遍,防回归。

**Stage C 出口:** 换任意 scope 无人值守跑,坏 target 会被熔断而非污染数据。

---

## Stage D — 切换 + 释放本地磁盘(不可逆,放最后)
- **D1 · B 升主流程,A 留一轮兜底** — 一个完整周只用 `run_scrape_raw`;`run_mapped_all`/`push` 暂不删。
- **D2 · 稳定后 A 转 legacy** — 旧脚本标注废弃,不再日常用。
- **D3 · 先归档、验证、再删** — `output/` + `product_library/` + `INIU/` → 外部盘/Storage 冷桶,
  **校验 checksum 可还原**,才 `rm`。本地只剩代码 + `.env.local`。
- **D4 · cutover 清理** — 清旧文件版 `mapping_reviews`(`source_file <> 'cloud'`)、
  `raw_scrape_rows` 的 run_id=1 测试行。

**Stage D 出口:** 本地磁盘释放;重装机器也能从云端+归档恢复。

---

## 并行收尾(不卡主线,任意阶段可做)
- `push_iniu_prices.py`(INIU 价格目前仍是手写 SQL)
- 编辑 UI(Library / First Pass / INIU,已设计未建)
- Google 登录(@iniushop.com);在此之前用 Vercel Deployment Protection 顶
- 删 4 个未使用的 `v_*` 视图

## 依赖链(一句话)
A 完整推送 → 才有可信基准 → B 单周期 raw→map diff=0 → 才敢信云端大脑 →
C 补熔断/台账 → 才敢无人值守 → D 切换并「验证可还原后」删本地。
**A/B 没扎实,D 就是在裸奔上删数据。**
