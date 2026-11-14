#!/usr/bin/env node
/* v1079-zone-line-align 回归锁：主管/支管同列/同行一次定线。
 *
 * 用户拍板「主管支管现在是每个分区都重新定位一遍，这个没有必要……要保证竖向/横向
 * 一条管道是在一根线上的才行」，并选**方案A：物理层对齐**。
 *
 * 现状根因：逐分区用自己的形心做主管/支管中心线（异形斜边把形心逐区拉偏 1~2m）
 * ⇒ 同列主管/同行支管物理就不共线；显示偏移（ppGetPipeDisplayGeometry）再逐线
 * 独立收紧，错位放大。修复（两级同口径）：
 *   ① 二级 ppBuildAutoPipes（plot-editor.js）：预扫全部取有效布管中心，按列（竖管）
 *      /行（横管）取统一中心线（中位数，抗形心漂移），全列/全行共用；本分区统一线
 *      裁剪后过短（<50% 净长）才回退本分区形心线。阀门仍锚分区中心。
 *   ② 三级兜底自布管（inline-09.js tlAutoGenerate else 分支）：同口径——
 *      tlColLineX/tlRowLineY 中位统一定线 + tlClipPipeSeg 过短回退本格形心。
 * 水力口径：竖线横向平移、横线纵向平移不改线长；主管=支管克隆口径不变；
 * 节点按 pid+桩号重投影自动落新线（v1069 resyncGeometry）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function ok(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else console.log('ok: ' + msg);
}

const pe = read('mod/plot-editor.js');
const i09 = read('mod/inline-09.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：二级 ppBuildAutoPipes —— 统一定线 */
ok(pe.includes('function zoneCenterOf(zr, zc) {'),
  '[v1079] ppBuildAutoPipes 提取 zoneCenterOf（预扫与主循环共用形心逻辑）');
ok(pe.includes('var zoneCentersPre = [];'),
  '[v1079] 预扫全部分区收集有效布管中心');
ok(pe.includes('colLineX[c] = medianOf(vals);') && pe.includes('rowLineY[r] = medianOf(vals);'),
  '[v1079] 按列/行取统一中心线（中位数，抗形心漂移）');
ok(pe.includes('var branchX = (colLineX[zc] != null) ? colLineX[zc] : centerX;'),
  '[v1079] 竖管走本列统一中心线');
ok(pe.includes('var branchY = (rowLineY[zr] != null) ? rowLineY[zr] : centerY;'),
  '[v1079] 横管走本行统一中心线');

/* 锁2：二级回退兜底（统一线出界/过短才回退本分区形心） */
ok(pe.includes('if (vAlignLen < zoneH * 0.5) {'),
  '[v1079] 竖管统一线净长 <50% 分区高触发回退');
ok(pe.includes('out.branch.length = branchStart;'),
  '[v1079] 回退前清掉统一线残段');
ok(pe.includes('pushSeg(out.branch, { x: centerX, y: zy }, { x: centerX, y: zy + zoneH });'),
  '[v1079] 竖管回退本分区形心线');
ok(pe.includes('pushSeg(out.branch, { x: zx, y: centerY }, { x: zx + zoneW, y: centerY });'),
  '[v1079] 横管回退本分区形心线');

/* 锁3：阀门仍锚分区中心（不随统一线移动） */
ok(pe.includes('out.valves.push({ x: centerX, y: centerY })'),
  '[v1079] 阀门仍锚本分区有效中心');

/* 锁4：三级兜底自布管同口径 */
ok(i09.includes('tlCentersPre.push({r:zrP,c:zcP,p:tlActualCellCenter(xPos[zcP],yPos[zrP],xSrc[zcP],ySrc[zrP])});'),
  '[v1079] 三级兜底预扫全部格子布管中心');
ok(i09.includes('var effLineX=(tlColLineX[zc3]!=null)?tlColLineX[zc3]:centerX;'),
  '[v1079] 三级竖管走本列统一中心线');
ok(i09.includes('var effLineY=(tlRowLineY[zr2]!=null)?tlRowLineY[zr2]:centerY;'),
  '[v1079] 三级横管走本行统一中心线');
ok(i09.includes('if(tlSegB&&tlPolyLen(tlSegB)<zoneH2*0.5)tlSegB=null;'),
  '[v1079] 三级竖管统一线过短触发回退');
ok(i09.includes('if(!tlSegB)tlSegB=tlClipPipeSeg({x:centerX,y:zy2},{x:centerX,y:zy2+zoneH2});'),
  '[v1079] 三级竖管回退本格形心线');
ok(i09.includes('if(!tlSegB2)tlSegB2=tlClipPipeSeg({x:zx2,y:centerY},{x:zx2+zoneW2,y:centerY});'),
  '[v1079] 三级横管回退本格形心线');

/* 锁5：版本纪律（动态读 sw VERSION，勿写死版本号） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1079] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1079] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1079] 有断言失败' : '\n[v1079] 全部通过');
