/* =========================================================
   viewport2d.js — 左侧图形拾取视图（二维矢量视图）
   负责：平移 / 缩放 / 重置、绘制直线·方形·圆形、拾取选中、
   选中高亮、直接拖拽移动图形，以及坐标变换与命中测试。
   图形数据由本视图持有，通过回调与上层（app）联动。
   ========================================================= */
(function (global) {
  'use strict';

  let _uid = 1;
  function nextId() { return 's' + (_uid++); }

  // 命中容差（屏幕像素）
  const HIT_TOL = 6;

  class Viewport2D {
    constructor(cfg) {
      this.canvas = cfg.canvas;
      this.ctx = cfg.canvas.getContext('2d');
      this.onSelect = cfg.onSelect || function () {};
      this.onChange = cfg.onChange || function () {};
      this.onShapeCreated = cfg.onShapeCreated || function () {};
      this.onModeChange = cfg.onModeChange || function () {};

      this.shapes = [];           // 全部图形
      this.selectedId = null;
      this.mode = 'select';       // select | pan | line | rect | circle
      this.panX = 0; this.panY = 0; this.scale = 1;

      // 交互临时状态
      this.temp = null;           // 绘制中的临时图形
      this.dragShape = null;      // 拖拽移动的图形
      this.moveStart = null;      // 拖拽起点（世界坐标）
      this.moveOrig = null;       // 拖拽起始图形副本
      this.panning = false;
      this.panStart = null;

      this._bind();
      this.resize();
      this.resetView();
    }

    /* ---------- 坐标变换 ---------- */
    screenToWorld(sx, sy) {
      return [(sx - this.panX) / this.scale, (sy - this.panY) / this.scale];
    }
    worldToScreen(wx, wy) {
      return [wx * this.scale + this.panX, wy * this.scale + this.panY];
    }

    /* ---------- 模式 / 视图 ---------- */
    setMode(m) {
      this.mode = m;
      this.temp = null;
      this.canvas.style.cursor = (m === 'pan') ? 'grab' : 'crosshair';
      this.onModeChange(m);
      this.render();
    }
    resetView() {
      const r = this.canvas.getBoundingClientRect();
      this.panX = r.width / 2;
      this.panY = r.height / 2;
      this.scale = 1;
      this.render();
    }
    zoomBy(factor) {
      const r = this.canvas.getBoundingClientRect();
      this._zoomAt(r.width / 2, r.height / 2, factor);
    }
    _zoomAt(sx, sy, factor) {
      const before = this.screenToWorld(sx, sy);
      this.scale = Math.max(0.1, Math.min(20, this.scale * factor));
      const after = this.screenToWorld(sx, sy);
      this.panX += (after[0] - before[0]) * this.scale;
      this.panY += (after[1] - before[1]) * this.scale;
      this.render();
    }

    /* ---------- 图形管理 ---------- */
    addShape(shape) { this.shapes.push(shape); }
    /** 以指定类型与参数直接创建一个图形（用于默认示例/快速搭建），返回该图形对象 */
    makeShape(type, props) {
      const s = Object.assign({ id: nextId(), type, boundRole: null }, props);
      this.shapes.push(s);
      return s;
    }
    getShape(id) { return this.shapes.find((s) => s.id === id) || null; }
    selectShape(id) {
      this.selectedId = id;
      this.onSelect(id);
      this.render();
    }
    /** 由属性面板调用：更新某图形参数并刷新 */
    updateShape(id, props) {
      const s = this.getShape(id);
      if (!s) return;
      Object.assign(s, props);
      this.render();
      this.onChange();
    }
    clearShapes() {
      this.shapes = [];
      this.selectedId = null;
      this.onSelect(null);
      this.render();
    }

    /* ---------- 命中测试 ---------- */
    _hitTest(wx, wy) {
      const tol = HIT_TOL / this.scale;
      for (let i = this.shapes.length - 1; i >= 0; i--) {
        const s = this.shapes[i];
        if (s.type === 'line') {
          if (this._distToSeg(wx, wy, s.x1, s.y1, s.x2, s.y2) <= tol) return s;
        } else if (s.type === 'rect') {
          if (wx >= s.x && wx <= s.x + s.w && wy >= s.y && wy <= s.y + s.h) return s;
        } else if (s.type === 'circle') {
          const d = Math.hypot(wx - s.cx, wy - s.cy);
          if (d <= s.r + tol) return s;
        }
      }
      return null;
    }
    _distToSeg(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = x1 + t * dx, cy = y1 + t * dy;
      return Math.hypot(px - cx, py - cy);
    }

    /* ---------- 事件绑定 ---------- */
    _bind() {
      const c = this.canvas;
      c.addEventListener('mousedown', (e) => this._onDown(e));
      c.addEventListener('mousemove', (e) => this._onMove(e));
      global.addEventListener('mouseup', (e) => this._onUp(e));
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this._zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 0.909);
      }, { passive: false });
      c.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    _onDown(e) {
      const [sx, sy] = this._pos(e);
      const [wx, wy] = this.screenToWorld(sx, sy);
      const rightOrMid = e.button === 1 || e.button === 2;

      // 平移：右键/中键，或 pan 模式
      if (rightOrMid || this.mode === 'pan') {
        this.panning = true;
        this.panStart = [sx, sy, this.panX, this.panY];
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      if (this.mode === 'line' || this.mode === 'rect' || this.mode === 'circle') {
        // 开始绘制
        this._drawStart = [wx, wy];
        if (this.mode === 'line') this.temp = { id: 'temp', type: 'line', x1: wx, y1: wy, x2: wx, y2: wy };
        else if (this.mode === 'rect') this.temp = { id: 'temp', type: 'rect', x: wx, y: wy, w: 0, h: 0 };
        else this.temp = { id: 'temp', type: 'circle', cx: wx, cy: wy, r: 0 };
        return;
      }

      // 选择模式：命中则进入拖拽移动，否则清空选择
      const hit = this._hitTest(wx, wy);
      if (hit) {
        this.selectShape(hit.id);
        this.dragShape = hit;
        this.moveStart = [wx, wy];
        this.moveOrig = JSON.parse(JSON.stringify(hit));
      } else {
        this.selectShape(null);
      }
    }

    _onMove(e) {
      const [sx, sy] = this._pos(e);
      const [wx, wy] = this.screenToWorld(sx, sy);

      if (this.panning) {
        this.panX = this.panStart[2] + (sx - this.panStart[0]);
        this.panY = this.panStart[3] + (sy - this.panStart[1]);
        this.render();
        return;
      }
      if (this.temp) {
        if (this.temp.type === 'line') { this.temp.x2 = wx; this.temp.y2 = wy; }
        else if (this.temp.type === 'rect') {
          this.temp.x = Math.min(this._drawStart[0], wx);
          this.temp.y = Math.min(this._drawStart[1], wy);
          this.temp.w = Math.abs(wx - this._drawStart[0]);
          this.temp.h = Math.abs(wy - this._drawStart[1]);
        } else {
          this.temp.r = Math.max(0, Math.hypot(wx - this.temp.cx, wy - this.temp.cy));
        }
        this.render();
        return;
      }
      if (this.dragShape) {
        const dx = wx - this.moveStart[0], dy = wy - this.moveStart[1];
        this._applyDelta(this.dragShape, this.moveOrig, dx, dy);
        this.render();
        this.onChange();
      }
    }

    _applyDelta(s, orig, dx, dy) {
      if (s.type === 'line') {
        s.x1 = orig.x1 + dx; s.y1 = orig.y1 + dy;
        s.x2 = orig.x2 + dx; s.y2 = orig.y2 + dy;
      } else if (s.type === 'rect') {
        s.x = orig.x + dx; s.y = orig.y + dy;
      } else if (s.type === 'circle') {
        s.cx = orig.cx + dx; s.cy = orig.cy + dy;
      }
    }

    _onUp(e) {
      if (this.panning) {
        this.panning = false;
        this.canvas.style.cursor = (this.mode === 'pan') ? 'grab' : 'crosshair';
        return;
      }
      if (this.temp) {
        const t = this.temp; this.temp = null;
        // 过滤过小图形
        let ok = true;
        if (t.type === 'line') ok = Math.hypot(t.x2 - t.x1, t.y2 - t.y1) > 1;
        if (t.type === 'rect') ok = t.w > 1 && t.h > 1;
        if (t.type === 'circle') ok = t.r > 1;
        if (ok) {
          const shape = Object.assign({}, t, { id: nextId(), boundRole: null });
          this.addShape(shape);
          this.onShapeCreated(shape);
          this.selectShape(shape.id);
        } else {
          this.render();
        }
        // 绘制完成后回到选择模式（贴合 GH 习惯）
        this.setMode('select');
        return;
      }
      if (this.dragShape) { this.dragShape = null; this.moveOrig = null; }
    }

    /* ---------- 渲染 ---------- */
    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = global.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
      this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = r.width; this.h = r.height;
      this.render();
    }

    render() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.w, this.h);

      // 背景网格（淡）
      this._drawGrid();

      const all = this.temp ? this.shapes.concat([this.temp]) : this.shapes;
      for (const s of all) this._drawShape(s);
    }

    _drawGrid() {
      const ctx = this.ctx;
      const step = 40 * this.scale;
      if (step < 8) return;
      ctx.strokeStyle = 'rgba(180,195,210,0.35)';
      ctx.lineWidth = 1;
      const ox = this.panX % step, oy = this.panY % step;
      ctx.beginPath();
      for (let x = ox; x < this.w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
      for (let y = oy; y < this.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
      ctx.stroke();
      // 原点十字
      const [oxs, oys] = this.worldToScreen(0, 0);
      ctx.strokeStyle = 'rgba(120,140,160,0.6)';
      ctx.beginPath();
      ctx.moveTo(oxs - 8, oys); ctx.lineTo(oxs + 8, oys);
      ctx.moveTo(oxs, oys - 8); ctx.lineTo(oxs, oys + 8);
      ctx.stroke();
    }

    _drawShape(s) {
      const ctx = this.ctx;
      const selected = s.id === this.selectedId;
      // 颜色：默认蓝灰；绑定路径=蓝，绑定截面=绿；选中高亮=橙
      let stroke = '#5b7088', fill = 'rgba(91,112,136,0.10)', lw = 1.6;
      if (s.boundRole === 'path') { stroke = '#2f80ed'; fill = 'rgba(47,128,237,0.12)'; }
      else if (s.boundRole === 'section') { stroke = '#27ae60'; fill = 'rgba(39,174,96,0.12)'; }
      if (selected) { stroke = '#e8743b'; lw = 2.6; fill = 'rgba(232,116,59,0.14)'; }

      ctx.lineWidth = selected ? 2.6 : 1.6; // 屏幕线宽恒定
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;

      if (s.type === 'line') {
        const [x1, y1] = this.worldToScreen(s.x1, s.y1);
        const [x2, y2] = this.worldToScreen(s.x2, s.y2);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        this._dot(x1, y1, selected ? 4 : 3, stroke);
        this._dot(x2, y2, selected ? 4 : 3, stroke);
      } else if (s.type === 'rect') {
        const [x, y] = this.worldToScreen(s.x, s.y);
        const w = s.w * this.scale, h = s.h * this.scale;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      } else if (s.type === 'circle') {
        const [cx, cy] = this.worldToScreen(s.cx, s.cy);
        const rr = s.r * this.scale;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // 半径参考线
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + rr, cy); ctx.stroke();
      }
    }

    _dot(x, y, r, color) {
      const ctx = this.ctx;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    }
  }

  global.GH = global.GH || {};
  global.GH.Viewport2D = Viewport2D;
})(typeof window !== 'undefined' ? window : globalThis);
