'use strict';
/* [v913 2026-11-03] 接驳节点（couplerNodes）落点锁。
   设计：ppState.couplerNodes=[{pipeKey,s 米}]，每主管至多 1 条；s 以
   tlDiagramData.mainPipes（世界米）折线为基准。六个落点必须同时在位：
     1. PP_SLOT_KEYS（成员槽捕获）        plot-editor.js:~971
     2. designKeys（提交变更检测）        ppCommitSinglePlotEdit
     3. ppGetState 白名单（存档/快照出口）——显式字段构造，漏加即静默丢数据
     4. ppSetState 回填                   ——旧存档零迁移
     5. inline-09 tlAutoGenerate 投影     ——dd.couplerNodes 世界米坐标 + couplerSource 健康度
     6. 事务/undo 零新代码（ppState 字段自动覆盖）——由 1+2 保证
   附录：project-planning/手绘总管与轮灌演示_任务清单_2026-11-02.html §5.5 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const peSrc = fs.readFileSync(path.join(ROOT, 'mod', 'plot-editor.js'), 'utf8');
const i9Src = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');

function extractList(name) {
  const re = new RegExp('var ' + name + '=\\[([^\\]]+)\\]');
  const m = peSrc.match(re);
  assert.ok(m, 'plot-editor.js 必须存在 var ' + name + '=[...] 清单定义');
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('[v913] couplerNodes 必须同时进 PP_SLOT_KEYS 与 designKeys（两清单同加）', () => {
  const slotKeys = extractList('PP_SLOT_KEYS');
  const designKeys = extractList('designKeys');
  assert.ok(slotKeys.includes('couplerNodes'), 'PP_SLOT_KEYS 缺 couplerNodes——成员槽捕获丢字段');
  assert.ok(designKeys.includes('couplerNodes'), 'designKeys 缺 couplerNodes——字段变化不触发 canonical 提交');
});

test('[v913] ppGetState 白名单与 ppSetState 回填必须在位', () => {
  const m = peSrc.match(/couplerNodes:JSON\.parse\(JSON\.stringify\(ppState\.couplerNodes\|\|\[\]\)\)/);
  assert.ok(m, 'ppGetState 白名单缺 couplerNodes 行——该函数是显式字段构造，漏加即静默丢数据');
  assert.ok(/ppState\.couplerNodes=/.test(peSrc) && /saved\.couplerNodes/.test(peSrc),
    'ppSetState 缺 couplerNodes 回填——旧存档恢复后节点参数丢失');
  assert.ok(/\.filter\(function\(n\)\{return n&&typeof n\.pipeKey==='string'/.test(peSrc),
    'ppSetState 回填必须过滤非法项（缺 pipeKey / 负 s）');
});

test('[v913] inline-09 投影：dd.couplerNodes 世界米坐标 + 失配保留参数 + couplerSource 健康度', () => {
  assert.ok(/couplerNodes:\s*\(function\(\)\{/.test(i9Src), 'tlDiagramData 缺 couplerNodes 投影');
  assert.ok(/couplerSource/.test(i9Src), '缺 couplerSource 投影健康度字段（仿 trunkSource 惯例）');
  assert.ok(/pipeIndexByKey/.test(i9Src) && /'m'\+\(best\.idx\+1\)/.test(peSrc),
    'pipeKey 身份必须= dd.mainPipes 索引+1（两端同口径）——自动生成流里 ppState.pipeIds.main 恒空，禁做身份源');
  assert.ok(/missing\(/.test(i9Src), '失配必须带原因（missing(<pipeKey>)）');
  // 非等比 frame（scaleX≠scaleY）下弧长必须在世界米折线上算——投影读的是 mainPipes.map(tlGridWorld)
  assert.ok(/var world=mainPipes\.map\(function\(line\)\{return line\.map\(function\(p\)\{return tlGridWorld\(p\.x,p\.y\);\}\);\}\);/.test(i9Src),
    '投影必须在世界米折线上算弧长（禁止格系比例取点）');
});

test('[v913] 交互接线：放置模式/拖动/事务提交/成组禁用', () => {
  assert.ok(/ppCouplerPlacing/.test(peSrc), '缺放置模式状态');
  assert.ok(/ppState\.dragCoupler/.test(peSrc), '缺拖动状态（ppState.dragCoupler）');
  assert.ok(/ppCommitSinglePlotEdit\([^)]*'coupler-move'/.test(peSrc), '拖动松手必须走 ppCommitSinglePlotEdit 事务');
  assert.ok(/ppCommitSinglePlotEdit\([^)]*'coupler-input'/.test(peSrc), '面板输入必须走事务');
  assert.ok(/ppCommitSinglePlotEdit\([^)]*'coupler-remove'/.test(peSrc), '移除节点必须走事务');
  // 拖动中实时投影：预览与落点共用同一投影函数（v852 教训）。
  // [v1059] 交互链升级为 ppCouplerProjectDisp（显示偏移反算投影）：放置点击与拖拽
  // mousemove 必须同口径（先按主管偏移反算再投影设计线），ppCouplerProject 保留
  // 为 world 入参原口径（外部/探针兼容）。
  assert.ok(peSrc.split('ppCouplerProjectDisp(').length >= 3,
    'ppCouplerProjectDisp 必须被放置/拖动共用（v1059 显示反算口径）');
  assert.ok(!peSrc.includes('var chit=ppCouplerProject(wpt);') && !peSrc.includes('var cmHit=ppCouplerProject(cmWpt);'),
    '交互链不得直连设计几何投影（偏移显示后旧路径错位，v1059 退役）');
  // pan 误触防护：mousemove pan 阈值分支必须排除 dragCoupler
  assert.ok(/!ppState\.dragCut&&!ppState\.dragCoupler/.test(peSrc),
    'pan 阈值分支必须排除 dragCoupler——否则拖节点 2px 就误入平移');
});

test('[v913] undo 快照链与事务后重投影必须在位', () => {
  // ppCloneState / ppRestoreState 是手工字段清单——漏 couplerNodes 则 undo 不回退节点（探针实测踩坑）
  assert.ok(/couplerNodes:JSON\.parse\(JSON\.stringify\(ppState\.couplerNodes\|\|\[\]\)\),?\s*\n\s*\};?\s*\n\s*\}\s*\n\s*\n?\s*function ppPushHistory/.test(peSrc.replace(/\r\n/g, '\n')),
    'ppCloneState 缺 couplerNodes——undo 快照丢节点参数');
  assert.ok(/ppState\.couplerNodes=JSON\.parse\(JSON\.stringify\(snap\.couplerNodes\|\|\[\]\)\)/.test(peSrc),
    'ppRestoreState 缺 couplerNodes 恢复——undo 后节点参数留在原地');
  // 事务成功只刷二级快照；couplerNodes 投影在 tlDiagramData，三个 coupler 事务点必须补 ppRefreshTLAfterCuts
  const afterMove = peSrc.indexOf("'coupler-move'");
  const afterInput = peSrc.indexOf("'coupler-input'");
  const afterRemove = peSrc.indexOf("'coupler-remove'");
  for (const [name, at] of [['coupler-move', afterMove], ['coupler-input', afterInput], ['coupler-remove', afterRemove]]) {
    assert.ok(at > 0, '缺 ' + name + ' 事务调用');
    const seg = peSrc.slice(at, at + 600);
    assert.ok(/ppRefreshTLAfterCuts/.test(seg), name + ' 事务成功后必须补 ppRefreshTLAfterCuts 重投影 dd.couplerNodes');
  }
  // 交互画布（2D context）必须画节点（描边 #b45309）；施工图快照 SVG 带 data-pp-coupler
  assert.ok(/ppCtx\.strokeStyle='#b45309'/.test(peSrc), 'ppRender 交互画布缺节点绘制（2D context）');
  assert.ok(/data-pp-coupler=/.test(peSrc), '施工图快照 SVG 缺 data-pp-coupler 节点标记');
});
