'use strict';
/* [v251] AI 灌溉方案规划 · 解析/校验/导出文本 纯函数单测（无浏览器依赖）
   运行：node tests/ai_plan.test.cjs */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const api = require(path.join(__dirname, '..', 'runye-ai-plan.js'));
const P = api.parse, V = api.validate, BP = api.buildPrompt, SH = api.schemaHint, C = api.collect;

function fixture() {
  globalThis.measuredPolygon = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 }, { x: 0, y: 100 }];
  globalThis.measuredArea = 12000;
  return { area_m2: 12000, mu: 18 };
}
function good(extra) {
  return Object.assign({
    version: 1,
    design: { tape_spacing: 0.7, emitter_spacing: 0.3, emitter_flow: 0.8, zone_mu: 18, main_pipe_od: 160, branch_pipe_od: 90 },
    remark: '辣椒地块，按 18 亩一区',
    risks: ['末端压力偏低，建议加大支管']
  }, extra || {});
}

test('valid plan parses and keeps required design values', () => {
  const r = P(JSON.stringify(good()));
  assert.equal(r.ok, true);
  assert.equal(r.plan.design.tape_spacing, 0.7);
  assert.equal(r.plan.design.emitter_flow, 0.8);
  assert.equal(r.plan.remark, '辣椒地块，按 18 亩一区');
  assert.deepEqual(r.plan.risks, ['末端压力偏低，建议加大支管']);
});

test('markdown fenced json and surrounding prose are tolerated', () => {
  const fenced = '好的，方案如下：\n```json\n' + JSON.stringify(good()) + '\n```\n说明完毕。';
  assert.equal(P(fenced).ok, true);
  assert.equal(P('前缀说明 ' + JSON.stringify(good()) + ' 后缀说明').ok, true);
});

test('empty or broken json is reported as a format error in Chinese', () => {
  assert.equal(P('').kind, 'format');
  assert.match(P('').msg, /导入内容为空/);
  const bad = P('{"design":{"tape_spacing":0.7,}}');
  assert.equal(bad.kind, 'format');
  assert.match(bad.msg, /JSON 格式错误/);
  assert.equal(P('[1,2,3]').kind, 'format');
});

test('missing required fields are reported as incomplete parameters', () => {
  const r = V({ design: { emitter_spacing: 0.3 } });
  assert.equal(r.kind, 'missing');
  assert.match(r.msg, /AI 方案参数不全/);
  assert.deepEqual(r.missing, ['滴灌带间距', '滴头流量']);
});

test('out-of-range values are rejected and name the offending parameters', () => {
  const r = V(good({ design: { tape_spacing: 12, emitter_spacing: 0.3, emitter_flow: 0.8 } }));
  assert.equal(r.kind, 'range');
  assert.match(r.msg, /超出工程合理范围/);
  assert.match(r.msg, /滴灌带间距 12 m/);
  assert.equal(V(good({ design: { tape_spacing: 0.7, emitter_spacing: 0.3, emitter_flow: 99 } })).kind, 'range');
  assert.equal(V(good({ design: { tape_spacing: 0.7, emitter_spacing: 0.3, emitter_flow: 0.8, zone_mu: 0.01 } })).kind, 'range');
});

test('optional fields fall back and advisory pipe sizes only warn', () => {
  const r = V({ design: { tape_spacing: 0.7, emitter_spacing: 0.3, emitter_flow: 0.8 } });
  assert.equal(r.ok, true);
  assert.equal(r.plan.design.zone_mu, undefined);
  const w = V(good({ design: { tape_spacing: 0.7, emitter_spacing: 0.3, emitter_flow: 0.8, main_pipe_od: 5000 } }));
  assert.equal(w.ok, true);
  assert.match(w.plan.warnings.join(''), /主管外径/);
});

test('chinese and camelCase aliases resolve to the same design fields', () => {
  const r = V({ design: { 滴灌带间距: 0.6, 滴孔间距: 0.25, 滴头流量: 1.2, 单区亩数: 15 } });
  assert.equal(r.ok, true);
  assert.equal(r.plan.design.tape_spacing, 0.6);
  assert.equal(r.plan.design.emitter_flow, 1.2);
  assert.equal(r.plan.design.zone_mu, 15);
});

test('collect reads geometry without inferring slope from source elevation', () => {
  fixture();
  const c = C();
  assert.equal(c.poly.length, 4);
  assert.equal(c.area_m2, 12000);
  assert.equal(c.mu, 18);
  assert.equal(c.bbox_w, 120);
  assert.equal(c.bbox_h, 100);
  assert.equal(c.slope_percent, null);
});

test('export text carries polygon coordinates, area, terrain and the requirement', () => {
  fixture();
  const t = BP('辣椒地块，主管160PE，支管90PE，滴灌带间距0.7m');
  assert.match(t, /\(120\.0,100\.0\)/);
  assert.match(t, /12000\.0 m²（18\.00 亩）/);
  assert.match(t, /辣椒地块，主管160PE/);
  assert.match(t, /地形高差/);
  assert.match(t, /只输出一个 JSON 对象/);
  assert.match(t, /"tape_spacing"/);
});

test('schema hint lists every required key used by the parser', () => {
  const h = SH();
  api.FIELDS.filter(f => f.required).forEach(f => assert.match(h, new RegExp('"' + f.key + '"')));
});

test('export text degrades gracefully when no plot is drawn', () => {
  globalThis.measuredPolygon = null; globalThis.measuredArea = 0; globalThis.ppState = null;
  const c = C();
  assert.equal(c.poly.length, 0);
  assert.equal(c.area_m2, 0);
  assert.match(BP(''), /未测量/);
});
