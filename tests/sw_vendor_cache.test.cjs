'use strict';
/* sw_vendor_cache.test.cjs —— 「CloudBase SDK 必须跨版本保留」的契约（v628，2026-10-20）
 *
 * 背景（真实 bug）：后台打开就报「后台连接失败：CloudBase 初始化失败」。
 *   ① `pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js`（787KB）不在 CORE 白名单；
 *   ② 它只能落进 RUNTIME 缓存，而 `RUNTIME_CACHE = PREFIX + VERSION + '-runtime'`，
 *      activate 又把 PREFIX* 里旧的全删 ⇒ **每发一个版本就被清掉**，下次必须重下 787KB；
 *   ③ cloud-sync.js 的 cloudInit 只等 10 秒 ⇒ 网络稍慢必然失败，**发版越勤越容易复现**。
 * 这些断言就是防它再退回去：VENDOR 缓存的三个要点（名字不含版本 / activate 不删 /
 * 缓存优先），外加「没有才下载」与「等待时间别退回 10 秒」。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'plugin-admin.html'), 'utf8');

/* 1. SDK 必须在 VENDOR 名单里（且是真实存在的文件） */
const vendorBlock = sw.match(/const VENDOR = \[([^\]]*)\];/);
assert.ok(vendorBlock, 'sw.js 应定义 VENDOR 名单');
assert.ok(/cloudbase-js-sdk-3\.8\.2\.bundle\.js/.test(vendorBlock[1]), 'VENDOR 名单应包含 CloudBase SDK');
const sdkPath = path.join(root, 'pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js');
assert.ok(fs.existsSync(sdkPath), 'SDK 文件应存在于 pwa/vendor/');

/* 2. VENDOR 缓存名不能带 VERSION —— 这是「跨版本保留」的唯一前提 */
assert.ok(/const VENDOR_CACHE = PREFIX \+ 'vendor';/.test(sw),
  'VENDOR_CACHE 必须写成 `PREFIX + \'vendor\'`（不带 VERSION），否则每次发版都会被当成旧缓存删掉');
assert.ok(/const RUNTIME_CACHE = PREFIX \+ VERSION \+ '-runtime';/.test(sw),
  '（对照）RUNTIME_CACHE 仍是版本作用域，所以大件不能只靠它');

/* 3. activate 的清理必须放过 VENDOR_CACHE */
const actSrc = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf('function key('));
assert.ok(actSrc.length > 50, '应能截到 activate 处理器');
assert.ok(/name !== VENDOR_CACHE/.test(actSrc), 'activate 删除旧缓存时必须排除 VENDOR_CACHE');

/* 4. install 里大件必须「没有才下载」，不能 addAll（否则每版重拉 787KB） */
const instSrc = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
assert.ok(/caches\.open\(VENDOR_CACHE\)/.test(instSrc), 'install 应向 VENDOR_CACHE 预置大件');
assert.ok(/if \(!\(await vc\.match\(u\)\)\)/.test(instSrc),
  'install 里必须是「缓存已有就跳过」，不能无条件 addAll/cache:reload');
assert.ok(!/vc\.addAll/.test(instSrc), 'install 里对 VENDOR 不要用 addAll（会每版重下）');
assert.ok(/try \{[\s\S]{0,200}caches\.open\(VENDOR_CACHE\)/.test(instSrc),
  '大件预置失败必须被 try/catch 兜住，不能让它废掉整次 SW 更新');

/* 5. fetch 必须对大件「缓存优先」，且分支在通用 local() 之前 */
const fetchSrc = sw.slice(sw.indexOf("addEventListener('fetch'"));
const iVendor = fetchSrc.indexOf('VENDOR_URLS.has(');
const iLocal = fetchSrc.search(/respondWith\(local\(request, event\)\)/);
assert.ok(iVendor > 0, 'fetch 应处理 VENDOR_URLS');
assert.ok(iLocal > iVendor, '大件的缓存优先分支必须排在通用 local() 之前');

/* 6. SDK 等待时间不能退回 10 秒 */
const m = sync.match(/var deadline = Date\.now\(\) \+ (\d+);/);
assert.ok(m, 'cloud-sync.js 应存在 SDK 就绪 deadline');
assert.ok(Number(m[1]) >= 20000, 'cloudInit 等 SDK 的时长应 ≥ 20 秒（10 秒在网络慢时必然误报），当前 ' + m[1]);

/* 7. 后台连接失败必须给出原因与重试入口 */
assert.ok(/id="retryBtn"/.test(admin) && /function bootFail/.test(admin) && /function retryBoot/.test(admin),
  'plugin-admin.html 应有「重新连接」按钮 + 原因提示（bootFail/retryBoot）');

console.log('sw_vendor_cache：VENDOR 缓存 × SDK 等待 × 失败提示 7 组契约通过');
