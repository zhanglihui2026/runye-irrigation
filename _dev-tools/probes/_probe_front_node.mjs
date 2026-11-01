'use strict';
/* v557 总管断点（三通）沿主管下移 —— 几何/图面/材料/拖动断言
   口径（用户定论）：三通 = 总管折线的断点；沿主管向下拖 ⇒ ① 两侧总管段斜接（总管变折线、变长）
   ② 主管自三通起算，上方那段去掉（主管变短）；只能向下、吸附 1 m、拖动后记住。
   断言：
     B0 无偏移：frontPipe 点数 = 物理主管线数，且各顶点共线（= 原直线几何，不回归）
     N1 注入 off：该顶点沿主管下移 off（其余顶点不动）
     N2 总管折线长度 > 原直线长度（材料/水力取数会跟着涨）
     N3 对应主管起点 = base+off（截断生效），主管总长减少 = off
     N4 只影响被拖的那一根主管（其余主管长度不变）
     N5 图面三通方块随之下移（DOM rect y）
     N6 clamp：注入 99999 ⇒ 落到 max（末端上方 5 m / 阀门锚点上方 2 m）
     N7 拖动交互：合成 mousedown/mousemove/mouseup ⇒ off 变整数（吸附 1 m）且落 localStorage
     N8 复位（off=0）⇒ 回到直线几何
     V1 index.html 的 inline-09.js ?v= 已抬
   用法：node _probe_front_node.mjs ｜ RY_URL=<线上> 直连线上 ｜ RY_SHOT=<png> 截图 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const PORT = 16460 + Math.floor(Math.random() * 30);
const CDP = 15960 + Math.floor(Math.random() * 30);
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
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1', '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_fn_' + Date.now(), '--window-size=1400,900'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 120000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(PAGE)));
ws = new WS(t.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); } });
await send('Runtime.enable'); await send('Page.enable');
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); console.log('[dialog] ' + (o.params.message || '').slice(0, 80)); } });
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) }; return r.result.value; };
let ready = false;
for (let i = 0; i < 80; i++) {
  const r = await ev("!!window.RyPlanParams && !!document.getElementById('tlDiagramContent') && typeof window.tlAutoGenerate==='function' && typeof window.rySetTab==='function'");
  if (r === true) { ready = true; break; }
  await sleep(500);
}
if (!ready) { console.log('FAIL 就绪闸门超时'); process.exit(2); }

const res = await ev(`(function(){
  var out=[];
  function A(name,ok,got,want){ out.push((ok?'OK   ':'FAIL ')+name+' = '+got+(ok?'':'  (期望 '+want+')')); return ok; }
  function plen(pts){ var L=0; for(var i=0;i+1<pts.length;i++)L+=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y); return L; }
  function mlen(mp){ var L=0; for(var i=0;i<mp.length;i++)L+=plen(mp[i]); return L; }
  function gen(w,h){
    try{ window.rySetTab('tlPipePlanSection','pipe'); }catch(e){}
    window.measuredPolygon=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    /* 地块经 store 传导，首次生成读到的仍是上一块 ⇒ 连调两次，第二次才是本块的几何 */
    window.tlAutoGenerate();
    window.tlAutoGenerate();
    return window.tlDiagramData;
  }
  function svgEl(){ return document.querySelector('#tlDiagramContent svg'); }
  /* [v568] 只取真正的三通方块 rect[data-junction-tee]：三通/阀门各有一层透明命中圈也带
     data-junction-front，按旧选择器会把数量翻倍（2 个三通 → 6 个）⇒ 索引/计数全错位。 */
  function jEls(){ var s=svgEl(); return s?Array.from(s.querySelectorAll('rect[data-junction-tee][data-junction-front][data-junction-key]')):[]; }
  function vertOf(d){ var v=0,h=0; (d.mainPipes||[]).forEach(function(l){ var dx=Math.abs(l[0].x-l[l.length-1].x), dy=Math.abs(l[0].y-l[l.length-1].y); if(dy>dx)v++; else if(dx>dy)h++; }); return v>=h; }

  function run(tag,w,h,fixedSide){
    try{
      if(fixedSide){ var fe=document.getElementById('tl_zoneFixedSide'); if(fe) fe.value=String(fixedSide); }
      /* 清干净上次的断点偏移（换地块 sig 不同也会自动失效，这里显式清） */
      try{ localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
      var d0=gen(w,h);
      if(!d0||!d0.frontPipe){ out.push('FAIL '+tag+' tlDiagramData 未落地'); return; }
      var vert=vertOf(d0);
      var f0=d0.frontPipe, base=vert?f0[0].y:f0[0].x;
      A(tag+' B0a frontPipe 点数=物理主管线数', f0.length>=2, f0.length+'点', '>=2');
      var collinear=f0.every(function(p){ return vert?Math.abs(p.y-base)<1e-6:Math.abs(p.x-base)<1e-6; });
      A(tag+' B0b 无偏移时各顶点共线（=原直线几何）', collinear, JSON.stringify(f0.map(function(p){return +(vert?p.y:p.x).toFixed(2);})), 'base='+base.toFixed(2));
      var els=jEls();
      A(tag+' B0c 图面三通数≥1 且 ≤顶点数', els.length>=1&&els.length<=f0.length, els.length+' (顶点'+f0.length+')', '1..'+f0.length);
      if(!els.length){ out.push('SKIP '+tag+' 无可拖断点（可能 cols/rows<2 退回几何）'); return; }
      var L0=plen(f0), M0=mlen(d0.mainPipes||[]);

      /* ===== 注入偏移：取中间那个断点 ===== */
      var idx=Math.floor(els.length/2);
      var key=els[idx].getAttribute('data-junction-key'), sig=els[idx].getAttribute('data-junction-sig');
      var max=parseFloat(els[idx].getAttribute('data-junction-max'))||0;
      var maxa=parseFloat(els[idx].getAttribute('data-junction-maxa'))||0;
      var maxb=parseFloat(els[idx].getAttribute('data-junction-maxb'));
      var mps0=parseFloat(els[idx].getAttribute('data-junction-mps'))||0;
      out.push('INFO '+tag+' vert='+vert+' axis='+axis+' base='+base.toFixed(2)+' f0='+JSON.stringify(f0.map(function(p){return {x:+p.x.toFixed(1),y:+p.y.toFixed(1)};}))+' key='+key+' maxA='+maxa.toFixed(2)+' maxB='+maxb.toFixed(2)+' mps='+mps0.toFixed(4));
      A(tag+' B1a 断点带 key/sig/max', !!key&&!!sig&&max>0, key+' | '+sig+' | max='+max.toFixed(2), 'max>0');
      /* 断点定位：axis 决定「固定坐标」取 x 还是 y；断点序号 = 它在 sig 的 pos 列表里的序号 */
      var axis=els[idx].getAttribute('data-junction-axis')||'V';
      var posAttr=(axis==='V')?'x':'y';
      var vpos=parseFloat(String(sig).split('|')[1].split(',')[idx]);
      function coord(p){ return axis==='V'?p.y:p.x; }
      function findIdx(f){ var bi=0,bd=Infinity; for(var i=0;i<f.length;i++){ var dd=Math.abs(f[i][posAttr]-vpos); if(dd<bd){bd=dd;bi=i;} } return bi; }
      var off=Math.min(20, max*0.5);
      if(!(off>0.5)){ out.push('SKIP '+tag+' max 过小（'+max.toFixed(2)+'）无法注入'); return; }
      off=Math.round(off);
      window.tlFrontNodeDropSet(key,sig,off);
      var d1=gen(w,h);
      var f1=d1.frontPipe;
      out.push('INFO '+tag+' d0='+d0.zones.rows+'x'+d0.zones.cols+' d1='+d1.zones.rows+'x'+d1.zones.cols
        +' f1='+JSON.stringify(f1.map(function(p){return {x:+p.x.toFixed(1),y:+p.y.toFixed(1)};}))
        +' v0='+JSON.stringify((d0.valves||[]).slice(0,3).map(function(v){return {ax:v.ax==null?null:+v.ax.toFixed(1),ay:v.ay==null?null:+v.ay.toFixed(1),e:!!v.elbow};})));
      var fi=findIdx(f1);
      A(tag+' N1 断点顶点沿主管下移 off', Math.abs(coord(f1[fi])-(base+off))<1e-6, coord(f1[fi]).toFixed(2), (base+off).toFixed(2));
      var others=f1.filter(function(p,i){ return i!==fi; }).every(function(p){ return Math.abs(coord(p)-base)<1e-6; });
      A(tag+' N1b 其余顶点不动', others, JSON.stringify(f1.map(function(p){return +coord(p).toFixed(2);})), '仅断点动');
      var L1=plen(f1);
      A(tag+' N2 总管折线变长（材料/水力取数跟着涨）', L1>L0+0.01, L0.toFixed(2)+' → '+L1.toFixed(2)+' (+'+(L1-L0).toFixed(2)+')', '>'+L0.toFixed(2));
      /* 主管截断 */
      var segs=(d1.mainPipes||[]).filter(function(l){ return Math.abs((axis==='V'?l[0].x:l[0].y)-vpos)<1e-6 && Math.abs(coord(l[0])-(base+off))<1e-6; });
      var seg0=(d0.mainPipes||[]).filter(function(l){ return Math.abs((axis==='V'?l[0].x:l[0].y)-vpos)<1e-6; });
      var startAt=seg0.length?(axis==='V'?seg0[0][0].y:seg0[0][0].x):null;
      var M1=mlen(d1.mainPipes||[]);
      /* 退回几何（总管在地块外沿）时，off 小的断点还落在主管起点之外 ⇒ 只缩接入段，不截断主管 */
      var wantCut=(startAt!=null)&&((base+off)>startAt+0.01);
      if(wantCut){
        A(tag+' N3 该主管起点=三通处（截断生效）', segs.length>0, segs.length+'段起点='+(segs.length?coord(segs[0][0]).toFixed(2):'-'), (base+off).toFixed(2));
        A(tag+' N3b 主管总长减少=off', Math.abs((M0-M1)-off)<0.02, M0.toFixed(2)+' → '+M1.toFixed(2)+' (−'+(M0-M1).toFixed(2)+')', off.toFixed(2));
      }else{
        A(tag+' N3 三通仍在主管起点之外 ⇒ 不截断（只缩接入段）', segs.length===0, 'at='+(base+off).toFixed(2)+' 起点='+(startAt==null?'-':startAt.toFixed(2)), '不截断');
        A(tag+' N3b 主管总长不变', Math.abs(M0-M1)<0.02, M0.toFixed(2)+' → '+M1.toFixed(2), '不变');
      }
      /* 只影响这一根 */
      var same=true, cnt=0;
      for(var mi=0;mi<d0.mainPipes.length;mi++){
        var a=d0.mainPipes[mi], b=d1.mainPipes[mi];
        if(Math.abs((axis==='V'?a[0].x:a[0].y)-vpos)<1e-6) continue;
        if(Math.abs(plen(a)-plen(b))>1e-6){ same=false; cnt++; }
      }
      A(tag+' N4 其余主管长度不变', same, cnt+'根变了', '0根');
      /* 图面三通随之下移 */
      var els2=jEls();
      var ok5=false;
      if(els2.length===els.length){
        var y0=parseFloat(els[idx].getAttribute(vert?'y':'x')), y1=parseFloat(els2[idx].getAttribute(vert?'y':'x'));
        ok5=Math.abs((y1-y0))>0.5;
        A(tag+' N5 图面三通方块随之下移', ok5, y0.toFixed(1)+' → '+y1.toFixed(1), '有位移');
      }else{ A(tag+' N5 图面三通数不变', false, els2.length, els.length); }
      /* clamp */
      window.tlFrontNodeDropSet(key,sig,99999);
      var d2=gen(w,h);
      var got2=coord(d2.frontPipe[findIdx(d2.frontPipe)])-base;
      A(tag+' N6 clamp 到 max（末端上方5m/阀门上方2m）', Math.abs(got2-max)<0.02, got2.toFixed(2), max.toFixed(2));
      /* 复位 */
      window.tlFrontNodeDropSet(key,sig,0);
      var d3=gen(w,h);
      var back=d3.frontPipe.every(function(p){ return Math.abs(coord(p)-base)<1e-6; });
      A(tag+' N8 复位回直线', back, JSON.stringify(d3.frontPipe.map(function(p){return +coord(p).toFixed(2);})), 'base='+base.toFixed(2));
    }catch(e){ out.push('FAIL '+tag+' 异常: '+e.message+' @ '+String((e.stack||'').split(String.fromCharCode(10))[1]||'').trim()); }
  }

  /* ===== N7 真实拖动交互（合成事件）+ 吸附 ===== */
  function drag(){
    try{
      try{ localStorage.removeItem('tlFrontNodeDrops_v1'); }catch(e){}
      var d=gen(600,400);
      var vert=vertOf(d);
      var els=jEls();
      if(!els.length){ out.push('SKIP N7 无可拖断点'); return; }
      var el=els[Math.floor(els.length/2)];
      var max=parseFloat(el.getAttribute('data-junction-max'))||0;
      var mps=parseFloat(el.getAttribute('data-junction-mps'))||0;
      var r=el.getBoundingClientRect();
      var cx=r.left+r.width/2, cy=r.top+r.height/2;
      /* 屏幕像素→米：scale=getScale()（svgW/rect.width）再 ÷mps；这里反推：想让 off≈mid，
         位移像素 = mid*mps/scale；取 max 的 40%（保证落在可拖区间内） */
      var svg=svgEl(), srect=svg.getBoundingClientRect();
      var scale=srect.width>0?1190/srect.width:1;
      var wantOff=Math.max(1,Math.round(max*0.4));
      var dpx=(mps>0&&scale>0)?(wantOff*mps/scale):40;
      var ax=el.getAttribute('data-junction-axis')||'V';
      var mx=cx+(ax==='H'?dpx:0), my=cy+(ax==='V'?dpx:0);
      el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:cx,clientY:cy}));
      document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:mx,clientY:my}));
      var tf=el.getAttribute('transform');
      out.push('INFO N7 axis='+ax+' max='+max.toFixed(2)+' mps='+mps.toFixed(4)+' scale='+scale.toFixed(3)+' dpx='+dpx.toFixed(1)+' wantOff='+wantOff+' tf='+String(tf));
      document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:mx,clientY:my}));
      var st=null; try{ st=JSON.parse(localStorage.getItem('tlFrontNodeDrops_v1')||'null'); }catch(e){}
      var rec=st?Object.keys(st):[];
      var off=rec.length?st[rec[0]].off:null;
      A('N7a 拖动后落 localStorage（记住）', !!st&&rec.length>0, JSON.stringify(st), '非空');
      A('N7b 吸附 1 m（off 为整数）', off!=null&&Math.abs(off-Math.round(off))<1e-9, String(off), '整数');
      A('N7c off 落在 [1, max] 内', off!=null&&off>=1&&off<=max+1e-6, String(off)+' (max='+max.toFixed(2)+')', '1..'+max.toFixed(2));
      var d2=gen(600,400);
      var f=d2.frontPipe;
      var moved=!f.every(function(p){ return vert?Math.abs(p.y-f[0].y)<1e-6:Math.abs(p.x-f[0].x)<1e-6; });
      A('N7d 拖动后重生成 ⇒ 总管已是折线', moved, JSON.stringify(f.map(function(p){return +(vert?p.y:p.x).toFixed(2);})), '不全等');
    }catch(e){ out.push('FAIL N7 异常: '+e.message); }
  }

  run('横地块600x400', 600, 400);
  run('竖地块400x600', 400, 600);
  run('扁地块800x160(固定边250)', 800, 160, 250);
  drag();
  var src=((document.querySelector('script[src*="inline-09"]')||{}).src||'');
  A('V1 inline-09.js ?v= 含 592', src.indexOf('v=592')>=0, src.split('?')[1]||'-', 'v=592-*');
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
  await ev("(function(){window.rySetTab('tlPipePlanSection','pipe');var sec=document.getElementById('tlPipePlanSection'); if(sec) sec.style.setProperty('display','block','important'); var pn=sec&&sec.querySelector('.ry-pane-pipe'); if(pn) pn.style.setProperty('display','block','important'); return 1;})()");
  await sleep(1500);
  const clip0 = await ev("(function(){var el=document.getElementById('tlDiagramContent'); if(!el) return null; var r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
  if (clip0) {
    const clip = { x: Math.max(0, Math.round(clip0.x)), y: Math.max(0, Math.round(clip0.y)), width: Math.round(clip0.width), height: Math.round(clip0.height), scale: 1 };
    try {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
      fs.writeFileSync(process.env.RY_SHOT, Buffer.from(shot.data, 'base64')); console.log('shot -> ' + process.env.RY_SHOT);
    } catch (e2) { console.log('shot fail: ' + e2.message); }
  }
}
try { ws.close(); } catch (e) { }
try { child.kill(); } catch (e) { }
try { srv && srv.close(); } catch (e) { }
