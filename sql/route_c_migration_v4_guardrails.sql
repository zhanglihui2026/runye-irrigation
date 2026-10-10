-- ============================================================
-- 润野灌溉 · 路线C 迁移脚本 v4（2026-10-11）
-- 用途：方案一「数据库护栏」—— 即使 RLS 放行自己写自己的行，
--       粗暴篡改也会被 CHECK 约束 / 触发器直接拒绝。
-- 执行位置：CloudBase 控制台「SQL 型数据库」的 SQL 编辑器，整段执行一次。
-- 与云函数（ryEntitle v2）兼容：函数的合法写入全部在护栏限度内
--   （grant 单次续期 = plan 天数 ≤ 365 天 < 400 天护栏）。
-- ============================================================

-- ---------- 1. 静态 CHECK：数值范围 ----------
-- member_days 必须在 0..365
alter table public.ry_entitle drop constraint if exists ry_entitle_days_chk;
alter table public.ry_entitle add constraint ry_entitle_days_chk
  check (member_days is null or (member_days >= 0 and member_days <= 365));

-- plan 只允许白名单值
alter table public.ry_entitle drop constraint if exists ry_entitle_plan_chk;
alter table public.ry_entitle add constraint ry_entitle_plan_chk
  check (plan in ('trial', 'L1', 'L2'));

-- ry_links.status 只允许白名单值
alter table public.ry_links drop constraint if exists ry_links_status_chk;
alter table public.ry_links add constraint ry_links_status_chk
  check (status in ('registered', 'cooling', 'valid', 'invalid'));

-- ---------- 2. 触发器：ry_entitle 续期幅度护栏 ----------
-- 单次 expires_at 延长 ≤ 400 天、member_days 单次增幅 ≤ 400
create or replace function public.ry_entitle_guard() returns trigger as $$
begin
  if new.expires_at is not null and old.expires_at is not null
     and new.expires_at > old.expires_at
     and (extract(epoch from (new.expires_at - old.expires_at)) / 86400) > 400 then
    raise exception 'ry_entitle: 单次续期不得超过 400 天';
  end if;
  if new.member_days is not null and old.member_days is not null
     and new.member_days > old.member_days + 400 then
    raise exception 'ry_entitle: member_days 单次增幅超过 400';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists ry_entitle_guard_trg on public.ry_entitle;
create trigger ry_entitle_guard_trg
  before update on public.ry_entitle
  for each row execute function public.ry_entitle_guard();

-- ---------- 3. 触发器：ry_invite.reward_claimed 只许 false→true 一次 ----------
create or replace function public.ry_invite_guard() returns trigger as $$
begin
  if old.reward_claimed = true and new.reward_claimed = false then
    raise exception 'ry_invite: reward_claimed 不允许从 true 改回 false';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists ry_invite_guard_trg on public.ry_invite;
create trigger ry_invite_guard_trg
  before update on public.ry_invite
  for each row execute function public.ry_invite_guard();

-- ---------- 4. 触发器：ry_links 状态不许从 valid 回退 ----------
create or replace function public.ry_links_guard() returns trigger as $$
begin
  if old.status = 'valid' and new.status in ('registered', 'cooling') then
    raise exception 'ry_links: 状态不允许从 valid 回退';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists ry_links_guard_trg on public.ry_links;
create trigger ry_links_guard_trg
  before update on public.ry_links
  for each row execute function public.ry_links_guard();

-- ---------- 5. 自检（应各返回 0 = 无违规） ----------
select count(*) as entitle_out_of_range from public.ry_entitle
 where member_days is not null and (member_days < 0 or member_days > 365);
select count(*) as links_bad_status from public.ry_links
 where status not in ('registered', 'cooling', 'valid', 'invalid');
