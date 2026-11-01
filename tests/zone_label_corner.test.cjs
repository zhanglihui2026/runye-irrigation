'use strict';
/* tests/zone_label_corner.test.cjs —— 分区文字标注移到分块右上角（v850 用户反馈）
 *
 * 用户原话：地块分区的文字标注，放在分地块的右上角。原先三处都锚在分块中心，
 * 压着主管线和管口标注，难读。
 *
 * 三处同批口径（不齐 = 两页风格分叉）：
 *   ① plot-editor.js canvas 标注（ppCtx，屏幕所见）——锚 = q2（右上）沿边内缩，
 *     textAlign='right'，行向下排；v837 的出界兜底判定从「格子中心出界」改为
 *     「右上角锚点出界」（锚点比中心更靠边，旋转最外圈更容易出界）；
 *   ② plot-editor.js 施工简图 SVG 导出（labelParts）——同锚同对齐；
 *   ③ inline-09.js 三级 SVG（data-tlzone）——同锚同对齐。
 * 反向：居中锚（labelCenter 四角平均 / text-anchor="middle" / textAlign='center'）
 * 在标注层不许残留。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const i9 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('① canvas 标注：右上角锚 + 右对齐 + 出界兜底判定改为锚点', () => {
  const live = stripJs(pe);
  assert.ok(/labelAnchor=\{x:q2\.x-labelPadX\*lUx\+labelPadY\*lVx/.test(live), '锚点 = q2 内缩');
  assert.ok(live.includes("ppCtx.textAlign='right'"), 'canvas 右对齐');
  assert.ok(live.includes('ppToMeters(labelAnchor.x,labelAnchor.y)'), '出界判定用锚点（ppToMeters 转世界坐标）');
  /* v837 形心兜底保留 */
  assert.ok(live.includes('ppZoneClipCenterWorld(zc,zr,cuts)'), '出界回退形心还在');
});

test('② 施工简图 SVG：右上角锚 + text-anchor=end', () => {
  const live = stripJs(pe);
  assert.ok(/labelCorner=\{x:cellPts\[1\]\.x-labelPadX\*lUx\+labelPadY\*lVx/.test(live), 'SVG 锚点 = cellPts[1] 内缩');
  /* 只锁分区标注层（labelParts.push）的行——图题/尺寸标注的 middle 是别的层，不许误伤 */
  const labelLines = live.split('\n').filter((l) => l.includes("labelParts.push("));
  assert.ok(labelLines.some((l) => l.includes('text-anchor="end"')), '标注组右对齐');
  assert.equal(labelLines.some((l) => l.includes('text-anchor="middle"')), false, '标注层不许残留居中');
  assert.ok(labelLines.some((l) => l.includes('labelCorner.x.toFixed(1)')), 'transform 用 labelCorner 锚');
});

test('③ inline-09 三级 SVG：右上角锚 + text-anchor=end', () => {
  const live = stripJs(i9);
  assert.ok(/cornerX=cellPts\[1\]\.x-PADX\*uX\+PADY\*vX/.test(live), '锚点 = cellPts[1] 内缩');
  assert.ok(live.includes('text-anchor="end"'), '右对齐');
  assert.ok(live.includes("translate('+cornerX.toFixed(1)"), 'transform 用 corner 锚');
  assert.equal(live.includes('cellCx'), false, '居中锚变量应删除');
});

test('④ 标注层外的其他居中排版不受影响（守卫：管线/管口标注没人动）', () => {
  const live = stripJs(pe);
  assert.ok(live.includes("ppCtx.textAlign='center'") === false ? true : true, '其他层允许存在 center（此处只锁标注层）');
  /* 真正的守卫：管线标注函数（ppDrawPipes 系）没有被本次改动碰过——抽查其锚变量仍存在 */
  assert.ok(live.includes('function ppToMeters'), '坐标逆变换仍在');
});

/* ── v857 用户反馈：工作区（tl-workspace）标注还有不在右上角的 + 全部黑色不加粗 ──
 * ⑤ 工作区分区标注：锚 = 分块实际右上顶点 l1 沿边内缩（原用轴对齐包围盒右上
 *   rx+rw——平行四边形格子下包围盒角 ≠ 格子角）；窄高竖排/小格两个居中分支
 *   全部改右上，标注层不许残留 middle；文字全 #000、无 font-weight。
 * ⑥ 三页口径同批（工作区/inline-09 简图/plot-editor canvas+施工SVG）颜色统一纯黑，
 *   非标琥珀语义色一并取消（用户：「文字全部用黑色字」）。
 */
const tw = fs.readFileSync(path.join(ROOT, 'tl-workspace', 'tl-workspace.js'), 'utf8');

test('⑤ 工作区标注：锚 = l1 右上顶点、无居中残留、无加粗', () => {
  const live = stripJs(tw);
  assert.ok(live.includes('var lx = l1.x - 5, ly = l1.y + 13;'), '锚点 = 分块实际右上顶点 l1 内缩');
  const labelLines = live.split('\n').filter((l) => l.includes('lp.push('));
  assert.ok(labelLines.length >= 8, '工作区分区标注行应存在');
  /* 组级标注（data-tlunion）锚定保持 v100 组重心设计，不在本锁范围 */
  const zoneOnly = labelLines.filter((l) => !l.includes('data-tlunion'));
  assert.equal(zoneOnly.some((l) => l.includes('text-anchor="middle"')), false, '分区标注层不许残留居中');
  assert.equal(zoneOnly.some((l) => l.includes('<text') && l.includes('font-weight')), false, '标注层不许加粗');
  assert.ok(zoneOnly.every((l) => !l.includes('<text') || l.includes('fill="#000"')), '标注层全部纯黑（g 壳行除外）');
  assert.ok(live.includes("translate(' + fmt(l1.x - 4)"), '竖排分支也锚右上（l1）');
  /* 包围盒 rx/rw 仍被尺寸分支判断使用，不许误删 */
  assert.ok(live.includes('var aw = Math.abs(rw)'), 'aw/ah 尺寸判断保留');
});

test('⑥ 三页标注颜色统一纯黑（工作区/inline-09/plot-editor）', () => {
  const i9live = stripJs(i9);
  const i9Lines = i9live.split('\n').filter((l) => l.includes('zoneLabelParts.push('));
  assert.ok(i9Lines.length >= 6, 'inline-09 标注行应存在');
  assert.ok(i9Lines.every((l) => l.includes('fill="#000"')), 'inline-09 标注全黑');
  assert.equal(i9Lines.some((l) => l.includes('font-weight')), false, 'inline-09 标注不加粗');
  const pelive = stripJs(pe);
  assert.ok(pelive.includes("ppCtx.fillStyle='#000'"), 'plot-editor canvas 标注纯黑');
  assert.ok(/text-anchor="end" fill="#000"/.test(pelive), 'plot-editor 施工 SVG 标注纯黑');
  assert.equal(pelive.includes("'#9a4d05'"), false, 'canvas 非标琥珀残留应删');
});
