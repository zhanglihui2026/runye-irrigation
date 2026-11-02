'use strict';
/* [v897 2026-11-02] 剩余写路径审计锁（权威切换批次 A 小批 A1）。
   审计结论（project-planning/剩余写路径审计_2026-11-02.md）：用户编辑主路径已全部在
   canonical 事务链内，绕过事务的仅 7 条路径（2 死代码 + 2 降级 + 2 导入 + 1 缓存）。
   本文件锁住三个「不许无声回退」的关键点：
     ① v304 手动画管拦截 guard 必须在——它使绕过事务的 ppAddPipe 链不可达；
     ② ppAddPipe 必须带审计标记（未来恢复绘制的人会先撞到 warn 与注释）；
     ③ tlAutoResetGroups 降级直写必须带显式 warn（不许静默绕过事务）。 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const peSrc = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const tlSrc = fs.readFileSync(path.join(ROOT, 'tl-workspace', 'tl-workspace.js'), 'utf8');

test('[v897] v304 手动画管拦截 guard 必须存在（绕事务的 ppAddPipe 链靠它不可达）', () => {
  assert.ok(
    peSrc.includes("if(ppState.mode==='main'||ppState.mode==='branch'||ppState.mode==='subbranch'){ppMouseDownPos=null;return;}"),
    'v304 guard 丢失 ⇒ 手动画管链复活且绕过 canonical 事务——先给 ppAddPipe 补事务再删 guard'
  );
});

test('[v897] ppAddPipe 必须带审计标记（死代码 + 恢复绘制前须补事务的提醒）', () => {
  const pos = peSrc.indexOf('function ppAddPipe(');
  assert.ok(pos > -1, 'ppAddPipe 必须存在');
  const seg = peSrc.slice(Math.max(0, pos - 700), pos + 200);
  assert.ok(seg.includes('v897 审计标记'), 'ppAddPipe 头部必须有审计注释');
  assert.ok(seg.includes('ppCommitSinglePlotEdit'), '注释必须指明恢复绘制前补哪个事务');
  const body = peSrc.slice(pos, pos + 600);
  assert.ok(body.includes("console.warn('[plot-editor] ppAddPipe"), 'ppAddPipe 体必须有运行时 warn 标记');
});

test('[v897] tlAutoResetGroups 主路径必须优先走事务收口（RunyeBridge.cutStepReset）', () => {
  /* 注：工作区另有「fallback 分支加降级 warn」标记，因同文件混有并行会话未提交改动
     暂不入库——待该改动落地后由后续版本补 warn 断言。 */
  const pos = tlSrc.indexOf('function tlAutoResetGroups()');
  assert.ok(pos > -1, 'tlAutoResetGroups 必须存在');
  const seg = tlSrc.slice(pos, pos + 1200);
  assert.ok(seg.includes('RunyeBridge && typeof window.RunyeBridge.cutStepReset'), '主路径必须优先走 RunyeBridge.cutStepReset（canonical 事务收口），不许降级为默认路径');
  assert.ok(seg.includes('window.tlDiagramData.zones.cutOffX = null'), 'fallback 直写路径保留（仅桥未挂载时触达）');
});
