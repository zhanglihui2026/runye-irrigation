'use strict';
/* tests/trunk_warn.test.cjs —— 流速告警的判定（规格六）
 *
 * 这条链最容易出的错不是"算错"，而是"该响的时候不响 / 不该响的时候乱响"：
 *   ① 偏低（<0.8）也算"不经济"，但它不是水力风险 —— 塞进告警会让提示失去意义。
 *   ② 屏蔽字段只认严格 true：库里若存了 'true' / 1 / 'false' 这类脏值，
 *      按 falsy 判断会出现"我明明点了不再提醒，它还在弹"或反之。
 *   ③ 缺管径/流量时 v 是 null，**不能**被当成 0 去比档位（0 < 0.8 ⇒ 会误报"偏低"）。
 *   ④ 文案是规格原文，逐字比对 —— 以后有人顺手改标点，这条会立刻红。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadPanel() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'mod', 'trunk-panel.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win.RyTrunkPanel;
}

function loadSchema() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'trunk-schema.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win.RyTrunkSchema;
}

/* DN110 下让流速落在指定档位所需的流量（m³/h） */
function flowForV(v) {
  return v * (Math.PI * 0.11 * 0.11 / 4) * 3600;
}

function line(qh, extra) {
  return {
    id: 'T1', main: true,
    points: [[30, 120], [30, 121]],
    params: Object.assign({ material: 'PE', dn: 110, designFlow: qh }, extra || {})
  };
}

test('① 经济流速（0.8~2.0）不告警', () => {
  const P = loadPanel();
  const w = P.shouldWarn(line(flowForV(1.5)));
  assert.equal(w.warn, false);
  assert.equal(w.vLevel, 'good');
  assert.equal(w.muted, false);
});

test('② 偏高（2.0~3.0）与超标（>3.0）都告警', () => {
  const P = loadPanel();
  const hi = P.shouldWarn(line(flowForV(2.5)));
  assert.equal(hi.vLevel, 'warn');
  assert.equal(hi.warn, true);
  const bad = P.shouldWarn(line(flowForV(3.5)));
  assert.equal(bad.vLevel, 'bad');
  assert.equal(bad.warn, true);
});

test('③ 偏低（<0.8）**不**告警：那是选型浪费，不是水力风险', () => {
  const P = loadPanel();
  const w = P.shouldWarn(line(flowForV(0.4)));
  assert.equal(w.vLevel, 'low');
  assert.equal(w.warn, false);
});

test('④ 屏蔽只对单根生效：warnMuted=true ⇒ 该线不告警，其它线照旧', () => {
  const P = loadPanel();
  const muted = P.shouldWarn(line(flowForV(3.5), { warnMuted: true }));
  assert.equal(muted.warn, false);
  assert.equal(muted.muted, true);
  /* 同一份流速、没有屏蔽标记的另一条线必须还响 */
  const other = P.shouldWarn(line(flowForV(3.5)));
  assert.equal(other.warn, true);
});

test('⑤ warnMuted 只认严格 true：脏值一律当"没屏蔽"', () => {
  const P = loadPanel();
  ['true', 1, 'false', 0, '', null, {}].forEach(v => {
    const w = P.shouldWarn(line(flowForV(3.5), { warnMuted: v }));
    assert.equal(w.muted, false, 'warnMuted=' + JSON.stringify(v) + ' 不该被当成屏蔽');
    assert.equal(w.warn, true);
  });
});

test('⑥ 缺管径/流量时 v 为 null ⇒ 不告警（不能被当成 0 去比档位）', () => {
  const P = loadPanel();
  assert.equal(P.shouldWarn(line(30, { dn: null })).warn, false);
  assert.equal(P.shouldWarn(line(null)).warn, false);
  assert.equal(P.shouldWarn(line(30, { dn: 0 })).warn, false);
});

test('⑦ 文案是规格原文（逐字比对）', () => {
  const P = loadPanel();
  assert.equal(P.WARN_TEXT, '流速超过推荐经济流速，水头损失偏大，请复核管径或流量。');
  const w = P.shouldWarn(line(flowForV(3.5)));
  assert.equal(w.text, P.WARN_TEXT);
});

test('⑧ 可以传入已算好的 derived，避免重复计算（结果必须一致）', () => {
  const P = loadPanel();
  const e = line(flowForV(2.5));
  const d = P.compute(e);
  const a = P.shouldWarn(e, d);
  const b = P.shouldWarn(e);
  assert.deepEqual(a, b);
});

test('⑨ shouldWarn 不改入参（库里的对象不能被就地改）', () => {
  const P = loadPanel();
  const e = line(flowForV(3.5), { warnMuted: false });
  const before = JSON.stringify(e);
  P.shouldWarn(e);
  assert.equal(JSON.stringify(e), before);
});

test('⑩ schema：warnMuted 非 true 一律不落库，true 原样保留', () => {
  const S = loadSchema();
  assert.equal('warnMuted' in S.normalizeParams({ warnMuted: false }), false);
  assert.equal('warnMuted' in S.normalizeParams({ warnMuted: 'true' }), false);
  assert.equal('warnMuted' in S.normalizeParams({ warnMuted: 1 }), false);
  assert.equal(S.normalizeParams({ warnMuted: true }).warnMuted, true);
  /* 与其它字段互不影响 */
  const p = S.normalizeParams({ material: 'PVC-U', dn: 160, warnMuted: true, code: 'ZG-003' });
  assert.equal(p.warnMuted, true);
  assert.equal(p.material, 'PVC-U');
  assert.equal(p.code, 'ZG-003');
});

test('⑪ 端到端契约：存 true → normalize → shouldWarn 仍然是"已屏蔽"', () => {
  const P = loadPanel();
  const S = loadSchema();
  const raw = {
    schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 1,
    trunks: [{ id: 'T1', main: true, points: [[30, 120], [30, 121]],
      params: { material: 'PE', dn: 110, designFlow: flowForV(3.5), warnMuted: true } }]
  };
  const t = S.normalize(raw);
  const w = P.shouldWarn(t.trunks[0]);
  assert.equal(w.muted, true);
  assert.equal(w.warn, false);
});
