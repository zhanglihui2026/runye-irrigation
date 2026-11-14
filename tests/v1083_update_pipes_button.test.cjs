#!/usr/bin/env node
/* v1083-update-pipes-button 回归锁：「更新管路」显式按钮。
 *
 * 用户原话（2026-11-14）：
 *   「分区与管路页面 旋转角度那个工具栏 增加跟按钮，更新管路，地块旋转角度之后，
 *     点击更新管路之后，管路按照新的地块分区角度布置，然后再点击顶部工具栏的
 *     生成施工图按钮，才传递给在线地图。」
 *
 * 契约（本文件锁死，别再改回"只有自动重算、没有手动入口"）：
 *   ① 二级快捷条 #ppQuickBar 里、紧挨「↻ +90°」有 #ppUpdatePipes；
 *   ② 点击 → 按当前分区几何重排主管/支管/三级管/阀门，并刷新三级图层；
 *   ③ 重排前撤掉 ppRender 尾部的 400ms 防抖定时器（不重复跑两遍），
 *      并清掉失败冷却 ppAutoRegenFailSig（手动点击必须重试）；
 *   ④ **不发布**：地图只认顶部「生成施工图」，本函数不写 runye_network_layout；
 *   ⑤ 绑定必须判空（DOM 删了而绑定留着会抛 TypeError 断掉编辑器初始化）；
 *   ⑥ 画布旧管线警示的指路文案改成「更新管路」+「生成施工图」两步。
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

const html = read('index.html');
const pe = read('mod/plot-editor.js');
const icons = read('mod/ry-icons.js');
const sw = read('sw.js');

/* 锁1：DOM —— 按钮在快捷条内、紧跟旋转按钮 */
ok(html.includes('id="ppUpdatePipes"'), '[v1083] index.html 有 #ppUpdatePipes 按钮');
ok(/id="ppRotateZones"[^>]*>[\s\S]{0,700}?id="ppUpdatePipes"/.test(html),
  '[v1083] 「更新管路」紧跟在「↻ +90°」之后（同一工具条）');
ok(html.includes('title="更新管路：按当前分区角度立刻重排'), '[v1083] 按钮 title 说明重排范围');
ok(html.includes('不推送在线地图，确认无误后再点顶部「生成施工图」同步'),
  '[v1083] title 明确「不推送地图」，发布仍归「生成施工图」');

/* 锁2：行为 —— 复用 ppAutoGeneratePipes，不另写一套布管 */
ok(/function ppUpdatePipesNow\(\)/.test(pe), '[v1083] ppUpdatePipesNow 函数在位');
ok(/ok=ppAutoGeneratePipes\(\)===true;/.test(pe), '[v1083] 重排复用 ppAutoGeneratePipes（单一布管实现）');
ok(/try\{ clearTimeout\(ppAutoRegenTimer\); \}/.test(pe), '[v1083] 先撤待跑的防抖定时器');
ok(/ppAutoRegenRunning=true;/.test(pe) && /finally\{ ppAutoRegenRunning=false; \}/.test(pe),
  '[v1083] 执行期间置重算标志（防 ppRender 尾部递归）');
ok(/ppAutoRegenFailSig=null;/.test(pe), '[v1083] 手动成功解除失败冷却');
ok(/window\.atShowToast\(msg\)/.test(pe), '[v1083] 成功给回执（主管/支管/三级/阀门条数）');

/* 锁3：绝不发布 —— 函数体内不许出现写网络布局 */
const fnBody = (() => {
  const i = pe.indexOf('function ppUpdatePipesNow()');
  if (i < 0) return '';
  const j = pe.indexOf('\n  }', i);
  return pe.slice(i, j < 0 ? i + 4000 : j);
})();
ok(fnBody.length > 200, '[v1083] 取到 ppUpdatePipesNow 函数体');
ok(!/writeNetworkLayout|writeHydraulicDesign|publishToMap|tlGenerateDiagramToMap/.test(fnBody),
  '[v1083] 函数体内无发布调用（地图只认「生成施工图」）');

/* 锁4：绑定判空（v804 那个 TypeError 坑的通用防回退） */
ok(/\(function bindUpdatePipes\(\)\{[\s\S]{0,200}if\(!btn\)return;/.test(pe),
  '[v1083] click 绑定前判空，DOM 缺失不抛 TypeError');

/* 锁5：图标与指路文案 */
ok(icons.includes("ppUpdatePipes:'pipenet'"), '[v1083] RyIcons 精确映射 ppUpdatePipes→pipenet');
ok(pe.includes('管线为旧分区布局生成，与当前分区不一致'), '[v1083] 旧管线警示前缀保留（v1052 锁不改）');
ok(pe.includes('请点「更新管路」重排（再点「生成施工图」发布到地图）'),
  '[v1083] 警示文案指向两步：先更新管路、再生成施工图');

/* 锁6：版本纪律（动态读 sw VERSION） */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1083] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1083] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1083] 有断言失败' : '\n[v1083] 全部通过');
