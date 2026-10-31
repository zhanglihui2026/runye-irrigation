/* 总管编辑的撤销 / 重做栈（四期）。
 *
 * 为什么单独一个文件：撤销栈最容易出的错不是"算错"，而是**改错数据域**。
 * 这个模块只认一个东西 —— `plot.trunk` 这棵子树。它不 import 任何东西，
 * 也不碰 Leaflet / localStorage，所以可以在 Node 里把「50 步不爆」「切地块清栈」
 * 这些规则逐条断言。
 *
 * 三条硬规则（改之前先读）：
 *   ① 快照**只含 `trunk` 子树 + 选中态**。不含 `plot.polyLatLng`、不含 `revision`。
 *      带上 revision 就会出现"撤销把别的页面刚推进的版本号顶回去"。
 *   ② 记录走「状态栈 + 游标」：栈里存的是**完整状态**，不是差量。
 *      undo/redo 都只是"把游标挪一格然后把那一格写回库"，没有逆运算可写错。
 *      代价是每步一份 JSON，所以有 LIMIT（默认 50，超出丢最旧）。
 *   ③ `record(before, after)` 必须拿到**写库前的真实值**。它不只用来建基线，
 *      还用来发现"栈顶和现实对不上"（别的标签页改过、或切了地块）——
 *      这时就地重开栈，绝不硬接在旧栈上：硬接的结果是一次撤销跳到另一块地的状态。
 */
(function (root) {
  'use strict';

  var LIMIT = 50;

  function clone(v) {
    if (v === undefined || v === null) return null;
    return JSON.parse(JSON.stringify(v));
  }
  /* undefined 与 null 都当"没有总管"，否则同一件事在栈里会有两种写法，比较永远不等。 */
  function norm(v) {
    return (v === undefined || v === null) ? null : v;
  }
  function same(a, b) {
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  }

  function create(opts) {
    opts = opts || {};
    var limit = (isFinite(opts.limit) && opts.limit >= 2) ? Math.floor(opts.limit) : LIMIT;

    var stack = [];       // [{trunk, activeTrunkId}]
    var cursor = -1;      // 当前状态在 stack 里的下标
    var plotId = null;    // 这摞快照属于哪块地
    var dropped = 0;      // 因超限被丢掉的旧快照数（探针要看得到"丢了"而不是"没丢")
    var pushes = 0;       // 实际入栈次数

    function clear() {
      stack = [];
      cursor = -1;
      plotId = null;
    }

    /* 从一条基线重开栈：stack=[baseline]，cursor=0。 */
    function reset(trunk, plot, activeId) {
      stack = [{ trunk: clone(norm(trunk)), activeTrunkId: activeId == null ? null : String(activeId) }];
      cursor = 0;
      plotId = plot == null ? null : String(plot);
    }

    /* 一次成功写库后的记账。返回 {ok, pushed}。 */
    function record(rec) {
      rec = rec || {};
      var pid = rec.plotId == null ? null : String(rec.plotId);
      var before = norm(rec.before);
      var after = norm(rec.after);
      var activeId = rec.activeTrunkId == null ? null : String(rec.activeTrunkId);

      var orphan = !stack.length || cursor < 0 || plotId !== pid || !same(stack[cursor].trunk, before);
      if (orphan) reset(before, pid, activeId);

      /* 内容没变就不入栈：否则"点了保存但什么都没改"也会占掉一步撤销。 */
      if (same(stack[cursor].trunk, after)) return { ok: true, pushed: false };

      /* 在历史中间做了新编辑 ⇒ 砍掉重做分支（标准 undo 语义） */
      stack = stack.slice(0, cursor + 1);
      stack.push({ trunk: clone(after), activeTrunkId: activeId });
      cursor = stack.length - 1;
      pushes++;

      while (stack.length > limit) {
        stack.shift();          // 丢最旧
        cursor--;
        dropped++;
      }
      return { ok: true, pushed: true };
    }

    function undo() {
      if (cursor <= 0) return { ok: false, reason: 'empty' };
      cursor--;
      return { ok: true, state: clone(stack[cursor]), at: cursor };
    }
    function redo() {
      if (cursor < 0 || cursor >= stack.length - 1) return { ok: false, reason: 'empty' };
      cursor++;
      return { ok: true, state: clone(stack[cursor]), at: cursor };
    }
    function canUndo() { return cursor > 0; }
    function canRedo() { return cursor >= 0 && cursor < stack.length - 1; }
    function stats() {
      return {
        size: stack.length,
        cursor: cursor,
        canUndo: canUndo(),
        canRedo: canRedo(),
        limit: limit,
        plotId: plotId,
        dropped: dropped,
        pushes: pushes
      };
    }

    return {
      LIMIT: limit,
      reset: reset,
      clear: clear,
      record: record,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      canRedo: canRedo,
      stats: stats
    };
  }

  root.RyTrunkHistory = {
    LIMIT: LIMIT,
    create: create,
    same: same,
    clone: clone,
    norm: norm
  };
})(typeof window !== 'undefined' ? window : this);
