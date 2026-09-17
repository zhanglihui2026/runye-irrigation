/* =====================================================================
 * tl_edit_pipes.test.cjs — 共享图面数据层 + 三级工作区/轴测图 双向同步回归
 * （Node，无 DOM；2026-09-15 阶段1）
 * 覆盖：
 *   A. 数据层 RyTlEditPipes：增删改/全局唯一 id/汇总/序列化往返/
 *      几何签名绑定（同几何保留、变几何清空、跨签名恢复拒绝）/订阅通知
 *   B. 三级工作区消费：渲染含手工层、红线（不改 tlDiagramData）、
 *      几何签名联动清空
 *   C. 轴测图消费：renderSVG 含 iso-manpipe 手工管线层（id/长度标注）、
 *      红线（不改 tlDiagramData）、取景变化（包围盒随手工管线外扩）
 *   D. 双向同步契约：任一侧经数据层增删，另一侧重渲染后立即可见
 * ===================================================================== */
'use strict';
const path = require('path');
const vm = require('vm');

/* —— 沙箱：window = globalThis（iso 模块靠 window.RyTlEditPipes 绑定共享层）—— */
const sandbox = { globalThis: {}, console };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
/* 裸标识符 window 必须是沙箱真正的全局（否则 iso 的 typeof window === 'undefined'，
   共享层绑定退化为空层，双向同步测不到） */
vm.runInContext('var window = globalThis;', sandbox);

function load(rel) {
  const src = require('fs').readFileSync(path.join(__dirname, '..', rel), 'utf8');
  vm.runInContext(src, sandbox, { filename: rel });
}
load('tl-workspace/tl-edit-pipes.js');
load('tl-workspace/tl-workspace.js');
load('iso-diagram/iso-diagram.js');

const EP = sandbox.globalThis.RyTlEditPipes;
const W = sandbox.RyTlWs || sandbox.globalThis.RyTlWs;
const ISO = sandbox.RyIsoDiagram || sandbox.globalThis.RyIsoDiagram;
if (!EP || !W || !ISO) { console.error('FATAL: 模块未导齐', !!EP, !!W, !!ISO); process.exit(1); }

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra !== undefined ? '（' + extra + '）' : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '（实际 ' + extra + '）' : '')); }
}
function eq(a, b, name) { ok(a === b, name, String(a) + ' vs ' + String(b)); }
function near(a, b, tol, name) { ok(Math.abs(a - b) <= (tol || 1e-9), name, String(a)); }

function mkData() {
  return {
    version: 1, world: 'meter',
    poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }],
    zones: { cols: 2, rows: 1, xPos: [0, 50, 100], yPos: [0, 50], xPlan: [50, 50], yPlan: [50], xSrc: [50, 50], ySrc: [50] },
    mainPipes: [[{ x: 5, y: 25 }, { x: 95, y: 25 }]],
    branchPipes: [[{ x: 10, y: 10 }, { x: 10, y: 40 }], [{ x: 60, y: 10 }, { x: 60, y: 40 }]],
    valves: [{ x: 10, y: 25 }, { x: 60, y: 25 }],
    dripTapes: [[{ x: 10, y: 12 }, { x: 10, y: 38 }]],
    frontPipe: [{ x: -2, y: 2 }, { x: 98, y: 2 }],
    sourcePos: { x: -2, y: 2 }
  };
}

console.log('== 共享图面数据层 + 双向同步回归 ==');

