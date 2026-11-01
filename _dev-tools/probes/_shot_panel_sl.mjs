'use strict';
/* 二级「地块分区」参数面板（v609 CAD 特性面板式）实机量测。
   用法：node _probe_props_panel.mjs
         RY_ROOT=C:/tmp/xxx node _probe_props_panel.mjs   （量发布快照，推荐）
         VW=1366 VH=768 node _probe_props_panel.mjs
   量什么：
     ① 两个 .ry-props-head 是否在、高度是否 22px；
     ② #ppPlanBar2 的 pp-res-head 伪标题是否可见（v529 曾被 content:none!important 杀掉）；
     ③ 行高 22、行分隔线可见、标签列是否 46% 且带右缘竖线；
     ④ 值列（输入框 / 文本值）右边缘是否与行右边缘对齐 —— 特性面板的核心观感；
     ⑤ 面板处于「区块内原位」还是「CAD 侧栏搬移态」（两态选择器都必须命中）。 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = Number(process.env.VW || 1920), VH = Number(process.env.VH || 1041);
const PORT = 39880 + Math.floor(Math.random() * 40);
const CDP = 39580 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--proxy-server=' + (process.env.RY_PROXY || 'http://127.0.0.1:7897'), '--proxy-bypass-list=127.0.0.1;localhost',
  /* 不挡 CDN：要真把 Shoelace 拉下来，截出来的才是用户看到的渲染 */
  '--remote-debugging-port=' + CDP,
  '--user-data-dir=C:\\tmp\\cdp_ppsl_' + Date.now(), '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => {
  const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  q.on('error', rej); q.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = idc++; pend[id] = { res, rej };
  ws.send(JSON.stringify({ id, method: m, params: p }));
  setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000);
});
const PAGE = 'http://127.0.0.1:' + PORT + '/index.html';
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => {
  const o = JSON.parse(e.data);
  if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; }
  if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); }
});
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
await send('Page.reload', { ignoreCache: true });
await sleep(3000);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) };
  return r.result.value;
};
for (let i = 0; i < 60; i++) { if (await ev('!!window.ppLoadPolygon') === true) break; await sleep(400); }
/* 公告遮罩 z=11990 / rgba(15,23,42,.34)：必须**每次量测/截图前**都隐藏一次 ——
   rySetTab 会重建公告层，只在开头隐藏一次会被覆盖（实测截出的图整体压暗 ~25%）。 */
const HIDE_MASK = "(function(){var n=0;document.querySelectorAll('.ry-ann-mask').forEach(function(e){e.style.setProperty('display','none','important');n++;});return n;})()";
await ev("(function(){ try{ window.RyAnnounce && window.RyAnnounce.close && window.RyAnnounce.close(); }catch(e){} return 1; })()");
await ev(HIDE_MASK);
console.log('载入地块:', await ev("(function(){ window.rySetTab('pipePlanSection','edit'); window.measuredPolygon=[{x:0,y:0},{x:200,y:0},{x:200,y:60},{x:0,y:60}]; window.measuredArea=12000; try{ window.ppLoadPolygon(); }catch(e){ return 'err '+e.message; } return 1; })()"));
/* Shoelace 加载慢，CAD 侧栏可能还没被打开（实测 side 宽 0 / data-ry-open=0）⇒ 强制展开，
   否则截出来是 0 宽的空白。 */
await sleep(1500);
await ev("(function(){var c=document.getElementById('ryCadSide');if(c)c.setAttribute('data-ry-open','1');var g=document.getElementById('ryCadGrpPipe');if(g)g.open=true;return 1;})()");
/* 量测时把「水力计算结果」强制展开（它默认 pp-res-off），否则结果行不参与量测 */
/* 量测时把「水力计算结果」强制展开（它默认 pp-res-off），否则结果行不参与量测。
   EXPAND=0 可保留默认折叠态（用来截「用户打开页面看到的原样」）。 */
if (process.env.EXPAND !== '0') await ev("(function(){var b=document.getElementById('ppPlanBar2');if(b)b.classList.remove('pp-res-off');return 1;})()");
await sleep(300);
/* 就绪闸门：偶发（约 2/5）面板宽度还是 0 —— 说明 rySetTab 的视图切换尚未落定，直接量会得到一片 0。
   轮询到宽度 > 100 再量，别用固定 sleep 赌。 */
