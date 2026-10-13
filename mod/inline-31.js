/* v392 页面级 iframe 壳：桌面端首次访问时加载，之后保留 iframe 文档与状态。 */
(function (W, D) {
  'use strict';
  if (!W || !D) return;
  var shell = D.getElementById('ryFrameShell');
  if (!shell) return;
  var frames = Array.prototype.slice.call(shell.querySelectorAll('iframe[data-fr-page]'));
  var byId = Object.create(null), current = null;
  frames.forEach(function (frame) { byId[frame.getAttribute('data-fr-page')] = frame; });
  function mobile() { return !!(W.RyMobile && typeof W.RyMobile.isActive === 'function' && W.RyMobile.isActive()); }
  function setActiveNav(page, on) {
    if (on) {
      var active = D.querySelectorAll('.fn-link.active');
      for (var a = 0; a < active.length; a++) active[a].classList.remove('active');
    }
    var selectors = { 'online-map': '[data-fr-page="online-map"]', 'terrain': '[data-fr-page="terrain"]', 'hydraulics': '[data-ry-plugin-nav="hydraulics"]' };
    var list = D.querySelectorAll(selectors[page] || '');
    for (var i = 0; i < list.length; i++) list[i].classList.toggle('active', !!on);
  }
  function show(pageId) {
    var frame = byId[pageId];
    if (!frame) return false;
    if (pagePending(pageId)) { notifyPending(); return false; }
    if (pageLocked(pageId)) { notifyLocked(pageLabel(pageId)); return false; }
    if (mobile()) return false;
    frames.forEach(function (item) { item.hidden = item !== frame; });
    if (frame.getAttribute('data-loaded') !== '1') {
      var src = frame.getAttribute('data-src');
      if (!src) return false;
      frame.setAttribute('data-loaded', '1');
      frame.src = src;
    }
    W.document.body.classList.add('ry-frame-open');
    shell.hidden = false;
    if (current && current !== pageId) setActiveNav(current, false);
    current = pageId;
    setActiveNav(pageId, true);
    try { frame.contentWindow.focus(); } catch (e) { }
    return true;
  }
  function hide() {
    shell.hidden = true;
    W.document.body.classList.remove('ry-frame-open');
    if (current) setActiveNav(current, false);
    current = null;
    return true;
  }
  function isVisible(pageId) { return !!current && (!pageId || current === pageId) && !shell.hidden; }
  function pageId() { return shell.hidden ? null : current; }
  function accessState(feature) {
    if (!feature) return 'allowed';
    var E = W.RyEntitle;
    if (E && typeof E.access === 'function') return E.access(feature);
    if (!E || typeof E.can !== 'function') return 'allowed';
    if (E.mockPlan) return E.can(feature) ? 'allowed' : 'denied';
    if (typeof E.ready === 'function' && !E.ready()) return 'pending';
    return E.can(feature) ? 'allowed' : 'denied';
  }
  function notifyLocked(label) {
    var U = W.RyMemberUI;
    if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(label); return; }
    try {
      var toast = D.createElement('div');
      toast.className = 'ry-nav-toast'; toast.setAttribute('role', 'status');
      toast.textContent = '「' + label + '」为高级会员功能 · 邀请好友即可开通';
      D.body.appendChild(toast);
      setTimeout(function () { toast.classList.add('show'); }, 10);
      setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); }, 2400);
    } catch (e) { }
  }
  function notifyPending() {
    try {
      var toast = D.createElement('div');
      toast.className = 'ry-nav-toast'; toast.setAttribute('role', 'status');
      toast.textContent = '正在同步会员权益，请稍后重试。';
      D.body.appendChild(toast);
      setTimeout(function () { toast.classList.add('show'); }, 10);
      setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); }, 2400);
    } catch (e) { }
  }
  function locked(el, feature) {
    return !!(el && el.getAttribute('data-ry-locked') === '1') || accessState(feature) === 'denied';
  }
  function pageFeature(page) { return page === 'online-map' ? 'online-map' : page === 'terrain' ? 'pro-others' : page === 'hydraulics' ? 'hydraulic-check' : ''; }
  function pageLabel(page) { return page === 'online-map' ? '在线地图' : page === 'terrain' ? '地形模块' : '水力校核'; }
  function pageLocked(page) {
    var link = D.querySelector('[data-fr-page="' + page + '"]');
    return accessState(pageFeature(page)) !== 'pending' && locked(link, pageFeature(page));
  }
  function pagePending(page) { return accessState(pageFeature(page)) === 'pending'; }
  W.RyFrameShell = { show: show, hide: hide, isVisible: isVisible, pageId: pageId, isLocked: pageLocked, isPending: pagePending, _byId: function (id) { return byId[id] || null; } };
  /* raw nav links + plugin-owned hydraulics nav. Keep legacy href fallback if unavailable/mobile/locked. */
  D.addEventListener('click', function (ev) {
    var target = ev.target && ev.target.closest ? ev.target.closest('[data-fr-page],[data-ry-plugin-nav="hydraulics"]') : null;
    if (target) {
      var page = target.getAttribute('data-fr-page');
      if (!page && target.getAttribute('data-ry-plugin-nav') === 'hydraulics') page = 'hydraulics';
      if (!page || mobile()) return;
      var feature = target.getAttribute('data-fr-feature') || (page === 'online-map' ? 'online-map' : page === 'terrain' ? 'pro-others' : 'hydraulic-check');
      var access = accessState(feature);
      if (access !== 'allowed') {
        if (access === 'pending') notifyPending();
        else notifyLocked(page === 'online-map' ? '在线地图' : page === 'terrain' ? '地形模块' : '水力校核');
        ev.preventDefault(); ev.stopImmediatePropagation(); return;
      }
      if (W.RyFrameShell && W.RyFrameShell.show(page)) { ev.preventDefault(); ev.stopImmediatePropagation(); }
      return;
    }
    /* Native section navigation exits iframe mode before existing hash/tab handlers run. */
    if (W.RyFrameShell && W.RyFrameShell.isVisible()) {
      var sectionLink = ev.target && ev.target.closest && ev.target.closest('.fn-link, [data-ry-plugin-nav]');
      /* Disclosure controls only open a menu; treating them as navigation hides the active
         online-map/terrain/hydraulics iframe before the user has selected a destination. */
      var menuToggle = sectionLink && (
        (sectionLink.classList && sectionLink.classList.contains('fn-more-btn')) ||
        (sectionLink.hasAttribute && sectionLink.hasAttribute('data-ry-filemenu') &&
          sectionLink.getAttribute('aria-haspopup') === 'true')
      );
      if (sectionLink && !menuToggle) hide();
    }
  }, true);
})(window, document);
