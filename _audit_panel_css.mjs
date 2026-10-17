'use strict';
/* 二级/三级左栏样式「层数」审计
   把「堆了好几层」量化成可决策的数字：
     1. 每条规则是否命中面板元素（按文件分组）—— 含「从不命中」的死规则
     2. 关键元素 × 关键属性 的竞争层数（谁赢、几条被完全压制）
     3. 同一 (选择器, 属性) 在多处重复声明
   两种 DOM 状态各量一遍：rail（面板搬进 #ryCadSide）/ 原位（搬回 section）。
   用法：node _audit_panel_css.mjs [out.json] ｜ RY_ROOT=<基线目录> */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WS = globalThis.WebSocket;

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const OUT = process.argv[2] || '_audit_panel_css.json';
const PORT = 15300 + Math.floor(Math.random() * 60);
const CDP = 14900 + Math.floor(Math.random() * 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p.replace(/^\//, ''));
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; }
  r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(r2);
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_audit_' + Date.now(), '--window-size=1520,980'], { stdio: 'ignore' });
const hreq = (method, p) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port: CDP, path: p, method }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end();
});
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws = null; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout')); } }, 180000); });
const url = process.env.RY_URL || ('http://127.0.0.1:' + PORT + '/index.html?full=1');
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(url)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
/* 无头新标签常被判后台 ⇒ rAF 不跑 ⇒ MutationObserver 里的 syncAll 被卡住。必须前置 + 聚焦仿真 */
try{ await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled',{enabled:true}); }catch(e){}
await send('Emulation.setDeviceMetricsOverride', { width: 1520, height: 980, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 60; i++) {
  const r = await send('Runtime.evaluate', { expression: "!!window.RyPlanParams && !!document.getElementById('ppSide') && !!document.getElementById('tlSide')", returnByValue: true });
  if (r.result && r.result.value === true) break;
  await sleep(500);
}
await sleep(1500);
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) };
  return r.result.value;
};

