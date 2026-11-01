'use strict';
/* 工具栏分组标题吸顶探针（v620）
   用户要求：下拉分组展开后内容超过屏幕，滚动时「三级 · 管网参数 / 生成与输出」这类大标题不动；
            二级 · 地块与灌溉参数、地形高程同理。
   验法：三个页面（三级/二级/多地块）逐页切过去，展开三组，真改 scrollTop 后量每个 summary 的 top；
        每页都做一次「注入体检」（把 position 打回 static），证明探针不是恒绿。
   用法：node _probe_sticky_grp.mjs      （SHOT=x.png 落图）
   退出码：0=全过，1=有断言红。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = 1600, VH = 900;   /* 故意用矮视口，让内容更容易溢出 */
const PORT = 53100 + Math.floor(Math.random() * 40), CDP = 53200 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
/* LIVE=1 时直接打开线上站点，不起本地服务（用来验「发布后线上真的吸顶」） */
const LIVE = process.env.LIVE === '1';
const PAGE_URL = LIVE ? (process.env.LIVE_URL || 'https://zhanglihui2026.github.io/runye-irrigation/')
                       : 'http://127.0.0.1:' + PORT + '/index.html';
if (!LIVE) await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_sticky_' + Date.now(),
  '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE_URL)));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
});
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask').forEach(function(e){e.style.setProperty('display','none','important');});try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()";
for (let i = 0; i < 80; i++) { if (await ev('!!window.tlAutoGenerate && !!window.rySetTab') === true) break; await sleep(400); }
await ev(HIDE);
await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1000);
await ev("(function(){window.measuredPolygon=[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}];window.measuredArea=2400;try{window.tlAutoGenerate();}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(2500);
await ev(HIDE);

const MEAS = `JSON.stringify((function(){
  var g=document.querySelector('#ryCadSide .ry-cad-grps');
  if(!g) return {none:'noGrps'};
  var gr=g.getBoundingClientRect();
  function one(id){ var d=document.getElementById(id); if(!d) return null; var s=d.querySelector('summary'); if(!s) return null;
    var r=s.getBoundingClientRect(); var cs=getComputedStyle(s);
    return {id:id, top:Math.round(r.top*10)/10, bottom:Math.round(r.bottom*10)/10, h:Math.round(r.height*10)/10, pos:cs.position}; }
  return { grpsTop:Math.round(gr.top*10)/10, grpsH:Math.round(gr.height),
           scrollTop:Math.round(g.scrollTop), scrollH:g.scrollHeight, clientH:g.clientHeight,
           overflow: g.scrollHeight - g.clientHeight,
           sums:[one('ryCadGrpPipe'),one('ryCadGrpTl'),one('ryCadGrpTerrain')] };
})())`;
const readM = async () => { const s = await ev(MEAS); try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return { err: String(s) }; } };

let ok = true;
const chk = (name, cond, extra) => { console.log((cond ? '✓ ' : '✗ ') + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); if (!cond) ok = false; };
const openAll = async () => {
  await ev("(function(){var c=document.getElementById('ryCadSide');if(c)c.setAttribute('data-ry-open','1');['ryCadGrpPipe','ryCadGrpTl','ryCadGrpTerrain'].forEach(function(id){var d=document.getElementById(id);if(d)d.open=true;});return 1;})()");
  await sleep(500);
  await ev(HIDE);
};

/* ── 三页共用同一个工具栏，逐页验 ── */
const SECS = [['tlPipePlanSection', 'pipe', '三级简图'], ['pipePlanSection', 'pipe', '二级地块分区'], ['grPipeSection', 'grp', '多地块规划']];
for (const [sec, view, label] of SECS) {
  await ev("(function(){try{window.rySetTab('" + sec + "','" + view + "');}catch(e){return 'err '+e.message;}return 1;})()");
  await sleep(1000);
  await openAll();
  const m0 = await readM();
  console.log('\n── ' + label + '（' + sec + '）── 容器 ' + m0.grpsH + 'px / 内容 ' + m0.scrollH + 'px（超出 ' + m0.overflow + 'px）');
  chk(label + ' 三个 summary 都已是 sticky', (m0.sums || []).every(s => s && s.pos === 'sticky'),
    (m0.sums || []).map(s => s && (s.id + ':' + s.pos)));

  if (m0.overflow > 60) {
    const st = await ev(`(function(){
      var g=document.querySelector('#ryCadSide .ry-cad-grps');
      var d=document.getElementById('ryCadGrpTl');
      var gr=g.getBoundingClientRect(), dr=d.getBoundingClientRect();
      g.scrollTop = Math.min(g.scrollTop + (dr.top - gr.top) + 120, g.scrollHeight - g.clientHeight);
      return Math.round(g.scrollTop);
    })()`);
    await sleep(350);
    const m1 = await readM();
    const tl = (m1.sums || []).find(s => s && s.id === 'ryCadGrpTl');
    chk(label + ' 滚动 ' + st + 'px 后标题钉在容器顶端', tl && Math.abs(tl.top - m1.grpsTop) <= 1.5,
      { grpsTop: m1.grpsTop, tlTop: tl && tl.top });
    const pipe = (m1.sums || []).find(s => s && s.id === 'ryCadGrpPipe');
    chk(label + ' 上一组标题已被顶出可视区（不叠在一起）', !pipe || pipe.bottom <= m1.grpsTop + 1.5,
      { grpsTop: m1.grpsTop, pipeBottom: pipe && pipe.bottom });

    await ev("(function(){var st=document.createElement('style');st.id='__neg__';st.textContent='#ryCadSide .ry-cad-grp>summary{position:static!important}';document.head.appendChild(st);return 1;})()");
    await sleep(250);
    const m2 = await readM();
    const tl2 = (m2.sums || []).find(s => s && s.id === 'ryCadGrpTl');
    chk(label + ' 注入体检：去掉 sticky 后确实滚出去', tl2 && tl2.top < m2.grpsTop - 50,
      { grpsTop: m2.grpsTop, tlTop: tl2 && tl2.top });
    await ev("(function(){var s=document.getElementById('__neg__');if(s)s.remove();var g=document.querySelector('#ryCadSide .ry-cad-grps');g.scrollTop=0;return 1;})()");
    await sleep(250);

    const m3 = await readM();
    chk(label + ' 滚回顶部后标题回到原位（不硬贴在顶端）',
      (m3.sums || []).every(s => s && s.top >= m3.grpsTop - 1.5),
      { grpsTop: m3.grpsTop, tops: (m3.sums || []).map(s => s && s.top) });
  } else {
    console.log('   （本页内容未溢出屏幕，跳过滚动断言）');
  }
}

if (process.env.SHOT) {
  await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){}return 1;})()");
  await sleep(900);
  await openAll();
  await ev("(function(){var g=document.querySelector('#ryCadSide .ry-cad-grps');var d=document.getElementById('ryCadGrpTl');var gr=g.getBoundingClientRect(),dr=d.getBoundingClientRect();g.scrollTop=g.scrollTop+(dr.top-gr.top)+150;return 1;})()");
  await sleep(400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图:', process.env.SHOT);
}
try { child.kill(); } catch (e) { }
if (!LIVE) srv.close();
console.log(ok ? '\n== 分组标题吸顶探针：全部通过 ==' : '\n== 分组标题吸顶探针：有断言失败 ==');
process.exit(ok ? 0 : 1);
