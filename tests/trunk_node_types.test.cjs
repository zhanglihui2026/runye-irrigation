'use strict';
/* tests/trunk_node_types.test.cjs —— 拐点节点类型 + 显示编号（四期新增的两个参数域）
 *
 * 这两样都落在 entry.params 里，而 params 的口径是「保留对方给的全部字段」。
 * 也就是说：写错了不会报错、不会崩，只会**安静地少一条标记**或**编号重复**。
 * 所以这里逐条钉住：
 *   ① nodeTypes 的下标必须落在点数范围内 —— 打断/删点之后旧下标会越界。
 *   ② plain 不落库（它等于"没标记"，存进去只会让 normalize 越来越啰嗦）。
 *   ③ 水源进水口**全方案唯一**（规格四），跨干线也只留第一个，且顺序必须确定。
 *   ④ code 是显示字符串：trim + 截断；而 id 是引用键，绝不能被 code 影响。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'trunk-schema.js'), 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win.RyTrunkSchema;
}

function twoTrunks() {
  return {
    schema: 2, source: 'map', coordinateSystem: 'GCJ-02', revision: 3,
    trunks: [
      { id: 'T1', main: true, points: [[30, 120], [30, 121], [30, 122]], params: { material: 'PE' } },
      { id: 'T2', main: false, points: [[31, 120], [31, 121]], params: { material: 'PVC-U' } }
    ]
  };
}

test('① normalizeNodeTypes：只认 source/tee，丢弃 plain 与非数字键', () => {
  const S = load();
  const nt = S.normalizeNodeTypes({ 0: 'source', 1: 'tee', 2: 'plain', abc: 'tee', '-1': 'tee' }, 4);
  assert.deepEqual(nt, { 0: 'source', 1: 'tee' });
  assert.equal(S.normalizeNodeTypes({ 0: 'plain' }), null, '全是 plain 等于没标记');
  assert.equal(S.normalizeNodeTypes(null), null);
  assert.equal(S.normalizeNodeTypes('x'), null);
});

test('② 越界下标必须被丢：打断/删点后旧标记指向的拐点已经不存在', () => {
  const S = load();
  assert.deepEqual(
    S.normalizeNodeTypes({ 0: 'tee', 5: 'tee' }, 3),
    { 0: 'tee' },
    '3 个点的线，下标 5 必须被丢掉'
  );
  /* 不传 count 时只做类型校验（给"还没算点数"的调用方留口子） */
  assert.deepEqual(S.normalizeNodeTypes({ 5: 'tee' }), { 5: 'tee' });
});

test('③ 单条线内多标水源：只留第一个（按键序，结果确定）', () => {
  const S = load();
  const nt = S.normalizeNodeTypes({ 3: 'source', 1: 'source' }, 5);
  assert.deepEqual(nt, { 1: 'source' }, '保留下标最小的那个，不能"每次读出来换一个人"');
});

test('④ normalize 跨干线只留第一个水源（全方案唯一）', () => {
  const S = load();
  const raw = twoTrunks();
  raw.trunks[0].params.nodeTypes = { 0: 'source', 1: 'tee' };
  raw.trunks[1].params.nodeTypes = { 1: 'source' };
  const t = S.normalize(raw);
  assert.deepEqual(t.trunks[0].params.nodeTypes, { 0: 'source', 1: 'tee' });
  assert.equal(t.trunks[1].params.nodeTypes, undefined, '第二条线的水源必须被摘掉');
  /* 摘干净之后不该留 { } 空壳 */
  assert.ok(!('nodeTypes' in t.trunks[1].params));
});

test('⑤ 越界 nodeTypes 在 entry 归一阶段就被清掉，不留空对象', () => {
  const S = load();
  const raw = twoTrunks();
  raw.trunks[1].params.nodeTypes = { 9: 'tee' };   // T2 只有 2 个点
  const t = S.normalize(raw);
  assert.ok(!('nodeTypes' in t.trunks[1].params), '越界的唯一标记被丢掉后应整个字段消失');
});

test('⑥ normalizeCode：trim + 压空白 + 截断 24 字，非字符串给空串', () => {
  const S = load();
  assert.equal(S.normalizeCode('  ZG-001  '), 'ZG-001');
  assert.equal(S.normalizeCode('ZG   002'), 'ZG 002');
  assert.equal(S.normalizeCode('x'.repeat(40)).length, 24);
  assert.equal(S.normalizeCode(null), '');
  assert.equal(S.normalizeCode(123), '123', '允许数字编号（老数据里可能是数）');
});

test('⑦ code 绝不参与 id：改编号不会换 id', () => {
  const S = load();
  const raw = twoTrunks();
  raw.trunks[0].params.code = ' ZG-009 ';
  const t = S.normalize(raw);
  assert.equal(t.trunks[0].id, 'T1', 'id 是引用键，不能被用户可改的编号顶掉');
  assert.equal(t.trunks[0].params.code, 'ZG-009');
});

test('⑧ makeCode：ZG-001 起、避让已占用的号、不跳号', () => {
  const S = load();
  assert.equal(S.makeCode(null), 'ZG-001');
  const raw = twoTrunks();
  raw.trunks[0].params.code = 'ZG-001';
  raw.trunks[1].params.code = 'ZG-003';
  assert.equal(S.makeCode(raw), 'ZG-002', '补空位而不是接最大号');
  raw.trunks[1].params.code = 'ZG-002';
  assert.equal(S.makeCode(raw), 'ZG-003');
});

test('⑨ 未知参数照旧透传（别为了加 code 把别人的字段白名单化吃掉）', () => {
  const S = load();
  const p = S.normalizeParams({ material: 'PE', code: 'ZG-010', labels: { 1: 'x' }, burialDepth: 0.8 });
  assert.equal(p.code, 'ZG-010');
  assert.deepEqual(p.labels, { 1: 'x' });
  assert.equal(p.burialDepth, 0.8, '新字段必须原样活着 —— 这是 params 的核心约定');
});

test('⑩ v1 老数据升级后仍然没有 nodeTypes/code（不给历史数据凭空造标记）', () => {
  const S = load();
  const t = S.normalize({ schema: 1, points: [[30, 120], [30, 121]] });
  assert.equal(t.schema, 2);
  assert.equal(t.trunks[0].id, 'T1');
  assert.ok(!('nodeTypes' in t.trunks[0].params));
  assert.ok(!('code' in t.trunks[0].params));
  assert.equal(t.trunks[0].params.material, 'PE');
});
