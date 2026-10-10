'use strict';
/* ============================================================
   ryEntitle v2 —— 润野灌溉 · 会员权益与邀请裂变（服务端权威版）
   ------------------------------------------------------------
   [v2 2026-10-11] 随「方案二」改造：数据源从云存储切换为 PG 表
   （ry_entitle / ry_invite / ry_bind / ry_links），通过 DATABASE_URL
   直连数据库（owner 身份，天然越过 RLS —— 服务端权威写）。
   前端只传意图（action + 参数），一切判定在本函数内完成：
     - bindRef  提交邀请码（自邀/-4、重复/-2、码不存在/-3 全部服务端判）
     - grant    满 3 人发奖（服务端算进度，reward_claimed 幂等锁）
     - claim    漏计核销工单
     - get/init 拉取权益与进度（init 顺带建行）
     - heartbeat存量行迁移（registered/cooling → valid）
     - ping     无需登录的健康检查（部署验收用）
   鉴权：前端带 Authorization: Bearer <access_token>（登录态 JWT），
   本函数用同一 token 调 auth 网关 /auth/v1/user 反查 uid —— 前端无法伪造身份。
   触发方式：HTTP 访问服务路由（POST，JSON body {action, ...}）。
   返回：{ code, data, message }
   ============================================================ */

const { Client } = require('pg');

/* ---------- 配置（环境变量优先，缺省即润野环境） ---------- */
const ENV_ID   = process.env.CLB_ENV_ID   || 'runye-irrigation-d3e8xef4540bae5';
const REGION   = process.env.CLB_REGION   || 'ap-shanghai';
/* auth 网关（与前端 SDK 同源，JWT 反查用户） */
const AUTH_USER_URL = 'https://' + ENV_ID + '.' + REGION + '.tcb-api.tencentcloudapi.com/web/auth/v1/user';

/* ---------- 业务常量（与 runye-entitle.js v367 同构） ---------- */
const CAP = 3;                    // 邀请注册 + 群裂变 共享上限
const TRIAL_DAYS = 30;            // L1 注册会员初始天数
const DAY = 86400000;
const PLANS = {
  L1: { key: 'L1', name: '注册会员', days: 30 },
  L2: { key: 'L2', name: '高级会员', days: 365 }
};
const PWD_RULE = /^[A-Za-z0-9_\-!@#$%^&*.]{8,32}$/;   // 备用（当前无密码 action）

/* ---------- 数据库 ---------- */
function dbConf() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未配置（请在函数环境变量里配置 PG 连接串）');
  return { connectionString: url, statement_timeout: 8000, connectionTimeoutMillis: 8000 };
}
async function withDb(fn) {
  const c = new Client(dbConf());
  await c.connect();
  try { return await fn(c); } finally { try { await c.end(); } catch (e) {} }
}

