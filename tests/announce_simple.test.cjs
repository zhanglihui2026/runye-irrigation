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
 *   ③ 地址是可点链接、动作只剩「注册 + 复制链接」，且脚本自己的 ?v= 抬过
 *      （它原来停在 621-invite-l2 这种一次性串上，只抬 sw.js 不抬它，老用户会继续吃旧缓存）。
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

test('④ 脚本自己的 ?v= 与 sw VERSION 同步抬起（否则老用户吃旧缓存）', () => {
  const m = html.match(/<script src="runye-announce\.js\?v=([0-9a-zA-Z._-]+)"><\/script>/);
  assert.ok(m, 'index.html 里没有 runye-announce.js 的 <script>');
  const ver = m[1];
  assert.ok(!/^621-/.test(ver), '公告脚本的 ?v= 还停在 621 那种一次性串上，改了内容也不会刷新');
  assert.ok(html.includes('style-01.css?v=' + ver), '版本串没跟 style-01 同抬');
  assert.match(sw, new RegExp("const VERSION = 'v" + ver.replace(/[-.]/g, '\\$&') + "'"), 'sw.js VERSION 与 ?v= 不一致');
  assert.ok(sw.includes('"runye-announce.js"'), 'runye-announce.js 必须在 CORE 名单里');
});