/* ---------- A. 数据层 ---------- */
console.log('—— A. 数据层 ——');
{
  const d = mkData();
  eq(EP.syncGeometry(d), 'changed', '首次绑定几何 → changed');
  const m1 = EP.add('main', [{ x: 0, y: 0 }, { x: 10, y: 0 }], 'ws');
  const m2 = EP.add('branch', [{ x: 0, y: 5 }, { x: 1, y: 5 }], 'iso');
  const m3 = EP.add('main', [{ x: 0, y: 9 }, { x: 2, y: 9 }], 'ws');
  ok(m1.id !== m2.id && m2.id !== m3.id && m1.id !== m3.id, '跨类型 id 全局唯一', m1.id + '/' + m2.id + '/' + m3.id);
  ok(EP.add('nonsense', [{ x: 0, y: 0 }, { x: 1, y: 0 }]) === null, '非法 kind 拒绝');
  ok(EP.add('main', [{ x: 0, y: 0 }]) === null, '单点拒绝');
  ok(EP.add('main', [{ x: 0, y: 0 }, { x: NaN, y: 0 }]) === null, 'NaN 点拒绝');
  const tt = EP.totals();
  eq(tt.main.n, 2, 'totals 主管 2 条'); near(tt.main.len, 12, 1e-9, 'totals 主管 12m');
  eq(tt.branch.n, 1, 'totals 支管 1 条'); eq(tt.all.n, 3, 'totals 合计 3 条');
  /* update 原位修改（改长路径） */
  ok(EP.update(m3.id, function (e) { e.pts[1] = { x: 7, y: 9 }; e.len = 7; }, 'ws') === m3, 'update 返回条目本体');
  near(m3.len, 7, 1e-9, 'update 已生效');
  ok(EP.update('M-NOPE', function () {}) === null, 'update 未知名 → null');
  /* 订阅：action/source 透传 + 防重入 */
  let evts = [];
  const off = EP.onChange(function (e) { evts.push(e.action + ':' + e.source); });
  EP.remove(m2.id, 'ws');
  ok(evts.indexOf('remove:ws') >= 0, 'onChange 透传 action:source', evts.join(','));
  off();
  EP.removeLast('iso');                 // 此时只剩 m1（m2 已 remove、m3 被 removeLast 移除）
  eq(evts.length, 1, '退订后不再收到通知');
  /* 序列化往返 */
  const s1 = EP.serialize();
  ok(s1.version === 1 && s1.geoKey && Array.isArray(s1.pipes) && s1.pipes.length === 1, 'serialize 结构', JSON.stringify(Object.keys(s1)));
  ok(EP.restore(s1) === true && EP.count() === 1, '同签名 restore 往返');
  const s2 = EP.serialize();
  eq(JSON.stringify(s2.pipes), JSON.stringify(s1.pipes), '往返内容一致');
  /* 跨签名恢复拒绝 */
  EP.syncGeometry({ version: 1, poly: [{ x: 0, y: 0 }], mainPipes: [], branchPipes: [], valves: [], frontPipe: [] });
  eq(EP.count(), 0, '几何变化 → 清空');
  ok(EP.restore(s1) === false, '跨签名 restore 拒绝（防旧几何管线复活）');
  ok(EP.reset() === false, 'reset 空层 → false');
  EP.syncGeometry(d);
  ok(EP.restore(s1) === true && EP.count() === 1, '回到原签名 restore 成功');
  /* restore 后 seq 不回退：删除后新增不复用 id */
  EP.remove(m1.id, 'ws');
  const s3 = EP.serialize();
  EP.reset();
  EP.restore(s3);
  const m4 = EP.add('branch', [{ x: 0, y: 0 }, { x: 1, y: 0 }], 'ws');
  ok(parseInt(m4.id.slice(4), 10) > parseInt(m3.id.slice(4), 10), 'restore 后计数不回退', m4.id);
  EP.reset();
}

