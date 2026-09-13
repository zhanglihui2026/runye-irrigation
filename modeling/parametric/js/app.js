/* =========================================================
   app.js — 主程序装配
   串联：左侧 2D 拾取视图 + 右侧电池节点 + 3D 预览
   数据流（类 Grasshopper）：
     左侧图形 → 「拾取图形」电池拾取 → 连线 → 「放样圆管」电池输入端
     → 实时运算 → 三维预览
   负责：拾取电池的拾取交互、参数面板（数值+滑块）、实时联动、
   容错修正、缺失输入静默提示、工具栏与说明。
   ========================================================= */
(function (global) {
  'use strict';

  const GH = global.GH;
  const $ = (id) => document.getElementById(id);

  const SHAPE_LABEL = { line: '直线', rect: '方形', circle: '圆形' };

  // ---------- 全局实例 ----------
  let viewport, renderer, nodeEditor;
  let activePicker = null; // 正在等待拾取图形的电池 id

  // ---------- 工具函数 ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = (v) => (Math.round(v * 10) / 10).toString();
  const clampToSlider = (v, sl) => clamp(v, parseFloat(sl.min), parseFloat(sl.max));
  const currentShape = () => (viewport.selectedId ? viewport.getShape(viewport.selectedId) : null);

  // =======================================================
  // 初始化
  // =======================================================
  function init() {
    viewport = new GH.Viewport2D({
      canvas: $('vp2d'),
      onSelect: onShapeSelect,
      onChange: onShapeChange,
      onShapeCreated: () => {},
      onModeChange: updateActiveTool,
    });

    renderer = new GH.Renderer3D($('vp3d'));

    nodeEditor = new GH.NodeEditor({
      container: $('nodeEditor'),
      canvas: $('nodeCanvas'),   // 节点挂载层，承载缩放与平移
      svg: $('wires'),
      onChange: recompute,
      getShape: (id) => (id ? viewport.getShape(id) : null),
      onPick: armPicker,
      onRemove: (id) => { if (activePicker === id) clearPickerArm(); },
      onViewChange: updateZoomLabel,
    });

    bindToolbar();
    bindHelp();
    buildDemo(); // 默认载入一个可直接测试的示例
    global.addEventListener('resize', () => { viewport.resize(); renderer.resize(); nodeEditor.render(); });
    global.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearPickerArm(); });

    // 布局稳定后再校准一次画布尺寸，避免初始尺寸为 0 导致空白
    requestAnimationFrame(() => { viewport.resize(); renderer.resize(); nodeEditor.render(); refreshRoles(); recompute(); });
    renderProps();
    recompute();
  }

  // 工具栏绘制/视图按钮高亮与实际模式保持同步
  function updateActiveTool(m) {
    document.querySelectorAll('#leftToolbar .tool[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === m);
    });
  }

  // 电池画布当前倍率
  function updateZoomLabel(s) {
    const el = $('nodeZoomLabel');
    if (el) el.textContent = Math.round(s * 100) + '%';
  }

  // =======================================================
  // 拾取「拾取图形」电池：交互流程
  // =======================================================
  // 点击电池上的「拾取图形」→ 进入拾取态 → 在左侧视图点选一个图形完成赋值
  function armPicker(nodeId) {
    if (activePicker === nodeId) { clearPickerArm(); return; }
    clearPickerArm();
    activePicker = nodeId;
    const nd = nodeEditor.findNode(nodeId);
    if (nd && nd.el) nd.el.classList.add('armed');
    flashHint('拾取模式：请在左侧视图点击一个图形完成拾取（按 Esc 或点空白处取消）');
  }
  function clearPickerArm() {
    if (activePicker) {
      const nd = nodeEditor.findNode(activePicker);
      if (nd && nd.el) nd.el.classList.remove('armed');
    }
    activePicker = null;
  }

  // 左侧图形被选中 / 取消选中
  function onShapeSelect(id) {
    if (activePicker && id) {
      nodeEditor.setPick(activePicker, id);
      const nd = nodeEditor.findNode(activePicker);
      if (nd) nodeEditor._refreshNode(nd);
      const s = viewport.getShape(id);
      flashHint(`已将「${SHAPE_LABEL[s ? s.type : '']}」拾取到电池，请把它连线到放样电池的输入端`);
      clearPickerArm();
    } else if (activePicker && !id) {
      clearPickerArm();
    }
    renderProps();
    refreshRoles();
    recompute();
  }

  function onShapeChange() {
    recompute();
    syncProps(); // 拖拽移动图形时同步参数面板数值（不打断正在编辑的输入框）
  }

  // 根据连线关系刷新左侧图形颜色标记（路径=蓝，截面=绿）
  function refreshRoles() {
    viewport.shapes.forEach((s) => (s.boundRole = null));
    for (const e of nodeEditor.edges) {
      const tn = nodeEditor.findNode(e.to.nodeId);
      const fn = nodeEditor.findNode(e.from.nodeId);
      if (tn && tn.key === 'loft' && fn && fn.key === 'pick') {
        const sid = nodeEditor.getPick(fn.id);
        if (sid) {
          const sh = viewport.getShape(sid);
          if (sh) sh.boundRole = (e.to.port === 0 ? 'path' : 'section');
        }
      }
    }
    viewport.render();
  }

  // =======================================================
  // 图求值：自「放样圆管」节点出发，沿连线回溯各输入端数据
  // =======================================================
  function evalNode(node, port, visited) {
    if (!node) return null;
    const key = node.id + ':' + port;
    if (visited.has(key)) return null; // 环路保护
    visited.add(key);

    if (node.key === 'pick') {
      const id = nodeEditor.getPick(node.id);
      return id ? viewport.getShape(id) : null;
    }
    if (node.key === 'loft') {
      const in0 = evalInput(node, 0, visited); // 路径
      const in1 = evalInput(node, 1, visited); // 截面
      return GH.computeLoft(in0, in1);          // {tris} 或 {error}
    }
    return null;
  }
  function evalInput(node, port, visited) {
    const e = nodeEditor.edges.find((x) => x.to.nodeId === node.id && x.to.port === port);
    if (!e) return null;
    const src = nodeEditor.findNode(e.from.nodeId);
    return src ? evalNode(src, e.from.port, visited) : null;
  }

  // =======================================================
  // 核心运算：遍历所有放样电池，汇总三角网格
  // =======================================================
  function recompute() {
    const lofts = nodeEditor.nodes.filter((n) => n.key === 'loft');
    const msg = $('vp3dMsg');

    if (!lofts.length) {
      renderer.setData([]);
      if (msg) { msg.textContent = '请添加「放样圆管」电池节点'; msg.style.display = ''; }
      return;
    }

    let allTris = [];
    let lastErr = null;
    for (const node of lofts) {
      const res = evalNode(node, 0, new Set());
      if (res && res.error) {
        nodeEditor.setNodeStatus(node.id, res.error, false);
        lastErr = res.error;
      } else if (res && res.tris && res.tris.length) {
        allTris = allTris.concat(res.tris);
        nodeEditor.setNodeStatus(node.id, '放样成功 · 已生成三维模型', true);
      } else {
        nodeEditor.setNodeStatus(node.id, '缺失输入数据', false);
        lastErr = lastErr || '缺失输入数据';
      }
      nodeEditor._refreshNode(node);
    }

    renderer.setData(allTris);
    if (msg) {
      if (!allTris.length) { msg.textContent = lastErr || '尚未生成模型'; msg.style.display = ''; }
      else { msg.textContent = ''; msg.style.display = 'none'; }
    }
  }

  // =======================================================
  // 参数调节面板
  // =======================================================
  let propRefs = {}; // key -> { num, slider }

  function renderProps() {
    const body = $('propsBody');
    body.innerHTML = '';
    propRefs = {};
    const s = currentShape();
    if (!s) {
      body.innerHTML = '<div class="empty-tip">未选中任何图形。在左侧视图绘制并点击拾取一个图形，即可在此调节参数。</div>';
      return;
    }

    if (s.type === 'line') buildLineProps(s, body);
    else if (s.type === 'rect') buildRectProps(s, body);
    else if (s.type === 'circle') buildCircleProps(s, body);
  }

  // 通用：数值输入 + 滑块
  function addNumRow(body, s, label, key, opts) {
    opts = opts || {};
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lab = document.createElement('label'); lab.textContent = label;
    const num = document.createElement('input'); num.type = 'number';
    if (opts.step != null) num.step = opts.step;
    if (opts.min != null) num.min = opts.min;
    num.value = s[key];
    num.addEventListener('input', () => {
      let v = parseFloat(num.value);
      if (isNaN(v)) return;
      if (opts.min != null) v = Math.max(opts.min, v); // 自动容错修正（负数等）
      applyField(s, key, v);
    });
    row.appendChild(lab); row.appendChild(num);

    let slider = null;
    if (opts.slider) {
      slider = document.createElement('input'); slider.type = 'range';
      slider.min = opts.slider.min; slider.max = opts.slider.max; slider.step = opts.slider.step || 1;
      slider.value = clampToSlider(s[key], slider);
      slider.addEventListener('input', () => {
        let v = parseFloat(slider.value);
        if (opts.min != null) v = Math.max(opts.min, v);
        applyField(s, key, v);
      });
      row.appendChild(slider);
    }
    body.appendChild(row);
    propRefs[key] = { num, slider };
    return { num, slider };
  }

  // 不同字段的写入逻辑（含长度 / 直径 / 正方形等特殊处理）
  function applyField(s, key, v) {
    if (key === 'length') { setLength(s, v); return; }
    if (key === 'diameter') { viewport.updateShape(s.id, { r: Math.max(0, v / 2) }); return; }
    if (s.type === 'rect' && (key === 'w' || key === 'h') && s.square) {
      // 正方形：宽高联动
      viewport.updateShape(s.id, { w: Math.max(0, v), h: Math.max(0, v) });
      return;
    }
    viewport.updateShape(s.id, { [key]: v });
  }

  function setLength(s, v) {
    v = Math.max(0, v);
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const L = Math.hypot(dx, dy);
    let ux, uy;
    if (L < 1e-6) { ux = 1; uy = 0; } else { ux = dx / L; uy = dy / L; }
    viewport.updateShape(s.id, { x2: s.x1 + ux * v, y2: s.y1 + uy * v });
  }

  function buildLineProps(s, body) {
    addTitle(body, '直线参数');
    addNumRow(body, s, '起点 X', 'x1', { step: 1 });
    addNumRow(body, s, '起点 Y', 'y1', { step: 1 });
    addNumRow(body, s, '终点 X', 'x2', { step: 1 });
    addNumRow(body, s, '终点 Y', 'y2', { step: 1 });
    addNumRow(body, s, '长度', 'length', { min: 0, step: 1, slider: { min: 1, max: 600 } });
  }

  function buildRectProps(s, body) {
    addTitle(body, '方形参数');
    addNumRow(body, s, '左上 X', 'x', { step: 1 });
    addNumRow(body, s, '左上 Y', 'y', { step: 1 });
    addNumRow(body, s, '宽度', 'w', { min: 0, step: 1, slider: { min: 1, max: 600 } });
    addNumRow(body, s, '高度', 'h', { min: 0, step: 1, slider: { min: 1, max: 600 } });

    const chk = document.createElement('div');
    chk.className = 'prop-check';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'sqLock';
    cb.checked = !!s.square;
    cb.addEventListener('change', () => {
      s.square = cb.checked;
      if (s.square) viewport.updateShape(s.id, { h: s.w }); // 锁定为正方形
      syncProps();
    });
    const cl = document.createElement('label'); cl.htmlFor = 'sqLock'; cl.textContent = '锁定为正方形（宽=高）';
    chk.appendChild(cb); chk.appendChild(cl); body.appendChild(chk);

    if (s.square) {
      const side = document.createElement('div');
      side.className = 'prop-row';
      const lab = document.createElement('label'); lab.textContent = '边长';
      const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(s.w);
      side.appendChild(lab); side.appendChild(val); body.appendChild(side);
    }
  }

  function buildCircleProps(s, body) {
    addTitle(body, '圆形参数');
    addNumRow(body, s, '圆心 X', 'cx', { step: 1 });
    addNumRow(body, s, '圆心 Y', 'cy', { step: 1 });
    addNumRow(body, s, '半径', 'r', { min: 0, step: 1, slider: { min: 1, max: 300 } });
    addNumRow(body, s, '直径', 'diameter', { min: 0, step: 1, slider: { min: 2, max: 600 } });
  }

  function addTitle(body, text) {
    const t = document.createElement('div');
    t.className = 'prop-group-title'; t.textContent = text;
    body.appendChild(t);
  }

  // 同步面板数值（不重建 DOM，避免打断输入）
  function syncProps() {
    const s = currentShape();
    if (!s) return;
    for (const k in propRefs) {
      const ref = propRefs[k];
      if (ref.num === document.activeElement) continue; // 正在编辑的框不覆盖
      let val;
      if (k === 'length') val = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      else if (k === 'diameter') val = s.r * 2;
      else val = s[k];
      if (val == null) continue;
      ref.num.value = fmt(val);
      if (ref.slider) ref.slider.value = clampToSlider(val, ref.slider);
    }
  }

  // =======================================================
  // 工具栏 / 说明
  // =======================================================
  function bindToolbar() {
    // 绘制 / 视图模式
    document.querySelectorAll('#leftToolbar .tool[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#leftToolbar .tool[data-mode]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        viewport.setMode(btn.dataset.mode);
      });
    });
    const selBtn = document.querySelector('#leftToolbar .tool[data-mode="select"]');
    if (selBtn) selBtn.classList.add('active');

    $('btnZoomIn').addEventListener('click', () => viewport.zoomBy(1.2));
    $('btnZoomOut').addEventListener('click', () => viewport.zoomBy(0.833));
    $('btnClearShapes').addEventListener('click', () => { viewport.clearShapes(); activePicker = null; recompute(); });
    $('btnResetView').addEventListener('click', () => viewport.resetView());

    // 右侧电池操作
    $('btnAddPick').addEventListener('click', () => {
      const n = nodeEditor.nodes.length;
      nodeEditor.addNode('pick', 30, 30 + n * 16);
      recompute();
    });
    $('btnAddLoft').addEventListener('click', () => {
      const n = nodeEditor.nodes.length;
      nodeEditor.addNode('loft', 360, 30 + (n % 3) * 30);
      recompute();
    });
    $('btnExample').addEventListener('click', () => {
      buildDemo();
      refreshRoles();
      recompute();
      flashHint('已载入示例：直线→放样路径、圆形→放样截面。可点击「拾取图形」换其他图形试试。', true);
    });
    // 电池画布：滚轮缩放 / 空白处拖动平移，此处为按钮入口
    $('btnNodeZoomIn').addEventListener('click', () => nodeEditor.zoomBy(1.15));
    $('btnNodeZoomOut').addEventListener('click', () => nodeEditor.zoomBy(1 / 1.15));
    $('btnNodeFit').addEventListener('click', () => nodeEditor.fitView());
    $('btnNodeReset').addEventListener('click', () => nodeEditor.resetView());

    $('btnClearWires').addEventListener('click', () => { nodeEditor.clearWires(); refreshRoles(); });
    $('btnClearNodes').addEventListener('click', () => { nodeEditor.clearNodes(); activePicker = null; recompute(); });
    $('btnResetCalc').addEventListener('click', () => {
      // 重置运算：清空各拾取电池的图形数据 + 节点状态（保留图结构）
      nodeEditor.nodes.forEach((nd) => { if (nd.key === 'pick') nodeEditor.setPick(nd.id, null); });
      nodeEditor.nodes.forEach((nd) => nodeEditor.setNodeStatus(nd.id, '', false));
      nodeEditor.render();
      refreshRoles();
      recompute();
    });
  }

  // 默认示例：直线 + 圆形 已拾取并连线，开箱即可看到放样圆管
  function buildDemo() {
    nodeEditor.clearNodes();
    const line = viewport.makeShape('line', { x1: -180, y1: -50, x2: 180, y2: 50 });
    const circ = viewport.makeShape('circle', { cx: 150, cy: -150, r: 26 });
    const loft = nodeEditor.addNode('loft', 400, 70);
    const p0 = nodeEditor.addNode('pick', 40, 50);
    const p1 = nodeEditor.addNode('pick', 40, 280);
    nodeEditor.setPick(p0.id, line.id);
    nodeEditor.setPick(p1.id, circ.id);
    nodeEditor.addWire(p0.id, 0, loft.id, 0); // 直线 → 放样路径
    nodeEditor.addWire(p1.id, 0, loft.id, 1); // 圆形 → 放样截面
  }

  // 底部提示
  const DEFAULT_HINT = '数据流向：左侧「拾取图形」电池先拾取一个图形 → 把它的输出端（绿）连到「放样圆管」的输入端（蓝）。从输出端拖到输入端即可连线，点击连线可删除。';
  let hintTimer = null;
  function flashHint(text, sticky) {
    const el = $('nodeHint');
    if (!el) return;
    el.textContent = text;
    if (hintTimer) clearTimeout(hintTimer);
    if (!sticky) hintTimer = setTimeout(() => { el.textContent = DEFAULT_HINT; }, 4200);
  }

  function bindHelp() {
    const overlay = $('helpOverlay');
    $('btnHelp').addEventListener('click', () => { overlay.hidden = false; });
    $('btnCloseHelp').addEventListener('click', () => { overlay.hidden = true; });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
  }

  // 启动
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
