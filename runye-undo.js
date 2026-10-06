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

  /* ★ 每页一个独立的撤销栈（v284c 实测修正）：
     原实现是「一个全局栈 + 每次进入目标页就 stack=[] 重设基线」，
     后果是**中途去别的页（哪怕只是去材料清单看一眼）再回来，历史全被清空**
     （实测：布管后栈深 1 → 往返一次 → 栈深 0，Ctrl+Z 提示「没有可回退的步骤」），
     这与「不管做了什么指令，只要 Ctrl+Z 就回退上一步」不符。
     改成 ALL[secId] = {stack, top}：首次进入某页时建立该页基线与栈，
     之后再进出只切换当前栈、原样保留历史；撤销也只在本页栈内回退，
     天然不会把别页的状态撤到当前页来。 */
  var ALL = {};                 // secId -> {stack: [], top: -1}
  var timer = 0;
  var pending = false;

  function slot(id) {
    if (!ALL[id]) ALL[id] = { stack: [], top: -1 };
    return ALL[id];
  }
  function curSlot() {
    var id = activeSec();
    return (id && SECS.indexOf(id) >= 0) ? slot(id) : null;
  }

  function activeSec() {
    var s = document.querySelector('main > .ry-sec.ry-active');
    return s ? s.id : null;
  }
  function isTarget() {
    var id = activeSec();
    return !!id && SECS.indexOf(id) >= 0;
  }

  /* 快照里凡是「时间戳」都要抹平：runyeSaveProject 每次都写 savedAt，
     isoDiagram.editor / terrain / constructionNet 等子对象里也可能带自己的时间字段。
     只要有一处时间戳，两份内容完全相同的快照字符串就永不相等
     ⇒ push 去重、undo 的「跳过相同项」双双失效 ⇒ 按 Ctrl+Z 看起来没反应。
     恢复时这些字段无人读取，抹平无副作用。 */
  function stripVolatile(o, depth) {
    depth = depth || 0;
    if (!o || typeof o !== 'object' || depth > 8) return o;
    if (Object.prototype.toString.call(o) === '[object Array]') {
      for (var i = 0; i < o.length; i++) {
        if (o[i] && typeof o[i] === 'object') stripVolatile(o[i], depth + 1);
      }
      return o;
    }
    for (var k in o) {
      var v = o[k];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) o[k] = '';
      else if (typeof v === 'number' && v > 1e12 && v < 2e12) o[k] = 0;   // 毫秒级时间戳
      else if (v && typeof v === 'object') stripVolatile(v, depth + 1);
    }
    return o;
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
      /* ★ 归一化 savedAt 后才能当快照用：runyeSaveProject 每次都写
         `savedAt:new Date().toISOString()`，两次相隔 1ms 的快照字符串也永不相等
         ⇒ push 的去重彻底失效 ⇒ 同一状态被反复入栈 ⇒ 按一次 Ctrl+Z 只是退到
         "同一状态的另一份副本"，表现就是"按了没反应"（本轮 M2 实测抓到）。
         恢复时 savedAt 无人读取，置空无副作用。 */
      if (s) {
        try { s = JSON.stringify(stripVolatile(JSON.parse(s))); }
        catch (e5) { /* 解析不动就原样用 */ }
      }
      return s || null;
    } catch (e) {
      return null;
    } finally {
      global.__ryUndoQuiet = prev;
      try { global.localStorage.removeItem(KEY); } catch (e2) { }
    }
  }

  /* ★ 基线必须**按页**建立（本轮实测踩到）：快照是整站级的，但**页面上下文**是分页的。
     若基线拍在"成组页还没进入（__runyeGroupEdit 尚未建立）"的时刻，
     用户在成组页布完管按 Ctrl+Z 会退到"整页空掉"—— 那不是他要的"上一步"。
     ⇒ 首次进入某目标页时，为该页单独建栈并把"进入这一页时的状态"作为它的 stack[0]；
       再次进出**不重设**（否则去趟一趟杠料清单就丢光全部历史）。
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
    var S = slot(id);
    /* ★ 该页已有基线 ⇒ 原样保留历史（这就是“往返不清空”的关键），只清掉待拍的基线定时器。 */
    if (S.top >= 0) { clearTimeout(resetT); return true; }
    clearTimeout(resetT);
    if (immediate) { var s = capture(); if (s) pushTo(S, s); return true; }
    resetT = setTimeout(function () { var s = capture(); if (s) pushTo(S, s); }, 400);
    return true;
  }
  setInterval(function () { syncSection(false); }, 1000);

  function pushTo(S, snap) {
    if (!S || !snap) return false;
    if (S.top >= 0 && S.stack[S.top] === snap) return false;   // 没变化 → 不入栈
    S.stack = S.stack.slice(0, S.top + 1);
    S.stack.push(snap);
    if (S.stack.length > MAX) S.stack.shift();
    S.top = S.stack.length - 1;
    refreshTitle();
    return true;
  }
  function push(snap) { return pushTo(curSlot(), snap); }

  /* 手势结束 → 下一轮事件循环取快照（此刻本轮处理器的写入已全部落地）。
     pending 保证同一次手势里的 pointerup + click 只跑一次。 */
  function mark() {
    syncSection(true);                          /* 先保证基线是本页的、且拍在"操作前" */
    if (!isTarget() || pending) return;
    pending = true;
    /* ★ 改成「操作前 / 操作后」双快照：完整回归探针实测同一份代码在两条路径下结论相反
       （最小路径 28→0 通过、完整路径 U1② 停在 28），说明只靠"与栈顶比对"会把
       某一次的"操作后状态"当成基线 ⇒ 那一步就变得不可撤销。
       捕获阶段一定是"操作前"，先入栈它（与栈顶相同会被 push 去重跳过），
       再入栈"操作后" ⇒ 撤销必然回到这一步之前，不再依赖基线时机。
       代价是每次手势多一次序列化；capture 内部已跳过材料重算，实测可接受。 */
    var pre = capture();
    setTimeout(function () {
      pending = false;
      if (pre) push(pre);
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
      /* 恢复失败不抛给用户，保持界面可用；但要留下现场，否则"按了没反应"无从查起 */
      try { global.__ryUndoLastError = String((e && e.message) || e); } catch (e4) { }
    } finally {
      global.__ryUndoQuiet = false;
      try { global.localStorage.removeItem(KEY); } catch (e2) { }
    }
    /* ★ 三级页「联合灌溉 1/2/3/4 区」按钮组的高亮是**纯 DOM 状态**，不在工程快照里（快照只有 tlDiagramData.combinedN）。
       撤销后数据回到上一步、按钮却仍停在旧选项，界面与数据不一致
       （实测：点「4 区」→ Ctrl+Z，combinedN 已回 2，按钮仍高亮「4 区」）。
       恢复后按 combinedN 把高亮同步回去；只做这一件事，不重建整条重算链。 */
    try {
      if (activeSec() === 'tlPipePlanSection') {
        var zcn = global.tlDiagramData ? global.tlDiagramData.combinedN : null;
        if (typeof zcn === 'number' && isFinite(zcn)) {
          var zcg = document.getElementById('tlZoneCountGroup');
          if (zcg) {
            zcg.querySelectorAll('button').forEach(function (b) {
              b.classList.toggle('selected', String(b.getAttribute('data-n')) === String(zcn));
            });
          }
        }
      }
    } catch (e5) { }
    /* 成组页的画布是自绘的，恢复后要让它重画一次（其余两页由 runyeLoadProject 内部刷新）。 */
    try {
      if (activeSec() === 'grPipeSection' && typeof global.grRefreshGroupPage === 'function') {
        global.grRefreshGroupPage();
      }
    } catch (e3) { }
  }

  function undo() {
    var S = curSlot();
    if (!S || S.top <= 0) { tip('没有可回退的步骤'); return false; }
    /* ★ 向前跳过「与当前状态相同」的快照。
       入栈时机不总能完美命中「操作前」（实测：按钮绑在 pointerdown、程序化 click()
       不产生 pointer 事件……都可能让栈里出现连续两份"操作后"），只做 top-- 就会退到
       一份和现在一模一样的快照 ⇒ 用户看到的就是"按了没反应"。
       改成"退到第一个和现在不同的状态"，撤销语义才稳。 */
    var cur = capture();
    var i = S.top - 1;
    while (i >= 0 && S.stack[i] === cur) i--;
    if (i < 0) { S.top = 0; tip('没有可回退的步骤'); return false; }
    S.top = i;
    restore(S.stack[i]);
    tip('已回退上一步（还可回退 ' + S.top + ' 步）');
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
  /* ★ 必须是 pointerdown，不能是 pointerup：本工程不少按钮（含 #ppAutoPipe 自动管路）
     把动作绑在 **pointerdown / mousedown** 上，等 pointerup 冒泡到 document 时
     动作早已执行完 ⇒ "操作前"快照拍到的其实是"操作后"（dump 实测：
     栈里第二项 pm 就已经是 28 根）⇒ 按一次 Ctrl+Z 退到它，表现就是"没反应"。
     捕获阶段的 pointerdown 一定早于元素上的任何处理器。 */
  ['pointerdown', 'click', 'change'].forEach(function (t) {
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
      var S = curSlot();
      var n = S ? S.top : -1;
      b.textContent = n > 0 ? '↩ 可回退 ' + n + ' 步' : '';
    } catch (e) { }
  }

  /* 预热：等主站初始化完成（能取到快照）即可；基线不再在这里压 ——
     每页的基线由 syncSection 在**首次进入该页**时建立（否则会把别的页的状态当成本页基线）。 */
  (function boot() {
    var tries = 0;
    (function step() {
      tries++;
      var s = capture();
      if (s) return;
      if (tries < 40) setTimeout(step, 300);
    })();
  })();

  global.RyUndo = {
    undo: undo,
    capture: capture,
    push: push,
    depth: function () { var S = curSlot(); return S ? S.top : -1; },
    debug: function () { var S = curSlot(); return { top: S ? S.top : -1, len: S ? S.stack.length : 0, target: isTarget(), sec: activeSec(), pages: Object.keys(ALL) }; },
    /* 诊断用：把栈里每一份快照的关键字段摊开（"按了没反应"时第一手要看的东西） */
    dump: function () {
      var S = curSlot(); if (!S) return [];
      var out = [];
      for (var i = 0; i <= S.top && i < S.stack.length; i++) {
        try {
          var d = JSON.parse(S.stack[i]);
          var pp = d.pipePlan || {};
          var m = pp.mainPipes ? pp.mainPipes.length : null;
          if (m === null && pp.mains) m = pp.mains.length;
          out.push({ i: i, pm: m, ppKeys: Object.keys(pp).slice(0, 10), size: S.stack[i].length });
        } catch (e) { out.push({ i: i, parse: 'fail' }); }
      }
      return out;
    }
  };
})(window);
