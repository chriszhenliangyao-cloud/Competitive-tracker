-- ============================================================
-- Competitive Intelligence Platform — 权威 schema（live DB 的唯一真相）
-- 项目：Supabase「Copetitive-tracker」 ref=upoyfwfglymcubsuopfn (eu-west-1)
-- 等价于已应用迁移：002_platform_v2_multicategory + 003_cleanup_and_harden
-- 多品类：charger 先行，powerbank 后续迁入（categories 维度第一天就在，平移零改表）。
-- 铁律：SKU=产品身份 · 渠道码=渠道身份 · EAN=元数据 · 不模糊匹配 · 只第一方
-- 全量重建用；线上已是此状态，重跑前请确认确实要清空。
-- ============================================================

-- ---------- 清理（重建时用）----------
drop view if exists v_dashboard;
drop view if exists v_review;
drop table if exists jobs cascade;
drop table if exists competitive_links cascade;
drop table if exists price_snapshots cascade;
drop table if exists listings cascade;
drop table if exists products cascade;
drop table if exists category_brands cascade;
drop table if exists retailers cascade;
drop table if exists brands cascade;
drop table if exists categories cascade;
drop table if exists allowed_emails cascade;
drop type if exists mapping_status cascade;
drop function if exists is_allowed() cascade;
drop function if exists rls_auto_enable() cascade;   -- 历史遗留，确保不复活

-- ---------- 1. 维度 ----------

create table categories (
  id      bigint generated always as identity primary key,
  key     text not null unique,        -- 'charger', 'powerbank'
  display text not null
);
insert into categories (key, display) values
  ('charger', 'Chargers'), ('powerbank', 'Power Banks');

create table brands (
  id      bigint generated always as identity primary key,
  key     text not null unique,        -- 'anker', 'fresh-n-rebel'（小写含连字符）
  display text not null,
  is_own  boolean not null default false   -- INIU 自有品牌标记
);

-- 品牌×品类激活闸门：数据齐(library+mapping 完成)才置 true，看板才显示。
-- 取代 powerbank 时代 generate_dashboard.py 的硬编码 BRANDS 列表。
create table category_brands (
  category_id bigint not null references categories(id),
  brand_id    bigint not null references brands(id),
  is_active   boolean not null default false,
  primary key (category_id, brand_id)
);
create index category_brands_brand_idx on category_brands(brand_id);  -- FK 覆盖索引

create table retailers (
  id           bigint generated always as identity primary key,
  key          text not null unique,   -- 'mediaexpert', 'xkom', 'fnac', 'dtc-anker'
  display      text not null,
  country      text not null,          -- DTC 用 '--'
  currency     text not null default 'EUR',
  channel_type text not null default 'retail'
               check (channel_type in ('retail','dtc'))  -- 渠道 vs 品牌官网
);

-- ---------- 2. 产品库（canonical，跨渠道唯一身份）----------

create table products (
  id          bigint generated always as identity primary key,
  category_id bigint not null references categories(id),
  brand_id    bigint not null references brands(id),
  sku         text not null,
  ean         text,
  name        text not null,
  capacity      text,                  -- powerbank：'20000 mAh'
  power         text,                  -- 原始功率串
  power_w       numeric,               -- 解析后最大瓦数（筛选）
  wired_power   text,
  wireless_power text,
  magsafe       boolean not null default false,
  usb_ports     text,
  port_count    int,
  size          text,
  weight        text,
  rrp           numeric,
  rrp_source    text,                  -- RRP 出处（dtc/manual/...）
  is_wireless   boolean not null default false,
  specs         jsonb not null default '{}',  -- 品类特有字段兜底，避免日后改表
  image_path  text,                    -- Storage: {category}/{brand}/{SKU}.png
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (category_id, brand_id, sku)
);
create index products_ean_idx   on products(ean) where ean is not null;
create index products_cat_idx   on products(category_id);
create index products_brand_idx on products(brand_id);   -- FK 覆盖索引

