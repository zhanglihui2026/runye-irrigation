'use strict';
/* tests/v1069_node_resync.test.cjs —— [v1069] 节点回传地图：几何换代参数迁移替代整表清空
 *
 * 用户实测：「分区与管路页面的节点，不能回传给在线地图」。
 * 破案链（三层叠加缺陷）：
 *   ① 几何签名变化时三处 RyTlNodes.reset() 把节点整表清空——
 *      inline-09 tlAutoGenerate 几何绑定块（5764）、runye-map-partition capture 提交后（134）、
 *      ensureRestored 旧签名丢弃（tl-nodes 68）。用户节点在每次重新生成/发布后无声消失。
 *   ② 「生成施工图」发布从 RyTlNodes.list() 冻结 publishedNodes——清空后恒为空 ⇒
 *      地图 publishedCouplersForPlot 永远拿不到节点 ⇒ 地图上永远看不到节点标记。
 *   ③ tlGenerateDiagramToMap 的 catch 只 console.warn——发布链任何一环失败都零提示。
 * 修复：
 *   A. tl-nodes.js 新增 resyncGeometry()：节点按 pid+atM 参数迁移（M13「重算后重新投影」
 *      拍板口径）——atM 夹到所在管线新长度、pid 失效才剔除、persist 以新签名落盘；
 *      canonical 适配器（core/drawing-design-level3-adapter.js:39 geoSig 校验）照常通过，
 *      而不是靠清空绕开校验。兼容 front 总管节点（PID_RE 口径）。
 *   B. inline-09 几何绑定块与 capture 提交后改调 resyncGeometry（reset 仅兜底）。
 *   C. tlGenerateDiagramToMap 失败 alert 带原因（fail-loud）。
 *   D. tlPublishCurrentNodesToMapSnapshot 暴露 __tlNodesPublishState；地图端切页对
 *      network-stale 给 15s 防抖 tip：「请到分区与管路点生成施工图」。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const nodesJs = fs.readFileSync(path.join(ROOT, 'tl-workspace', 'tl-nodes.js'), 'utf8');
const i9 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const omp = fs.readFileSync(path.join(ROOT, 'runye-map-partition.js'), 'utf8');
const oml = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.js'), 'utf8');
const l3 = fs.readFileSync(path.join(ROOT, 'core', 'drawing-design-level3-adapter.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('[v1069] tl-nodes 新增 resyncGeometry：pid+atM 参数迁移，不丢节点', () => {
  assert.ok(nodesJs.includes('function resyncGeometry()'), '必须定义 resyncGeometry');
  const pos = nodesJs.indexOf('function resyncGeometry()');
  const seg = nodesJs.slice(pos, pos + 2600);
  assert.ok(seg.includes('Math.min(Number(nd.atM) || 0, L)'),
    'atM 必须夹到所在管线新长度内（夹取，不是丢弃）');
  assert.ok(seg.includes("nd.pid === 'front'"), '必须兼容 front 总管节点（PID_RE 口径）');
  assert.ok(seg.includes('ids[lk.a] && ids[lk.b]'), '连线两端节点都在才保留');
  assert.ok(/resyncGeometry: resyncGeometry/.test(nodesJs), '必须导出到 RyTlNodes 公共 API');
  assert.ok(seg.includes('persist()'), '迁移后必须以新签名 persist（canonical geoSig 校验通过）');
  assert.ok(!seg.includes('.reset()'), '迁移路径不得调用 reset');
});

test('[v1069] canonical 适配器 geoSig 校验保留（迁移后自然通过，不是删校验）', () => {
  assert.ok(l3.includes("if (nodes && nodes.geoSig && nodes.geoSig !== signature) return fail('level3-node-signature-mismatch');"),
    'level3-node-signature-mismatch 校验必须保留——resync 以新签名落盘后自然通过');
});

test('[v1069] inline-09 几何绑定块：清空改迁移', () => {
  const pos = i9.indexOf('var savedNodes=null');
  const seg = i9.slice(pos, pos + 1200);
  assert.ok(seg.includes('RyTlNodes.resyncGeometry()'), '几何换代必须优先调 resyncGeometry');
  assert.ok(seg.includes('pid+桩号迁移到新几何'), '迁移分支必须带说明日志');
  assert.ok(seg.includes("typeof window.RyTlNodes.reset==='function'"),
    'resync 不可用时必须保留 reset 兜底（旧几何节点不混入新管线的底线）');
});

test('[v1069] capture 提交后：清空改迁移', () => {
  const pos = omp.indexOf('if(committed.ok&&nodesChanged)');
  const seg = omp.slice(pos, pos + 900);
  assert.ok(seg.includes('root.RyTlNodes.resyncGeometry()'), 'capture 提交后必须优先 resyncGeometry');
  assert.ok(seg.includes("typeof root.RyTlNodes.reset==='function'"), 'reset 兜底保留');
});

test('[v1069] 生成施工图失败必须弹窗（不再 console.warn 静默）', () => {
  const pos = i9.indexOf('catch(eGen)');
  const seg = i9.slice(pos, pos + 400);
  assert.ok(seg.includes('alert('), '发布失败必须 alert 带原因');
  assert.ok(seg.includes('生成施工图未完成'), '文案必须可辨认');
});

test('[v1069] live-sync 拒绝原因暴露 + 地图端一次性指引 tip', () => {
  assert.ok(i9.includes("window.__tlNodesPublishState={ok:false,reason:'network-stale',ts:Date.now()}"),
    'network-stale 拒绝必须写 __tlNodesPublishState');
  assert.ok(i9.includes("window.__tlNodesPublishState={ok:true,count:published.length,ts:Date.now()}"),
    '发布成功必须写 __tlNodesPublishState（含节点数）');
  assert.ok(oml.includes("ps.reason==='network-stale'"), '地图端必须消费 network-stale 状态');
  assert.ok(oml.includes('节点就会同步到地图'), 'tip 必须给出可执行动作');
  assert.ok(oml.includes('__tlNodesStaleTipAt'), 'tip 必须 15s 防抖（不得每次切页都弹）');
});

test('[v1069] 版本纪律：主串动态等于 sw VERSION；tl-nodes 独立串', () => {
  const v = sw.match(/^const VERSION = '([^']+)';/m);
  assert.ok(v, 'sw.js 必须有 VERSION');
  const want = v[1].replace(/^v/, '');
  /* 动态闸门：[v1071] 起 17 处（主串 15 + runye-map-enhance.js + trunk-snap.js 并入同值），
     tl-nodes.js 独立串随版本演进（1069-nodes-resync | 107x- | 108x-…）。 */
  assert.equal(html.split('?v=' + want).length - 1, 17, '版本串必须恰好 17 处');
  assert.ok(/tl-workspace\/tl-nodes\.js\?v=(1069-nodes-resync|10[7-9]\d-|11\d\d-)/.test(html),
    'tl-nodes.js 必须有独立抬版串');
});
