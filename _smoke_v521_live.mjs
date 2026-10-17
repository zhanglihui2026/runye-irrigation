'use strict';
/* v521 线上冒烟：真实站点跑核心断言（缓存穿透 ?_=时间戳；独立 user-data-dir 防串档） */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LIVE = 'https://zhanglihui2026.github.io/runye-irrigation/';
const CDP = 14100 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));

try { spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*headless*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { stdio: 'ignore', timeout: 30000 }); } catch (e) { }
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_v521live_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });

const hreq = (method, p) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP, path: p, method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end();
});
let up = false;
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); up = true; break; } catch (e) { await sleep(300); } }
if (!up) { console.log('EDGE 启动失败'); process.exit(1); }

let idc = 1, ws = null; const pend = {}; const errs = []; const bad = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('CDP timeout')); } }, 60000); });

const url = LIVE + 'index.html?full=1&_=' + Date.now();
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.method === 'Runtime.exceptionThrown') errs.push(String((o.params.exceptionDetails.exception && o.params.exceptionDetails.exception.description) || o.params.exceptionDetails.text).slice(0, 200));
  if (o.method === 'Network.responseReceived') { const s = o.params.response.status; if (s >= 400 && !/favicon/.test(o.params.response.url)) bad.push(s + ' ' + o.params.response.url.slice(0, 120)); }
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); }
});
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await sleep(9000);
/* [v529] 就绪闸门：线上首屏偏慢时 9s 可能还停在 about:blank，会得到"Failed to parse URL"假红 */
{ let ok=false;
  for(let i=0;i<40;i++){
    const q=await send('Runtime.evaluate',{expression:"(function(){ return (location.hostname.indexOf('github.io')>=0) && !!document.getElementById('ryCadGrpPipeSet') && !!window.RyPlanParams; })()",returnByValue:true});
    if(q.result && q.result.value===true){ ok=true; break; }
    await sleep(800);
  }
  console.log('线上就绪=' + ok + ' (' + (await send('Runtime.evaluate',{expression:'location.href',returnByValue:true})).result.value + ')');
  if(!ok){ /* 再等等加载，但继续跑，让断言如实报红 */ await sleep(4000); }
}
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) }; return r.result.value; };

