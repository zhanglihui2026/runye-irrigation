/* runye-undo.js —— 三个规划页面通用的「Ctrl+Z 回退上一步」
 *
 * 覆盖页面（用户原话：「地块分区 管路规划 多地块规划 这几个页面要支持 ctrl+z 回退的功能，
 *   不管我做了什么指令，只要 用ctrl+z快捷键就回退到上一步。」）：
 *     · 地块分区   = #pipePlanSection
 *     · 管路规划   = #tlPipePlanSection
 *     · 多地块规划 = #grPipeSection
 *
 * ── 设计要点（三条，都是为了避免踩这个工程已有的坑）──
 *
 * 1) **不写第二份状态序列化**。快照直接复用主站的工程存档构造
 *    （`runyeSaveProject(true, 临时key)` 写进 localStorage 再读回字符串），
 *    恢复复用 `runyeLoadProject(临时key, true)`。
 *    理由：这两个函数已被「💾 导出工程 / 📂 导入工程」长期使用，字段覆盖面最广
 *    （地块库 / 全部输入参数 / 二级管线 / 三级图纸与手工·自动编辑层 / 成组计划 /
 *      地形 / 材料价 / 阶梯覆盖…），且**主站以后新增字段，快照自动跟着覆盖**；
 *    另写一份 clone 必然随时间漏字段 —— 这个工程在 v98 阶段已因「两份记录不同步」
 *    吃过亏（def_version 冻结了、provenance 还写旧值）。
 *    ★ 参数顺序陷阱：`runyeSaveProject(silent, key)` 与 `runyeLoadProject(key, silent)`
 *      **顺序相反**，本文件已在两处分别标注，改的时候不要顺手"统一"。
 *
 * 2) **入栈时机 = 与栈顶比对**，不是"手势前存 pre"。
 *    做法：在目标页激活时监听一次用户手势结束（pointerup / click / change，捕获阶段），
 *    结束后取一次当前快照，与栈顶字符串比对，不同才入栈 ⇒ 一次操作一步。
 *    好处：每次操作只需 1 次快照（而不是 2 次），且天然去重（同一状态不会重复入栈）。
 *
 * 3) **Ctrl+Z 只在目标页拦截**。其余页面（参数预设 / 地块绘制 / 材料清单 / 过滤系统…）
 *    不抢浏览器默认行为，避免把「输入框里退一个字符」这类原生意图吃掉。
 *    ⚠ 但在目标页内是**全局接管**（包括输入框）：这是用户明确要的
 *      「不管我做了什么指令，只要 ctrl+z 就回退上一步」。
 *
 * 对外接口：window.RyUndo.undo() / .capture() / .debug()
 */
