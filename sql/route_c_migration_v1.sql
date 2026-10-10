-- ============================================================
-- 润野灌溉 · 路线C 迁移脚本 v1（2026-10-10）
-- 用途：会员/权益数据从「云函数（已被平台闸封死）」迁移到
--       「PG 直连 + RLS」。在 CloudBase 控制台
--       「SQL 型数据库」的 SQL 编辑器里整段执行一次。
-- 注意：
--  1. 本环境已有 plots / weather_logs（数字农业工作台），本脚本不碰。
--  2. auth.uid() 是 CloudBase PG 的 JWT sub 帮手函数（勿用 current_user）。
--  3. _id 用 text 直接存 CloudBase uid，主键即 uid（一人一行）。
-- ============================================================

-- ---------- 1. 权益表：一人一行，存会员等级/到期/心跳 ----------
create table if not exists public.ry_entitle (
  _id          text primary key,              -- CloudBase uid
  plan         text not null default 'trial', -- trial / L1 / L2
  expires_at   timestamptz,                   -- 到期时间（trial 计时也用这里）
  phone        text,                          -- 绑定手机号（登录后回填）
  inviter_ref  text,                          -- 邀请码（谁邀请的我）
  updated_at   timestamptz not null default now()
);
alter table public.ry_entitle enable row level security;

-- 匿名（未转正）：可建自己的行（先用后登），可读自己的行
drop policy if exists ry_entitle_anon_all on public.ry_entitle;
create policy ry_entitle_anon_all on public.ry_entitle
  for all to anon
  using (_id = auth.uid())
  with check (_id = auth.uid());

-- 登录用户：读改自己的行
drop policy if exists ry_entitle_auth_all on public.ry_entitle;
create policy ry_entitle_auth_all on public.ry_entitle
  for all to authenticated
  using (_id = auth.uid())
  with check (_id = auth.uid());

-- ---------- 2. KV 同步表：跨设备数据同步（替代 syncDb 的润野部分） ----------
create table if not exists public.ry_kv (
  _id        text primary key,                -- uid + ':' + key
  uid        text not null default auth.uid(),
  k          text not null,
  v          jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists ry_kv_uid_idx on public.ry_kv (uid);
alter table public.ry_kv enable row level security;

drop policy if exists ry_kv_anon_all on public.ry_kv;
create policy ry_kv_anon_all on public.ry_kv
  for all to anon
  using (uid = auth.uid())
  with check (uid = auth.uid());

drop policy if exists ry_kv_auth_all on public.ry_kv;
create policy ry_kv_auth_all on public.ry_kv
  for all to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- ---------- 3. 邀请关系表：只追加（防篡改），读自己的 ----------
create table if not exists public.ry_invite (
  id        bigserial primary key,
  uid       text not null default auth.uid(),
  code      text not null,                   -- 我的邀请码
  invited   text,                            -- 被邀请人 uid
  created_at timestamptz not null default now()
);
create index if not exists ry_invite_uid_idx on public.ry_invite (uid);
alter table public.ry_invite enable row level security;

drop policy if exists ry_invite_anon_all on public.ry_invite;
create policy ry_invite_anon_all on public.ry_invite
  for all to anon
  using (uid = auth.uid())
  with check (uid = auth.uid());

drop policy if exists ry_invite_auth_all on public.ry_invite;
create policy ry_invite_auth_all on public.ry_invite
  for all to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- ---------- 4. GRANT 表级权限（⛔ 关键：漏了这步= DATABASE_42501 permission denied） ----------
-- 官方文档「Common Pitfalls」明列：Wrote a Policy but forgot GRANT → 表级权限检查失败。
-- RLS 策略只是"行过滤器"，表级 GRANT 是"大门"，两者都要有。
grant select, insert, update, delete on public.ry_entitle, public.ry_kv, public.ry_invite to anon, authenticated;
grant usage, select on sequence public.ry_invite_id_seq to anon, authenticated;

-- ---------- 5. 自检（应返回 3 张表全部 rowlevelsecurity = true） ----------
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename like 'ry_%';
