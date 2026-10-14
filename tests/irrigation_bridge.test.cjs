const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'runye-nav.js'), 'utf8');

test('灌溉主入口不再加载已移除的数字农业桥接脚本', () => {
  assert.equal(fs.existsSync(path.join(root, 'irrigation-bridge.js')), false);
  assert.doesNotMatch(index, /(?:src=["'][^"']*irrigation-bridge\.js|irrigation-bridge\.js)/i);
});

test('主导航不再暴露已解耦的数字农业跳转动作', () => {
  assert.doesNotMatch(nav, /runyeOpenDigitalAgriculture|runyeSharePlotToDigital|runyeBridgeWriteBack/);
  assert.doesNotMatch(index, /runyeOpenDigitalAgriculture|runyeSharePlotToDigital|runyeBridgeWriteBack/);
});
