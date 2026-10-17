/* Shared interactions for the first Runye panel pilot. */
(function (global) {
  'use strict';

  function safeRead(key) {
    try { return global.localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeWrite(key, value) {
    try { global.localStorage.setItem(key, value); } catch (_) {}
  }
  function safeRemove(key) {
    try { global.localStorage.removeItem(key); } catch (_) {}
  }
  /* ================================================================
   * [v544] 拖动/折叠/调宽的共用口径
   * ────────────────────────────────────────────────────────────────
   * 背景：「图层控制」#tlWsLayerPanel（inline-27）、「驳接点/管径/水头损失」#grHydPanel
   * （inline-30）、「AI 灌溉方案规划」（runye-ai-plan）三张卡片各自手写了一套
   * pointerdown/move/up + 4px 阈值 + 抑制误触 + 双击复位 + localstorage 记忆，
   * 代码近似但细节不同（有的存 {x,y}、有的存 {l,t}；有的折叠不回写）。
   * 现在只在这里实现一次，卡片用 data-ry-* 属性声明，不再复制粘贴。
   *
   * 拖动结束后的 250ms 内，折叠处理器会忽略 click —— 这是「拖完手一抖就折叠了」
   * 的唯一防线，三份旧实现各自用 suppressClick 变量做过同一件事。
   * ================================================================ */
  function markDragged(rootEl) {
    rootEl.dataset.rypDraggedAt = String(Date.now());
  }
  function recentlyDragged(rootEl) {
    var t = Number(rootEl.dataset.rypDraggedAt || 0);
    return t > 0 && (Date.now() - t) < 250;
  }
  /* 视口安全区：顶不越吸顶导航、底不越常驻状态栏（AI 面板 v278/v279 的约束下沉到这里）。
     状态栏只有真的 fixed 时才有「上沿」可言，窄屏会退化成 static ⇒ 以视口下沿为界。 */
  function safeTop() {
    var nav = document.querySelector('.fn-nav');
    if (nav) { var r = nav.getBoundingClientRect(); if (r.height > 0 && r.bottom > 0) return Math.round(r.bottom); }
    var h = 0;
    try { h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fn-nav-h')) || 0; } catch (e) { }
    return h > 0 ? Math.round(h) : 36;
  }
  function safeBottom() {
    var vh = global.innerHeight || document.documentElement.clientHeight || 800;
    var el = document.getElementById('ryStatusBar');
    if (el) {
      var pos = '';
      try { pos = getComputedStyle(el).position || ''; } catch (e) { }
      if (pos === 'fixed') { var r = el.getBoundingClientRect(); if (r.height > 0 && r.top > 0) return Math.round(r.top); }
    }
    return vh - 1;
  }

  function rypCollapsible(rootEl) {
    if (!rootEl || rootEl.dataset.rypCollapseReady === '1') return;
    var button = rootEl.querySelector('[data-ry-fold]');
    var body = rootEl.querySelector('[data-ry-body]');
    var rail = rootEl.querySelector('[data-ry-rail]');
    var toggleArea = rootEl.querySelector('[data-ry-toggle]');
    if (!button || !body) return;
    rootEl.dataset.rypCollapseReady = '1';
    var key = rootEl.dataset.ryFoldKey;
    var legacyKey = rootEl.dataset.ryFoldLegacyKey;
    /* [v544] data-ry-fold-default="1"：没有存档时的初始态（移动端默认收起用，
       不改写 localStorage ⇒ 换到桌面端仍是展开）。
       ⚠ 这里必须算出**严格 boolean**：旧写法
         `safeRead(key) === '1' || (!safeRead(key) && legacyKey && safeRead(legacyKey) === '1')`
       在 `legacyKey` 未声明（#designParametersPanel 就是这种）时整条 `&&` 链返回 undefined，
       而 `classList.toggle('folded', undefined)` 在 Chromium 里等价于「没给 force」= 纯 toggle
       ⇒ **首次访问反而被折叠成 48px 竖条**（实测线上 class=input-panel 是展开的，
       本地 HEAD 快照反而是 folded —— 就是这个 undefined 造成的）。现在恒为 boolean。 */
    var storedFold = safeRead(key);
    var folded = storedFold === '1'
      || (storedFold == null && rootEl.dataset.ryFoldDefault === '1')
      || (storedFold == null && !!legacyKey && safeRead(legacyKey) === '1');
    function render() {
      rootEl.classList.toggle('folded', folded);
      button.setAttribute('aria-expanded', folded ? 'false' : 'true');
      button.textContent = folded ? (button.dataset.ryFoldClosed || '▸') : (button.dataset.ryFoldOpen || '▾');
      body.hidden = folded;
      rootEl.dispatchEvent(new CustomEvent('ry-panel-fold', { detail: { folded: folded } }));
    }
    function toggle() {
      if (recentlyDragged(rootEl)) return;   /* [v544] 拖动尾随的 click 不折叠 */
      folded = !folded;
      safeWrite(key, folded ? '1' : '0');
      if (legacyKey) safeWrite(legacyKey, folded ? '1' : '0');
      render();
    }
    button.addEventListener('click', toggle);
    if (toggleArea) toggleArea.addEventListener('click', function (event) {
      if (event.target.closest('[data-ry-fold]')) return;
      toggle();
    });
    if (rail) rail.addEventListener('click', function () {
      if (!folded) return;
      folded = false;
      safeWrite(key, '0');
      if (legacyKey) safeWrite(legacyKey, '0');
      render();
      button.focus();
    });
    render();
  }

  /* ================================================================
   * rypDraggable —— 标题栏拖动
   * 声明式开关（都写在根节点的 data-ry-* 上）：
   *   data-ry-position-key       存档键（JSON {l,t}；兼容旧存档 {x,y}）
   *   data-ry-position-legacy-key 迁移期旧键
   *   data-ry-keep-default="1"   没有存档时不重排默认位置（位置由 CSS 的 right/top 决定，
   *                              拖动前一个像素都不动 —— 卡片类面板用这个）
   *   data-ry-drag-threshold="4" 位移超过 4px 才算拖动（同时抑制随后的 click 折叠）
   *   data-ry-drag-dblclick-reset="1" 双击标题栏 = 清存档 + 回默认位
   *   data-ry-drag-clamp="viewport"  以视口为界并避让导航/状态栏（fixed 面板用）；
   *                              缺省按父元素边界夹紧
   * 事件：拖动结束派发 'ry-panel-drag-end'（detail.moved）；双击复位派发 'ry-panel-pos-reset'
   * ================================================================ */
  function rypDraggable(rootEl) {
    if (!rootEl || rootEl.dataset.rypDragReady === '1') return;
    var handle = rootEl.querySelector('[data-ry-drag]');
    var clampToViewport = rootEl.dataset.ryDragClamp === 'viewport';
    var bounds = clampToViewport ? null : ((rootEl.parentElement && rootEl.parentElement.closest('[data-ry-drag-bounds]')) || rootEl.parentElement);
    if (!handle || (!bounds && !clampToViewport)) return;
    rootEl.dataset.rypDragReady = '1';
    var key = rootEl.dataset.ryPositionKey;
    var legacyKey = rootEl.dataset.ryPositionLegacyKey;
    var keepDefault = rootEl.dataset.ryKeepDefault === '1';
    var threshold = Number(rootEl.dataset.ryDragThreshold) || 0;
    var dblReset = rootEl.dataset.ryDragDblclickReset === '1';
    /* 默认位的原始内联值：CSS 里 right:300px 这类是写在创建时的 cssText 上的，
       拖动会把 right 改成 auto，reset 必须能原样还回去。 */
    var preset = { l: rootEl.style.left, t: rootEl.style.top, r: rootEl.style.right, b: rootEl.style.bottom };
    function limits() {
      if (clampToViewport) {
        return { minL: 4, minT: safeTop(), maxL: (global.innerWidth || 1200) - rootEl.offsetWidth - 4, maxT: safeBottom() - rootEl.offsetHeight - 4 };
      }
      return { minL: 0, minT: 0, maxL: Math.max(0, bounds.clientWidth - rootEl.offsetWidth - 4), maxT: Math.max(0, bounds.clientHeight - rootEl.offsetHeight - 4) };
    }
    function place(left, top) {
      var q = limits();
      rootEl.style.right = 'auto';
      rootEl.style.left = Math.max(q.minL, Math.min(left, q.maxL)) + 'px';
      rootEl.style.top = Math.max(q.minT, Math.min(top, q.maxT)) + 'px';
    }
    var hasPos = false;
    var saved = null;
    try { saved = JSON.parse(safeRead(key) || (legacyKey && safeRead(legacyKey)) || 'null'); } catch (_) {}
    /* 存档位置要等容器真的可见才落位：区块默认 display:none 时 rect 全 0，
       夹紧会把面板压到 (0,0) 并停在那儿（v248b 在快捷条上踩过）。 */
    function placeWhenVisible(left, top, tries) {
      if (bounds && (bounds.clientWidth < 50 || bounds.clientHeight < 50) && tries > 0) {
        setTimeout(function () { placeWhenVisible(left, top, tries - 1); }, 200);
        return;
      }
      place(left, top);
    }
    if (saved) {
      /* 旧存档两种格式：卡片家族存 {x,y}，框架面板存 {l,t} */
      var sl = typeof saved.l === 'number' ? saved.l : saved.x;
      var st = typeof saved.t === 'number' ? saved.t : saved.y;
      if (typeof sl === 'number' && typeof st === 'number') { placeWhenVisible(sl, st, 50); hasPos = true; }
    }
    if (!hasPos && !keepDefault) {
      /* [v494] data-ry-default-left：默认水平位置钩子（地图绘制工具条默认贴地图区左侧顶端）；
         未设置时保持原逻辑=右缘内缩 12px，既有面板零影响。 */
      var dl = rootEl.dataset.ryDefaultLeft;
      place(dl != null && dl !== '' ? Number(dl) : bounds.clientWidth - rootEl.offsetWidth - 12, Number(rootEl.dataset.ryDefaultTop) || 96);
      hasPos = true;
    }
    var dragging = false, moved = false, offsetX = 0, offsetY = 0, startX = 0, startY = 0;
    handle.addEventListener('pointerdown', function (event) {
      if (event.target.closest('[data-ry-fold]')) return;
      if (event.button !== undefined && event.button !== 0) return;
      dragging = true; moved = false;
      startX = event.clientX; startY = event.clientY;
      offsetX = event.clientX - rootEl.offsetLeft;
      offsetY = event.clientY - rootEl.offsetTop;
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
      if (!threshold) event.preventDefault();
    });
    handle.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      if (threshold && !moved) {
        if (Math.abs(event.clientX - startX) < threshold && Math.abs(event.clientY - startY) < threshold) return;
        moved = true;
        try { event.preventDefault(); } catch (_) {}
      } else {
        moved = true;
      }
      place(event.clientX - offsetX, event.clientY - offsetY);
      hasPos = true;
    });
    function finish() {
      if (!dragging) return;
      dragging = false;
      if (!moved) { rootEl.dispatchEvent(new CustomEvent('ry-panel-drag-end', { detail: { moved: false } })); return; }
      markDragged(rootEl);
      var value = JSON.stringify({ l: rootEl.offsetLeft, t: rootEl.offsetTop });
      safeWrite(key, value);
      if (legacyKey) safeWrite(legacyKey, value);
      rootEl.dispatchEvent(new CustomEvent('ry-panel-drag-end', { detail: { moved: true } }));
    }
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    if (dblReset) {
      handle.addEventListener('dblclick', function (event) {
        event.preventDefault();
        safeRemove(key);
        if (legacyKey) safeRemove(legacyKey);
        rootEl.style.left = preset.l; rootEl.style.top = preset.t;
        rootEl.style.right = preset.r; rootEl.style.bottom = preset.b;
        hasPos = keepDefault ? false : true;
        rootEl.dispatchEvent(new CustomEvent('ry-panel-pos-reset'));
      });
    }
    global.addEventListener('resize', function () {
      if (!hasPos || dragging) return;
      if (rootEl.style.left && rootEl.style.left !== 'auto') place(rootEl.offsetLeft, rootEl.offsetTop);
    });
  }

  /* ================================================================
   * rypResizePanel —— 宽度手柄（不依赖 .mw-shell，浮层卡片用）
   *   data-ry-resize           手柄元素
   *   data-ry-resize-key       存档键（兼容旧键：runye_tlWsLayerPanel_w 等）
   *   data-ry-resize-min/max   夹紧范围；data-ry-resize-default 双击复位值
   * 右锚定（right 定位）时拖左加宽；已被拖成左锚定后拖右加宽 —— 与旧实现一致。
   * ================================================================ */
  function rypResizePanel(rootEl) {
    if (!rootEl || rootEl.dataset.rypResizePanelReady === '1') return;
    var grip = rootEl.querySelector('[data-ry-resize]');
    if (!grip) return;
    rootEl.dataset.rypResizePanelReady = '1';
    var key = rootEl.dataset.ryResizeKey || ('runye_panel_' + (rootEl.dataset.ryPanelKey || rootEl.id || 'panel') + ':w');
    var minW = Number(rootEl.dataset.ryResizeMin) || 200;
    var maxW = Number(rootEl.dataset.ryResizeMax) || 480;
    var presetW = rootEl.style.width;
    var savedW = Number(safeRead(key));
    if (Number.isFinite(savedW) && savedW >= minW && savedW <= maxW) rootEl.style.width = savedW + 'px';
    function anchoredRight() { return !(rootEl.style.left && rootEl.style.left !== 'auto'); }
    function clampW(w) { return Math.round(Math.max(minW, Math.min(maxW, w))); }
    var pid = null, startX = 0, startW = 0, rightAnchor = true;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-valuemin', String(minW));
    grip.setAttribute('aria-valuemax', String(maxW));
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      /* 折叠态/不可见态宽度为 0：此时拖动只会把 0 写进存档，
         下次展开面板就"消失"了 ⇒ 直接不启动（v544 实测 AI 面板折叠时踩到过）。 */
      if (rootEl.offsetWidth < 40) return;
      event.preventDefault(); event.stopPropagation();
      pid = event.pointerId;
      startX = event.clientX;
      startW = rootEl.offsetWidth;
      rightAnchor = anchoredRight();
      grip.classList.add('dragging');
      try { grip.setPointerCapture(event.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', function (event) {
      if (pid === null || event.pointerId !== pid) return;
      var delta = event.clientX - startX;
      var next = rightAnchor ? (startW - delta) : (startW + delta);
      rootEl.style.width = clampW(next) + 'px';
    });
    function finishResize(event) {
      if (pid === null || (event && event.pointerId !== pid)) return;
      pid = null;
      grip.classList.remove('dragging');
      try { grip.releasePointerCapture(event.pointerId); } catch (_) {}
      safeWrite(key, String(rootEl.offsetWidth));
      markDragged(rootEl);
    }
    grip.addEventListener('pointerup', finishResize);
    grip.addEventListener('pointercancel', finishResize);
    grip.addEventListener('dblclick', function (event) {
      event.preventDefault();
      safeRemove(key);
      rootEl.style.width = presetW;      /* 还回创建时的宽度（通常是 cssText 里的默认值） */
    });
  }

  function rypResize(rootEl) {
    if (!rootEl || rootEl.dataset.rypResizeReady === '1') return;
    var grip = rootEl.querySelector('[data-ry-grip]');
    var shell = rootEl.closest('.mw-shell');
    if (!grip || !shell) return;
    rootEl.dataset.rypResizeReady = '1';
    var key = 'runye_panel_' + (rootEl.dataset.ryPanelKey || rootEl.id || 'panel');
    var minWidth = Number(rootEl.dataset.ryMin) || 280;
    var maxWidth = Number(rootEl.dataset.ryMax) || 520;
    var defaultWidth = Number(rootEl.dataset.ryReset) || 372;
    var savedWidth = Number(safeRead(key));
    var hasSavedWidth = Number.isFinite(savedWidth) && savedWidth >= minWidth && savedWidth <= maxWidth;

    function bounded(width) {
      var available = shell.clientWidth - 56 - 400;
      var max = Math.min(maxWidth, available > 0 ? available : maxWidth);
      return Math.round(Math.max(Math.min(minWidth, max), Math.min(width, max)));
    }
    function applyWidth(width, persist) {
      var next = bounded(width);
      shell.style.setProperty('--ryp-input-col-width', next + 'px');
      grip.setAttribute('aria-valuenow', String(next));
      if (persist) {
        savedWidth = next;
        hasSavedWidth = true;
        safeWrite(key, String(next));
      }
      return next;
    }
    function renderFoldWidth(folded) {
      if (folded) {
        shell.style.setProperty('--ryp-input-col-width', (Number(rootEl.dataset.ryFoldWidth) || 48) + 'px');
      } else if (hasSavedWidth) {
        applyWidth(savedWidth, false);
      } else {
        shell.style.removeProperty('--ryp-input-col-width');
      }
    }
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', '调整设计参数面板宽度；双击恢复默认宽度');
    grip.setAttribute('aria-valuemin', String(minWidth));
    grip.setAttribute('aria-valuemax', String(maxWidth));
    grip.setAttribute('aria-valuenow', String(hasSavedWidth ? bounded(savedWidth) : defaultWidth));
    grip.tabIndex = 0;
    if (hasSavedWidth && !rootEl.classList.contains('folded')) applyWidth(savedWidth, false);
    renderFoldWidth(rootEl.classList.contains('folded'));
    rootEl.addEventListener('ry-panel-fold', function (event) { renderFoldWidth(!!(event.detail && event.detail.folded)); });

    var startX = 0, startWidth = 0, dragging = false;
    grip.addEventListener('pointerdown', function (event) {
      if (global.matchMedia && global.matchMedia('(max-width: 1100px)').matches) return;
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      startX = event.clientX;
      startWidth = rootEl.parentElement.getBoundingClientRect().width;
      grip.classList.add('dragging');
      try { grip.setPointerCapture(event.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      applyWidth(startWidth + event.clientX - startX, false);
    });
    function finishResize() {
      if (!dragging) return;
      dragging = false;
      grip.classList.remove('dragging');
      var width = Number.parseInt(shell.style.getPropertyValue('--ryp-input-col-width'), 10);
      if (Number.isFinite(width)) applyWidth(width, true);
    }
    grip.addEventListener('pointerup', finishResize);
    grip.addEventListener('pointercancel', finishResize);
    grip.addEventListener('dblclick', function (event) {
      event.preventDefault();
      safeRemove(key);
      savedWidth = defaultWidth;
      hasSavedWidth = false;
      renderFoldWidth(rootEl.classList.contains('folded'));
    });
    grip.addEventListener('keydown', function (event) {
      if (event.key === 'Home') {
        event.preventDefault();
        safeRemove(key);
        hasSavedWidth = false;
        renderFoldWidth(rootEl.classList.contains('folded'));
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        var current = Number.parseInt(shell.style.getPropertyValue('--ryp-input-col-width'), 10) || defaultWidth;
        applyWidth(current + (event.key === 'ArrowRight' ? 10 : -10), true);
      }
    });
  }

  function rypShoelaceInputs(rootEl) {
    if (!rootEl || rootEl.dataset.rypShoelaceReady === '1') return;
    var proxies = rootEl.querySelectorAll('sl-input[data-ry-proxy-for]');
    if (!proxies.length || !global.customElements || !global.customElements.whenDefined) return;
    rootEl.dataset.rypShoelaceReady = '1';
    global.customElements.whenDefined('sl-input').then(function () {
      var descriptor = Object.getOwnPropertyDescriptor(global.HTMLInputElement.prototype, 'value');
      proxies.forEach(function (proxy) {
        var nativeInput = global.document.getElementById(proxy.dataset.ryProxyFor);
        if (!nativeInput || !descriptor || !descriptor.get || !descriptor.set) return;
        proxy.value = nativeInput.value;
        proxy.hidden = false;
        nativeInput.hidden = true;
        nativeInput.tabIndex = -1;
        nativeInput.setAttribute('aria-hidden', 'true');
        try {
          Object.defineProperty(nativeInput, 'value', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: function () { return descriptor.get.call(this); },
            set: function (value) {
              descriptor.set.call(this, value);
              proxy.value = descriptor.get.call(this);
            }
          });
        } catch (_) {}
        proxy.addEventListener('sl-input', function () {
          descriptor.set.call(nativeInput, proxy.value);
          nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        proxy.addEventListener('sl-change', function () {
          descriptor.set.call(nativeInput, proxy.value);
          nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });
  }

  function rypInitAll(root) {
    if (!root || !root.querySelectorAll) return;
    var panels = root.querySelectorAll('[data-ry-panel]');
    panels.forEach(function (panel) {
      rypCollapsible(panel);
      rypDraggable(panel);
      rypResize(panel);
      rypResizePanel(panel);
      rypShoelaceInputs(panel);
    });
  }

  /* ================================================================
   * ryPanel(mount, cfg) —— 面板工厂：把「壳」抽成可复用组件。
   *
   * 原理（组件化三层分离）：
   *   1. 壳   —— 结构 + 折叠/拖宽/记忆，复用本库 rypCollapsible / rypResize，只写一次；
   *   2. 内容 —— 字段、结果、按钮全部由 cfg 提供（配置化，每页一份）；
   *   3. 行为 —— 按钮逻辑走 cfg.onAction、输入走 cfg.onInput（回调注入，换页换回调）。
   *
   * cfg 形如：
   *   {
   *     id, title, subtitle, key,          // key 用于折叠/宽度记忆，每页独立
   *     groups: [                          // 分组字段（内容配置）
   *       { name:'水力', icon:'droplet', fields:[
   *         { id:'lift', label:'提升高度', value:5, unit:'m', min:0, step:1 },   // number 输入
   *         { id:'mat',  label:'管材', value:'PE100', type:'select', options:[
   *             { value:'PE100', label:'PE100' }, { value:'PVC', label:'PVC' } ] },
   *         { id:'head', label:'扬程', value:'—', type:'result', unit:'m' }      // 只读结果
   *       ]}
   *     ],
   *     actions: [ { id:'reset', label:'重置' }, { id:'generate', label:'生成', primary:true } ],
   *     onAction: function(actionId, panel){ /* 换页重连：本页按钮逻辑 *\/ },
   *     onInput:  function(fieldId, value, panel){ /* 换页重连：本页输入实时计算 *\/ }
   *   }
   *
   * 返回句柄：{ root, get(id), set(id, value) }，页面可读写字段/结果。
   * ================================================================ */
  function rypEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rypPanelBuildField(container, field, inputs) {
    if (!container || !field || !field.id) return;
    var row = document.createElement('div');
    row.className = 'ryp-row';
    var k = document.createElement('span');
    k.className = 'k';
    k.textContent = field.label != null ? field.label : field.id;
    row.appendChild(k);

    if (field.type === 'result' || field.readonly) {
      var rv = document.createElement('span');
      rv.className = 'v';
      var rval = document.createElement('span');
      rval.textContent = field.value != null && field.value !== '' ? field.value : '—';
      rv.appendChild(rval);
      if (field.unit) {
        var ru = document.createElement('span');
        ru.className = 'unit';
        ru.textContent = field.unit;
        rv.appendChild(ru);
      }
      row.appendChild(rv);
      container.appendChild(row);
      inputs[field.id] = {
        el: rval,
        get: function () { return field.value; },
        set: function (value) {
          field.value = value;
          rval.textContent = (value == null || value === '') ? '—' : value;
        }
      };
      return;
    }

    var v = document.createElement('span');
    v.className = 'v';
    var control;
    if (field.type === 'select') {
      control = document.createElement('sl-select');
      control.setAttribute('size', 'small');
      (field.options || []).forEach(function (option) {
        var op = document.createElement('sl-option');
        op.value = String(option.value != null ? option.value : option.label);
        op.textContent = option.label != null ? option.label : option.value;
        control.appendChild(op);
      });
      if (field.value != null) control.setAttribute('value', String(field.value));
    } else {
      control = document.createElement('sl-input');
      control.setAttribute('type', 'number');
      control.setAttribute('size', 'small');
      if (field.min != null) control.setAttribute('min', String(field.min));
      if (field.max != null) control.setAttribute('max', String(field.max));
      if (field.step != null) control.setAttribute('step', String(field.step));
      if (field.value != null) control.setAttribute('value', String(field.value));
    }
    v.appendChild(control);
    if (field.unit) {
      var u = document.createElement('span');
      u.className = 'unit';
      u.textContent = field.unit;
      v.appendChild(u);
    }
    row.appendChild(v);
    container.appendChild(row);

    inputs[field.id] = {
      el: control,
      get: function () { return control.value; },
      set: function (value) { control.value = String(value); }
    };
    return control;
  }

  function ryPanel(mount, cfg) {
    if (!cfg) return null;
    var host = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!host) return null;

    var id = cfg.id || ('ryp_' + Math.random().toString(36).slice(2, 8));
    var key = cfg.key || id;
    var root = document.createElement('aside');
    root.className = 'ryp-panel';
    root.id = id;
    root.setAttribute('data-ry-panel', '');
    root.setAttribute('data-ry-panel-key', key);
    root.setAttribute('data-ry-fold-key', key + ':folded');
    if (cfg.width) root.setAttribute('data-ry-reset', String(cfg.width));

    /* 标题栏（可折叠，复用 rypCollapsible） */
    var head = document.createElement('div');
    head.className = 'ryp-panel-head';
    head.setAttribute('data-ry-toggle', '');
    head.title = '点击折叠 / 展开';
    var fold = document.createElement('span');
    fold.className = 'fold';
    fold.setAttribute('data-ry-fold', '');
    fold.setAttribute('data-ry-fold-open', '▾');
    fold.setAttribute('data-ry-fold-closed', '▸');
    fold.textContent = '▾';
    var title = document.createElement('span');
    title.className = 't';
    title.textContent = cfg.title || '面板';
    head.appendChild(fold);
    head.appendChild(title);
    if (cfg.subtitle) {
      var sel = document.createElement('span');
      sel.className = 'sel';
      sel.textContent = cfg.subtitle;
      head.appendChild(sel);
    }
    root.appendChild(head);

    /* 内容体（分组字段） */
    var body = document.createElement('div');
    body.className = 'ryp-panel-body';
    body.setAttribute('data-ry-body', '');
    var inputs = {};
    (cfg.groups || []).forEach(function (group) {
      var gdiv = document.createElement('div');
      gdiv.className = 'ryp-group';
      if (group.name) {
        var gh = document.createElement('div');
        gh.className = 'ryp-group-head';
        if (group.icon) {
          var ic = document.createElement('sl-icon');
          ic.setAttribute('name', group.icon);
          gh.appendChild(ic);
        }
        gh.appendChild(document.createTextNode(group.name));
        gdiv.appendChild(gh);
      }
      (group.fields || []).forEach(function (field) {
        var control = rypPanelBuildField(gdiv, field, inputs);
        if (control && cfg.onInput) {
          control.addEventListener('sl-input', function () {
            cfg.onInput(field.id, control.value, root);
          });
          control.addEventListener('sl-change', function () {
            cfg.onInput(field.id, control.value, root);
          });
        }
      });
      body.appendChild(gdiv);
    });
    root.appendChild(body);

    /* 脚部操作按钮（回调注入） */
    if (cfg.actions && cfg.actions.length) {
      var foot = document.createElement('div');
      foot.className = 'ryp-panel-foot';
      cfg.actions.forEach(function (action) {
        var btn = document.createElement('sl-button');
        btn.setAttribute('size', 'small');
        btn.setAttribute('variant', action.primary ? 'primary' : 'default');
        btn.textContent = action.label;
        btn.addEventListener('click', function () {
          if (cfg.onAction) cfg.onAction(action.id, root);
        });
        foot.appendChild(btn);
      });
      root.appendChild(foot);
    }

    /* 收起细条 + 拖宽手柄 */
    var rail = document.createElement('div');
    rail.className = 'ryp-rail';
    rail.setAttribute('data-ry-rail', '');
    rail.title = '展开';
    rail.textContent = '▸';
    root.appendChild(rail);
    var grip = document.createElement('div');
    grip.className = 'ryp-grip';
    grip.setAttribute('data-ry-grip', '');
    grip.title = '拖动调整宽度 · 双击恢复';
    root.appendChild(grip);

    host.appendChild(root);

    /* 复用共享交互：折叠 + 记忆（拖宽依赖 .mw-shell 容器，有则自动启用） */
    if (global.rypCollapsible) global.rypCollapsible(root);
    if (global.rypResize) global.rypResize(root);

    return {
      root: root,
      get: function (fieldId) { return inputs[fieldId] ? inputs[fieldId].get() : undefined; },
      set: function (fieldId, value) { if (inputs[fieldId]) inputs[fieldId].set(value); return this; }
    };
  }

  global.rypCollapsible = rypCollapsible;
  global.rypResize = rypResize;
  global.rypResizePanel = rypResizePanel;
  global.rypDraggable = rypDraggable;
  global.rypInitAll = rypInitAll;
  global.rypPanel = ryPanel;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { rypInitAll(document); }, { once: true });
  } else {
    rypInitAll(document);
  }
})(window);