/* ---------- 身份：JWT → uid ---------- */
async function httpJson(url, token) {
  const res = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body };
}
async function verifyUid(token) {
  if (!token) return null;
  try {
    let r = await httpJson(AUTH_USER_URL, token);
    if (r.status === 200 && r.body && (r.body.id || r.body.uid)) return String(r.body.id || r.body.uid);
    /* 兜底：换 auth 网关（与 rdb 同源）再试一次 */
    r = await httpJson('https://' + ENV_ID + '.api.tcloudbasegateway.com/auth/v1/user', token);
    if (r.status === 200 && r.body && (r.body.id || r.body.uid)) return String(r.body.id || r.body.uid);
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

/* ---------- 数据访问 ---------- */
async function getEntitle(c, uid) {
  const r = await c.query('select * from ry_entitle where _id=$1', [uid]);
  return r.rows[0] || null;
}
async function getInvite(c, uid) {
  const r = await c.query('select * from ry_invite where _id=$1', [uid]);
  return r.rows[0] || null;
}
async function getLinksByInviter(c, uid) {
  const r = await c.query('select * from ry_links where inviter_uid=$1 order by id desc', [uid]);
  return r.rows;
}
async function ensureRows(c, uid, phone) {
  let ent = await getEntitle(c, uid);
  if (!ent) {
    const now = new Date();
    const hist = [{ at: Date.now(), days: TRIAL_DAYS, plan: 'L1', planName: '注册会员', from: Date.now(), to: Date.now() + TRIAL_DAYS * DAY, src: 'register' }];
    await c.query(
      'insert into ry_entitle (_id, plan, expires_at, member_days, activated_at, phone, history) values ($1,$2,$3,$4,$5,$6,$7) on conflict (_id) do nothing',
      [uid, 'L1', iso(Date.now() + TRIAL_DAYS * DAY), TRIAL_DAYS, iso(now), phone || null, JSON.stringify(hist)]
    );
    ent = await getEntitle(c, uid);
  }
  let inv = await getInvite(c, uid);
  if (!inv) {
    let code = makeCode(uid), guard = 0;
    while (guard++ < 5) {
      try {
        await c.query('insert into ry_invite (_id, uid, code, inviter, reward_claimed, claims, rewards) values ($1,$2,$3,$4,false,$5,$6)',
          [uid, uid, code, '', JSON.stringify([]), JSON.stringify([])]);
        break;
      } catch (e) {
        if (String(e.message || '').indexOf('ry_invite_code_uq') >= 0 || String(e.code) === '23505') { code = makeCode(uid + guard); continue; }
        throw e;
      }
    }
    await c.query('insert into ry_bind (code, uid) values ($1,$2) on conflict (code) do nothing', [code, uid]);
    inv = await getInvite(c, uid);
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
async function actGet(c, uid, params) {
  const phone = params && params.phone;
  const { ent, inv } = await ensureRows(c, uid, phone);
  const links = await getLinksByInviter(c, uid);
  return ok(packState(ent, inv, links));
}
async function actBindRef(c, uid, params) {
  const ref = String((params && params.ref) || '').trim();
  const phone = params && params.phone;
  if (ref.indexOf('RY') !== 0) return fail(-1, '邀请码格式不正确');
  const br = await c.query('select uid from ry_bind where code=$1', [ref]);
  const bind = br.rows[0];
  if (!bind || !bind.uid) return fail(-3, '邀请码不存在或已失效');
  if (String(bind.uid) === String(uid)) return fail(-4, '不能绑定自己为邀请人');
  const { inv } = await ensureRows(c, uid, phone);
  if (inv.inviter && inv.inviter !== ref) return fail(-2, '已绑定其他邀请人，不可变更');
  const same = await c.query('select id from ry_links where invited_uid=$1 and (inviter_uid=$2 or code=$3)', [uid, bind.uid, ref]);
  if (same.rows.length) {
    if (!inv.inviter) await c.query('update ry_invite set inviter=$1 where _id=$2', [ref, uid]); /* 修复：links 在而 inviter 空的半程态 */
    const links = await getLinksByInviter(c, bind.uid); /* 不会走到——返回给前端的应是自己的进度 */
    const own = await getLinksByInviter(c, uid);
    const ent2 = await getEntitle(c, uid);
    const inv2 = await getInvite(c, uid);
    return ok(packState(ent2, inv2, own), '已绑定（修复半程态）');
  }
  const other = await c.query('select id from ry_links where invited_uid=$1', [uid]);
  if (other.rows.length) return fail(-2, '已绑定其他邀请人，不可变更');
  /* [v367] 注册即激活：直写 valid */
  await c.query(
    'insert into ry_links (inviter_uid, invited_uid, code, status, activated_at, nick, via_group) values ($1,$2,$3,$4,$5,$6,$7)',
    [bind.uid, uid, ref, 'valid', new Date().toISOString(), maskPhone(phone) || ('用户' + String(uid).slice(-4)), !!(params && params.viaGroup)]
  );
  if (!inv.inviter) await c.query('update ry_invite set inviter=$1 where _id=$2', [ref, uid]);
  const ent = await getEntitle(c, uid);
  const inv2 = await getInvite(c, uid);
  const own = await getLinksByInviter(c, uid);
  return ok(packState(ent, inv2, own));
}
async function actHeartbeat(c, uid) {
  const ent = await getEntitle(c, uid);
  if (ent && !ent.activated_at) await c.query('update ry_entitle set activated_at=$1 where _id=$2', [new Date().toISOString(), uid]);
  /* 存量行迁移：自己的非 valid links 行推进为 valid */
  await c.query("update ry_links set status='valid', activated_at=coalesce(activated_at, now()) where invited_uid=$1 and status <> 'valid'", [uid]);
  return ok({ done: true });
}
async function actGrant(c, uid, params) {
  const phone = params && params.phone;
  const { ent, inv } = await ensureRows(c, uid, phone);
  if (!inv) return ok({ granted: 0 });
  const links = await getLinksByInviter(c, uid);
  const p = computeProgress(links);
  if (!p.reached || inv.reward_claimed) return ok({ granted: 0 });
  const plan = ent.plan || 'L1';
  const days = (ent.member_days > 0) ? ent.member_days : (PLANS[plan] ? PLANS[plan].days : 30);
  const now = Date.now();
  const from = (ent.expires_at && new Date(ent.expires_at).getTime() > now) ? new Date(ent.expires_at).getTime() : now;
  const to = from + days * DAY;
  const hist = (ent.history || []);
  hist.unshift({ at: now, days: days, plan: plan, planName: PLANS[plan] ? PLANS[plan].name : '注册会员', from: from, to: to, src: 'invite' });
  await c.query('update ry_entitle set expires_at=$1, member_days=$2, history=$3 where _id=$4',
    [iso(to), days, JSON.stringify(hist), uid]);
  const rewards = (inv.rewards || []);
  rewards.unshift({ at: now, days: days, plan: plan, planName: PLANS[plan] ? PLANS[plan].name : '注册会员', from: from, to: to, src: 'invite' });
  await c.query('update ry_invite set reward_claimed=true, rewards=$1 where _id=$2', [JSON.stringify(rewards), uid]);
  const ent2 = await getEntitle(c, uid);
  const inv2 = await getInvite(c, uid);
  return ok({ granted: days, planName: PLANS[plan] ? PLANS[plan].name : '注册会员', state: packState(ent2, inv2, links) });
}
async function actClaim(c, uid, params) {
  const n = Number(params && params.count);
  if (!isFinite(n) || n !== Math.floor(n) || n < 1 || n > 20) return fail(-1, '人数需为 1-20 的整数');
  const inv = await getInvite(c, uid);
  if (!inv) return fail(-2, '请先初始化权益');
  const claims = (inv.claims || []);
  const pending = claims.filter(x => x.status === 'pending').length;
  if (pending >= 3) return fail(-3, '待审核工单过多，请等待处理');
  claims.unshift({ id: 'c' + Date.now() + Math.floor(Math.random() * 1000), count: n,
    names: String((params && params.names) || '').slice(0, 200), status: 'pending', approvedCount: 0, at: Date.now() });
  await c.query('update ry_invite set claims=$1 where _id=$2', [JSON.stringify(claims), uid]);
  return ok({ done: true });
}
async function actPing() {
  return await withDb(async c => {
    const r = await c.query('select now() as t');
    return ok({ ok: true, dbTime: r.rows[0].t, env: ENV_ID });
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

    const uid = await verifyUid(token);
    if (!uid) return fail(401, '登录态无效或已过期，请重新登录');

    return await withDb(async c => {
      switch (action) {
        case 'get':
        case 'init':    return await actGet(c, uid, body);
        case 'bindRef': return await actBindRef(c, uid, body);
        case 'grant':   return await actGrant(c, uid, body);
        case 'claim':   return await actClaim(c, uid, body);
        case 'heartbeat': return await actHeartbeat(c, uid);
        default: return fail(-100, '未知 action：' + action);
      }
    });
  } catch (e) {
    return { code: 500, data: null, message: '服务异常：' + (e && e.message || String(e)) };
  }
};
