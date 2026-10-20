/* entitle_flow.test.cjs — 会员裂变系统逻辑层跑通验证（正式回归测试）
 * 原理：mock CloudSync + 内存版 rdb 四张表（ry_entitle/ry_invite/ry_bind/ry_links），
 *       Node 加载 runye-entitle.js（无 token → 走 rdb 降级路径，恰好覆盖全部业务逻辑）。
 * 覆盖：注册初始化→邀请码生成→三人绑定→满3人→grant 续期→幂等→防刷（自邀/重复/非法码）。
 * 用法：node tests/entitle_flow.test.cjs   （零网络依赖）
 * ⚠ 链式 mock 注意：真实 rdb 是 update(...).eq(...).then(...) 链式形态，
 *    mock 的 update() 必须返回可继续 .eq 的对象（makeUpdate），否则误报业务 bug。
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- 内存版 rdb（四张表 + 链式查询） ---------- */
const tables = { ry_entitle: [], ry_invite: [], ry_bind: [], ry_links: [] };
let seq = 1;

function mockRdb() {
  function from(table) {
    const t = tables[table] || (tables[table] = []);
    function makeQuery(filters) {
      const q = {
        select() { return q; },
        eq(col, val) { filters = filters.concat([[col, val]]); return q; },
        update(patch) { return makeUpdate(filters, patch); },
        insert(row) {
          const r = Object.assign({ id: 'row' + (seq++) }, row);
          t.push(r);
          return Promise.resolve({ data: [r], error: null });
        },
        then(cb) { return exec('select').then(cb); }
      };
      function exec(kind, patch) {
        const rows = t.filter(r => filters.every(([c, v]) => r[c] === v));
        if (kind === 'update') rows.forEach(r => Object.assign(r, JSON.parse(JSON.stringify(patch))));
        return Promise.resolve({ data: rows, error: null });
      }
      q.exec = exec;
      return q;
    }
    function makeUpdate(filters, patch) {
      const u = {
        eq(col, val) { filters = filters.concat([[col, val]]); return u; },
        then(cb) { return makeQuery(filters).exec('update', patch).then(cb); },
        catch(cb) { return makeQuery(filters).exec('update', patch).catch(cb); }
      };
      return u;
    }
    return makeQuery([]);
  }
  return { from };
}

/* ---------- mock CloudSync ---------- */
let currentUid = '10001';
let currentPhone = '13800138000';
let localAdminStored = false;
const mockCloudSync = {
  ready: true,
  get uid() { return currentUid; },
  get phone() { return currentPhone; },
  authSub: () => currentUid,
  authToken: () => null,          /* 无 token → 强制走 rdb 降级路径 */
  rdb: mockRdb
};

global.window = {
  CloudSync: mockCloudSync,
  location: { search: '', hostname: 'localhost', protocol: 'file:', href: 'file:///invite.html' },
  fetch: null
};
global.location = global.window.location;
global.localStorage = {
  getItem(key) { return key === 'runyeLocalAdminSession' && localAdminStored ? '1' : null; },
  setItem(key, value) { if (key === 'runyeLocalAdminSession') localAdminStored = value === '1'; },
  removeItem(key) { if (key === 'runyeLocalAdminSession') localAdminStored = false; }
};
/* Node may provide global fetch; keep entitlement tests local and deterministic. */
global.fetch = undefined;

/* ---------- 加载被测文件 ---------- */
const file = path.join(__dirname, '..', 'runye-entitle.js');
function loadEntitle() {
  eval(fs.readFileSync(file, 'utf8'));
  return global.window.RyEntitle;
}
let E = loadEntitle();

/* ---------- 断言工具 ---------- */
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + JSON.stringify(detail) : '')); }
}
function setUser(uid, phone) { currentUid = uid; currentPhone = phone; }

/* ---------- 清理 ---------- */
function reset() {
  tables.ry_entitle.length = 0; tables.ry_invite.length = 0;
  tables.ry_bind.length = 0; tables.ry_links.length = 0;
}

