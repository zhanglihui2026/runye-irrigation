const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../irrigation-bridge.js'), 'utf8');
function boot(library = []) {
  const storage = new Map([
    ['runye_plot_library', JSON.stringify(library)],
    ['runye_db_v1', JSON.stringify({ lands: [] })]
  ]);
  const context = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    location: { search: '', href: '' },
    document: { readyState: 'loading', addEventListener() {} },
    console: { warn() {} }, atShowToast() {}, setTimeout() {},
    currentPlotId: 'current', measuredArea: 666.67
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, read: key => JSON.parse(storage.get(key)) };
}

test('指定地块的亩数和平方米均来自该地块', () => {
  const { context, read } = boot([{ id: 'other', name: '另一块田', mu: 2, sqm: 1333.34 }]);
  assert.equal(context.runyeOpenDigitalAgriculture('other'), true);
  const plot = read('runye_digital_bridge_v1').plot;
  assert.equal(plot.areaMu, 2);
  assert.equal(plot.areaSqm, 1333.34);
  assert.equal(context.location.href, 'digital-agriculture/index.html?plotId=other');
});

test('只有亩数的指定地块不混入当前画布平方米', () => {
  const { context, read } = boot([{ id: 'other', name: '另一块田', mu: 2 }]);
  assert.equal(context.runyeOpenDigitalAgriculture('other'), true);
  assert.equal(read('runye_digital_bridge_v1').plot.areaSqm, undefined);
});

test('找不到指定地块时拒绝使用其他地块的面积', () => {
  const { context } = boot();
  assert.equal(context.runyeOpenDigitalAgriculture('missing'), false);
  assert.equal(context.location.href, '');
});

test('尚未入库的当前画布仍可带入数字农业', () => {
  const { context, read } = boot();
  assert.equal(context.runyeOpenDigitalAgriculture(), true);
  assert.equal(read('runye_digital_bridge_v1').plot.areaMu, 1);
});

for (const fields of [{ mu: 2, sqm: 1333.34 }, { areaMu: 2, areaSqm: 1333.34 }]) {
  test('回写兼容面积字段 ' + Object.keys(fields).join('/'), () => {
    const { context, read } = boot();
    context.runyeBridgeWriteBack('p1', { id: 'p1', name: '测试田', ...fields });
    context.runyeBridgeWriteBack('p1', { id: 'p1', name: '测试田', ...fields });
    const lands = read('runye_db_v1').lands;
    assert.equal(lands.length, 1);
    assert.equal(lands[0].area, 2);
    assert.equal(lands[0].geo_json.sqm, 1333.34);
  });
}

test('同步保留新旧协议和种植日期', () => {
  const { context, read } = boot([{ id: 'current', name: '当前田', plantingDate: '2026-09-01' }]);
  context.runyeSharePlotToDigital();
  assert.equal(read('runyePlotData').mu, 1);
  assert.equal(read('runye_digital_bridge_v1').plot.areaMu, 1);
  assert.equal(read('runye_digital_bridge_v1').plot.plantingDate, '2026-09-01');
});