/* ---------- B. 三级工作区消费 ---------- */
console.log('—— B. 三级工作区 ——');
{
  const d = mkData();
  const ctn = { innerHTML: '' };
  W.render(ctn, d);
  const snap0 = JSON.stringify(d);
  ok(ctn.innerHTML.indexOf('id="tlWsManual"></g>') > 0, '空层：手工层分组为空');
  const m = EP.add('main', [{ x: 20, y: 20 }, { x: 40, y: 20 }], 'iso');   // 轴测图侧插入
  W.render(ctn, d);                                                        // 工作区重渲染
  ok(ctn.innerHTML.indexOf('data-man="' + m.id + '"') > 0, '轴测侧插入 → 工作区渲染可见（双向同步）');
  ok(ctn.innerHTML.indexOf('20.0m') > 0, '长度标注在位');
  eq(JSON.stringify(d), snap0, '红线：工作区渲染不改平面数据');
  ok(W.undo() === true && W.pipes().length === 0, '工作区 undo = 数据层 removeLast');
  /* 几何签名联动：变几何重生成 → 清空 */
  const m2 = EP.add('branch', [{ x: 5, y: 5 }, { x: 8, y: 5 }], 'ws');
  const d3 = mkData(); d3.poly.push({ x: 100, y: 0 });
  W.render(ctn, d3);
  eq(EP.count(), 0, '几何签名变更 → 数据层自动清空');
  /* 同几何（新引用）→ 保留：先同步回原几何，再加管、再用新引用渲染 */
  W.render(ctn, mkData());               // geoKey 回到 d 的签名（此时层为空）
  const m3 = EP.add('main', [{ x: 0, y: 0 }, { x: 3, y: 0 }], 'ws');
  W.render(ctn, mkData());               // 又一个新引用、同几何
  eq(EP.count(), 1, '同几何不同引用 → 保留');
  EP.reset();
}

/* ---------- C/D. 轴测图消费 + 双向同步 ---------- */
console.log('—— C/D. 轴测图 + 双向同步 ——');
{
  const d = mkData();
  const snap0 = JSON.stringify(d);
  const svgEmpty = ISO.renderSVG(d);
  ok(svgEmpty && svgEmpty.indexOf('iso-manpipe') < 0, '空层：轴测图无手工管线');
  const m1 = EP.add('main', [{ x: 20, y: 20 }, { x: 40, y: 20 }], 'ws');    // 工作区侧插入
  const m2 = EP.add('branch', [{ x: 10, y: 10 }, { x: 10, y: 14 }], 'ws');
  const svg = ISO.renderSVG(d);                                              // 轴测图重渲染
  ok(svg.indexOf('data-manpipe="' + m1.id + '"') > 0, '工作区侧插入 → 轴测图渲染可见（双向同步）');
  ok(svg.indexOf('data-manpipe="' + m2.id + '"') > 0, '第二条（支管）也在');
  ok(svg.indexOf('20.0m') > 0, '长度标注在位');
  ok(svg.indexOf('#185FA5') > 0 && svg.indexOf('#16a34a') > 0, '主/支管配色与工作区一致');
  eq(JSON.stringify(d), snap0, '红线：轴测图渲染不改平面数据');
  /* 取景：手工管线在外(z 层)参与包围盒 → viewState 就绪且不含草稿 */
  const vs = ISO.getViewState();
  ok(vs && vs.k > 0, 'viewState 就绪');
  ok(svg.indexOf('isoPipeDraft') < 0, '无插入模式草稿残留');
  /* 画线模式 API 契约（无 DOM：模式状态机仍可用） */
  ok(ISO.startPipeMode('main') === 'main' && ISO.pipeModeKind() === 'main', '进入主管画线模式');
  ok(ISO.startPipeMode('main') === null && ISO.pipeModeKind() === null, '再点同款 → 退出');
  ok(ISO.startPipeMode('main') === 'main' && ISO.endPipeMode(true) === undefined && ISO.pipeModeKind() === null, 'endPipeMode 退出');
  ok(ISO.startPipeMode('nonsense') === null, '非法 kind 拒绝');
  ISO.endPipeMode(true);
  /* 拾取信息 */
  ok(ISO.selPipeInfo() === null, '未选中 → null');
  /* 通知链：数据层变更 → 两个模块订阅（Node 无 DOM 早退）不抛错 */
  let threw = false;
  try { EP.add('main', [{ x: 0, y: 0 }, { x: 1, y: 1 }], 'iso'); EP.removeLast('iso'); } catch (e) { threw = true; }
  ok(!threw, '订阅链无异常');
  EP.reset();
  eq(EP.count(), 0, '清场');
}

