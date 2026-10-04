/* _p1/_inj_v214_btnshape.cjs · [v214] 按钮形状统一 注入体检
 *
 * 纪律：改完全绿 ≠ 闸门有效。逐条把圆角改回原样 / 只改一半 / 改过头，
 * 断言**指定编号精确变红**才算拦得住。
 * 6 例：4 例「没改到」（按钮/chip/菜单项/徽标各留一处）+ 2 例「改过头」（容器、圆点被误伤）。
 */
'use strict';
const path = require('path');
const { runCases } = require('./_inj_harness.cjs');

const WS = path.resolve(__dirname, '..');
runCases({
  ws: WS,
  src: '管路接驳拼装.html',
  script: '_p1/_shot_v214_btnshape.cjs',
  basePort: 9750,
  cases: [
    { n: 'B1 按钮圆角还是 8px（没真改）→ ①/①b',
      from: 'font-size:11.5px;font-weight:600;padding:0 8px;border-radius:0;cursor:pointer;',
      to: 'font-size:11.5px;font-weight:600;padding:0 8px;border-radius:8px;cursor:pointer;', red: ['①'] },
    { n: 'B2 只改按钮、漏改右栏 chip → ④',
      from: 'border:1px solid rgba(31,41,55,.22);background:#fff;border-radius:0;padding:3px 8px;font-size:11px;',
      to: 'border:1px solid rgba(31,41,55,.22);background:#fff;border-radius:6px;padding:3px 8px;font-size:11px;', red: ['④'] },
    { n: 'B3 只改按钮、漏改右键菜单条目 → ⑥',
      from: 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:0;cursor:pointer;',
      to: 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;', red: ['⑥'] },
    { n: 'B4 状态徽标仍是 999px 纯胶囊 → ⑦',
      from: 'font-size:11px;font-weight:700;padding:3px 10px;border-radius:0;',
      to: 'font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;', red: ['⑦'] },
    { n: 'B5 改过头：工具条容器也被削成直角 → ⑨',
      from: 'border-radius:8px;padding:6px 8px;box-shadow:0 2px 8px rgba(15,23,42,.06);z-index:5;',
      to: 'border-radius:0;padding:6px 8px;box-shadow:0 2px 8px rgba(15,23,42,.06);z-index:5;', red: ['⑨'] },
    { n: 'B6 改过头：圆点指示灯被削成方块 → ⑧',
      from: '.pa-status .dot{width:7px;height:7px;border-radius:50%;',
      to: '.pa-status .dot{width:7px;height:7px;border-radius:0;', red: ['⑧'] },
  ]
}).then((r) => { process.exitCode = r.bad ? 1 : 0; });