(async function main() {
  console.log('== 会员裂变 · 逻辑层跑通验证 ==\n');

  /* FNV output can be only five base36 digits; keep the documented 6–8-char
     invite suffix even for a deterministic short-hash input. */
  const realNow = Date.now;
  const realRandom = Math.random;
  let shortHashCode = '';
  try {
    Date.now = () => 0;
    Math.random = () => 0;
    reset(); setUser('98', '13800138098');
    await E.init(true);
    shortHashCode = E.myCode();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    reset();
  }
  ok('短散列邀请码补齐为至少6位后缀', /^RY[0-9A-Z]{6,8}$/.test(shortHashCode), shortHashCode);

  /* ---- 场景 1：A 注册初始化 ---- */
  console.log('[场景1] A 注册初始化 → 分配邀请码');
  reset(); setUser('10001', '13800138000');
  const sA = await E.init(true);
  const codeA = E.myCode();
  ok('A 获得 L1 权益', sA && sA.entitle && sA.entitle.plan === 'L1', sA && sA.entitle);
  ok('邀请码格式 RY+6~8位大写', /^RY[0-9A-Z]{6,8}$/.test(codeA), codeA);
  ok('初始进度 0/3', E.progress().capped === 0 && E.progress().remain === 3, E.progress());

  /* ---- 场景 2：B/C/D 三人绑定 A ---- */
  console.log('\n[场景2] B/C/D 三人用 A 的码注册绑定');
  for (const [uid, ph] of [['10002', '13800138001'], ['10003', '13800138002'], ['10004', '13800138003']]) {
    setUser(uid, ph);
    await E.init(true);
    const r = await E.bindRef(codeA, false);
    if (!r || !r.ok) console.log('     [debug] _cloudLastError=', JSON.stringify(global.window._cloudLastError));
    ok(`用户${uid.slice(-2)} 绑定成功`, r && r.ok === true, r);
  }
  setUser('10001', '13800138000');
  await E.refresh();
  const p2 = E.progress();
  ok('A 进度 capped=3 / reached=true', p2.capped === 3 && p2.reached === true, p2);
  ok('A 剩余 remain=0', p2.remain === 0, p2.remain);
  ok('邀请明细 3 条且均为 valid', E.state.invites.length === 3 && E.state.invites.every(i => i.status === 'valid'), E.state.invites);

  /* ---- 场景 3：grant 发奖（v621 口径：升级 L2 + 顺延 30 天）+ 幂等 ---- */
  console.log('\n[场景3] A 满 3 人触发 grant（升级高级会员 + 30 天）');
  const expireBefore = E.expireAt();
  const g1 = await E.grant();
  ok('grant 返回成功且 granted>0', g1 && g1.ok === true && g1.granted > 0, g1);
  ok('奖励天数为 30 天', g1 && g1.granted === 30, g1);
  ok('奖励等级为高级会员（L2）', g1 && g1.planName === '高级会员', g1);
  ok('权益等级已升级为 L2', E.plan() === 'L2', E.plan());
  ok('高级功能全部解锁（出图/清单/水利校验）',
    ['drawing-export', 'bom-export', 'hydraulic-check'].every(f => E.can(f) && E.access(f) === 'allowed'),
    ['drawing-export', 'bom-export', 'hydraulic-check'].map(f => [f, E.can(f)]));
  ok('有效期在原到期日基础上顺延 30 天',
    Math.round((E.expireAt() - expireBefore) / 86400000) === 30,
    { before: expireBefore, after: E.expireAt(), days: (E.expireAt() - expireBefore) / 86400000 });
  const g2 = await E.grant();
  ok('再次 grant 幂等（granted=0）', g2 && g2.ok === true && g2.granted === 0, g2);
  ok('rewardClaimed 已置位', E.state.rewardClaimed === true, E.state.rewardClaimed);
  const rw = (E.state.rewards || [])[0] || {};
  ok('奖励记录为「高级会员 30 天」', rw.plan === 'L2' && rw.days === 30 && rw.src === 'invite', rw);

  /* ---- 场景 4：防刷规则 ---- */
  console.log('\n[场景4] 防刷：自邀 / 重复绑定 / 非法码');
  setUser('10001', '13800138000');
  const selfR = await E.bindRef(codeA, false);
  ok('自邀被拒 code=-4', selfR && selfR.code === -4, selfR);
  setUser('10005', '13800138004');
  await E.init(true);
  const dup1 = await E.bindRef(codeA, false);
  const dup2 = await E.bindRef(codeA, false);
  ok('首次绑定成功', dup1 && dup1.ok === true, dup1);
  ok('同一邀请码重复绑定 = 幂等重试（existed，不报错）', dup2 && dup2.ok === true && dup2.existed === true, dup2);
  /* 绑不同邀请人的码 → 报 -2（不可变更） */
  setUser('10006', '13800138005');
  await E.init(true);
  const codeX = 'RYABCDEF1';
  await (async () => { /* 造一个第三方的有效绑定行 */ const m = global.window.CloudSync.rdb();
    await m.from('ry_bind').insert({ code: codeX, uid: '19999' }); })();
  const other1 = await E.bindRef(codeA, false);
  const other2 = await E.bindRef(codeX, false);
  ok('10006 绑 A 成功', other1 && other1.ok === true, other1);
  ok('换绑其他邀请人报 -2', other2 && other2.code === -2, other2);
  const bad1 = await E.bindRef('NOTACODE', false);
  ok('非法码被拒 code=-1', bad1 && bad1.code === -1, bad1);
  const bad2 = await E.bindRef('RY00000000', false);
  ok('不存在的码被拒 code=-3', bad2 && bad2.code === -3, bad2);

  /* ---- 场景 5：功能门控判定 ---- */
  console.log('\n[场景5] 功能门控判定');
  /* 场景 3 之后 A 已被升级为 L2，这里另起一个干净用户验证 L1 门控 */
  setUser('10009', '13800138008');
  await E.init(true);
  ok('新注册用户初始等级仍是 L1', E.plan() === 'L1' && !E.can('drawing-export'), E.plan());
  const l1Features = ['zone-split', 'ai-plan', 'pipe-layout', 'online-map'];
  const l2Features = ['drawing-export', 'bom-export', 'hydraulic-check', 'pro-others'];
  const allFeatures = l1Features.concat(l2Features);
  ok('L1 featureKeys 与门控矩阵完全一致', JSON.stringify(E.featureKeys()) === JSON.stringify(l1Features), E.featureKeys());
  ok('L1 注册会员可访问基础功能', l1Features.every(f => E.can(f)), E.plan());
  ok('L1 注册会员不能访问任何高级功能', l2Features.every(f => !E.can(f) && E.access(f) === 'denied'), E.plan());
  const l1Plan = E.PLAN_FEATURES.L1;
  E.PLAN_FEATURES.L1 = l1Features.concat(l2Features);
  ok('L1 即使规则误配也不能获得任何 L2 功能或高级通配权限', l2Features.every(f => !E.canWith('L1', f)), E.PLAN_FEATURES.L1);
  E.PLAN_FEATURES.L1 = l1Plan;
  /* 通过产品提供的本地专用联调入口模拟 L2，不篡改被冻结的生产状态快照。 */
  localAdminStored = true;
  global.window.location.search = '?rymock=L2';
  E = loadEntitle();
  ok('L2 featureKeys 覆盖全部功能', JSON.stringify(E.featureKeys()) === JSON.stringify(allFeatures), E.featureKeys());
  ok('L2 高级会员可访问基础和高级功能', allFeatures.every(f => E.can(f) && E.access(f) === 'allowed'), E.plan());
  localAdminStored = false;
  global.window.location.search = '';
  E = loadEntitle();
  E.reset();
  ok('权益未同步时所有受限功能均为 pending', allFeatures.every(f => E.access(f) === 'pending'), allFeatures.map(f => [f, E.access(f)]));
  const fileMenu = fs.readFileSync(path.join(__dirname, '..', 'mod', 'inline-32.js'), 'utf8');
  ok('文件菜单 pending 状态显示同步中并阻止动作', /status === 'pending'[\s\S]*?正在同步会员权益，请稍后重试。[\s\S]*?·同步中[\s\S]*?data-ry-pending/.test(fileMenu), '检查 pending 提示、标记和同步中标签');
  const iso = fs.readFileSync(path.join(__dirname, '..', 'feature-archive', '三维与轴测图', 'source', 'iso-diagram', 'iso-diagram.js'), 'utf8');
  ok('归档轴测图 SVG 下载与打印入口仍校验高级权益', /function downloadSVG\(\)\s*\{\s*if \(!requireDrawingExport\(\)\) return;/.test(iso) && /function printSVG\(\)\s*\{\s*if \(!requireDrawingExport\(\)\) return;/.test(iso));
  const headDiagram = fs.readFileSync(path.join(__dirname, '..', 'mod', 'inline-14.js'), 'utf8');
  ok('首部系统图 SVG、PNG 和打印入口均校验高级权益', /function exportSVG\(\)\s*\{\s*if \(!requireHeadExport\(\)\) return;/.test(headDiagram) && /function exportPNG\(\)\s*\{\s*if \(!requireHeadExport\(\)\) return;/.test(headDiagram) && /hmPrint'\)\.addEventListener\('click', function \(\) \{ if \(requireHeadExport\(\)\) window\.print\(\); \}/.test(headDiagram));
  const cloudFn = fs.readFileSync(path.join(__dirname, '..', 'cloudfn', 'ryEntitle-v2', 'index.js'), 'utf8');
  ok('服务端规则清洗会从 L1 移除 CAD、BOM 和高级通配权限', /const allowed = k === 'L1' \? L1_FEATURE_KEYS : FEATURE_KEYS/.test(cloudFn));
  /* [v621] 裂变奖励口径三处必须同源：前端常量 / 服务端常量 / 服务端写库字段 */
  const selfSrc = fs.readFileSync(path.join(__dirname, '..', 'runye-entitle.js'), 'utf8');
  ok('前端裂变奖励口径为 L2 + 30 天',
    /INVITE_REWARD_PLAN = 'L2'/.test(selfSrc) && /INVITE_REWARD_DAYS = 30/.test(selfSrc));
  ok('服务端 actGrant 同时写 plan 与到期时间（只写到期会出现「说升级、判 L1」）',
    /INVITE_REWARD_PLAN = 'L2'/.test(cloudFn) && /plan: plan, expires_at: iso\(to\)/.test(cloudFn));
  const inviteH5 = fs.readFileSync(path.join(__dirname, '..', 'invite.html'), 'utf8');
  ok('邀请页规则与实现一致：升级高级会员 + 顺延 30 天，且不再宣称「等级不变」',
    /自动升级为高级会员（L2）/.test(inviteH5) && /顺延 30 天/.test(inviteH5) && !/等级不变/.test(inviteH5));
  const memberUi = fs.readFileSync(path.join(__dirname, '..', 'runye-member-ui.js'), 'utf8');
  ok('PC 会员面板也会触发发奖（原先只有 H5 一个调用点）',
    /function maybeGrantReward/.test(memberUi) && /en\.grant\(\)/.test(memberUi));
  const admin = fs.readFileSync(path.join(__dirname, '..', 'plugin-admin.html'), 'utf8');
  ok('会员规则后台把全部 L2 功能固定为仅 L2', /l1Only=hostId==='cFeatL1'&&\(k==='drawing-export'\|\|k==='bom-export'\|\|k==='hydraulic-check'\|\|k==='pro-others'\)/.test(admin));
  /* [v623] 注册人员统计：接口必须存在、必须限管理员、必须由 SQL 迁移提供两个时间列 */
  ok('服务端提供注册人员统计接口且限管理员',
    /case 'adminMemberStats'/.test(cloudFn) && /async function actAdminMemberStats[\s\S]{0,160}?isAdminUid\(uid\)/.test(cloudFn));
  const sqlV6 = fs.readFileSync(path.join(__dirname, '..', 'sql', 'route_c_migration_v6_member_stats.sql'), 'utf8');
  ok('v6 迁移为统计补齐 created_at / last_seen_at',
    /add column if not exists created_at/.test(sqlV6) && /add column if not exists last_seen_at/.test(sqlV6));
  ok('管理后台会员页含统计卡与分页（走 adminMemberStats）',
    /id="mKpis"/.test(admin) && /id="mTrend"/.test(admin) && /adminMemberStats/.test(admin));
  setUser('anon-x', '');
  await E.init(true);
  ok('匿名 trial 仅可访问 L1 基础功能', E.isTrial() && l1Features.every(f => E.can(f)) && l2Features.every(f => !E.can(f)), E.plan());
  setUser('10001', '13800138000');

  console.log('\n========================================');
  console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常:', e); process.exit(2); });