/* =====================================================================
 * E. 手工配件（三通/弯头，2026-09-16）：加/删/移/换向/锚点几何/
 *    宿主删除联动/序列化往返/旧存档向后兼容/非法数据拒绝
 * ===================================================================== */
console.log('== E. 手工配件（三通/弯头） ==');
(function () {
  EP.reset();
  const m = EP.add('main', [{ x: 0, y: 0 }, { x: 10, y: 0 }], 'test');
  ok(m && m.id === 'M-P01', '宿主管线就绪', m && m.id);

  /* 三通：addFit + clamp + 默认 side */
  const t = EP.addFit('tee', m.id, { atM: 5 }, 'test');
  ok(t && t.id === 'MP-F01' && t.kind === 'tee', '加三通 → MP-F01', t && t.id);
  eq(t.side, 1, '默认 side=1');
  const t2 = EP.addFit('tee', m.id, { atM: 99 }, 'test');   // 越界 clamp
  ok(t2 && t2.atM < 10 && t2.atM >= 9.9, 'atM 越界 clamp 到管长内', t2 && t2.atM);

  /* 锚点几何：三通在 (5,0)，分支 dir = 垂直宿管 */
  const a = EP.fitPos(t.id);
  ok(a && Math.abs(a.x - 5) < 1e-9 && Math.abs(a.y) < 1e-9, '三通锚点 = (5,0)', a && (a.x + ',' + a.y));
  ok(a && Math.abs(Math.abs(a.dir.x) - 0) < 1e-9 && Math.abs(Math.abs(a.dir.y) - 1) < 1e-9, '分支方向垂直宿管', a && JSON.stringify(a.dir));
  eq(a.kind, 'main', '锚点带宿主 kind');
  eq(a.hostLen, 10, '锚点带宿主管长');

  /* 换向：dir 反向 */
  const d1 = JSON.stringify(EP.fitPos(t.id).dir);
  EP.flipFit(t.id, 'test');
  const d2 = JSON.stringify(EP.fitPos(t.id).dir);
  ok(d1 !== d2, '换向后分支反向', d1 + ' → ' + d2);

  /* 弯头：end=1 在终点，dir = 沿管延伸；end=0 在起点，dir = 反向延伸 */
  const e1 = EP.addFit('elbow', m.id, { end: 1 }, 'test');
  const ae1 = EP.fitPos(e1.id);
  ok(ae1 && Math.abs(ae1.x - 10) < 1e-9 && Math.abs(ae1.y) < 1e-9, '弯头(end=1)锚点 = 终点', ae1 && (ae1.x + ',' + ae1.y));
  ok(ae1 && ae1.dir.x > 0.99, '弯头(end=1)分支沿管延伸', ae1 && JSON.stringify(ae1.dir));
  const e0 = EP.addFit('elbow', m.id, { end: 0 }, 'test');
  const ae0 = EP.fitPos(e0.id);
  ok(ae0 && Math.abs(ae0.x) < 1e-9 && ae0.dir.x < -0.99, '弯头(end=0)锚点 = 起点、反向延伸', ae0 && JSON.stringify(ae0.dir));

  /* moveFit：tee 沿管移动 */
  ok(EP.moveFit(t.id, 2.5, 'test'), 'moveFit 成功');
  eq(EP.fitById(t.id).atM, 2.5, 'atM 更新');
  ok(!EP.moveFit(e1.id, 5, 'test'), '弯头无 atM → moveFit 拒绝');

  /* 非法：未知 kind / 宿主不存在 */
  eq(EP.addFit('valve', m.id, { atM: 1 }, 'test'), null, 'valve 非手工配件 → 拒绝');
  eq(EP.addFit('tee', 'M-P99', { atM: 1 }, 'test'), null, '宿主不存在 → 拒绝');

  /* 通知/订阅链不抛错（notify 带 fits 计数） */
  let threwF = false;
  try { EP.moveFit(t.id, 7, 'test'); EP.flipFit(t.id, 'test'); } catch (e2) { threwF = true; }
  ok(!threwF, '配件订阅链无异常');

  /* 序列化往返：fits/fseq 保留 */
  const s1 = EP.serialize();
  ok(Array.isArray(s1.fits) && s1.fits.length === 4, 'serialize 带 fits', s1.fits && s1.fits.length);
  EP.reset();
  ok(EP.restore(s1, true), 'restore 往返成功');
  eq(EP.fitsList().length, 4, '配件恢复 4 条');
  ok(EP.fitPos('MP-F01') && Math.abs(EP.fitPos('MP-F01').x - 7) < 1e-9, '三通锚点恢复后几何一致');
  ok(EP.addFit('tee', 'M-P01', { atM: 1 }, 'test').id === 'MP-F05', 'fseq 恢复后不撞号');

  /* 旧存档向后兼容：无 fits 字段 → 视为空 */
  const old1 = { version: 1, geoKey: s1.geoKey, pipes: s1.pipes, seq: s1.seq };
  EP.reset();
  ok(EP.restore(old1, true), '旧存档（无 fits）恢复成功');
  eq(EP.fitsList().length, 0, '旧存档配件为空');

  /* 非法数据拒绝：坏 kind / 宿主缺失 / 重复 id */
  EP.reset();
  const mm = EP.add('branch', [{ x: 0, y: 0 }, { x: 4, y: 0 }], 'test');
  const bad1 = JSON.parse(JSON.stringify(old1)); bad1.pipes = [JSON.parse(JSON.stringify(mm))]; bad1.seq = { n: 1 }; bad1.fits = [{ id: 'MP-F01', kind: 'valve', pid: mm.id, atM: 1, side: 1 }];
  eq(EP.restore(bad1, true), false, '坏 kind 拒绝');
  const bad2 = JSON.parse(JSON.stringify(old1)); bad2.pipes = [JSON.parse(JSON.stringify(mm))]; bad2.seq = { n: 1 }; bad2.fits = [{ id: 'MP-F01', kind: 'tee', pid: 'M-P99', atM: 1, side: 1 }];
  eq(EP.restore(bad2, true), false, '宿主缺失拒绝');
  const bad3 = JSON.parse(JSON.stringify(old1)); bad3.pipes = [JSON.parse(JSON.stringify(mm))]; bad3.seq = { n: 1 }; bad3.fits = [{ id: 'MP-F01', kind: 'elbow', pid: mm.id, end: 2 }];
  eq(EP.restore(bad3, true), false, '弯头 end 非法拒绝');

  /* 宿主删除 → 配件随之 */
  EP.reset();
  const m2 = EP.add('main', [{ x: 0, y: 0 }, { x: 6, y: 0 }], 'test');
  EP.addFit('tee', m2.id, { atM: 3 }, 'test');
  EP.addFit('elbow', m2.id, { end: 1 }, 'test');
  eq(EP.fitsList().length, 2, '配件 2 条就绪');
  EP.remove(m2.id, 'test');
  eq(EP.fitsList().length, 0, '宿主删除 → 配件联动清空');

  /* clear 带配件也返回 true 并清空 */
  const m3 = EP.add('branch', [{ x: 0, y: 0 }, { x: 3, y: 0 }], 'test');
  EP.addFit('tee', m3.id, { atM: 1.5 }, 'test');
  ok(EP.clear('test'), 'clear（有管线有配件）→ true');
  eq(EP.fitsList().length, 0, 'clear 后配件为空');

  /* ws 侧：渲染含手工配件 + pickManFit 经由 api._geo 不可测（无 DOM）——几何已单测覆盖 */
  EP.reset();
  eq(EP.count(), 0, '清场');
}());

console.log('== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
process.exit(fail ? 1 : 0);
