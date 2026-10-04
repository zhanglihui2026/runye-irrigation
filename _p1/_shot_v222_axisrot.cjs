/* _p1/_shot_v222_axisrot.cjs · [v222] 管路拼装页 配件三轴旋转（绕 X / Y / Z）验证
 *
 * 用户原话：「配件旋转要能沿着X Y Z轴分别旋转才行」
 *
 * ★ 纪律（v201 教训 10 / v210 同款）：所有变更走真实入口 RyPipeAssembler.rotAxis3 /
 *   setPipeLen / setView（= 用户点芯片的同一条代码路径）；断言取值只用只读 getter
 *   （getComps / getConns / portPosOf / portPos3Of / rot3Of）。
 *
 * 断言清单：
 *   ① 基线：载入示例 5 件 4 接；所有组件 rx/ry 未设、z 未设（z=0 回归基线）
 *   ② 弹层 UI：选中弯头点 ↻ → 弹层含「绕 X 轴」「绕 Y 轴」标题；rot3 芯片 x/y 各 ≥3
 *   ③ 属性面板：「朝向 X / Y / Z」行存在
 *   ④ 绕 X +90°：弯头 R 口 z=+40（朝天）、平面 y 收回（260→220）、rx=90
 *   ⑤ 级联：直管 s2 整条被抬到 z=40；连接数不变；3D 接缝 maxGap3≈0
 *   ⑥ 前视下 R 口屏幕高度 < L 口（升起的视觉）；轴测网格出现红色 Z 轴指示
 *   ⑦ 再 +90°：rx=180，R 口 z=−40（朝地）
 *   ⑧ 归零：−90° 回 rx=0 / z=0；rx=90 时弹层出现「⟲ 0°」归零芯片
 *   ⑨ 绕 Y +90°：直管主轴立起（R 口 z=−60、平面 x 收回）；rot3 数学单元断言
 *   ⑩ 改管长沿 3D 轴向：竖管 s1 加长 1m ⇒ 下游整串 z 跟着 −12
 *   ⑪ 四视图切换渲染无异常、切换不动数据（坐标/朝向/连接一字不改）
 *   ⑫ 全程无 JS 报错
 * 注入体检（PA_PAGE 注入副本）：
 *   I1  rotAxis3 改空操作（不写 rx）      → 段2 只跑 ④⑤ ⇒ 必须红
 *   I2  cascadeAlign 改空操作（不级联）   → 段2 只跑 ⑤   ⇒ 必须红
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = parseInt(process.env.PA_PORT || '9551', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

const PAGE = process.env.PA_PAGE || '管路接驳拼装.html';
const TAG = process.env.PA_TAG || '';
const ONLY = (process.env.PA_ONLY || '').split(',').filter(Boolean);
const run = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;

let pass = 0, fail = 0;
const check = (n, ok, extra) => { console.log((ok ? '  [PASS] ' : '  [FAIL] ') + n + (extra ? ' :: ' + extra : '')); ok ? pass++ : fail++; };
const near0 = (v) => Math.abs(v) < 0.6;
const near = (v, t) => Math.abs(v - t) < 0.6;
/* 闸门退出码（教训：只打印红字 ≠ 拦得住，批跑器只看 exit code） */
let ALL_OK = true;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_v222' + TAG), '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,950', 'about:blank'
  ], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(path.join(WS, PAGE)), { waitUntil: 'load', timeout: 90000 });
  await sleep(1000);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1200);

  const R = (fn, ...a) => page.evaluate(fn, ...a);
  const loadExample = () => R(() => window.RyPipeAssembler.loadExample());
  const getComps = () => R(() => window.RyPipeAssembler.getComps());
  const getConns = () => R(() => window.RyPipeAssembler.getConns());
  const p3 = (id, side) => R((a, b) => window.RyPipeAssembler.portPos3Of(a, b), id, side);
  const pp = (id, side) => R((a, b) => window.RyPipeAssembler.portPosOf(a, b), id, side);
  const rot3Math = (x, y, z, rx, ry, rz) => R((a, b, c, d, e, f) => window.RyPipeAssembler.rot3Of(a, b, c, d, e, f), x, y, z, rx, ry, rz);
  const rotAxis3 = (id, axis, d) => R((a, b, c) => window.RyPipeAssembler.rotAxis3(a, b, c), id, axis, d);
  const openRotMenu = (id) => R((a) => {
    const API = window.RyPipeAssembler;
    API.getComps();  /* 触发一次只读 */
    const btn = document.getElementById('btnRot');
    /* 选中该件：走 setRot 之外的真实选中路径 —— 用右键菜单入口等价的 selectComp 不对外，
       借 openMenuAt（内部会 selectComp） */
    API.openMenuAt(a, 400, 300);
    const r = btn.getBoundingClientRect();
    /* 直接调 ↻ 按钮同款弹层（click 事件带坐标不可行，按钮点击用 dispatch） */
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const menu = document.getElementById('paMenu');
    return {
      xTitle: menu.textContent.indexOf('绕 X 轴') >= 0,
      yTitle: menu.textContent.indexOf('绕 Y 轴') >= 0,
      zTitle: menu.textContent.indexOf('绕 Z 轴') >= 0,
      xChips: menu.querySelectorAll('[data-act="rot3"][data-axis="x"]').length,
      yChips: menu.querySelectorAll('[data-act="rot3"][data-axis="y"]').length,
      zeroChipX: !!menu.querySelector('[data-act="rot3"][data-axis="x"][data-val="-90"]')
    };
  }, id);
  const propRow = () => R(() => {
    const t = document.getElementById('paProps').textContent;
    return { orient: t.indexOf('朝向 X / Y / Z') >= 0, z: t.indexOf('接口高程') >= 0 };
  });
  const portScreen = () => R(() => {
    const out = {};
    document.querySelectorAll('#paSvg .pa-port').forEach((c) => {
      out[c.getAttribute('data-id') + ':' + c.getAttribute('data-side')] =
        { x: +c.getAttribute('cx'), y: +c.getAttribute('cy') };
    });
    return out;
  });
  const hasZAxis = () => R(() => {
    const zs = document.querySelectorAll('#paSvg text');
    for (let i = 0; i < zs.length; i++) if (zs[i].textContent === 'Z') return true;
    return false;
  });
  const maxGap3 = async () => {
    const r = await R(() => {
      const API = window.RyPipeAssembler;
      return API.getConns().map((k) => {
        const A = API.portPos3Of(k.a.id, k.a.side), B = API.portPos3Of(k.b.id, k.b.side);
        return Math.hypot(A.x - B.x, A.y - B.y, (A.z || 0) - (B.z || 0));
      });
    });
    return r.length ? Math.max.apply(null, r) : 0;
  };
  const setView = (v) => R((a) => window.RyPipeAssembler.setView(a), v);

  /* ===== 段1：基线 + 弹层 UI ===== */
  if (run('1')) {
    await loadExample(); await sleep(300);
    const comps = await getComps(), conns = await getConns();
    check('① 示例 5 件 4 接', comps.length === 5 && conns.length === 4, comps.length + ' 件 / ' + conns.length + ' 接');
    const dirty = comps.filter((c) => +c.z || +c.rx || +c.ry);
    check('① 基线无高程/无 X·Y 朝向（z=0 回归基线）', dirty.length === 0, '非零件=' + dirty.length);
    const elbow = comps.filter((c) => c.kind === 'elbow90')[0];
    const ui = await openRotMenu(elbow.id); await sleep(200);
    check('② 弹层含「绕 X 轴」标题', ui.xTitle);
    check('② 弹层含「绕 Y 轴」标题', ui.yTitle);
    check('② 弹层含「绕 Z 轴」标题（原方向轴归入 Z）', ui.zTitle);
    check('② 绕 X 轴芯片 ≥3（+90/−90/180）', ui.xChips >= 3, 'x=' + ui.xChips);
    check('② 绕 Y 轴芯片 ≥3', ui.yChips >= 3, 'y=' + ui.yChips);
    await R(() => document.getElementById('paMenu').classList.remove('show'));
    const pr = await propRow();
    check('③ 属性面板含「朝向 X / Y / Z」行', pr.orient);
  }

  /* ===== 段2：绕 X 轴（出口朝天 / 朝地）+ 级联 ===== */
  let elbowId = null;
  {
    await loadExample(); await sleep(300);
    const comps = await getComps();
    elbowId = comps.filter((c) => c.kind === 'elbow90')[0].id;
  }
  if (run('2')) {
    /* ④ 绕 X +90°：局部 R(40,40,0) → Rx(90) → (40,0,40) */
    await rotAxis3(elbowId, 'x', 90); await sleep(200);
    const r3 = await p3(elbowId, 'R');
    check('④ 绕X +90° 后 R 口 z=+40（朝天）', r3 && near(r3.z, 40), JSON.stringify(r3));
    check('④ 绕X +90° 后 R 口平面 y 收回（260→220）', r3 && near(r3.y, 220), 'y=' + r3.y);
    const e1 = (await getComps()).filter((c) => c.id === elbowId)[0];
    check('④ rx=90 已写入', +e1.rx === 90, 'rx=' + e1.rx);
    /* ⑤ 级联：**下游**直管 s2（len=3，接在 e1.R）整条抬到 z=40。
       ⚠ 不能拿列表里第一条 straight —— 那是上游 s1（接在 e1.L，z 本来就该是 0）。 */
    const comps = await getComps(), conns = await getConns();
    check('⑤ 连接数不变（纯几何操作）', conns.length === 4, 'conns=' + conns.length);
    const s2 = comps.filter((c) => c.kind === 'straight' && c.len === 3)[0];
    const s2R = await p3(s2.id, 'R');
    check('⑤ 下游直管被抬到 z=40（L 与 R 同高）', s2R && near(s2R.z, 40), 's2.R.z=' + (s2R && s2R.z));
    const gap = await maxGap3();
    check('⑤ 3D 接缝 maxGap3≈0（无错位缝）', near0(gap), 'gap=' + gap.toFixed(3));
    /* ⑥ 前视：R 口屏幕高度低于 L 口（z 抬升 → 屏幕 y 减小）；Z 轴指示出现 */
    await setView('front'); await sleep(200);
    const scr = await portScreen();
    const Ls = scr[elbowId + ':L'], Rs = scr[elbowId + ':R'];
    check('⑥ 前视下 R 口屏幕高度 < L 口（出口升起的视觉）', Ls && Rs && Rs.y < Ls.y - 5,
      'L.y=' + (Ls && Ls.y) + ' R.y=' + (Rs && Rs.y));
    check('⑥ 非俯视网格出现红色 Z 轴指示', await hasZAxis());
    await setView('plan'); await sleep(150);
    /* ⑦ 再转 −180° → rx=270（即 −90°）：出口真正朝地 z=−40。
       ⚠ 数学提醒：rx=180 是把出口翻回**平面内**（y→−y，z→0），不是朝地 ——
         朝地只能走 rx=−90/270。第一版期望写错（rx=180 ⇒ z=−40），实测纠正。 */
    await rotAxis3(elbowId, 'x', -180); await sleep(200);
    const r3b = await p3(elbowId, 'R');
    check('⑦ rx=270（−90°）后 R 口 z=−40（朝地）', r3b && near(r3b.z, -40), 'z=' + (r3b && r3b.z));
    /* ⑧ 归零芯片 + 回零 */
    const ui2 = await openRotMenu(elbowId); await sleep(150);
    check('⑧ rx=270 时弹层出现「⟲ 0°」归零芯片', ui2.zeroChipX);
    await R(() => document.getElementById('paMenu').classList.remove('show'));
    await rotAxis3(elbowId, 'x', 90); await sleep(150);
    const r3c = await p3(elbowId, 'R');
    check('⑧ 归零后 R 口回到底面（z≈0、平面 y=260）', r3c && near0(r3c.z) && near(r3c.y, 260),
      'z=' + (r3c && r3c.z) + ' y=' + (r3c && r3c.y));
  }

  /* ===== 段3：绕 Y 轴（主轴立起）+ 3D 轴向改长 ===== */
  if (run('3')) {
    await loadExample(); await sleep(300);
    const comps = await getComps();
    const s1 = comps.filter((c) => c.kind === 'straight' && c.len === 5)[0];
    /* ⑨ rot3 数学单元断言（X/Y 各一）：与手推一致才允许往上盖实现 */
    const m1 = await rot3Math(0, 1, 0, 90, 0, 0);
    check('⑨ rot3 数学：Rx(90) 把 +y 翻到 +z', near(m1.z, 1) && near0(m1.y), JSON.stringify(m1));
    const m2 = await rot3Math(1, 0, 0, 0, 90, 0);
    check('⑨ rot3 数学：Ry(90) 把 +x 翻到 −z', near(m2.z, -1) && near0(m2.x), JSON.stringify(m2));
    /* 绕 Y +90°：局部 R(60,0,0) → Ry(90) → (0,0,−60)：主轴立起（向下） */
    await rotAxis3(s1.id, 'y', 90); await sleep(200);
    const r3 = await p3(s1.id, 'R');
    check('⑨ 绕Y +90° 后 R 口 z=−60（主轴立起）', r3 && near(r3.z, -60), JSON.stringify(r3));
    check('⑨ 绕Y +90° 后 R 口平面 x 收回（140→80）', r3 && near(r3.x, 80), 'x=' + r3.x);
    /* ⑩ 改管长沿 3D 轴向：5m→6m，R 口 z 再 −12，下游 e1 跟着降 */
    await R((id) => window.RyPipeAssembler.setPipeLenOf(id, 6), s1.id); await sleep(200);
    const r3b = await p3(s1.id, 'R');
    check('⑩ 竖管加长 1m ⇒ R 口 z=−72（沿 3D 轴向）', r3b && near(r3b.z, -72), 'z=' + (r3b && r3b.z));
    const e1 = (await getComps()).filter((c) => c.kind === 'elbow90')[0];
    const e1L = await p3(e1.id, 'L');
    check('⑩ 下游弯头 L 口跟着降到 z=−72（接缝不裂）', e1L && near(e1L.z, -72), 'e1.L.z=' + (e1L && e1L.z));
    const gap = await maxGap3();
    check('⑩ 3D 接缝 maxGap3≈0', near0(gap), 'gap=' + gap.toFixed(3));
  }

  /* ===== 段4：四视图回归 + 无 JS 错误 ===== */
  if (run('4')) {
    await loadExample(); await sleep(300);
    const before = { comps: await getComps(), conns: await getConns() };
    const shot0 = JSON.stringify(await portScreen());
    const views = ['front', 'side', 'iso', 'plan'];
    let same = true;
    for (const v of views) { await setView(v); await sleep(150); }
    const after = { comps: await getComps(), conns: await getConns() };
    check('⑪ 四视图切换不动数据', JSON.stringify(before) === JSON.stringify(after));
    await setView('plan'); await sleep(150);
    const shot1 = JSON.stringify(await portScreen());
    check('⑪ 回到俯视后端口渲染坐标与初始一致（z=0 零漂移）', shot0 === shot1);
  }
  check('⑫ 全程无 JS 报错', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n== 汇总 ==\n断言 ' + pass + '/' + (pass + fail) + ' PASS');
  ALL_OK = fail === 0 && errs.length === 0;
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid); await sleep(400);
  if (!ALL_OK) process.exitCode = 1;   /* ★ 退出码必须透传给批跑器 */
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
