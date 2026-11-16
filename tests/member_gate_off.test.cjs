#!/usr/bin/env node
'use strict';
/* tests/member_gate_off.test.cjs —— [v1099] 会员限制脱钩（可逆）
 *
 * 用户原话（2026-11-16）：「现在软件需要注册会员才能使用一些特定功能，你先把会员限制摘除吧，
 * 后面等软件成熟了功能再加回来，你拆开，而不是不需要这个功能，后期还需要，所以不要删除
 * 代码跟逻辑，只是把会员限定脱开就行，后面需要我随时可以加回来。」
 *
 * 契约（两半必须同时成立，缺一即回归）：
 * ① 脱钩生效：MEMBER_GATE_ENABLED=false ⇒ can() 恒 true、access() 恒 'allowed'、
 *    ready() 恒 true、bindControl 不上锁（不再是 pending 死等 / denied 拦截）。
 * ② 逻辑未删：等级表、L1 阻断清单、canWith() 原规则、全部功能键都还在；
 *    把同一个文件里的 false 改成 true 重放 ⇒ 行为逐条回到脱钩前（本文件用替换源码重放来证明）。
 *
 * 为什么用「替换源码再 eval」而不是读一个导出常量：项目要求的是「一个开关就能加回来」，
 * 只断言常量值证明不了「改回 true 就真的恢复拦截」——旧契约的行为必须被真跑一遍。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'runye-entitle.js'), 'utf8');
const SWITCH = 'var MEMBER_GATE_ENABLED = false;';
const ALL = ['zone-split', 'ai-plan', 'pipe-layout', 'online-map',
  'drawing-export', 'bom-export', 'hydraulic-check', 'pro-others'];

/* 与 tests/entitle_flow.test.cjs 同口径的最小身份桩：无 token ⇒ 只走纯前端判定，
   不触发任何网络/DB；state 保持 null（复现「权益未同步」这一刻）。 */
function load(gateOn) {
  assert.ok(SRC.indexOf(SWITCH) >= 0, '总闸声明缺失：' + SWITCH);
  const src = gateOn ? SRC.replace(SWITCH, 'var MEMBER_GATE_ENABLED = true;') : SRC;
  const win = {
    CloudSync: { uid: 'u-1', phone: '13800138000', authSub: () => 'u-1', authToken: () => null, rdb: () => null },
    location: { search: '', hostname: 'localhost', protocol: 'file:', href: 'file:///index.html' }
  };
  const store = { getItem: () => null, setItem() {}, removeItem() {} };
  /* 不用 vm：跨 realm 的对象/数组原型不同，deepEqual 会误报（trunk_panel 同款教训）。 */
  const factory = new Function('window', 'location', 'localStorage', 'fetch', 'console',
    'window.location = location;\n' + src + '\nreturn window.RyEntitle;');
  return factory(win, win.location, store, undefined, { log() {}, warn() {}, error() {} });
}

function fakeEl() {
  const attrs = {}, classes = new Set();
  return {
    attrs, classes, textContent: '',
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; },
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      toggle(c, on) { if (on) classes.add(c); else classes.delete(c); },
      contains(c) { return classes.has(c); }
    }
  };
}

test('① 脱钩生效：can/access/ready 全放行，featureKeys 覆盖全部功能', () => {
  const E = load(false);
  assert.equal(E.gateEnabled(), false, '总闸必须处于关闭态');
  assert.equal(E.allFeaturesOpen(), true);
  ALL.forEach(f => {
    assert.equal(E.can(f), true, f + ' 应放行');
    assert.equal(E.access(f), 'allowed', f + ' 应 allowed');
  });
  assert.equal(E.ready(), true, '未同步也必须 ready（否则插件 gate() 会走拦截分支）');
  assert.deepEqual(E.featureKeys(), ALL);
  assert.equal(E.statusText(), '全功能开放', '胶囊文案不得再暗示试用/到期');
});

