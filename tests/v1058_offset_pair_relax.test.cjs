'use strict';
/* tests/v1058_offset_pair_relax.test.cjs —— [v1058] 主管/支管图面偏移配对宽容度放宽
 *
 * 用户实测（多地块规划·15 分区·旋转 3.1° 场景）：「主管跟支管叠加显示」——
 * 像素扫描定位：部分列主管与支管完全重叠（蓝线只从绿线两侧露出 <1px 边）、
 * 部分列正常错开 20m。ppGetPipeDisplayGeometry 偏移逻辑本身正确（node 探针
 * 对同线主支管输出精确 20m），败在两处阈值过严：
 *   ① 配对检测：平行叉积 0.02（≈1.15°）+ 横向重合 0.5m——旧版生成/裁剪折线/
 *      手动微调过的主管与自动支管近似共线时漏配 → 双方都不偏移 → 叠加；
 *   ② 邻管避让：横向差 1~3m 的支管被误判为「相邻支管」（异形地块边缘列形心
 *      逐分区微移）→ safeGap 被压到 1~3m → 偏移量被吃掉。
 * 修复（纯渲染层，水力/材料口径零改动）：
 *   ① 平行阈值 0.02→0.06（≈3.4°）、横向重合 0.5→2.0m；
 *   ② 避让阈值 0.5→2.0m，且只对轴向投影真正并排（纵向重叠）的支管生效。
 * 探针矩阵（本文件以源码锁 + 附 node 验证记录）：
 *   形心漂移列（1.5/3.0m）→ 全列恢复 20m 间距；差 1.8m 共沟管 → 正常配对偏移；
 *   差 30m 独立管 → 不偏移（0m）；真并排近管（横向 25m 纵向重叠）→ 避让保留。
 * M13 不变量延续：偏移只产生渲染副本，不改设计坐标/水力/材料。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pe = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');

test('[v1058] 配对平行阈值放宽 0.02 → 0.06', () => {
  assert.ok(pe.includes("if(!ma||Math.abs(ba.dx*ma.dy-ba.dy*ma.dx)>0.06)return;"),
    '主管配对的平行叉积阈值必须是 0.06');
  assert.ok(!pe.includes("Math.abs(ba.dx*ma.dy-ba.dy*ma.dx)>0.02"),
    '旧阈值 0.02 必须退役');
});

test('[v1058] 配对横向重合阈值 0.5m → 2.0m', () => {
  const fnPos = pe.indexOf('function ppGetPipeDisplayGeometry');
  const fnSeg = pe.slice(fnPos, fnPos + 6200);
  assert.ok(fnSeg.includes('if(lateral>2.0)return;'), '配对横向重合阈值必须是 2.0m');
  assert.ok(!fnSeg.includes('if(lateral>0.5)return;'), '旧阈值 0.5m 必须退役');
});

test('[v1058] 邻管避让：阈值 2.0m + 仅轴向投影并排的对生效', () => {
  const fnPos = pe.indexOf('function ppGetPipeDisplayGeometry');
  const fnSeg = pe.slice(fnPos, fnPos + 6200);
  assert.ok(fnSeg.includes('if(lateral<=2.0||lateral>=nearestZoneSpacing)return;'),
    '避让扫描横向差 ≤2m 的支管必须跳过（同列不避让）');
  assert.ok(fnSeg.includes('var orange=projectedRange(other,ba),noverlap='),
    '避让前必须做轴向投影重叠检测');
  assert.ok(fnSeg.includes('if(noverlap<=Math.min(0.5,ba.length*0.5))return;'),
    '纵向不并排的支管不构成避让理由');
  assert.ok(!fnSeg.includes('if(lateral>0.5&&lateral<nearestZoneSpacing)'),
    '旧版无重叠检测的一行式避让必须退役');
});

test('[v1058] 偏移仍为纯渲染副本（不改设计坐标的水力口径）', () => {
  const fnPos = pe.indexOf('function ppGetPipeDisplayGeometry');
  const fnSeg = pe.slice(fnPos, fnPos + 6200);
  assert.ok(fnSeg.includes("mains=(mainPipes||[]).map(function(l){return(l||[]).map(function(p){return{x:p.x,y:p.y};});})"),
    '输入深拷贝：设计数组互不改写');
  assert.ok(/唯一的显示偏移值/.test(pe) && /PP_MAIN_BRANCH_GAP_M = 20;/.test(pe), 'PP_MAIN_BRANCH_GAP_M=20 基准值不变');
});

test('[v1058] 版本纪律：主串动态等于 sw VERSION', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  const want = v[1].replace(/^v/, '');
  /* [v1069] 口径演进：v1059 时代 14 处（tl-workspace 独立串）；M14 起 tl-workspace.js
     并入主串同抬 ⇒ 15 处（含 tl-workspace.js）；[v1071] 起 runye-map-enhance.js 与
     trunk-snap.js 版本串并入同值 ⇒ 17 处。tl-nodes.js 另有独立串。 */
  assert.equal(html.split('?v=' + want).length - 1, 17);
});
