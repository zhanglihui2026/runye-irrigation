-- ============================================================
-- route_c_migration_v5_rls_tighten.sql —— 润野灌溉 · 写权限收紧（方案二收口）
-- 日期：2026-10-11（v371）
-- 前置：ryEntitle 云函数 v2b 已上线（API Key=服务端身份写库），
--       且前端 HTTP 通道已经真实手机号登录验收通过。
-- 作用：浏览器身份（anon / authenticated）对 ry_* 四表只保留读，
--       写只留给服务端（API Key 走 service_role，不受 RLS/GRANT 约束）。
--       —— 至此「用户改自己的权益行」的口子彻底关闭。
-- ⚠️ 执行时机：必须在 v371 前端发布且真实手机号走通 bindRef 之后！
--    过早执行会让降级路径（rdb 直连写）失效，若 HTTP 通道又有问题会卡死裂变。
-- 回滚：重新 GRANT 即可（见文件末尾）。
-- ============================================================

-- 1) 浏览器身份收回写权限（四张表全收）
revoke insert, update, delete on ry_entitle from anon, authenticated;
revoke insert, update, delete on ry_invite  from anon, authenticated;
revoke insert, update, delete on ry_links   from anon, authenticated;
revoke insert, update, delete on ry_bind    from anon, authenticated;

-- 2) 序列也收走（服务端用 service_role 不受影响）
revoke usage, select on all sequences in schema public from anon, authenticated;

-- 3) 读保留：own-row 读取仍走 RLS 策略（v1 迁移脚本已建），这里不动 SELECT。
--    验证：以下应以 1 行（revoke 生效）形式出现——
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'ry_links' and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE');
-- 期望：0 行（都收干净了）

-- ---------- 回滚（如需临时恢复前端直写） ----------
-- grant insert, update, delete on ry_entitle, ry_invite, ry_links, ry_bind to authenticated;
-- grant usage, select on all sequences in schema public to authenticated;
