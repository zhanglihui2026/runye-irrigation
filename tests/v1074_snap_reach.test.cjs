#!/usr/bin/env node
/* v1074-snap-reach 回归锁：捕捉触达增强。
 *
 * 用户实测「还是不行，是不是捕捉的容差小了？手绘总管没有捕捉到节点」：
 *   ① SNAP_PX 10→14px（zoom 17+ 时 10px 只有 2~6m，鼠标稍偏即脱靶）；
 *   ② 节点类目标（main-coupler / seg-coupler）双倍半径 =28px——节点是设计落点，
 *      优先且更易命中（v872 同理由）；
 *   ③ 进入绘制若捕捉未开启（snapOn 每次刷新回默认关闭）必须明说，并给开启入口；
 *   ④ 演示拦截提示补可执行指引（删旧总管 → 开捕捉 → 沿图上管线重画）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function ok(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else console.log('ok: ' + msg);
}

const snap = read('mod/trunk-snap.js');
const oml = read('mod/online-map.js');
const demo = read('mod/map-flow-demo.js');
const sw = read('sw.js');
const html = read('index.html');

/* 锁1：容差与节点双倍半径 */
ok(snap.includes('var SNAP_PX = 14;'), '[v1074] SNAP_PX = 14px');
ok(snap.includes('var COUPLER_PX_MULT = 2;'), '[v1074] 节点双倍半径系数 = 2');
ok(snap.includes("(t.kind === 'main-coupler' || t.kind === 'seg-coupler') ? tol * COUPLER_PX_MULT : tol"), '[v1074] nearest 点命中按节点类目标放大半径');
ok(snap.includes('couplerPx: SNAP_PX * COUPLER_PX_MULT'), '[v1074] stats 暴露 couplerPx');

/* 锁2：捕捉状态引导 */
ok(/if\(nextMode==='draw'\)[\s\S]*?setSnapOn\(true\);/.test(oml), '进入总管绘制自动开启捕捉');
ok(oml.includes('请将白圈对准紫色主管施工节点并点击'), '提示准确捕捉主管施工节点');
ok(oml.includes("关闭（点「捕捉点」开启吸附节点）"), '[v1074] 常驻提示条显示开启入口');

/* 锁3：演示拦截提示可执行 */
ok(demo.includes('请删掉旧总管沿图上管线重画'), '[v1074] 拦截提示补「删旧总管重画」指引');
ok(demo.includes('先点「捕捉点」开启吸附，白圈吸到施工节点再落点'), '[v1074] 拦截提示补开捕捉指引');

/* 锁4：版本纪律 */
const m = /^const VERSION = '(v[\w-]+)';/m.exec(sw);
ok(!!m && /^v\d{3,4}-[\w-]+$/.test(m[1]), '[v1074] sw VERSION 存在且形如 vNNNN- slug：' + (m && m[1]));
const want = m ? m[1].replace(/^v/, '') : '';
ok(html.split('?v=' + want).length - 1 === 17, '[v1074] index.html 版本串 17 处同值');

console.log(process.exitCode ? '\n[v1074] 有断言失败' : '\n[v1074] 全部通过');
