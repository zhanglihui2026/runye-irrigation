/* _p1/_edge_kill.cjs · 测试用 Edge 的**进程树**清理
 * 背景：Node 的 proc.kill() 在 Windows 上只杀 spawn 出来的那个父进程，
 *       headless Edge 会留下 renderer / GPU / zygote 等一堆子进程。
 *       跑一轮注入体检要 spawn 8 次 ⇒ 累积几十个孤儿进程 ⇒ 机器越跑越慢，
 *       最后 CDP 直接 180s 超时（表现为「脚本半途崩、汇总行缺失、用例随机红」），
 *       很容易被误读成「功能有缺陷」。
 * 做法：用 taskkill /T /F 连进程树一起杀；失败再退回 process.kill。
 */
'use strict';
const { execSync } = require('child_process');
module.exports = function killTree(pid) {
  if (!pid) return;
  try {
    execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore', timeout: 15000 });
    return true;
  } catch (e) {
    try { process.kill(pid); return true; } catch (e2) { return false; }
  }
};
