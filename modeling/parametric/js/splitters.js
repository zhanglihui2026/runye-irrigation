/* =========================================================
   splitters.js — 三个大区之间的可拖动分隔条

   区域划分：
     A 绘图区          #vp2dWrap
     B 参数 + 三维区   #bottomRow（三维预览 ⑦ 与参数调节 ⑧）
     C 电池区          #right（节点画布 ⑩ / 说明条 ⑪）
     页面级竖栏        ④ 绘图工具栏 #drawRail（整页最左）、
                       ⑨ 电池工具栏 #battRail（整页最右）
                       —— 两者不参与三大区拖动，splitV 分配空间时必须剔除

   两条分隔条：
     #splitH  A 与 B 之间：始终上下拖动，改变 B 的高度（A 自动吃掉剩余）
     #splitV  B/C 与 C 之间：宽屏左右拖动改变左栏宽度；
              窄屏（#main 转为纵向堆叠）自动切换成上下拖动，改变左栏高度

   重绘机制：app.js 监听 window 的 resize，统一调用
   viewport.resize() / renderer.resize() / nodeEditor.render()。
   因此分隔条只需在尺寸变化后派发一次 resize，三个区就会一起重排，
   不需要各模块额外暴露接口。

   状态：只存于当前会话（内联样式），刷新/重新载入回到默认布局。
   未拖动过时不写入任何内联样式，默认观感与静态布局逐像素一致。
   ========================================================= */
(function (global) {
  'use strict';

  var MIN_DRAW = 120;    // A 区最小高度（像素）
  var MIN_BOTTOM = 120;  // B 区最小高度（像素）
  var MIN_SIDE = 260;    // splitV 两侧各自的最小尺寸（像素）

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** #main 是否已转为纵向堆叠（窄屏 / 矮屏媒体查询） */
  function stacked() {
    var m = $('main');
    return !!m && global.getComputedStyle(m).flexDirection === 'column';
  }

  /* 重绘调度：拖动中用 rAF 合并，松手时兜底再派发一次 */
  var pending = false;
  function invalidate() {
    global.dispatchEvent(new Event('resize'));
  }
  function invalidateSoon() {
    if (pending) return;
    pending = true;
    global.requestAnimationFrame(function () {
      pending = false;
      invalidate();
    });
  }

  /**
   * 绑定一条分隔条。
   * opts.begin(e) → 返回起始状态对象（含鼠标起点与起始尺寸），返回 null 则放弃
   * opts.apply(st, dx, dy) → 按位移应用新尺寸
   * opts.reset() → 清除内联样式回到默认
   * opts.axis() → 'x' 左右拖动 / 'y' 上下拖动（决定光标样式）
   */
  function bind(bar, opts) {
    var st = null;

    function onMove(e) {
      if (!st) return;
      opts.apply(st, e.clientX - st.cx, e.clientY - st.cy);
      invalidateSoon();
    }

    function onUp() {
      if (!st) return;
      st = null;
      bar.classList.remove('dragging');
      document.body.classList.remove('splitting', 'splitting-col', 'splitting-row');
      global.removeEventListener('mousemove', onMove);
      global.removeEventListener('mouseup', onUp);
      invalidate();
    }

    bar.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      st = opts.begin(e);
      if (!st) return;
      bar.classList.add('dragging');
      document.body.classList.add('splitting', 'splitting-' + (opts.axis() === 'x' ? 'col' : 'row'));
      global.addEventListener('mousemove', onMove);
      global.addEventListener('mouseup', onUp);
    });

    // 双击复位：清除内联样式，回到 CSS 定义的默认比例
    bar.addEventListener('dblclick', function () {
      opts.reset();
      invalidate();
    });
  }

  /* ---------- #splitH：A 绘图区 ↔ B 参数+三维区 ---------- */
  function bindH() {
    var bar = $('splitH');
    if (!bar) return;
    bind(bar, {
      axis: function () { return 'y'; },
      begin: function (e) {
        var vp = $('vp2dWrap'), br = $('bottomRow');
        if (!vp || !br) return null;
        return {
          cx: e.clientX, cy: e.clientY,
          h0: br.getBoundingClientRect().height,
          total: vp.getBoundingClientRect().height + br.getBoundingClientRect().height,
        };
      },
      apply: function (st, dx, dy) {
        var br = $('bottomRow');
        if (!br) return;
        // 向下拖动 → B 变矮、A 变高；两侧各自不小于下限
        var max = Math.max(MIN_BOTTOM, st.total - MIN_DRAW);
        var h = clamp(st.h0 - dy, MIN_BOTTOM, max);
        br.style.flex = '0 0 auto';
        br.style.height = h + 'px';
        br.style.minHeight = '0';   // 解除 CSS 的 min-height:170px / max-height:360px
        br.style.maxHeight = 'none';
      },
      reset: function () {
        var br = $('bottomRow');
        if (!br) return;
        br.style.flex = ''; br.style.height = ''; br.style.minHeight = ''; br.style.maxHeight = '';
      },
    });
  }

  /* ---------- #splitV：左侧两区 ↔ C 电池区 ---------- */
  function bindV() {
    var bar = $('splitV');
    if (!bar) return;

    // 方向随 #main 的 flex-direction 切换，并保持 aria 语义同步
    function syncOrientation() {
      var vertical = !stacked();
      bar.classList.toggle('as-row', !vertical);
      bar.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
      return vertical;
    }
    syncOrientation();
    global.addEventListener('resize', syncOrientation);

    /** 解除右栏与节点区的 640px 最小宽，否则左栏拖不动 */
    function relaxMinWidth() {
      var right = $('right'), ne = $('nodeEditor');
      if (right) right.style.minWidth = '0';
      if (ne) ne.style.minWidth = '0';
    }

    bind(bar, {
      axis: function () { return stacked() ? 'y' : 'x'; },
      begin: function (e) {
        var left = $('left'), right = $('right'), main = $('main');
        if (!left || !right || !main) return null;
        var vertical = !stacked();
        var lr = left.getBoundingClientRect();
        var rr = right.getBoundingClientRect();
        // 可用空间 = 左栏 + 分隔条 + 电池区。不能用 #main 总尺寸：
        // ④/⑨ 两条页面级竖栏（rail）不参与分配，否则右栏会被压穿 260px 保底。
        return {
          cx: e.clientX, cy: e.clientY, vertical: vertical,
          size0: vertical ? lr.width : lr.height,
          mainSize: vertical ? (lr.width + bar.offsetWidth + rr.width)
                             : (lr.height + bar.offsetHeight + rr.height),
          barSize: vertical ? bar.offsetWidth : bar.offsetHeight,
        };
      },
      apply: function (st, dx, dy) {
        var left = $('left');
        if (!left) return;
        relaxMinWidth();
        var delta = st.vertical ? dx : dy;
        var max = Math.max(MIN_SIDE, st.mainSize - st.barSize - MIN_SIDE);
        var v = clamp(st.size0 + delta, MIN_SIDE, max);
        left.style.flex = '0 0 ' + v + 'px';
        if (st.vertical) { left.style.width = v + 'px'; left.style.height = ''; }
        else { left.style.height = v + 'px'; left.style.width = ''; }
      },
      reset: function () {
        var left = $('left'), right = $('right'), ne = $('nodeEditor');
        if (left) { left.style.flex = ''; left.style.width = ''; left.style.height = ''; }
        if (right) right.style.minWidth = '';
        if (ne) ne.style.minWidth = '';
      },
    });
  }

  function init() {
    bindH();
    bindV();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
