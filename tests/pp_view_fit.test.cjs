'use strict';
/* pp_view_fit.test.cjs —— 「地块分区整幅可见」的视图契约（v629，2026-10-20）
 *
 * 背景（真实 bug，用户反馈三次以上）：「地块分区怎么就显示一半呢？是不是又出现了多层覆盖/嵌套」
 *   —— 前几次都按 CSS 嵌套去查（v627 修的是三级 SVG 图纸卡的高度链，与二级画布无关）。
 *   二级画布是 <canvas>，线被切是**视图变换**造成的，不是 CSS 裁的：
 *     ① ppUpdateTransform 的比例写死 `s = 0.5 * zoom`（1px=2m），全文没有
 *        「内容是否装得下画布」的判断；
 *     ② zoom / panX / panY 又被 ppGetState / ppSetState 存进地块存档
 *        ⇒ 在做图区滚一次滚轮（一次 ±10%，很容易滚到 347%）就被永久记住；
 *     ③ ppResize 只按容器重设画布尺寸，变换仍沿用那个 zoom。
 *   实测（_probe_pp_ink.mjs 读 canvas 像素算墨迹包围盒）：VW=1086 VH=581 zoom=3.47 时
 *   期望内容高 411px > 画布可用高，ink 触到画布上下沿 —— 上下各切一刀。
 *
 * 本文件锁的是「收口结构」：只要谁把收口拆了、或把 clamp 提前到还没量尺寸的时候，
 * 这里立刻红。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'mod', 'plot-editor.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'mod', 'style-01.css'), 'utf8');

const at = (needle) => {
  const i = js.indexOf(needle);
  assert.ok(i >= 0, 'mod/plot-editor.js 里应存在 ' + needle);
  return i;
};
/* 取一个函数的函数体（从签名到下一个同缩进的 "  }"），用于区间断言 */
function body(sig) {
  const s = at(sig) + sig.length;
  const e = js.indexOf('\n  }', s);
  assert.ok(e > s, sig + ' 的函数体没找到');
  return js.slice(s, e);
}

/* ---------- 1. 收口函数齐全 ---------- */
['function ppContentSize(', 'function ppFitScale(', 'function ppClampViewToFit(',
  'function ppFitView(', 'function ppIsViewClipped(', 'function ppSyncFitBtn('].forEach(function (sig) {
    assert.ok(js.indexOf(sig) >= 0, '缺少 ' + sig + ') —— v629 的视图收口被删了');
  });

/* ---------- 2. ppResize 必须「先收口、再算变换」，顺序不能反 ---------- */
const resize = body('function ppResize(){');
const iClamp = resize.indexOf('ppClampViewToFit();');
const iTransform = resize.indexOf('ppUpdateTransform();');
assert.ok(iClamp >= 0, 'ppResize 里必须调用 ppClampViewToFit() —— 否则改窗口/切页回来又是裁切态');
assert.ok(iTransform > iClamp,
  'ppClampViewToFit() 必须在 ppUpdateTransform() **之前**：变换是按 ppCanvas.width/height 算的，' +
  '先算变换再夹比例会得到自相矛盾的 offset');

/* ---------- 3. 存档恢复路径（ppLoadPolygon）也要收口 ---------- */
assert.ok(body('function ppLoadPolygon(){').indexOf('ppClampViewToFit();') >= 0,
  'ppLoadPolygon 里也要收口：云端存着 zoom=347% 的地块一打开就该是整幅，' +
  '不能等下一次 window resize 才修');

/* ---------- 4. 只缩不放：装得下时不许动用户的比例 ---------- */
const clamp = body('function ppClampViewToFit(){');
const iGuard = clamp.indexOf('if(s>sfit*1.001)');
assert.ok(iGuard >= 0,
  'ppClampViewToFit 必须是「只缩不放」：只有 s > sfit（装不下）才改 zoom；' +
  '写成无条件赋值就会把用户主动放大的比例改掉');
const iSet = clamp.indexOf('ppState.zoom=Math.max(0.1,Math.min(10,sfit/0.5))');
assert.ok(iSet > iGuard,
  '改 zoom 的那一行必须落在 `if(s>sfit*1.001)` 块里面（区间检查：顺序反了就等于无条件缩放）');