let pass = 0, fail = 0;
const chk = (name, ok, extra) => { if (ok) { pass++; console.log('  ✓ ' + name + (extra !== undefined ? '  :: ' + extra : '')); } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  :: ' + JSON.stringify(extra) : '')); } };

/* ① 线上脚本版本 */
const r0 = await ev(`(async function(){
  var sw = await fetch('sw.js?_=' + Date.now()).then(function(r){ return r.text(); });
  var m = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
  var i28 = await fetch('mod/inline-28.js?v=529-single-source&_=' + Date.now()).then(function(r){ return r.status; });
  var IDS = ['planLift','planDh','planSrcDist','planTapeSpacing','planEmitterSpacing','planEmitterFlow','planTapeLaySide','planZoneMuManual','planTapePressure','planTargetV'];
  var roNone = IDS.every(function(id){ var el = document.getElementById(id); return !!el && !el.hasAttribute('readonly'); });
  var sum = document.querySelector('#ryCadGrpPipe summary');
  var sumText = sum && sum.childNodes[0] ? sum.childNodes[0].textContent.trim() : null;
  return { swVer: m, i28Status: i28, roNone: roNone, sumText: sumText,
           tbNameGone: !document.getElementById('ppRecipeName'),
           tbApplyAlive: !!document.getElementById('ppRecipeApply'),
           grpSet: !!document.getElementById('ryCadGrpPipeSet'),
           navIrrig: !!document.querySelector('#rySetNav button[data-tab="irrig"]'),
           rpStatus: await fetch('mod/ry-panel.css?v=529-single-source&_=' + Date.now()).then(function(r){ return r.status; }),
           rpIs: await fetch('mod/ry-panel.css?v=529-single-source&_=' + Date.now()).then(function(r){ return r.text(); }).then(function(t){ return t.indexOf(':is(#pipePlanSection') > 0; }),
           gearCls: (function(){ var e=document.getElementById('ryCadGrpPipeSet'); return e ? (e.className + '|' + (e.getAttribute('style')||'')) : null; })(),
           idxDup: (function(){ var t=document.documentElement.innerHTML;
             return t.split('#ryCadSide [data-pp="pipePlanSection"] .pp-side{').length - 1 === 1; })(),
           /* [v530] */
           s1Status: (function(){ var l=document.querySelector('link[href*="mod/style-01.css"]'); return l ? l.getAttribute('href') : null; })(),
           s1Dead: await fetch('mod/style-01.css?_=' + Date.now()).then(function(r){ return r.text(); }).then(function(t){
             var re=/border-radius\s*:\s*([^;}]+)/g, m, dead=0;
             while ((m = re.exec(t))) { if (m[1].indexOf('!important') < 0 && m[1].indexOf('50%') < 0) dead++; }
             return dead;
           }),
           rpHeadH: await fetch('mod/ry-panel.css?_=' + Date.now()).then(function(r){ return r.text(); }).then(function(t){
             return (t.match(/--ry-panel-head-h\s*:\s*([^;]+);/g) || []).join('|');
           }),
           h1Txt: (function(){
             var h1s = [].slice.call(document.querySelectorAll('h1'));
             var out = {};
             h1s.forEach(function(el){ var c = getComputedStyle(el);
               out[el.textContent.trim().slice(0,10)] = c.fontSize; });
             return out;
           })(),
           typoLive: await fetch('runye-typography.css?_=' + Date.now()).then(function(r){ return r.text(); }).then(function(t){
             return t.indexOf('h1:where(:not(.topbar *)):not(:where(.t-top *, .result-head *))') > 0;
           }) };
})()`);
chk('线上 sw.js = v539（沿革含 v521~v538）', r0.swVer === 'v539-toolbar-font-unify', r0.swVer);
chk('线上 inline-28.js?v=529 200', r0.i28Status === 200, r0.i28Status);
chk('线上 DOM：组标题「⚙ 参数设置」按钮在', r0.grpSet === true, r0.grpSet);
chk('线上 DOM：设置弹窗「灌溉参数」页签在', r0.navIrrig === true, r0.navIrrig);
chk('线上 [v527] 工具栏 10 项输入可编辑', r0.roNone === true, r0.roNone);
chk('线上 [v526] 组标题 = 二级 · 地块与灌溉参数', r0.sumText === '二级 · 地块与灌溉参数', r0.sumText);
chk('线上 [v526] 工具栏方案条只留 选择+调用', r0.tbNameGone === true && r0.tbApplyAlive === true, r0);
chk('线上 [v529] ry-panel.css 200 且已用 :is() 双位置选择器', r0.rpStatus === 200 && r0.rpIs === true, r0.rpStatus + '/' + r0.rpIs);
chk('线上 [v529] ⚙ 按钮走 .ry-cad-set-btn 且无行内 style', r0.gearCls === 'ry-cad-set-btn|', r0.gearCls);
chk('线上 [v529] 内联重复面板样式块已删干净', r0.idxDup === true, r0.idxDup);
/* [v530] 四项落地的线上断言 */
chk('线上 [v538] style-01.css 引用已抬到 ?v=539-toolbar-font-unify', /style-01\.css\?v=539-toolbar-font-unify/.test(r0.s1Status || ''), r0.s1Status);
chk('线上 [v530] style-01 已无「无效圆角」声明（不带 !important 且非 50%）', r0.s1Dead === 0, r0.s1Dead);
chk('线上 [v530] ry-panel.css --ry-panel-head-h 只剩一处定义', (r0.rpHeadH || '').split('|').length === 1, r0.rpHeadH);
chk('线上 [v530] typography 的裸 h1 已排除 .t-top/.result-head', r0.typoLive === true, r0.typoLive);
chk('线上 [v530] 地形标题回到 14px、水力校核回到 15px',
  r0.h1Txt && r0.h1Txt['地形模块·测试中'] === '14px' && r0.h1Txt['水力校核'] === '15px', r0.h1Txt);

/* ② 功能：参数集就位 + 设置保存同步回工具栏（不造地块，避开 refresh 的 tlAutoGenerate） */
const r1 = await ev(`(async function(){
  var P = window.RyPlanParams;
  if (!P) return { api: false };
  var store0 = null; try { store0 = JSON.parse(localStorage.getItem('runye_plan_params_v1')||'null'); } catch(e){}
  window.ryOpenSettings('irrig');
  await new Promise(function(r){ setTimeout(r, 500); });
  var rows = document.querySelectorAll('#rySetBody input[data-f]').length;
  document.querySelector('#rySetBody input[data-f="planTargetV"]').value = '2';
  document.getElementById('rySetSave').click();
  await new Promise(function(r){ setTimeout(r, 900); });
  var store = null; try { store = JSON.parse(localStorage.getItem('runye_plan_params_v1')||'null'); } catch(e){}
  var out = { api: !!(P.get && P.set && P.reset), ids: P.IDS.length, store0: !!store0,
              rows: rows, barTargetV: document.getElementById('planTargetV').value,
              storeTargetV: store && store.params ? store.params.planTargetV : null,
              modalClosed: !document.getElementById('rySetModal').classList.contains('open') };
  var nm = document.getElementById('ryRecipeName'), sl = document.getElementById('ryRecipeSelect');
  out.nameBorder = nm ? getComputedStyle(nm).borderTopWidth + ' ' + getComputedStyle(nm).borderTopStyle : null;
  out.selBorder = sl ? getComputedStyle(sl).borderTopWidth + ' ' + getComputedStyle(sl).borderTopStyle : null;
  var sb = document.querySelector('#rySetBody [data-ry-recipe="save"]');
  out.saveCls = sb ? sb.className : null;
  /* 清理：恢复默认，不留测试痕迹 */
  window.RyPlanParams.reset();
  return out;
})()`);
chk('线上 RyPlanParams 就位（10 项）', r1.api === true && r1.ids === 10, r1.ids);
chk('线上 首访即建参数集键', r1.store0 === true, r1.store0);
chk('线上 「灌溉参数」页渲染 10 行', r1.rows === 10, r1.rows);
chk('线上 保存 → 工栏同步为 2', r1.barTargetV === '2', r1.barTargetV);
chk('线上 参数集落盘 planTargetV=2', parseFloat(r1.storeTargetV) === 2, r1.storeTargetV);
chk('线上 保存后弹窗关闭', r1.modalClosed === true, r1.modalClosed);
chk('线上 [v529] 方案名称框不再是原生 inset 边框', r1.nameBorder === '1px solid', r1.nameBorder);
chk('线上 [v529] 已存方案下拉不再是原生边框', r1.selBorder === '1px solid', r1.selBorder);
chk('线上 [v529] 方案按钮走 .rs-btn', r1.saveCls === 'rs-btn', r1.saveCls);
chk('线上 无 JS 异常', errs.length === 0, errs.length ? errs.slice(0, 3) : errs.length);
chk('线上 无 4xx/5xx 资源（favicon 豁免）', bad.length === 0, bad.length ? bad.slice(0, 3) : '');

console.log('\n线上冒烟：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
try { child.kill('SIGKILL'); } catch (e) { }
try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 20000 }); } catch (e) { }
process.exit(fail === 0 ? 0 : 1);