(function (global) {
  'use strict';

  var SECS = ['pipePlanSection', 'tlPipePlanSection', 'grPipeSection'];
  var MAX = 30;                 // 栈深（30 步足够，且控制内存）
  var KEY = '__ry_undo_tmp__';  // 临时存档 key（每次用完即删，不污染用户存档）
  var INPUT_MERGE_MS = 600;     // 连续输入合并成一步

  var stack = [];               // 快照字符串栈（含基线 stack[0]）
  var top = -1;
  var timer = 0;
  var pending = false;

  function activeSec() {
    var s = document.querySelector('main > .ry-sec.ry-active');
    return s ? s.id : null;
  }
  function isTarget() {
    var id = activeSec();
    return !!id && SECS.indexOf(id) >= 0;
  }

  /* 快照：借用主站工程序列化（静默、走临时 key、立即清理）。
     __ryUndoQuiet 让主站跳过两个与"存档"无关的副作用（重算材料量 / 分享到数字农业），
     否则每次点一下都要全量重算一遍材料清单。 */
  function capture() {
    if (typeof global.runyeSaveProject !== 'function') return null;
    var prev = global.__ryUndoQuiet;
    global.__ryUndoQuiet = true;
    try {
      global.runyeSaveProject(true, KEY);           // ★ (silent, key)
      var s = global.localStorage.getItem(KEY);
      return s || null;
    } catch (e) {
      return null;
    } finally {
      global.__ryUndoQuiet = prev;
      try { global.localStorage.removeItem(KEY); } catch (e2) { }
    }
  }

  /* ★ 按页重置基线（本轮实测踩到）：快照是整站级的，但**页面上下文**是分页的。
     若基线拍在"成组页还没进入（__runyeGroupEdit 尚未建立）"的时刻，
     用户在成组页布完管按 Ctrl+Z 会退到"整页空掉"—— 那不是他要的"上一步"。
     ⇒ 每当前激活页变化到某个目标页时，把栈重置为"进入这一页时的状态"作为新基线。
     （定时器 + 手势钩子双保险：程序化切页不会产生 click，只靠手势钩子会漏。） */
  var lastSec = null, resetT = 0;
  /* immediate=true 时**同步**拍基线（必须用于手势钩子：那里正处在"操作前"，
     延迟拍会把"操作后"当成基线 ⇒ 该次操作变得不可撤销——本轮实测踩到、U1② 直接失败）。
     定时器路径传 false：切页那一刻页面正在做自己的同步重算（三级页尤其重），
     晚 0.4s 拍基线不改变语义，但切页手感好得多。 */
  function syncSection(immediate) {
    var id = activeSec();
    if (id === lastSec) return false;
    lastSec = id;
    if (SECS.indexOf(id) < 0) return false;
    stack = []; top = -1;
    clearTimeout(resetT);
    if (immediate) { var s = capture(); if (s) push(s); return true; }
    resetT = setTimeout(function () { var s = capture(); if (s) push(s); }, 400);
    return true;
  }
  setInterval(function () { syncSection(false); }, 1000);

  function push(snap) {
    if (!snap) return false;
    if (top >= 0 && stack[top] === snap) return false;   // 没变化 → 不入栈
    stack = stack.slice(0, top + 1);
    stack.push(snap);
    if (stack.length > MAX) stack.shift();
    top = stack.length - 1;
    refreshTitle();
    return true;
  }

  /* 手势结束 → 下一轮事件循环取快照（此刻本轮处理器的写入已全部落地）。
     pending 保证同一次手势里的 pointerup + click 只跑一次。 */
  function mark() {
    syncSection(true);                          /* 先保证基线是本页的、且拍在"操作前" */
    if (!isTarget() || pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      push(capture());
    }, 0);
  }

  /* 恢复：把快照塞回临时 key，走主站标准恢复路径（静默）。 */
  function restore(snap) {
    global.__ryUndoQuiet = true;
    try {
      global.localStorage.setItem(KEY, snap);
      if (typeof global.runyeLoadProject === 'function') global.runyeLoadProject(KEY, true);  // ★ (key, silent)
    } catch (e) {
      /* 恢复失败不抛给用户，保持界面可用 */
    } finally {
      global.__ryUndoQuiet = false;
      try { global.localStorage.removeItem(KEY); } catch (e2) { }
    }
    /* 成组页的画布是自绘的，恢复后要让它重画一次（其余两页由 runyeLoadProject 内部刷新）。 */
    try {
      if (activeSec() === 'grPipeSection' && typeof global.grRefreshGroupPage === 'function') {
        global.grRefreshGroupPage();
      }
    } catch (e3) { }
  }

  function undo() {
    if (top <= 0) { tip('没有可回退的步骤'); return false; }
    top--;
    restore(stack[top]);
    tip('已回退上一步（还可回退 ' + top + ' 步）');
    return true;
  }

  /* —— 轻量提示条（自建，1.2s 自动消失；不依赖主站 toast，避免跨 IIFE 调用）—— */
  var tipEl = null, tipT = 0;
  function tip(msg) {
    try {
      if (!tipEl) {
        tipEl = document.createElement('div');
        tipEl.id = 'ryUndoTip';
        tipEl.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);' +
          'background:rgba(15,23,42,.86);color:#fff;padding:7px 14px;border-radius:4px;' +
          'font-size:12px;line-height:1.3;z-index:99999;pointer-events:none;' +
          'opacity:0;transition:opacity .16s';
        document.body.appendChild(tipEl);
      }
      tipEl.textContent = msg;
      tipEl.style.opacity = '1';
      clearTimeout(tipT);
      tipT = setTimeout(function () { if (tipEl) tipEl.style.opacity = '0'; }, 1200);
    } catch (e) { }
  }

  /* —— 事件挂接 —— */
  ['pointerup', 'click', 'change'].forEach(function (t) {
    document.addEventListener(t, mark, true);
  });
  /* 输入类：连续敲键合并成一步（否则每敲一个字符都算一步） */
  document.addEventListener('input', function () {
    if (!isTarget()) return;
    clearTimeout(timer);
    timer = setTimeout(function () { push(capture()); }, INPUT_MERGE_MS);
  }, true);

  document.addEventListener('keydown', function (e) {
    if (global.__ryUndoInjectDisable) return;   /* 仅注入体检用：关掉拦截以证明本探针不是恒绿 */
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (String(e.key).toLowerCase() !== 'z') return;
    if (!isTarget()) return;              // 非目标页 → 完全不插手
    if (!undo()) { e.preventDefault(); return; }
    e.preventDefault();
  }, true);

  /* 状态栏右侧角标：显示当前可回退步数（元素不存在就静默跳过） */
  function refreshTitle() {
    try {
      var b = document.getElementById('ryUndoBadge');
      if (!b) {
        var host = document.querySelector('.ry-statusbar');
        if (!host) return;
        b = document.createElement('span');
        b.id = 'ryUndoBadge';
        b.style.cssText = 'font-size:11px;opacity:.72;margin-left:6px';
        host.appendChild(b);
      }
      b.textContent = top > 0 ? '↩ 可回退 ' + top + ' 步' : '';
    } catch (e) { }
  }

  /* 基线：等主站初始化完成（首次能取到快照）再压入 stack[0] */
  (function boot() {
    var tries = 0;
    (function step() {
      tries++;
      var s = capture();
      if (s) { push(s); return; }
      if (tries < 40) setTimeout(step, 300);
    })();
  })();

  global.RyUndo = {
    undo: undo,
    capture: capture,
    push: push,
    depth: function () { return top; },
    debug: function () { return { top: top, len: stack.length, target: isTarget(), sec: activeSec() }; }
  };
})(window);
