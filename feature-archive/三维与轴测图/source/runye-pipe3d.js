/* runye-pipe3d.js — 三级管网 3D 预览（v415 2026-10-13）
   ============================================================
   用户需求：复刻 PipeWiz 管灵式三维建模展示，但只做「可视化」——
   管道（总管/主管/支管）+ 弯头 + 阀门 + 水源 + 滴灌带 + 地块地面，
   水力灌溉场景简单，不做参数化建模、不出图、不算料。

   数据源（只读红线，与轴测图同口径）：window.tlDiagramData（三级「生成管线图」产物，米坐标）
     poly[{x,y}]      地块多边形（可为 null → 退回 plot.w×plot.h 矩形）
     frontPipe[{x,y}] 总管折线（地块外水源侧）
     mainPipes[[]]    主管折线数组（每根 [{x,y},{x,y}]）
     branchPipes[[]]  支管折线数组
     valves[{x,y,ax,ay}] 阀门（x,y=阀位；ax,ay=主管接点，3D 里仅用阀位）
     dripTapes[[]]    滴灌带线段数组（示意）
     sourcePos{x,y}   水源
     zones{xPos,yPos} 分区网格线（加深读图）

   技术：Three.js r147 UMD（pwa/vendor/three.min.js，首次打开懒加载）；
   轨道控制自写（旋转/缩放/平移/触屏双指），不引第三方控件。
   坐标映射：数据 x→世界 X，数据 y→世界 -Z（北为远），y=0 地面。
   管径为「示意放大」（真实 DN110~200 在数百米地块里不可见），图例已注明。
   整段删除即卸载：删本文件 + index.html 一行 script + #tlTabs 一个按钮 + SW CORE 两行。 */
