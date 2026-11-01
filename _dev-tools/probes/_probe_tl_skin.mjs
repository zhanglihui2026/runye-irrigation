'use strict';
/* 三级左栏「水力计算结果」面板皮肤层级实机量测（v611 排查底色/边框多层叠加）。
   量：从 #tlPlanBar2 向上到 #tlSide 的每一层 bg / border / shadow / padding，
       以及结果行、结果栏自身，判断有哪几层在画底色和框。
   用法：node _probe_tl_skin.mjs   [SHOT=C:/tmp/xxx.png] */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http'); const fs = require('fs'); const path = require('path');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = process.env.RY_ROOT || 'C:/Users/AHS/runye-irrigation';
const VW = Number(process.env.VW || 1400), VH = Number(process.env.VH || 1400);
const PORT = 48280 + Math.floor(Math.random() * 40), CDP = 48580 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((req, r2) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const fp = path.join(ROOT, p.replace(/^\//, '')); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { r2.writeHead(404); r2.end('nf'); return; } r2.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(fp).pipe(r2); });
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
// 走代理真载入 Shoelace（与线上同观感）；无代理时退化为挡 CDN
const PROXY = process.env.RY_PROXY || 'http://127.0.0.1:7897';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
  '--proxy-server=' + PROXY, '--proxy-bypass-list=127.0.0.1;localhost',
  '--remote-debugging-port=' + CDP,
  '--user-data-dir=C:\\tmp\\cdp_tlskin_' + Date.now(), '--window-size=' + VW + ',' + VH], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 60000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent('http://127.0.0.1:' + PORT + '/index.html')));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; } if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
await send('Runtime.enable'); await send('Page.enable');
try { await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: false });
await send('Page.reload', { ignoreCache: true });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
for (let i = 0; i < 60; i++) { if (await ev('!!window.tlAutoGenerate') === true) break; await sleep(400); }
const HIDE = "(function(){document.querySelectorAll('.ry-ann-mask').forEach(function(e){e.style.setProperty('display','none','important');});return 1;})()";
await ev("(function(){try{window.RyAnnounce&&window.RyAnnounce.close&&window.RyAnnounce.close();}catch(e){}return 1;})()");
await ev("(function(){try{window.rySetTab('tlPipePlanSection','pipe');}catch(e){return 'err '+e.message;}return 1;})()");
await sleep(1800);
await ev(HIDE);
for (let i = 0; i < 25; i++) { const w = await ev("(function(){var s=document.getElementById('tlSide');return s?Math.round(s.getBoundingClientRect().width):0;})()"); if (w > 100) break; await sleep(300); }
/* GEN=1 时先跑一次「生成管线图」，让损失卡/扬程确认卡等未生成时隐藏的块现身 */
if (process.env.GEN === '1') {
  console.log('生成管线图:', await ev("(function(){ window.measuredPolygon=[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}]; window.measuredArea=2400; try{ window.tlAutoGenerate(); }catch(e){ return 'err '+e.message; } return 1; })()"));
  await sleep(2500);
  await ev(HIDE);
}
/* SIDEW=<px>：把三级侧栏（#ryCadSide）宽度钉成指定值，复现用户实机更窄的面板
   —— 用户截图里面板约 235px，默认 300px 下的「说明几行」结论不成立 */
if (process.env.SIDEW) {
  const w = Number(process.env.SIDEW);
  console.log('钉侧栏宽度:', w, await ev("(function(){var a=document.getElementById('ryCadSide');if(!a)return 'absent';a.style.setProperty('width','" + w + "px','important');var s=document.getElementById('tlSide');if(s)s.style.setProperty('width','auto','important');return 1;})()"));
  await sleep(400);
  await ev(HIDE);
}
/* SRCTXT=1：给「依据：分区 M13…」那行注入一条真实形态的文案（无头环境没有 worstGroup，否则只有兜底句），
   用来在用户面板宽度下看它折几行 */