test('② 逻辑未删：等级表、L1 阻断清单、canWith 原规则保持原样', () => {
  const E = load(false);
  assert.deepEqual(E.PLAN_FEATURES.L1, ['zone-split', 'ai-plan', 'pipe-layout', 'online-map']);
  assert.equal(E.PLAN_FEATURES.L2.length, ALL.length);
  assert.deepEqual(E.PLAN_NAMES, { L1: '注册会员', L2: '高级会员' });
  /* canWith 是「如果门控回来，谁会被拦」的唯一事实源 —— 必须仍然拒绝 */
  ['drawing-export', 'bom-export', 'hydraulic-check', 'pro-others'].forEach(f => {
    assert.equal(E.canWith('L1', f), false, 'canWith(L1,' + f + ') 必须仍为 false');
    assert.equal(E.canWith('L2', f), true, 'canWith(L2,' + f + ') 必须是 true');
  });
  assert.equal(E.canWith('L2', 'pro-others'), true);
  /* L1 也不因为 features 数组被误配就拿到高级通配 */
  const keep = E.PLAN_FEATURES.L1;
  E.PLAN_FEATURES.L1 = ALL.slice();
  try {
    assert.equal(E.canWith('L1', 'pro-others'), false, 'L1 误配也不得拿到 pro-others 通配');
    assert.equal(E.canWith('L1', 'drawing-export'), false, 'L1 误配也不得拿到出图');
  } finally { E.PLAN_FEATURES.L1 = keep; }
});

test('③ 可逆：把同一个文件里的 false 改成 true 重放，逐条回到脱钩前', () => {
  const E = load(true);
  assert.equal(E.gateEnabled(), true, '翻转后总闸必须是开启态');
  assert.equal(E.allFeaturesOpen(), false);
  assert.equal(E.ready(), false, '未同步 ⇒ 不得 ready');
  ALL.forEach(f => assert.equal(E.access(f), 'pending', f + ' 应回到 pending'));
  assert.deepEqual(E.featureKeys(), ['zone-split', 'ai-plan', 'pipe-layout', 'online-map'],
    '翻转后 featureKeys 回到 L1 四项');
  assert.equal(E.statusText(), '会员 · 未同步');
});

test('④ bindControl：脱钩期不上锁，翻转后恢复锁定/等待态', () => {
  const off = load(false);
  const a = fakeEl();
  off.bindControl(a, 'drawing-export', '系统图导出');
  assert.equal(a.classes.has('fn-locked'), false, '脱钩期不得挂 fn-locked');
  assert.equal(a.classes.has('fn-pending'), false, '脱钩期不得挂 fn-pending');
  assert.equal(a.attrs['aria-disabled'], 'false');

  const on = load(true);
  const b = fakeEl();
  on.bindControl(b, 'drawing-export', '系统图导出');
  assert.equal(b.attrs['aria-disabled'], 'true', '翻转后未同步必须是禁用态');
  assert.equal(b.attrs['data-ry-pending'], 'true', '翻转后回到「正在同步会员权益」等待态');
});

test('⑤ 源码层：除总闸外没有第二处硬编码放行，且恢复说明在位', () => {
  assert.ok(/恢复会员限制：把下面这行 false 改回 true/.test(SRC), '必须留下「怎么加回来」的说明');
  /* 断言控制变量唯一：出现两个开关就说明有人复制了一份判定，将来会漂（注释里提到不算） */
  assert.equal((SRC.match(/^\s*(?:var\s+)?MEMBER_GATE_ENABLED\s*=/gm) || []).length, 1,
    'MEMBER_GATE_ENABLED 只能作为代码声明出现一次');
  assert.ok(/function memberGateOpen\(\)/.test(SRC), '判定出口 memberGateOpen 必须存在');
  /* 关键判定函数一个字都没被删 */
  ['can', 'canWith', 'access', 'ready', 'planName', 'featureKeys'].forEach(fn => {
    assert.ok(new RegExp('\\b' + fn + ': function').test(SRC), fn + ' 实现被删了（只允许脱钩，不允许删除）');
  });
});