const COLLECT = `(function(){
  var PROPS = ['font-size','font-weight','font-family','line-height','color','background-color','background',
    'border','border-radius','padding-left','padding-right','padding-top','padding-bottom','margin-left','margin-right',
    'margin-top','margin-bottom','display','gap','height','min-height','width','flex','overflow','box-shadow','text-align'];
  function specOf(sel){
    var best=0;
    sel.split(',').forEach(function(p){
      var a=(p.match(/#[\\w-]+/g)||[]).length, b=(p.match(/\\.[\\w-]+/g)||[]).length,
          c=(p.match(/\\[[^\\]]+\\]/g)||[]).length + (p.match(/:{1,2}(not|is|where)\\(/g)||[]).length,
          e=(p.match(/(^|[\\s>+~])([a-zA-Z][\\w-]*)/g)||[]).length;
      var v=a*100+b*10+c*10+e; if(v>best) best=v;
    });
    return best;
  }
  var rules=[];
  function walk(list, sheetName, media){
    for(var i=0;i<list.length;i++){
      var r=list[i];
      if(r.type===4){ walk(r.cssRules, sheetName, (media?media+' | ':'')+'@media '+r.conditionText); continue; }
      if(r.type!==1 || !r.selectorText) continue;
      var decls={}, n=0;
      for(var j=0;j<r.style.length;j++){
        var p=r.style[j]; if(PROPS.indexOf(p)<0) continue;
        decls[p]=r.style.getPropertyValue(p);
        n++;
      }
      if(!n) continue;
      rules.push({ sheet: sheetName, media: media||'', sel: r.selectorText.replace(/\\s+/g,' ').trim(),
        spec: specOf(r.selectorText), decls: decls, order: rules.length });
    }
  }
  var sheetErr=[];
  for(var i=0;i<document.styleSheets.length;i++){
    var sh=document.styleSheets[i], name='(inline)';
    try{ name = sh.href ? sh.href.split('/').slice(-2).join('/').split('?')[0] : ('(inline#'+i+')'); }catch(e){}
    try{ walk(sh.cssRules, name, ''); }catch(e){ sheetErr.push(name); }
  }
  /* 面板元素集合：两条左栏 + 工具栏容器（去重） */
  var uniq=[], seen=new Set();
  ['#ppSide','#tlSide','#ryCadSide'].forEach(function(s){
    var root=document.querySelector(s); if(!root) return;
    if(!seen.has(root)){ seen.add(root); uniq.push(root); }
    var l=root.querySelectorAll('*');
    for(var i=0;i<l.length;i++){ if(!seen.has(l[i])){ seen.add(l[i]); uniq.push(l[i]); } }
  });
  uniq.forEach(function(el,i){ el.__ai=i; });
  var hits=new Array(uniq.length); for(var i=0;i<hits.length;i++) hits[i]=[];
  rules.forEach(function(r, ri){
    var nodes; try{ nodes=document.querySelectorAll(r.sel); }catch(e){ r.bad=true; return; }
    r.hit=0;
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      if(el.__ai===undefined) continue;
      r.hit++; hits[el.__ai].push(ri);
    }
  });
  function desc(el){
    var c=(el.className&&typeof el.className==='string')?el.className.trim().split(/\\s+/).slice(0,2).join('.'):'';
    return el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(c?'.'+c:'');
  }
  function isUniversal(sel){ return /(^|[\\s,])(\\*|body\\s*\\*|body)([\\s,>]|$)/.test(sel); }
  /* 元素 × 属性 竞争层数 */
  var perProp={}, comp=[], winners={};
  uniq.forEach(function(el){
    var list=hits[el.__ai]||[]; if(!list.length) return;
    var byProp={}, all=0;
    list.forEach(function(ri){ all++; var r=rules[ri]; for(var p in r.decls){ (byProp[p]=byProp[p]||[]).push(ri); } });
    var worst=0, worstProp='';
    for(var p in byProp){
      var arr=byProp[p], c=arr.length;
      perProp[p]=perProp[p]||{max:0,sum:0,n:0};
      if(c>perProp[p].max) perProp[p].max=c;
      perProp[p].sum+=c; perProp[p].n++;
      if(c>worst){ worst=c; worstProp=p; }
    }
    if(worst>=3){
      var arr=byProp[worstProp];
      /* 赢家：!important > 特异性 > 文档序 */
      var win=arr.slice().sort(function(x,y){
        var rx=rules[x], ry=rules[y];
        var ix=rx.imp?1:0, iy=ry.imp?1:0;
        if(ix!==iy) return ix-iy;
        if(rx.spec!==ry.spec) return rx.spec-ry.spec;
        return rx.order-ry.order;
      }).pop();
      var w=rules[win];
      comp.push({ el: desc(el), props: Object.keys(byProp).length, rules: all, layers: worst, prop: worstProp,
        winner: w.sheet+' {'+w.sel+'} = '+w.decls[worstProp],
        losers: arr.filter(function(x){ return x!==win; }).map(function(x){ var r=rules[x]; return r.sheet+' {'+r.sel+'}'; }).slice(0,6),
        loserCount: arr.length-1 });
    }
  });
  comp.sort(function(a,b){ return (b.layers-a.layers)||(b.rules-a.rules); });
  /* 规则命中分布 */
  var dist={}; var hitRules=0;
  rules.forEach(function(r){ if(r.bad) return; if(r.hit>0) hitRules++; var k=r.hit===0?'0':(r.hit>=30?'30+':(r.hit>=10?'10-29':String(r.hit))); dist[k]=(dist[k]||0)+1; });
  var bySheet={};
  rules.forEach(function(r){ if(r.bad) return; var b=bySheet[r.sheet]=bySheet[r.sheet]||{total:0,hit:0}; b.total++; if(r.hit>0) b.hit++; });
  /* 重复声明：同一 选择器+属性 多处出现 */
  var dup={};
  rules.forEach(function(r){ if(r.bad) return; for(var p in r.decls){ var k=r.sel+' || '+p; (dup[k]=dup[k]||[]).push(r.sheet+' :: '+r.decls[p]+(r.media?' ('+r.media+')':'')); } });
  var dupList=Object.keys(dup).filter(function(k){ return dup[k].length>1; }).map(function(k){ return { key:k, n:dup[k].length, where:dup[k] }; })
    .sort(function(a,b){ return b.n-a.n; });
  var PANEL_RE=/(pp-|ppSide|tlSide|tl-plan|tlCal|ry-cad)/;
  var FACT_SEL=['#threeLevelView','#threeLevelView .pp-plan-item','#threeLevelView .pp-plan-bar',
    '#ryCadSide [data-pp="pipePlanSection"]','#ryCadSide [data-pp="pipePlanSection"] .pp-title',
    '.pp-title','.pp-toolbar','#ppSide .pp-plan-item','#ppSide','#ppSide[data-pp]','[data-pp]'];
  var facts={};
  FACT_SEL.forEach(function(s){ try{ facts[s]=document.querySelectorAll(s).length; }catch(e){ facts[s]='ERR'; } });
  return {
    facts: facts,
    totalRules: rules.length, hitRules: hitRules, elCount: uniq.length, sheetErr: sheetErr, dist: dist,
    bySheet: bySheet,
    deadPanelRules: rules.filter(function(r){ return !r.bad && r.hit===0 && PANEL_RE.test(r.sel); }).length,
    deadPanel: rules.filter(function(r){ return !r.bad && r.hit===0 && PANEL_RE.test(r.sel); }).map(function(r){ return r.sheet+' {'+r.sel+'}'; }),
    universalHit: rules.filter(function(r){ return !r.bad && r.hit>0 && isUniversal(r.sel); }).length,
    competition: comp.slice(0,30),
    perProp: perProp,
    dup: dupList.slice(0,60), dupCount: dupList.length
  };
})()`;

