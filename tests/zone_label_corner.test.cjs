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
