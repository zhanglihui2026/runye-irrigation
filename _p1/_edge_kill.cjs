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

/* [v210] 清扫**本套测试基建**遗留的孤儿 Edge（按 user-data-dir 特征识别，绝不误伤用户自己的 Edge）。
   背景：注入体检一跑十几个用例，任何一个用例异常退出（ProtocolError / Target closed）都会留下
   一整棵孤儿树 ⇒ 机器越来越慢 ⇒ 后续用例全超时，被误读成"功能有缺陷"。
   特征字串来自本目录各 shot 脚本的 --user-data-dir（profile_vxxx / _tmp_inj / _verify_out）。 */
module.exports.sweepTestEdges = function sweepTestEdges() {
  const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'msedge.exe\'" | ' +
    'Where-Object { $_.CommandLine -match \'profile_v2|_tmp_inj|_verify_out\' } | ' +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
  try { execSync('powershell -NoProfile -Command "' + ps.replace(/"/g, '\\"') + '"', { stdio: 'ignore', timeout: 30000 }); }
  catch (e) { /* 清扫失败不致命：下一个用例仍会自己清理自己的进程树 */ }
  return true;
};