assert.ok(/ppState\.panX=0;ppState\.panY=0/.test(clamp),
  '收口必须同时处理平移：panX/panY 也被存进地块存档，用户拖歪一次就会永久偏出去');
assert.ok(/if\(m&&m\.w\*s<=ppCanvas\.width\+1&&m\.h\*s<=ppCanvas\.height\+1&&\(ppState\.panX\|\|ppState\.panY\)\)/.test(clamp),
  '平移只在「内容整幅装得下」时归零（放大态下的平移是合理操作，不能清）');

/* ---------- 5. 没真量过容器之前不许算比例 ---------- */
const fitScale = body('function ppFitScale(){');
assert.ok(fitScale.indexOf('if(!ppSized) return null') >= 0,
  'ppFitScale 必须先判 ppSized —— <canvas> 出厂默认 300×150，拿它算「装得下」' +
  '会把用户存档里的正常比例永久压到 ~42%（v629 自己踩过的坑）');
assert.ok(/if\(ppCanvas\.width>60&&ppCanvas\.height>60\) ppSized=true;/.test(js),
  'ppResize 里要在量到真实尺寸（>60px）时才置 ppSized=true');

/* ---------- 6. 滚轮放大不能被收口打回（否则缩放功能等于废了） ---------- */
const wheelStart = at("ppCanvas.addEventListener('wheel'");
const wheelEnd = js.indexOf('{passive:false});', wheelStart);
const wheel = js.slice(wheelStart, wheelEnd);
assert.ok(wheel.indexOf('ppClampViewToFit') < 0,
  'wheel 处理器里不能调用 ppClampViewToFit：那样滚轮永远放不大（一放大就被夹回来）');

/* ---------- 7. 「适应窗口」胶囊：DOM 在画布容器内、样式默认隐藏、只在裁切时亮 ---------- */
assert.ok(/<div class="pp-canvas-wrap" id="ppCanvasWrap">[\s\S]*?<button type="button" class="pp-fitview" id="ppFitViewBtn"[\s\S]*?<\/div>/.test(html),
  '#ppFitViewBtn 必须放在 #ppCanvasWrap 内（它是画布内的绝对定位浮层，不进 .ry-pane-edit 网格；' +
  '放到网格里会多占一整行高度，正是这个项目反复踩的「多一层」坑）');
assert.ok(/\.pp-fitview\{[\s\S]{0,400}?display:none;/.test(css),
  '.pp-fitview 默认必须 display:none —— 没裁切时不该出现，否则等于在画布上常驻一个按钮');
assert.ok(/\.pp-fitview\.is-on\{display:inline-flex\}/.test(css),
  '.pp-fitview.is-on 才是可见态（JS 用 ppIsViewClipped() 决定加不加）');
const sync = body('function ppSyncFitBtn(){');
assert.ok(sync.indexOf('ppCanvas') >= 0 || sync.indexOf('ppIsViewClipped') >= 0,
  'ppSyncFitBtn 必须按 ppIsViewClipped() 的结果切 .is-on');
assert.ok(sync.indexOf("classList.toggle('is-on'") >= 0, 'ppSyncFitBtn 要 toggle is-on');

/* ---------- 8. 重绘出口挂一次同步，避免「分区旋转/重新分区」后胶囊状态不跟 ---------- */
assert.ok(/var ppRenderBase=ppRender;[\s\S]{0,200}?ppRender=function\(\)\{ ppRenderBase\.apply\(null,arguments\); ppSyncFitBtn\(\); \};/.test(js),
  'ppRender 出口必须包一层 ppSyncFitBtn()：分区旋转 / 重新分区 / 回退都会改内容尺寸');

/* ---------- 9. 胶囊点击 = ppFitView ---------- */
assert.ok(/getElementById\('ppFitViewBtn'\)[\s\S]{0,220}?ppFitView\(\)/.test(js),
  '#ppFitViewBtn 的点击必须走 ppFitView()');

console.log('pp_view_fit：视图收口契约 15 项通过');