for (let i = 0; i < 25; i++) {
  const w = await ev("(function(){var s=document.getElementById('ppSide');return s?Math.round(s.getBoundingClientRect().width):0;})()");
  if (w > 100) break;
  await sleep(300);
}
console.log('面板宽度就绪:', JSON.stringify(await ev("(function(){var s=document.getElementById('ppSide'),c=document.getElementById('ryCadSide'),d=document.getElementById('ryCadGrpPipe');return {side:s?Math.round(s.getBoundingClientRect().width):-1,cad:c?Math.round(c.getBoundingClientRect().width):-1,cadOpen:c?c.getAttribute('data-ry-open'):null,detOpen:d?d.open:null,body:document.body.className,sec:(function(){var x=document.getElementById('pipePlanSection');return x?getComputedStyle(x).display:'-'})()};})()")));
await ev(HIDE_MASK);   /* rySetTab 会重建公告遮罩，量测前再压一次 */

const D = `JSON.stringify((function(){
  var side=document.getElementById('ppSide');
  if(!side) return {err:'no #ppSide'};
  var cs=getComputedStyle(side);
  var moved=!!side.closest('#ryCadSide');
  var heads=[].slice.call(side.querySelectorAll('.ry-props-head')).map(function(h){
    var r=h.getBoundingClientRect(), c=getComputedStyle(h);
    return {txt:(h.textContent||'').trim(), h:+r.height.toFixed(1), bg:c.backgroundColor, fs:c.fontSize, fw:c.fontWeight, pad:c.padding};
  });
  var bar2=document.getElementById('ppPlanBar2');
  var b2=null;
  if(bar2){
    var c2=getComputedStyle(bar2,'::before');
    b2={cls:bar2.className, bh:bar2.getBoundingClientRect().height,
        before:{content:c2.content, display:c2.display, h:c2.height, bg:c2.backgroundColor, fs:c2.fontSize}};
  }
  var rows=[].slice.call(side.querySelectorAll('.pp-plan-item')).filter(function(x){return getComputedStyle(x).display!=='none';});
  var sample=rows.slice(0,3).map(function(r){
    var rr=r.getBoundingClientRect(), c=getComputedStyle(r);
    var lab=r.querySelector('.pp-plan-label');
    var ctl=r.querySelector('input:not([hidden]),.pp-plan-val');
    var lr=lab?lab.getBoundingClientRect():null, cr=ctl?ctl.getBoundingClientRect():null;
    return { txt:(r.textContent||'').trim().replace(/\\s+/g,'').slice(0,14),
      h:+rr.height.toFixed(1), bw:c.borderBottomWidth+' '+c.borderBottomColor, pad:c.padding,
      fw:ctl?getComputedStyle(ctl).fontWeight:null, unit:(r.querySelector('.pp-plan-unit')||{}).textContent||null,
      labW:lr?+lr.width.toFixed(1):null, labRatio:lr?+(lr.width/rr.width).toFixed(3):null,
      labBorderR:lab?getComputedStyle(lab).borderRightWidth+' '+getComputedStyle(lab).borderRightColor:null,
      ctlRight:cr?+cr.right.toFixed(1):null, rowRight:+rr.right.toFixed(1),
      ctlGap:cr?+(rr.right-cr.right).toFixed(1):null };
  });
  var odd=rows.filter(function(r){var rr=r.getBoundingClientRect();return Math.abs(rr.height-22)>1;}).map(function(r){
    return (r.textContent||'').trim().replace(/\\s+/g,'').slice(0,10)+'='+r.getBoundingClientRect().height.toFixed(0);
  });
  var rights={};
  rows.forEach(function(r){var c=r.querySelector('input:not([hidden]),.pp-plan-val');if(!c)return;rights[+c.getBoundingClientRect().right.toFixed(1)]=1;});
  var fr=side.querySelector('.pp-plan-item-fluid-input');
  var tick=null;
  if(fr){
    var fa=getComputedStyle(fr,'::after');
    var frr=fr.getBoundingClientRect();
    var num=fr.querySelector('input:not([hidden])')||fr.querySelector('sl-input[data-ry-proxy-for]');
    var nr=num?num.getBoundingClientRect():null;
    tick={ content:fa.content, display:fa.display, w:fa.width, h:fa.height, right:fa.right, bg:fa.backgroundColor,
      rowRight:+frr.right.toFixed(1), numRight:nr?+nr.right.toFixed(1):null,
      tickX:+(frr.right-parseFloat(fa.right)-parseFloat(fa.width)/2).toFixed(1) };
  }
  var st=side.querySelector('.pp-num-step');
  var stp=null;
  if(st){var sr=st.getBoundingClientRect();stp={x:+sr.x.toFixed(1),x2:+(sr.x+sr.width).toFixed(1),w:+sr.width.toFixed(1),h:+sr.height.toFixed(1),btns:st.children.length};}
  return { vw:window.innerWidth, moved:moved, host:moved?'#ryCadSide（搬移态）':'#pipePlanSection（原位）',
    sideW:+side.getBoundingClientRect().width.toFixed(0), sidePad:cs.padding, sideGap:cs.gap,
    cls:side.className, headCount:heads.length, heads:heads, bar2:b2,
    barBg:getComputedStyle(document.getElementById('ppPlanBar')).backgroundColor,
    resBg:getComputedStyle(document.getElementById('ppPlanBar2')).backgroundColor,
    itemBg:getComputedStyle(rows[0]).backgroundColor,
    hostBg:(function(){var h=side.closest('.ry-cad-grp-body')||side.parentNode;return h?getComputedStyle(h).backgroundColor:'-';})(),
    overlay:(function(){
      var r=side.getBoundingClientRect();
      var el=document.elementFromPoint(Math.round(r.x+r.width/2), Math.round(r.y+80));
      var chain=[];
      while(el&&el!==document.documentElement){
        var c=getComputedStyle(el);
        if(c.backgroundColor!=='rgba(0, 0, 0, 0)'||c.opacity!=='1'||c.position==='fixed')
          chain.push({t:el.tagName+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ').slice(0,2).join('.'):''),bg:c.backgroundColor,op:c.opacity,pos:c.position,z:c.zIndex});
        el=el.parentElement;
      }
      return chain.slice(0,6);
    })(),
    rowCount:rows.length, sample:sample, notH22:odd, tick:tick, step:stp,
    ctlRights:Object.keys(rights).map(Number).sort(function(a,b){return a-b;}),
    overRight:rows.filter(function(r){var c=r.querySelector('input:not([hidden]),.pp-plan-val');if(!c)return false;return c.getBoundingClientRect().right>r.getBoundingClientRect().right+0.6;}).length };
})())`;
const out = await ev(D);
console.log(JSON.stringify(typeof out === 'string' ? JSON.parse(out) : out, null, 2));
if (process.env.SHOT) {
  await ev(HIDE_MASK);
  if (process.env.TINT) await ev("(function(){['ppPlanBar','ppPlanBar2'].forEach(function(i){var b=document.getElementById(i);if(b)b.style.setProperty('background','" + process.env.TINT + "','important');});return 1;})()");
  const box = await ev("(function(){var s=document.getElementById('ppSide');var r=s.getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),w:Math.ceil(r.width),h:Math.min(Math.ceil(r.height),780)};})()");
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 2 } });
  fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图已存:', process.env.SHOT, box);
}
{
  const before = await ev("document.getElementById('planLift').value");
  const pt = await ev("(function(){var b=document.querySelector('.pp-num-step[data-step-for=\"planLift\"] button[data-step=\"up\"]');if(!b)return null;var r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
  if (pt) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(400);
    const after = await ev("document.getElementById('planLift').value");
    const shown = await ev("(function(){var s=document.querySelector('sl-input[data-ry-proxy-for=planLift]');return s&&!s.hidden?s.value:'(代理未启用)';})()");
    console.log('微调键真实点击(命中点 ' + JSON.stringify(pt) + '):', before, '->', after, '| 代理显示:', shown);
  } else console.log('微调键未找到');
}
/* 悬停态单行 6× 图：原生 ▲▼ 只在悬停时才画，非悬停截图看不到它 —— 必须派真实鼠标 */
{
  const hr = await ev("(function(){var r=document.querySelector('#ppSide .pp-plan-item-fluid-input');if(!r)return null;var b=r.getBoundingClientRect();return {x:Math.round(b.right-56),y:Math.round(b.y+b.height/2)};})()");
  if (hr) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hr.x, y: hr.y, button: 'none' });
    await sleep(250);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hr.x, y: hr.y, button: 'none' });
    await sleep(400);
    await ev(HIDE_MASK);
    const rb2 = await ev("(function(){var r=document.querySelector('#ppSide .pp-plan-item-fluid-input');var b=r.getBoundingClientRect();return {x:Math.floor(b.x+100),y:Math.floor(b.y)-2,width:200,height:Math.ceil(b.height)+4,scale:6};})()");
    if (rb2) {
      const s3 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: rb2 });
      fs.writeFileSync('C:/tmp/v609h_hover_row.png', Buffer.from(s3.data, 'base64'));
      console.log('悬停单行:', 'C:/tmp/v609h_hover_row.png', JSON.stringify(rb2));
    }
  } else console.log('悬停单行: 行未找到');
}
child.kill(); srv.close(); process.exit(0);
