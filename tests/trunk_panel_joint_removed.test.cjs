'use strict';
/* tests/trunk_panel_joint_removed.test.cjs —— 总管参数设置面板「联合复核」整块取消（v965）
 *
 * 用户 2026-11-04 两次点名：「总管参数设置面板中，联合复核的内容取消，损失拆分保留。」（v959）
 * → 一周后拿着截图再问：「红框的内容我说取消掉得了，之前就让你取消，你怎么没有取消掉？」
 *
 * v959 只删了块底部那段说明文字（`合计 = 总管 + 主管 + 支管…`），块本体（标题「联合复核」、
 * 「总管」信息行、「下游」段数行、复核结论文案）都还在 —— 用户看到的红框里全是这些。
 * 本文件钉住「这一次是真删干净」，并且钉住**删的时候别把损失拆分带走**（两者共用
 * `.tp-jt-row` 一套排版，误删一个标签整节就空了）：
 *
 *   ① DOM：只剩 #tpLossRows；#tpJoint / #tpJointRows / #tpJointChecks / #tpJointNote 全不许在；
 *   ② 文案：剥掉注释后「联合复核」「总管 + 下游分区管网」出现 0 次（注释里留恢复说明是允许的）；
 *   ③ 渲染：paintLoss 在、paintJoint 不在、不再调 jointReview（下游快照的取数也一起停）;
 *   ④ 损失拆分六行齐全（总管 / 主管 / 支管 / 合计损失 / 管路总长 / 三级页扬程）；
 *   ⑤ CSS：联合复核专用的 7 条选择器全删，但 `.tp-jt-row>span` 的 52px/nowrap 必须留着。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-panel.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'mod', 'online-map.css'), 'utf8');
/* 剥注释再断言：v957/v959 两次被自己写的注释咬到（注释里抄了要删的原文/选择器） */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const js = strip(JS);
const css = strip(CSS);

test('① DOM 只剩 #tpLossRows（四个联合复核节点一个都不许留）', () => {
  assert.ok(/id="tpLossRows"/.test(js), '损失拆分的容器 #tpLossRows 必须在');
  ['tpJoint', 'tpJointRows', 'tpJointChecks', 'tpJointNote'].forEach((id) => {
    assert.equal(js.includes(id), false, '#' + id + ' 必须删干净（不许留 display:none 死节点）');
  });
});

test('② 渲染路径里「联合复核」「总管 + 下游分区管网」出现 0 次', () => {
  /* 只看**面板 DOM 与渲染函数**这一段（从 #tpLossRows 的静态标记到文件末尾）。
     `jointReview()` 那个纯函数本体保留着（它是 designBlock 与下游段统计的单测入口，
     v842 双重计数那个坑就靠它锚着），它内部的结论文案自然还带这个词 —— 但它已经不在
     渲染路径上（③ 锁着），所以不参与本条。 */
  const ui = js.slice(js.indexOf('id="tpLossRows"'));
  assert.ok(ui.length > 2000, '切片没取到面板渲染段（锚点变了就改这里，别放宽断言）');
  assert.equal((ui.match(/联合复核/g) || []).length, 0, '渲染路径里不许再有「联合复核」字样');
  assert.equal(ui.includes('总管 + 下游分区管网'), false, '副标题「总管 + 下游分区管网」也要一起删');
});

test('③ 渲染函数换成 paintLoss：不调 jointReview、不取下游快照', () => {
  assert.ok(/function paintLoss\(/.test(js), '必须有 paintLoss（损失拆分的渲染函数）');
  assert.equal(js.includes('function paintJoint('), false, 'paintJoint 必须改名/删除');
  assert.equal(/paintJoint\(/.test(js), false, '不许还有地方调 paintJoint（改名漏了调用点会白屏）');
  /* 面板不再展示下游对照 ⇒ 逐帧取 layout 快照、算结论文案都该停（不然是白算一遍）。
     只禁**调用**：纯函数定义与导出要留着给单测当口径锚点。 */
  assert.equal(/jointReview\(\s*curEntry/.test(js), false, '面板渲染不许再调 jointReview');
  assert.equal(/=\s*jointReview\(/.test(js), false, '也不许有别的调用点');
  assert.equal(js.includes('opts.getLayout'), false, '渲染路径不再需要下游快照');
  assert.ok(/designBlock\(design\)/.test(js), '损失拆分的数字仍必须来自 designBlock（三级页同源，不另算）');
});

test('④ 损失拆分六行齐全（删联合复核时最容易连坐的就是这几行）', () => {
  const loss = js.slice(js.indexOf('function paintLoss('));
  ['总管', '主管', '支管', '合计损失', '管路总长', '三级页扬程'].forEach((label) => {
    assert.ok(loss.includes('<span>' + label + '</span>'), '损失拆分缺了「' + label + '」行');
  });
  assert.ok(loss.includes('tp-jt-sum'), '合计损失行仍要单独加粗（.tp-jt-sum）');
  assert.ok(loss.includes('地图实测'), '总管长度来源标签仍是「地图实测」（v956 用户口径）');
});

test('⑤ CSS：联合复核的 7 条选择器删净，排版用的 52px/nowrap 保留', () => {
  ['.tp-joint{', '.tp-jt-h{', '.tp-jt-sub{', '.tp-jt-checks{', '.tp-jt-check{',
    '.tp-jt-check:before{', '.tp-jt-note{', '.tp-jt-sep{'].forEach((sel) => {
    assert.equal(css.includes(sel), false, '样式 ' + sel + ' 是联合复核专用的，应随 DOM 一起删');
  });
  const rule = css.slice(css.indexOf('.tp-jt-row>span{'));
  assert.ok(/flex:0 0 52px/.test(rule.slice(0, 200)), '.tp-jt-row>span 的 52px 标签列必须保留（v954 的口径）');
  assert.ok(/white-space:nowrap/.test(rule.slice(0, 200)), '标签 nowrap 必须保留');
  assert.ok(css.includes('.tp-jt-nw{white-space:nowrap}'), '.tp-jt-nw 是值片段 nowrap，仍被损失拆分使用');
});