if (process.env.SRCTXT === '1') {
  console.log('注入依据行:', await ev("(function(){var e=document.getElementById('tlPlanCombinedSrc');if(!e)return 'absent';e.style.display='';e.textContent='依据：分区 M13（25区、26区）*实际面积= 36.0 亩';return e.textContent;})()"));
  await sleep(200);
  await ev(HIDE);
}
/* 结果栏默认折叠（pp-res-off）⇒ 展开，否则看不到内容层 */
await ev("(function(){var b=document.getElementById('tlPlanBar2');if(b)b.classList.remove('pp-res-off');return 1;})()");
await sleep(300);
await ev(HIDE);
/* 侧栏偶发收起（sideW=0）⇒ 强制展开 CAD 侧栏并等宽度回来，否则整栏量到一片 0 */
for (let i = 0; i < 4; i++) {
  const w = await ev("(function(){var s=document.getElementById('tlSide');return s?Math.round(s.getBoundingClientRect().width):0;})()");
  if (w > 100) break;
  await ev("(function(){var c=document.getElementById('ryCadSide');if(c)c.setAttribute('data-ry-open','1');var g=document.getElementById('ryCadGrpTl');if(g)g.open=true;var b=document.getElementById('tlPlanBar2');if(b)b.classList.remove('pp-res-off');return 1;})()");
  await sleep(600);
  await ev(HIDE);
}

