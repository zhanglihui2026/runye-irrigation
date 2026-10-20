'use strict';
/* 探问：计算「最远水路」时，管道被地块剪切掉（clip-path）的那部分算不算？
   口径：SVG 显示层 <g clip-path="url(#tlPlotClip)"> 只裁剪显示；tlDiagramData 落的是设计几何。
   本探针实测：用非矩形（凸梯形）地块 ⇒ 网格化分区的外圈会伸出地块边界 ⇒ 图面被裁，
   对比「完整折线长」vs「多边形裁剪后可见长」vs「computeThreeLevel 实际采用长（*LenUsed/wp.*）」。
   用法：node _probe_clip_len.mjs ｜ RY_URL=<线上> 直连线上 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 17460 + Math.floor(Math.random() * 30);
const CDP = 16960 + Math.floor(Math.random() * 30);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_cl_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
let ready = false;
for (let i = 0; i < 80; i++) {
  const r = await ev("!!window.RyPlanParams && !!document.getElementById('tlDiagramContent') && typeof window.tlAutoGenerate==='function' && typeof window.rySetTab==='function' && typeof computeThreeLevel==='function'");
  if (r === true) { ready = true; break; }
  await sleep(500);
}
if (!ready) { console.log('FAIL 就绪闸门超时'); process.exit(2); }

const out = await ev(`(function(){
  var L=[];
  function say(s){ L.push(s); }
  function A(name,ok,got,want){ L.push((ok?'OK   ':'FAIL ')+name+' = '+got+(ok?'':'  (期望 '+want+')')); return ok; }
  function plen(pts){ var s=0; for(var i=0;i+1<pts.length;i++)s+=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y); return s; }
  function centroid(p){ var x=0,y=0; p.forEach(function(q){x+=q.x;y+=q.y;}); return {x:x/p.length,y:y/p.length}; }
  /* Cyrus-Beck：线段对凸多边形裁剪，返回可见长度 */
  function segVis(a,b,poly){
    var dx=b.x-a.x, dy=b.y-a.y, segL=Math.hypot(dx,dy);
    if(segL<1e-9) return 0;
    var c=centroid(poly), tE=0, tL=1;
    for(var i=0;i<poly.length;i++){
      var p1=poly[i], p2=poly[(i+1)%poly.length];
      var ex=p2.x-p1.x, ey=p2.y-p1.y;
      /* 内法向：两个垂直候选里取指向质心的那个 */
      var n1x=ey, n1y=-ex;
      var mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2;
      var nx=n1x, ny=n1y;
      if(nx*(c.x-mx)+ny*(c.y-my)<0){ nx=-n1x; ny=-n1y; }
      var nd=nx*dx+ny*dy, na=nx*(a.x-p1.x)+ny*(a.y-p1.y);
      if(Math.abs(nd)<1e-12){ if(na<0) return 0; continue; }
      var t=-na/nd;
      if(nd>0){ if(t>tE) tE=t; } else { if(t<tL) tL=t; }
      if(tE>tL) return 0;
    }
    return Math.max(0,tL-tE)*segL;
  }
  function clipLen(pts,poly){ var s=0; for(var i=0;i+1<pts.length;i++) s+=segVis(pts[i],pts[i+1],poly); return s; }

  function gen(poly){
    try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
    try{ localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
    window.measuredPolygon=poly;
    window.tlAutoGenerate(); window.tlAutoGenerate();
    return window.tlDiagramData;
  }

  function scene(tag, poly){
    say(''); say('===== '+tag+' =====');
    var d=gen(poly);
    var P=d.poly||poly;
    var fr=d.frontPipe||[], mp=d.mainPipes||[], bp=d.branchPipes||[];
    var frF=plen(fr), frC=clipLen(fr,P);
    var mpF=mp.map(plen), mpC=mp.map(function(l){return clipLen(l,P);});
    var bpF=bp.map(plen), bpC=bp.map(function(l){return clipLen(l,P);});
    var sm=function(a){return a.reduce(function(s,v){return s+v;},0);};
    say('分区数 '+mp.length+' ｜ 总管 full='+frF.toFixed(1)+' clipped='+frC.toFixed(1)+' 差='+(frF-frC).toFixed(1));
    say('主管合计 full='+sm(mpF).toFixed(1)+' clipped='+sm(mpC).toFixed(1)+' 差='+(sm(mpF)-sm(mpC)).toFixed(1));
    say('支管合计 full='+sm(bpF).toFixed(1)+' clipped='+sm(bpC).toFixed(1)+' 差='+(sm(bpF)-sm(bpC)).toFixed(1));
    var r=computeThreeLevel();
    var wp=r.wp||{};
    var zi0=wp.zoneIndex|0;
    say('几何核对：frontPipe 端点 '+JSON.stringify([fr[0],fr[fr.length-1]])+
        ' ｜ 最远区主管['+zi0+'] 端点 '+JSON.stringify([mp[zi0]?mp[zi0][0]:null, mp[zi0]?mp[zi0][mp[zi0].length-1]:null])+
        ' ｜ 地块 bbox '+JSON.stringify((function(){var xs=P.map(function(q){return q.x;}),ys=P.map(function(q){return q.y;});
          return {x0:Math.min.apply(null,xs),x1:Math.max.apply(null,xs),y0:Math.min.apply(null,ys),y1:Math.max.apply(null,ys)};})()));
    say('采用长度：frontLenUsed='+(r.frontLenUsed||0).toFixed(1)+' mainLenUsed='+(r.mainLenUsed||0).toFixed(1)+' branchLenUsed='+(r.branchLenUsed||0).toFixed(1));
    say('wp: fromFigure='+wp.fromFigure+' zoneIndex='+wp.zoneIndex+' front='+(wp.front||0).toFixed(1)+' main='+(wp.main||0).toFixed(1)+' branch='+(wp.branch||0).toFixed(1));
    /* D：材料口径同源性 —— RyMaterialAudit.buckets 直接吃 tlDiagramData（完整几何） */
    var mat=null;
    try{
      var AE=window.RyTlAutoEdits, hid=window.tlIsPipeHidden;
      var bk=window.RyMaterialAudit.buckets(d,r,AE,hid,window.tlFrontVisibleRatio?window.tlFrontVisibleRatio():1,(window.RyTlEditPipes&&window.RyTlEditPipes.list)?window.RyTlEditPipes.list():[]);
      if(bk){ mat=JSON.stringify(bk,function(k,v){return typeof v==='number'?Math.round(v*10)/10:v;}).slice(0,420); }
    }catch(e){ mat={err:String(e).slice(0,120)}; }
    say('材料 buckets: '+JSON.stringify(mat));
    var zi=wp.zoneIndex|0;
    var info={tag:tag,
      frontFull:frF, frontClip:frC,
      mainFull:sm(mpF), mainClip:sm(mpC),
      branchFull:sm(bpF), branchClip:sm(bpC),
      ziMainFull:(mpF[zi]||0), ziMainClip:(mpC[zi]||0),
      ziBranchFull:(bpF[zi]||0), ziBranchClip:(bpC[zi]||0),
      wpMain:wp.main||0, wpBranch:wp.branch||0, wpFront:wp.front||0, wpLink:wp.link||0,
      usedMain:r.mainLenUsed||0, usedBranch:r.branchLenUsed||0, usedFront:r.frontLenUsed||0,
      srcDist:(function(){try{var e=document.getElementById('planSrcDist');return e?+e.value||0:null;}catch(e){return null;}})()
      , mat:JSON.stringify(mat)
    };
    window.__clipInfo=window.__clipInfo||[]; window.__clipInfo.push(info);
    return info;
  }

  var rect=[{x:0,y:0},{x:600,y:0},{x:600,y:400},{x:0,y:400}];
  var trap=[{x:0,y:0},{x:600,y:0},{x:600,y:250},{x:0,y:400}];
  var A1=scene('场景A 矩形地块 600x400（对照）',rect);
  var A2=scene('场景B 梯形地块（右上/右下网格伸出地块）',trap);

  say(''); say('===== 结论断言 =====');
  /* 主控：非矩形场景下，图面确实有管道被地块裁掉（否则本问不成立，只报 INFO） */
  var cut=A2.mainFull-A2.mainClip + (A2.branchFull-A2.branchClip);
  A('B1 梯形地块确有管道伸出地块（图面被裁）', cut>0.5, cut.toFixed(1)+' m', '>0.5');
  A('B2 矩形对照：无伸出（差≈0）', Math.abs(A1.mainFull-A1.mainClip)+Math.abs(A1.branchFull-A1.branchClip)<0.5,
    (A1.mainFull-A1.mainClip).toFixed(2)+'/'+(A1.branchFull-A1.branchClip).toFixed(2), '≈0');
  /* 核心：采用的主管长度 = 未裁剪全长（不是裁剪后可见长） */
  A('C1 最远区主管：采用 = 完整几何＋接入段（非裁剪后）',
    Math.abs(A2.wpMain-(A2.ziMainFull+A2.wpLink))<0.6,
    'wp.main='+A2.wpMain.toFixed(1)+' vs 完整主管 '+A2.ziMainFull.toFixed(1)+' + 接入段 '+A2.wpLink.toFixed(1)+' = '+(A2.ziMainFull+A2.wpLink).toFixed(1), '误差<0.6');
  A('C2 最远区主管：采用 ≠ 裁剪后可见长（差 = 伸出量）',
    A2.ziMainFull-A2.ziMainClip>0.5 ? Math.abs(A2.wpMain-A2.ziMainClip)>0.5 : true,
    'wp.main='+A2.wpMain.toFixed(1)+' 裁剪后='+A2.ziMainClip.toFixed(1), '不相等');
  A('C3 支管：采用 = 完整几何（非裁剪后）',
    A2.ziBranchFull-A2.ziBranchClip>0.5 ? Math.abs(A2.usedBranch-A2.ziBranchFull)<1.5 : true,
    'branchLenUsed='+A2.usedBranch.toFixed(1)+' 完整='+A2.ziBranchFull.toFixed(1)+' 裁剪后='+A2.ziBranchClip.toFixed(1), '=完整');
  A('C4 水源距离（地块外部分）单独输入项 planSrcDist = '+A2.srcDist, true, String(A2.srcDist), '-');
  A('D1 材料口径与最远水路同源（两场景材料取值一致 ⇒ 同样含地块外部分）',
    A1.mat===A2.mat, 'A='+A1.mat+' ｜ B='+A2.mat, '两场景一致（不随地块形状/裁剪变化）');
  return L.join('\\n');
})()`);
console.log(out.__err ? 'ERR ' + out.__err : out);
try { child.kill(); } catch (e) { }
if (srv) srv.close();
process.exit(0);
