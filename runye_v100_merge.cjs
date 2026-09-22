/* v100 联合分区合并 · 真实渲染闸门（Edge headless + CDP）
   ─────────────────────────────────────────────────────────────────────
   用户口径（2026-09-21）：
     「联合分区手动合并之后 变成新的分区，要求只能调整垂直于管道的联合灌溉区分界线，
       调整之后，联合灌溉分区计算的面积要随之调整，调整之后原来的小分区就不显示了，
       就显示新的联合灌溉分区。」

   本闸门证的就是这四句：
     ①「变成新的分区 / 原来的小分区就不显示了」——
        · 无手动分组时：小分区标注在位（基线，证明断言不是恒绿）；
        · 有手动分组时：组内小分区标注全部消失、组内格边框被去掉、简图那层分区线整层撤掉，
          画面上只剩「每组一条」组级标注（data-tlunion）。
     ②「只显示新的联合灌溉分区」——组级标注数量 = 手动组数，文字为 M{n} · 区 a/b + 面积亩。
     ③（v106 2026-09-22 口径）分界线**两轴都可拖** —— 平行于主管的轴「整条一起动」（写共享网格，
        二级/三级同步）；垂直于管道的轴走 v98h 阶梯（拖哪段动哪段）。data-cutlock 不再产生。
        另补两个 v106 场景：⑥ 留两个未分组区 ⇒ 未分组区之间的分割线（data-ugb）照常显示；
        联合流量底下的「依据行」（联合分区 M + 亩）要显示。
     ④「面积要随之调整」——真拖之后：组级标注里的亩数变化，且与独立算出的
        ryZoneAreaGroups(并入阶梯覆盖表) 分组面积逐位一致；未被牵连的组面积不动。

   纪律（~/.workbuddy/MEMORY.md「注入体检」）：
     · 4 组缺陷注入都改在**真实出错的那一行**（tl-workspace.js 源码），跑完**信号安全还原**；
     · 逐个跑，不串跑（串跑被 SIGTERM 打断会把注入留在盘上）；
     · 注入模式：断言按预期变红 ⇒ EXIT=0 才算体检通过（恒绿 = 断言无效）。
   用法：
     node runye_v100_merge.cjs                     # 正常跑（全绿 EXIT=0）
     node runye_v100_merge.cjs --inject=merge      # 并区呈现退化为空操作 → ①② 必红
     node runye_v100_merge.cjs --inject=lock       # 阶梯判据恒真（平行轴也分段拖）→ ③「整条动」必红
     node runye_v100_merge.cjs --inject=axis       # 管向恒为 h → ③（轴选择）必红
     node runye_v100_merge.cjs --inject=area       # 组面积恒 0 → ④ 必红
   产出：shots_v100/*.png + 控制台断言
*/
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9353;
const DIR = __dirname;
const WSFILE = path.join(DIR, 'tl-workspace', 'tl-workspace.js');
const PAGE = 'file:///' + path.join(DIR, 'index.html').replace(/\\/g, '/');
const OUTDIR = path.join(DIR, 'shots_v100');

const INJ = (process.argv.find(a => a.startsWith('--inject=')) || '').split('=')[1] || '';

/* ── 注入表：锚点 → 插入串（都改在真实出错的那一行） ───────────────── */
const INJECTIONS = {
  /* 并区呈现整体退化：正是「小分区还在显示」这个用户报的症状 */
  merge: { anchor: '  function tlMergeCloneZones(clone) {', insert: ' if (true) return;', want: 1 },
  /* v106：阶梯判据恒真 ⇒ 平行轴也走「拖哪段动哪段」⇒ ③ 的「整条一起动」必红 */
  lock: { anchor: '  function tlGbStepAxis(axis, data) {', insert: ' return true;', want: 1 },
  /* 管向判反：锁定轴与被允许轴互换 */
  axis: { anchor: '  function tlPipeAxis(data) {', insert: " return 'h';", want: 1 },
  /* 组面积恒 0：标注里的亩数不再随几何变化 */
  area: { anchor: '  function tlGroupMu(cells, mg, g) {', insert: " return '0.0';", want: 1 },
};

let ORIG = null;
let restoreDone = false;
function restoreInj() {
  if (restoreDone) return;
  restoreDone = true;
  if (ORIG === null) return;
  try { fs.writeFileSync(WSFILE, ORIG); console.log('[注入还原] tl-workspace.js 已按原内容写回'); }
  catch (e) { console.error('[注入还原失败] ' + e.message); }
}
process.on('exit', restoreInj);
process.on('SIGINT', () => { restoreInj(); process.exit(130); });
process.on('SIGTERM', () => { restoreInj(); process.exit(143); });

