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
    var folded = safeRead(key) === '1' || (!safeRead(key) && legacyKey && safeRead(legacyKey) === '1');
    function render() {
      rootEl.classList.toggle('folded', folded);
      button.setAttribute('aria-expanded', folded ? 'false' : 'true');
      button.textContent = folded ? (button.dataset.ryFoldClosed || '▸') : (button.dataset.ryFoldOpen || '▾');
      body.hidden = folded;
      rootEl.dispatchEvent(new CustomEvent('ry-panel-fold', { detail: { folded: folded } }));
    }
    function toggle() {
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

  function rypDraggable(rootEl) {
    if (!rootEl || rootEl.dataset.rypDragReady === '1') return;
    var handle = rootEl.querySelector('[data-ry-drag]');
    var bounds = rootEl.parentElement && rootEl.parentElement.closest('[data-ry-drag-bounds]') || rootEl.parentElement;
    if (!handle || !bounds) return;
    rootEl.dataset.rypDragReady = '1';
    var key = rootEl.dataset.ryPositionKey;
    var legacyKey = rootEl.dataset.ryPositionLegacyKey;
    function place(left, top) {
      var maxLeft = Math.max(0, bounds.clientWidth - rootEl.offsetWidth - 4);
      var maxTop = Math.max(0, bounds.clientHeight - rootEl.offsetHeight - 4);
      rootEl.style.right = 'auto';
      rootEl.style.left = Math.max(0, Math.min(left, maxLeft)) + 'px';
      rootEl.style.top = Math.max(0, Math.min(top, maxTop)) + 'px';
    }
    var saved = null;
    try { saved = JSON.parse(safeRead(key) || (legacyKey && safeRead(legacyKey)) || 'null'); } catch (_) {}
    if (saved && typeof saved.l === 'number' && typeof saved.t === 'number') {
      place(saved.l, saved.t);
    } else {
      /* [v494] data-ry-default-left：默认水平位置钩子（地图绘制工具条默认贴地图区左侧顶端）；
         未设置时保持原逻辑=右缘内缩 12px，既有面板零影响。 */
      var dl = rootEl.dataset.ryDefaultLeft;
      place(dl != null && dl !== '' ? Number(dl) : bounds.clientWidth - rootEl.offsetWidth - 12, Number(rootEl.dataset.ryDefaultTop) || 96);
    }
    var dragging = false, offsetX = 0, offsetY = 0;
    handle.addEventListener('pointerdown', function (event) {
      if (event.target.closest('[data-ry-fold]')) return;
      dragging = true;
      offsetX = event.clientX - rootEl.offsetLeft;
      offsetY = event.clientY - rootEl.offsetTop;
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });
    handle.addEventListener('pointermove', function (event) {
      if (dragging) place(event.clientX - offsetX, event.clientY - offsetY);
    });
    function finish() {
      if (!dragging) return;
      dragging = false;
      var value = JSON.stringify({ l: rootEl.offsetLeft, t: rootEl.offsetTop });
      safeWrite(key, value);
      if (legacyKey) safeWrite(legacyKey, value);
    }
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
    global.addEventListener('resize', function () { place(rootEl.offsetLeft, rootEl.offsetTop); });
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
  global.rypDraggable = rypDraggable;
  global.rypInitAll = rypInitAll;
  global.rypPanel = ryPanel;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { rypInitAll(document); }, { once: true });
  } else {
    rypInitAll(document);
  }
})(window);
