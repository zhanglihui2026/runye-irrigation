'use strict';
/* tests/announce_simple.test.cjs —— 首页公告弹窗「简化版」文案（v962）
 *
 * 用户 2026-11-04 给出定稿文案，要求「打开页面的弹窗简化」：
 *   免费开源灌溉设计工具｜纯公益，无收费套路，欢迎反馈 BUG，邀 3 位好友注册，
 *   解锁高级会员，浏览器即开即用，欢迎转发给农业灌溉同行
 *   https://zhanglihui2026.github.io/runye-irrigation/
 *
 * 这条锁只钉三件事（多钉会绑死版式）：
 *   ① 那一句正文**逐字**在代码里（改文案的人必须是有意的）；
 *   ② 旧版的三块（副标题 / 5 条列表 / 页脚说明）不许回来；
 *   ③ 地址是可点链接、动作只剩「注册 + 复制链接」；
 *   ④ 公告脚本 ?v= 与内容定型版本一致（v1051 反转：公告内容自 v1043 定稿未变，
 *      不再强锁与主串同抬——详见 ④ 内注释）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'runye-announce.js'), 'utf8');
const js = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const MAIN = '纯公益，无收费套路';
const MAIN2 = '邀 3 位好友注册，解锁高级会员';
const TAIL = '，浏览器即开即用，欢迎转发给农业灌溉同行';

test('① 标题 + 正文三句都在代码里（逐字）', () => {
  assert.ok(js.includes("'免费开源灌溉设计工具'"), '缺标题「免费开源灌溉设计工具」');
  assert.ok(js.includes(MAIN), '缺「纯公益，无收费套路」');
  assert.ok(js.includes(MAIN2), '缺「邀 3 位好友注册，解锁高级会员」');
  assert.ok(js.includes(TAIL), '缺后半句「浏览器即开即用，欢迎转发给农业灌溉同行」');
});

test('② 旧版三块不许回来（副标题 / 5 条列表 / 页脚说明）', () => {
  assert.ok(!/ry-ann-sub/.test(js), '旧副标题 .ry-ann-sub 又回来了');
  assert.ok(!/ry-ann-list/.test(js), '旧 5 条列表 .ry-ann-list 又回来了');
  assert.ok(!/ry-ann-note/.test(js), '旧页脚说明 .ry-ann-note 又回来了');
  assert.ok(!/免费代绘|赠送 30 天|恳请多多转发/.test(js), '旧文案句子又回来了');
});

test('③ 地址是可点链接，动作只剩注册 + 复制链接', () => {
  assert.ok(/var url = el\('a', 'ry-ann-url', SITE\)/.test(js), '地址必须用 <a> 渲染（转发场景要能直接点/右键复制）');
  assert.ok(/url\.href = SITE/.test(js), '缺 href');
  assert.ok(/url\.target = '_blank'/.test(js), '缺 target=_blank（否则点开把自己这页替换掉）');
  assert.ok(/rel = 'noopener'/.test(js), '缺 rel=noopener');
  assert.ok(!/bGo|开始使用/.test(js), '「开始使用」应已删除（× 与注册按钮已够）');
  assert.ok(/bCopy/.test(js) && /'复制链接'/.test(js), '缺「复制链接」');
});

test('④ 公告脚本 ?v= 与其内容定型版本一致（v1051 反转：不再强锁与主串同抬）', () => {
  const m = html.match(/<script src="runye-announce\.js\?v=([0-9a-zA-Z._-]+)"><\/script>/);
  assert.ok(m, 'index.html 里没有 runye-announce.js 的 <script>');
  const ver = m[1];
  assert.ok(!/^621-/.test(ver), '公告脚本的 ?v= 还停在 621 那种一次性串上，改了内容也不会刷新');
  /* [v1051 2026-11-13 反转] 原断言要求公告 ?v= 与 style-01 主串/sw VERSION 同抬。
     实际沿革：公告文案 v1043-coupler-node-lifecycle 定稿后 runye-announce.js 内容
     未再改动，v1044→v1051 各版本主串同抬时公告串保持 1043 不动（runye-announce.js
     内容未变，旧串缓存即是最新内容，无害）；且全部版本闸门（v979/v982/v994 等）
     动态锁「index.html 正好 14 处主串」，公告并入主串会把计数打到 15。
     反转为锁事实：公告串 = 1043-coupler-node-lifecycle。
     ⚠ 今后若改 runye-announce.js 内容：同抬公告串，且须把各版本闸门的 14 处口径
     同步改为 15（两处一起改，缺一不可）。 */
  assert.equal(ver, '1043-coupler-node-lifecycle', '公告串必须与内容定型版本 1043 一致；改公告内容时按注释口径同步抬串与闸门');
  assert.match(sw, /"runye-announce\.js"/, 'runye-announce.js 必须在 CORE 名单里（缓存优先级不受 ?v= 影响）');
});
