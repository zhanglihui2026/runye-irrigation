'use strict';
/* ============================================================
   ryEntitle v2b —— 润野灌溉 · 会员权益与邀请裂变（服务端权威版）
   ------------------------------------------------------------
   [v2b 2026-10-11] 数据访问层改造：PG TCP 直连（DATABASE_URL + pg）
   在共享型集群上不可用（控制台提示「共享集群暂不提供直连能力」），
   改为经 CloudBase 数据网关的 REST 接口（PostgREST 规范）读写同一批表：
       https://{ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/{table}
   鉴权用「API Key」（服务端身份，等价 service_role，越过 RLS），
   Key 只存函数环境变量 TCB_API_KEY，绝不进前端。
   —— 服务端权威写的目标不变；前端依旧带 JWT 调 /entitle。

   本版零 npm 依赖：HTTP 用 Node 内置 https 模块（不依赖 fetch，
   规避云函数 Node 版本差异），部署 zip 里不需要 node_modules。

   [v2c 2026-10-13 统一管理后台] 新增会员管理 + 规则配置 actions：
     configGet          读取全局会员规则（免登录可读，fail-open 回默认值）
     configSet          保存全局会员规则（管理员白名单）
     adminMembers       搜索会员（手机号/UID，管理员白名单）
     adminMemberGrant   给会员加天数/升级等级/设到期日（管理员白名单，写 history src=admin）
     规则配置存 ry_kv 主键 global:member-config；管理员复用 RY_PLUGIN_ADMIN_UIDS。

   actions（与 v2 完全一致）：
     ping       无需登录，健康检查（验证 API Key + 网关连通）
     get/init   拉取权益与进度（init 顺带建行）
     bindRef    提交邀请码（自邀/-4、重复/-2、码不存在/-3 服务端判）
     grant      满 3 人发奖（服务端算进度，reward_claimed 幂等锁）
     claim      漏计核销工单（pending<3 限制）
     heartbeat  存量行迁移（registered/cooling → valid）
   鉴权：Authorization: Bearer <access_token> → auth 网关反查 uid。
   触发：HTTP 访问服务路由（POST，JSON body {action, ...}）。
   返回：{ code, data, message }
   ============================================================ */

const https = require('https');

/* ---------- 配置（环境变量优先，缺省即润野环境） ---------- */
const ENV_ID = process.env.CLB_ENV_ID || 'runye-irrigation-d3e8xef4540bae5';
const REGION = process.env.CLB_REGION || 'ap-shanghai';
const API_KEY = process.env.TCB_API_KEY || '';
/* 数据网关（PostgREST 规范，API Key = 服务端身份） */
const RDB_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';/* auth 网关（与前端 SDK 同源，JWT 反查用户）
   [v2b-2 2026-10-11 实测修正] 网关签发的 token（iss=*.api.tcloudbasegateway.com）
   只能由网关自己验证 —— tcb-api 的 /web/auth/v1/user 没有对应签名钥
   （报 INVALID_ACCESS_TOKEN: Unable to find a signing key），网关的
   /auth/v1/user（无 /me）是 404。SDK 实际用的是：
       GET {env}.api.tcloudbasegateway.com/auth/v1/user/me?client_id={env}
   ⚠️ 返回体里的 sub 是「SDK uid」，与 JWT payload 的 sub（= RLS auth.uid()，
   前端 authSub 落库身份）不是同一个 —— 因此验签过后，业务 uid 从 JWT
   payload 解出，不能用响应体的 sub。 */
const AUTH_USER_ME_URL = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/auth/v1/user/me?client_id=' + ENV_ID;
const AUTH_USER_URL = 'https://' + ENV_ID + '.' + REGION + '.tcb-api.tencentcloudapi.com/web/auth/v1/user';

