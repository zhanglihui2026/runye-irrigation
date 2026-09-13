// 兼容旧入口（2026-09-13 数字农业剥离）：生育期与植保节点统一数据源已迁移至
//   digital-agriculture/qicai-huasheng/schedule-core.js
// 本文件仅为旧路径兼容加载器：在解析期用 document.write 同步加载新地址，
// 保证「先加载本文件、后执行的依赖脚本」仍能同步拿到 window.QICAI_SCHEDULE /
// window.QICAI_SCHEDULE_DETAILS（与迁移前行为一致）。
// 注意：src 以当前 <script> 的绝对地址为基准解析，页面位于仓库任意深度均可。
(function () {
  var s = document.currentScript;
  var base = (s && s.src) ? s.src.replace(/[^\/]*$/, '') : '';
  var target = base + '../digital-agriculture/qicai-huasheng/schedule-core.js';
  if (typeof document !== 'undefined' && document.write) {
    document.write('<script src="' + target + '"><\/script>');
  } else {
    console.warn('[runye] schedule-core 已迁移：digital-agriculture/qicai-huasheng/schedule-core.js，本兼容壳未能加载。');
  }
})();
