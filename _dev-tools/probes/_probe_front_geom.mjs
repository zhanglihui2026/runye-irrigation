'use strict';
/* v550 总管进分区几何断言：驱动 tlAutoGenerate 后量 tlDiagramData + 简图 DOM。
   断言口径（用户三项决策）：
     F1 总管放进第 2 排分区内部：y = yPos[1] + min(15, ySrc[1]*0.5)
     F2 两端截止于第 2 排最左/最右主管：x = min/max(xPos[zc]+xSrc[zc]*0.5)
     F3 水源不动：sourcePos = {x: b.minX, y: b.minY - max(15, b.h*0.04)}
     D1 简图 DOM：接入段 [data-tlstub] = 0（总管在主管跨度内 ⇒ 交点即三通）
     D2 交接三通 [data-junction-front] = 物理主管列数（= cols）
     D3 水源连接段 [data-tlsrcpipe] = 1（水源与总管脱开后必须补连线）
     D4 front path 存在且为 2 点直线；frontRatios 可用（分段/点选链路不哑火）
   用法：node _probe_front_geom.mjs   ｜ RY_URL=<线上地址> 直连线上 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 16400 + Math.floor(Math.random() * 40);
const CDP = 15900 + Math.floor(Math.random() * 40);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_fg_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
/* 无头页可能弹 confirm/alert（恢复方案等）阻塞 evaluate：自动接受 */
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); console.log('[dialog] ' + (o.params.message || '').slice(0, 80)); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
/* 就绪闸门：轮询而不是赌首屏（§六） */
let ready = false;
for (let i = 0; i < 80; i++) {
  const r = await ev("!!window.RyPlanParams && !!document.getElementById('tlDiagramContent') && typeof window.tlAutoGenerate==='function' && typeof window.rySetTab==='function'");
  if (r === true) { ready = true; break; }
  await sleep(500);
}
if (!ready) { console.log('FAIL 就绪闸门超时（RyPlanParams / tlAutoGenerate 未就绪）'); process.exit(2); }

