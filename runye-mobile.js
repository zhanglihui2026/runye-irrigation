/* 手机端仅开放在线地图、二级管路、三级管路；桌面功能保持原样。 */
(function () {
  'use strict';
  var query = window.matchMedia('(max-width: 768px), (pointer: coarse) and (max-width: 1024px)');
  var allowed = ['pipePlanSection', 'tlPipePlanSection'];
  var ready = false;
  window.RyMobile = { isActive: function () { return query.matches; }, sections: allowed };
  function resizeDrawing() { window.dispatchEvent(new Event('resize')); }
  function bindCanvasTouch() {
    var canvas = document.getElementById('ppCanvas');
    if (!canvas) return;
    var pointer = null;
    function mouse(type, event) {
      canvas.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,clientX:event.clientX,clientY:event.clientY,button:0,buttons:type === 'mouseup' ? 0 : 1}));
    }
    canvas.addEventListener('pointerdown', function (event) {
      if (!query.matches || event.pointerType !== 'touch' || pointer !== null) return;
      pointer = event.pointerId; event.preventDefault(); canvas.setPointerCapture(pointer); mouse('mousedown', event);
    });
    canvas.addEventListener('pointermove', function (event) {
      if (event.pointerId !== pointer) return;
      event.preventDefault(); mouse('mousemove', event);
    });
    canvas.addEventListener('pointerup', function (event) {
      if (event.pointerId !== pointer) return;
      event.preventDefault(); mouse('mouseup', event); pointer = null;
    });
    canvas.addEventListener('pointercancel', function (event) {
      if (event.pointerId !== pointer) return;
      canvas.dispatchEvent(new MouseEvent('mouseleave')); pointer = null;
    });
  }
  function setupPanel(host, panel, label, section) {
    if (!host || !panel) return;
    var bar = document.createElement('div');
    bar.className = 'ry-mobile-bar';
    var toggle = document.createElement('button');
    toggle.type = 'button'; toggle.textContent = label;
    if (!panel.id) panel.id = 'ryMobileMapPanel';
    toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', function () {
      var open = host.getAttribute('data-mobile-panel') !== 'open';
      host.setAttribute('data-mobile-panel', open ? 'open' : 'closed');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '收起' + label : label;
      resizeDrawing();
    });
    bar.appendChild(toggle);
    if (section) {
      var view = document.createElement('button');
      view.type = 'button'; view.textContent = '查看简图';
      view.addEventListener('click', function () {
        var editing = section.getAttribute('data-ry-view') === (section.id === allowed[0] ? 'edit' : 'ws');
        window.rySetTab(section.id, editing ? (section.id === allowed[0] ? 'draw' : 'pipe') : (section.id === allowed[0] ? 'edit' : 'ws'));
        host.setAttribute('data-mobile-panel', 'closed');
        toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = label;
        view.textContent = editing ? '返回编辑' : '查看简图';
        resizeDrawing();
      });
      bar.appendChild(view);
      if (section.id === allowed[1]) {
        var generate = document.createElement('button');
        generate.type = 'button'; generate.textContent = '生成图纸'; generate.setAttribute('data-mobile-generate', '1');
        generate.addEventListener('click', function () { if (typeof window.tlAutoGenerate === 'function') window.tlAutoGenerate(); });
        bar.appendChild(generate);
        var zoom = document.createElement('div'); zoom.className = 'ry-mobile-zoom';
        [['＋','zoomIn','放大图纸'],['－','zoomOut','缩小图纸'],['适配','zoomFit','图纸适应窗口']].forEach(function (item) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = item[0]; b.setAttribute('aria-label',item[2]);
          b.addEventListener('click',function () { if (window.RyTlWs) window.RyTlWs[item[1]](); });
          zoom.appendChild(b);
        });
        section.appendChild(zoom);
      }
      // 顶部导航回到编辑状态时同步按钮文案。
      new MutationObserver(function () {
        view.textContent = /^(edit|ws)$/.test(section.getAttribute('data-ry-view')) ? '查看简图' : '返回编辑';
      }).observe(section, {attributes:true,attributeFilter:['data-ry-view']});
    }
    host.insertBefore(bar, host.firstChild);
    host.setAttribute('data-mobile-panel', 'closed');
  }
  function syncMode() {
    document.documentElement.classList.toggle('ry-mobile', query.matches);
    var file = location.pathname.split('/').pop();
    if (query.matches && ['','index.html','runye-landing.html','runye-map-measure.html'].indexOf(file) >= 0) {
      var stage = location.hash === '#tlPipePlanSection' ? '#third' : location.hash === '#pipePlanSection' ? '#second' : '';
      location.replace('runye-mobile-map-preview.html?v=241' + stage); return;
    }
    if (!ready || !query.matches) return;
    if (file === 'index.html' || !file) {
      var current = document.querySelector('main > .ry-sec.ry-active');
      var id = allowed.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : current && allowed.indexOf(current.id) >= 0 ? current.id : allowed[0];
      if (typeof window.ryJumpToSection === 'function') window.ryJumpToSection(id);
      if (!current || current.id !== id) {
        if (typeof window.rySetTab === 'function') window.rySetTab(id, id === allowed[0] ? 'edit' : 'ws');
      }
    }
  }
  syncMode();
  document.addEventListener('DOMContentLoaded', function () {
    allowed.forEach(function (id) {
      var sec = document.getElementById(id);
      if (sec) setupPanel(sec, sec.querySelector('.pp-side'), '参数与工具', sec);
    });
    bindCanvasTouch();
    setupPanel(document.querySelector('#app > .main'), document.querySelector('#app .side'), '地图工具');
    var map = document.getElementById('map');
    if (map && window.ResizeObserver) new ResizeObserver(function () {
      // Leaflet 已监听 window resize，折叠面板后通知其重新测量地图。
      resizeDrawing();
    }).observe(map);
    ready = true; syncMode();
  });
  query.addEventListener('change', syncMode);
})();
