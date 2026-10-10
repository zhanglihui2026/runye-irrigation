const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const html = require('../expand_index.cjs')(path.join(__dirname, '..', 'index.html'));
function extract(s, name) {
  const start = s.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' 缺失');
  const begin = s.indexOf('{', start);
  let depth = 1, i = begin + 1;
  while (depth && i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i++; i < s.length; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === quote) { i++; break; }
      }
    } else if (s.slice(i, i+2) === '/*') i = s.indexOf('*/', i+2) + 2;
    else if (s.slice(i, i+2) === '//') i = s.indexOf('\n', i+2) + 1;
    else { if (c === '{') depth++; if (c === '}') depth--; i++; }
  }
  assert.equal(depth, 0, name + ' 函数提取失败');
  return s.slice(start, i);
}
let checks = 0;
function check(fn) { fn(); checks++; }
const state = { zoneRotated: false, cutSnap: null };
const ctx = { MU_TO_SQM: 2000/3, window: {}, ppState: state, ppOwnDimOverride: true,
  document: { getElementById: id => ({ value: id === 'planTapeLaySide' ? '100' : id === 'planZoneMode' ? 'manual' : '90' }) },
  ppZoneAutoOn: () => true };
vm.createContext(ctx);
const names = ['planZoneFixedSide','calcZoneLayout','splitZoneLength','calcManualZoneLayout','getManualPlanZoneMu',
  'calcPlanZoneLayout','ppGetPlanDims','ppGetZoneLayout','ppSplitLength','ppCutSig','ppResetCutSnap','ppApplyCutSnap',
  'ppGetZoneCuts','ppPolyArea','ppClipPolyToRect'];
vm.runInContext(names.map(n => extract(html,n)).join('\n'), ctx);
for (const [w,h] of [[600,300],[300,600],[655,327],[300,300]]) {
  for (const mu of [18,45,90]) for (const rotated of [false,true]) {
    ctx.getManualPlanZoneMu = () => mu;
    state.zoneRotated = rotated; state.cutSnap = null;
    const b = { minX:0,minY:0,w,h };
    const layout = ctx.ppGetZoneLayout(b, 9), cuts = ctx.ppGetZoneCuts(b,layout);
    check(() => assert.equal(layout.N, cuts.zoneCount, `${w}×${h} / ${mu}亩 / 旋转=${rotated}`));
    check(() => assert.ok(Math.abs(cuts.xPlan.reduce((a,b)=>a+b,0)*cuts.yPlan.reduce((a,b)=>a+b,0)-w*h)<1e-6));
    if (!rotated) check(() => assert.equal(layout.N,ctx.calcManualZoneLayout(w,h,mu).N));
  }
  ctx.getManualPlanZoneMu = () => 0;
  state.zoneRotated = false; state.cutSnap = null;
  const b = {minX:0,minY:0,w,h};
  const layout = ctx.ppGetZoneLayout(b,9), cuts = ctx.ppGetZoneCuts(b,layout);
  check(() => assert.equal(cuts.zoneCount,ctx.calcZoneLayout(w,h,9).N));
  // 非矩形地块裁剪面积守恒。
  const poly = [{x:0,y:0},{x:w,y:0},{x:0,y:h}];
  let area = 0;
  for(let x=0;x<cuts.cols;x++) for(let y=0;y<cuts.rows;y++)
    area += ctx.ppPolyArea(ctx.ppClipPolyToRect(poly,cuts.xPos[x],cuts.yPos[y],cuts.xPos[x+1],cuts.yPos[y+1]));
  check(() => assert.ok(Math.abs(area-w*h/2)<1e-6));
}
ctx.getManualPlanZoneMu = () => 90; state.zoneRotated=false; state.cutSnap=null;
const box = {minX:0,minY:0,w:600,h:300};
let cuts = ctx.ppGetZoneCuts(box,ctx.ppGetZoneLayout(box,9));
check(() => assert.equal(cuts.zoneCount,4));
state.cutSnap.x=[250];
cuts=ctx.ppGetZoneCuts(box,ctx.ppGetZoneLayout(box,9));
check(() => assert.equal(cuts.xPos[1],250,'手动割缝应保留'));
ctx.ppZoneAutoOn=()=>false; state.cutSnap=null;
cuts=ctx.ppGetZoneCuts(box,ctx.ppGetZoneLayout(box,9));
check(() => assert.equal(cuts.zoneCount,1,'关闭自动分区应整块一区'));