'use strict';
window.RyPipe3D = (function () {

  /* ---------------- 懒加载 three.min.js ---------------- */
  var threePromise = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    if (threePromise) return threePromise;
    threePromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'pwa/vendor/three.min.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { threePromise = null; reject(new Error('three.min.js 加载失败')); };
      document.head.appendChild(s);
    });
    return threePromise;
  }

  /* ---------------- 常量 ---------------- */
  var COLORS = {
    bg: 0xeef2f7, ground: 0xd5ead8, groundEdge: 0x64748b, zoneLine: 0xb6c2cf,
    front: 0x111827, main: 0x185fa5, branch: 0x16a34a,
    tape: 0x0891b2, valve: 0xdc2626, valveDark: 0x7f1d1d, source: 0xf59e0b
  };
  var R_FRONT = 3.2, R_MAIN = 2.2, R_BRANCH = 1.1;      /* 示意放大半径（m）——真实 DN 管在数百米地块里不足 1px，按可读性放大 */

  /* ---------------- 模块状态 ---------------- */
  var ui = null;            /* overlay DOM（懒建，常驻） */
  var renderer = null, scene = null, camera = null, group3d = null;
  var rafId = 0, resizeObs = null;
  var orbit = null;         /* 轨道控制状态 */
  var cam0 = null;          /* 复位基准 */
  var togStore = { tapes: true, grid: true, fittings: true };
  var bound = false;

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------------- overlay UI（一次性创建） ---------------- */
  function ensureUI() {
    if (ui) return;
    var wrap = document.createElement('div');
    wrap.id = 'pipe3dOverlay';
    wrap.setAttribute('style',
      'position:fixed;inset:0;z-index:10001;background:rgba(15,23,42,.55);display:none;');
    wrap.innerHTML =
      '<div id="pipe3dPanel" style="position:absolute;inset:2.5%;background:#0f172a;border-radius:10px;' +
        'box-shadow:0 24px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:#111c33;color:#e2e8f0;flex:none">' +
          '<b style="font-size:14px">🧊 管网 3D 预览</b>' +
          '<span id="pipe3dStats" style="font-size:12px;color:#94a3b8"></span>' +
          '<span style="flex:1"></span>' +
          '<label style="font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:4px;cursor:pointer">' +
            '<input type="checkbox" id="p3dTape" checked> 滴灌带</label>' +
          '<label style="font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:4px;cursor:pointer">' +
            '<input type="checkbox" id="p3dGrid" checked> 分区网格</label>' +
          '<label style="font-size:12px;color:#cbd5e1;display:flex;align-items:center;gap:4px;cursor:pointer">' +
            '<input type="checkbox" id="p3dFit" checked> 阀门/水源</label>' +
          '<button id="pipe3dReset" style="padding:4px 12px;font-size:12px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;cursor:pointer">复位视角</button>' +
          '<button id="pipe3dClose" style="padding:4px 12px;font-size:12px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:6px;cursor:pointer">✕ 关闭</button>' +
        '</div>' +
        '<div id="pipe3dBody" style="position:relative;flex:1;min-height:0;background:#eef2f7">' +
          '<canvas id="pipe3dCanvas" style="display:block;width:100%;height:100%;touch-action:none"></canvas>' +
          '<div id="pipe3dLegend" style="position:absolute;left:12px;bottom:12px;background:rgba(255,255,255,.92);' +
            'border:1px solid #cbd5e1;border-radius:8px;padding:7px 11px;font-size:11.5px;color:#334155;line-height:1.9">' +
            '<div><span style="display:inline-block;width:18px;height:5px;background:#111827;border-radius:2px;vertical-align:middle"></span> 总管' +
            '<span style="display:inline-block;width:18px;height:4px;background:#185fa5;border-radius:2px;vertical-align:middle;margin-left:12px"></span> 主管' +
            '<span style="display:inline-block;width:18px;height:3px;background:#16a34a;border-radius:2px;vertical-align:middle;margin-left:12px"></span> 支管</div>' +
            '<div><span style="display:inline-block;width:18px;height:2px;background:#0891b2;vertical-align:middle"></span> 滴灌带' +
            '<span style="display:inline-block;width:9px;height:9px;background:#dc2626;border-radius:50%;vertical-align:middle;margin-left:12px"></span> 阀门' +
            '<span style="display:inline-block;width:9px;height:9px;background:#f59e0b;border-radius:50%;vertical-align:middle;margin-left:12px"></span> 水源' +
            '<em style="color:#64748b;font-style:normal;margin-left:10px">拖动旋转 · 滚轮缩放 · 右键/双指平移（管径为示意放大）</em></div>' +
          '</div>' +
          '<div id="pipe3dEmpty" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
            'color:#475569;font-size:14px;background:#eef2f7">请先生成三级管线平面图（点「生成管线图」）再打开 3D 预览</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    ui = {
      wrap: wrap, stats: $('pipe3dStats'), body: $('pipe3dBody'), canvas: $('pipe3dCanvas'),
      empty: $('pipe3dEmpty'), ckTape: $('p3dTape'), ckGrid: $('p3dGrid'), ckFit: $('p3dFit')
    };
    $('pipe3dClose').addEventListener('click', close);
    $('pipe3dReset').addEventListener('click', function () { if (cam0) applyCam(cam0); });
    ui.ckTape.addEventListener('change', function () { togStore.tapes = ui.ckTape.checked; applyToggles(); });
    ui.ckGrid.addEventListener('change', function () { togStore.grid = ui.ckGrid.checked; applyToggles(); });
    ui.ckFit.addEventListener('change', function () { togStore.fittings = ui.ckFit.checked; applyToggles(); });
    ui.wrap.addEventListener('click', function (e) { if (e.target === ui.wrap) close(); });
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape' && ui && ui.wrap.style.display !== 'none') close(); }

  /* ---------------- 场景构建 ---------------- */
  function polyBbox(pts) {
    var b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    (pts || []).forEach(function (p) {
      if (p.x < b.minX) b.minX = p.x; if (p.x > b.maxX) b.maxX = p.x;
      if (p.y < b.minY) b.minY = p.y; if (p.y > b.maxY) b.maxY = p.y;
    });
    return b;
  }

  /* 折线 → TubeGeometry（CurvePath 直段拼接，拐角用球补 = 弯头） */
  function tubeForPolyline(pts, radius, mat, corners) {
    var P = pts.map(function (p) { return new window.THREE.Vector3(p.x, radius + 0.03, -(p.y)); });
    var path = new window.THREE.CurvePath();
    for (var i = 0; i < P.length - 1; i++) path.add(new window.THREE.LineCurve3(P[i], P[i + 1]));
    var geo = new window.THREE.TubeGeometry(path, Math.max(1, (P.length - 1) * 3), radius, 10, false);
    var mesh = new window.THREE.Mesh(geo, mat);
    if (corners && P.length > 2) {
      var sg = new window.THREE.SphereGeometry(radius * 1.12, 12, 10);
      for (var k = 1; k < P.length - 1; k++) {
        var s = new window.THREE.Mesh(sg, mat);
        s.position.copy(P[k]);
        corners.push(s);
      }
    }
    return mesh;
  }

  function buildScene(d) {
    var T = window.THREE;
    scene = new T.Scene();
    scene.background = new T.Color(COLORS.bg);
    group3d = new T.Group();
    scene.add(group3d);

    var plot = d.plot || { w: 100, h: 100 };
    var poly = (Array.isArray(d.poly) && d.poly.length >= 3) ? d.poly
      : [{ x: 0, y: 0 }, { x: plot.w, y: 0 }, { x: plot.w, y: plot.h }, { x: 0, y: plot.h }];

    /* 地块地面（Shape → rotateX(-π/2)：形状 +Y → 世界 -Z，与管线 z=-(y) 同口径） */
    var shape = new T.Shape(poly.map(function (p) { return new T.Vector2(p.x, p.y); }));
    var gGeo = new T.ShapeGeometry(shape);
    var ground = new T.Mesh(gGeo, new T.MeshLambertMaterial({ color: COLORS.ground }));
    ground.rotation.x = -Math.PI / 2;
    group3d.add(ground);
    /* 地块边线 */
    var ep = poly.map(function (p) { return new T.Vector3(p.x, 0.04, -p.y); });
    ep.push(ep[0].clone());
    group3d.add(new T.Line(new T.BufferGeometry().setFromPoints(ep),
      new T.LineBasicMaterial({ color: COLORS.groundEdge })));

    /* 分区网格线 */
    var z = d.zones || {};
    if (togStore.grid && Array.isArray(z.xPos) && Array.isArray(z.yPos)) {
      var gpts = [];
      var xs = z.xPos, ys = z.yPos;
      var y0 = ys[0], y1 = ys[ys.length - 1], x0 = xs[0], x1 = xs[xs.length - 1];
      xs.forEach(function (x) { gpts.push(new T.Vector3(x, 0.05, -y0), new T.Vector3(x, 0.05, -y1)); });
      ys.forEach(function (y) { gpts.push(new T.Vector3(x0, 0.05, -y), new T.Vector3(x1, 0.05, -y)); });
      group3d.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(gpts),
        new T.LineBasicMaterial({ color: COLORS.zoneLine })));
    }

    /* 管道：总管 → 主管 → 支管（拐角补球 = 弯头） */
    var matFront = new T.MeshLambertMaterial({ color: COLORS.front });
    var matMain = new T.MeshLambertMaterial({ color: COLORS.main });
    var matBranch = new T.MeshLambertMaterial({ color: COLORS.branch });
    var corners = [];
    var nMain = 0, nBranch = 0, nTape = 0, nValve = 0;

    if (Array.isArray(d.frontPipe) && d.frontPipe.length >= 2) {
      group3d.add(tubeForPolyline(d.frontPipe, R_FRONT, matFront, corners));
    }
    (Array.isArray(d.mainPipes) ? d.mainPipes : []).forEach(function (pl) {
      if (Array.isArray(pl) && pl.length >= 2) { group3d.add(tubeForPolyline(pl, R_MAIN, matMain, corners)); nMain++; }
    });
    (Array.isArray(d.branchPipes) ? d.branchPipes : []).forEach(function (pl) {
      if (Array.isArray(pl) && pl.length >= 2) { group3d.add(tubeForPolyline(pl, R_BRANCH, matBranch, corners)); nBranch++; }
    });
    corners.forEach(function (s) { group3d.add(s); });

    /* 滴灌带：合并为 LineSegments（一条 draw call，几百条无压力） */
    var tapes = d.dripTapes;
    if (togStore.tapes && Array.isArray(tapes) && tapes.length) {
      var tp = [];
      tapes.forEach(function (seg) {
        if (Array.isArray(seg) && seg.length >= 2) {
          tp.push(new T.Vector3(seg[0].x, 0.08, -seg[0].y), new T.Vector3(seg[1].x, 0.08, -seg[1].y));
          nTape++;
        }
      });
      if (tp.length) group3d.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(tp),
        new T.LineBasicMaterial({ color: COLORS.tape, transparent: true, opacity: 0.65 })));
    }

    /* 阀门：红色立杆 + 手轮（ax/ay 主管接点在 3D 里不画，避免琐碎） */
    var fittings = new T.Group();
    if (togStore.fittings && Array.isArray(d.valves)) {
      var stemGeo = new T.CylinderGeometry(1.1, 1.1, 7, 10);
      var wheelGeo = new T.TorusGeometry(3.2, 0.55, 8, 20);
      var mStem = new T.MeshLambertMaterial({ color: COLORS.valve });
      var mWheel = new T.MeshLambertMaterial({ color: COLORS.valveDark });
      d.valves.forEach(function (v) {
        if (!v || !isFinite(v.x) || !isFinite(v.y)) return;
        var stem = new T.Mesh(stemGeo, mStem);
        stem.position.set(v.x, 3.5, -v.y);
        var wheel = new T.Mesh(wheelGeo, mWheel);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(v.x, 7.3, -v.y);
        fittings.add(stem, wheel);
        nValve++;
      });
    }
    /* 水源：amber 泵体 */
    if (togStore.fittings && d.sourcePos && isFinite(d.sourcePos.x)) {
      var body = new T.Mesh(new T.CylinderGeometry(3.5, 3.5, 5, 16),
        new T.MeshLambertMaterial({ color: COLORS.source }));
      body.position.set(d.sourcePos.x, 2.5, -d.sourcePos.y);
      var cap = new T.Mesh(new T.CylinderGeometry(2.0, 2.0, 1.0, 12),
        new T.MeshLambertMaterial({ color: 0x92400e }));
      cap.position.set(d.sourcePos.x, 5.6, -d.sourcePos.y);
      fittings.add(body, cap);
    }
    group3d.add(fittings);

    /* 光照 */
    scene.add(new T.HemisphereLight(0xffffff, 0x8fa3af, 0.8));
    var sun = new T.DirectionalLight(0xffffff, 0.5);
    sun.position.set(1, 2, 0.6);
    scene.add(sun);

    /* 统计条 */
    if (ui) ui.stats.textContent = '地块 ' + Math.round(plot.w) + '×' + Math.round(plot.h) + 'm · 主管 ' +
      nMain + ' 根 · 支管 ' + nBranch + ' 根 · 阀门 ' + nValve + ' 只 · 滴灌带 ' + nTape + ' 条';
    return { nMain: nMain, nBranch: nBranch, nTape: nTape, nValve: nValve };
  }

  function disposeScene() {
    if (!scene) return;
    scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
      }
    });
    scene = null; group3d = null;
  }

  /* ---------------- 相机与轨道控制 ---------------- */
  function initCamera() {
    var T = window.THREE;
    camera = camera || new T.PerspectiveCamera(46, 1, 0.5, 8000);
    fitCamera();
  }
  function fitCamera() {
    var T = window.THREE;
    var box = new T.Box3().setFromObject(group3d);
    var c = box.getCenter(new T.Vector3());
    c.y = 0;
    var size = box.getSize(new T.Vector3());
    var r = Math.max(20, size.length() / 2);
    cam0 = { target: c.clone(), radius: r * 2.4, theta: 0.0, phi: 0.98 };
    applyCam(cam0);
    if (orbit) { orbit.rMin = r * 0.15; orbit.rMax = r * 5; }
  }
  function applyCam(s) {
    var T = window.THREE;
    var sp = Math.sin(s.phi), x = s.radius * sp * Math.sin(s.theta),
        y = s.radius * Math.cos(s.phi), z = s.radius * sp * Math.cos(s.theta);
    camera.position.set(s.target.x + x, s.target.y + y, s.target.z + z);
    camera.lookAt(s.target);
    if (orbit) { orbit.target = s.target; orbit.radius = s.radius; orbit.theta = s.theta; orbit.phi = s.phi; }
  }
  function initOrbit() {
    if (orbit) return;
    var T = window.THREE;
    var cvs = ui.canvas;
    orbit = { target: new T.Vector3(), radius: 300, theta: 0, phi: 0.98, rMin: 30, rMax: 3000, ptrs: new Map(), pinch: null };
    function clampOrbit() {
      orbit.phi = Math.max(0.08, Math.min(1.52, orbit.phi));
      orbit.radius = Math.max(orbit.rMin, Math.min(orbit.rMax, orbit.radius));
    }
    cvs.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cvs.addEventListener('pointerdown', function (e) {
      cvs.setPointerCapture(e.pointerId);
      orbit.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey });
      if (orbit.ptrs.size === 2) {
        var a = Array.from(orbit.ptrs.values());
        orbit.pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), r: orbit.radius,
          mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
      }
      e.preventDefault();
    });
    cvs.addEventListener('pointermove', function (e) {
      var p = orbit.ptrs.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (orbit.ptrs.size === 2 && orbit.pinch) {
        var a = Array.from(orbit.ptrs.values());
        var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (d > 0) orbit.radius = orbit.pinch.r * orbit.pinch.d / d;
        var mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
        panBy(mx - orbit.pinch.mx, my - orbit.pinch.my);
        orbit.pinch.mx = mx; orbit.pinch.my = my;
      } else if (p.btn === 2 || p.shift) {
        panBy(dx, dy);
      } else {
        orbit.theta -= dx * 0.005;
        orbit.phi -= dy * 0.005;
      }
      clampOrbit();
      applyCam(orbit);
    });
    function up(e) {
      orbit.ptrs.delete(e.pointerId);
      if (orbit.ptrs.size < 2) orbit.pinch = null;
    }
    cvs.addEventListener('pointerup', up);
    cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('wheel', function (e) {
      e.preventDefault();
      orbit.radius *= Math.exp(e.deltaY * 0.0011);
      clampOrbit();
      applyCam(orbit);
    }, { passive: false });
  }
  /* 屏幕位移 → 地面平移（沿相机右向 / 前向投影） */
  function panBy(dx, dy) {
    if (!dx && !dy) return;
    var T = window.THREE;
    var off = camera.position.clone().sub(orbit.target);
    off.y = 0;
    if (off.lengthSq() < 1e-6) off.set(0, 0, 1);
    off.normalize();
    var right = new T.Vector3(-off.z, 0, off.x);      /* 水平面内右向 */
    var k = orbit.radius * 0.0012;
    orbit.target.addScaledVector(right, -dx * k);
    orbit.target.addScaledVector(off, dy * k);
    /* 目标限制在地块附近，防止拖丢 */
    var lim = Math.max(200, orbit.rMax);
    orbit.target.x = Math.max(-lim, Math.min(lim, orbit.target.x));
    orbit.target.z = Math.max(-lim, Math.min(lim, orbit.target.z));
  }

  /* ---------------- 显隐开关 ---------------- */
  var tapeLines = null, gridLines = null, fitGroup = null;
  function cacheToggleTargets() {
    tapeLines = null; gridLines = null; fitGroup = null;
    if (!group3d) return;
    group3d.children.forEach(function (o) {
      if (o.isLineSegments && o.material && o.material.color) {
        if (o.material.color.getHex() === COLORS.tape) tapeLines = o;
        else if (o.material.color.getHex() === COLORS.zoneLine) gridLines = o;
      } else if (o.isGroup) fitGroup = o;
    });
  }
  function applyToggles() {
    if (tapeLines) tapeLines.visible = togStore.tapes;
    if (gridLines) gridLines.visible = togStore.grid;
    if (fitGroup) fitGroup.visible = togStore.fittings;
  }

  /* ---------------- 渲染循环与尺寸 ---------------- */
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
  function syncSize() {
    if (!renderer || !ui) return;
    var w = ui.body.clientWidth, h = ui.body.clientHeight;
    if (w < 4 || h < 4) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* ---------------- 对外 API ---------------- */
  function open() {
    ensureUI();
    ui.wrap.style.display = 'block';
    var d = window.tlDiagramData;
    var hasData = !!(d && (Array.isArray(d.mainPipes) || Array.isArray(d.branchPipes)));
    if (!hasData) {
      ui.empty.style.display = 'flex';
      if (ui.stats) ui.stats.textContent = '';
      return;
    }
    ui.empty.style.display = 'none';
    loadThree().then(function () {
      var T = window.THREE;
      if (!renderer) {
        renderer = new T.WebGLRenderer({ canvas: ui.canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      }
      disposeScene();
      buildScene(d);
      cacheToggleTargets();
      applyToggles();
      initCamera();
      initOrbit();
      syncSize();
      if (resizeObs) resizeObs.disconnect();
      resizeObs = new ResizeObserver(syncSize);
      resizeObs.observe(ui.body);
      if (!rafId) loop();
    }).catch(function (err) {
      ui.empty.style.display = 'flex';
      ui.empty.textContent = '3D 组件加载失败（' + esc(err.message || err) + '），请检查网络后重试';
    });
  }
  function close() {
    if (!ui) return;
    ui.wrap.style.display = 'none';
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  function isOpen() { return !!(ui && ui.wrap.style.display !== 'none'); }

  /* 入口按钮绑定（#tlTabs 内的「3D 模型」按钮；按钮由 index.html 提供，找不到则静默） */
  function bind() {
    if (bound) return;
    var btn = $('tlBtn3D');
    if (btn) { btn.addEventListener('click', open); bound = true; }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  /* _orbit：探针/调试只读口（探针断言轨道参数变化用，无业务消费） */
  return { open: open, close: close, isOpen: isOpen, _bind: bind, _orbit: function () { return orbit ? { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius } : null; } };
})();
