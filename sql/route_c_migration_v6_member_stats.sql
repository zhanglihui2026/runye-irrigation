-- ============================================================
-- route_c_migration_v6_member_stats.sql
-- 目的：让「统一管理后台 · 会员管理」能统计注册人员情况
--       （累计注册 / 今日新增 / 近 7 日 / 近 7 日活跃 / 等级分布 / 每人邀请人数）
--
-- 背景：ry_entitle 原有 updated_at 但语义是「行最后一次被写」，
--       且没有「最后活跃」字段，导致后台无法回答「谁什么时候注册、最近还来不来」。
--       增加两列由云函数维护：
--         created_at   —— 首次建行（≈ 注册时刻）
--         last_seen_at —— 最近一次打开工具（云函数 actGet 里 30 分钟节流写入）
--
-- 执行方式：CloudBase 控制台 → 数据库 → SQL 执行（一次跑完即可，可重复执行）
-- 影响：只加列 + 回填 + 建索引，不动 RLS、不动既有数据内容。
-- ============================================================

-- 1) 加列（可重复执行）
alter table public.ry_entitle add column if not exists created_at   timestamptz;
alter table public.ry_entitle add column if not exists last_seen_at timestamptz;

-- 2) 存量回填
--    注册时间：取 updated_at（行首次写入时间，最接近注册时刻的历史证据）
--    最后活跃：取 activated_at（用户首次保存工程的时间，作为初始近似值）
update public.ry_entitle
   set created_at = coalesce(created_at, updated_at, now())
 where created_at is null;

update public.ry_entitle
   set last_seen_at = coalesce(last_seen_at, activated_at)
 where last_seen_at is null;

-- 3) 新行默认现在就建，老行不需要默认值
alter table public.ry_entitle alter column created_at set default now();

-- 4) 列表按注册时间倒序、统计按活跃时间过滤，各建一个索引
create index if not exists ry_entitle_created_idx on public.ry_entitle (created_at desc);
create index if not exists ry_entitle_seen_idx    on public.ry_entitle (last_seen_at desc);

-- 5) 自检（执行后看这两个数字是否都不为 0）
-- select count(*) as total,
--        count(created_at) as has_created,
--        count(last_seen_at) as has_seen,
--        count(*) filter (where created_at >= date_trunc('day', now())) as today
--   from public.ry_entitle;
