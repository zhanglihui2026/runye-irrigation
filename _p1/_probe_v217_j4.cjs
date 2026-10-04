/* _p1/_probe_v217_j4.cjs · [v217 收尾] 定性既有闸门 J4 为何连带伤及 R0/R2/R3/R4
   做法：生成 J4 注入副本（删掉快照里的 mapFramePoly 落库行）→ 走与主闸门同一入口
   （MKPOLY 写 runyeMeasuredArea → reload → applyMapMeasuredArea）→ dump 初始状态。
   关心：__runyeMapFramePoly 在**尚未触发任何保存/读取**时就已经是 0（?）。 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const puppeteer = require('./_pptr.cjs');
const killTree = require('./_edge_kill.cjs');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = parseInt(process.env.PA_PORT || '9570', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/'));

const SRC = path.join(WS, 'index.html');
const base = fs.readFileSync(SRC, 'utf8');
const EOL = base.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const INJ_PAGE = process.env.PA_PAGE ? path.resolve(process.env.PA_PAGE) : null;
let inj;
if (INJ_PAGE) { inj = INJ_PAGE; console.log('健康对照：直接用 ' + INJ_PAGE); }
else {
  const n = base.split(ANCHOR).length - 1;
  console.log('锚点命中 ' + n + ' 处');
  if (n !== 1) process.exit(2);
  inj = path.join(WS, '_j4_probe.html');
  fs.writeFileSync(inj, base.replace(ANCHOR, ''), 'utf8');
}

const MKPOLY = `(()=>{try{
  var R=6378137, mlat=R*Math.PI/180, cosLat=Math.cos(18.25*Math.PI/180);
  var c={lat:18.25,lng:109.51}, a=60,b=20, t=25*Math.PI/180;
  var u=[Math.cos(t),Math.sin(t)], v=[-Math.sin(t),Math.cos(t)];
  var ring=[[1,1],[-1,1],[-1,-1],[1,-1]].map(function(s){
    var e=a*s[0]*u[0]+b*s[1]*v[0], n=a*s[0]*u[1]+b*s[1]*v[1];
    return [ +(c.lat+n/mlat).toFixed(7), +(c.lng+e/(mlat*cosLat)).toFixed(7) ];
  });
  localStorage.setItem('runyeMeasuredArea', JSON.stringify({sqm:4800, mu:7.2, poly:ring, name:'闸门测试地块', plotId:'pmtest'}));
  return JSON.stringify(ring);
}catch(e){return 'ERR:'+e.message;}})()`;
const SNAP = `JSON.stringify({
  mf:(window.__runyeMapFramePoly||[]).length,
  mp:(window.measuredPolygon||[]).length,
  geo:!!window.__runyeGeoBase,
  ls: Object.keys(localStorage).map(function(k){return k+':'+String(localStorage.getItem(k)).length;}),
  ppn:(typeof window.ppGetPolyPts==='function')?window.ppGetPolyPts().length:'no-fn'
})`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proc = spawn(EDGE, ['--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(OUT, 'profile_j4'),
    '--no-first-run', '--no-default-browser-check', '--window-size=1500,950', 'about:blank'], { stdio: 'ignore' });
  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); killTree(proc.pid); process.exit(1); }
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(fileUrl(inj), { waitUntil: 'load', timeout: 120000 });
  await sleep(2000);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.reload({ waitUntil: 'load' });
  await sleep(1500);
  console.log('清空 localStorage 后 reload：', await page.evaluate(SNAP));
  await page.evaluate(MKPOLY);
  console.log('MKPOLY 返回：', (await page.evaluate('JSON.stringify(JSON.parse(localStorage.getItem("runyeMeasuredArea")).poly.length)')));
  await page.reload({ waitUntil: 'load' });
  await sleep(3200);
  console.log('回传后 reload（≈ 闸门 r0 快照点）：', await page.evaluate(SNAP));
  console.log('page errors：', JSON.stringify(errs.slice(0, 6)));
  try { await page.close(); } catch (e) { }
  try { await browser.disconnect(); } catch (e) { }
  killTree(proc.pid);
  await sleep(600);
  /* ⚠ 2026-10-04 事故：本脚本上一版无条件 `fs.unlinkSync(inj)`，而 PA_PAGE 分支让 inj 指向
     调用方传入的文件 ⇒ 把仓库主文件 index.html 删掉了。教训：临时文件必须由本脚本自己命名、
     自己去重先是「不是绝对路径由本文件生成」再删；凡外来路径一律不删。 */
  if (!INJ_PAGE) { try { fs.unlinkSync(inj); } catch (e) { } }
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
