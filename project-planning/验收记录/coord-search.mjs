'use strict';
/* v634 坐标搜索 · 解析器验收（纯函数，不联网、不开浏览器）
   把 mod/online-map.js 里的 COORD_AXIS…parseLatLng 整段抠出来真跑。
   用法：node project-planning/验收记录/coord-search.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argFile = process.argv.find(a => a.startsWith('--file='));
const FILE = argFile ? path.resolve(ROOT, argFile.slice(7)) : path.join(ROOT, 'mod/online-map.js');

const src = fs.readFileSync(FILE, 'utf8');
/* 切片边界兼容改前版本（旧版没有 COORD_AXIS / reverseName 两个锚点），
   这样同一脚本可以直接对旧文件跑，得到「如实报红」的反向验证。 */
let a = src.indexOf('var COORD_AXIS=');
if (a < 0) { a = src.indexOf('function parseLatLng('); }
let b = src.indexOf('function reverseName(lat,lng){');
if (b < 0) b = src.indexOf('function doSearch(');
if (a < 0 || b < 0 || b <= a) { console.error('SLICE FAIL: 找不到 parseLatLng 代码段'); process.exit(1); }
const parseLatLng = new Function(src.slice(a, b) + '\nreturn parseLatLng;')();

const DMS_LAT = 18 + 15 / 60 + 10 / 3600;       // 18.2527778
const DMS_LNG = 109 + 30 / 60 + 43 / 3600;      // 109.5119444

const cases = [
  ['十进制度·纬经',        `18.2528,109.5119`,        18.2528, 109.5119],
  ['十进制度·经纬自动换位', `109.5119,18.2528`,        18.2528, 109.5119],
  ['空格分隔纯数字',        `18.2528 109.5119`,        18.2528, 109.5119],
  ['负值',                 `-18.25,-109.5`,          -18.25,  -109.5],
  ['方向字母·后缀',        `18.2528N,109.5119E`,      18.2528, 109.5119],
  ['方向字母·前缀',        `N18.2528 E109.5119`,      18.2528, 109.5119],
  ['度分秒·标准',          `18°15'10"N, 109°30'43"E`, DMS_LAT, DMS_LNG],
  ['度分秒·秒后带空格',    `18°15'10" N 109°30'43" E`, DMS_LAT, DMS_LNG],
  ['度分秒·中文符号',      `18度15分10秒N,109度30分43秒E`, DMS_LAT, DMS_LNG],
  ['中文经纬',             `北纬18.2528 东经109.5119`,  18.2528, 109.5119],
  ['中文经纬·中文逗号',    `北纬18.2528，东经109.5119`, 18.2528, 109.5119],
];

const negs = [
  ['地名（应走关键词搜索）', `三亚 崖州`],
  ['越界数值',               `999,999`],
  ['单个数值',               `18.2528`],
  ['空串',                   ``],
  ['纯文字',                 `hello world`],
];

let pass = 0, fail = 0;
const EPS = 1e-6;

for (const [name, input, lat, lng] of cases) {
  const r = parseLatLng(input);
  const ok = r && Math.abs(r.lat - lat) < EPS && Math.abs(r.lng - lng) < EPS;
  if (ok) { pass++; console.log(`  ✓ ${name.padEnd(22)} ${input}  →  ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}`); }
  else { fail++; console.log(`  ✗ ${name.padEnd(22)} ${input}  →  ${r ? r.lat + ',' + r.lng : 'null'}  （期望 ${lat.toFixed(6)}, ${lng.toFixed(6)}）`); }
}
for (const [name, input] of negs) {
  const r = parseLatLng(input);
  if (r === null) { pass++; console.log(`  ✓ ${name.padEnd(22)} 「${input}」  →  null（按预期不当作坐标）`); }
  else { fail++; console.log(`  ✗ ${name.padEnd(22)} 「${input}」  →  ${JSON.stringify(r)}  （应 null）`); }
}

console.log(`\n== 坐标解析：${pass} passed / ${fail} failed ==`);
process.exit(fail ? 1 : 0);
