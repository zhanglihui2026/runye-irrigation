-- ============================================================
-- 润野灌溉 · 路线C 迁移脚本 v3（2026-10-10）· 热修复
-- 问题：v1 的 ry_invite 主键是 id bigserial、无 _id 列，而权益层按 _id 读写
--       邀请档案 → 「列不存在」错误被吞 → 邀请码永远取不到（权益行本身正常）。
-- 修法：补 _id 列 + 存量回填 + 唯一索引（列可空，新行由前端写 _id = JWT sub）。
-- ============================================================

alter table public.ry_invite add column if not exists _id text;
update public.ry_invite set _id = uid where _id is null;
create unique index if not exists ry_invite__id_uq on public.ry_invite(_id) where _id is not null;

-- 自检：应显示 1 行、_id 已回填（或 0 行 = 还没人建档）
select id, uid, _id, code from public.ry_invite order by id desc limit 5;