-- ---------- 3. 渠道 listing（渠道身份 + 映射状态 + 审核审计）----------

create type mapping_status as enum ('mapped', 'new_listing', 'skip');

create table listings (
  id            bigint generated always as identity primary key,
  category_id   bigint not null references categories(id),
  retailer_id   bigint not null references retailers(id),
  brand_id      bigint not null references brands(id),
  retailer_code text not null,
  url           text,
  product_id    bigint references products(id),
  status        mapping_status not null default 'new_listing',
  mapping_method text,                 -- 'sku_exact' / 'ean' / 'manual_review'
  raw_name      text,
  raw_sku       text,
  raw_ean       text,
  first_seen    date not null default current_date,
  last_seen     date not null default current_date,
  reviewed_by   text,                  -- 审核人邮箱（网页审核写入）
  reviewed_at   timestamptz,
  unique (retailer_id, retailer_code)
);
create index listings_status_idx  on listings(category_id, status);
create index listings_product_idx on listings(product_id);
create index listings_brand_idx   on listings(brand_id);   -- FK 覆盖索引

-- ---------- 4. 周度价格快照（只增不改）----------

create table price_snapshots (
  id           bigint generated always as identity primary key,
  listing_id   bigint not null references listings(id),
  scraped_date date not null,
  price        numeric,
  promo_price  numeric,
  currency     text not null default 'EUR',
  in_stock     boolean,
  seller       text,
  unique (listing_id, scraped_date)
);
create index snapshots_date_idx on price_snapshots(scraped_date);

-- ---------- 5. INIU 竞品对标（手工维护，只增删不批量覆盖）----------

create table competitive_links (
  id            bigint generated always as identity primary key,
  iniu_product  bigint not null references products(id),
  rival_product bigint not null references products(id),
  note          text,
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (iniu_product, rival_product)
);
create index competitive_links_rival_idx on competitive_links(rival_product);  -- FK 覆盖索引
-- 注：iniu_product 已被 unique(iniu_product, rival_product) 最左列覆盖

-- ---------- 6. 任务队列（V2「看板一键 Run All」预留）----------

