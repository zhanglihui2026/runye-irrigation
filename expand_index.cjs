/* [v357] index.html 单文件已拆分：内联 <script>/<style> 移至 mod/。
   本助手把 mod 外链拼回标签位置，重建「虚拟单文件视图」——闸门/测试的既有文本契约锚不变。
   对旧备份（无 mod 外链）展开为原样。 */
'use strict';
const fs = require('fs');
const path = require('path');
function expandIndex(file) {
  let html = fs.readFileSync(file, 'utf8');
  const root = path.dirname(file);
  html = html.replace(/<script src="(mod\/[^"]+)"><\/script>/g, function (m0, p1) {
    const f = path.join(root, p1.split('?')[0]);
    return fs.existsSync(f) ? '<script>' + fs.readFileSync(f, 'utf8') + '</script>' : m0;
  });
  html = html.replace(/<link rel="stylesheet" href="(mod\/[^"]+)">/g, function (m0, p1) {
    const f = path.join(root, p1.split('?')[0]);
    return fs.existsSync(f) ? '<style>' + fs.readFileSync(f, 'utf8') + '</style>' : m0;
  });
  return html;
}
module.exports = expandIndex;
