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
/* Node may provide global fetch; keep entitlement tests local and deterministic. */
global.fetch = undefined;

/* ---------- 加载被测文件 ---------- */
const file = path.join(__dirname, '..', 'runye-entitle.js');
eval(fs.readFileSync(file, 'utf8'));
const E = global.window.RyEntitle;

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

  /* ---- 场景 3：grant 发奖 + 幂等 ---- */
  console.log('\n[场景3] A 满 3 人触发 grant（续期）');
  const expireBefore = E.expireAt();
  const g1 = await E.grant();
  ok('grant 返回成功且 granted>0', g1 && g1.ok === true && g1.granted > 0, g1);
  ok('权益已续期（到期时间延后）', E.expireAt() > expireBefore, { before: expireBefore, after: E.expireAt() });
  const g2 = await E.grant();
  ok('再次 grant 幂等（granted=0）', g2 && g2.ok === true && g2.granted === 0, g2);
  ok('rewardClaimed 已置位', E.state.rewardClaimed === true, E.state.rewardClaimed);
  ok('奖励记录含续期条目', (E.state.rewards || []).length >= 1, E.state.rewards);

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
  setUser('10001', '13800138000');
  await E.refresh();
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
  E.state.entitle.plan = 'L2';
  E.state.entitle.expireAt = Date.now() + 86400000;
  ok('L2 featureKeys 覆盖全部功能', JSON.stringify(E.featureKeys()) === JSON.stringify(allFeatures), E.featureKeys());
  ok('L2 高级会员可访问基础和高级功能', allFeatures.every(f => E.can(f) && E.access(f) === 'allowed'), E.plan());
  E.state.entitle.plan = 'L1';
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
  const admin = fs.readFileSync(path.join(__dirname, '..', 'plugin-admin.html'), 'utf8');
  ok('会员规则后台把全部 L2 功能固定为仅 L2', /l1Only=hostId==='cFeatL1'&&\(k==='drawing-export'\|\|k==='bom-export'\|\|k==='hydraulic-check'\|\|k==='pro-others'\)/.test(admin));
  setUser('anon-x', '');
  await E.init(true);
  ok('匿名 trial 仅可访问 L1 基础功能', E.isTrial() && l1Features.every(f => E.can(f)) && l2Features.every(f => !E.can(f)), E.plan());
  setUser('10001', '13800138000');

  console.log('\n========================================');
  console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常:', e); process.exit(2); });
