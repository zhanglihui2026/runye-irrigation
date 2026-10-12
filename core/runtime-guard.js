/* ============================================================
   core/runtime-guard.js — 插件崩溃隔离与错误上报（ES Module）
   ------------------------------------------------------------
   职责：把插件的每一次「对外调用」包进 try/catch。
   硬约束：插件异常只影响插件自身；主程序与其他插件照常运行。
   纪律：错误必须**留在现场**（window.__ryPluginErrors），
         否则「点了没反应」将无从查起（项目既有教训）。
   ============================================================ */

export function createRuntimeGuard() {
  var errors = [];          /* { id, phase, message, stack, at } */
  var disabled = Object.create(null);   /* id -> reason */

  function reportError(id, err, phase) {
    var rec = {
      id: String(id || '?'),
      phase: String(phase || 'runtime'),
      message: String((err && (err.message || err.errMsg)) || err || 'unknown'),
      stack: String((err && err.stack) || ''),
      at: new Date().toISOString()
    };
    errors.push(rec);
    if (errors.length > 200) errors.shift();
    try {
      var w = (typeof window !== 'undefined') ? window : null;
      if (w) w.__ryPluginErrors = errors.slice();
      (console.warn || console.log)('[ry:guard] ' + rec.id + ' @' + rec.phase + ' → ' + rec.message);
    } catch (e) { }
    return rec;
  }

  /* 包裹调用：ok=false 时返回 undefined，绝不让异常外溢 */
  function wrap(id, phase, fn, thisArg, args) {
    try {
      return { ok: true, value: fn.apply(thisArg || null, args || []) };
    } catch (e) {
      reportError(id, e, phase);
      return { ok: false, value: undefined, error: e };
    }
  }

  function disable(id, reason) {
    disabled[String(id)] = String(reason || 'disabled');
    try {
      var w = (typeof window !== 'undefined') ? window : null;
      if (w) w.__ryPluginDisabled = Object.assign({}, disabled);
    } catch (e) { }
  }

  function isDisabled(id) { return !!disabled[String(id)]; }
  function listErrors() { return errors.slice(); }
  function listDisabled() { return Object.assign({}, disabled); }

  return {
    wrap: wrap,
    reportError: reportError,
    disable: disable,
    isDisabled: isDisabled,
    listErrors: listErrors,
    listDisabled: listDisabled
  };
}
