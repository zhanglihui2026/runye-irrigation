/* ============================================================
   core/bootstrap.js — 插件化主程序入口（ES Module）
   ------------------------------------------------------------
   index.html 只需一行：<script type="module" src="core/bootstrap.js"></script>
   删掉这一行即整体卸载插件体系，原有功能零影响。
   ------------------------------------------------------------
   ⚠ 时序（别改）：<script type="module"> 是 defer 语义，解析晚于所有同步脚本，
     因此 window.tlDiagramData / CloudSync / RyFnNav 此时通常已就绪；
     但 DOM 可能仍在 loading（本行放在 </body> 前则已 ready），统一等一次 DOMContentLoaded。
   ============================================================ */

import { createEventBus, EVENTS } from './event-bus.js';
import { createRuntimeGuard } from './runtime-guard.js';
import { createDataService } from './data-service.js';
import { createUiShell } from './ui-shell.js';
import { createLoader } from './loader.js';

export var CORE_VERSION = '1.0.0';

var started = false;

export function boot(opts) {
  if (started) return null;
  started = true;
  opts = opts || {};

  var guard = createRuntimeGuard();
  var bus = createEventBus();
  var data = createDataService(guard);
  var ui = createUiShell(guard);
  boot.bus = bus;
  var loader = createLoader({ coreVersion: CORE_VERSION, bus: bus, data: data, ui: ui, guard: guard });

  var core = {
    version: CORE_VERSION,
    events: EVENTS,
    bus: bus,
    data: data,
    ui: ui,
    guard: guard,
    loader: loader,
    ready: false
  };

  try { window.RyCore = core; } catch (e) { }

  var p = loader.loadAll(opts.manifestUrl || 'plugins.json').then(function (reg) {
    core.ready = true;
    core.registry = reg;
    try {
      window.dispatchEvent(new CustomEvent('rycore-ready', { detail: { version: CORE_VERSION, plugins: Object.keys(reg || {}) } }));
    } catch (e) { }
    return core;
  });

  return p;
}

function whenReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

/* 自动启动：只有被 <script type="module"> 直接引入时才自启。
   ★ 测试逃生门：宿主在引入本模块前置 window.__ryCoreNoAutoboot = true，
     即可阻止自动启动、改由测试自行调 boot({manifestUrl})（闸门 _gate_plugins.cjs 依赖此开关）。 */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.__ryCoreNoAutoboot !== true) {
  whenReady(function () {
    try {
      boot().catch(function (e) {
        try { (console.warn || console.log)('[ry:core] 启动失败（主程序不受影响）：' + ((e && e.message) || e)); } catch (e2) { }
      });
    } catch (e) {
      try { (console.warn || console.log)('[ry:core] 启动异常（主程序不受影响）：' + ((e && e.message) || e)); } catch (e2) { }
    }
  });
}
