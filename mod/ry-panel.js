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
      place(bounds.clientWidth - rootEl.offsetWidth - 12, Number(rootEl.dataset.ryDefaultTop) || 96);
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

  global.rypCollapsible = rypCollapsible;
  global.rypResize = rypResize;
  global.rypDraggable = rypDraggable;
  global.rypInitAll = rypInitAll;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { rypInitAll(document); }, { once: true });
  } else {
    rypInitAll(document);
  }
})(window);