/* ---------- 业务常量（与 runye-entitle.js v367 同构） ---------- */
const CAP = 3;                    // 邀请注册 + 群裂变 共享上限
const TRIAL_DAYS = 30;            // L1 注册会员初始天数
const DAY = 86400000;
const PLANS = {
  L1: { key: 'L1', name: '注册会员', days: 30 },
  L2: { key: 'L2', name: '高级会员', days: 365 }
};
const PLUGIN_IDS = ['hello-world', 'archive', 'bom', 'case-lib', 'pipe-optim', 'calib', 'hydraulics', 'ai-plan', 'sprinkler'];
const PLUGIN_CONFIG_ID = 'global:plugin-control';
const FN_VERSION = 'v2c-2-fix-setexpire';  /* [v2c-2] configGet 回显，用于确认部署版本 */
const PLUGIN_ADMIN_UIDS = String(process.env.RY_PLUGIN_ADMIN_UIDS || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
/* [v2c] 会员规则配置（ry_kv）与功能清单（与 runye-entitle.js FEATURES 同构） */
const MEMBER_CONFIG_ID = 'global:member-config';
const FEATURE_KEYS = ['zone-split', 'ai-plan', 'pipe-layout', 'online-map', 'drawing-export', 'bom-export', 'hydraulic-check', 'pro-others'];
const L1_FEATURE_KEYS = ['zone-split', 'ai-plan', 'pipe-layout', 'online-map'];
const FEATURE_NAMES = {
  'zone-split': '地块分区', 'ai-plan': 'AI 智能规划', 'pipe-layout': '管路规划', 'online-map': '在线地图',
  'drawing-export': '出图', 'bom-export': '导出清单', 'hydraulic-check': '水利校验', 'pro-others': '其余高级功能'
};
function isAdminUid(uid) { return !!(uid && PLUGIN_ADMIN_UIDS.indexOf(uid) >= 0); }
function defaultMemberConfig() {
  return {
    trialDays: TRIAL_DAYS,
    plans: {
      L1: { name: PLANS.L1.name, days: PLANS.L1.days,
        features: ['zone-split', 'ai-plan', 'pipe-layout', 'online-map'] },
      L2: { name: PLANS.L2.name, days: PLANS.L2.days, features: FEATURE_KEYS.slice() }
    }
  };
}
function sanitizeMemberConfig(v) {
  const d = defaultMemberConfig();
  const out = { trialDays: d.trialDays, plans: {} };
  const td = Number(v && v.trialDays);
  if (isFinite(td) && td >= 1 && td <= 3650) out.trialDays = Math.floor(td);
  ['L1', 'L2'].forEach(function (k) {
    const p = v && v.plans && v.plans[k];
    const def = d.plans[k];
    const o = { name: def.name, days: def.days, features: def.features.slice() };
    if (p && typeof p === 'object') {
      if (typeof p.name === 'string' && p.name.trim()) o.name = p.name.trim().slice(0, 20);
      const dd = Number(p.days);
      if (isFinite(dd) && dd >= 1 && dd <= 3650) o.days = Math.floor(dd);
      if (Array.isArray(p.features)) {
        const allowed = k === 'L1' ? L1_FEATURE_KEYS : FEATURE_KEYS;
        const fs = p.features.filter(function (x) { return allowed.indexOf(x) >= 0; });
        if (fs.length) o.features = fs;
      }
    }
    out.plans[k] = o;
  });
  return out;
}
async function readMemberConfig() {
  try {
    const rows = await rdbSelect('ry_kv', { _id: 'eq.' + MEMBER_CONFIG_ID, select: 'v' });
    const v = rows[0] && rows[0].v;
    if (v && typeof v === 'object' && v.plans) {
      return { config: sanitizeMemberConfig(v), updatedAt: v.updatedAt || null, updatedBy: v.updatedBy || null };
    }
  } catch (e) { /* 读失败 fail-open 回默认 */ }
  return { config: defaultMemberConfig(), updatedAt: null, updatedBy: null };
}

/* ---------- HTTP（Node 内置 https，零依赖） ---------- */
function httpReq(method, url, headers, bodyObj) {
  return new Promise(function (resolve, reject) {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const payload = (bodyObj === undefined || bodyObj === null)
      ? null : Buffer.from(JSON.stringify(bodyObj), 'utf8');
    const h = Object.assign({ Accept: 'application/json' }, headers || {});
    if (payload) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = payload.length;
    }
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: method,
      headers: h
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = JSON.parse(text); } catch (e) { body = text; }
        resolve({ status: res.statusCode, body: body });
      });
    });
    req.setTimeout(8000, function () { req.destroy(new Error('HTTP 请求超时（8s）')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ---------- 数据网关 REST（PostgREST）---------- */
function rdbErr(op, r) {
  return new Error('rdb ' + op + ' 失败: HTTP ' + r.status + ' ' +
    JSON.stringify(r.body).slice(0, 300));
}
function qsOf(params) {
  const sp = new URLSearchParams();
  Object.keys(params || {}).forEach(function (k) {
    const v = params[k];
    if (Array.isArray(v)) v.forEach(function (x) { sp.append(k, x); });
    else sp.append(k, String(v));
  });
  return sp.toString();
}
async function rdbSelect(table, params) {
  const r = await httpReq('GET', RDB_BASE + '/' + table + '?' + qsOf(params),
    { Authorization: 'Bearer ' + API_KEY });
  if (r.status !== 200) throw rdbErr('select ' + table, r);
  return Array.isArray(r.body) ? r.body : [];
}
async function rdbInsert(table, row, prefer) {
  const h = { Authorization: 'Bearer ' + API_KEY, Prefer: prefer || 'return=minimal' };
  const r = await httpReq('POST', RDB_BASE + '/' + table, h, Array.isArray(row) ? row : [row]);
  if (r.status >= 300) {
    const e = rdbErr('insert ' + table, r);
    e.status = r.status;
    e.body = r.body;
    throw e;
  }
  return Array.isArray(r.body) ? r.body : null;
}
async function rdbUpdate(table, filters, patch) {
  const r = await httpReq('PATCH', RDB_BASE + '/' + table + '?' + qsOf(filters),
    { Authorization: 'Bearer ' + API_KEY }, patch);
  if (r.status >= 300) {
    const e = rdbErr('update ' + table, r);
    e.status = r.status;
    e.body = r.body;
    throw e;
  }
  return true;
}
function isDup(e) {
  const s = JSON.stringify(e && e.body || '') + String(e && e.message || '');
  return (e && e.status === 409) || /duplicate|unique|ry_invite_code_uq/i.test(s);
}

/* ---------- 身份：JWT → uid ---------- */
/* 解 JWT payload 的 sub（仅在网关验签通过后调用才可信） */
function jwtSub(token) {
  try {
    const seg = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(Buffer.from(seg + '==='.slice((seg.length + 3) % 4), 'base64').toString('utf8'));
    return (p && p.sub) ? String(p.sub) : null;
  } catch (e) { return null; }
}
async function verifyUid(token) {
  if (!token) return null;
  try {
    /* 首选：SDK 同款端点（网关验签，token 与签发同源） */
    const r = await httpReq('GET', AUTH_USER_ME_URL, { Authorization: 'Bearer ' + token });
    if (r.status === 200 && r.body && r.body.sub) return jwtSub(token);
    /* 兜底：tcb-api 旧端点（仅当平台日后改用 tcb-api 签发 token 时才可能命中） */
    const r2 = await httpReq('GET', AUTH_USER_URL, { Authorization: 'Bearer ' + token });
    if (r2.status === 200 && r2.body && (r2.body.id || r2.body.uid)) return String(r2.body.id || r2.body.uid);
    return null;
  } catch (e) { return null; }
}

/* ---------- 工具 ---------- */
function makeCode(seed) {
  const s = String(seed || '') + '|' + Date.now() + '|' + Math.random();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return 'RY' + h.toString(36).toUpperCase().slice(0, 8);
}
function maskPhone(p) {
  const s = String(p == null ? '' : p);
  return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
}
function iso(ms) { return new Date(ms).toISOString(); }
function ok(data, message) { return { code: 0, data: data || null, message: message || '' }; }
function fail(code, message, data) { return { code: code, data: data || null, message: message }; }

/* ---------- 数据访问（REST 版） ---------- */
async function getEntitle(uid) {
  const rows = await rdbSelect('ry_entitle', { _id: 'eq.' + uid });
  return rows[0] || null;
}
async function getInvite(uid) {
  const rows = await rdbSelect('ry_invite', { _id: 'eq.' + uid });
  return rows[0] || null;
}
async function getLinksByInviter(uid) {
  return await rdbSelect('ry_links', { inviter_uid: 'eq.' + uid, order: 'id.desc' });
}
async function ensureRows(uid, phone) {
  let ent = await getEntitle(uid);
  if (!ent) {
    const now = new Date();
    const hist = [{ at: Date.now(), days: TRIAL_DAYS, plan: 'L1', planName: '注册会员', from: Date.now(), to: Date.now() + TRIAL_DAYS * DAY, src: 'register' }];
    await rdbInsert('ry_entitle', {
      _id: uid, plan: 'L1', expires_at: iso(Date.now() + TRIAL_DAYS * DAY),
      member_days: TRIAL_DAYS, activated_at: iso(now.getTime()),
      phone: phone || null, history: hist
    });
    ent = await getEntitle(uid);
  }
  let inv = await getInvite(uid);
  if (!inv) {
    let code = makeCode(uid), guard = 0, done = false;
    while (guard++ < 5 && !done) {
      try {
        await rdbInsert('ry_invite', { _id: uid, uid: uid, code: code, inviter: '', reward_claimed: false, claims: [], rewards: [] });
        done = true;
      } catch (e) {
        if (isDup(e)) { code = makeCode(uid + guard); continue; }
        throw e;
      }
    }
    /* ry_bind：code 主键，已存在则跳过（等价 on conflict do nothing） */
    const bindRows = await rdbSelect('ry_bind', { code: 'eq.' + code });
    if (!bindRows.length) {
      try { await rdbInsert('ry_bind', { code: code, uid: uid }); }
      catch (e) { if (!isDup(e)) throw e; }
    }
    inv = await getInvite(uid);
  }
  return { ent: ent, inv: inv };
}
/* 进度：v367 规则 —— registered/cooling/valid 一律计入（存量兼容） */
function computeProgress(links) {
  let fromInvite = 0;
  for (const it of links) if (['valid', 'cooling', 'registered'].includes(it.status)) fromInvite++;
  const total = fromInvite;
  const capped = Math.min(total, CAP);
  return { fromInvite: fromInvite, fromGroup: 0, total: total, capped: capped,
    cooling: 0, pending: 0, remain: Math.max(0, CAP - capped), reached: capped >= CAP };
}
function packState(ent, inv, links) {
  return {
    code: (inv && inv.code) || '',
    entitle: ent ? { plan: ent.plan, expireAt: ent.expires_at ? new Date(ent.expires_at).getTime() : 0,
      memberDays: ent.member_days || 0, activatedAt: ent.activated_at ? new Date(ent.activated_at).getTime() : 0 } : null,
    progress: computeProgress(links),
    invites: links,
    claims: (inv && inv.claims) || [],
    rewards: (inv && inv.rewards) || [],
    rewardClaimed: !!(inv && inv.reward_claimed)
  };
}

/* ---------- actions ---------- */
async function actGet(uid, params) {
  const phone = params && params.phone;
  const { ent, inv } = await ensureRows(uid, phone);
  const links = await getLinksByInviter(uid);
  return ok(packState(ent, inv, links));
}
async function actBindRef(uid, params) {
  const ref = String((params && params.ref) || '').trim();
  const phone = params && params.phone;
  if (ref.indexOf('RY') !== 0) return fail(-1, '邀请码格式不正确');
  const bindRows = await rdbSelect('ry_bind', { code: 'eq.' + ref });
  const bind = bindRows[0];
  if (!bind || !bind.uid) return fail(-3, '邀请码不存在或已失效');
  if (String(bind.uid) === String(uid)) return fail(-4, '不能绑定自己为邀请人');
  const { inv } = await ensureRows(uid, phone);
  if (inv.inviter && inv.inviter !== ref) return fail(-2, '已绑定其他邀请人，不可变更');
  /* 半程态检查：links 已存在（inviter 或 code 任一匹配） */
  const orExpr = '(inviter_uid.eq.' + bind.uid + ',code.eq.' + ref + ')';
  const same = await rdbSelect('ry_links', { invited_uid: 'eq.' + uid, or: orExpr });
  if (same.length) {
    if (!inv.inviter) await rdbUpdate('ry_invite', { _id: 'eq.' + uid }, { inviter: ref }); /* 修复半程态 */
    const own = await getLinksByInviter(uid);
    const ent2 = await getEntitle(uid);
    const inv2 = await getInvite(uid);
    return ok(packState(ent2, inv2, own), '已绑定（修复半程态）');
  }
  const other = await rdbSelect('ry_links', { invited_uid: 'eq.' + uid });
  if (other.length) return fail(-2, '已绑定其他邀请人，不可变更');
  /* [v367] 注册即激活：直写 valid */
  await rdbInsert('ry_links', {
    inviter_uid: bind.uid, invited_uid: uid, code: ref, status: 'valid',
    activated_at: new Date().toISOString(),
    nick: maskPhone(phone) || ('用户' + String(uid).slice(-4)),
    via_group: !!(params && params.viaGroup)
  });
  if (!inv.inviter) await rdbUpdate('ry_invite', { _id: 'eq.' + uid }, { inviter: ref });
  const ent = await getEntitle(uid);
  const inv2 = await getInvite(uid);
  const own = await getLinksByInviter(uid);
  return ok(packState(ent, inv2, own));
}
async function actHeartbeat(uid) {
  const ent = await getEntitle(uid);
  if (ent && !ent.activated_at) await rdbUpdate('ry_entitle', { _id: 'eq.' + uid }, { activated_at: new Date().toISOString() });
  /* 存量行迁移：自己的非 valid links 行推进为 valid */
  await rdbUpdate('ry_links', { invited_uid: 'eq.' + uid, status: 'neq.valid' },
    { status: 'valid', activated_at: new Date().toISOString() });
  return ok({ done: true });
}
async function actGrant(uid, params) {
  const phone = params && params.phone;
  const { ent, inv } = await ensureRows(uid, phone);
  if (!inv) return ok({ granted: 0 });
  const links = await getLinksByInviter(uid);
  const p = computeProgress(links);
  if (!p.reached || inv.reward_claimed) return ok({ granted: 0 });
  const plan = ent.plan || 'L1';
  const days = (ent.member_days > 0) ? ent.member_days : (PLANS[plan] ? PLANS[plan].days : 30);
  const now = Date.now();
  const from = (ent.expires_at && new Date(ent.expires_at).getTime() > now) ? new Date(ent.expires_at).getTime() : now;
  const to = from + days * DAY;
  const hist = (ent.history || []);
  hist.unshift({ at: now, days: days, plan: plan, planName: PLANS[plan] ? PLANS[plan].name : '注册会员', from: from, to: to, src: 'invite' });
  await rdbUpdate('ry_entitle', { _id: 'eq.' + uid },
    { expires_at: iso(to), member_days: days, history: hist });
  const rewards = (inv.rewards || []);
  rewards.unshift({ at: now, days: days, plan: plan, planName: PLANS[plan] ? PLANS[plan].name : '注册会员', from: from, to: to, src: 'invite' });
  await rdbUpdate('ry_invite', { _id: 'eq.' + uid }, { reward_claimed: true, rewards: rewards });
  const ent2 = await getEntitle(uid);
  const inv2 = await getInvite(uid);
  return ok({ granted: days, planName: PLANS[plan] ? PLANS[plan].name : '注册会员', state: packState(ent2, inv2, links) });
}
async function actClaim(uid, params) {
  const n = Number(params && params.count);
  if (!isFinite(n) || n !== Math.floor(n) || n < 1 || n > 20) return fail(-1, '人数需为 1-20 的整数');
  const inv = await getInvite(uid);
  if (!inv) return fail(-2, '请先初始化权益');
  const claims = (inv.claims || []);
  const pending = claims.filter(function (x) { return x.status === 'pending'; }).length;
  if (pending >= 3) return fail(-3, '待审核工单过多，请等待处理');
  claims.unshift({ id: 'c' + Date.now() + Math.floor(Math.random() * 1000), count: n,
    names: String((params && params.names) || '').slice(0, 200), status: 'pending', approvedCount: 0, at: Date.now() });
  await rdbUpdate('ry_invite', { _id: 'eq.' + uid }, { claims: claims });
  return ok({ done: true });
}
async function actPing() {
  if (!API_KEY) throw new Error('TCB_API_KEY 未配置（请在函数环境变量里配置 API Key）');
  /* 网关连通 + API Key 有效性：读一行（只取 _id 列，最小开销） */
  const rows = await rdbSelect('ry_entitle', { select: '_id', limit: 1 });
  return ok({ ok: true, gw: true, rows: rows.length, env: ENV_ID, at: new Date().toISOString() });
}
async function actPluginsGet(token) {
  let stored = null;
  try {
    const rows = await rdbSelect('ry_kv', { _id: 'eq.' + PLUGIN_CONFIG_ID, select: 'v' });
    stored = rows[0] && rows[0].v;
  } catch (e) {
    /* Reads are intentionally surfaced so the loader can mark control unavailable. */
    throw e;
  }
  const enabled = {};
  PLUGIN_IDS.forEach(function (id) { enabled[id] = true; });
  if (stored && stored.enabled && typeof stored.enabled === 'object') {
    PLUGIN_IDS.forEach(function (id) { if (typeof stored.enabled[id] === 'boolean') enabled[id] = stored.enabled[id]; });
  }
  const uid = await verifyUid(token);
  return ok({ enabled: enabled, updatedAt: stored && stored.updatedAt || null, admin: !!(uid && PLUGIN_ADMIN_UIDS.indexOf(uid) >= 0) });
}
async function actPluginsSet(uid, body) {
  if (!uid || PLUGIN_ADMIN_UIDS.indexOf(uid) < 0) return fail(403, '无插件管理权限');
  const input = body && body.enabled;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(-1, '插件开关数据无效');
  const enabled = {};
  PLUGIN_IDS.forEach(function (id) {
    if (typeof input[id] !== 'boolean') throw new Error('缺少插件状态：' + id);
    enabled[id] = input[id];
  });
  const value = { enabled: enabled, updatedAt: new Date().toISOString(), updatedBy: uid };
  const old = await rdbSelect('ry_kv', { _id: 'eq.' + PLUGIN_CONFIG_ID, select: '_id' });
  if (old.length) await rdbUpdate('ry_kv', { _id: 'eq.' + PLUGIN_CONFIG_ID }, { v: value, updated_at: value.updatedAt });
  else await rdbInsert('ry_kv', { _id: PLUGIN_CONFIG_ID, uid: 'system', k: 'global_plugin_control', v: value, updated_at: value.updatedAt });
  return ok({ enabled: enabled, updatedAt: value.updatedAt });
}

/* ---------- [v2c] 会员规则配置（ry_kv global:member-config） ---------- */
async function actConfigGet(token) {
  const uid = await verifyUid(token);
  const r = await readMemberConfig();
  return ok({ config: r.config, updatedAt: r.updatedAt, updatedBy: r.updatedBy, admin: isAdminUid(uid), fn: FN_VERSION });
}
async function actConfigSet(uid, body) {
  if (!isAdminUid(uid)) return fail(403, '无会员管理权限');
  const cfg = sanitizeMemberConfig(body && body.config);
  const value = { trialDays: cfg.trialDays, plans: cfg.plans,
    updatedAt: new Date().toISOString(), updatedBy: uid };
  const old = await rdbSelect('ry_kv', { _id: 'eq.' + MEMBER_CONFIG_ID, select: '_id' });
  if (old.length) await rdbUpdate('ry_kv', { _id: 'eq.' + MEMBER_CONFIG_ID }, { v: value, updated_at: value.updatedAt });
  else await rdbInsert('ry_kv', { _id: MEMBER_CONFIG_ID, uid: 'system', k: 'member_config', v: value, updated_at: value.updatedAt });
  return ok({ config: cfg, updatedAt: value.updatedAt });
}

/* ---------- [v2c] 会员搜索 / 开通续期（管理员） ---------- */
async function actAdminMembers(uid, body) {
  if (!isAdminUid(uid)) return fail(403, '无会员管理权限');
  const q = String((body && body.q) || '').trim();
  let rows;
  if (q) {
    if (!/^[0-9]{4,20}$/.test(q)) return fail(-1, '搜索词需为手机号或 UID 数字串（≥4 位）');
    const orExpr = '(phone.like.*' + q + '*,_id.eq.' + q + ')';
    rows = await rdbSelect('ry_entitle', { or: orExpr, limit: 50 });
  } else {
    rows = await rdbSelect('ry_entitle', { order: 'expires_at.desc.nullslast', limit: 50 });
  }
  return ok({
    members: rows.map(function (m) {
      return { uid: m._id, plan: m.plan, expires_at: m.expires_at || null,
        member_days: m.member_days || 0, activated_at: m.activated_at || null,
        phone: maskPhone(m.phone), history: (m.history || []).slice(0, 10) };
    })
  });
}
async function actAdminMemberGrant(uid, body) {
  if (!isAdminUid(uid)) return fail(403, '无会员管理权限');
  const target = String((body && body.uid) || '').trim();
  if (!/^[0-9]{5,}$/.test(target)) return fail(-1, 'UID 无效（数字串）');
  const hasDays = body.addDays != null && body.addDays !== '';
  const hasExp = body.setExpire != null && body.setExpire !== '';
  const setExpire = hasExp ? String(body.setExpire) : null;  /* [v2c-fix] 原漏定义，走「设到期日」路径会 ReferenceError */
  const plan = body.plan ? String(body.plan) : null;
  if (!hasDays && !hasExp && !plan) return fail(-1, '请至少提供：加天数 / 设定到期日 / 调整等级 之一');
  let addDays = null;
  if (hasDays) {
    addDays = Number(body.addDays);
    if (!isFinite(addDays) || addDays < 1 || addDays > 3650 || addDays !== Math.floor(addDays))
      return fail(-1, '天数需为 1-3650 的整数');
  }
  if (plan && !PLANS[plan]) return fail(-1, '等级无效（L1/L2）');
  let ent = await getEntitle(target);
  if (!ent) {
    await ensureRows(target, null);
    ent = await getEntitle(target);
  }
  if (!ent) return fail(-2, '目标用户不存在且初始化失败');
  const now = Date.now();
  const curExp = ent.expires_at ? Date.parse(ent.expires_at) : 0;
  const from = (curExp > now) ? curExp : now;
  const newPlan = (plan && PLANS[plan]) ? plan : (ent.plan || 'L1');
  let to = from;
  let grantedDays = 0;
  if (hasExp) {
    const t = Date.parse(setExpire);
    if (!isFinite(t)) return fail(-1, '到期日无效（示例 2026-12-31）');
    to = t + DAY - 1;
    grantedDays = Math.max(0, Math.round((to - from) / DAY));
  } else if (hasDays) {
    grantedDays = Math.floor(addDays);
    to = from + grantedDays * DAY;
  }
  const planChanged = newPlan !== ent.plan;
  const hist = (ent.history || []).slice();
  hist.unshift({
    at: now, days: grantedDays, plan: newPlan, planName: PLANS[newPlan].name,
    from: from, to: to, src: 'admin',
    note: String((body && body.note) || '').slice(0, 80)
  });
  const patch = { plan: newPlan, expires_at: iso(to),
    member_days: planChanged ? PLANS[newPlan].days : (ent.member_days || 0),
    history: hist };
  await rdbUpdate('ry_entitle', { _id: 'eq.' + target }, patch);
  return ok({ member: { uid: target, plan: newPlan, expires_at: iso(to),
    member_days: patch.member_days, grantedDays: grantedDays, planChanged: planChanged } });
}

/* [v409] 管理员查看某用户的邀请绑定关系（邀请码 + 进度 + 名下 links） */
async function actAdminMemberBind(uid, body) {
  if (!isAdminUid(uid)) return fail(403, '无会员管理权限');
  const target = String((body && body.uid) || '').trim();
  if (!/^[0-9]{5,}$/.test(target)) return fail(-1, 'UID 无效（数字串）');
  const inv = await getInvite(target);
  const links = await getLinksByInviter(target);
  return ok({
    uid: target,
    code: (inv && inv.code) || '',
    progress: computeProgress(links),
    links: links.slice(0, 50)
  });
}

/* ---------- 入口 ---------- */
exports.main = async function (event) {
  try {
    /* HTTP 集成请求：body 可能是 JSON 字符串（集成）或对象（SDK 调用） */
    let body = event;
    if (event && typeof event.body === 'string') {
      try { body = JSON.parse(event.body); } catch (e) { body = {}; }
    } else if (event && event.body && typeof event.body === 'object') {
      body = event.body;
    }
    const action = String((body && body.action) || '');
    const token = (event && event.headers && (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')) || (body && body.token) || '';

    if (action === 'ping') return await actPing();

    if (action === 'pluginsGet') return await actPluginsGet(token);
    if (action === 'configGet') return await actConfigGet(token);

    const uid = await verifyUid(token);
    if (!uid) return fail(401, '登录态无效或已过期，请重新登录');

    switch (action) {
      case 'pluginsSet': return await actPluginsSet(uid, body);
      case 'configSet': return await actConfigSet(uid, body);
      case 'adminMembers': return await actAdminMembers(uid, body);
      case 'adminMemberGrant': return await actAdminMemberGrant(uid, body);
      case 'adminMemberBind': return await actAdminMemberBind(uid, body);
      case 'get':
      case 'init':    return await actGet(uid, body);
      case 'bindRef': return await actBindRef(uid, body);
      case 'grant':   return await actGrant(uid, body);
      case 'claim':   return await actClaim(uid, body);
      case 'heartbeat': return await actHeartbeat(uid);
      default: return fail(-100, '未知 action：' + action);
    }
  } catch (e) {
    return { code: 500, data: null, message: '服务异常：' + (e && e.message || String(e)) };
  }
};