/* MODE=orig：把 #tlSide 手动搬回 #tlPipePlanSection > .pp-body，验证「原位态」另一套选择器是否同样扁平 */
if (process.env.MODE === 'orig') {
  console.log('搬回原位:', await ev("(function(){var side=document.getElementById('tlSide');var body=document.querySelector('#tlPipePlanSection > .pp-body');if(!side||!body)return 'missing';body.insertBefore(side, body.firstChild);return 1;})()"));
  await sleep(500);
  await ev(HIDE);
  await ev("(function(){var b=document.getElementById('tlPlanBar2');if(b)b.classList.remove('pp-res-off');return 1;})()");
  await sleep(300);
}
const D = `JSON.stringify((function(){
  var pick=function(el){
    if(!el) return null;
    var c=getComputedStyle(el), r=el.getBoundingClientRect();
    return { tag:el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\\s+/).join('.'):''),
      w:+r.width.toFixed(1), h:+r.height.toFixed(1), x:+r.x.toFixed(1),
      bg:c.backgroundColor, bgImg:c.backgroundImage, border:c.borderTopWidth+'/'+c.borderRightWidth+'/'+c.borderBottomWidth+'/'+c.borderLeftWidth,
      bc:c.borderTopColor, radius:c.borderRadius, shadow:c.boxShadow==='none'?'none':c.boxShadow,
      pad:c.padding, margin:c.margin, pos:c.position };
  };
  var out={ sideW:(function(){var s=document.getElementById('tlSide');return s?Math.round(s.getBoundingClientRect().width):-1;})(), chain:[] };
  var bar=document.getElementById('tlPlanBar2');
  if(!bar) return {err:'no #tlPlanBar2'};
  /* 从结果栏自身往上爬到 #tlPipePlanSection，逐层记录「谁在画底色/框」 */
  var el=bar, depth=0;
  while(el && el!==document.documentElement && depth<12){
    var p=pick(el);
    if(p.bg!=='rgba(0, 0, 0, 0)' || p.border!=='0px/0px/0px/0px' || p.shadow!=='none' || p.bgImg!=='none') out.chain.push(p);
    el=el.parentElement; depth++;
  }
  /* 结果栏内部的子层（表头行 / 数据行 / 分隔竖线） */
  var rows=[].slice.call(bar.querySelectorAll('.pp-plan-item')).filter(function(x){return getComputedStyle(x).display!=='none';});
  out.rows=rows.slice(0,4).map(function(r){
    var c=getComputedStyle(r), rr=r.getBoundingClientRect();
    return { txt:(r.textContent||'').trim().replace(/\\s+/g,'').slice(0,12), h:+rr.height.toFixed(1),
      bg:c.backgroundColor, bd:c.borderTopWidth+'/'+c.borderBottomWidth, bc:c.borderBottomColor,
      pad:c.padding, margin:c.margin };
  });
  out.rowCount=rows.length;
  /* [v612] 三块拍平后的 computed 圆角：inline 写着 8px，靠 body *{border-radius:0!important} 压成 0 */
  out.flatRadius=['ppHeadBreak','tlPumpUpdateBox','tlLossCard'].map(function(id){
    var e=document.getElementById(id); if(!e) return id+':absent';
    var c=getComputedStyle(e);
    return id+':'+c.borderTopLeftRadius+'/'+c.backgroundColor+'/'+c.borderTopWidth+'/'+c.boxShadow.slice(0,12);
  });
  /* [v611b] 轮灌演示块：#tlDemoBar 不是 .pp-plan-item（没有行的 0 10 内边距），
     故文字与「联合灌溉」等标签左缘不对齐；它底部直接顶着 #tlPlanBar2 的灰条，没有间距。 */
  out.demo=(function(){
    var d=document.getElementById('tlDemoBar'); if(!d) return null;
    var r=d.getBoundingClientRect(), c=getComputedStyle(d);
    var sp=d.querySelector('span');
    var chips=document.getElementById('tlDemoChips');
    var btn=chips?chips.querySelector('button'):null;
    var b2=document.getElementById('tlPlanBar2').getBoundingClientRect();
    var lbl=document.querySelector('#tlPlanBar .pp-plan-label');
    var bq=btn?btn.getBoundingClientRect():null;
    return { barX:+r.x.toFixed(1), barPad:c.padding, barMargin:c.margin, barH:+r.height.toFixed(1),
      titleX:sp?+sp.getBoundingClientRect().x.toFixed(1):null,
      rowLabelX:lbl?+lbl.getBoundingClientRect().x.toFixed(1):null,
      chipsW:chips?+chips.getBoundingClientRect().width.toFixed(1):null,
      chipW:bq?+bq.width.toFixed(1):null, chipH:bq?+bq.height.toFixed(1):null,
      gapToResultBar:+(b2.y-r.bottom).toFixed(1) };
  })();
  /* 全部可见行的高度分布 + 偏离 22px 的行（输入框 24px 可能把行撑高） */
  var allRows=[].slice.call(document.querySelectorAll('#tlSide .pp-plan-item')).filter(function(x){return getComputedStyle(x).display!=='none' && x.getBoundingClientRect().height>0;});
  out.allRowHeights=allRows.map(function(r){return +r.getBoundingClientRect().height.toFixed(1);});
  out.notH22=allRows.filter(function(r){return Math.abs(r.getBoundingClientRect().height-22)>1;}).map(function(r){
    var c=getComputedStyle(r);
    return (r.textContent||'').trim().replace(/\s+/g,'').slice(0,10)+'='+r.getBoundingClientRect().height.toFixed(0)+'px/pad'+c.padding;
  });
  /* 两栏参数条（上面那个 #tlPlanBar）也一起量，便于对比两栏皮肤是否一致 */
  out.bar1=pick(document.getElementById('tlPlanBar'));
  out.bar2=pick(bar);
  var bc=getComputedStyle(bar,'::before');
  out.bar2Before={content:bc.content, display:bc.display, bg:bc.backgroundColor, bt:bc.borderTopWidth, bb:bc.borderBottomWidth, bbC:bc.borderBottomColor, h:bc.height, pad:bc.padding, margin:bc.margin};
  return out;
})())`;
const RES = await ev(D);
console.log(typeof RES === 'string' ? RES : JSON.stringify(RES, null, 2));

/* DELTA=1：跑一次「更新水泵扬程」，让 #tlPumpUpdateDelta 的四行结果现身（验证 .tl-flat-line） */
if (process.env.DELTA === '1') {
  console.log('更新扬程:', await ev("(function(){ try{ window.tlPumpUpdateRun(); }catch(e){ return 'err '+e.message; } var d=document.getElementById('tlPumpUpdateDelta'); return d? d.children.length+' 行 / 首行cls='+d.children[0].className+' / 首行text='+(d.children[0].innerText||'').replace(/\\s+/g,' ') : 'no delta'; })()"));
  await sleep(600);
  await ev(HIDE);
}
/* HB=1：展开「水泵扬程」折叠块 #ppHeadBreak，逐个量 summary 与明细行的 color/bg ——
   验证「.pp-head-break 的浅色字（#e8eef7）落在被我拍成透明的白底上 ⇒ 看不见」这条假设。 */
