// runye-irrigation/vite.config.js —— 阶段二 方案A：Vite 仅作本地预览，不参与发布构建
// 零侵入：不改造 index.html 的 100+ 全局 <script>，不改 ?v= 版本号，不产出发布 dist
import { defineConfig } from 'vite';

export default defineConfig({
  // 多页应用模式：尊重各独立 .html 入口（在线地图 / 管线规划等均为独立页面）
  appType: 'mpa',
  root: '.',                          // 项目根即 web 根
  base: './',                         // 相对路径，配合 file:// 或本地 serve
  build: {
    // 方案A 不产出发布用 dist；如需本地试构建，产物进 _vite_dist（下划线开头，被 gitignore 忽略）
    outDir: '_vite_dist',
    emptyOutDir: true,
    rollupOptions: {
      // 方案A 本意是仅本地预览；如需本地试构建，指定 index.html 为唯一入口，
      // 经典全局脚本仍由 Vite 静态复制，不打包为 ESM，避免破坏全局依赖。
      input: 'index.html',
    },
  },
  server: {
    port: 5173,
    open: false,                      // 不开浏览器，避免干扰你正在看的样板
  },
});
