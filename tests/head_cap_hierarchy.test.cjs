const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync(require('node:path').join(__dirname, '../mod/inline-09.js'), 'utf8');
const start = src.indexOf('window.tlHeadCapAdvice = function');
const end = src.indexOf('/* [v945] 总管口径反推', start);
assert(start >= 0 && end > start);

function fixture() {
  let trunkOd = 200, revision = 3, forceFailure = false, forceVelocity = false, branchVelocity = 1.4;
  const cals = { 'main-0': 225, 'main-1': 250 };
  const routes = [
    { zi: 0, mainSegs: [{ key: 'main:0' }] },
    { zi: 1, mainSegs: [{ key: 'main:0' }, { key: 'main:1' }] }
  ];
  const ae = {
    allPids: () => ['main-0', 'main-1', 'branch-0', 'branch-1'],
    effPts: () => [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    pipePts: () => [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    polylineLen: () => 10,
    geometryKey: () => 'geometry-1',
    caliberOf: pid => cals[pid] || null,
    beginBatch() {}, endBatch() {},
    setCaliber(pid, od) { cals[pid] = od; return true; },
    clearCaliber(pid) { delete cals[pid]; return true; }
  };
  const win = {
    RyTlAutoEdits: ae, tlDiagramData: {}, tlManualCals: { front: null },
    RyMapHost: { setTrunkOd(od) {
      if (typeof od === 'object') trunkOd = od.t1;
      else trunkOd = od;
      revision++;
      return { ok: true };
    } },
    tlMapGroupHydraulicsOf(_group, opts) {
      const trial = opts && opts.calibers || {};
      const front = trial.front || trunkOd;
      const main0 = trial['main-0'] || cals['main-0'];
      const main1 = trial['main-1'] || cals['main-1'];
      return { head: forceFailure && !opts.calibers ? 50 : 32 + (250 - front) * 0.08 +
        (250 - main0) * 0.07 + (250 - main1) * 0.06,
        estimated: false, zones: [{ zi: 0 }],
        pipes: { frontV: 1.2, mainV: forceVelocity && !opts.calibers ? 2.3 : 1.3, branchV: branchVelocity } };
    }
  };
  const ctx = {
    window: win,
    computeThreeLevel: () => ({ wp: { fromFigure: true, zones: routes }, inversePath: { calibers: { ...cals } },
      zoneAreas: [1, 1], frontLenSrc: 'mapTrunk', frontLenMap: 100,
      frontPipe: { od: 200 }, mainPipe: { od: 200 }, branchPipe: { od: 140 } }),
    tlMapTrunkLen: () => ({ ok: true, od: trunkOd, len: 100, plotId: 'plot-1',
      revision, dnById: { t1: trunkOd } }),
    tlSharedTrunkPick: () => ({ od: 200 }),
    tlPipePriceByOd: od => od * od,
    PE_OD_SERIES: [140, 160, 180, 200, 225, 250, 280, 315],
    MAIN_PIPE_MIN_OD: 90,   /* [v1100] 反推函数新增的物理下限，抽取式桩须显式提供 */
    tlBuildPipeOverride() {}
  };
  vm.runInNewContext(src.slice(start, end), ctx);
  return { win, cals, getTrunk: () => trunkOd, fail: () => { forceFailure = true; },
    speedUp: () => { forceVelocity = true; },
    branchSpeedUp: () => { branchVelocity = 2.5; } };
}

/* [v1100] 本测试只锁「逆向传播层级 + 应用失败回滚」两件事。
   上限取 32.05（略高于有序化后的 32 m）：留不出任何缩小余量，避免与新的「低于上限就缩小省钱」
   口径打架；想验证双向缩小请用 tests/head_cap_bidirectional.test.cjs。 */
const LIMIT = 32.05;
{
  const f = fixture();
  const advice = f.win.tlHeadCapAdvice(LIMIT, [[0, 1]]);
  assert.equal(advice.ok, true, JSON.stringify(advice));
  assert.equal(advice.changes.find(c => c.pid === 'front').to, 250);
  assert.equal(advice.changes.find(c => c.pid === 'main-0').to, 250);
  assert.equal(f.win.tlApplyHeadCapAdvice(advice), true);
  assert.equal(f.getTrunk(), 250);
  assert.equal(f.cals['main-0'], 250);
}
{
  const f = fixture();
  const advice = f.win.tlHeadCapAdvice(LIMIT, [[0, 1]]);
  f.fail();
  assert.equal(f.win.tlApplyHeadCapAdvice(advice), false);
  assert.equal(f.getTrunk(), 200);
  assert.equal(f.cals['main-0'], 225);
}
{
  const f = fixture();
  const advice = f.win.tlHeadCapAdvice(LIMIT, [[0, 1]]);
  f.speedUp();
  assert.equal(f.win.tlApplyHeadCapAdvice(advice), false, '应用前复核应拒绝主管新增超速');
  assert.equal(f.getTrunk(), 200);
  assert.equal(f.cals['main-0'], 225);
}
{
  const f = fixture();
  const advice = f.win.tlHeadCapAdvice(LIMIT, [[0, 1]]);
  f.branchSpeedUp();
  assert.equal(f.win.tlApplyHeadCapAdvice(advice), true, '支管超 2 m/s 不应阻止应用');
  assert.equal(f.getTrunk(), 250);
}
console.log('head cap hierarchy and rollback: ok');