function applyInjection() {
  if (!INJ) return;
  const spec = INJECTIONS[INJ];
  if (!spec) { console.error('未知注入：' + INJ + '（可选 ' + Object.keys(INJECTIONS).join(' / ') + '）'); process.exit(2); }
  ORIG = fs.readFileSync(WSFILE, 'utf8');                       /* 先留原样，供信号安全还原 */
  const cnt = ORIG.split(spec.anchor).length - 1;
  if (cnt !== spec.want) { console.error('注入锚点应命中 ' + spec.want + ' 处，实到 ' + cnt); process.exit(2); }
  fs.writeFileSync(WSFILE, ORIG.replace(spec.anchor, spec.anchor + spec.insert));
  console.log('=== 注入缺陷：' + INJ + '（改 ' + spec.want + ' 处） ===');
}

function httpGet(u) { return new Promise((res, rej) => { http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function cdpClient(url) {
  const pending = new Map(); const ev = []; let id = 0;
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    ws.addEventListener('error', e => reject(e.error || new Error('ws')));
    ws.addEventListener('message', m => {
      const msg = JSON.parse(m.data.toString());
      if (msg.id !== undefined && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      else if (msg.method) ev.push(msg);
    });
    ws.addEventListener('open', () => {
      const send = (method, params = {}) => { const myid = ++id; const pr = new Promise((res, rej) => pending.set(myid, { resolve: res, reject: rej })); ws.send(JSON.stringify({ id: myid, method, params })); return pr; };
      resolve({ ws, events: ev, send, close: () => ws.close() });
    });
  });
}

/* ── 页面内脚本 ────────────────────────────────────────────────────
   场景 240×300（2列×4行），分组 [[0,2],[1,3],[4,5],[6,7]]：
     由「列配对 + 行配对」混搭 ⇒ **两个轴都有组边界线**，才能同时证「一轴锁、另一轴可拖」。
     期望：x/1 两段（lane 0/1）为竖线；y/2、y/3 各两段为横线。 */
const PAGE_JS = `(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = { inject: ${JSON.stringify(INJ)}, alerts: [] };
  window.alert = m => out.alerts.push(String(m));
  window.measuredPolygon = [{x:0,y:0},{x:240,y:0},{x:240,y:300},{x:0,y:300}];
  window.runyePlanDims = { A: 240, B: 300 };
  const pm = document.getElementById('planZoneMode'); if (pm) pm.value = 'auto';
  const pn = document.getElementById('planN'); if (pn) pn.value = '4';
  const fn = document.getElementById('fld_N'); if (fn) fn.value = '4';
  window.RunyeBridge.state.zoneRotated = false; window.RunyeBridge.state.plotRotationDeg = 0;
  window.ppLoadPolygon();
  const c0 = window.RunyeBridge.getCuts();
  const cols = c0.cols, rows = c0.rows, total = cols * rows;
  out.cols = cols; out.rows = rows;

  /* ── 基线：无手动分组（小分区必须照旧显示） ── */
  window.tlManualGroups = [];
  window.tlAutoGenerate({ scroll: false });
  await raf2();
  const cntSmall = () => {
    const cv = document.getElementById('tlWsCanvas');
    if (!cv) return -1;
    return Array.from(cv.querySelectorAll('text'))
      .filter(t => /^(?:\\d+|G\\d+·\\d+|单·\\d+)区/.test((t.textContent || '').trim())).length;
  };
  out.baseSmallLabels = cntSmall();

  /* ── 手动合并：[[0,2],[1,3],[4,5],[6,7]] ── */
  const G = [[0, cols], [1, cols + 1], [2 * cols, 2 * cols + 1], [3 * cols, 3 * cols + 1]];
  out.groups = G;
  window.tlManualGroups = G;
  window.tlAutoGenerate({ scroll: false });
  await raf2();
  if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws');
  await raf2(); await raf2();

  out.axis = window.RyTlWs._v100.pipeAxis();

  const cv = document.getElementById('tlWsCanvas');
  out.hasCanvas = !!cv;
  if (!cv) return out;

  /* 世界坐标（米）→ 屏幕坐标：每次重查 svg（重渲染会换掉元素）并读当时的 CTM */
  function w2s(wx, wy) {
    const el = document.querySelector('#tlWsCanvas svg');
    const pv = window.tlPlanView;
    const OX = pv.ox / pv.s - pv.minX, OY = pv.oy / pv.s - pv.minY;
    const u = el.createSVGPoint(); u.x = (wx + OX) * pv.s; u.y = (wy + OY) * pv.s;
    const q = u.matrixTransform(el.getScreenCTM()); return { x: q.x, y: q.y };
  }
  function pe(type, p) { return new PointerEvent(type, { clientX: p.x, clientY: p.y, pointerId: 9, button: 0, buttons: 1, bubbles: true, cancelable: true }); }
  out.smallLabels = cntSmall();
  out.unionTexts = Array.from(cv.querySelectorAll('text[data-tlunion]'))
    .map(t => ({ g: t.getAttribute('data-tlunion'), txt: (t.textContent || '').trim() }));

  /* 组内小分区的格边框必须被去掉（同组连成一片） */
  const gset = {}; G.forEach((a, i) => a.forEach(z => gset[z] = i));
  out.rectStroke = Array.from(cv.querySelectorAll('rect[data-zi]')).map(r => ({
    zi: +r.getAttribute('data-zi'), grouped: gset[+r.getAttribute('data-zi')] !== undefined,
    stroke: r.getAttribute('stroke')
  }));
  /* 简图那层细虚线分区线（在工作区克隆底图里必须整层消失） */
  out.leftoverZoneLines = Array.from(cv.querySelectorAll('g'))
    .filter(g => g.getAttribute('stroke') === '#334155' && g.getAttribute('stroke-dasharray') === '7,5').length;

  /* ── 组边界线段：轴 / 索引 / 段号 / 是否锁定 ── */
  const segs = () => Array.from(cv.querySelectorAll('#tlWsZoneCuts line[data-cutaxis]')).map(l => ({
    axis: l.getAttribute('data-cutaxis'), index: +l.getAttribute('data-cutindex'),
    lane: +l.getAttribute('data-cutlane'), lock: l.getAttribute('data-cutlock') === '1',
    stroke: l.getAttribute('stroke'), cursor: (l.getAttribute('style') || '')
  }));
  out.segs = segs();
  out.lockAxes = Array.from(new Set(out.segs.filter(s => s.lock).map(s => s.axis))).sort();
  out.freeAxes = Array.from(new Set(out.segs.filter(s => !s.lock).map(s => s.axis))).sort();
  out.lockedAllDashed = out.segs.filter(s => s.lock).every(s => s.stroke === '#94a3b8' && /not-allowed/.test(s.cursor));

  /* ── 独立算一遍各组面积（把阶梯覆盖表并入共享网格 —— 与页面同口径） ── */
  const stepCuts = () => {
    const c = window.RunyeBridge.getCuts();
    const st = window.tlZoneStep;
    if (st && st.sig && window.tlZoneGridSig && st.sig === window.tlZoneGridSig(c)) { c.cutOffX = st.x; c.cutOffY = st.y; }
    return c;
  };
  const groupMus = () => {
    const c = stepCuts();
    const gg = window.ryZoneAreaGroups(c, window.measuredPolygon, c.cols * c.rows);
    return G.map(g => +(g.reduce((a, z) => a + (gg.cells[z] || 0), 0) / 666.67).toFixed(1));
  };
  out.musBefore = groupMus();
  const labelMu = () => {
    const m = {};
    Array.from(cv.querySelectorAll('text[data-tlunion]')).forEach(t => {
      const tx = (t.textContent || '').trim();
      if (/亩$/.test(tx)) m[t.getAttribute('data-tlunion')] = parseFloat(tx.replace('亩', ''));
    });
    return m;
  };
  out.labelMuBefore = labelMu();

  /* ── ③b+④ 真实指针拖「可拖的横线」y/2 的第 0 列那一段 ── */
  const freeSeg = cv.querySelector('#tlWsZoneCuts line[data-cutaxis="y"][data-cutindex="2"][data-cutlane="0"]');
  out.freeSegFound = !!freeSeg;
  if (freeSeg) {
    /* 落点取列 0 的 3/4 处（离 zone 中心的主/支管最远，避免被「整条拖管」分支抢走命中） */
    const wx = c0.xPos[0] + (c0.xPos[1] - c0.xPos[0]) * 0.75;
    const A = w2s(wx, c0.yPos[2]);
    const B = w2s(wx, c0.yPos[2] + 20);
    out.segsBefore = Array.from(cv.querySelectorAll('#tlWsZoneCuts line[data-cutaxis="y"][data-cutindex="2"]'))
      .map(l => l.getAttribute('y1') + '@' + l.getAttribute('data-cutlane'));
    cv.dispatchEvent(pe('pointerdown', A));
    cv.dispatchEvent(pe('pointermove', B));
    await raf2();
    out.segsDuring = Array.from(cv.querySelectorAll('#tlWsZoneCuts line[data-cutaxis="y"][data-cutindex="2"]'))
      .map(l => l.getAttribute('y1') + '@' + l.getAttribute('data-cutlane'));
    cv.dispatchEvent(pe('pointerup', B));
    await raf2(); await raf2();
    const st = window.tlZoneStep || {};
    out.stepKeysY = Object.keys(st.y || {}).join('|');
    out.stepKeysX = Object.keys(st.x || {}).join('|');
    out.musAfter = groupMus();
    out.labelMuAfter = labelMu();
    /* v100：组面积有**三个展示处** —— 画布组级标注 / 左栏「手动分组」状态表 / 右侧面板组列表。
       用户要求「调整之后联合灌溉分区面积随之调整」⇒ 三者必须同源同值，缺一就是「没跟着调」。 */
    out.statusMuAfter = (function () {
      const el = document.getElementById('tlGroupStatus');
      if (!el) return null;
      const m = {};
      Array.from(el.querySelectorAll('tbody tr')).forEach(tr => {
        const gEl = tr.querySelector('.tl-grp-g'), aEl = tr.querySelector('.tl-grp-a');
        const mm = /M(\\d+)/.exec(gEl ? (gEl.textContent || '') : '');
        if (mm) m[mm[1] - 1] = aEl ? (aEl.textContent || '').trim() : null;
      });
      return m;
    })();
    out.panelMuAfter = (function () {
      const gl0 = document.getElementById('tlGroupList');
      if (!gl0) return null;
      const m = {};
      Array.from(gl0.querySelectorAll('.tl-gp-group')).forEach(d => {
        const mm = /M(\\d+)/.exec(d.textContent || '');
        if (!mm) return;
        const muEl = d.querySelector('.tl-gp-mu');
        m[mm[1] - 1] = muEl ? parseFloat((muEl.textContent || '').replace('亩', '').trim()) : null;
      });
      return m;
    })();
    const cv2 = document.getElementById('tlWsCanvas');
    out.smallLabelsAfter = cv2 ? Array.from(cv2.querySelectorAll('text'))
      .filter(t => /^(?:\\d+|G\\d+·\\d+|单·\\d+)区/.test((t.textContent || '').trim())).length : -1;
    out.unionTextsAfter = cv2 ? Array.from(cv2.querySelectorAll('text[data-tlunion]'))
      .map(t => ({ g: t.getAttribute('data-tlunion'), txt: (t.textContent || '').trim() })) : [];
    out.stepAfterFree = JSON.stringify(window.tlZoneStep || null);
  }

  /* ── ③a v106：真实指针拖「平行于主管的竖线」x/1 ⇒ 整条线一起动（放在最后：它会平移视口） ── */
  const cv3 = document.getElementById('tlWsCanvas');
  const lockSeg = cv3 ? cv3.querySelector('#tlWsZoneCuts line[data-cutaxis="x"][data-cutindex="1"][data-cutlane="0"]') : null;
  out.lockSegFound = !!lockSeg;
  if (lockSeg) {
    /* 落点取该行靠上处（离两侧支管最远），且必须在被拖那一段的 y 区间内 */
    const wy = c0.yPos[0] + 10;
    const st0 = JSON.stringify(window.tlZoneStep);
    out.lockSegsBefore = Array.from(cv3.querySelectorAll('#tlWsZoneCuts line[data-cutaxis="x"][data-cutindex="1"]'))
      .map(l => l.getAttribute('x1'));
    out.lockBaseBefore = c0.xPos[1];
    const A = w2s(c0.xPos[1], wy);
    const B = w2s(c0.xPos[1] + 40, wy);
    cv3.dispatchEvent(pe('pointerdown', A));
    cv3.dispatchEvent(pe('pointermove', B));
    await raf2();
    cv3.dispatchEvent(pe('pointerup', B));
    await raf2();
    const cv4 = document.getElementById('tlWsCanvas');
    out.lockSegsAfter = cv4 ? Array.from(cv4.querySelectorAll('#tlWsZoneCuts line[data-cutaxis="x"][data-cutindex="1"]'))
      .map(l => l.getAttribute('x1')) : [];
    out.lockBaseAfter = window.RunyeBridge.getCuts().xPos[1];
    out.lockStepUnchanged = (JSON.stringify(window.tlZoneStep) === st0);
  }
  /* 面板提示位 */
  const dh = document.getElementById('tlGroupDragHint');
  out.dragHint = dh ? (dh.textContent || '').trim() : null;
  const gl = document.getElementById('tlGroupList');
  out.groupListHtml = gl ? gl.innerHTML.replace(/\\s+/g, ' ').slice(0, 400) : null;

  /* ── v106 ⑥ 补充场景：留两个未分组区 ⇒ 未分组区之间的分割线（data-ugb）要照常显示 ── */
  window.tlManualGroups = [[0, 2], [1, 3], [4, 5]];
  window.tlZoneStep = {};
  if (window.tlDiagramData && window.tlDiagramData.zones) {
    delete window.tlDiagramData.zones.cutOffX;
    delete window.tlDiagramData.zones.cutOffY;
  }
  window.tlAutoGenerate({ scroll: false });
  await raf2();
  if (typeof window.rySetTab === 'function') window.rySetTab('tlPipePlanSection', 'ws');
  await raf2(); await raf2();
  if (typeof window.tlUpdatePlanBar === 'function') { try { window.tlUpdatePlanBar(); } catch (e3) { } }
  const cvU = document.getElementById('tlWsCanvas');
  out.ugbCount = cvU ? cvU.querySelectorAll('#tlWsZoneCuts line[data-ugb="1"]').length : -1;
  out.mgbAfterU = cvU ? cvU.querySelectorAll('#tlWsZoneCuts line[data-cutaxis]').length : -1;
  /* v106 任务C：联合流量依据行（左栏结果条，联合流量底下） */
  const srcEl = document.getElementById('tlPlanCombinedSrc');
  out.combinedSrc = srcEl ? ((srcEl.textContent || '').trim() + '|' + (srcEl.style.display !== 'none')) : null;

  /* ── v107 ⑥c：水力计算结果「设计值 vs 实际值」列 ──
     未改径（覆盖表全 0）时实际列显示 —；模拟极端覆盖（Ø630/400/200）后，
     设计列=无覆盖重算的水泵扬程、实际列=覆盖重算的水泵扬程，两列必须分列。 */
  const hdReal = document.getElementById('tlPlanPumpHeadReal');
  out.realColNone = hdReal ? (hdReal.textContent || '').trim() : null;
  try {
    const rNom = computeThreeLevel();
    const savedOv = window.tlPipeOdOverride;
    window.tlPipeOdOverride = { front: 630, main: 400, branch: 200 };
    const rOv = computeThreeLevel();
    if (typeof window.tlUpdatePlanBar === 'function') window.tlUpdatePlanBar();
    out.desHead = (document.getElementById('tlPlanPumpHead') || {}).textContent || null;
    out.realHead = (document.getElementById('tlPlanPumpHeadReal') || {}).textContent || null;
    out.realVelMain = (document.getElementById('tlPlanMainVelocityReal') || {}).textContent || null;
    /* v109b：设计列单位并入文本（「35 m」），期望值同步拼单位 */
    out.expectDes = String(Math.round(rNom.pumpHead)) + ' m';
    out.expectReal = (Math.round(rOv.pumpHead * 10) / 10).toFixed(1) + ' m';
    out.diff = rOv.pumpHead - rNom.pumpHead;
    window.tlPipeOdOverride = savedOv || { front: 0, main: 0, branch: 0 };
    if (typeof window.tlUpdatePlanBar === 'function') window.tlUpdatePlanBar();
  } catch (e6c) { out.err6c = String(e6c && e6c.message || e6c); }
  return out;
})()`;

let pass = 0, fail = 0;
const lines = [];
function ok(c, m) { if (c) { pass++; lines.push('  ✓ ' + m); } else { fail++; lines.push('  ✗ ' + m); } }

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  applyInjection();
  const cwd = process.cwd();
  if (cwd.replace(/[\\/]+$/, '') !== DIR.replace(/[\\/]+$/, '')) { console.error('必须在项目根运行：cd ' + DIR); restoreInj(); process.exit(2); }

  const UD = 'C:\\tmp\\cdp_v100_' + Date.now();
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + PORT,
    '--window-size=1680,1050', '--user-data-dir=' + UD], { stdio: 'ignore' });
  const done = (code) => { try { child.kill('SIGKILL'); } catch (e) { } restoreInj(); process.exit(code); };
  const watchdog = setTimeout(() => { lines.push('WATCHDOG：Edge 超时'); fail++; }, 180000);

  let o = {};
  try {
    for (let i = 0; i < 60; i++) { try { await httpGet('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (e) { await sleep(250); } }
    const list = JSON.parse(await httpGet('http://127.0.0.1:' + PORT + '/json'));
    const tgt = list.find(x => x.type === 'page');
    const c = await cdpClient(tgt.webSocketDebuggerUrl);
    await c.send('Runtime.enable'); await c.send('Page.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false });
    await c.send('Page.navigate', { url: PAGE });
    await sleep(4200);

    /* ① 无手动分组：小分区标注照旧（基线帧 + 截图） */
    const rBase = await c.send('Runtime.evaluate', {
      expression: `(async () => {
        const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        window.alert = function(){};
        window.measuredPolygon = [{x:0,y:0},{x:240,y:0},{x:240,y:300},{x:0,y:300}];
        window.runyePlanDims = { A: 240, B: 300 };
        const pm = document.getElementById('planZoneMode'); if (pm) pm.value='auto';
        const pn = document.getElementById('planN'); if (pn) pn.value='4';
        const fn = document.getElementById('fld_N'); if (fn) fn.value='4';
        window.RunyeBridge.state.zoneRotated=false; window.RunyeBridge.state.plotRotationDeg=0;
        window.ppLoadPolygon();
        window.tlManualGroups = [];
        window.tlAutoGenerate({scroll:false});
        await raf2();
        if (typeof window.rySetTab==='function') window.rySetTab('tlPipePlanSection','ws');
        await raf2(); await raf2();
        const cv = document.getElementById('tlWsCanvas');
        return { small: cv ? Array.from(cv.querySelectorAll('text')).filter(t => /^(?:\\d+|G\\d+·\\d+|单·\\d+)区/.test((t.textContent||'').trim())).length : -1,
                 union: cv ? cv.querySelectorAll('text[data-tlunion]').length : -1 };
      })()`, returnByValue: true, awaitPromise: true,
    });
    const base = rBase.result.value || {};
    await sleep(500);
    let s = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTDIR, '01_baseline_no_groups.png'), Buffer.from(s.data, 'base64'));

    /* ② 合并后的完整场景 */
    const r = await c.send('Runtime.evaluate', { expression: PAGE_JS, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) lines.push('页面异常: ' + ((r.exceptionDetails.exception || {}).description || ''));
    o = r.result.value || {};
    await sleep(600);
    s = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUTDIR, '02_merged.png'), Buffer.from(s.data, 'base64'));

    /* ③ 放大：联合分区一带（看「分格没了、只剩组级标注」） */
    const rc = await c.send('Runtime.evaluate', {
      expression: `(function(){
        const cv = document.getElementById('tlWsCanvas'); if (!cv) return null;
        const rs = Array.from(cv.querySelectorAll('text[data-tlunion]')).map(t => t.getBoundingClientRect());
        const rc2 = cv.getBoundingClientRect();
        return { cx: Math.round((rc2.left + rc2.right) / 2), cy: Math.round((rc2.top + rc2.bottom) / 2),
                 w: Math.round(rc2.width), h: Math.round(rc2.height), nUnion: rs.length };
      })()`, returnByValue: true,
    });
    const R = rc.result.value;
    if (R && R.w > 50) {
      const clip = {
        x: Math.max(0, Math.round(R.cx - R.w * 0.30)), y: Math.max(0, Math.round(R.cy - R.h * 0.30)),
        width: Math.round(R.w * 0.60), height: Math.round(R.h * 0.60), scale: 2,
      };
      const s3 = await c.send('Page.captureScreenshot', { format: 'png', clip });
      fs.writeFileSync(path.join(OUTDIR, '03_merged_zoom.png'), Buffer.from(s3.data, 'base64'));
    }
    c.close();
  } catch (e) { lines.push('ERR ' + String(e)); fail++; }
  clearTimeout(watchdog);

  /* ─────────────────── 断言 ─────────────────── */
  ok(o.alerts && o.alerts.length === 0, '生成/拖动过程中无 alert' + (o.alerts && o.alerts.length ? '：' + JSON.stringify(o.alerts) : ''));
  ok(o.cols >= 2 && o.rows >= 2, '测试网格两轴都有内部线（' + o.cols + '列×' + o.rows + '行）');
  ok(o.hasCanvas === true, '三级工作区画布 #tlWsCanvas 已挂载');

  lines.push('— ① 基线：没有手动分组时，小分区照旧显示 —');
  ok(o.baseSmallLabels >= 4, '★ 基线帧里小分区标注数量 = ' + o.baseSmallLabels + '（>0 ⇒ 下面「合并后=0」不是恒绿）');

  lines.push('— ② 合并后：原来的小分区不再显示，只显示新的联合分区 —');
  ok(o.smallLabels === 0, '★★ 合并后工作区里小分区标注条数 = 0 → 实际 ' + o.smallLabels);
  ok(o.leftoverZoneLines === 0, '★★ 简图那层细虚线分区线已整层撤掉（不留残影）→ 实际 ' + o.leftoverZoneLines);
  ok((o.rectStroke || []).filter(r => r.grouped).every(r => r.stroke === null || r.stroke === undefined),
    '★★ 组内小分区的格边框已去掉（同组连成一片）→ ' +
    JSON.stringify((o.rectStroke || []).filter(r => r.grouped).map(r => r.stroke)));
  ok((o.rectStroke || []).filter(r => !r.grouped).length === 0 ||
    (o.rectStroke || []).filter(r => !r.grouped).every(r => r.stroke !== null),
    '未分组区的格边框保持原样（未被误伤）');
  const uBefore = o.unionTexts || [];
  const uNames = uBefore.filter(x => !/亩$/.test(x.txt)).map(x => x.txt).sort();
  ok(uNames.length === (o.groups || []).length,
    '★★ 组级标注条数 = 手动组数（' + (o.groups || []).length + '）→ ' + JSON.stringify(uNames));
  ok(uNames.join('|') === 'M1 · 区 1/3|M2 · 区 2/4|M3 · 区 5/6|M4 · 区 7/8',
    '★★ 组级标注文字为「M{n} · 区 a/b」→ 实际 ' + JSON.stringify(uNames));
  ok(uBefore.filter(x => /亩$/.test(x.txt)).length === (o.groups || []).length,
    '★ 每组都带了「x.x 亩」面积行 → ' + uBefore.filter(x => /亩$/.test(x.txt)).map(x => x.txt).join(' / '));

  lines.push('— ③ v106：分界线两轴都可拖 —— 平行轴整条动、垂直轴分段动 —');
  ok(o.axis === 'v', '★ 管向判定 = ' + o.axis + '（本图主管/支管实测为竖向）');
  ok(o.freeAxes && o.freeAxes.slice().sort().join(',') === 'x,y', '★★ v106：两轴分界线都不再锁定（freeAxes = x,y）→ 实际 ' + JSON.stringify(o.freeAxes));
  ok(o.lockAxes && o.lockAxes.length === 0, '★★ data-cutlock 不再产生（v100 平行轴锁定作废）→ 锁定轴 ' + JSON.stringify(o.lockAxes));
  ok((o.segs || []).every(s => !s.lock), '★ 所有分界线段都不带 data-cutlock（共 ' + (o.segs || []).length + ' 段）');
  ok((o.segs || []).filter(s => s.axis === 'x').length > 0 && (o.segs || []).filter(s => s.axis === 'y').length > 0,
    '★ 两个轴都画了分界线（' + (o.segs || []).filter(s => s.axis === 'x').length + ' 竖 / ' +
    (o.segs || []).filter(s => s.axis === 'y').length + ' 横），锁的只是其中一轴 —— 不是「没画」');
  ok(o.lockSegFound === true, '定位到平行轴竖线 x/1 lane0');
  ok(o.lockStepUnchanged === true, '★★★ 拖平行轴竖线：阶梯覆盖表毫无变化（整条路径不写 cutOff）');
  (function () {
    const a = o.lockSegsBefore || [], b = o.lockSegsAfter || [];
    ok(a.length >= 2 && a.length === b.length, 'x/1 共 ' + a.length + ' 段（逐行分段，本场景 2 段）→ 前 ' + a.length + ' / 后 ' + b.length);
    const d0 = (a.length === b.length && a.length > 0) ? (+b[0]) - (+a[0]) : NaN;
    ok(a.length >= 2 && isFinite(d0) && d0 !== 0 && a.every((v, i) => Math.abs((+b[i]) - (+v) - d0) < 0.01),
      '★★★ 整条线一起动：4 段位移完全一致（' + (isFinite(d0) ? d0.toFixed(1) : '?') + ' 画布单位）→ ' + JSON.stringify(b));
  })();
  ok(o.lockBaseAfter != null && Math.abs(o.lockBaseAfter - o.lockBaseBefore) > 1,
    '★★ 共享网格 xPos[1] 整条平移（' + o.lockBaseBefore + ' → ' + o.lockBaseAfter + ' m）—— 写共享网格、二级/三级同步');
  ok(o.freeSegFound === true, '定位到可拖的横线 y/2 lane0');
  ok(!!o.stepKeysY && o.stepKeysY === '0,2',
    '★★★ 拖可拖的横线确实写进了覆盖表 cutOffY["0,2"] → 实际 ' + JSON.stringify(o.stepKeysY));
  ok(o.stepKeysX === '' || o.stepKeysX === undefined, '★ 拖横线不牵连竖轴覆盖表 → 实际 ' + JSON.stringify(o.stepKeysX));
  const chgDuring = (() => {
    const a = o.segsBefore || [], b = o.segsDuring || [];
    if (a.length !== b.length) return -1;
    let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  })();
  ok(chgDuring === 1, '★★ 拖动中只有被抓那一段动（共 ' + (o.segsBefore || []).length + ' 段）→ 实际变了 ' + chgDuring + ' 段');

  lines.push('— ④ 拖动后：联合灌溉分区计算的面积随之调整 —');
  const mb = o.musBefore || [], ma = o.musAfter || [], lb = o.labelMuBefore || {}, la = o.labelMuAfter || {};
  ok(mb.length === 4 && ma.length === 4, '拖动前后各算出 4 个组的面积 → ' + JSON.stringify(mb) + ' / ' + JSON.stringify(ma));
  ok(mb.join(',') !== ma.join(','), '★★ 拖动边界线后组面积确实变了：' + JSON.stringify(mb) + ' → ' + JSON.stringify(ma));
  const same = (a, b) => Math.abs(a - b) < 0.15;
  ok(same(lb['0'], mb[0]) && same(lb['1'], mb[1]) && same(lb['2'], mb[2]) && same(lb['3'], mb[3]),
    '★★★ 图上组级标注的亩数与独立算出的分组面积逐位一致（拖动前）：标注 ' + JSON.stringify(lb) + ' vs 独立 ' + JSON.stringify(mb));
  ok(same(la['0'], ma[0]) && same(la['1'], ma[1]) && same(la['2'], ma[2]) && same(la['3'], ma[3]),
    '★★★ 拖动后标注亩数随之刷新（标注 ' + JSON.stringify(la) + ' vs 独立 ' + JSON.stringify(ma) + '）');
  ok(lb['0'] !== la['0'] && lb['2'] !== la['2'],
    '★★ 被牵连的两个组（M1 含区2、M3 含区5）面积都变了：M1 ' + lb['0'] + '→' + la['0'] + '，M3 ' + lb['2'] + '→' + la['2']);
  ok(lb['1'] === la['1'], '★★ 没被牵连的组 M2 面积不动（' + lb['1'] + '）');
  ok(o.smallLabelsAfter === 0, '★★ 拖动（整幅重生成）之后小分区仍然不显示 → 实际 ' + o.smallLabelsAfter);
  ok((o.unionTextsAfter || []).filter(x => /亩$/.test(x.txt)).length === 4,
    '★ 整幅重生成后组级标注仍是 4 条 → ' + JSON.stringify(o.unionTextsAfter));

  lines.push('— ⑤ 面板口径提示 —');
  ok(!!o.dragHint && /整条拖动/.test(o.dragHint) && /分段拖/.test(o.dragHint), '面板提示位写明 v106 新口径（平行整条/垂直分段）→ ' + JSON.stringify(o.dragHint));
  ok(!!o.groupListHtml && /亩/.test(o.groupListHtml), '已建组列表里带上该组面积（亩）→ ' + JSON.stringify(o.groupListHtml && o.groupListHtml.slice(0, 160)));

  lines.push('— ⑥ v106 补充：未分组区之间的分割线照常显示 + 联合流量依据行 —');
  ok(o.ugbCount === 1, '★★ 留两个未分组区（区7、区8）时，它们之间那条分割线照常显示（data-ugb 1 段）→ 实际 ' + o.ugbCount);
  ok(o.mgbAfterU === 6, '★ 组边界线照旧 6 段（组间 4 + 未分组↔组 2）→ 实际 ' + o.mgbAfterU);
  ok(!!o.combinedSrc && /联合流量依据/.test(o.combinedSrc) && /亩/.test(o.combinedSrc) && /\|true$/.test(o.combinedSrc),
    '★★ 联合流量底下注明依据（联合分区 M + 亩，且已显示）→ ' + JSON.stringify(o.combinedSrc));

  lines.push('— ⑥c v107：水力计算结果「设计值 vs 实际值」列 —');
  ok(!!o.realColNone && o.realColNone === '—', '★ 未改径时「实际」列显示占位 — → ' + JSON.stringify(o.realColNone));
  ok(!o.err6c, '⑥c 页面内探测零异常 → ' + JSON.stringify(o.err6c || null));
  ok(o.desHead === o.expectDes, '★★ 设计列 = 理论选管水泵扬程（无覆盖重算）→ ' + o.desHead + '（期望 ' + o.expectDes + '）');
  ok(o.realHead === o.expectReal, '★★ 实际列 = 覆盖管径（Ø630/400/200）重算水泵扬程 → ' + o.realHead + '（期望 ' + o.expectReal + '）');
  ok(typeof o.diff === 'number' && Math.abs(o.diff) > 0.05, '★★ 极端覆盖下扬程确实改变（两列可分辨）→ Δ=' + (o.diff || 0).toFixed(2) + ' m');
  ok(!!o.realVelMain && /m\/s$/.test(o.realVelMain), '★ 主管流速实际列带单位 → ' + JSON.stringify(o.realVelMain));
  /* ★★★ 三处展示的组面积必须同源同值（拖动后）—— 用户口径「调整之后面积随之调整」 */
  (function () {
    const mc = o.labelMuAfter || {}, ms = o.statusMuAfter || {}, mp = o.panelMuAfter || {};
    const ks = Object.keys(mc);
    const bad = [];
    ks.forEach(k => {
      const a = mc[k], b = parseFloat(ms[k]), c2 = mp[k];
      if (!(b === b) || !(c2 === c2)) bad.push(k + '(缺)');
      else if (Math.abs(b - a) > 0.05 || Math.abs(c2 - a) > 0.05) bad.push(k + '(' + a + '/' + b + '/' + c2 + ')');
    });
    ok(ks.length === 4 && bad.length === 0,
      '★★★ 组面积三处同源同值（画布标注 / 左栏状态表 / 右侧面板）→ 画布 ' + JSON.stringify(mc)
      + ' · 左栏 ' + JSON.stringify(ms) + ' · 面板 ' + JSON.stringify(mp)
      + (bad.length ? '  ✗不一致：' + bad.join(', ') : ''));
    ok(ks.length === 4 && Math.abs(parseFloat(ms['0']) - 60) < 0.05 && Math.abs(parseFloat(ms['2']) - 26.4) < 0.05,
      '★★★ 两个面板显示的是**拖动后**的面积（M1 60.0 亩 / M3 26.4 亩，不是拖动前的 54.0 / 32.4）'
      + ' → 左栏 M1=' + ms['0'] + ' M3=' + ms['2'] + ' · 面板 M1=' + mp['0'] + ' M3=' + mp['2']);
  })();

  console.log(lines.join('\n'));
  console.log('\n== v100 联合分区合并结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  console.log('截图目录 = ' + OUTDIR);

  if (INJ) {
    if (fail > 0) { console.log('  ✓ 缺陷注入(' + INJ + ')：断言确实变红（FAIL=' + fail + '）—— 断言有效'); done(0); }
    else { console.error('  ✗ 缺陷注入(' + INJ + ')未被拦截（FAIL=0）—— 断言恒绿，无效！'); done(1); }
    return;
  }
  done(fail ? 1 : 0);
})();