if (process.env.HB === '1') {
  console.log('展开扬程块:', await ev("(function(){var e=document.getElementById('ppHeadBreak');if(!e)return 'absent';e.hidden=false;e.open=true;return '子节点 '+e.children.length+' 个';})()"));
  await sleep(500);
  await ev(HIDE);
  console.log(await ev(`JSON.stringify((function(){
    var e=document.getElementById('ppHeadBreak'); if(!e) return {err:'absent'};
    var g=function(el){ if(!el) return null;
      var c=getComputedStyle(el),r=el.getBoundingClientRect();
      return {t:(el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,24),h:+r.height.toFixed(1),
        color:c.color,bg:c.backgroundColor,fs:c.fontSize,fw:c.fontWeight,
        ff:c.fontFamily.slice(0,26),disp:c.display,pad:c.padding};};
    var out={container:g(e), summary:g(e.querySelector('summary')), rows:[]};
    [].slice.call(e.children).forEach(function(ch){ if(ch.tagName!=='SUMMARY') out.rows.push(g(ch)); });
    if(!out.rows.length){ var r0=e.querySelector('.pphb-row'); if(r0) out.row0=g(r0); }
    return out;
  })())`, null, 2));
}
/* PUMP=1：量「管径调整」块（说明 + 按钮同一行）—— 行高、按钮宽高、说明换行数、左右内边距 */
if (process.env.PUMP === '1') {
  console.log(await ev(`JSON.stringify((function(){
    var row=document.getElementById('tlPumpUpdateRow');
    var note=document.getElementById('tlPumpUpdateNote');
    var btn=document.getElementById('tlPumpUpdateBtn');
    var box=document.getElementById('tlPumpUpdateBox');
    if(!row) return {err:'no row（旧结构）'};
    var g=function(el){var c=getComputedStyle(el),r=el.getBoundingClientRect();
      return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),
        right:+r.right.toFixed(1),color:c.color,bg:c.backgroundColor,bd:c.borderTopWidth+'/'+c.borderTopColor,
        fs:c.fontSize,fw:c.fontWeight,pad:c.padding,disp:c.display,lh:c.lineHeight};};
    var rn=g(row), nn=g(note), bb=g(btn), bx=g(box);
    return {box:bx, row:rn, note:nn, btn:bb,
      noteLines: nn.h>0 ? Math.round(nn.h/ (parseFloat(nn.lh)||14)) : 0,
      padLeftDiffNote: +(nn.x-rn.x).toFixed(1),
      padRightDiffBtn: +(rn.right-bb.right).toFixed(1),
      sameRow: Math.abs((nn.y+nn.h/2)-(bb.y+bb.h/2))<1.5,
      btnIsFullWidth: bb.w > rn.w*0.8,
      rowHeightVs22: +(rn.h-22).toFixed(1)};
  })())`, null, 2));
}
/* PUMPON=1：把「更新水泵扬程」按钮置为可用态（JS 在未改管径时会 disabled + inline opacity:.5），
   截图用，确认可用态与禁用态两副样子都读得出来 */
if (process.env.PUMPON === '1') {
  console.log('按钮置可用:', await ev("(function(){var b=document.getElementById('tlPumpUpdateBtn');if(!b)return 'absent';b.disabled=false;b.style.opacity='1';return b.textContent+' / disabled='+b.disabled;})()"));
  await sleep(200);
  await ev(HIDE);
}
/* HOVER=1：真派发一次鼠标移动到按钮中心，量 hover / active 的 computed 样式
   —— 「hover 只改底色」这类断言只有真触发:hover 才验证得到，getComputedStyle 不支持伪类 */
