-- ============================================================
-- 润野灌溉 · 路线C 迁移脚本 v2（2026-10-10）
-- 用途：权益层（runye-entitle.js）从 ryEntitle 云函数迁到 PG 直连。
--       在「SQL 型数据库 → SQL 编辑器」整段执行一次。
-- 与 v1 的关系：v1 的 ry_entitle / ry_kv / ry_invite 保持不变；
--   v2 新增 ry_bind（邀请码映射，公开可读）与 ry_links（邀请关系，双方可见），
--   并给 ry_invite / ry_entitle 补充列。
-- ⚠️ 业务逻辑在前端算（网关不支持 RPC，取舍已与用户立案）：
--   RLS 防跨用户篡改；用户篡改「自己的」权益行暂不可防，规模上来后升级服务端边界。
-- ============================================================

-- ---------- 1. ry_bind：邀请码 → uid 映射（被邀请人要反查，必须公开可读） ----------
create table if not exists public.ry_bind (
  code       text primary key,
  uid        text not null,
  created_at timestamptz not null default now()
);
alter table public.ry_bind enable row level security;

-- 所有人可读（反查邀请人）
drop policy if exists ry_bind_read_all on public.ry_bind;
create policy ry_bind_read_all on public.ry_bind
  for select to anon, authenticated using (true);
-- 只能写自己的码
drop policy if exists ry_bind_insert_own on public.ry_bind;
create policy ry_bind_insert_own on public.ry_bind
  for insert to anon, authenticated with check (uid = auth.uid());

-- ---------- 2. ry_links：邀请关系（被邀请人写，邀请人只读） ----------
-- 一行 = 一条邀请。status: registered → cooling（被邀请人激活时自己推进）→ valid（前端按 3 天冷静期到期迁移）
create table if not exists public.ry_links (
  id            bigserial primary key,
  inviter_uid   text not null,
  invited_uid   text not null default auth.uid(),
  code          text not null,                -- 邀请码（冗余，便于按码统计）
  nick          text not null default '',
  status        text not null default 'registered',
  registered_at timestamptz not null default now(),
  activated_at  timestamptz,
  via_group     boolean not null default false
);
create index if not exists ry_links_inviter_idx on public.ry_links (inviter_uid);
create index if not exists ry_links_invited_idx on public.ry_links (invited_uid);
alter table public.ry_links enable row level security;

-- 双方可见；**只有被邀请人能写**（WITH CHECK 限定 invited_uid = auth.uid()，邀请人对他人行只读）
drop policy if exists ry_links_both on public.ry_links;
create policy ry_links_both on public.ry_links
  for all to anon, authenticated
  using (invited_uid = auth.uid() or inviter_uid = auth.uid())
  with check (invited_uid = auth.uid());

-- ---------- 3. ry_invite / ry_entitle 补列（v1 已建表，这里补字段） ----------
alter table public.ry_invite  add column if not exists inviter        text not null default '';
alter table public.ry_invite  add column if not exists reward_claimed boolean not null default false;
alter table public.ry_invite  add column if not exists claims         jsonb not null default '[]'::jsonb;
alter table public.ry_invite  add column if not exists rewards        jsonb not null default '[]'::jsonb;
alter table public.ry_entitle add column if not exists member_days   integer;
alter table public.ry_entitle add column if not exists activated_at   timestamptz;
alter table public.ry_entitle add column if not exists history        jsonb not null default '[]'::jsonb;

-- ---------- 4. GRANT（v2 新表；v1 三表已授过，重复执行无害） ----------
grant select, insert, update, delete on public.ry_entitle, public.ry_kv, public.ry_invite to anon, authenticated;
grant select, insert, update, delete on public.ry_bind, public.ry_links  to anon, authenticated;
grant usage, select on sequence public.ry_invite_id_seq to anon, authenticated;
grant usage, select on sequence public.ry_links_id_seq   to anon, authenticated;

-- ---------- 5. 自检（应返回 5 张表 rowsecurity = true） ----------
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and tablename in
       ('ry_entitle','ry_kv','ry_invite','ry_bind','ry_links')
 order by tablename;