const query = fs.readFileSync(path.join(root,'耐特菲姆滴灌带长度查询器.html'),'utf8');
const nodes = {};
const qctx = { document:{ getElementById:id => nodes[id] || (nodes[id]={ style:{} }) } };
vm.createContext(qctx);
vm.runInContext(query.slice(query.indexOf('function M('),query.indexOf('const ORDER')) +
  '\nglobalThis.PRODUCTS=PRODUCTS; var cur={prod:"pc16010",spacing:0.2,flow:1.6,pIdx:0,sIdx:0};\n' +
  query.slice(query.indexOf('const slopeLabel'),query.indexOf('function getProduct')) +
  ['getProduct','pressureValid','curMatrix','curVal','renderResult'].map(n=>extract(query,n)).join('\n'),qctx);
check(()=>assert.equal(qctx.curVal(),68,'16010，1bar/0.2m/1.6Lh 应为厂家表68m'));
check(()=>assert.equal(qctx.PRODUCTS.pc16010.pressures[1],1.5));
qctx.cur.prod='pc16250';
check(()=>assert.equal(qctx.curVal(),87,'16250对应条件应为87m'));
qctx.cur.flow=0.6; qctx.cur.spacing=0.4;
check(()=>assert.equal(qctx.curVal(),284,'补齐厂家已有的0.4m/0.6Lh组合'));
qctx.cur.prod='pc23009_2';qctx.cur.spacing=1;qctx.cur.flow=2;qctx.cur.pIdx=0;
check(()=>assert.equal(qctx.curVal(),null));
qctx.renderResult();
check(()=>assert.match(nodes.rMeta.innerHTML,/不在.*有效工作压力/));
check(()=>assert.equal(nodes.rLen.textContent,'—'));
qctx.cur.pIdx=6;qctx.cur.sIdx=2;
qctx.renderResult();
check(()=>assert.match(nodes.rMeta.innerHTML,/无有效长度数据/));
check(()=>assert.ok(!nodes.rMeta.innerHTML.includes('超过 800')));
qctx.cur.prod='pc16250';qctx.cur.spacing=0.3;qctx.cur.flow=1.6;qctx.cur.pIdx=0;qctx.cur.sIdx=0;
qctx.renderResult();
check(()=>assert.match(nodes.rMeta.innerHTML,/技术表/));
for (const product of ['pc16010','pc16250']) {
  const p=qctx.PRODUCTS[product];
  for(const spacing of p.spacings) for(const flow of p.flows) {
    const table=p.data[spacing.toFixed(1)][flow.toFixed(1)];
    check(()=>assert.equal(table.length,p.pressures.length));
    check(()=>assert.ok(table.every(row=>row.length===p.slopes.length&&row.every(Number.isFinite))));
  }
}
for (const file of ['index.html','二级系统图.html','三级系统图.html','耐特菲姆滴灌带长度查询器.html']) {
  const source=require('../expand_index.cjs')(path.join(root,file));  /* [v357] index.html 拆分后拼回虚拟单文件视图（对其他文件无 mod 外链=原样） */
  let inline=0;
  for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(/\bsrc\s*=/.test(m[1])||/type\s*=\s*["'](?:application\/json|module)/i.test(m[1]))continue;
    check(()=>new vm.Script(m[2],{filename:file+'#'+(++inline)}));
  }
  if(file!=='耐特菲姆滴灌带长度查询器.html') {
    check(()=>assert.ok(source.includes('4Q/(3600πv)')));
    check(()=>assert.ok(!source.includes('供水主管 DN')));
  }
}
console.log(JSON.stringify({ checks, failed:0, source:root }));
