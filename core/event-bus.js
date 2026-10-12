/* ============================================================
   core/event-bus.js — 插件事件总线（ES Module）
   ------------------------------------------------------------
   职责：只做 on / off / emit 三件事，不做任何业务逻辑。
   隔离纪律：单个订阅者抛错**不得**影响其余订阅者，也不得冒到 emit 调用方。
   ============================================================ */

/* 预置事件类型（新增类型请在此登记，方便全局检索） */
export const EVENTS = {
  DIAGRAM_CHANGED: 'diagram-changed',   /* 设计图数据变化（主程序/插件均可 emit） */
  ARCHIVE_SAVED: 'archive-saved',       /* 项目档案保存完成 */
  ARCHIVE_LOADED: 'archive-loaded',     /* 项目档案被打开还原 */
  NAV_SWITCH: 'nav-switch',             /* 导航切换 */
  PLUGIN_LOADED: 'plugin-loaded',       /* 某插件加载完成（含被跳过） */
  /* [阶段四 2026-10-11] 老模块 pipe_optim 导出方案后由插件外壳转发到总线 */
  PIPE_OPTIM_EXPORT: 'pipe-optim-export',
  /* [v379] 水力计算内核就绪（hydraulics 插件把 RyHcCore / RyDesignCore / RyHydCore
     请进来之后广播）。订阅者用它来避免「我要算水损但内核还没到」的竞态 ——
     不要各自 setTimeout 猜时间（本仓库已在 _smoke_live 上因盲等吃过整页假阴性）。 */
  HYDRAULICS_CORE_READY: 'hydraulics-core-ready',
  /* v394：材料清单壳请求打开 BOM 插件面板 */
  BOM_OPEN_REQUEST: 'bom-open-request'
};

export function createEventBus() {
  var map = Object.create(null);   /* type -> Array<fn> */

  function on(type, fn) {
    if (typeof type !== 'string' || typeof fn !== 'function') return function () { };
    (map[type] || (map[type] = [])).push(fn);
    return function off() { off(type, fn); };
  }

  function off(type, fn) {
    var arr = map[type];
    if (!arr) return;
    var i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
    if (!arr.length) delete map[type];
  }

  /* emit：逐个调用；任一订阅者抛错只记录、不中断传播。
     ★ 返回值恒为 undefined —— 调用方不得依赖订阅者结果。 */
  function emit(type, payload) {
    var arr = (map[type] || []).slice();
    for (var i = 0; i < arr.length; i++) {
      try {
        arr[i](payload);
      } catch (e) {
        try { (console.warn || console.log)('[ry:bus] listener error @' + type, e); } catch (e2) { }
      }
    }
  }

  function types() { return Object.keys(map); }

  return { on: on, off: off, emit: emit, types: types, EVENTS: EVENTS };
}