const STATE = `(function(){ var a=document.getElementById('ppSide'), b=document.getElementById('tlSide');
  return { sec: document.body.getAttribute('data-ry-sec'), cls: document.body.className,
    ppInRail: !!(a&&a.closest('#ryCadSide')), tlInRail: !!(b&&b.closest('#ryCadSide')) }; })()`;
const forceState = async (sec) => {
  /* 实测：只改 data-ry-sec 不触发搬移；必须再抖一次 body class 让 MutationObserver 走 syncAll。
     先 ryShowSection 把 .ry-active 也摆正，否则 curSec() 与视觉视图不一致。 */
  await ev(`(function(){ try{ if(window.ryShowSection) window.ryShowSection(${JSON.stringify(sec)}); }catch(e){} return true; })()`);
  await sleep(800);
  await ev(`document.body.setAttribute('data-ry-sec', ${JSON.stringify(sec)})`);
  await ev(`document.body.classList.remove('ry-tool'); document.body.classList.add('ry-tool')`);
  const want = sec !== 'designInput';
  for (let i = 0; i < 24; i++) {
    await sleep(400);
    const st = await ev(STATE);
    if (!!st.ppInRail === want && !!st.tlInRail === want) return st;
    if (i === 5 || i === 11 || i === 17) {
      try { await send('Page.bringToFront'); } catch (e) {}
      await ev(`document.body.classList.remove('ry-tool'); document.body.classList.add('ry-tool')`);
    }
  }
  return ev(STATE);
};

const out = {};
out.railState = await forceState('tlPipePlanSection');
out.rail = await ev(COLLECT);
out.baseState = await forceState('designInput');
out.base = await ev(COLLECT);
/* 原位态下两条 section 默认 display:none，但匹配是 DOM 层的，不影响结论 */

fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 1));

function report(tag, s) {
  if (!s || s.__err) { console.log(tag + ' 采集失败 ' + JSON.stringify(s).slice(0, 300)); return; }
  console.log('\n===== ' + tag + ' =====');
  console.log('  面板元素 ' + s.elCount + ' ｜ 规则总数 ' + s.totalRules + ' ｜ 命中面板的 ' + s.hitRules + ' ｜ 其中全局选择器 ' + s.universalHit);
  console.log('  命中分布 ' + JSON.stringify(s.dist));
  const rows = Object.entries(s.bySheet).filter(([, v]) => v.hit).sort((a, b) => b[1].hit - a[1].hit);
  console.log('  命中面板的规则（按文件）：');
  rows.forEach(([k, v]) => console.log('    ' + String(v.hit).padStart(3) + '/' + String(v.total).padStart(4) + '  ' + k));
  console.log('  面板相关但从不命中的规则：' + s.deadPanelRules + ' 条');
  console.log('  属性竞争层数（max / 平均）：');
  Object.entries(s.perProp).sort((a, b) => b[1].max - a[1].max).slice(0, 12)
    .forEach(([p, v]) => console.log('    ' + p.padEnd(15) + ' max=' + String(v.max).padStart(2) + ' 均=' + (v.sum / v.n).toFixed(1).padStart(5) + ' (n=' + v.n + ')'));
  console.log('  元素级最拥挤 top10：');
  (s.competition || []).slice(0, 10).forEach(c => console.log('    ' + String(c.layers).padStart(2) + ' 层@' + c.prop.padEnd(12) + ' ' + c.el.padEnd(38) + ' 总命中' + String(c.rules).padStart(3) + ' 条 赢家 ' + c.winner));
  console.log('  重复声明（同选择器+同属性多处）：' + s.dupCount + ' 组，top6：');
  (s.dup || []).slice(0, 6).forEach(d => console.log('    ×' + d.n + '  ' + d.key));
}
report('rail 态（双左栏在 #ryCadSide 内）', out.rail);
report('原位态（双左栏搬回 section）', out.base);
console.log('\nDOM 事实: '+JSON.stringify(out.rail.facts));console.log('\n状态: rail=' + JSON.stringify(out.railState) + '  base=' + JSON.stringify(out.baseState));
console.log('明细 → ' + OUT);
ws.close(); try { child.kill(); } catch (e) { } srv.close(); process.exit(0);
