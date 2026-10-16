const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'runye-nav.js'), 'utf8');
const plugins = fs.readFileSync(path.join(root, 'plugins.json'), 'utf8');
const peanutRedirect = fs.readFileSync(path.join(root, 'peanut-tool.html'), 'utf8');
const agricultureRedirect = fs.readFileSync(path.join(root, '数字农业.html'), 'utf8');
const peanutSchedulePage = fs.readFileSync(path.join(root, 'digital-agriculture/qicai-huasheng/index.html'), 'utf8');
const pepperPage = fs.readFileSync(path.join(root, 'digital-agriculture/lajiao-zhibao/index.html'), 'utf8');
const oldPeanutSchedulePath = fs.readFileSync(path.join(root, 'qicai-huasheng/index.html'), 'utf8');
const oldPepperPath = fs.readFileSync(path.join(root, 'lajiao-zhibao/index.html'), 'utf8');
const oldDecisionPath = fs.readFileSync(path.join(root, 'decision-engine/index.html'), 'utf8');

test('灌溉主入口不再加载已移除的数字农业桥接脚本', () => {
  assert.equal(fs.existsSync(path.join(root, 'irrigation-bridge.js')), false);
  assert.doesNotMatch(index, /(?:src=["'][^"']*irrigation-bridge\.js|irrigation-bridge\.js)/i);
});

test('主导航不再暴露已解耦的数字农业跳转动作', () => {
  assert.doesNotMatch(nav, /runyeOpenDigitalAgriculture|runyeSharePlotToDigital|runyeBridgeWriteBack/);
  assert.doesNotMatch(index, /runyeOpenDigitalAgriculture|runyeSharePlotToDigital|runyeBridgeWriteBack/);
});

test('灌溉主程序入口、导航和插件清单不挂载种植工具页面', () => {
  const plantingPageRef = /(?:digital-agriculture|qicai-huasheng|lajiao-zhibao|decision-engine|peanut-tool|七彩花生植保|辣椒植保)/i;
  for (const [name, source] of [['index.html', index], ['runye-nav.js', nav], ['plugins.json', plugins]]) {
    assert.doesNotMatch(source, plantingPageRef, `${name} must not link to or register planting tools`);
  }
});

test('种植工具内部导航指向现行数字农业页面，旧根地址保留跳转', () => {
  assert.match(peanutSchedulePage, /\.\.\/peanut-tool\.html/);
  assert.match(peanutSchedulePage, /\.\.\/index\.html/);
  assert.match(pepperPage, /\.\.\/index\.html/);
  assert.match(peanutRedirect, /location\.replace\(['"]digital-agriculture\/peanut-tool\.html/);
  assert.match(agricultureRedirect, /location\.replace\(['"]digital-agriculture\/index\.html/);
  assert.match(oldPeanutSchedulePath, /location\.replace\(['"]\.\.\/digital-agriculture\/qicai-huasheng\/index\.html/);
  assert.match(oldPepperPath, /location\.replace\(['"]\.\.\/digital-agriculture\/lajiao-zhibao\/index\.html/);
  assert.match(oldDecisionPath, /location\.replace\(['"]\.\.\/digital-agriculture\/decision-engine\/index\.html/);
  for (const shim of [oldPeanutSchedulePath, oldPepperPath, oldDecisionPath]) {
    assert.doesNotMatch(shim, /ACCESS_PASSWORD|gatePwd|const overview\s*=/i, 'root compatibility files contain redirects only');
  }
});