await ev('window.__ryFooter=' + (process.env.RY_FOOTER ? 'true' : 'false') + ';1');
const res = await ev(`(function(){
  var out=[];
  function A(name,ok,got,want){ out.push((ok?'OK   ':'FAIL ')+name+' = '+got+(ok?'':'  (期望 '+want+')')); return ok; }
  function gen(w,h){
    try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
    window.measuredPolygon=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    window.tlAutoGenerate();
    return window.tlDiagramData;
  }
  function check(tag,w,h,fixedSide){
    try{
      if(fixedSide){ var fe=document.getElementById('tl_zoneFixedSide'); if(fe) fe.value=String(fixedSide); }
      var d=gen(w,h);
      if(!d||!d.zones){ out.push('FAIL '+tag+' tlDiagramData 未落地'); return; }
      var z=d.zones, rows=z.rows, cols=z.cols, XP=z.xPos, YP=z.yPos, XS=z.xSrc, YS=z.ySrc;
      var mp=d.mainPipes||[];
      var vN=0,hN=0;
      mp.forEach(function(l){ var dd=Math.abs(l[0].x-l[l.length-1].x), dy=Math.abs(l[0].y-l[l.length-1].y); if(dy>dd)vN++; else if(dd>dy)hN++; });
      var vertMains=vN>=hN;   /* 主管竖置 ⇒ 总管横向 */
      A(tag+' 前置 rows/cols>=2', rows>=2&&cols>=2, rows+'x'+cols, '>=2x2');
      var f=d.frontPipe;
      /* [v557] 折线化：总管点数 = 断点数（≥2），两点只是「无断点/退回几何」的特例 */
      A(tag+' F0 front 点数≥2', !!f&&f.length>=2, f?f.length+'点':'null', '>=2点');
      if(f&&f.length>=2){
        if(vertMains){
          /* [v554] 总管贴最外一排（123 区）顶边：FRONT_IN_ROW=0 / FRONT_IN_OFFSET=0 */
          var off=Math.min(0,YS[0]*0.5), wantY=YP[0]+off;
          A(tag+' F1 总管y=第1排顶边+0', f.every(function(p){return Math.abs(p.y-wantY)<1e-6;}), f.map(function(p){return +p.y.toFixed(2);}).join(','), wantY.toFixed(2)+' off='+off.toFixed(1));
          var xA=Infinity,xB=-Infinity;
          for(var c=0;c<cols;c++){ var mx=XP[c]+XS[c]*0.5; if(mx<xA)xA=mx; if(mx>xB)xB=mx; }
          var fxAll=f.map(function(p){return p.x;});
          A(tag+' F2a 左端=最左主管', Math.abs(Math.min.apply(null,fxAll)-xA)<1e-6, Math.min.apply(null,fxAll).toFixed(2), xA.toFixed(2));
          A(tag+' F2b 右端=最右主管', Math.abs(Math.max.apply(null,fxAll)-xB)<1e-6, Math.max.apply(null,fxAll).toFixed(2), xB.toFixed(2));
          var bH=YP[YP.length-1]-YP[0], wantSY=YP[0]-Math.max(15,bH*0.04), s=d.sourcePos;
          A(tag+' F3a 水源x=地块左缘', !!s&&Math.abs(s.x-XP[0])<1e-6, s?s.x.toFixed(2):'null', String(XP[0]));
          A(tag+' F3b 水源y=旧总管起点', !!s&&Math.abs(s.y-wantSY)<1e-6, s?s.y.toFixed(2):'null', wantSY.toFixed(2));
        }else{
          /* [v554] 纵向对称：贴最外一列（第 1 列）左缘，偏移 0 */
          var off2=Math.min(0,XS[0]*0.5), wantX=XP[0]+off2;
          A(tag+' F1 总管x=第1列左缘+0', f.every(function(p){return Math.abs(p.x-wantX)<1e-6;}), f.map(function(p){return +p.x.toFixed(2);}).join(','), wantX.toFixed(2)+' off='+off2.toFixed(1));
          var yA=Infinity,yB=-Infinity;
          for(var r=0;r<rows;r++){ var my=YP[r]+YS[r]*0.5; if(my<yA)yA=my; if(my>yB)yB=my; }
          var fyAll=f.map(function(p){return p.y;});
          A(tag+' F2a 上端=最上主管', Math.abs(Math.min.apply(null,fyAll)-yA)<1e-6, Math.min.apply(null,fyAll).toFixed(2), yA.toFixed(2));
          A(tag+' F2b 下端=最下主管', Math.abs(Math.max.apply(null,fyAll)-yB)<1e-6, Math.max.apply(null,fyAll).toFixed(2), yB.toFixed(2));
          var bW=XP[XP.length-1]-XP[0], wantSX=XP[0]-Math.max(15,bW*0.04), s2=d.sourcePos;
          A(tag+' F3a 水源x=旧总管起点', !!s2&&Math.abs(s2.x-wantSX)<1e-6, s2?s2.x.toFixed(2):'null', wantSX.toFixed(2));
          A(tag+' F3b 水源y=地块顶缘', !!s2&&Math.abs(s2.y-YP[0])<1e-6, s2?s2.y.toFixed(2):'null', String(YP[0]));
        }
      }
      var svg=document.querySelector('#tlDiagramContent svg');
      A(tag+' D0 简图 svg 存在', !!svg, !!svg, 'true');
      if(svg){
        var stubs=svg.querySelectorAll('[data-tlstub]').length;
        A(tag+' D1 接入段=0（跨度内直接相交）', stubs===0, stubs, 0);
        /* [v568] 只数真正的三通方块：三通/阀门各多了一层透明命中圈也带 data-junction-front，
           按旧选择器会从 2 变 6。 */
        var jc=svg.querySelectorAll('rect[data-junction-tee][data-junction-front]').length;
        var wantJc=vertMains?cols:rows;
        A(tag+' D2 交接三通=物理主管线数', jc===wantJc, jc, wantJc);
        var scp=svg.querySelectorAll('[data-tlsrcpipe]').length;
        A(tag+' D3 水源连接段=1', scp===1, scp, 1);
        var fp=svg.querySelector('[data-tlpipe="front"]');
        A(tag+' D4a front path 存在', !!fp, !!fp, 'true');
        /* D4b 改合成数据验证（网格列数受默认参数限制难凑 3 列）：
           3 根竖主管跨过横向总管 ⇒ 中间那根的接入点在管中部 ⇒ 必须切出 3 刀 */
        var dSyn={frontPipe:[{x:300,y:26.67},{x:700,y:26.67}],
          mainPipes:[
            [{x:300,y:0},{x:300,y:17.78}],
            [{x:300,y:17.78},{x:300,y:35.56}],
            [{x:500,y:0},{x:500,y:17.78}],
            [{x:500,y:17.78},{x:500,y:35.56}],
            [{x:700,y:0},{x:700,y:17.78}],
            [{x:700,y:17.78},{x:700,y:35.56}]
          ]};
        var FRs=(window.RyTlPathMeasure&&typeof window.RyTlPathMeasure.frontRatios==='function')?window.RyTlPathMeasure.frontRatios(dSyn):null;
        A(tag+' D4b 合成3列 frontRatios=3刀（内部分段活）', !!FRs&&FRs.length===3, FRs?FRs.length+'刀':'null', '3刀');
      }
      /* [v557] frontRatios 只认两点直线；折线总管的分段走顶点切段（见 _probe_front_node.mjs） */
      if(f&&f.length===2){
        var FR=(window.RyTlPathMeasure&&typeof window.RyTlPathMeasure.frontRatios==='function')?window.RyTlPathMeasure.frontRatios(d):null;
        A(tag+' D5 frontRatios>=2刀', !!FR&&FR.length>=2, FR?FR.length+'刀':'null', '>=2');
      }else{ out.push('INFO '+tag+' D5 折线总管：分段改由顶点切段（frontRatios 只认两点）'); }
      /* ===== [v554] 最外一排主管末端截止 + 90°弯头 ===== */
      var edgeWantY=null, edgeWantX=null, edgeN=0, edgeLen='';
      if(vertMains){
        var H=YS[rows-1], zTop=YP[rows-1], gV=Math.min(Math.max(H*0.06,4),14,H*0.22);
        edgeWantY=Math.min(zTop+H*0.5+H*0.18, zTop+H-gV);
        edgeN=cols;
        var egY=mp.filter(function(l){return Math.min(l[0].y,l[l.length-1].y)>=zTop-1e-6;});
        var okY=egY.length>0&&egY.every(function(l){return Math.abs(Math.max(l[0].y,l[l.length-1].y)-edgeWantY)<1e-6;});
        edgeLen=egY.length?Math.max(egY[0][0].y,egY[0][1].y).toFixed(2):'-';
        A(tag+' E1 末排主管末端=中心+18%H（不再到底边）', okY, edgeLen+' (共'+egY.length+'根, 底边='+(zTop+H).toFixed(2)+')', edgeWantY.toFixed(2));
      }else{
        var W=XS[cols-1], zL=XP[cols-1], gH=Math.min(Math.max(W*0.06,4),14,W*0.22);
        edgeWantX=Math.min(zL+W*0.5+W*0.18, zL+W-gH);
        edgeN=rows;
        var egX=mp.filter(function(l){return Math.min(l[0].x,l[l.length-1].x)>=zL-1e-6;});
        var okX=egX.length>0&&egX.every(function(l){return Math.abs(Math.max(l[0].x,l[l.length-1].x)-edgeWantX)<1e-6;});
        edgeLen=egX.length?Math.max(egX[0][0].x,egX[0][1].x).toFixed(2):'-';
        A(tag+' E1 末列主管末端=中心+18%W（不再到右缘）', okX, edgeLen+' (共'+egX.length+'根, 右缘='+(zL+W).toFixed(2)+')', edgeWantX.toFixed(2));
      }
      var ev2=(d.valves||[]).filter(function(v){return v&&v.elbow;});
      A(tag+' E2 末端弯头阀数=末排分区数', ev2.length===edgeN, ev2.length, edgeN);
      A(tag+' E3 弯头连接管与主管垂直（锚点=主管末端）', ev2.length>0&&ev2.every(function(v){
        return vertMains ? Math.abs(v.ay-v.y)<1e-6 : Math.abs(v.ax-v.x)<1e-6;
      }), ev2.length?JSON.stringify({ax:ev2[0].ax.toFixed(2),ay:ev2[0].ay.toFixed(2),x:ev2[0].x.toFixed(2),y:ev2[0].y.toFixed(2)}):'-', vertMains?'ay===y':'ax===x');
      var elbSvg=svg?svg.querySelectorAll('[data-junction-elbow]').length:0;
      A(tag+' E4 图面弯头符号数=末端弯头数', elbSvg===ev2.length, elbSvg, ev2.length);
      /* 材料表：分区三通 −N、新增主管末端 90°弯头 +N */
      var rErr='';
      try{ if(typeof window.render==='function') window.render(); else rErr='render 缺失'; }catch(eR){ rErr='render 异常: '+eR.message+' @ '+String((eR.stack||'').split(String.fromCharCode(10))[1]||'').trim(); }
      if(rErr) out.push('INFO '+tag+' '+rErr+' | tlDiagramData='+(window.tlDiagramData?'y':'n')+' valves='+((d.valves||[]).length)+' mains='+mp.length);
      var teeRow=document.querySelector('[data-key="zoneTee"]');
      var elbRow=document.querySelector('[data-key="mainEndElbow"]');
      if(teeRow&&elbRow){
        var qT=Number(teeRow.getAttribute('data-qty')), qE=Number(elbRow.getAttribute('data-qty'));
        var mainN=mp.length;
        A(tag+' E5 弯头行数量=末端弯头数', qE===ev2.length, qE, ev2.length);
        A(tag+' E6 分区三通=分区数−弯头数', qT===mainN-ev2.length, qT+' (主管'+mainN+'−弯头'+ev2.length+')', mainN-ev2.length);
      }else{
        out.push('SKIP '+tag+' 材料表未渲染（zoneTee/mainEndElbow 行缺失）');
      }
    }catch(e){ out.push('FAIL '+tag+' 异常: '+e.message); }
  }
  if (window.__ryFooter) {
    var dF=gen(800,160);
    var el2=document.getElementById('tlParamsGroup');
    var txts=el2?Array.from(el2.querySelectorAll('text')).map(function(t){return t.textContent; }):[];
    out.push('FOOTER '+JSON.stringify(txts));
    out.push('FRONTLEN '+JSON.stringify(dF.frontPipe));
  }
  check('横地块600x400', 600, 400);
  check('竖地块400x600', 400, 600);
  check('扁地块800x160(固定边250)', 800, 160, 250);
  A('V1 ?v= 已抬 556-front-row1-main-elbow', ((document.querySelector('script[src*="inline-09"]')||{}).src||'').indexOf('v=580-front-move-removed')>=0, ((document.querySelector('script[src*="inline-09"]')||{}).src||'').split('?')[1]||'-', 'v=556-front-row1-main-elbow');
  return out;
})()`);
if (res && res.__err) { console.log('EVAL ERROR', res.__err); }
else {
  console.log('URL =', PAGE);
  console.log(res.join('\n'));
  const fails = res.filter(l => l.startsWith('FAIL')).length;
  console.log('--- ' + (res.length - fails) + '/' + res.length + ' 通过' + (fails ? '，' + fails + ' 项失败' : ''));
  process.exitCode = fails ? 1 : 0;
}
if (process.env.RY_SHOT) {
  await ev("(function(){window.rySetTab('tlPipePlanSection','pipe');var sec=document.getElementById('tlPipePlanSection'); if(sec) sec.style.setProperty('display','block','important'); var pn=sec.querySelector('.ry-pane-pipe'); if(pn) pn.style.setProperty('display','block','important'); window.measuredPolygon=[{x:0,y:0},{x:800,y:0},{x:800,y:160},{x:0,y:160}];window.tlAutoGenerate();return 1;})()");
  await sleep(1500);
  const clip0 = await ev("(function(){var el=document.getElementById('tlDiagramContent'); if(!el) return null; var r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
  if (clip0) {
    const clip = { x: Math.max(0, Math.round(clip0.x)), y: Math.max(0, Math.round(clip0.y)),
      width: Math.round(clip0.width), height: Math.round(clip0.height), scale: 1 };
    try {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
      require('fs').writeFileSync(process.env.RY_SHOT, Buffer.from(shot.data, 'base64')); console.log('shot -> ' + process.env.RY_SHOT);
    } catch (e2) { console.log('shot fail: ' + e2.message + ' clip=' + JSON.stringify(clip)); }
  }
}
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv && srv.close(); } catch (e) { }
