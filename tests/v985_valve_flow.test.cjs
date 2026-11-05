'use strict';
/* tests/v985_valve_flow.test.cjs —— 轮灌演示：水流要流到「每一枚阀门」（2026-11-05）
 *
 * 用户截图（轮灌演示 1 区激活）：主管上有多枚阀门，但只有第一枚阀门有馈线动画，
 * 其余阀门所在管段静止——「从主管流向各个阀门那一点距离，没有看到水流经过的动画」。
 *
 * v985 改法：buildFlowRoutes 把当前组每枚阀门注册成独立 Dijkstra 终点——
 * 主管投影切点（valve-main:N）+ 短馈线（valve-feed:N → valve-node:N），
 * 复用既有 feeds 机制，纯可视化叠层，不改管线几何与水力模型。
 *
 * 五把锁：
 *   ① 每阀终点注册块存在（activeZones 过滤 + byMain + 投影容差 20m）；
 *   ② feeds 支持 ownKey（新馈线 key=valve-feed:N，旧支管馈线 key 不变）；
 *   ③ 阀门节点进 targets（valve-node:N）；
 *   ④ 阀门投影容差与既有馈线一致（>20m 跳过，宁缺不错）；
 *   ⑤ 版本锁动态对齐 sw VERSION（14 处同抬）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const demo = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('① 每枚阀门注册成独立终点（当前组过滤 + 主管投影）', () => {
  assert.ok(/\/\* \[v985 用户 2026-11-05\] 主管→每枚阀门那一段也要看见水流/.test(demo),
    'v985 注释块丢了');
  assert.ok(/\(d\.valves\|\|\[\]\)\.forEach\(function\(v,vi\)\{/.test(demo),
    '应遍历全部阀门（而非 some 取第一枚）');
  assert.ok(/activeZones\.indexOf\(v\.mi\)<0\)return;/.test(demo),
    '只给当前组的阀门注册终点（activeZones 过滤）');
  assert.ok(/var main=byMain\[v\.mi\];if\(!main\)return;/.test(demo),
    '阀门应投影到其所属主管 byMain[v.mi]');
});

test('② feeds 支持 ownKey：新馈线 valve-feed:N，旧支管馈线 key 不变', () => {
  assert.ok(/ownKey:'valve-feed:'\+vi/.test(demo), '阀门馈线应有独立 key（valve-feed:N）');
  assert.ok(/key:f\.ownKey\|\|\('branch-feed:'\+f\.zi\)/.test(demo),
    'feeds 链接必须兼容无 ownKey 的旧支管馈线（key=branch-feed:zi）');
  assert.ok(/feeds\.push\(\{zi:v\.mi,from:mainId,to:nodeId,points:\[at\(main,vp\.s\),v\.ll\],ownKey:/.test(demo),
    '阀门馈线应走既有 feeds 机制（主管切点→阀门坐标）');
});

test('③ 阀门节点进 targets：Dijkstra 终点=阀门', () => {
  assert.ok(/var mainId='valve-main:'\+vi,nodeId='valve-node:'\+vi;/.test(demo),
    '主管切点与阀门节点 id 要成对生成');
  assert.ok(/addCut\(main,vp\.s,mainId\);/.test(demo), '主管上要按投影位置切点');
  assert.ok(/targets\.push\(\{zi:v\.mi,id:nodeId\}\);/.test(demo),
    '阀门节点必须进 targets，否则 Dijkstra 不会往那流');
});

test('④ 容差口径：阀门投影 >20m 跳过（与既有支管馈线一致，宁缺不错）', () => {
  assert.ok(/var vp=project\(main,v\.ll\);if\(vp\.d>20\)return;/.test(demo),
    '阀门投影容差应为 20m（超过就不画，避免图面出现穿地馈线）');
});

test('⑤ 版本锁：index.html 14 处与 sw.js VERSION 动态同抬', () => {
  const m = sw.match(/const VERSION = '(v\d+[^']*)';/);
  assert.ok(m, 'sw.js 缺 VERSION');
  const num = m[1].replace(/^v/, '');
  assert.strictEqual(html.split('?v=' + num).length - 1, 14,
    'index.html 应有 14 处 ?v=' + num + '（与 sw VERSION 一致）');
  assert.ok(/v985-valve-flow/.test(m[1]), '本次应为 v985-valve-flow');
});
