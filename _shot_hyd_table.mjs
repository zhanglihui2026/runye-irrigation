'use strict';
/* 水力卡「数据区」特写：真实数据需要点「⚡ 生成各块管路」，无头造不出 ⇒
   在真实卡片里注入一份与 inline-29.js 同结构的样例（.gr-hyd-sum + .gr-hyd-tbl），
   验证的是这两组规则的最终渲染。用法：node _shot_hyd_table.mjs <out.png> ｜ RY_ROOT=<目录> */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const OUT = process.argv[2] || 'hyd_table.png';
const PORT = 16400 + Math.floor(Math.random() * 40);
const CDP = 15950 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_ht_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html?full=1')));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
for (let i = 0; i < 80; i++) { const r = await ev("!!window.RyPlanParams && !!document.getElementById('grHydPanel')"); if (r === true) break; await sleep(500); }
await sleep(1500);
const info = await ev(`(function(){
  try{ ryShowSection('grPipeSection'); }catch(e){}
  var s=document.getElementById('grPipeSection'); if(s) s.style.setProperty('display','block','important');
  var p=document.getElementById('grHydPanel'); if(!p) return {err:'no panel'};
  var n=p,g=0; while(n&&n!==document.body&&g++<40){ var cs=getComputedStyle(n);
    if(cs.display==='none') n.style.setProperty('display','block','important'); n=n.parentElement; }
  var box=document.getElementById('grHyd');
  var html='<div class="gr-hyd-sum">'+
      '<div><span>总流量</span><b>86.4 m³/h</b></div>'+
      '<div><span>最大水头损失</span><b>7.82 m</b></div>'+
      '<div><span>合计长度</span><b>1284.5 m</b></div>'+
      '<div><span>合计亩数</span><b>42.60 亩</b></div>'+
    '</div>'+
    '<table class="gr-hyd-tbl"><thead><tr><th>块</th><th>块流量</th><th>总管dn</th><th>总管长</th><th>总管损失</th></tr></thead><tbody>'+
      '<tr><td>1</td><td>28.8</td><td>90</td><td>126.4</td><td>2.14</td></tr>'+
      '<tr><td>2</td><td>31.2</td><td>90</td><td>133.8</td><td>2.61</td></tr>'+
      '<tr><td>3</td><td>26.4</td><td>75</td><td>118.2</td><td>3.07</td></tr>'+
    '</tbody></table>'+
    '<div class="gr-hint">每块：琥珀点=各分区主管端（Ø主径），红点=块总管水头损失最大处。</div>';
  if(box){ box.innerHTML=html; } else { var b=p.querySelector('.ry-float-body'); b.insertAdjacentHTML('beforeend', html); }
  window.scrollTo(0,0);
  var r=p.getBoundingClientRect();
  var tbl=document.querySelector('.gr-hyd-tbl'), tr=tbl?tbl.querySelector('tbody tr'):null;
  /* 诊断：谁在压 td 的 font-size */
  window.__diag=[];
  try{
    var td=tbl?tbl.querySelector('td'):null;
    function walk(rules, src){
      for(var i=0;i<rules.length;i++){ var r=rules[i];
        if(r.type===4 && r.cssRules){ walk(r.cssRules, src); continue; }
        if(!r.selectorText) continue;
        var hitTd=false, hitTbl=false;
        try{ hitTd = td && td.matches(r.selectorText); }catch(e){}
        try{ hitTbl = tbl && tbl.matches(r.selectorText); }catch(e){}
        if(!hitTd && !hitTbl) continue;
        var fs=r.style && r.style.getPropertyValue('font-size');
        if(fs) window.__diag.push((hitTbl?'[TBL] ':'[TD] ')+src+' :: '+r.selectorText+' { font-size:'+fs+(r.style.getPropertyPriority('font-size')?' !important':'')+' }');
        if(/gr-hyd-tbl/.test(r.selectorText)) window.__diag.push('[FOUND] '+src+' :: '+r.selectorText+' | font-size='+(fs||'(none)'));
      }
    }
    for(var k=0;k<document.styleSheets.length;k++){ var ss=document.styleSheets[k];
      var src=(ss.href||'inline').split('/').pop();
      try{ walk(ss.cssRules, src); }catch(e){}
    }
  }catch(e){}
  window.__diag.push('td computed = '+getComputedStyle(td).fontSize+' | tbl computed = '+getComputedStyle(tbl).fontSize);
  var sum=document.querySelector('.gr-hyd-sum>div');
  return { x:Math.max(0,r.left-6), y:Math.max(0,r.top-6), w:Math.round(r.width)+12, h:Math.round(r.height)+12,
    panel:Math.round(r.width)+'x'+Math.round(r.height),
    trH: tr?Math.round(tr.getBoundingClientRect().height*100)/100:null,
    trFs: tr?getComputedStyle(tr.querySelector('td')||tr).fontSize:null,
    sumCell: sum?Math.round(sum.getBoundingClientRect().height*100)/100:null, diag: window.__diag };
})()`);
if (!info || info.err) { console.log('FAIL', JSON.stringify(info)); process.exit(1); }
await sleep(500);
const png = await send('Page.captureScreenshot', { format: 'png', clip: { x: info.x, y: info.y, width: info.w, height: info.h, scale: 2 }, captureBeyondViewport: false });
fs.writeFileSync(OUT, Buffer.from(png.data, 'base64'));
console.log('诊断:', JSON.stringify(info.diag, null, 1));
console.log('panel', info.panel, '| 表体行高', info.trH, '| 行字号', info.trFs, '| 概要单元高', info.sumCell, '->', OUT);
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv.close(); } catch (e) { }
process.exit(0);
