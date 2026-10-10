
/* ============================================================================
   [v194 2026-10-03] 04b「成组管路」页：整组总览 + 总管编辑 + 按块进入三级页
   ----------------------------------------------------------------------------
   用户原话：「二级管路逐块编辑完之后，要跳转……我要在新的页面进一步编辑，
             二级页面逐块生成主管及支管，进入新的页面进一步编辑 生成总管。」
   用户拍板：① 混合：新建组级页做总管与总览，三级页按块分别进入
             ② 总管 = 画线 + 定管径 + 进材料清单
             ③ 二级页的总管按钮移到本页统一管理
             ④ 既出各块明细，也汇总一张总清单

   ★★ 为什么三级页能「零改动按块进入」：
       tlAutoGenerate() 的输入只有两个：
         · window.measuredPolygon              —— 被当成**单个地块**的多边形
         · window.RunyeBridge.getZoneCuts()    —— 分区网格，内部读二级页 ppState.polyPts
       而 v193 的逐块切换本来就会把 ppState.polyPts 换成那一块的环。
       ⇒ 「按块进三级页」= 切到该块 → 把同一条环写进 measuredPolygon → 生成。
       三级页内部一行都不用改（全站 88 处引用 tlDiagramData 的地方也都不用改）。

   ★ 本页只做**组级**的事。块级的重活（自动布管 / 管径 / 水力 / 系统图 / 轴测图）
     全部仍走三级页，按块分别进 —— 这正是「各块完全独立」的结构保证。
   ============================================================================ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function clone(v) { try { return JSON.parse(JSON.stringify(v === undefined ? null : v)); } catch (e) { return null; } }
  function num(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d || 0); }
  function fmt(v, n) { if (!isFinite(v)) return '—'; return v.toFixed(n === undefined ? 1 : n); }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function sumLen(lines) {
    var t = 0;
    (lines || []).forEach(function (l) {
      for (var i = 0; i + 1 < l.length; i++) t += dist(l[i], l[i + 1]);
    });
    return t;
  }

  /* ---------------- 数据层 ---------------- */
  var W = { blocks: [], trunk: { lines: [], dn: 110 }, frame: null, sel: -1, draw: null, mode: 'pick', tlShow: true, drag: null, hovBlock: -1 };
  window.__runyeGroupWork = W;

  /* 从二级页接管：各块环 / 各块的编辑结果 / 外框；并把 v193 在二级页画的总管迁过来 */
  function grSlotSignature(ring, slot) {
    slot = slot || {};
    return JSON.stringify([ring, slot.mainPipes, slot.branchPipes, slot.subBranchPipes,
      slot.source, slot.cutOverrides, slot.cutSnap && slot.cutSnap.x, slot.cutSnap && slot.cutSnap.y]);
  }
  function grSync() {
    var subs = window.__runyeSubPlots, ge = window.__runyeGroupEdit;
    var groupKey = JSON.stringify((subs || []).map(function(s){return s.id || s.name;}));
    if (!subs || subs.length < 2 || W.groupRef !== ge || W.groupKey !== groupKey) {
      W.blocks = []; W.frame = null; W.trunk = {lines: [], dn: 110};
      W.sel = -1; W.draw = null; W.drag = null; W.mode = 'pick'; W.hyd = null; W.tlDefaults = null;
      window.__runyeGroupFrame = null; window.__runyeTlBlock = null; window.__runyeGroupPlotEdit = null;
    }
    W.groupRef = ge; W.groupKey = groupKey;
    if (!subs || subs.length < 2) return false;
    var old = W.blocks.slice();
    W.frame = clone((ge && ge.framePts && ge.framePts.length) ? ge.framePts : (window.measuredPolygon || []));
    /* ★ 二级页**正在编辑**的那一块：slots[i] 是上次切块/切模式时的快照，
       用户在二级页画完管直接切过来时它还没更新 ⇒ 必须优先取实时的一份。 */
    var B = window.RunyeBridge;
    var live = (B && B.groupLiveSlot) ? B.groupLiveSlot() : null;
    var liveIdx = live && ge ? ge.current : -1;
    W.blocks = subs.map(function (s, i) {
      var prev = old.filter(function(b){return s.id != null ? b.id === s.id : b.name === (s.name || ('子地块' + (i + 1)));})[0] || {};
      var slot = (i === liveIdx) ? live : ((ge && ge.slots[i]) ? clone(ge.slots[i]) : null);
      var ring = (s.poly || []).map(function(q){return {x:+q.x,y:+q.y};});
      if (prev.tlData && grSlotSignature(prev.ring, prev.slot) !== grSlotSignature(ring, slot)) {
        prev = {};   // L2 geometry changed: old L3 results no longer describe this block.
      }
      return {
        id: s.id, name: s.name || ('子地块' + (i + 1)),
        mu: B && B.polyArea ? B.polyArea(ring) / 666.67 : num(s.mu, 0),
        ring: ring,
        slot: slot,
        tlState: prev.tlState || null,
        tlData: prev.tlData || null,     /* 该块跑过的三级结果：按块存档，换块不丢 */
        tlAt: prev.tlAt || null,
        /* [v238] 玩家拖过的驳接点位置（分区驳接点按分区序号存、块驳接点一个），
           同 tlData 一路按块存档 —— grSync 会重建 blocks，不带过来就会被清掉。 */
        tpOver: prev.tpOver || null,
        srcOver: prev.srcOver || null
      };
    });
    /* v193 的总管存在 __runyeGroupEdit.trunkPipes；v194 起归本页管，旧数据一次性迁过来 */
    if (ge && Array.isArray(ge.trunkPipes)) W.trunk.lines = ge.trunkPipes;
    if (ge && ge.trunkDn > 0) W.trunk.dn = ge.trunkDn;
    if ($('grTrunkDn')) $('grTrunkDn').value = String(W.trunk.dn);
    if (W.sel >= W.trunk.lines.length) W.sel = -1;
    return true;
  }

  /* ---------------- 画布：整组总览 ---------------- */
  var cvs = $('grCanvas'), ctx = cvs ? cvs.getContext('2d') : null;
  var view = { minX: 0, minY: 0, w: 1, h: 1, scale: 1, ox: 0, oy: 0 };

  function grResize() {
    if (!cvs) return;
    var r = cvs.parentNode.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cvs.width !== Math.round(w * dpr) || cvs.height !== Math.round(h * dpr)) {
      cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.cw = w; view.ch = h;
  }
  function grFit() {
    var pts = [];
    W.blocks.forEach(function (b) { pts = pts.concat(b.ring); });
    (W.trunk.lines || []).forEach(function (l) { pts = pts.concat(l); });
    if (!pts.length && W.frame) pts = W.frame;
    if (!pts.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    view.minX = minX; view.minY = minY; view.w = Math.max(1, maxX - minX); view.h = Math.max(1, maxY - minY);
    grFitScale();
  }
  function grFitScale() {
    var pad = 34;
    var s = Math.min(((view.cw || 600) - pad * 2) / view.w, ((view.ch || 400) - pad * 2) / view.h);
    view.scale = isFinite(s) && s > 0 ? s : 1;
    view.ox = ((view.cw || 600) - view.w * view.scale) / 2 - view.minX * view.scale;
    view.oy = ((view.ch || 400) - view.h * view.scale) / 2 - view.minY * view.scale;
  }
  function toC(mx, my) { return { x: mx * view.scale + view.ox, y: my * view.scale + view.oy }; }
  function toW(cx, cy) { return { x: (cx - view.ox) / view.scale, y: (cy - view.oy) / view.scale }; }

  function strokeLines(lines, color, w) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash([]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    (lines || []).forEach(function (l) {
      if (!l || l.length < 2) return;
      ctx.beginPath();
      l.forEach(function (p, i) { var q = toC(p.x, p.y); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    });
  }
  /* ---------------- 尺寸标注（v198；v237 改标管径） ----------------
     用户原话（v198）：「这个页面增加尺寸标注，显示主管 支管。」
     用户原话（v237）：「60跟52是管道长度吗？这里不用显示管道长度，显示管道直径。」
     每根主管/支管在**长度中点**标出【管径 Ø】：白底小牌 + 屏幕像素字号（不随缩放），
     主管蓝字 / 支管绿字，与线色对应；图例改「线上数字 = 管径」。 */
  function grMidOf(l) {
    var total = 0, segs = [], i, d;
    for (i = 0; i + 1 < l.length; i++) { d = dist(l[i], l[i + 1]); segs.push(d); total += d; }
    var half = total / 2, acc = 0;
    for (i = 0; i + 1 < l.length; i++) {
      if (acc + segs[i] >= half) {
        var t = segs[i] ? (half - acc) / segs[i] : 0;
        return { x: l[i].x + (l[i + 1].x - l[i].x) * t, y: l[i].y + (l[i + 1].y - l[i].y) * t };
      }
      acc += segs[i];
    }
    return l[Math.floor(l.length / 2)] || null;
  }
  function grLabel(text, wp, color) {
    if (!wp) return;
    var q = toC(wp.x, wp.y);
    ctx.font = '10px sans-serif';
    var w = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(q.x - w / 2, q.y - 7, w, 14);
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, q.x, q.y);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }

  function curBlock() {
    var i = window.__runyeTlBlock;
    return (i == null) ? null : W.blocks[i];
  }

  /* ---------------- 各块分区线（只读，v196） ----------------
     用户原话：「这个页面要把管路跟每个地块分区都显示出来，这样我才能判断后续怎么规整。」
     ⇒ 分区几何走 RunyeBridge.zoneCutsFor()（内部**就是二级页同一套**
       ppGetZoneLayout / ppGetZoneCuts，换入本块 slot 的分区快照、算完还原）——
       不写第二份算法（v193 铁律：成组退化成「多次单块」，一行规则都不改）。
     ★★ 本 IIFE 里没有 ppState / ppGetZoneCuts（二级页 IIFE 私有，跨块够不着）——
       v196 第一版直接引用直接 ReferenceError，group_work 探针 FATAL 抓到。 */
  function grZonesFor(b) {
    if (!b.ring || b.ring.length < 3) return null;
    var B = window.RunyeBridge;
    if (!B || !B.zoneCutsFor) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    b.ring.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    if (!isFinite(minX) || maxX - minX < 0.5 || maxY - minY < 0.5) return null;
    var bb = { minX: minX, minY: minY, w: maxX - minX, h: maxY - minY };
    /* 分区数与二级页同源：读同一个输入框（planN / fld_N），整组共用一个口径 */
    var elN = document.getElementById('planN'), elF = document.getElementById('fld_N');
    var planN = parseInt(elN && elN.value) || parseInt(elF && elF.value) || 4;
    return B.zoneCutsFor(bb, planN, b.slot && b.slot.cutSnap, b.slot && b.slot.cutOverrides);
  }
  /* ===== [v236] 地块尺寸标注 —— 样式与三级管路页同一套（建筑制图风） =====
     用户原话：「地块的尺寸标注样式跟三级管路一样，改下。」
     三级页基因（tlAutoGenerate 的 gplot-h/gplot-v）：#111 0.95 细线、尺寸界线越过尺寸线
     4px（DG.ext，2026-09-27 用户定的「要有尾巴」形态）、建筑斜短线刻度（k=4/宽 2.8）、
     粗体 12px「60 m」文字（整数或 1 位小数）、文字净距 GAP=4。
     ★ 几何参数走 window.RyDimGeo.get() —— 与三级页**单一来源**，那边调比例这边跟着变。
     ★ 画在【屏幕像素】空间（toC 之后直接画），不随缩放变粗细；偏移 26/24px 压在
       grFit 的 34px 留白带内，窄窗口不被裁掉。 */
  /* [v237] 用户反馈「地块标注的比例有点大，缩小一些」：成组页本地缩小系数。
     只乘在成组页出口上，RyDimGeo 本身不动 —— 三级页不受影响，单一来源仍然成立。 */
  var GR_DIM_K = 0.8;
  function grDimGeo() {
    var G = (window.RyDimGeo && window.RyDimGeo.get) ? window.RyDimGeo.get() : { ext: 4, gap: 4, tick: 4, tickW: 2.8, font: 12 };
    return { ext: G.ext * GR_DIM_K, gap: G.gap * GR_DIM_K, tick: G.tick * GR_DIM_K, tickW: G.tickW * GR_DIM_K, font: G.font * GR_DIM_K };
  }
  function grDimLabel(v) {
    if (!isFinite(v)) return '— m';
    var r = Math.round(v);
    return Math.abs(v - r) < 0.05 ? r + ' m' : v.toFixed(1) + ' m';
  }
  function grArchTick(x, y, dir, G) {
    /* save/restore 封住副作用：斜短线是 2.8 粗线，不能把线宽泄漏给后面的尺寸线 */
    ctx.save();
    var k = G.tick;
    ctx.beginPath();
    if (dir === 'h') { ctx.moveTo(x - k, y + k); ctx.lineTo(x + k, y - k); }
    else { ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); }
    ctx.lineWidth = G.tickW; ctx.strokeStyle = '#111111'; ctx.setLineDash([]); ctx.stroke();
    ctx.restore();
  }
  function grDimText(x, y, txt, rotate, off) {
    ctx.save();
    ctx.translate(x, y);
    if (rotate) ctx.rotate(-Math.PI / 2);
    var fam = 'sans-serif';
    try { fam = getComputedStyle(document.body).fontFamily || fam; } catch (e) { }
    ctx.font = '700 ' + (G_grDimFont()) + 'px ' + fam;
    ctx.fillStyle = '#111111'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(txt, 0, off || 0);
    ctx.restore();
  }
  function G_grDimFont() { var G = grDimGeo(); return G.font || 12; }
  function grRenderBlockDims() {
    var G = grDimGeo();
    var GAP = G.gap, EXT = G.ext;
    var ink = (window.__ryInkM ? window.__ryInkM(G.font) : { a: G.font * 0.75, d: 0 });
    var ASC = ink.a, DESC = ink.d;
    W.blocks.forEach(function (b) {
      if (!b.ring || b.ring.length < 3) return;
      /* nX/nY = 最小值（初值 +Infinity）；xX/xY = 最大值（初值 -Infinity）——
         写反会让 min 恒等于初值（±Infinity）⇒ 宽度退化成 Infinity ⇒ 文字变「— m」 */
      var nX = Infinity, nY = Infinity, xX = -Infinity, xY = -Infinity;
      b.ring.forEach(function (p) {
        if (p.x < nX) nX = p.x; if (p.x > xX) xX = p.x;
        if (p.y < nY) nY = p.y; if (p.y > xY) xY = p.y;
      });
      var bl = toC(nX, xY), br = toC(xX, xY), tl = toC(nX, nY);
      var bottom = Math.max(bl.y, br.y), right = Math.max(bl.x, br.x);
      ctx.setLineDash([]);
      /* 底边水平尺寸线：界线自块角外 4px 起、越过尺寸线 ext（「有尾巴」形态）；
         数字默认放线上方（基线 = 线 - GAP - 墨迹下降部），与三级页同款。
         ★ 每条尺寸线描边前都显式重设 0.95/#111 —— 斜短线是粗线，别让它串味。
         [v237] 两条线的离块偏移同乘 GR_DIM_K（标注整体缩小，离块距离一起缩）。 */
      var dimY = bottom + 26 * GR_DIM_K;
      ctx.strokeStyle = '#111111'; ctx.lineWidth = 0.95; ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(bl.x, bottom + 4); ctx.lineTo(bl.x, dimY + EXT);
      ctx.moveTo(br.x, bottom + 4); ctx.lineTo(br.x, dimY + EXT);
      ctx.moveTo(bl.x, dimY); ctx.lineTo(br.x, dimY);
      ctx.stroke();
      grArchTick(bl.x, dimY, 'h', G);
      grArchTick(br.x, dimY, 'h', G);
      grDimText((bl.x + br.x) / 2, dimY - GAP - DESC, grDimLabel(xX - nX), false, 0);
      /* 右侧垂直尺寸线：文字 rotate(-90)，基线推到线右 GAP+ASC 处（墨迹朝左长出，
         净距恰为 GAP —— 与三级页左侧垂直标注镜像同构） */
      var dimX = right + 24 * GR_DIM_K;
      ctx.strokeStyle = '#111111'; ctx.lineWidth = 0.95; ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(right + 4, tl.y); ctx.lineTo(dimX + EXT, tl.y);
      ctx.moveTo(right + 4, bottom); ctx.lineTo(dimX + EXT, bottom);
      ctx.moveTo(dimX, tl.y); ctx.lineTo(dimX, bottom);
      ctx.stroke();
      grArchTick(dimX, tl.y, 'v', G);
      grArchTick(dimX, bottom, 'v', G);
      grDimText(dimX, (tl.y + bottom) / 2, grDimLabel(xY - nY), true, GAP + ASC);
    });
  }

  function grRender() {
    if (!ctx) return;
    grResize();
    ctx.fillStyle = '#dfe4e2'; ctx.fillRect(0, 0, view.cw || cvs.width, view.ch || cvs.height);
    var cb = curBlock();
    /* 各块环：整组态都画出来，当前正在编辑的那一块高亮
       [v242] 鼠标悬停的那一块再加一层「可双击进入」的高亮（否则用户不知道哪能双击） */
    W.blocks.forEach(function (b, bi) {
      if (!b.ring || b.ring.length < 3) return;
      var hov = (bi === W.hovBlock);
      ctx.beginPath();
      b.ring.forEach(function (p, i) { var q = toC(p.x, p.y); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.closePath();
      ctx.fillStyle = (b === cb) ? 'rgba(124,58,237,.12)' : (hov ? 'rgba(15,118,110,.10)' : 'rgba(26,71,49,.06)');
      ctx.fill();
      ctx.strokeStyle = (b === cb) ? '#7c3aed' : (hov ? '#0f766e' : 'rgba(26,71,49,.65)');
      ctx.lineWidth = (b === cb) ? 2.5 : (hov ? 2.8 : 2); ctx.setLineDash([]); ctx.stroke();
    });
    /* 各块分区线（只读，v196）：虚线画每块内部的分区网格，非标区琥珀描边 ——
       口径与二级页一致（裁剪到本块环内，贯穿 bbox 线）。用户要在这里判断
       「后续怎么规整」，必须看得见每块内部是怎么分的。 */
    W.blocks.forEach(function (b) {
      var cuts = grZonesFor(b);
      if (!cuts || !cuts.xPos || cuts.xPos.length < 2 || !cuts.yPos || cuts.yPos.length < 2) return;
      ctx.save();
      ctx.beginPath();
      b.ring.forEach(function (p, i) { var q = toC(p.x, p.y); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.closePath();
      ctx.clip();
      ctx.strokeStyle = 'rgba(51,65,85,.45)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      cuts.xPos.forEach(function (x) {
        var p1 = toC(x, cuts.yPos[0]), p2 = toC(x, cuts.yPos[cuts.yPos.length - 1]);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      });
      cuts.yPos.forEach(function (y) {
        var p1 = toC(cuts.xPos[0], y), p2 = toC(cuts.xPos[cuts.xPos.length - 1], y);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      });
      /* 非标分区（实际面积 < 标准 97%）：琥珀描边 —— 判断口径与二级页 ppDrawZones 相同；
         面积只算本块自己的环（走纯函数桥，不走 ppZoneActualAreaM2 —— 成组时它会把
         全部成员环都裁剪进来，本块 cell 会被别的块污染）。 */
      var XB = window.RunyeBridge;
      ctx.setLineDash([]);
      ctx.lineWidth = 1.4;
      for (var zr = 0; zr < cuts.rows; zr++) {
        for (var zc = 0; zc < cuts.cols; zc++) {
          var cell = XB && XB.clipPolyToRect
            ? XB.clipPolyToRect(b.ring, cuts.xPos[zc], cuts.yPos[zr], cuts.xPos[zc + 1], cuts.yPos[zr + 1])
            : null;
          var mu = (cell && XB.polyArea ? XB.polyArea(cell) : 0) / 666.67;
          var stdMu = (cuts.xPlan[zc] || 0) * (cuts.yPlan[zr] || 0) / 666.67;
          if (stdMu > 0 && mu < stdMu * 0.97 && mu > 0.05) {
            var q1 = toC(cuts.xPos[zc], cuts.yPos[zr]), q2 = toC(cuts.xPos[zc + 1], cuts.yPos[zr + 1]);
            ctx.strokeStyle = 'rgba(217,119,6,.9)';
            ctx.strokeRect(q1.x, q1.y, q2.x - q1.x, q2.y - q1.y);
          }
        }
      }
      ctx.restore();
    });
    /* [v236] 各块尺寸标注（建筑制图风，同三级页样式）：底边总宽 + 右侧总高 */
    grRenderBlockDims();
    /* 各块已布的管线：只读（块级的编辑一律回二级页逐块模式 / 三级页，不在本页改） */
    W.blocks.forEach(function (b) {
      var s = b.slot || {};
      strokeLines(s.mainPipes, 'rgba(24,95,165,.85)', 3);
      strokeLines(s.branchPipes, 'rgba(22,163,74,.85)', 2);
      strokeLines(s.subBranchPipes, 'rgba(24,95,165,.55)', 1.6);
      if (s.source) {
        var q = toC(s.source.x, s.source.y);
        ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.fill();
      }
    });
    /* [v198] 主管/支管尺寸标注：画完所有线再统一标（标注层在最上，不被线压住）。
       [v237] 用户原话：「60跟52是管道长度吗？这里不用显示管道长度，显示管道直径。」
       ⇒ 线上数字由管长改为【管径】：主管标 Ø该分区主管径、支管标 Ø该分区支管径，
          数据直接读 v233 grComputeHydraulics 的 W.hyd（zones[i].mainDn/branchDn），
          不写第二份选型算法（v193 铁律）。
       · hyd 块与 W.blocks 同序生成但会跳过无分区的块 ⇒ 用同一跳过条件做双指针对齐；
       · 仅当「该块管线条数 = 分区数」时按序号取径（与 v233 的 mains[z]↔zones[z] 同一假设），
         对不上或 hyd 未算时【不标】，绝不回退成管长（用户明确不要管长）。 */
    var hydI = 0;
    W.blocks.forEach(function (b) {
      var s = b.slot || {};
      var hb = null;
      if (W.hyd) {
        var cuts0 = grZonesFor(b);
        if (cuts0 && cuts0.zoneCount) hb = W.hyd.blocks[hydI++] || null;
      }
      var zoneByIndex = {};
      if(hb) hb.zones.forEach(function(z){zoneByIndex[z.z - 1] = z;});
      var zMain = (hb && hb.zoneCount === (s.mainPipes || []).length) ? zoneByIndex : null;
      var zBr = (hb && hb.zoneCount === (s.branchPipes || []).length) ? zoneByIndex : null;
      (s.mainPipes || []).forEach(function (l, z) {
        if (l && l.length >= 2 && zMain && zMain[z]) grLabel('\u00d8' + zMain[z].mainDn, grMidOf(l), '#185FA5');
      });
      (s.branchPipes || []).forEach(function (l, z) {
        if (l && l.length >= 2 && zBr && zBr[z]) grLabel('\u00d8' + zBr[z].branchDn, grMidOf(l), '#15803d');
      });
    });
    /* [v235] 三级管路导入层（只读，独立通道）：画在 ⚡ 管线之上、总管与 v233 驳接点之下 */
    grTlRender();
    /* 总管：本页唯一可编辑的图层 */
    (W.trunk.lines || []).forEach(function (l, i) {
      strokeLines([l], (i === W.sel) ? '#f59e0b' : '#7c3aed', (i === W.sel) ? 7 : 5);
    });
    /* [v244] 跨块大总管自动最短链路：无手画总管时，画出连各块红点的最短路径（紫色） */
    if (!(W.trunk.lines && W.trunk.lines.length) && W.hyd && W.hyd.trunkAuto && W.hyd.trunkAuto.length >= 2) {
      strokeLines([W.hyd.trunkAuto], '#7c3aed', 5);
    }
    /* [v231] 驳接点（每块每分区边缘的主管端点）：琥珀点 + 主管dn 标签，供总管穿越连接 */
    drawTakeoffs();
    /* 正在画的那根 */
    if (W.draw && W.draw.length) {
      strokeLines([W.draw], '#7c3aed', 4);
      ctx.fillStyle = '#7c3aed';
      W.draw.forEach(function (p) {
        var q = toC(p.x, p.y); ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill();
      });
    }
  }

  /* 点选总管：点到折线任一段 ±6px 内就算选中 */
  function grPick(wp) {
    var best = -1, bd = 6 / view.scale;
    (W.trunk.lines || []).forEach(function (l, i) {
      for (var k = 0; k + 1 < l.length; k++) {
        var a = l[k], b = l[k + 1];
        var vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
        var t = len2 ? ((wp.x - a.x) * vx + (wp.y - a.y) * vy) / len2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        var d = Math.sqrt((wp.x - (a.x + vx * t)) ** 2 + (wp.y - (a.y + vy * t)) ** 2);
        if (d < bd) { bd = d; best = i; }
      }
    });
    return best;
  }

  /* [v196] 原「总管自动生成 grAutoTrunk」整个撤掉：用户原话「总管我会根据
     实际情况，手动画」—— 自动连线猜不出水源与走向，生成的还要删，反而碍事。
     总管 = 本页手画（✎ 画总管），画完照旧计入材料汇总的总管行。 */

  /* ---------------- 面板渲染 ---------------- */
  function grRenderBar() {
    var n = W.blocks.length, mu = 0;
    W.blocks.forEach(function (b) { mu += num(b.mu, 0); });
    if ($('grPlotName')) $('grPlotName').textContent = W.blocks.length ? (window.__runyeGroupName || '成组地块') : '—';
    if ($('grBlockCount')) $('grBlockCount').textContent = String(n);
    /* 没有成组地块时显示「—」而不是「0.00 亩」—— 后者会让人以为「有地块、面积为 0」 */
    if ($('grTotalMu')) $('grTotalMu').textContent = n ? fmt(mu, 2) : '—';
    if ($('grEmpty')) $('grEmpty').style.display = W.blocks.length ? 'none' : 'block';
  }
  function grRenderTrunk() {
    var ge = window.__runyeGroupEdit;
    if (ge && W.groupRef === ge) { ge.trunkPipes = W.trunk.lines; ge.trunkDn = W.trunk.dn; }
    grComputeHydraulics(); grRenderHyd();
    var len = sumLen(W.trunk.lines), n = (W.trunk.lines || []).length;
    if ($('grTrunkLen')) $('grTrunkLen').textContent = fmt(len, 1);
    if ($('grTrunkN')) $('grTrunkN').textContent = String(n);
    if ($('grTrunkMat')) $('grTrunkMat').textContent = 'Ø' + W.trunk.dn + ' mm PE';
    if ($('grTrunkDraw')) $('grTrunkDraw').classList.toggle('active', W.mode === 'draw');
  }
  function grRenderBlocks() {
    var box = $('grBlocks'); if (!box) return;
    if (!W.blocks.length) {
      box.innerHTML = '<div class="gr-empty">当前不是成组地块。请先在在线地图把两个及以上地块成组后回传。</div>';
      return;
    }
    box.innerHTML = '';
    W.blocks.forEach(function (b, i) {
      var s = b.slot || {};
      var ml = sumLen(s.mainPipes), bl = sumLen(s.branchPipes);
      var d = document.createElement('div');
      /* [v242] 「当前块」高亮对两条路都成立：三级页(__runyeTlBlock) / 二级页(__runyeGroupPlotEdit)。
         三级优先 —— 它 != null 时一定是从「▶ 进入三级页」进来的，此刻没有二级编辑在途。 */
      var curI = (window.__runyeTlBlock != null) ? window.__runyeTlBlock : window.__runyeGroupPlotEdit;
      d.className = 'gr-block' + (curI === i ? ' cur' : '');
      var hasPipe = ((s.mainPipes || []).length + (s.branchPipes || []).length + (s.subBranchPipes || []).length) > 0;
      /* [v201] 「这块还没布管」必须在列表里说清楚 —— 用户原话：「主管跟支管未显示，
         要显示出来」。若只是画布空白，用户无法分辨是「页面坏了」还是「这块本来就没管」；
         补一枚状态标签，一眼就知道该去点「⚡ 生成各块管路」还是等着看结果。 */
      var pipeTag = hasPipe
        ? '<span class="gr-tag">主管 ' + (s.mainPipes || []).length + ' ／ 支管 ' + (s.branchPipes || []).length + '</span>'
        : '<span class="gr-tag no">未布管</span>';
      d.innerHTML =
        '<div class="gr-block-hd"><span>' + esc(b.name) + '</span>' +
        '<span class="gr-block-mu">' + fmt(num(b.mu, 0), 2) + ' 亩</span></div>' +
        '<div class="gr-block-meta">主管 ' + fmt(ml, 1) + ' m ／ 支管 ' + fmt(bl, 1) + ' m ／ ' + pipeTag +
        (b.tlData ? ' ／ <span class="gr-tag">三级已生成</span>' : ' ／ <span class="gr-tag no">三级未生成</span>') + '</div>' +
        '<div class="gr-block-btns">' +
        '<button type="button" class="pp-btn-ghost gr-btn" data-act="tl" data-i="' + i + '">▶ 进入三级页</button>' +
        '<button type="button" class="pp-btn-ghost gr-btn" data-act="l2" data-i="' + i + '">✎ 二级改这块的管</button>' +
        '</div>';
      box.appendChild(d);
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* 材料汇总：各块明细 + 总管 + 合计。
     ★ 只汇总**长度**，不编造价 —— 造价要等各块在三级页算完才有口径，这里不臆造金额。 */
  function grRenderMat() {
    var box = $('grMat'); if (!box) return;
    if (!W.blocks.length) {
      box.innerHTML = '<div class="gr-empty">各块在三级页生成管线图后，这里列出分块明细与合计。</div>';
      return;
    }
    var rows = [], tMain = 0, tBr = 0, tSb = 0;
    W.blocks.forEach(function (b) {
      var s = b.slot || {};
      var ml = sumLen(s.mainPipes), bl = sumLen(s.branchPipes), sl = sumLen(s.subBranchPipes);
      tMain += ml; tBr += bl; tSb += sl;
      rows.push({ name: b.name, mu: num(b.mu, 0), m: ml, b: bl, s: sl });
    });
    var tk = sumLen(W.trunk.lines);
    var h = '<table><thead><tr><th>分项</th><th>亩</th><th>主管 m</th><th>支管 m</th><th>一级管 m</th></tr></thead><tbody>';
    h += '<tr class="gr-grp"><td colspan="5">各块明细（互不串味，各块独立口径）</td></tr>';
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.name) + '</td><td>' + fmt(r.mu, 2) + '</td><td>' + fmt(r.m, 1) + '</td><td>' + fmt(r.b, 1) + '</td><td>' + fmt(r.s, 1) + '</td></tr>';
    });
    h += '<tr class="gr-grp"><td colspan="5">整组总管</td></tr>';
    h += '<tr><td>总管 Ø' + W.trunk.dn + '</td><td>—</td><td>' + fmt(tk, 1) + '</td><td>—</td><td>—</td></tr>';
    h += '<tr class="gr-sum"><td>合计</td><td>' + fmt(rows.reduce(function (a, r) { return a + r.mu; }, 0), 2) + '</td><td>' +
      fmt(tMain + tk, 1) + '</td><td>' + fmt(tBr, 1) + '</td><td>' + fmt(tSb, 1) + '</td></tr>';
    h += '</tbody></table>';
    box.innerHTML = h;
  }

  /* ============== [v231/v233 2026-10-05] 驳接点 / 管径 / 水头损失 ==============
     每块分别算【总管 / 主管 / 支管】三级：分区算主管/支管，块内把各分区驳接点
     串成一条示意「块总管」，块总管的水源端 = 本块驳接点 —— 用户回头用一根大总管
     把各块驳接点连起来（大总管仍在本页手画）。
     ★★ [v233] 管径/流量规则与二级页同一套（v193 铁律：不写第二份算法）——
       v231 自写的 pickDn/hfHW 已删，直接调全局 selectPipe() / hazenWilliams() /
       christiansenF()（RyDesignCore 单一来源）：
       · 主管/块总管：selectPipe(流量, 目标流速, minOd=MAIN_PIPE_MIN_OD)（主管最小 Ø90）；
       · 支管：流量 = 分区流量 ÷ 每区支管根数（#branchGroup，默认 2），
         selectPipe(..., maxOd=BRANCH_PIPE_MAX_OD)（支管最大 Ø160），
         沿程损失 × christiansenF(每根支管的滴头/接头数) —— 与二级页扬程模型同款；
       · 每亩流量 I：优先读二级页算好的 #planIntensity；没算过就按同一组输入现算
         I = 666.67 ÷(带间距×滴头间距)×滴头流量÷1000（v231 兜底读错字段，已修）。
     ★ 分区驳接点 = 该分区主管端点中离块质心较近的那个（主管走向沿用 v229 多数派）。
     ★ 块总管 = 各分区驳接点的最短链路（v243 起=最短哈密顿路径，非旧版最近邻示意链；从最靠质心的那点起链），管径按
       【整块总流量】选；水源点 = 链两端中离块质心较远的外端。
     ★ 整体损失 = 大总管(满载) + max(各块: 块总管损失 + 块内最大分区损失)；跨块大总管 v244 起默认自动连各块红点成最短链路（手画优先，见 grComputeHydraulics）。
     ☆ 仍是估算口径：支管内流量向末端递减只用 christiansenF 折减；块总管与大总管
       未按各分段实际流量分算（满载偏保守）。要细化等用户看完这版再说。 */
  function grNum(id, def) {
    var el = document.getElementById(id);
    var v = el ? parseFloat(el.value) : NaN;
    return isFinite(v) ? v : def;
  }
  function grBranchCount() {
    var el = document.querySelector('#branchGroup .selected');
    var n = el ? parseInt(el.getAttribute('data-n'), 10) : NaN;
    return (isFinite(n) && n > 0) ? n : 2;
  }
  function grId(dn) {   /* 手选总管 dn → 内径(mm)：与 selectPipe 同一 SDR 口径 */
    var k = (typeof SDR !== 'undefined' && SDR > 0) ? (1 - 2 / SDR) : 0.853;
    return dn * k;
  }
  function grIntensity() {
    var tsp = grNum('planTapeSpacing', 0.4), esp = grNum('planEmitterSpacing', 0.3), ef = grNum('planEmitterFlow', 0.8);
    if (tsp > 0 && esp > 0 && ef > 0) return 666.67 / (tsp * esp) * ef / 1000;   // m³/h/亩
    return 0;
  }
  /* 最近邻链：把一组点串成一条示意折线（从最靠 center 的点起，每次接最近的剩余点） */
  /* ============== [v243 2026-10-05] 块总管路由：贪心最近邻 → 真正最短链路 ==============
     旧版(v238 及之前)是「贪心最近邻」：从质心最近点起，每步连最近的剩余点。
     它是**示意链**，点分布不规则时会绕路、总长不是最小。
     现改为【最短哈密顿路径】（一条连续管、走遍所有分区驳接点、总长最小）：
       · 起点仍固定为「离块质心最近的驳接点」——保持旧语义（链头=质心最近端，
         水源点=链远端离质心较远者，下游 srcDef 逻辑不变）；
       · 点数 ≤ 16：Held-Karp 精确 DP，保证全局最短；
       · 点数 > 16：2-opt 局部搜索（欧氏下通常即最优，避免 DP 指数爆炸导致卡顿）。
     返回值仍是「有序点数组」，grChainLines/下游水头损失全部照旧。
     整条块总管总长 = sum(grChainLines(chain))，必然 ≤ 旧版贪心总长。 */
  function grChainPts(pts, center) {
    var n = pts.length;
    if (n === 0) return [];
    if (n === 1) return [pts[0]];
    function d(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
    var si = 0, sd = Infinity;
    for (var i = 0; i < n; i++) { var dd = d(pts[i], center); if (dd < sd) { sd = dd; si = i; } }
    if (n === 2) { var o = (si === 0) ? 1 : 0; return [pts[si], pts[o]]; }
    return (n <= 16) ? grShortestPathDP(pts, si, d) : grShortestPath2opt(pts, si, d);
  }
  /* Held-Karp：最短开放路径，起点固定为 start。dp[mask][i]=起点..i 覆盖 mask 的最小长。 */
  function grShortestPathDP(pts, start, d) {
    var n = pts.length, FULL = (1 << n) - 1, INF = Infinity;
    var dp = [], parent = [];
    for (var m = 0; m <= FULL; m++) { dp[m] = new Array(n).fill(INF); parent[m] = new Array(n).fill(-1); }
    dp[1 << start][start] = 0;
    for (var mask = 0; mask <= FULL; mask++) {
      if (!(mask & (1 << start))) continue;
      for (var i = 0; i < n; i++) {
        if (!(mask & (1 << i))) continue;
        var cur = dp[mask][i];
        if (cur === INF) continue;
        var pm = mask;
        for (var k = 0; k < n; k++) {
          if (pm & (1 << k)) continue;
          var nd = cur + d(pts[i], pts[k]);
          var nm = mask | (1 << k);
          if (nd < dp[nm][k]) { dp[nm][k] = nd; parent[nm][k] = i; }
        }
      }
    }
    var bestI = -1, bestC = INF;
    for (var e = 0; e < n; e++) { if (e === start) continue; if (dp[FULL][e] < bestC) { bestC = dp[FULL][e]; bestI = e; } }
    var path = [], cur = bestI, cm = FULL;
    while (cur !== start) { path.push(cur); var p = parent[cm][cur]; cm ^= (1 << cur); cur = p; }
    path.push(start); path.reverse();
    return path.map(function (idx) { return pts[idx]; });
  }
  /* 2-opt：开放路径局部搜索，起点固定（order[0] 不动，只改其后相邻边）。欧氏下接近全局最优。 */
  function grShortestPath2opt(pts, start, d) {
    var n = pts.length, used = new Array(n).fill(false), order = [start];
    used[start] = true;
    for (var s = 1; s < n; s++) {
      var last = order[order.length - 1], bj = -1, bd = Infinity;
      for (var j = 0; j < n; j++) if (!used[j]) { var dd = d(pts[last], pts[j]); if (dd < bd) { bd = dd; bj = j; } }
      order.push(bj); used[bj] = true;
    }
    var improved = true;
    while (improved) {
      improved = false;
      for (var i = 1; i + 1 < order.length; i++) {
        for (var j = i; j < order.length; j++) {
          var a = order[i - 1], b = order[i], c = order[j], e = order[j + 1];
          var before = d(pts[a], pts[b]) + (j + 1 < order.length ? d(pts[c], pts[e]) : 0);
          var after = d(pts[a], pts[c]) + (j + 1 < order.length ? d(pts[b], pts[e]) : 0);
          if (after + 1e-9 < before) {
            var lo = i, hi = j;
            while (lo < hi) { var t = order[lo]; order[lo] = order[hi]; order[hi] = t; lo++; hi--; }
            improved = true;
          }
        }
      }
    }
    return order.map(function (idx) { return pts[idx]; });
  }
  function grChainLines(chain) {
    var ls = [];
    for (var i = 0; i + 1 < chain.length; i++) ls.push([chain[i], chain[i + 1]]);
    return ls;
  }
  /* ---------------- [v238] 驳接点拖动：几何吸附 ----------------
     用户原话：「各个地块的驳接点的位置要能自由拖动，在管道上自由拖动。」
     ⇒ 拖动时把鼠标点【投影到该点所属管路】上：永远落在管线上，不会飘到田里。
     一条折线上取【最近垂足】（段内夹逼），多条线（如块总管链）取全段最优。 */
  function grProjectOnSeg(p, a, b) {
    var vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
    if (!len2) return { x: a.x, y: a.y };
    var t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return { x: a.x + vx * t, y: a.y + vy * t };
  }
  function grProjectOnLine(p, line) {
    if (!line || line.length < 2) return line && line[0] ? { x: line[0].x, y: line[0].y } : null;
    var best = null, bd = Infinity;
    for (var i = 0; i + 1 < line.length; i++) {
      var q = grProjectOnSeg(p, line[i], line[i + 1]);
      var d = dist(p, q);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function grProjectOnLines(p, lines) {
    var best = null, bd = Infinity;
    (lines || []).forEach(function (l) {
      var q = grProjectOnLine(p, l);
      if (q) { var d = dist(p, q); if (d < bd) { bd = d; best = q; } }
    });
    return best;
  }
  /* ---------------- [v242] 双击地块 ⇒ 进入该块二级编辑（CAD 式） ----------------
     用户原话：「我想点双击地块边线，直接进入地块内部编辑，拖动分区线的位置。
               类似CAD那种，双击进入块编辑，或者是在布局的窗口内双击进入图纸编辑，
               在视口外面 双击就退出了。」
               「我这里双击进入的是二级页面，不是三级页面，更正一下。」
     ⇒ 本页（= 布局/图纸总览）：双击地块 = 进入该块的**二级页逐块编辑**；双击地块【之外】的
       空白 = 适应窗口（v240 取消「⤢ 适应」按钮后唯一的复位入口，不能被这层含义吃掉）。
       ★ 为什么是二级页：用户要「拖动分区线」，而分区线只在二级页可拖 —— 三级页的分区是
         从二级页 getZoneCuts() 读来的只读网格。
       对称的那一半：
         · 二级页里双击地块轮廓外面 = 退回本页（ppExitToGroupPage，在 pp IIFE 里）；
         · 三级页里双击地块轮廓外面 = 退回本页（wsExitBlockEdit，供「▶ 进入三级页」那条路）。
     ★ 命中口径分两级：先按【边线垂距 ≤ 10 屏幕像素】取最近的一块（用户明确说的是
       「边线」），不中才退化为【点落在块内】—— 这样"瞄着边线"和"随手点块里"都能进，
       而块外的空白仍然留给适应窗口。容差按屏幕像素折算（10 / view.scale），
       缩放后手感一致。 */
  function grDistToRing(p, ring) {
    var best = Infinity;
    for (var i = 0; i < ring.length; i++) {
      var d = dist(p, grProjectOnSeg(p, ring[i], ring[(i + 1) % ring.length]));
      if (d < best) best = d;
    }
    return best;
  }
  function grPointInRing(p, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[i], b = ring[j];
      if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function grHitBlockForEnter(wp) {
    if (!W.blocks.length) return -1;
    var tol = 10 / (view.scale || 1), best = -1, bd = tol, i, b;
    for (i = 0; i < W.blocks.length; i++) {
      b = W.blocks[i];
      if (!b.ring || b.ring.length < 3) continue;
      var d = grDistToRing(wp, b.ring);
      if (d <= bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
    for (i = 0; i < W.blocks.length; i++) {
      b = W.blocks[i];
      if (b.ring && b.ring.length >= 3 && grPointInRing(wp, b.ring)) return i;
    }
    return -1;
  }
  /* ---------------- 按块进入二级页（逐块编辑） ----------------
     ★ [v242 更正] 双击地块进的是【二级页】，不是三级页 —— 用户原话：
       「我这里双击进入的是二级页面，不是三级页面，更正一下。」
       落点逻辑也印证了这一点：用户最初那句「直接进入地块内部编辑，**拖动分区线的位置**」——
       分区线（ppState.cutOverrides / 分区网格）**只在二级页可拖**；三级页的分区是从二级页
       RunyeBridge.getZoneCuts() 读来的只读网格，在那边拖分区线是无效操作。
     ★ 与「✎ 二级改这块的管」按钮（data-act="l2"，见 grBind 里的委托）走**同一条路** ——
       原来那四行内联逻辑搬到这里，避免「按钮一条、双击一条」改一处漏一处。
     ★ 标记 window.__runyeGroupPlotEdit 是这条路径的身份证：二级页据此显示「◀ 返回成组管路」，
       并允许「在地块轮廓外面双击」退回。手动切「逐块」不设它 ⇒ 那些行为不会误触发。 */
  function grEnterPlotL2(i) {
    var b = W.blocks[i]; if (!b) return;
    var B = window.RunyeBridge;
    if (B && B.setGroupMode) { try { B.setGroupMode('perPlot'); } catch (e) { } }
    if (B && B.selectGroupPlot) { try { B.selectGroupPlot(i); } catch (e) { } }
    window.__runyeGroupPlotEdit = i;
    try { if (window.ryShowSection) window.ryShowSection($('pipePlanSection'), null); } catch (e) { }
    /* 必须落在「管线编辑」视图：二级简图（view=draw）里没有画布，分区线无从拖起。
       放在 ryShowSection 之后 —— rySetTab 自带「目标未激活则先 ryShowSection」，无需再补。 */
    try { if (typeof rySetTab === 'function') rySetTab('pipePlanSection', 'edit'); } catch (e) { }
    if (B && B.syncGroupEditUI) { try { B.syncGroupEditUI(); } catch (e) { } }
  }
  function grEnterBlockByDbl(bi) {
    if (bi < 0 || !W.blocks[bi]) return;
    grHint2('进入第 ' + (bi + 1) + ' 块「' + W.blocks[bi].name + '」的二级编辑：在那边拖分区线调划分；' +
      '在地块轮廓外面双击即可退回本页。');
    grEnterPlotL2(bi);
  }
  function grComputeHydraulics() {
    W.hyd = null;
    var I = grIntensity(); if (!(I > 0)) return;
    var tv = grNum('planTargetV', 1.5);
    var bc = grBranchCount();
    var tsp = grNum('planTapeSpacing', 0.4), tapeLen = grNum('planTapeLaySide', 100);
    if (!(tsp > 0)) tsp = 0.4;
    if (!(tapeLen > 0)) tapeLen = 100;
    var blocks = [], totalFlow = 0, maxBlkLoss = 0, anyPipe = false;
    W.blocks.forEach(function (b, bi) {
      var cuts = grZonesFor(b);
      if (!cuts || !cuts.zoneCount) return;
      var slot = b.slot || {}, mains = slot.mainPipes || [], brs = slot.branchPipes || [];
      var nz = cuts.zoneCount;
      if ((mains.length + brs.length) > 0) anyPipe = true;
      /* 多数派方向（与 v229 同源）：投票后强制全体分区同一走向 */
      var votesV = 0, r, c;
      for (r = 0; r < cuts.rows; r++) for (c = 0; c < cuts.cols; c++) votesV += (cuts.xPlan[c] >= cuts.yPlan[r]) ? 1 : -1;
      var force = votesV > 0 ? 'v' : (votesV < 0 ? 'h' : null);
      var cx = 0, cy = 0; b.ring.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= b.ring.length; cy /= b.ring.length;
      var zones = [], blkMax = 0, blkFlow = 0;
      for (var z = 0; z < nz; z++) {
        var zr = Math.floor(z / cuts.cols), zc = z % cuts.cols;
        var zx = cuts.xPos[zc], zy = cuts.yPos[zr], zW = cuts.xSrc[zc], zH = cuts.ySrc[zr];
        var B = window.RunyeBridge;
        var cell = B.clipPolyToRect(b.ring, cuts.xPos[zc], cuts.yPos[zr], cuts.xPos[zc + 1], cuts.yPos[zr + 1]);
        var mu = B.polyArea(cell || []) / 666.67;
        if (!(mu > 1e-9)) continue;   // No crop outside the actual block boundary.
        var flow = mu * I;
        var fs = (force === 'v') ? true : (force === 'h') ? false : (cuts.xPlan[zc] >= cuts.yPlan[zr]);
        var mPts;
        if (fs) { var mx = zx + 0.40 * zW; mPts = [{ x: mx, y: zy }, { x: mx, y: zy + zH }]; }
        else { var my = zy + 0.40 * zH; mPts = [{ x: zx, y: my }, { x: zx + zW, y: my }]; }
        var d1 = dist(mPts[0], { x: cx, y: cy }), d2 = dist(mPts[1], { x: cx, y: cy });
        /* [v238] 拖动轨道：优先该分区**真实布的主管**（与图上所见一致），没布管就用合成的 mPts。
           有用户拖过的覆盖值时，把它再投影一次 —— 保证即使分区/管线变了也仍落在管上。 */
        var zLine = (mains.length === nz && mains[z] && mains[z].length >= 2) ? mains[z] : mPts;
        var tpDef = grProjectOnLine(d1 <= d2 ? mPts[0] : mPts[1], zLine);
        var tpOv = (b.tpOver && b.tpOver[z]) ? b.tpOver[z] : null;
        var tp = tpOv ? (grProjectOnLine(tpOv, zLine) || tpDef) : tpDef;
        /* [v233] 与二级页同款选型：主管 minOd=90；支管流量=分区流量÷支管根数、maxOd=160 */
        var mp = selectPipe(Math.max(flow, 0.01), tv, MAIN_PIPE_MIN_OD, Infinity);
        var bFlow = flow / bc;
        var bp = selectPipe(Math.max(bFlow, 0.01), tv, 0, BRANCH_PIPE_MAX_OD);
        var mL = (mains[z] && mains.length === nz && mains[z].length >= 2) ? sumLen([mains[z]]) : (fs ? zH : zW);
        var branchSpan = fs ? zH : zW;
        var branchGap = Math.min(Math.max(branchSpan * 0.06, 4), 14, branchSpan * 0.22);
        var bL = (brs[z] && brs.length === nz && brs[z].length >= 2) ? sumLen([brs[z]]) : branchSpan - 2 * branchGap;
        /* 每根支管带的滴灌带段数 → christiansenF 折减（二级页扬程模型同款） */
        var zoneTapeLen = mu * 666.67 / tsp;
        var tapesPerZone = Math.max(1, Math.ceil(zoneTapeLen / tapeLen));
        var taps = Math.max(1, Math.ceil(tapesPerZone / bc));
        var hm = hazenWilliams(mL, flow, mp.id);
        var hb = hazenWilliams(bL, bFlow, bp.id) * christiansenF(taps);
        var zl = hm + hb;
        if (zl > blkMax) blkMax = zl;
        blkFlow += flow;
        /* v238：把该分区的拖动轨道（= 上面那根主管线）随分区存档 —— 拖动时直接用，
           不再另算一遍（v193 铁律：不写第二份几何算法）。 */
        zones.push({ z: z + 1, mu: mu, flow: flow, mainDn: mp.od, branchDn: bp.od, tp: tp, line: zLine, mL: mL, bL: bL, hm: hm, hb: hb, zl: zl });
      }
      /* [v233/v243] 块总管：各分区驳接点串成最短链路（v243 起=最短哈密顿路径，非旧版最近邻示意链），管径按整块总流量选（minOd 与主管同级）；
         水源点 = 链两端中离块质心较远的外端 —— 用户的大总管接这里（= 本块驳接点）。 */
      var chain = grChainPts(zones.map(function (zz) { return zz.tp; }), { x: cx, y: cy });
      var trunkLen = sumLen(grChainLines(chain));
      var tkP = selectPipe(Math.max(blkFlow, 0.01), tv, MAIN_PIPE_MIN_OD, Infinity);
      var tkLoss = hazenWilliams(trunkLen, blkFlow, tkP.id);
      var srcDef = (chain.length > 1)
        ? (dist(chain[chain.length - 1], { x: cx, y: cy }) > dist(chain[0], { x: cx, y: cy }) ? chain[chain.length - 1] : chain[0])
        : chain[0];
      /* [v238] 块驳接点（红点）拖过的覆盖值：投影到新的块总管链上（链会随分区驳接点变化） */
      var src = b.srcOver ? (grProjectOnLines(b.srcOver, grChainLines(chain)) || srcDef) : srcDef;
      var blkLoss = tkLoss + blkMax;
      if (blkLoss > maxBlkLoss) maxBlkLoss = blkLoss;
      totalFlow += blkFlow;
      /* v238：bi = 该块在 W.blocks 里的下标（hyd 会跳过无分区块，序号不通用），拖动时靠它回写块 */
      blocks.push({ bi: bi, zoneCount: nz, name: b.name, mu: num(b.mu, 0), zones: zones, flow: blkFlow, trunkDn: tkP.od, trunkLen: trunkLen, trunkLoss: tkLoss, chain: chain, src: src, blkLoss: blkLoss });
    });
    /* [v244 2026-10-05] 大总管（跨块）自动最短链路：连各块红点(src)的最短哈密顿路径，
       复用 v233/v243 的 grChainPts（点数=块数→精确 DP）。手画 W.trunk.lines 优先；为空时
       用此自动路由进损失并画到画布（用户仍可在其后手画覆盖/删除，原有手画管线不动）。 */
    var srcPts = blocks.map(function (bk) { return bk.src; })
      .filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
    var acx = 0, acy = 0;
    srcPts.forEach(function (p) { acx += p.x; acy += p.y; });
    if (srcPts.length) { acx /= srcPts.length; acy /= srcPts.length; }
    var trunkAuto = (srcPts.length >= 2) ? grChainPts(srcPts, { x: acx, y: acy }) : srcPts.slice();
    var trunkAutoLen = sumLen(grChainLines(trunkAuto));
    var trunkAutoP = selectPipe(Math.max(totalFlow, 0.01), tv, MAIN_PIPE_MIN_OD, Infinity);
    var handDrawn = !!(W.trunk.lines && W.trunk.lines.length);
    var tk = handDrawn ? sumLen(W.trunk.lines) : trunkAutoLen;
    var trunkLoss = hazenWilliams(tk, totalFlow, handDrawn ? grId(W.trunk.dn) : trunkAutoP.id);
    W.hyd = {
      blocks: blocks, I: I, tv: tv, bc: bc, totalFlow: totalFlow,
      trunkAuto: trunkAuto, trunkAutoLen: trunkAutoLen, trunkAutoDn: trunkAutoP.od,
      trunkLen: tk, trunkLoss: trunkLoss, maxBlkLoss: maxBlkLoss, sysLoss: trunkLoss + maxBlkLoss,
      trunkMode: handDrawn ? '手画' : '自动', trunkDn: handDrawn ? W.trunk.dn : trunkAutoP.od,
      hasPipe: anyPipe
    };
  }
  function grRenderHyd() {
    var box = $('grHyd'); if (!box) return;
    var H = W.hyd;
    if (!H || !H.hasPipe) {
      box.innerHTML = '<div class="gr-empty">请先点「⚡ 生成各块管路」，并确保左侧「每亩流量」已计算。</div>';
      return;
    }
    var h = '<div class="gr-hyd-sum">'
      + '<div><span>系统总水头损失</span><b>' + fmt(H.sysLoss, 2) + '</b> m</div>'
      + '<div><span>大总管损失(' + H.trunkMode + '·满载)</span><b>' + fmt(H.trunkLoss, 2) + '</b> m</div>'
      + '<div><span>控制块损失(块总管+分区)</span><b>' + fmt(H.maxBlkLoss, 2) + '</b> m</div>'
      + '<div><span>总流量</span><b>' + fmt(H.totalFlow, 1) + '</b> m³/h</div></div>';
    /* [v233] 各块总管（示意链）一览：驳接点 = 块总管水源点，用户的大总管接这里 */
    h += '<table class="gr-hyd-tbl"><thead><tr><th>块</th><th>块流量</th><th>总管dn</th><th>总管长</th><th>总管损失</th></tr></thead><tbody>';
    H.blocks.forEach(function (b) {
      h += '<tr><td>' + esc(b.name) + '</td><td>' + fmt(b.flow, 1) + '</td><td>Ø' + b.trunkDn
        + '</td><td>' + fmt(b.trunkLen, 1) + '</td><td>' + fmt(b.trunkLoss, 2) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<table class="gr-hyd-tbl"><thead><tr><th>块</th><th>区</th><th>亩</th><th>流量</th><th>主管dn</th><th>支管dn</th><th>主管长</th><th>支管长</th><th>损失</th></tr></thead><tbody>';
    H.blocks.forEach(function (b) {
      b.zones.forEach(function (z) {
        h += '<tr><td>' + esc(b.name) + '</td><td>' + z.z + '</td><td>' + fmt(z.mu, 2)
          + '</td><td>' + fmt(z.flow, 2) + '</td><td>Ø' + z.mainDn + '</td><td>Ø' + z.branchDn
          + '</td><td>' + fmt(z.mL, 1) + '</td><td>' + fmt(z.bL, 1) + '</td><td>' + fmt(z.zl, 2) + '</td></tr>';
      });
    });
    h += '</tbody></table>';
    box.innerHTML = h;
    if (window.RyTerrain) window.RyTerrain.refresh();
  }
  /* ---------------- [v238] 驳接点拖动：命中 / 拖动 ----------------
     用户原话：「各个地块的驳接点的位置要能自由拖动，在管道上自由拖动。」
     ⇒ 两种驳接点都能拖，且**只沿管走**（鼠标投影到管线上，不会拖到田里）：
       · 分区驳接点（琥珀点 z.tp）—— 沿该分区主管拖，轨道 = hyd 里存档的 zone.line；
       · 块驳接点（红点 b.src，= 大总管接入点）—— 沿该块总管链拖，轨道 = grChainLines(chain)。
     ★ 只改「位置覆盖值」+ 立刻重算；v233 的选型/损失算法一行不动。
     ★ src 先命中：它在链端，常常正好压在某个分区驳接点上，先判它才拖得动。 */
  function grNodeRadius() { return 9 / (view.scale || 1); }
  function grHitNode(wp) {
    var H = W.hyd; if (!H || !H.blocks) return null;
    var r = grNodeRadius(), i, z;
    for (i = 0; i < H.blocks.length; i++) {
      var hb = H.blocks[i];
      if (hb.src && dist(wp, hb.src) <= r) {
        return { kind: 'src', bi: (hb.bi == null ? i : hb.bi), hi: i, zi: -1 };
      }
    }
    for (i = 0; i < H.blocks.length; i++) {
      var hb2 = H.blocks[i];
      for (z = 0; z < hb2.zones.length; z++) {
        if (hb2.zones[z].tp && dist(wp, hb2.zones[z].tp) <= r) {
          return { kind: 'tp', bi: (hb2.bi == null ? i : hb2.bi), hi: i, zi: z };
        }
      }
    }
    return null;
  }
  function grDragTrack(hit) {
    var H = W.hyd; if (!H || !hit) return null;
    var hb = H.blocks[hit.hi]; if (!hb) return null;
    if (hit.kind === 'src') return grChainLines(hb.chain || []);
    var zone = hb.zones[hit.zi];
    return (zone && zone.line && zone.line.length >= 2) ? [zone.line] : null;
  }
  function grDragTo(wp) {
    if (!W.drag) return;
    var b = W.blocks[W.drag.bi]; if (!b) return;
    var lines = grDragTrack(W.drag);
    if (!lines || !lines.length) return;
    var q = grProjectOnLines(wp, lines); if (!q) return;
    if (W.drag.kind === 'src') b.srcOver = q;
    else { b.tpOver = b.tpOver || {}; b.tpOver[W.drag.zi] = q; }
    grComputeHydraulics(); grRenderHyd(); grRender();
  }
  function grClearNodeOverrides() {
    W.blocks.forEach(function (b) { b.tpOver = null; b.srcOver = null; });
    grComputeHydraulics(); grRenderHyd(); grRender();
  }
  function drawTakeoffs() {
    if (!W.hyd) return;
    /* 各分区主管端：小琥珀点 + Ø主径 标签（管径见左侧明细表） */
    W.hyd.blocks.forEach(function (b) {
      b.zones.forEach(function (z) {
        if (!z.tp) return;
        var q = toC(z.tp.x, z.tp.y);
        ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#7c2d12'; ctx.stroke();
        ctx.font = '9px sans-serif'; ctx.fillStyle = '#7c2d12'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText('Ø' + z.mainDn, q.x + 6, q.y - 4);
      });
    });
    /* [v233] 各块总管：示意链（深红虚线）+ 水源点（大红点 = 本块驳接点） */
    W.hyd.blocks.forEach(function (b) {
      if (b.chain && b.chain.length > 1) {
        ctx.setLineDash([6, 4]);
        strokeLines(grChainLines(b.chain), '#b91c1c', 2.5);
        ctx.setLineDash([]);
      }
      if (!b.src) return;
      var q = toC(b.src.x, b.src.y);
      ctx.beginPath(); ctx.arc(q.x, q.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#dc2626'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      /* v238：标签上移 14px（屏幕像素）—— 原来的白底牌正压在红点上，点看不见也抓不准 */
      grLabel('\u00d8' + b.trunkDn + ' 驳接点', { x: b.src.x, y: b.src.y - 14 / (view.scale || 1) }, '#b91c1c');
    });
  }

  /* ============== [v235 2026-10-05] 三级管路数据传导（独立通道） ==============
     用户原话：「成组管路中，点击进入三级管路不是每个地块都单独有总管 主管 跟支管的
       路由嘛……你要把各个地块的主管 支管 总管 数据传导到成组管路页面中。然后对每个
       地块自动生成的管路 通过手动连接总管的方式把所有地块驳接起来。」
     ★★ 与上面 [v233] 驳接点/水头损失那套**刻意隔离**（用户 2026-10-05 拍板：
       「这套东西别删除，留着相关代码，后面我想好了再研究怎么改，但是要跟这段指令
       隔开，各自数据独立，不要互相影响，将来他们两个之间怎么接通，再说」）：
       · 数据源：只读各块 W.blocks[i].tlData（grBackFromTl 存档的三级 tlDiagramData
         快照：frontPipe=块总管折线 / mainPipes / branchPipes / sourcePos=水源点，
         世界坐标与块环同系）—— 本通道**只读，不写**它的任何字段；
       · 显示开关：W.tlShow（独立状态，与 W.hyd 无任何读写关系）；
       · 不调用、不改动 v233 的 grComputeHydraulics / drawTakeoffs / grRenderHyd，
         也不把三级管径/长度喂给水力估算 —— 两套数据将来怎么接通，等用户想好。 */
  function grTlRender() {
    if (!W.tlShow) return;
    W.blocks.forEach(function (b) {
      var d = b.tlData; if (!d) return;
      /* ★ 不裁剪：三级页的块总管本来就走在地块边缘外侧（frontY = minY − max(15, h·4%)），
           裁到环内会把总管整个裁没；tlData 是三级页权威设计几何，原样画。 */
      /* 线序与三级页图例一致：支管(绿) → 主管(蓝) → 块总管(黑，最上) */
      strokeLines(d.branchPipes, 'rgba(22,163,74,.9)', 2);
      strokeLines(d.mainPipes, 'rgba(24,95,165,.95)', 3);
      strokeLines(d.frontPipe ? [d.frontPipe] : [], '#1f2937', 5);
      /* 水源点：黑芯白圈 + 块名 —— 用户手画大总管从各块这个点驳接进去。 */
      if (d.sourcePos) {
        var q = toC(d.sourcePos.x, d.sourcePos.y);
        ctx.beginPath(); ctx.arc(q.x, q.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#111827'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        grLabel((b.name || '地块') + ' 水源', d.sourcePos, '#1f2937');
      }
    });
  }
  function grTlSyncBtn() {
    var btn = $('grTlLayer'); if (btn) btn.classList.toggle('gr-btn-on', !!W.tlShow);
    var leg = $('grTlLeg'); if (leg) leg.style.display = W.tlShow ? '' : 'none';
  }
  function grTlToggle() {
    W.tlShow = !W.tlShow;
    grTlSyncBtn();
    grRender();
    /* ★ 刻意不写工具栏提示条（grHint2）：提示文字变行数 → 画布高度变 → 视图
       重适配跳一帧，且会让「开关前后快照对比」失真。状态反馈 = 按钮点亮/熄灭
       + 图例行显隐 + 图层本身消失，三处已足够直白。 */
  }
  /* 本页工具栏的操作反馈（总管区已有 grHint，别混用两条 —— 否则用户分不清
     这句是「说总管的」还是「说各块管路的」）。用完 6 秒还原默认说明。
     ★ 默认说明随状态变：没布管时告诉用户去点生成按钮，布好之后回到「只读」说明
       —— 静态一句两面不讨好：空画布时它像在搪塞，画满管子时又显得多此一举。 */
  function grDefaultHint() {
    var n = 0;
    W.blocks.forEach(function (b) { if (b.slot) n += (b.slot.mainPipes || []).length; });
    /* ★ [v242] 文案**不许再写长**：本句就是 #grToolbar 里最宽的那个子元素，
       加长十几字（「（逐块，可拖分区线）」）会把「▣ 三级管路」挤到第二行 ——
       v240 的「工具栏不再换行」回归立刻变红（实测 660px 时换行、545px 时单行）。
       「二级编辑里能拖分区线」这条信息放在图例的 title 里说（tooltip 不限长）。 */
    return n
      ? '整组总览：分区线与各块主管/支管为只读，总管在本页手动画；双击某块进入它的二级编辑'
      : '各块还没布管：点「⚡ 生成各块管路」逐块布管，总管在本页手动画；双击某块进入它的二级编辑';
  }
  var grHintT = 0;
  function grHint2(msg) {
    var el = $('grHint'); if (!el) return;
    el.textContent = msg;
    try { clearTimeout(grHintT); } catch (e) { }
    grHintT = setTimeout(function () {
      grHintT = 0;
      var e2 = $('grHint'); if (e2) e2.textContent = grDefaultHint();
    }, 6000);
  }
  function grRefreshUI() {
    grRenderBar(); grRenderTrunk(); grRenderBlocks(); grRenderMat();
    grComputeHydraulics(); grRenderHyd(); grRender();
    var h = $('grHint'); if (h && !grHintT) h.textContent = grDefaultHint();
  }

  /* ---------------- 按块进入三级页 ---------------- */
  function grSaveBlockTl() {
    var b = curBlock(); if (!b) return;
    var values = {};
    document.querySelectorAll('input[id^="tl_"]').forEach(function(el){values[el.id] = el.value;});
    var buttons = {};
    ['tl_branchGroup','tl_layoutGroup'].forEach(function(id){
      var selected = document.querySelector('#' + id + ' .selected');
      buttons[id] = selected ? selected.dataset.n || selected.dataset.sides : null;
    });
    b.tlData = clone(window.tlDiagramData); b.tlAt = new Date().toISOString();
    b.tlState = {values: values, buttons: buttons, groups: clone(window.tlManualGroups || []),
      snapshot: clone(window._tlManualGroupsSnapshot),
      step: clone(window.tlZoneStep), override: clone(tlPipeOdOverride),
      edits: window.RyTlEditPipes ? clone(window.RyTlEditPipes.serialize()) : null,
      auto: window.RyTlAutoEdits ? clone(window.RyTlAutoEdits.serialize()) : null,
      calibers: window.RyTlAutoEdits ? clone(window.RyTlAutoEdits.calibersMap()) : null};
  }
  function grLoadBlockTl(b) {
    var saved = b.tlState;
    if (!W.tlDefaults) {
      W.tlDefaults = {};
      document.querySelectorAll('input[id^="tl_"]').forEach(function(el){W.tlDefaults[el.id] = el.value;});
    }
    window.tlManualGroups = saved ? clone(saved.groups) : [];
    window._tlManualGroupsSnapshot = saved ? clone(saved.snapshot) : null;
    window.tlZoneStep = saved ? clone(saved.step) : null;
    window.tlPendingSel = []; window.tlGroupMode = false;
    tlPipeOdOverride = saved ? clone(saved.override) : null;
    if (saved) {
      Object.keys(saved.values).forEach(function(id){if ($(id)) $(id).value = saved.values[id];});
      Object.keys(saved.buttons).forEach(function(id){
        document.querySelectorAll('#' + id + ' button').forEach(function(el){
          el.classList.toggle('selected', String(el.dataset.n || el.dataset.sides) === String(saved.buttons[id]));
        });
      });
    } else {
      Object.keys(W.tlDefaults).forEach(function(id){if($(id)) $(id).value = W.tlDefaults[id];});
    }
    [window.RyTlEditPipes, window.RyTlAutoEdits].forEach(function(api){if(api){api.reset();api.discardSaved();}});
    window.tlDiagramData = null;   // Do not calculate the next block using the previous block's paths.
  }
  function grRestoreBlockEdits() {
    var b = curBlock(), saved = b && b.tlState, d = window.tlDiagramData;
    if (!saved || !d) return;
    var ep = window.RyTlEditPipes, ae = window.RyTlAutoEdits;
    if (ep) { ep.syncGeometry(d); if(saved.edits) ep.restore(saved.edits, true); }
    if (ae) {
      ae.syncGeometry(d); if(saved.auto) ae.restore(saved.auto, true);
      ae.beginBatch();
      try {Object.keys(saved.calibers || {}).forEach(function(pid){ae.setCaliber(pid, saved.calibers[pid]);});}
      finally {ae.endBatch();}
    }
    tlAutoGenerate({scroll:false});
  }
  function grEnterBlock(i) {
    var b = W.blocks[i]; if (!b || !b.ring || b.ring.length < 3) return;
    grSaveBlockTl();
    grLoadBlockTl(b);
    var B = window.RunyeBridge;
    /* ① 先让二级页切到这一块 —— 三级页的分区网格走 RunyeBridge.getZoneCuts()，
          它内部读二级页的 ppState.polyPts；不切就拿到别的块的分区。 */
    if (B && B.setGroupMode) { try { B.setGroupMode('perPlot'); } catch (e) { } }
    if (B && B.selectGroupPlot) { try { B.selectGroupPlot(i); } catch (e) { } }
    /* ② measuredPolygon 换成这一块的环 —— tlAutoGenerate 把它当**单个地块**用 */
    window.__runyeGroupFrame = clone(W.frame);
    window.measuredPolygon = b.ring.map(function (p) { return { x: p.x, y: p.y }; });
    /* ③ 放行三级页的成组拦截：此刻口径确实就是单地块 */
    window.__runyeTlBlock = i;
    grShowTl();
  }
  function grShowTl() {
    try { if (typeof rySetTab === 'function') rySetTab('tlPipePlanSection', 'ws'); } catch (e) { }
    try { if (window.ryShowSection) window.ryShowSection($('tlPipePlanSection'), null); } catch (e) { }
    try { if (typeof tlAutoGenerate === 'function') { tlAutoGenerate({ scroll: false }); grRestoreBlockEdits(); } } catch (e) { console.warn('Group block L3:', e); }
    grRenderTlBar();
    /* [v242] 落点复核（用户反馈「我这边双击进去的不是三级页面」）：
       「进哪一页」这件事在本工程里不止一处会写 —— 二级页出图那条路自带
       ppShowConstructDiagram() → rySetTab('pipePlanSection',...)（v104 的注释就写着
       「顺序不可颠倒」，那次事故的成因完全一样），而且还有 refit / scrollIntoView
       一类延后执行的动作。所以这里在下一帧与 150ms 后各复核一次：
       只要当前被激活的不是三级页，就再切回来。正常情况这两次都是空操作（幂等、零开销）。 */
    var tlWant = 'tlPipePlanSection';
    function grTlReassert() {
      var act = document.querySelector('main > .ry-sec.ry-active');
      if (window.__runyeTlBlock != null && act && act.id !== tlWant) {
        try { if (typeof rySetTab === 'function') rySetTab(tlWant, 'ws'); } catch (e) { }
        try { if (window.ryShowSection) window.ryShowSection($('tlPipePlanSection'), null); } catch (e) { }
        grRenderTlBar();
      }
    }
    try { if (window.requestAnimationFrame) requestAnimationFrame(grTlReassert); } catch (e) { }
    setTimeout(grTlReassert, 150);
  }
  function grRenderTlBar() {
    var bar = $('grTlBackBar'); if (!bar) return;
    var i = window.__runyeTlBlock;
    if (i == null || !W.blocks[i]) { bar.style.display = 'none'; return; }
    var b = W.blocks[i];
    bar.style.display = 'flex';
    if ($('grTlBlockName')) $('grTlBlockName').textContent = '第 ' + (i + 1) + ' 块：' + b.name;
    if ($('grTlBlockInfo')) {
      $('grTlBlockInfo').textContent = fmt(num(b.mu, 0), 2) + ' 亩 ／ 全组共 ' + W.blocks.length +
        ' 块（本页按单地块口径计算，各块独立）';
    }
  }
  /* 返回：先把本块的三级结果存档，再把整组状态恢复回去 */
  function grBackFromTl() {
    grSaveBlockTl();
    window.__runyeTlBlock = null;
    if (window.__runyeGroupFrame && window.__runyeGroupFrame.length) {
      window.measuredPolygon = clone(window.__runyeGroupFrame);
    }
    try { if (window.ryShowSection) window.ryShowSection($('grPipeSection'), null); } catch (e) { }
    grSync(); grRefreshUI(); grRenderTlBar();
  }
  window.grBackFromTl = grBackFromTl;

  /* ---------------- 从二级页逐块编辑退回本页 ----------------
     与 grBackFromTl 的分工：三级页要**存档该块的三级结果**（tlData），二级页不用 ——
     二级页改的就是 __runyeGroupEdit.slots 本身（切块时 ppCaptureSlot 已存档），
     退回时 grSync() 直接读实时 slot（groupLiveSlot）就拿到最新几何，无需另存一份。
     ★ 返回 false = 没在「从成组页进来的」状态 ⇒ 调用方（ppExitToGroupPage）不要误当作已退出。 */
  function grBackFromPlotEdit() {
    if (window.__runyeGroupPlotEdit == null) return false;
    window.__runyeGroupPlotEdit = null;
    var B = window.RunyeBridge;
    if (B && B.syncGroupEditUI) { try { B.syncGroupEditUI(); } catch (e) { } }
    try { if (window.ryShowSection) window.ryShowSection($('grPipeSection'), null); } catch (e) { }
    grSync(); grRefreshUI(); grRenderTlBar();
    return true;
  }
  window.grBackFromPlotEdit = grBackFromPlotEdit;

  /* ---------------- 事件绑定 ----------------
     ★ [v195] 两个总管交互的辅助（用户反馈「清空跟删除选中都不能弄」的根因在这里）：
       ① 双击收线后 W.mode 仍停在 'draw' ⇒ 用户接下来点图想「选中」，实际还在**加点**
         （截图里那道紫色折线就是反复点击攒出来的 W.draw）⇒ 「删除选中」永远提示「先点选」。
         （二级页收线后停在画线模式是**故意的**——那边要连续画多根管；总管通常只画一根，
           停在画线模式是陷阱，不是便利。）
       ② 「清空」靠 window.confirm ⇒ 在 iframe 未声明 allow-modals / 部分内嵌 WebView /
         无头环境里 confirm 会被**静默吞掉返回 false** ⇒ 点了没反应。
         换成两段式按钮（第一次点变红「⚠ 确认清空？」，3 秒内再点才真清），不依赖原生弹窗。 */
  function grHint(msg) { if ($('grTrunkHint')) $('grTrunkHint').textContent = msg; }
  /* 想删除/清空就不是想画线 —— 先退出画线模式再执行。返回是否真的退出了。 */
  function grExitDraw() {
    if (W.mode !== 'draw') return false;
    W.mode = 'pick'; W.draw = null;
    grRenderTrunk(); grRender();
    return true;
  }
  /* 两段式清空的「解除武装」：超时 / 清完 / 没东西可清 时把按钮还原。
     ★ grClearArm 必须声明在 **IIFE 作用域**（本文件是 'use strict'）——
       若在 grBind() 里 var，grDisarmClear 里对它赋值就是对未声明变量赋值 ⇒ ReferenceError。 */
  var grClearArm = 0;
  function grDisarmClear() {
    grClearArm = 0;
    var btn = $('grTrunkClear');
    if (btn) { btn.textContent = '清空'; btn.classList.remove('gr-btn-arm'); }
  }
  function grBind() {
    /* 管径下拉：接 PE_OD_SERIES（单一来源，见 P10 契约），取不到再兜底 */
    var sel = $('grTrunkDn');
    if (sel) {
      var series = (typeof PE_OD_SERIES !== 'undefined' && PE_OD_SERIES.length)
        ? PE_OD_SERIES : [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 315, 355, 400];
      sel.innerHTML = '';
      series.forEach(function (d) {
        var o = document.createElement('option'); o.value = String(d); o.textContent = 'Ø ' + d + ' mm';
        sel.appendChild(o);
      });
      sel.value = String(W.trunk.dn);
      sel.addEventListener('change', function () { W.trunk.dn = parseInt(this.value, 10) || W.trunk.dn; grRenderTrunk(); grRenderMat(); grComputeHydraulics(); grRenderHyd(); });
    }
    var click = function (id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); };
    /* [v201] 「⚡ 生成各块管路」：把二级页的整个状态机先切到**整组态**，
       再调用二级页那一套 ppAutoGeneratePipes()（内部已按整组态逐块生成、
       逐块写回 ge.slots[i]），最后把二级页恢复回原来的块/模式。
       ★ 为什么必须绕这一圈而不是在本页算：布管规则（0.40 定主管、支管缩进 6%、
         哪边做固定边）全都在二级页 IIFE 里，且要与二级页的分区严格同源 ——
         v193 铁律：不写第二份算法。
       ★ 先切整组态的原因：当时若在「逐块」态，setGroupMode('whole') 会先把
         当前块 ppCaptureSlot() 存盘 ⇒ 用户在二级页刚画的管不会因为本页操作丢掉。 */
    function grKeepMode() {
      var ge = window.__runyeGroupEdit;
      return ge && ge.active ? { mode: ge.mode, current: ge.current } : null;
    }
    /* [v195 教训] 覆盖确认**不能**用 window.confirm —— iframe / 部分 WebView 会静默
       返回 false ⇒ 用户点了「⚡ 生成」却毫无反应（正是用户报过一次的「点了不能弄」）。
       改用与「清空」同款的两段式：已有管时才先变红「⚠ 覆盖已有管路？」，3 秒内再点执行。 */
    var grPipeAutoArm = 0;
    function grDisarmPipeAuto() {
      grPipeAutoArm = 0;
      var b2 = $('grPipeAuto');
      if (b2) { b2.textContent = '⚡ 生成各块管路'; b2.classList.remove('gr-btn-arm'); }
    }
    var grPipeClearArm = 0;
    function grDisarmPipeClear() {
      grPipeClearArm = 0;
      var b3 = $('grPipeClear');
      if (b3) { b3.textContent = '🗑 清除各块管路'; b3.classList.remove('gr-btn-arm'); }
    }
    function grGenerateAllPipes(armed) {
      var B = window.RunyeBridge;
      if (!W.blocks.length) { grHint2('当前不是成组地块。请先在在线地图把两个及以上地块成组后回传。'); return; }
      if (!B || !B.setGroupMode || !B.autoPipesWhole) { grHint2('自动布管接口未就绪，请刷新页面重试。'); return; }
      var had = 0;
      W.blocks.forEach(function (b) {
        if (!b.slot) return;
        had += (b.slot.mainPipes || []).length + (b.slot.branchPipes || []).length + (b.slot.subBranchPipes || []).length;
      });
      if (had && !armed) {
        var btn = $('grPipeAuto');
        var again = (grPipeAutoArm > 0) && (Date.now() - grPipeAutoArm < 3000);
        if (!again) {
          grPipeAutoArm = Date.now();
          if (btn) { btn.textContent = '⚠ 覆盖已有 ' + had + ' 根管？'; btn.classList.add('gr-btn-arm'); }
          grHint2('各块已有管路：3 秒内再点一次即覆盖全部重生成，超时自动取消。');
          setTimeout(grDisarmPipeAuto, 3000);
          return;
        }
      }
      grDisarmPipeAuto();
      var keep = grKeepMode();
      try {
        B.setGroupMode('whole');
        if (!B.autoPipesWhole()) { grHint2('生成失败，请先在二级管路页确认地块边界与分区数。'); return; }
      } finally {
        if (keep && keep.mode === 'perPlot') {
          try { B.setGroupMode('perPlot'); } catch (e) { }
          try { B.selectGroupPlot(keep.current || 0); } catch (e) { }
        }
      }
      grSync(); grFit(); grRefreshUI();
      var has = 0;
      W.blocks.forEach(function (b) { if (b.slot) has += (b.slot.mainPipes || []).length; });
      grHint2(has ? ('已按各块分区生成主管/支管（共 ' + has + ' 根主管），线上数字为管径（Ø）。') : '未生成任何管线，请检查各块边界是否有效。');
    }
    function grClearAllPipes(armed) {
      var B = window.RunyeBridge;
      if (!W.blocks.length) { grHint2('当前不是成组地块。'); return; }
      if (!B || !B.clearPipesWhole) { grHint2('清除接口未就绪，请刷新页面重试。'); return; }
      var n = 0;
      W.blocks.forEach(function (b) {
        if (!b.slot) return;
        n += (b.slot.mainPipes || []).length + (b.slot.branchPipes || []).length + (b.slot.subBranchPipes || []).length;
      });
      if (!n) { grHint2('各块当前没有管线可清除。'); return; }
      /* 与「清空总管」同款的两段式：清管局不可逆，一次误点不能就把整套布管抹了 */
      if (!armed) {
        var btn = $('grPipeClear');
        var again = (grPipeClearArm > 0) && (Date.now() - grPipeClearArm < 3000);
        if (!again) {
          grPipeClearArm = Date.now();
          if (btn) { btn.textContent = '⚠ 确认清除 ' + n + ' 根管？'; btn.classList.add('gr-btn-arm'); }
          grHint2('3 秒内再点一次即清除全组各块管路，超时自动取消。');
          setTimeout(grDisarmPipeClear, 3000);
          return;
        }
      }
      grDisarmPipeClear();
      var keep = grKeepMode();
      try {
        B.setGroupMode('whole');
        B.clearPipesWhole();
      } finally {
        if (keep && keep.mode === 'perPlot') {
          try { B.setGroupMode('perPlot'); } catch (e) { }
          try { B.selectGroupPlot(keep.current || 0); } catch (e) { }
        }
      }
      grSync(); grFit(); grRefreshUI();
      grHint2('已清除全组各块的管路（共 ' + n + ' 根），本页手画的总管不受影响。');
    }
    click('grPipeAuto', function () { grExitDraw(); grGenerateAllPipes(); });
    click('grPipeClear', function () { grExitDraw(); grClearAllPipes(); });
    /* [v235] 三级管路导入层开关（独立通道，见 grTlRender 处注释） */
    click('grTlLayer', function () { grExitDraw(); grTlToggle(); });
    click('grNodeReset', function () { grClearNodeOverrides(); grHint2('已把各块驳接点复位到自动位置。'); });
    grTlSyncBtn();
    click('grTrunkDraw', function () {
      W.mode = (W.mode === 'draw') ? 'pick' : 'draw';
      W.draw = W.draw || [];
      if (W.mode !== 'draw') W.draw = null;
      grRenderTrunk(); grRender();
      grHint(W.mode === 'draw'
        ? '画总管中：点击加点，双击结束（收线后自动退出画线模式），右键退回上一点，Esc 取消。'
        : '总图里点一根总管可选中；画总管时点击加点、双击结束、右键退回上一点。');
    });
    click('grTrunkDel', function () {
      /* ★ 想删除就不是想画线 —— 先退出画线模式，否则用户点图想「选中」、实际还在加点 */
      grExitDraw();
      if (W.sel < 0) { grHint('先在图上点一根总管（点线上任意位置），再点删除。'); return; }
      var n = W.trunk.lines.length;
      W.trunk.lines.splice(W.sel, 1); W.sel = -1;
      grRender(); grRenderTrunk(); grRenderMat();
      grHint('已删除 1 根（剩 ' + (n - 1) + ' 根）。');
    });
    /* [v195] 清空改**两段式确认**：不再依赖 window.confirm ——
       iframe 未声明 allow-modals / 部分内嵌 WebView / 无头环境里 confirm 会被
       静默吞掉返回 false ⇒ 用户点了「清空」什么都没发生（正是本次反馈）。
       做法：第一次点 → 按钮变红「⚠ 确认清空？」；3 秒内再点才真清；超时自动还原。
       （grClearArm 声明在 IIFE 作用域，见 grDisarmClear 上方的注释。） */
    click('grTrunkClear', function () {
      var btn = $('grTrunkClear');
      grExitDraw();
      if (!W.trunk.lines.length) { grHint('当前没有总管可清空。'); grDisarmClear(); return; }
      if (!grClearArm) {
        grClearArm = Date.now();
        if (btn) { btn.textContent = '⚠ 确认清空？'; btn.classList.add('gr-btn-arm'); }
        grHint('再点一次「确认清空」删除全部 ' + W.trunk.lines.length + ' 根总管（3 秒内有效）。');
        setTimeout(grDisarmClear, 3000);
        return;
      }
      var n = W.trunk.lines.length;
      W.trunk.lines = []; W.sel = -1; W.draw = null; grClearArm = 0;
      grDisarmClear();
      grRender(); grRenderTrunk(); grRenderMat();
      grHint('已清空 ' + n + ' 根总管。');
    });
    /* [v240] 「⤢ 适应 / － 缩小 / ＋ 放大」三个按钮按用户指令取消，对应三处 click 接线一并删除
       （缩放改由滚轮、平移改由拖拽 —— 见 cvs 的 wheel / mousedown 处理）。 */
    click('grTlBackBtn', function () { grBackFromTl(); });

    /* 子地块列表：两个入口（三级页 / 二级页）走事件委托 */
    var box = $('grBlocks');
    if (box) box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!b) return;
      var i = parseInt(b.getAttribute('data-i'), 10);
      if (b.getAttribute('data-act') === 'tl') { grEnterBlock(i); return; }
      /* 「二级改这块的管」：切到二级页并停在这一块，让用户在逐块模式下直接改
         [v242] 与「双击地块」共用 grEnterPlotL2（原先这四行内联逻辑就是双击那条路的雏形） */
      grEnterPlotL2(i);
    });

    /* 画布：画总管 / 点选 */
    /* [v232] 拖拽平移状态（用户反馈：能放大缩小但不能拖动）。
       grPanEat：拖动结束 ⇒ 随后到达的那次 click 是平移收尾，吃掉——
       否则挪一下视图还会误选一根总管（pick 态）或误加一个点（draw 态）。
       ★ grPan 声明在 grBind() 作用域即可（只在这里用）；grClearArm 那种要跨函数
         才需要提到 IIFE 作用域，别混。 */
    var grPan = null, grPanEat = false;
    if (cvs) {
      cvs.addEventListener('click', function (e) {
        if (grPanEat) { grPanEat = false; return; }   /* [v232] 刚拖完视图：这次点击是平移收尾，不选线/不加点 */
        if (!W.blocks.length) return;
        var r = cvs.getBoundingClientRect();
        var wp = toW(e.clientX - r.left, e.clientY - r.top);
        if (W.mode === 'draw') { W.draw = W.draw || []; W.draw.push(wp); grRender(); return; }
        W.sel = grPick(wp);
        grRender();
        if ($('grTrunkHint')) $('grTrunkHint').textContent = W.sel >= 0
          ? '已选中第 ' + (W.sel + 1) + ' 根总管（长度 ' + fmt(sumLen([W.trunk.lines[W.sel]]), 1) + ' m），点「删除选中」移除。'
          : '总图里点一根总管可选中；画总管时点击加点、双击结束、右键退回上一点。';
      });
      cvs.addEventListener('dblclick', function (e) {
        if (W.mode !== 'draw' || !W.draw) return;
        e.__runyeTrunkFinished = true;
        var got = W.draw.length >= 2;
        if (got) W.trunk.lines.push(W.draw.slice());
        W.draw = null;
        /* ★ [v195] 收线即退出画线模式：总管通常只画一根，停在画线模式会让用户
             以为「点图 = 选中」，实际还在加点（本轮反馈「删除选中不能用」的根因）。
             二级页停在画线模式是对的（那边要连续画多根管）；总管这边不是。 */
        W.mode = 'pick';
        grRender(); grRenderTrunk(); grRenderMat();
        if ($('grTrunkHint')) $('grTrunkHint').textContent = got
          ? '已收线（共 ' + W.trunk.lines.length + ' 根）。点图可选中一根；再点「✎ 画总管」继续画下一根。'
          : '不足两点未收线。再点「✎ 画总管」重新画。';
      });
      /* [v240] 非画线态双击：先判「有没有双击到地块」——[v242] 命中就进该块二级编辑
         （用户要的 CAD 式「双击视口进入图纸」；用户更正过落点 = 二级页，不是三级页），
         没命中才做适应窗口。
         ★ 顺序不能反：适应窗口是 v240 取消「⤢ 适应」按钮后唯一的复位入口，
           但它排在后面，绝不会抢走「双击地块」这个主用法。 */
      cvs.addEventListener('dblclick', function (e) {
        if (e.__runyeTrunkFinished || W.mode === 'draw') return;      /* 收线不能继续触发块编辑 */
        if (!W.blocks.length) return;
        var r = cvs.getBoundingClientRect();
        var bi = grHitBlockForEnter(toW(e.clientX - r.left, e.clientY - r.top));
        if (bi >= 0) { grEnterBlockByDbl(bi); return; }
        grFit(); grRender();
        grHint2('已适应窗口。双击地块可进入该块的二级编辑（逐块，可拖分区线）；滚轮缩放（以鼠标位置为中心）、按住左键拖动平移。');
      });
      cvs.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (W.mode === 'draw' && W.draw && W.draw.length) { W.draw.pop(); grRender(); }
      });
      /* [v232] 按下 → 准备平移。记录起点与当时的 ox/oy，真正挪不挪看 move 位移过阈值。
         [v238] 按下先判驳接点：命中就进入「拖驳接点」，不再平移（同一手势不干两件事）。 */
      cvs.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || !W.blocks.length) return;
        e.preventDefault();
        var r = cvs.getBoundingClientRect();
        var wp = toW(e.clientX - r.left, e.clientY - r.top);
        if (W.mode !== 'draw') {
          var hit = grHitNode(wp);
          if (hit) {
            W.drag = hit;
            cvs.classList.add('gr-dragging');
            return;
          }
        }
        grPan = { sx: e.clientX - r.left, sy: e.clientY - r.top, ox: view.ox, oy: view.oy, moved: false };
        cvs.classList.add('gr-panning');
      });
      cvs.addEventListener('wheel', function (e) {
        if (!W.blocks.length) return;
        e.preventDefault();
        var r = cvs.getBoundingClientRect();
        var cp = { x: e.clientX - r.left, y: e.clientY - r.top };
        var wp = toW(cp.x, cp.y);
        var k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        view.scale *= k;
        view.ox = cp.x - wp.x * view.scale; view.oy = cp.y - wp.y * view.scale;
        grRender();
      }, { passive: false });
    }
    /* [v232] 拖拽平移（mousemove/mouseup 挂 window：拖出画布也不中断；松手才结束）。
       平移就是改 view.ox/oy —— 与 wheel 缩放同一套坐标参数，grRender 一次即生效。 */
    window.addEventListener('mousemove', function (e) {
      /* [v238] 拖驳接点：优先于平移；沿管吸附 + 实时重算 */
      if (W.drag) {
        if (!cvs) return;
        var rb = cvs.getBoundingClientRect();
        grDragTo(toW(e.clientX - rb.left, e.clientY - rb.top));
        return;
      }
      if (!cvs) return;
      if (!grPan && e.target === cvs) {
        var rh = cvs.getBoundingClientRect();
        var hwp = toW(e.clientX - rh.left, e.clientY - rh.top);
        if (grHitNode(hwp)) { cvs.style.cursor = 'grab'; }
        else {
          /* [v242] 悬停在某块上 ⇒ pointer 光标 + 该块描边高亮，暗示「可双击进入」 */
          var hb = (W.mode === 'draw') ? -1 : grHitBlockForEnter(hwp);
          if (hb !== W.hovBlock) { W.hovBlock = hb; grRender(); }
          cvs.style.cursor = (hb >= 0) ? 'pointer' : '';
        }
      }
      if (!grPan) return;
      var r = cvs.getBoundingClientRect();
      var dx = (e.clientX - r.left) - grPan.sx, dy = (e.clientY - r.top) - grPan.sy;
      if (!grPan.moved && Math.abs(dx) + Math.abs(dy) > 4) grPan.moved = true;   /* 阈值内仍是原样点击 */
      if (grPan.moved) { view.ox = grPan.ox + dx; view.oy = grPan.oy + dy; grRender(); }
    });
    window.addEventListener('mouseup', function () {
      /* [v238] 拖驳接点收尾：吃掉随后的 click（否则会被当成「点图选总管」） */
      if (W.drag) {
        W.drag = null;
        grPanEat = true;
        cvs.classList.remove('gr-dragging');
        setTimeout(function () { grPanEat = false; }, 0);
        return;
      }
      if (!grPan) return;
      grPanEat = grPan.moved;                          /* 拖过 ⇒ 吃掉随后的 click */
      grPan = null;
      cvs.classList.remove('gr-panning');
      if (grPanEat) setTimeout(function () { grPanEat = false; }, 0);   /* click 若没来也别影响下一次 */
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && W.mode === 'draw') { W.draw = null; W.mode = 'pick'; grRenderTrunk(); grRender(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && W.sel >= 0 && $('grPipeSection').classList.contains('ry-active') && document.activeElement === document.body) {
        W.trunk.lines.splice(W.sel, 1); W.sel = -1; grRender(); grRenderTrunk(); grRenderMat();
      }
    });
  }
  /* [v240] grZoom() 随三个缩放按钮一起删除（只被 grZoomIn/grZoomOut 两处 click 调用）；
     ★ grFit()/grFitScale() 保留 —— 刷新、切页、窗口尺寸变化仍会自动适应窗口。 */

  /* ---------------- 对外入口 ----------------
     ★ refresh 与 show 必须分开：ryShowSection 里会回调 grRefreshGroupPage，
       若 show 内部再调自己就成无限递归了（与「detailsSection 回调 window.render」
       同一处机制，那边也是只回调刷新、不回调切换）。 */
  window.grRefreshGroupPage = function () {
    grSync(); grFit(); grRefreshUI(); grRenderTlBar();
  };
  window.grShowGroupPage = function () {
    try { if (window.ryShowSection) window.ryShowSection($('grPipeSection'), null); } catch (e) { }
    window.grRefreshGroupPage();
  };
  window.grEnterTlForBlock = grEnterBlock;
  window.grExportState = function () {
    var ge = window.__runyeGroupEdit;
    if (!ge || !ge.active || !window.__runyeSubPlots || window.__runyeSubPlots.length < 2) return null;
    grSaveBlockTl(); grSync();
    var edit = clone(ge), live = window.RunyeBridge.groupLiveSlot();
    if (live) edit.slots[ge.current] = live;
    var blocks = clone(W.blocks);
    blocks.forEach(function(b){if(b.tlState){b.tlState.calibers=null;b.tlState.override=null;}});
    return {version:1, subPlots:clone(window.__runyeSubPlots), frame:clone(W.frame), edit:edit,
      blocks:blocks, defaults:clone(W.tlDefaults), trunk:clone(W.trunk)};
  };
  window.grRestoreState = function (saved) {
    if (!saved) { window.__runyeGroupEdit=null; window.__runyeSubPlots=null; grSync(); grRefreshUI(); return false; }
    function ringOK(r){return Array.isArray(r) && r.length>=3 && r.every(function(p){return p && Number.isFinite(p.x) && Number.isFinite(p.y);});}
    if (saved.version!==1 || !ringOK(saved.frame) || !Array.isArray(saved.subPlots) || saved.subPlots.length<2 ||
      !saved.subPlots.every(function(s){return s && ringOK(s.poly);}) || !saved.edit ||
      !Array.isArray(saved.edit.slots) || saved.edit.slots.length!==saved.subPlots.length) return false;
    window.__runyeSubPlots=clone(saved.subPlots); window.measuredPolygon=clone(saved.frame);
    var edit=clone(saved.edit), mode=edit.mode, current=edit.current;
    edit.active=true; edit.mode='whole'; edit.current=Math.max(0,Math.min(edit.slots.length-1,Math.floor(num(current,0))));
    edit.trunkPipes=clone(saved.trunk && saved.trunk.lines || []); edit.trunkDn=num(saved.trunk && saved.trunk.dn,110);
    window.__runyeGroupEdit=edit; window.__runyeTlBlock=null; window.__runyeGroupPlotEdit=null;
    window.RunyeBridge.setGroupMode('perPlot');
    if(mode!=='perPlot') window.RunyeBridge.setGroupMode('whole');
    W.groupRef=edit; W.groupKey=JSON.stringify(saved.subPlots.map(function(s){return s.id || s.name;}));
    W.blocks=clone(saved.blocks || []); W.tlDefaults=clone(saved.defaults);
    grSync(); grFit(); grRefreshUI(); return true;
  };
  /* [v242] 「按块进二级页」也开一个外部入口 —— 与 grEnterTlForBlock 同样理由：
     跨 IIFE / 冒烟脚本要能直接触发这条路径，不必去模拟一次真实双击（取点受浮层遮挡影响）。 */
  window.grEnterPlotL2 = grEnterPlotL2;
  /* 主区切换 / 窗口尺寸变化时，若本页正显示就重排一次（隐藏期间量到的宽高是 0） */
  window.addEventListener('resize', function () {
    var sec = $('grPipeSection');
    if (sec && sec.classList.contains('ry-active')) { grResize(); grFitScale(); grRender(); }
  });
  grBind();
})();