create table jobs (
  id           bigint generated always as identity primary key,
  category_key text not null,
  action       text not null,          -- 'run_all' | 'first_pass' | 'push'
  params       jsonb not null default '{}',
  status       text not null default 'queued'
               check (status in ('queued','running','done','failed','cancelled')),
  progress     text,
  log          text,
  requested_by text,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index jobs_status_idx on jobs(status, created_at);

-- ---------- 7. 白名单 + RLS ----------

create table allowed_emails (
  email    text primary key,
  note     text,
  added_at timestamptz not null default now()
);
insert into allowed_emails (email, note) values
  ('chriszhenliang.yao@gmail.com', 'owner');
comment on table allowed_emails is
  '访问白名单。故意不建任何 RLS 策略：客户端永不可直接读取；登录校验通过 SECURITY DEFINER 的 is_allowed() 间接进行。写入仅限 service_role。';

create or replace function is_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_emails
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
-- 收紧执行权限：RLS 策略均为 TO authenticated，匿名/PUBLIC 不需要可执行
revoke execute on function is_allowed() from public;
revoke execute on function is_allowed() from anon;
grant  execute on function is_allowed() to authenticated;

alter table categories        enable row level security;
alter table brands            enable row level security;
alter table category_brands   enable row level security;
alter table retailers         enable row level security;
alter table products          enable row level security;
alter table listings          enable row level security;
alter table price_snapshots   enable row level security;
alter table competitive_links enable row level security;
alter table jobs              enable row level security;
alter table allowed_emails    enable row level security;

-- 白名单只读
create policy r_categories on categories        for select to authenticated using (is_allowed());
create policy r_brands     on brands            for select to authenticated using (is_allowed());
create policy r_catbrands  on category_brands   for select to authenticated using (is_allowed());
create policy r_retailers  on retailers         for select to authenticated using (is_allowed());
create policy r_products   on products          for select to authenticated using (is_allowed());
create policy r_listings   on listings          for select to authenticated using (is_allowed());
create policy r_snapshots  on price_snapshots   for select to authenticated using (is_allowed());
create policy r_complinks  on competitive_links for select to authenticated using (is_allowed());
create policy r_jobs       on jobs              for select to authenticated using (is_allowed());

-- 网页审核写权限：listings 更新映射、products 建档/补全
create policy w_listings_upd on listings for update to authenticated
  using (is_allowed()) with check (is_allowed());
create policy w_products_ins on products for insert to authenticated with check (is_allowed());
create policy w_products_upd on products for update to authenticated
  using (is_allowed()) with check (is_allowed());

-- 竞品对标：增删
create policy w_complinks_ins on competitive_links for insert to authenticated with check (is_allowed());
create policy w_complinks_del on competitive_links for delete to authenticated using (is_allowed());

-- 任务队列：白名单可下单/取消（runner 用 service key，不受 RLS 限制）
create policy w_jobs_ins on jobs for insert to authenticated with check (is_allowed());
create policy w_jobs_upd on jobs for update to authenticated
  using (is_allowed()) with check (is_allowed());

-- 注：products/listings/snapshots 的 INSERT（管线 push）与 allowed_emails 写入，
--     均走 service_role（绕过 RLS），故此处不给 authenticated 这些写策略。

-- ---------- 8. 视图 ----------

-- 看板主视图：mapped + 品牌已激活
create or replace view v_dashboard with (security_invoker = true) as
with latest as (
  select distinct on (listing_id) listing_id, scraped_date, price, promo_price, currency, in_stock, seller
  from price_snapshots order by listing_id, scraped_date desc
),
prev as (
  select distinct on (s.listing_id) s.listing_id, s.price, s.promo_price
  from price_snapshots s
  join latest l on l.listing_id = s.listing_id and s.scraped_date < l.scraped_date
  order by s.listing_id, s.scraped_date desc
)
select
  c.key as category,
  b.key as brand, b.display as brand_display, b.is_own,
  r.key as retailer, r.display as retailer_display, r.country,
  p.id as product_id, p.sku, p.ean, p.name, p.capacity, p.power, p.power_w,
  p.wired_power, p.wireless_power, p.magsafe,
  p.usb_ports, p.port_count, p.is_wireless, p.rrp, p.image_path,
  r.channel_type,
  li.id as listing_id, li.url, li.status,
  l.scraped_date, l.price, l.promo_price, l.currency, l.in_stock, l.seller,
  pv.price as prev_price, pv.promo_price as prev_promo,
  li.first_seen, li.last_seen   -- 前端据此识别下架/陈旧 listing
from listings li
join categories c on c.id = li.category_id
join retailers r  on r.id = li.retailer_id
join brands b     on b.id = li.brand_id
join category_brands cb on cb.category_id = li.category_id
                       and cb.brand_id = li.brand_id and cb.is_active
left join products p on p.id = li.product_id
left join latest l   on l.listing_id = li.id
left join prev pv    on pv.listing_id = li.id
where li.status = 'mapped';

-- 审核视图：待处理 new_listing（不受激活闸门限制——审核本身就是激活前置）
create or replace view v_review with (security_invoker = true) as
select
  c.key as category,
  b.key as brand, b.display as brand_display,
  r.display as retailer_display, r.country,
  li.id as listing_id, li.retailer_code, li.url,
  li.raw_name, li.raw_sku, li.raw_ean, li.first_seen, li.last_seen,
  l.price, l.promo_price, l.currency, l.seller
from listings li
join categories c on c.id = li.category_id
join retailers r  on r.id = li.retailer_id
join brands b     on b.id = li.brand_id
left join lateral (
  select price, promo_price, currency, seller
  from price_snapshots where listing_id = li.id
  order by scraped_date desc limit 1
) l on true
where li.status = 'new_listing';
