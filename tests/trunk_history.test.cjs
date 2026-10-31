'use strict';
/* 撤销 / 重做栈契约（四期）。
 *
 * 这个模块最容易出的错不是"算错"，而是**数据域串了**，所以断言分两类：
 *
 *   A. 语义正确性
 *      ① 快照只含 {trunk, activeTrunkId} —— 多带一个键（polyLatLng / revision）
 *         就意味着"撤销会把别的域一起顶回去"。
 *      ② 深度克隆：改返回值的对象不能影响栈里的历史（否则一次误改会污染整摞历史）。
 *      ③ 在历史中间做新编辑要砍掉重做分支（标准 undo 语义），不能出现分叉的两条未来。
 *
 *   B. 与现实对齐（这一类比 A 类更容易漏，漏了表现为"撤销跳回别的状态"）
 *      ④ 第一次 record 必须自动把 before 当基线 —— 否则第 1 步撤销无处可去。
 *      ⑤ 栈顶与"写库前真实值"不一致时必须就地重开（别的标签页改过 / 换了地块）。
 *      ⑥ 换地块必须清空：否则撤销会把 A 块的状态写到 B 块上。
 *      ⑦ 超限丢最旧，栈长度不随点击次数无限增长。
 *      ⑧ undefined 与 null 视为同一件事（都表示"没有总管"）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'mod', 'trunk-history.js');

function loadHistory() {
  const src = fs.readFileSync(SRC, 'utf8');
  const win = {};
  /* 同 realm 执行（不要用 vm.runInNewContext）：跨 realm 原型不同，
     deepStrictEqual 会报 "same structure but not reference-equal"，看着像数据错。 */
  const fn = new Function('window', src + '\nreturn window.RyTrunkHistory;');
  return fn(win);
}

const H = loadHistory();

function mkTrunk(ids) {
  return {
    schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 1,
    trunks: (ids || ['T1']).map((id, i) => ({
      id, main: i === 0,
      points: [[18.25 + i * 0.001, 109.52], [18.2505 + i * 0.001, 109.521]],
      params: { material: 'PE', dn: 63, designFlow: 10 }
    }))
  };
}

test('① 快照只含 trunk + activeTrunkId，不带 polyLatLng / revision 以外的任何域', () => {
  const h = H.create();
  const before = null;
  const after = mkTrunk(['T1']);
  h.record({ plotId: 'p1', before, after, activeTrunkId: 'T1' });
  const step = h.undo();
  assert.equal(step.ok, true);
  /* 撤销拿到的是 before（没有总管） */
  assert.deepEqual(Object.keys(step.state).sort(), ['activeTrunkId', 'trunk']);
  assert.equal(step.state.trunk, null);
  const back = h.redo();
  assert.equal(back.ok, true);
  /* 快照里的 trunk 是**原样**存进来的，模块不往里加字段（尤其不加 revision 之外的元数据） */
  assert.deepEqual(Object.keys(back.state.trunk).sort(), ['coordinateSystem', 'revision', 'schema', 'source', 'trunks']);
});

test('② 深度克隆：改返回值不影响历史', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: mkTrunk(['T1']), after: mkTrunk(['T1', 'T2']) });
  const step = h.undo();
  step.state.trunk.trunks.push({ id: 'HACK' });
  step.state.trunk.trunks[0].params.dn = 999;
  const again = h.redo();
  assert.equal(again.state.trunk.trunks.length, 2);
  const h2 = h.undo();
  assert.equal(h2.state.trunk.trunks.length, 1);
  assert.equal(h2.state.trunk.trunks[0].params.dn, 63);
});

test('③ 在历史中间做新编辑 ⇒ 砍掉重做分支', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: mkTrunk(['A']), after: mkTrunk(['A', 'B']) });
  h.record({ plotId: 'p1', before: mkTrunk(['A', 'B']), after: mkTrunk(['A', 'B', 'C']) });
  assert.equal(h.stats().size, 3);
  assert.equal(h.stats().canRedo, false);
  h.undo();                                   // 回到 [A,B]
  assert.equal(h.stats().canRedo, true);
  h.record({ plotId: 'p1', before: mkTrunk(['A', 'B']), after: mkTrunk(['A', 'B', 'X']) });
  const s = h.stats();
  assert.equal(s.size, 3, '重做分支应被砍掉，栈不应变成 4');
  assert.equal(s.canRedo, false);
  assert.equal(h.undo().state.trunk.trunks.map(t => t.id).join(','), 'A,B');
});

test('④ 第一次 record 自动把 before 当基线（第 1 步撤销有处可去）', () => {
  const h = H.create();
  assert.equal(h.stats().size, 0);
  h.record({ plotId: 'p1', before: mkTrunk(['T1']), after: mkTrunk(['T1', 'T2']), activeTrunkId: 'T2' });
  const s = h.stats();
  assert.equal(s.size, 2, '基线 + 新状态');
  assert.equal(s.cursor, 1);
  assert.equal(s.canUndo, true);
  const step = h.undo();
  assert.equal(step.ok, true);
  assert.equal(step.state.trunk.trunks.length, 1);
  assert.equal(h.stats().canUndo, false, '回到基线后不能再撤');
});

