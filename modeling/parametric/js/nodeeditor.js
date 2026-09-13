/* =========================================================
   nodeeditor.js — 右侧电池节点编辑区（类 Grasshopper）
   采用 DOM 节点 + SVG 连线实现：
   • 画布：滚轮缩放、空白处拖动平移、适应/重置
   • 节点自由拖拽、删除、折叠/展开
   • 端口（输入端蓝 / 输出端绿）鼠标连线、点击删线
   • 「拾取图形」电池从左侧视图拾取图形，输出供放样电池连线使用
   • 按数据类型（kind）校验连线：shape→shape / mesh→mesh
   • 鼠标悬停电池标题栏显示该电池的功能说明
   • 预留电池模板接口（TEMPLATES），便于后续新增电池

   坐标约定（重要）：
   • node.x / node.y 是「画布世界坐标」，不随缩放改变；
   • 节点挂在内层 this.canvas 上，该层施加 transform: translate(pan) scale(s)；
   • SVG 连线层留在 container 层、不参与 transform，
     因此 _portCenter() 量出的容器坐标天然等同 SVG 坐标系，
     缩放后只需重绘连线，无需额外换算。
   ========================================================= */
(function (global) {
  'use strict';

  let _nid = 1;
  let _eid = 1;

  // 布局常量（与 CSS 配合）
  const NODE_W = 168;        // 电池宽度（较此前 200 收窄）
  const HEADER_H = 26;
  const IO_ROW = 26;
  const SCALE_MIN = 0.4;     // 画布缩放下限
  const SCALE_MAX = 2.4;     // 画布缩放上限

  const SHAPE_LABEL = { line: '直线', rect: '方形', circle: '圆形' };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  class NodeEditor {
    constructor(cfg) {
      this.container = cfg.container;                    // 外层容器，坐标系不缩放
      this.canvas = cfg.canvas || cfg.container;         // 内层画布，承载 transform
      this.svg = cfg.svg;
      this.onChange = cfg.onChange || function () {};
      this.getShape = cfg.getShape || (() => null);      // 由 app 提供：按 id 取左侧图形
      this.onPick = cfg.onPick || (() => {});             // 点击「拾取图形」按钮回调
      this.onRemove = cfg.onRemove || (() => {});         // 节点被删除回调
      this.onViewChange = cfg.onViewChange || (() => {}); // 缩放/平移变化回调（供 UI 显示倍率）
      this.nodes = [];
      this.edges = [];          // {id, from:{nodeId,port}, to:{nodeId,port}}
      this.linking = null;      // 连线进行中
      this.selectedNodeId = null;
      this.emptyHint = document.getElementById('nodeEmptyHint');

      // 画布视图状态
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.panning = false;

      this._bindContainer();
      this._bindGlobal();
      this._applyTransform();
    }

    /* ---------- 电池模板：预留扩展接口 ---------- */
    // 新增电池只需在 TEMPLATES 注册（含 inputs/outputs 及 kind、desc），并调用 addNode(key)
    // desc 用于标题栏悬停提示，说明该电池的功能与用法。
    static get TEMPLATES() {
      return {
        pick: {
          key: 'pick', title: '拾取图形',
          desc: '从左侧视图拾取一个图形（直线／方形／圆形）并输出给下游电池。点「拾取图形」按钮后，到左侧视图点选目标图形即可。',
          inputs: [],
          outputs: [
            { key: 'shape', label: '图形', kind: 'shape' },
          ],
        },
        loft: {
          key: 'loft', title: '放样圆管',
          desc: '以直线为放样路径、圆形或方形为截面，沿路径全程扫描生成三维实体。输入端「放样路径」接直线，「放样截面」接圆形或方形；两端齐备后左下三维预览实时显示成果。',
          inputs: [
            { key: 'path',    label: '放样路径', accepts: ['line'],          kind: 'shape' },
            { key: 'section', label: '放样截面', accepts: ['circle', 'rect'], kind: 'shape' },
          ],
          outputs: [
            { key: 'result', label: '放样成果', kind: 'mesh' },
          ],
        },
      };
    }

    /* ---------- 节点增删 ---------- */
    findNode(id) { return this.nodes.find((n) => n.id === id) || null; }

    setPick(nodeId, shapeId) { const n = this.findNode(nodeId); if (n) n.pickedShapeId = shapeId || null; }
    getPick(nodeId) { const n = this.findNode(nodeId); return n ? n.pickedShapeId : null; }
    setNodeStatus(nodeId, text, ok) {
      const n = this.findNode(nodeId);
      if (!n) return;
      n.status = { text: text || '', ok: !!ok };
    }

    addNode(key, x, y) {
      const tpl = NodeEditor.TEMPLATES[key];
      if (!tpl) { console.warn('未知电池模板:', key); return null; }
      const node = {
        id: 'n' + (_nid++),
        key, title: tpl.title,
        desc: tpl.desc || '',
        x: x != null ? x : 60 + this.nodes.length * 24,
        y: y != null ? y : 60 + this.nodes.length * 24,
        inputs: tpl.inputs.map((i) => ({ key: i.key, label: i.label, accepts: i.accepts, kind: i.kind })),
        outputs: tpl.outputs.map((o) => ({ key: o.key, label: o.label, kind: o.kind })),
        el: null, statusEl: null, _ports: { input: [], output: [] },
        status: { text: '', ok: false },
        pickedShapeId: null,   // 仅 pick 节点使用
        collapsed: false,      // 折叠状态：仅显示标题与端口
        _pickInfo: null,
      };
      this.nodes.push(node);
      this._buildNodeEl(node);
      if (this.emptyHint) this.emptyHint.classList.add('hidden');
      this.render();
      return node;
    }

    // 编程式连线（示例/默认场景使用），与鼠标连线共用校验逻辑
    addWire(fromNode, fromPort, toNode, toPort) {
      this._addEdge(fromNode, fromPort, toNode, toPort);
    }

    removeNode(id) {
      const idx = this.nodes.findIndex((n) => n.id === id);
      if (idx < 0) return;
      const el = this.nodes[idx].el;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      this.nodes.splice(idx, 1);
      this.edges = this.edges.filter((e) => e.from.nodeId !== id && e.to.nodeId !== id);
      this.onRemove(id);
      if (!this.nodes.length && this.emptyHint) this.emptyHint.classList.remove('hidden');
      this.render();
      this.onChange();
    }

    clearNodes() {
      this.nodes.forEach((n) => { if (n.el && n.el.parentNode) n.el.parentNode.removeChild(n.el); });
      this.nodes = []; this.edges = [];
      if (this.emptyHint) this.emptyHint.classList.remove('hidden');
      this.render(); this.onChange();
    }
    clearWires() { this.edges = []; this.render(); this.onChange(); }

    /* ---------- 端口类型 ---------- */
    _portKind(node, port, kind) {
      const arr = kind === 'out' ? node.outputs : node.inputs;
      return arr && arr[port] ? arr[port].kind : null;
    }

    _addEdge(fromNode, fromPort, toNode, toPort) {
      if (fromNode === toNode) return; // 防御：禁止节点自连
      const fn = this.findNode(fromNode), tn = this.findNode(toNode);
      if (!fn || !tn) return;
      const fk = this._portKind(fn, fromPort, 'out');
      const tk = this._portKind(tn, toPort, 'in');
      if (fk !== tk) return; // 数据类型不匹配（如 mesh→shape），禁止连线
      // 同一输入端仅保留一条连线
      this.edges = this.edges.filter((e) => !(e.to.nodeId === toNode && e.to.port === toPort));
      this.edges.push({
        id: 'e' + (_eid++),
        from: { nodeId: fromNode, port: fromPort },
        to: { nodeId: toNode, port: toPort },
      });
      this.render(); this.onChange();
    }

    /* ---------- 构建节点 DOM ---------- */
    _buildNodeEl(node) {
      const el = document.createElement('div');
      el.className = 'node' + (node.collapsed ? ' collapsed' : '');
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      el.style.width = NODE_W + 'px';
      el.style.zIndex = 2;

      // 标题栏：折叠按钮 + 标题 + 删除；鼠���悬停显示电池功能说明
      const head = document.createElement('div');
      head.className = 'node-head';

      const foldBtn = document.createElement('button');
      foldBtn.className = 'node-fold';
      foldBtn.textContent = node.collapsed ? '▸' : '▾';
      foldBtn.title = node.collapsed ? '展开电池' : '折叠电池';
      foldBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      foldBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleCollapse(node.id); });
      head.appendChild(foldBtn);

      const titleEl = document.createElement('span');
      titleEl.className = 'node-title';
      titleEl.textContent = node.title;
      head.appendChild(titleEl);

      // 悬停说明：原生 title 兜底，另由 CSS 浮层呈现完整描述
      if (node.desc) {
        head.title = node.desc;
        head.dataset.desc = node.desc;
        head.classList.add('has-desc');
      }

      const del = document.createElement('button');
      del.className = 'node-del'; del.textContent = '×'; del.title = '删除节点';
      head.appendChild(del);
      el.appendChild(head);
      node._foldBtn = foldBtn;

      const body = document.createElement('div');
      body.className = 'node-body';

      // 输入端（pick 无；loft 有路径/截面两个）
      node.inputs.forEach((inp, i) => {
        const row = document.createElement('div');
        row.className = 'node-io';
        const port = document.createElement('span');
        port.className = 'port input';
        port.title = `输入端：${inp.label}（从「拾取图形」电池的输出端拖线至此）`;
        port.dataset.node = node.id; port.dataset.port = i; port.dataset.kind = 'in';
        const label = document.createElement('span');
        label.className = 'io-label'; label.textContent = inp.label;
        const state = document.createElement('span');
        state.className = 'io-state'; state.style.cssText = 'margin-left:auto;font-size:11px;color:#9aa7b4;';
        row.appendChild(port); row.appendChild(label); row.appendChild(state);
        body.appendChild(row);
        node._ports.input.push(port);
        this._bindPort(port, node, i, 'in');
      });

      // 拾取电池：拾取按钮 + 当前拾取状态
      if (node.key === 'pick') {
        const pickBox = document.createElement('div');
        pickBox.className = 'pick-box';
        const pickBtn = document.createElement('button');
        pickBtn.className = 'pick-btn';
        pickBtn.textContent = '拾取图形';
        pickBtn.addEventListener('click', (e) => { e.stopPropagation(); this.onPick(node.id); });
        pickBox.appendChild(pickBtn);
        const info = document.createElement('div');
        info.className = 'pick-info'; info.textContent = '○ 未拾取图形';
        pickBox.appendChild(info);
        body.appendChild(pickBox);
        node._pickInfo = info;
      }

      // 输出端
      node.outputs.forEach((out, j) => {
        const row = document.createElement('div');
        row.className = 'node-io output';
        const label = document.createElement('span');
        label.className = 'io-label'; label.textContent = out.label;
        const port = document.createElement('span');
        port.className = 'port output';
        port.title = `输出端：${out.label}（按住拖拽到目标电池的输入端）`;
        port.dataset.node = node.id; port.dataset.port = j; port.dataset.kind = 'out';
        row.appendChild(label); row.appendChild(port);
        body.appendChild(row);
        node._ports.output.push(port);
        this._bindPort(port, node, j, 'out');
      });

      const status = document.createElement('div');
      status.className = 'node-status';
      status.style.display = 'none';
      body.appendChild(status);
      node.statusEl = status;

      el.appendChild(body);
      this.canvas.appendChild(el);
      node.el = el;

      // 节点拖拽（屏幕位移需按缩放换算回画布世界坐标）
      head.addEventListener('mousedown', (e) => {
        if (e.target === del || e.target === foldBtn) return;
        e.preventDefault();
        this.selectedNodeId = node.id;
        const sx = e.clientX, sy = e.clientY;
        const ox = node.x, oy = node.y;
        const move = (ev) => {
          node.x = Math.max(0, ox + (ev.clientX - sx) / this.scale);
          node.y = Math.max(0, oy + (ev.clientY - sy) / this.scale);
          el.style.left = node.x + 'px';
          el.style.top = node.y + 'px';
          this._drawWires();
        };
        const up = () => {
          global.removeEventListener('mousemove', move);
          global.removeEventListener('mouseup', up);
        };
        global.addEventListener('mousemove', move);
        global.addEventListener('mouseup', up);
      });

      del.addEventListener('click', (e) => { e.stopPropagation(); this.removeNode(node.id); });
    }

    /* =========================================================
       画布视图：缩放 / 平移 / 重置 / 适应
       ========================================================= */
    /** 应用当前视图变换到内层画布，并重绘连线 */
    _applyTransform() {
      this.canvas.style.transformOrigin = '0 0';
      this.canvas.style.transform =
        'translate(' + this.panX + 'px,' + this.panY + 'px) scale(' + this.scale + ')';
      this._drawWires();
      this.onViewChange(this.scale);
    }

    /** 容器坐标 → 画布世界坐标 */
    _screenToCanvas(sx, sy) {
      return [(sx - this.panX) / this.scale, (sy - this.panY) / this.scale];
    }

    /** 以某个容器坐标为锚点缩放（滚轮指向缩放） */
    _zoomAt(sx, sy, factor) {
      const before = this._screenToCanvas(sx, sy);
      this.scale = clamp(this.scale * factor, SCALE_MIN, SCALE_MAX);
      this.panX = sx - before[0] * this.scale;
      this.panY = sy - before[1] * this.scale;
      this._applyTransform();
    }

    /** 以容器中心缩放（工具栏按钮调用） */
    zoomBy(factor) {
      const r = this.container.getBoundingClientRect();
      this._zoomAt(r.width / 2, r.height / 2, factor);
    }

    /** 恢复原始倍率与位置 */
    resetView() {
      this.scale = 1; this.panX = 0; this.panY = 0;
      this._applyTransform();
    }

    /** 自动把所有节点纳入视野（无节点时等效重置） */
    fitView() {
      if (!this.nodes.length) { this.resetView(); return; }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of this.nodes) {
        const w = n.el ? n.el.offsetWidth : NODE_W;
        const h = n.el ? n.el.offsetHeight : HEADER_H * 2;
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
      }
      const r = this.container.getBoundingClientRect();
      const pad = 28;
      const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
      const s = clamp(Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h), SCALE_MIN, SCALE_MAX);
      this.scale = s;
      this.panX = (r.width - w * s) / 2 - minX * s;
      this.panY = (r.height - h * s) / 2 - minY * s;
      this._applyTransform();
    }

    /** 折叠 / 展开某个节点 */
    toggleCollapse(nodeId) {
      const n = this.findNode(nodeId);
      if (!n || !n.el) return;
      n.collapsed = !n.collapsed;
      n.el.classList.toggle('collapsed', n.collapsed);
      if (n._foldBtn) {
        n._foldBtn.textContent = n.collapsed ? '▸' : '▾';
        n._foldBtn.title = n.collapsed ? '展开电池' : '折叠电池';
      }
      this._drawWires();
    }

    /* ---------- 容器交互：滚轮缩放 / 空白处拖动平移 ---------- */
    _bindContainer() {
      const c = this.container;
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const cr = c.getBoundingClientRect();
        this._zoomAt(e.clientX - cr.left, e.clientY - cr.top, e.deltaY < 0 ? 1.1 : 0.909);
      }, { passive: false });

      c.addEventListener('mousedown', (e) => {
        // 仅当落在容器或画布空白处才平移；节点、端口、连线由各自的处理器负责
        if (e.target !== c && e.target !== this.canvas) return;
        if (e.button !== 0 && e.button !== 1) return;
        e.preventDefault();
        this.panning = true;
        this.selectedNodeId = null;
        this._panStart = [e.clientX, e.clientY, this.panX, this.panY];
        c.classList.add('panning');
      });

      c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /* ---------- 端口交互：连线 ---------- */
    _bindPort(portEl, node, idx, kind) {
      portEl.addEventListener('mousedown', (e) => {
        e.stopPropagation(); e.preventDefault();
        if (kind !== 'out') return; // 仅从输出端发起连线
        const pos = this._portCenter(portEl);
        this.linking = { fromNode: node.id, fromPort: idx, fromPos: pos };
        this._tempPath = this._makePath('wire-temp');
      });
    }

    _bindGlobal() {
      global.addEventListener('mousemove', (e) => {
        // 画布平移优先
        if (this.panning) {
          this.panX = this._panStart[2] + (e.clientX - this._panStart[0]);
          this.panY = this._panStart[3] + (e.clientY - this._panStart[1]);
          this._applyTransform();
          return;
        }
        if (!this.linking) return;
        const cr = this.container.getBoundingClientRect();
        const mx = e.clientX - cr.left, my = e.clientY - cr.top;
        this._updateTempPath(this.linking.fromPos, [mx, my]);
      });
      global.addEventListener('mouseup', (e) => {
        // 结束平移
        if (this.panning) {
          this.panning = false;
          this.container.classList.remove('panning');
          return;
        }
        if (!this.linking) return;
        const cr = this.container.getBoundingClientRect();
        const mx = e.clientX - cr.left, my = e.clientY - cr.top;
        // 命中某个输入端？（判定半径随缩放调整，保证小倍率下仍易于点中）
        let target = null, best = Math.max(6, 14 * this.scale);
        for (const n of this.nodes) {
          n._ports.input.forEach((p, i) => {
            const c = this._portCenter(p);
            const d = Math.hypot(c[0] - mx, c[1] - my);
            if (d < best) { best = d; target = { nodeId: n.id, port: i }; }
          });
        }
        if (target) {
          this._addEdge(this.linking.fromNode, this.linking.fromPort, target.nodeId, target.port);
        }
        this._removeTempPath();
        this.linking = null;
      });
    }

    /* ---------- 渲染 ---------- */
    render() {
      for (const n of this.nodes) {
        if (n.el) { n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; }
        this._refreshNode(n);
      }
      this._drawWires();
    }

    _refreshNode(node) {
      // 输入端：是否已连线
      node.inputs.forEach((inp, i) => {
        if (!node._ports.input[i]) return;
        const connected = this.edges.some((e) => e.to.nodeId === node.id && e.to.port === i);
        node._ports.input[i].classList.toggle('bound', connected);
        const state = node._ports.input[i].parentNode.querySelector('.io-state');
        if (state) state.textContent = connected ? '● 已连接' : '○ 空';
      });
      node.outputs.forEach((o, j) => {
        if (node._ports.output[j]) node._ports.output[j].classList.toggle('bound', node.status.ok);
      });

      // 拾取电池：显示已拾取的图形
      if (node.key === 'pick' && node._pickInfo) {
        const sid = node.pickedShapeId;
        const sh = sid ? this.getShape(sid) : null;
        if (sh) {
          node._pickInfo.textContent = '已拾取：' + (SHAPE_LABEL[sh.type] || sh.type) + ' #' + sid;
          node._pickInfo.classList.add('ok');
        } else {
          node._pickInfo.textContent = '○ 未拾取图形';
          node._pickInfo.classList.remove('ok');
        }
      }

      if (node.statusEl) {
        if (node.status.text) {
          node.statusEl.style.display = '';
          node.statusEl.textContent = node.status.text;
          node.statusEl.className = 'node-status' + (node.status.ok ? ' ok' : '');
        } else {
          node.statusEl.style.display = 'none';
        }
      }
    }

    /* ---------- 连线绘制（SVG） ---------- */
    _portCenter(portEl) {
      const r = portEl.getBoundingClientRect();
      const cr = this.container.getBoundingClientRect();
      return [r.left + r.width / 2 - cr.left, r.top + r.height / 2 - cr.top];
    }
    _makePath(cls) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', cls);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', cls === 'wire-temp' ? '#f1c40f' : '#2f80ed');
      p.setAttribute('stroke-width', '2.5');
      this.svg.appendChild(p);
      return p;
    }
    _bezier(a, b) {
      const dx = Math.max(30, Math.abs(b[0] - a[0]) / 2);
      return `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]}, ${b[0] - dx} ${b[1]}, ${b[0]} ${b[1]}`;
    }
    _updateTempPath(a, b) {
      if (!this._tempPath) return;
      this._tempPath.setAttribute('d', this._bezier(a, b));
    }
    _removeTempPath() {
      if (this._tempPath && this._tempPath.parentNode) this._tempPath.parentNode.removeChild(this._tempPath);
      this._tempPath = null;
    }
    _drawWires() {
      Array.from(this.svg.querySelectorAll('path.wire')).forEach((p) => p.remove());
      for (const e of this.edges) {
        const fn = this.nodes.find((n) => n.id === e.from.nodeId);
        const tn = this.nodes.find((n) => n.id === e.to.nodeId);
        if (!fn || !tn) continue;
        const fp = fn._ports.output[e.from.port];
        const tp = tn._ports.input[e.to.port];
        if (!fp || !tp) continue;
        const a = this._portCenter(fp), b = this._portCenter(tp);
        const p = this._makePath('wire');
        p.setAttribute('d', this._bezier(a, b));
        p.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.edges = this.edges.filter((x) => x.id !== e.id);
          this._drawWires();
          this.onChange();
        });
      }
    }
  }

  global.GH = global.GH || {};
  global.GH.NodeEditor = NodeEditor;
})(typeof window !== 'undefined' ? window : globalThis);
