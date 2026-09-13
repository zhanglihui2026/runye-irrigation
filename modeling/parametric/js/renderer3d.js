/* =========================================================
   renderer3d.js — 轻量自研 3D 预览渲染器（无外部依赖）
   仅用 Canvas2D 实现：透视投影 + 深度排序（画家算法）+ 简单光照。
   负责把 computeLoft 输出的三角网格实时渲染为三维管状实体。
   ========================================================= */
(function (global) {
  'use strict';

  // 基础材质色（钢蓝色）与光照方向
  const BASE = [86, 146, 207];
  const LIGHT = (function () {
    const l = [-0.4, -0.55, 0.75];
    const n = Math.hypot(l[0], l[1], l[2]);
    return [l[0] / n, l[1] / n, l[2] / n];
  })();
  const AMBIENT = 0.32;

  class Renderer3D {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tris = [];          // 当前三角网格（已居中）
      this.center = [0, 0, 0]; // 几何中心（用于居中）
      this.bboxR = 1;          // 包围球半径（用于自适应缩放）
      this.yaw = -0.6;         // 初始偏航角（弧度）
      this.pitch = 0.5;        // 初始俯仰角
      this.zoom = 1;           // 用户缩放倍数
      this.dragging = false;
      this.lastX = 0; this.lastY = 0;
      this._bindEvents();
      this.resize();
    }

    /** 设置要渲染的三角网格（tris 可为 null/空数组 → 清空） */
    setData(tris) {
      this.tris = (tris && tris.length) ? tris : [];
      if (this.tris.length) this._computeFrame();
      this.render();
    }

    isEmpty() { return this.tris.length === 0; }

    /** 计算几何中心与包围半径，使模型自适应居中 */
    _computeFrame() {
      let cx = 0, cy = 0, cz = 0;
      const n = this.tris.length * 3;
      for (const t of this.tris) for (const p of t) { cx += p[0]; cy += p[1]; cz += p[2]; }
      this.center = [cx / n, cy / n, cz / n];
      let r = 1e-6;
      for (const t of this.tris) for (const p of t) {
        const d = Math.hypot(p[0] - this.center[0], p[1] - this.center[1], p[2] - this.center[2]);
        if (d > r) r = d;
      }
      this.bboxR = r;
    }

    /** 视图变换：先绕 Y 轴偏航，再绕 X 轴俯仰 */
    _transform(p) {
      const x0 = p[0] - this.center[0];
      const y0 = p[1] - this.center[1];
      const z0 = p[2] - this.center[2];
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      // 偏航（绕 Y）
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y1 = y0;
      // 俯仰（绕 X）
      const y2 = y1 * cp - z1 * sp;
      const z2 = y1 * sp + z1 * cp;
      return [x1, y2, z2];
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = global.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = rect.width; this.h = rect.height;
      this.render();
    }

    render() {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.w, this.h);
      if (!this.tris.length) return;

      const W = this.w, H = this.h;
      const cx = W / 2, cy = H / 2;
      const D = this.bboxR * 3 + 1;                 // 相机距离
      const scale = (Math.min(W, H) * 0.42) / this.bboxR * this.zoom;

      // 预变换每个三角形
      const faces = [];
      for (const t of this.tris) {
        const vt = t.map((p) => this._transform(p));
        // 视图空间法线
        const e1 = [vt[1][0] - vt[0][0], vt[1][1] - vt[0][1], vt[1][2] - vt[0][2]];
        const e2 = [vt[2][0] - vt[0][0], vt[2][1] - vt[0][1], vt[2][2] - vt[0][2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // 翻转到朝向相机
        const bright = AMBIENT + (1 - AMBIENT) * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        const zAvg = (vt[0][2] + vt[1][2] + vt[2][2]) / 3;
        faces.push({ vt, bright, z: zAvg });
      }

      // 画家算法：远（z 小）先画
      faces.sort((a, b) => a.z - b.z);

      for (const f of faces) {
        const pts = f.vt.map((p) => {
          const persp = D / (D - p[2]);
          return [cx + p[0] * scale * persp, cy - p[1] * scale * persp];
        });
        const r = Math.min(255, Math.round(BASE[0] * f.bright));
        const g = Math.min(255, Math.round(BASE[1] * f.bright));
        const b = Math.min(255, Math.round(BASE[2] * f.bright));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.closePath();
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(20,40,70,0.55)`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    _bindEvents() {
      const c = this.canvas;
      c.addEventListener('mousedown', (e) => {
        this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      });
      global.addEventListener('mousemove', (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
        this.lastX = e.clientX; this.lastY = e.clientY;
        this.yaw += dx * 0.01;
        this.pitch += dy * 0.01;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
        this.render();
      });
      global.addEventListener('mouseup', () => { this.dragging = false; });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.zoom *= (e.deltaY < 0) ? 1.08 : 0.926;
        this.zoom = Math.max(0.2, Math.min(6, this.zoom));
        this.render();
      }, { passive: false });
    }
  }

  global.GH = global.GH || {};
  global.GH.Renderer3D = Renderer3D;
})(typeof window !== 'undefined' ? window : globalThis);
