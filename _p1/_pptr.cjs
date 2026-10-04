/* _p1/_pptr.cjs · puppeteer-core 统一入口
 *
 * ★ 起因（v213 实测）：批跑环境常常**没有** NODE_PATH，
 *   于是各脚本里裸 `require('puppeteer-core')` 直接 MODULE_NOT_FOUND ——
 *   一眼看去是「脚本全红 / 注入体检 0/16」，其实是**环境问题**，跟被测功能毫无关系。
 *   家里另几套脚本早就各写了一份兜底路径（同一事实存 N 份），这里统一收口成一份：
 *   先按 NODE_PATH 找，找不到就兜到托管 node 工作区。
 */
'use strict';
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e1) { puppeteer = require('C:/Users/AHS/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core'); }
module.exports = puppeteer;