test('⑤ 栈顶与"写库前真实值"不一致 ⇒ 就地重开（别的标签页改过）', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: mkTrunk(['T1']), after: mkTrunk(['T1', 'T2']) });
  assert.equal(h.stats().size, 2);
  /* 模拟别的页面把库改成了三条：此时 before 是三条，和栈顶（两条）对不上 */
  h.record({ plotId: 'p1', before: mkTrunk(['T1', 'T2', 'T9']), after: mkTrunk(['T1', 'T2', 'T9', 'T3']) });
  const s = h.stats();
  assert.equal(s.size, 2, '应就地重开，而不是硬接在旧栈上变成 3');
  const step = h.undo();
  assert.equal(step.state.trunk.trunks.length, 3, '撤销应回到"真实前值"3 条，不是旧的 2 条');
});

test('⑥ 换地块必须清空（否则撤销会写到别的块上）', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: mkTrunk(['T1']), after: mkTrunk(['T1', 'T2']) });
  assert.equal(h.stats().canUndo, true);
  h.clear();
  assert.equal(h.stats().size, 0);
  assert.equal(h.stats().canUndo, false);
  assert.equal(h.undo().ok, false);
  /* 清空后 record 换一块地：栈里不许残留 p1 的快照 */
  h.record({ plotId: 'p2', before: null, after: mkTrunk(['B1']) });
  assert.equal(h.stats().plotId, 'p2');
  assert.equal(h.stats().size, 2);
  assert.equal(h.undo().state.trunk, null);
});

test('⑥b plotId 变了但没调 clear：record 也要自愈，不许跨块串', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: null, after: mkTrunk(['T1']) });
  h.record({ plotId: 'p2', before: null, after: mkTrunk(['B1']) });
  const s = h.stats();
  assert.equal(s.plotId, 'p2');
  assert.equal(s.size, 2, '换块后必须只剩新块的两格');
  assert.equal(h.undo().state.trunk, null, '撤销回到 p2 的"没有总管"');
});

test('⑦ 超限丢最旧，栈长不随点击次数增长', () => {
  const h = H.create({ limit: 5 });
  let cur = mkTrunk(['T0']);
  for (let i = 1; i <= 20; i++) {
    const nxt = mkTrunk(Array.from({ length: i + 1 }, (_, k) => 'T' + k));
    h.record({ plotId: 'p1', before: cur, after: nxt });
    cur = nxt;
  }
  const s = h.stats();
  assert.equal(s.limit, 5);
  assert.equal(s.size, 5, '栈长必须被 limit 卡住');
  assert.ok(s.dropped > 0, '应有旧快照被丢弃');
  assert.equal(s.canUndo, true);
  /* 能连撤 4 步（5 格 → 4 次） */
  let n = 0;
  while (h.undo().ok) n++;
  assert.equal(n, 4);
  assert.equal(h.stats().canUndo, false);
});

test('⑦b limit 小于 2 时回落默认值（防止有人传 0 把功能关死）', () => {
  assert.equal(H.create({ limit: 0 }).LIMIT, H.LIMIT);
  assert.equal(H.create({ limit: 1 }).LIMIT, H.LIMIT);
  assert.equal(H.create({ limit: 'x' }).LIMIT, H.LIMIT);
  assert.equal(H.create({ limit: 12 }).LIMIT, 12);
});

test('⑧ undefined 与 null 视为同一件事（都表示"没有总管"）', () => {
  assert.equal(H.same(undefined, null), true);
  assert.equal(H.norm(undefined), null);
  const h = H.create();
  /* before=undefined（地块从没存过 trunk）→ 基线是 null */
  h.record({ plotId: 'p1', before: undefined, after: mkTrunk(['T1']) });
  assert.equal(h.undo().state.trunk, null);
});

test('⑨ 内容没变不入栈（点保存但什么都没改，不该占一步撤销）', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: mkTrunk(['T1']), after: mkTrunk(['T1']) });
  const s = h.stats();
  assert.equal(s.size, 1, '只有基线一格');
  assert.equal(s.canUndo, false);
});

test('⑩ 空栈时 undo/redo 都返回 ok:false（调用方据此不写库）', () => {
  const h = H.create();
  assert.deepEqual(h.undo(), { ok: false, reason: 'empty' });
  assert.deepEqual(h.redo(), { ok: false, reason: 'empty' });
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
});

test('⑪ 撤到底之后再 redo 能一路回到最新（游标单调，不丢状态）', () => {
  const h = H.create();
  h.record({ plotId: 'p1', before: mkTrunk(['A']), after: mkTrunk(['A', 'B']) });
  h.record({ plotId: 'p1', before: mkTrunk(['A', 'B']), after: mkTrunk(['A', 'B', 'C']) });
  assert.equal(h.undo().state.trunk.trunks.length, 2);
  assert.equal(h.undo().state.trunk.trunks.length, 1);
  assert.equal(h.undo().ok, false);
  assert.equal(h.redo().state.trunk.trunks.length, 2);
  assert.equal(h.redo().state.trunk.trunks.length, 3);
  assert.equal(h.redo().ok, false);
  /* 连续 undo→redo 不改变栈长度 */
  assert.equal(h.stats().size, 3);
});
