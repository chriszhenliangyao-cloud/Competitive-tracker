-- ============================================================
-- 003 cleanup & harden（在 002_platform_v2 之上做收尾，已应用到 live DB）
-- 目的：清掉历史遗留 stray 函数、补齐 FK 覆盖索引、收紧函数执行权限。
-- 注：权威全量定义见同目录 schema.sql；本文件仅为增量迁移留痕。
-- ============================================================

-- 1) 删除不在任何 schema 文件里的遗留函数（曾被 linter 标为 anon 可执行的 SECURITY DEFINER）
drop function if exists public.rls_auto_enable() cascade;

-- 2) 为 linter 标记的「未建索引外键」补覆盖索引
create index if not exists category_brands_brand_idx   on public.category_brands(brand_id);
create index if not exists competitive_links_rival_idx on public.competitive_links(rival_product);
create index if not exists listings_brand_idx          on public.listings(brand_id);
create index if not exists products_brand_idx          on public.products(brand_id);

-- 3) 收紧 is_allowed() 执行权限：策略均为 TO authenticated
revoke execute on function public.is_allowed() from public;
revoke execute on function public.is_allowed() from anon;
grant  execute on function public.is_allowed() to authenticated;

-- 4) 文档化「allowed_emails 故意无 RLS 策略」
comment on table public.allowed_emails is
  '访问白名单。故意不建任何 RLS 策略：客户端永不可直接读取；登录校验通过 SECURITY DEFINER 的 is_allowed() 间接进行。写入仅限 service_role。';
