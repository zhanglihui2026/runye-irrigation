'use strict';
/* tests/toolbar_dedupe.test.cjs —— 统一绘图工具栏「去重 + 末尾输出」契约（v824 起）
 *
 * 背景（2026-10-30 用户四张截图指令）：
 *   ① 「这个阀门取消，跟前面的重复了」   → 删管路组 #tlWsFitValve（分区组 data-mode=valve 保留）
 *   ② 「遮蔽管道也取消，跟前面的也重复了」→ 删管路组 #tlWsMaskBtn（分区组 data-mode=maskPipe 保留）
 *   ③ 「下载跟打印放在工具栏最后」        → #ppDownload / #ppPrint 移到 #tlDxfExport 之后
 *   ④ 「这个复位按钮取消吧」              → 删 #tlWsMoveResetBtn
 *
 * 顺带修掉的根因：style-01.css v815 给工具栏图标写了 `display:flex !important`，
 *   把**所有**行内 display:none 压掉 ⇒ v96 明确隐藏的四个按钮复活、按选中态显隐的那批常显。
 *   本文件锁住「不许再用 !important 写 display」，这是这一类「隐藏按钮又冒出来」的唯一根因。
 *
 * 判定一律在**剥掉 HTML 注释**的源码上做：被删元素的原文会以注释形式留在 index.html 里便于回退，
 * 直接 includes 会把注释也算上（假红）。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');
/* CSS 也要剥注释：说明文字里会写「原来是 display:flex !important」，不剥就自打自脸 */
const css = fs.readFileSync(path.join(ROOT, 'mod/style-01.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

test('v824 阀门只留一个入口：管路组 tlWsFitValve 已删，分区组 data-mode=valve 常驻', () => {
  assert.strictEqual(html.includes('id="tlWsFitValve"'), false,
    '管路组「阀门」按钮应已删除（与分区组阀门重复，且在本页是死键）');
  const hit = html.match(/<button[^>]*data-mode="valve"[^>]*>/g) || [];
  assert.strictEqual(hit.length, 1, '应恰好有 1 个 data-mode="valve" 按钮，实际 ' + hit.length);
  assert.ok(!/style\s*=\s*"[^"]*display:\s*none/.test(hit[0]),
    'data-mode="valve" 不许再带行内 display:none —— 它是当前唯一能用的阀门入口');
});

test('v824 遮蔽只留一个入口：管路组 tlWsMaskBtn 已删，分区组 data-mode=maskPipe 常驻', () => {
  assert.strictEqual(html.includes('id="tlWsMaskBtn"'), false,
    '管路组「遮蔽管道」按钮应已删除（与分区组遮蔽管线重复）');
  const hit = html.match(/<button[^>]*data-mode="maskPipe"[^>]*>/g) || [];
  assert.strictEqual(hit.length, 1, '应恰好有 1 个 data-mode="maskPipe" 按钮，实际 ' + hit.length);
  assert.ok(!/style\s*=\s*"[^"]*display:\s*none/.test(hit[0]),
    'data-mode="maskPipe" 不许再带行内 display:none');
});

test('v824 「恢复位置」按钮已删除', () => {
  assert.strictEqual(html.includes('id="tlWsMoveResetBtn"'), false,
    '#tlWsMoveResetBtn 应已按用户要求删除');
});

test('[v982b→v1015] 「三通复位」按钮已删除，底层函数也随总管自动链路清除', () => {
  assert.strictEqual(html.includes('id="tlFrontNodeResetBtn"'), false,
    '#tlFrontNodeResetBtn 应已按用户要求删除');
  assert.ok(!html.includes('三通复位'), '按钮文案不得残留');
  const i09 = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
  /* [v1015 2026-11-08 用户拍板] 总管一律在线地图手绘，window.tlFrontNodeReset 与
     tlFrontNodeDrops_v1 存取一并清除（原「保留应急」契约作废，见 auto_trunk_removed.test.cjs）。 */
  assert.ok(!i09.includes('window.tlFrontNodeReset'),
    'window.tlFrontNodeReset 必须随总管自动生成链路一并清除');
  assert.ok(!i09.includes('tlFrontNodeDrops_v1'),
    'tlFrontNodeDrops_v1 持久化必须一并清除');
});

test('v824 下载 / 打印是工具栏最后两个按钮（紧跟在导出 CAD 之后）', () => {
  const iDxf = html.indexOf('id="tlDxfExport"');
  const iDown = html.indexOf('id="ppDownload"');
  const iPrint = html.indexOf('id="ppPrint"');
  assert.ok(iDxf > 0 && iDown > 0 && iPrint > 0, '三个按钮都应存在');
  assert.ok(iDown > iDxf, '下载应在「导出 CAD(DXF)」之后（工具栏末尾）');
  assert.ok(iPrint > iDown, '打印应紧跟在下载之后');
  /* 打印之后到容器结束之间不该还有按钮 —— 它必须是最后一个 */
  const afterPrint = html.slice(iPrint, iPrint + 600);
  const nextBtn = afterPrint.indexOf('<button');
  const closeWrap = afterPrint.indexOf('</div>');
  assert.ok(nextBtn < 0 || closeWrap < nextBtn,
    '打印之后到容器结束之间不该还有按钮 —— 它必须是最后一个（应是 #tlWsHint + </div>）');
});

test('v824 工具栏图标不许再用 !important 写 display（根因防回归）', () => {
  /* 只查**按钮本体**那条规则；::before 伪元素那条反而是对的
     （content:none + display:none !important 用来关掉旧的字形图标通道，别误伤）。 */
  const rules = (css.match(/#ryDrawingHost[^{]*data-ry-ico-svg[^{]*\{[^}]*\}/g) || [])
    .filter((r) => !r.includes('::before'));
  assert.ok(rules.length > 0, '应能找到 data-ry-ico-svg 的按钮本体样式规则');
  for (const r of rules) {
    const disp = (r.match(/display\s*:\s*[^;!}]+(!important)?/g) || []);
    for (const d of disp) {
      assert.ok(!/!important/.test(d),
        '不允许用 display + !important 压行内样式（会把该隐藏的按钮顶出来）：\n' + d);
    }
  }
});

test('v824 v96 那批确实该隐藏的四个按钮仍然隐藏', () => {
  /* 用户只取消了阀门/遮蔽两个重复项；主管/支管/横竖锁定/水源 仍按 v96 隐藏（手工画线不进水力计算） */
  for (const mode of ['main', 'branch', 'source']) {
    const hit = html.match(new RegExp('<button[^>]*data-mode="' + mode + '"[^>]*>', 'g')) || [];
    assert.strictEqual(hit.length, 1, mode + ' 按钮应只有 1 个');
    assert.ok(/display:\s*none/.test(hit[0]), mode + ' 按钮应仍带行内 display:none');
  }
  assert.ok(/id="ppLineOrtho"[^>]*display:\s*none/.test(html), '横竖锁定仍应隐藏');
});