if (process.env.HOVER === '1') {
  const box = await ev("(function(){var b=document.getElementById('tlPumpUpdateBtn');if(!b)return null;b.disabled=false;b.style.opacity='1';var r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width)};})()");
  const readBtn = "JSON.stringify((function(){var b=document.getElementById('tlPumpUpdateBtn');var c=getComputedStyle(b);return {txt:b.textContent,w:+b.getBoundingClientRect().width.toFixed(1),bg:c.backgroundColor,color:c.color,bd:c.borderTopColor,op:c.opacity,shadow:c.boxShadow,transform:c.transform,deco:c.textDecorationLine};})())";
  console.log('hover 前:', await ev(readBtn));
  if (box) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', clickCount: 0, pointerType: 'mouse' });
    await sleep(400);
    console.log('hover 中:', await ev(readBtn));
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, pointerType: 'mouse' });
    await sleep(250);
    console.log('active 中:', await ev(readBtn));
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, pointerType: 'mouse' });
    await sleep(400);
    console.log('离开后:', await ev(readBtn));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', clickCount: 0, pointerType: 'mouse' });
  }
  await ev(HIDE);
}
/* DEMO18=1：把轮灌 chips 复制成 18 个（近似用户实际的多分组场景），看换行与左缘对齐 */
if (process.env.DEMO18 === '1') {
  /* 走真实渲染路径（tlManualGroups 18 组 → tlRenderDemoChips），chips 才有各自的原生配色；
     早期用 cloneNode 复制第一个按钮，结果 18 个全红，截图会误导成"颜色被我改坏了"。 */
  console.log('铺 18 个 chips:', await ev("(function(){window.tlManualGroups=[];for(var i=0;i<18;i++)window.tlManualGroups.push([1]);if(window.tlRenderDemoChips)window.tlRenderDemoChips();var c=document.getElementById('tlDemoChips');return c?c.querySelectorAll('button').length:-1;})()"));
  await sleep(300);
  await ev(HIDE);
}
/* CLICK=1：真实鼠标点灰条标题（禁用派发事件 —— 必须走命中判定），确认折叠开关仍可用 */
if (process.env.CLICK === '1') {
  const probe = async () => await ev("(function(){var b=document.getElementById('tlPlanBar2');var rows=[].slice.call(b.querySelectorAll('.pp-plan-item')).filter(function(x){return getComputedStyle(x).display!=='none';});return {cls:b.className.indexOf('pp-res-off')>=0?'off':'on', visibleRows:rows.length};})()");
  console.log('点击前:', JSON.stringify(await probe()));
  const pt = await ev("(function(){var b=document.getElementById('tlPlanBar2');var r=b.getBoundingClientRect();return {x:Math.round(r.x+40),y:Math.round(r.y+11)};})()");
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(500);
  console.log('点击后(命中点 ' + JSON.stringify(pt) + '):', JSON.stringify(await probe()));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(500);
  console.log('再点一次:', JSON.stringify(await probe()));
}
if (process.env.SHOT) {
  /* 整页截 + 记录 #tlSide 的文档坐标，外部按坐标裁 —— clip 在本站常算出 0 宽 */
  await ev(HIDE);
  const box = await ev("(function(){var s=document.getElementById('tlSide');var r=s.getBoundingClientRect();return {x:Math.floor(r.x+window.scrollX),y:Math.floor(r.y+window.scrollY),width:Math.ceil(r.width),height:Math.ceil(r.height),scale:2,dpr:devicePixelRatio};})()");
  const sh = await send('Page.captureScreenshot', { format: 'png' });   /* 视口截图：fixed 侧栏只在视口坐标系里画 */
  const raw = process.env.SHOT.replace(/\.png$/, '_full.png');
  fs.writeFileSync(raw, Buffer.from(sh.data, 'base64'));
  fs.writeFileSync(process.env.SHOT.replace(/\.png$/, '_box.json'), JSON.stringify(box));
  console.log('整页截图:', raw, '侧栏文档坐标:', JSON.stringify(box));
}
child.kill(); srv.close(); process.exit(0);
