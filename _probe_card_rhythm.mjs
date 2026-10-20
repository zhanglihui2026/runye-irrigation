'use strict';
/* 卡内节奏口径断言：在真实页面里建一份 .ry-float-card + 各角色类，读 computed 值。
   验的是「CSS 真的生效」，不依赖选择状态（多选/管段信息那些行在无数据时不渲染）。
   用法：node _probe_card_rhythm.mjs   ｜ RY_URL=<线上地址> 直连线上 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 16200 + Math.floor(Math.random() * 40);
const CDP = 15800 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
let srv = null, PAGE;
if (process.env.RY_URL) { PAGE = process.env.RY_URL; }
else {
  srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
    r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  PAGE = 'http://127.0.0.1:' + PORT + '/index.html?full=1';
}
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_rh_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
for (let i = 0; i < 80; i++) {
  const r = await ev("!!window.RyPlanParams && !!document.getElementById('ppSide')");
  if (r === true) break;
  await sleep(500);
}
await sleep(1200);

const res = await ev(`(function(){
  var host=document.createElement('div');
  host.className='ry-float-card';
  host.style.cssText='position:fixed;left:-9999px;top:0;width:220px';
  host.innerHTML =
    '<div class="ry-float-head"><b class="ry-float-title">T</b></div>'+
    '<div class="ry-float-body">'+
      '<div class="ry-float-sec is-first" id="pb-sec-t">图层显隐</div>'+
      '<div class="ry-float-sec is-divided" id="pb-sec">当前选中</div>'+
      '<label class="ry-float-row" id="pb-row"><input type="checkbox" checked><span>标注显示</span></label>'+
      '<div class="ry-float-note" id="pb-note">未选中</div>'+
      '<div class="ry-float-label" id="pb-label">管径</div>'+
      '<div class="ry-float-value" id="pb-val"><span>管径</span><span>Ø90</span></div>'+
      '<div class="ry-float-chips"><button type="button" class="ry-float-chip" id="pb-chip">Ø63</button>'+
        '<button type="button" class="ry-float-chip is-danger" id="pb-chip2">清除</button></div>'+
      '<div class="ry-float-legend" id="pb-legend"><b>水力图例</b><br>正常</div>'+
      '<label class="ry-float-row ry-float-sep" id="pb-sep"><input type="checkbox"><span>☀️ 田间模式</span></label>'+
      '<input id="pb-input" type="text" value="x">'+
      '<select id="pb-select"><option>a</option></select>'+
      '<textarea id="pb-ta">x</textarea>'+
    '</div>';
  document.body.appendChild(host);
  function q(id){ return document.getElementById(id); }
  function cs(id){ var el=q(id); return el?getComputedStyle(el):null; }
  var out=[];
  function A(name,got,want){
    var ok = String(got)===String(want);
    out.push((ok?'OK   ':'FAIL ')+name+' = '+got+(ok?'':'  (期望 '+want+')'));
  }
  var r;
  A('.ry-float-row 行高', cs('pb-row').lineHeight, '19.2px');
  A('.ry-float-row 行盒高', Math.round(q('pb-row').getBoundingClientRect().height*100)/100, '19.2');
  A('.ry-float-row display', cs('pb-row').display, 'flex');
  A('.ry-float-row 勾选框 12x12', Math.round(q('pb-row').querySelector('input').getBoundingClientRect().width)+'x'+Math.round(q('pb-row').querySelector('input').getBoundingClientRect().height), '12x12');
  A('.ry-float-sec 字重', cs('pb-sec').fontWeight, '600');
  A('.ry-float-sec 上边距', cs('pb-sec').marginTop, '8px');
  A('.ry-float-sec 下边距', cs('pb-sec').marginBottom, '3px');
  A('.ry-float-sec.is-divided 上内距', cs('pb-sec').paddingTop, '6px');
  A('.ry-float-sec.is-first 上边距', cs('pb-sec-t').marginTop, '0px');
  A('.ry-float-note 字号', cs('pb-note').fontSize, '11px');
  A('.ry-float-note 行高', cs('pb-note').lineHeight, '16.5px');
  A('.ry-float-label 行高', cs('pb-label').lineHeight, '19.2px');
  A('.ry-float-value display', cs('pb-val').display, 'flex');
  A('.ry-float-value 键宽', Math.round(q('pb-val').firstElementChild.getBoundingClientRect().width)+'px', '52px');
  A('.ry-float-chip 字号（压过全局 13px）', cs('pb-chip').fontSize, '11px');
  A('.ry-float-chip 高度', cs('pb-chip').height, '20px');
  A('.ry-float-chip.is-danger 色', cs('pb-chip2').color, 'rgb(185, 28, 28)');
  A('.ry-float-legend 字号', cs('pb-legend').fontSize, '10px');
  A('.ry-float-legend 行高', cs('pb-legend').lineHeight, '15px');
  A('.ry-float-sep 上内距', cs('pb-sep').paddingTop, '6px');
  A('卡内 input 字号（压过全局 13px）', cs('pb-input').fontSize, '12px');
  A('卡内 select 字号', cs('pb-select').fontSize, '12px');
  A('卡内 textarea 字号', cs('pb-ta').fontSize, '12px');
  A('卡正文行高（根继承）', getComputedStyle(host).lineHeight, '19.2px');
  host.remove();
  return out;
})()`);
if (res && res.__err) { console.log('EVAL ERROR', res.__err); }
else {
  console.log('URL =', PAGE);
  console.log(res.join('\n'));
  const fails = res.filter(l => l.startsWith('FAIL')).length;
  console.log('--- ' + (res.length - fails) + '/' + res.length + ' 通过' + (fails ? '，' + fails + ' 项失败' : ''));
}
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv && srv.close(); } catch (e) { }
process.exit(0);
