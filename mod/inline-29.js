
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

   ★ 本页只做**组级**的事。块级的重活（自动布管 / 管径 / 水力 / 系统图）
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
  var W = { blocks: [], trunk: { lines: [], dn: 110 }, dnOver: { main: null, branch: null }, frame: null, sel: -1, draw: null, mode: 'pick', drag: null, hovBlock: -1 };
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
    var memberIds = subs.map(function (s) { return String(s && s.id || ''); });
    var canonicalGroupId = 'legacy-group:' + JSON.stringify(memberIds);
    var canonicalRead = !!(W.canonicalDesign);
    var canonicalAdapter = window.RyDrawingDesignGroupAdapter;
    var projectionError = null;
    W.blocks = subs.map(function (s, i) {
      var prev = old.filter(function(b){return s.id != null ? b.id === s.id : b.name === (s.name || ('子地块' + (i + 1)));})[0] || {};
      var slot = null;
      if (i === liveIdx) slot = live;
      else if (canonicalRead) {
        if (W.canonicalGroupId !== canonicalGroupId || !memberIds[i] || !canonicalAdapter ||
          typeof canonicalAdapter.toLegacyMemberSlot !== 'function') {
          projectionError = { error: 'canonical-member-projection-binding-mismatch', index: i };
        } else {
          var projected = canonicalAdapter.toLegacyMemberSlot(W.canonicalDesign, canonicalGroupId, memberIds[i],
            ge && ge.slots && ge.slots[i] || {});
          if (!projected || !projected.ok) projectionError = {
            error: projected && projected.error || 'canonical-member-projection-failed', index: i
          };
          else slot = projected.slot;
        }
      } else slot = (ge && ge.slots && ge.slots[i]) ? clone(ge.slots[i]) : null;
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
    if (projectionError) {
      W.blocks = []; W.frame = null;
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'group-read', error: projectionError.error, index: projectionError.index };
      return false;
    }
    /* v193 的总管存在 __runyeGroupEdit.trunkPipes；v194 起归本页管，旧数据一次性迁过来 */
    if (ge && Array.isArray(ge.trunkPipes)) W.trunk.lines = ge.trunkPipes;
    /* [v654] ★ ge.trunkDn → W.trunk.dn / sel.value 的反写已删除（修撤销系统捕获快照踩踏）：
       runye-undo 在 change **捕获阶段**同步 runyeSaveProject → grExportState → grSync，
       此时用户刚选的新管径还在下拉框里、change 处理器尚未读走 ⇒ grSync 用滞后的
       ge.trunkDn（上一次 grRenderTrunk 的镜像）把 W.trunk.dn 和 sel.value 弹回旧值 ⇒
       **大总管管径下拉从来改不动**（用户截图 Ø110 流速超标改不掉的元凶）。
       恢复路径的落值改由 grRestoreState 显式完成（见下）；平时 ge.trunkDn 只是
       grRenderTrunk 维护的镜像，与 W 恒等，去掉反写无副作用。 */
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
  /* [v652b] 画布标签防重叠三件套：量宽 / 画白底牌（返回占位盒）/ 盒相交判定。
     原先只有 grLabel 一个函数、位置写死；琥珀 Ø 主径标签是裸 fillText
     （字直接叠在管线上），驳接点白底牌固定上移 14px 不讲余地 —— 块驳接点
     常与某分区驳接点重合（链端=该分区主管端），牌子正好盖住对方的 Ø 标签，
     用户截图两处箭头即此。现：先画的标签登记占位盒，后画的在候选位里
     挑第一个不相交的。 */
  function grLabelW(text) { ctx.font = '10px sans-serif'; return ctx.measureText(text).width + 6; }
  function grLabelDraw(text, cx, cy, color) {
    var w = grLabelW(text);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(cx - w / 2, cy - 7, w, 14);
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    return { x: cx - w / 2, y: cy - 7, w: w, h: 14 };
  }
  function grHits(boxes, b) {
    for (var i = 0; i < boxes.length; i++) {
      var o = boxes[i];
      if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) return true;
    }
    return false;
  }
  /* 旧接口保留（三级导入层管径标签 / 水源标签仍在用）：世界坐标 → 白底牌居中画 */
  function grLabel(text, wp, color) {
    if (!wp) return;
    var q = toC(wp.x, wp.y);
    grLabelDraw(text, q.x, q.y, color);
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
    return B.zoneCutsFor(bb, planN, b.slot && b.slot.cutSnap, b.slot && b.slot.cutOverrides,
      b.slot && isFinite(Number(b.slot.zoneAngleDeg)) ? Number(b.slot.zoneAngleDeg) : (b.slot && b.slot.zoneRotated ? 90 : 0),b.ring);
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
      var B=window.RunyeBridge,localRing=B.polyToGrid(cuts,b.ring);
      cuts.xPos.forEach(function (x) {
        var ends=B.polyToWorld(cuts,[{x:x,y:cuts.yPos[0]},{x:x,y:cuts.yPos[cuts.yPos.length - 1]}]);
        var p1 = toC(ends[0].x,ends[0].y), p2 = toC(ends[1].x,ends[1].y);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      });
      cuts.yPos.forEach(function (y) {
        var ends=B.polyToWorld(cuts,[{x:cuts.xPos[0],y:y},{x:cuts.xPos[cuts.xPos.length - 1],y:y}]);
        var p1 = toC(ends[0].x,ends[0].y), p2 = toC(ends[1].x,ends[1].y);
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
            ? XB.clipPolyToRect(localRing, cuts.xPos[zc], cuts.yPos[zr], cuts.xPos[zc + 1], cuts.yPos[zr + 1])
            : null;
          var mu = (cell && XB.polyArea ? XB.polyArea(cell) : 0) / 666.67;
          var stdMu = (cuts.xPlan[zc] || 0) * (cuts.yPlan[zr] || 0) / 666.67;
          if (stdMu > 0 && mu < stdMu * 0.97 && mu > 0.05) {
            var cs = [
              { x: cuts.xPos[zc], y: cuts.yPos[zr] },
              { x: cuts.xPos[zc + 1], y: cuts.yPos[zr] },
              { x: cuts.xPos[zc + 1], y: cuts.yPos[zr + 1] },
              { x: cuts.xPos[zc], y: cuts.yPos[zr + 1] }
            ];
            ctx.strokeStyle = 'rgba(217,119,6,.9)';
            ctx.beginPath();
            cs.forEach(function (w, ci) {
              var world=XB.cutToWorld(cuts,w.x,w.y),q = toC(world.x, world.y);
              ci ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
            });
            ctx.closePath();
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    });
    /* [v236] 各块尺寸标注（建筑制图风，同三级页样式）：底边总宽 + 右侧总高
       [v658] 受「标注显示」勾选框控制（隐藏范围=尺寸标注线+尺寸文字） */
    if (!grLabelsOff) grRenderBlockDims();
    /* 各块已布的管线：只读（块级的编辑一律回二级页逐块模式 / 三级页，不在本页改）
       [v671 用户要求] 管线画法对齐三级页：补画 45°斜向连接管 + 阀门红⊗ + 主管上
       的三通小方块（见 grRenderFittings）；本页仍不画总管，其余与三级页一致。 */
    W.blocks.forEach(function (b) {
      var s = b.slot || {};
      strokeLines(s.mainPipes, 'rgba(24,95,165,.85)', 3);
      strokeLines(s.branchPipes, 'rgba(22,163,74,.85)', 2);
      strokeLines(s.subBranchPipes, 'rgba(24,95,165,.55)', 1.6);
      if (s.source) {
        var q = toC(s.source.x, s.source.y);
        ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(q.x, q.y, 6, 0, Math.PI * 2); ctx.fill();
      }
      grRenderFittings(s.mainPipes, s.branchPipes, s.valves);
    });
    /* [v198] 主管/支管尺寸标注：画完所有线再统一标（标注层在最上，不被线压住）。
       [v237] 用户原话：「60跟52是管道长度吗？这里不用显示管道长度，显示管道直径。」
       ⇒ 线上数字由管长改为【管径】：主管标 Ø该分区主管径、支管标 Ø该分区支管径，
          数据直接读 v233 grComputeHydraulics 的 W.hyd（zones[i].mainDn/branchDn），
          不写第二份选型算法（v193 铁律）。
       · hyd 块与 W.blocks 同序生成但会跳过无分区的块 ⇒ 用同一跳过条件做双指针对齐；
       · 仅当「该块管线条数 = 分区数」时按序号取径（与 v233 的 mains[z]↔zones[z] 同一假设），
         对不上或 hyd 未算时【不标】，绝不回退成管长（用户明确不要管长）。
       [v658] 整段受「标注显示」勾选框控制（隐藏范围=管径白底牌）。
       [v669b] 管径白底牌改由 grDnLabelsOff 单独控制（用户要求主管/支管管径要显示），
       不再跟随「标注」总开关。 */
    if (!grDnLabelsOff) {
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
    } /* end [v658] if(!grLabelsOff) 管径白底牌段 */
    /* [v678 用户拍板] 「▣ 三级管路」导入层随页面瘦身移除（grTlRender/grTlToggle/grTlSyncBtn 删除）；
       各块三级结果存档（tlData）数据层仍保留在 grSync/grExportState，恢复显示只需重接渲染调用。 */
    /* 总管：本页唯一可编辑的图层 */
    (W.trunk.lines || []).forEach(function (l, i) {
      strokeLines([l], (i === W.sel) ? '#f59e0b' : '#7c3aed', (i === W.sel) ? 7 : 5);
    });
    /* [v655] 自动总管不再画上画布（用户：总管按实际情况手绘；v196 同一诉求，v244 的
       自动链撤掉）。无手画时总管位留白；「参考线」按钮打开时才临时画幽灵虚线
       （仅视觉参考，不参与水力、不出材料）。 */
    if (!(W.trunk.lines && W.trunk.lines.length) && trunkGhost && W.hyd && W.hyd.trunkAuto && W.hyd.trunkAuto.length >= 2) {
      ctx.save();
      ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath();
      W.hyd.trunkAuto.forEach(function (p, i) { var q = toC(p.x, p.y); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.stroke();
      ctx.restore();
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

  /* ============== [v671 2026-10-23 用户要求] 三通方块 / 45°斜向连接管 / 阀门 ==============
     用户原话：「主管的三通小方块 三通，主管跟支管连接的斜向的管都没有，这个要改过来，
       按照三级页面那个方式绘制管道，多地块规划比三级页面只是不显示总管，其他都按照三级页面来。」
     数据源：slot.mainPipes / slot.branchPipes / slot.valves（⚡生成各块管路写回，
       plot-editor.js ppBuildAutoPipes，与三级页 tlAutoGenerate 同一套公式）。
     · 阀心 = valves[z] 的 (x,y)（=支管中点）；缺失时按支管首尾中点现算。
     · 斜向连接管：主管上的 45° 锚点 → 阀心。锚点按三级页同款公式现算
       （对照 inline-09.js:3833-3860 生成式 与 4479-4511 tlValveConnPt 补算式）：
         竖主管：ax = 主管x，ay = 阀心y − |阀心x − 主管x|，钳位到主管段范围；
         横主管：ay = 主管y，ax = 阀心x − |阀心y − 主管y|，钳位到主管段范围。
       valves[z] 自带 ax/ay（tlData 快照里的三级阀门）时直接用，不重算。
     · 三通小方块：中心 = 主管上的锚点，9×9 #0C447C 白描边 1.5（三级页 4529-4533 同款）。
     · 阀门符号：window.ryValveCanvas（RY_VALVE 单一来源，红⊗ r6.5，与二级/三级同规格）。
     层序照三级页：主管→支管→斜管→阀门→三通方块（方块最后画，白框不被线压）。
     坐标：世界米 → toC 转屏幕；方块/阀门固定像素尺寸，不随缩放（与管径白底牌同口径）。 */
  function grRenderFittings(mains, branches, valves) {
    if (!mains || !mains.length || !branches || !branches.length) return;
    var n = Math.min(mains.length, branches.length);
    for (var i = 0; i < n; i++) {
      var mp = mains[i], bp = branches[i];
      if (!mp || mp.length < 2 || !bp || bp.length < 2) continue;
      var v = (valves && valves[i]) || null;
      if (!v || v.x == null) {
        v = { x: (bp[0].x + bp[bp.length - 1].x) / 2, y: (bp[0].y + bp[bp.length - 1].y) / 2 };
      }
      var vert = Math.abs(mp[0].x - mp[mp.length - 1].x) < 1e-6;
      var ax = v.ax, ay = v.ay;
      if (ax == null || ay == null) {
        if (vert) {
          ax = mp[0].x;
          ay = v.y - Math.abs(v.x - ax);
          var yLo = Math.min(mp[0].y, mp[mp.length - 1].y), yHi = Math.max(mp[0].y, mp[mp.length - 1].y);
          if (ay < yLo) ay = yLo; if (ay > yHi) ay = yHi;
        } else {
          ay = mp[0].y;
          ax = v.x - Math.abs(v.y - ay);
          var xLo = Math.min(mp[0].x, mp[mp.length - 1].x), xHi = Math.max(mp[0].x, mp[mp.length - 1].x);
          if (ax < xLo) ax = xLo; if (ax > xHi) ax = xHi;
        }
      }
      var a = toC(ax, ay), vp = toC(v.x, v.y);
      /* 斜向连接管（三级页 4518 行同规格：#185FA5，透明度 0.92） */
      ctx.strokeStyle = '#185FA5'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(vp.x, vp.y); ctx.stroke();
      ctx.globalAlpha = 1;
      /* 阀门红⊗ */
      if (window.ryValveCanvas) window.ryValveCanvas(ctx, vp.x, vp.y);
      /* 主管上的三通小方块 */
      ctx.fillStyle = '#0C447C';
      ctx.fillRect(a.x - 4.5, a.y - 4.5, 9, 9);
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff';
      ctx.strokeRect(a.x - 4.5, a.y - 4.5, 9, 9);
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
     [v844] 本页手画入口也已移除（见 grBind 里的 grTrunkDraw 注释）：
     总管统一在在线地图页画（plot.trunk v2 是唯一权威），本页只渲染/删除存量。 */

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
    grComputeHydraulics();   /* [v678] 只喂 DN 管径牌 / 总管流速体检 / 参考线；水力面板已随页面瘦身移除 */
    var len = sumLen(W.trunk.lines), n = (W.trunk.lines || []).length;
    if ($('grTrunkLen')) $('grTrunkLen').textContent = fmt(len, 1);
    if ($('grTrunkN')) $('grTrunkN').textContent = String(n);
    if ($('grTrunkMat')) $('grTrunkMat').textContent = 'Ø' + W.trunk.dn + ' mm PE';
    /* [v844] 「✎ 画总管」按钮已删，active 同步一并移除。 */
    grUpdateTrunkVel();   /* [v654] 管径下拉/一键建议档改后，流速行同步刷新 */
  }
  /* [v654] 大总管流速体检行：有水力结果且总流量>0 才显示；超出经济区间给「一键建议档」。
     用 .gr-row/.gr-label/.gr-val/.gr-btn 共享皮肤档（v652 拍平纪律），色档 .gr-vel-* 在 style-01。 */
  function grUpdateTrunkVel() {
    var row = $('grTrunkVelRow'), val = $('grTrunkVel'), fix = $('grTrunkVelFix');
    if (!row || !val || !fix) return;
    var H = W.hyd;
    if (!H || !H.hasPipe || !(H.trunkVel > 0)) { row.style.display = 'none'; return; }
    row.style.display = '';
    val.textContent = fmt(H.trunkVel, 1);
    val.classList.toggle('gr-vel-ok', H.trunkVelState === 'ok');
    val.classList.toggle('gr-vel-warn', H.trunkVelState !== 'ok');
    if (H.trunkVelState !== 'ok' && H.trunkVelSugOd > 0) {
      fix.style.display = '';
      fix.dataset.od = String(H.trunkVelSugOd);
      fix.textContent = '建议 Ø' + H.trunkVelSugOd;
      fix.title = '满载流速 ' + fmt(H.trunkVel, 1) + ' m/s 超出经济区间 0.8~2.0 m/s，一键切到建议档';
    } else { fix.style.display = 'none'; fix.dataset.od = ''; }
  }
  function grRenderBlocks() {
    var box = $('grBlocks'); if (!box) return;
    if (!W.blocks.length) {
      box.innerHTML = '<div class="gr-empty">当前不是成组地块。请先在在线地图把两个及以上地块成组后回传。</div>';
      return;
    }
    box.innerHTML = '';
    W.blocks.forEach(function (b) {
      var s = b.slot || {};
      var ml = sumLen(s.mainPipes), bl = sumLen(s.branchPipes);
      var d = document.createElement('div');
      d.className = 'gr-block';
      var hasPipe = ((s.mainPipes || []).length + (s.branchPipes || []).length + (s.subBranchPipes || []).length) > 0;
      /* [v201] 「这块还没布管」必须在列表里说清楚 —— 用户原话：「主管跟支管未显示，
         要显示出来」。若只是画布空白，用户无法分辨是「页面坏了」还是「这块本来就没管」。 */
      var pipeTag = hasPipe
        ? '<span class="gr-tag">主管 ' + (s.mainPipes || []).length + ' ／ 支管 ' + (s.branchPipes || []).length + '</span>'
        : '<span class="gr-tag no">未布管</span>';
      /* [v678] 只读展示：不再有「▶ 进入三级页 / ✎ 二级改这块的管」按钮与「三级已生成」标签 */
      d.innerHTML =
        '<div class="gr-block-hd"><span>' + esc(b.name) + '</span>' +
        '<span class="gr-block-mu">' + fmt(num(b.mu, 0), 2) + ' 亩</span></div>' +
        '<div class="gr-block-meta">主管 ' + fmt(ml, 1) + ' m ／ 支管 ' + fmt(bl, 1) + ' m ／ ' + pipeTag + '</div>';
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
    var handTrunk = !!(W.trunk.lines && W.trunk.lines.length);
    var h = '<table><thead><tr><th>分项</th><th>亩</th><th>主管 m</th><th>支管 m</th><th>一级管 m</th></tr></thead><tbody>';
    /* [v666 用户拍板] 「各块明细（互不串味，各块独立口径）」组行取消 —— 明细行紧跟表头即可，
       语义已由行内容自明；「整组总管」组行保留（它隔开的是「不出料」的总管段，有信息量）。 */
    rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.name) + '</td><td>' + fmt(r.mu, 2) + '</td><td>' + fmt(r.m, 1) + '</td><td>' + fmt(r.b, 1) + '</td><td>' + fmt(r.s, 1) + '</td></tr>';
    });
    h += '<tr class="gr-grp"><td colspan="5">整组总管</td></tr>';
    /* [v655] 总管改纯手绘口径：没手绘走向就不出料（自动链长度是猜的，出料不诚实） */
    if (handTrunk) {
      h += '<tr><td>总管 Ø' + W.trunk.dn + '</td><td>—</td><td>' + fmt(tk, 1) + '</td><td>—</td><td>—</td></tr>';
    } else {
      /* [v666] colspan 整行提示：第一列定宽 80px 后，五列版会在窄列里折成四行——
         它本来就是整行消息而非五列数据，colspan 后恒单行、不占列宽（fixed 布局下列宽由表头行决定）。 */
      h += '<tr><td class="gr-vel-warn" colspan="5">总管未手绘（不出料，画好后自动计入）</td></tr>';
    }
    h += '<tr class="gr-sum"><td>合计</td><td>' + fmt(rows.reduce(function (a, r) { return a + r.mu; }, 0), 2) + '</td><td>' +
      fmt(tMain + (handTrunk ? tk : 0), 1) + '</td><td>' + fmt(tBr, 1) + '</td><td>' + fmt(tSb, 1) + '</td></tr>';
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
       · 支管：流量 = 分区流量 ÷ 物理并联支管总数（每侧根数 × 敷设边数），
         selectPipe(..., maxOd=BRANCH_PIPE_MAX_OD)（支管最大 Ø160），
         沿程损失 × christiansenF(每根支管的滴头/接头数) —— 与二级页扬程模型同款；
       · 每亩流量 I：优先读二级页算好的 #planIntensity；没算过就按同一组输入现算
         I = 666.67 ÷(带间距×滴头间距)×滴头流量÷1000（v231 兜底读错字段，已修）。
     ★ 分区驳接点 = 该分区主管端点中离块质心较近的那个（管线走向沿用首分区定向）。
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
  function grLayoutSides() {
    var el = document.querySelector('#tl_layoutGroup .selected') || document.querySelector('#layoutGroup .selected');
    var n = el && el.dataset ? parseInt(el.dataset.sides, 10) : NaN;
    return n === 2 ? 2 : 1;
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
  /* [v678 用户拍板] 「双击地块进入二级编辑」整链路删除（grDistToRing / grPointInRing /
     grHitBlockForEnter / grEnterPlotL2 / grEnterBlockByDbl，连同块列表按钮与外部导出）——
     页面瘦身后本页纯展示，逐块编辑回到二级页自身的成组控件。双击空白 = 适应窗口保留。 */
  function grComputeHydraulics() {
    W.hyd = null;
    var I = grIntensity(); if (!(I > 0)) return;
    var tv = grNum('planTargetV', 1.5);
    var bc = grBranchCount();
    var layoutSides = grLayoutSides();
    var branchParallelCount = bc * layoutSides;
    var tsp = grNum('planTapeSpacing', 0.4), tapeLen = grNum('planTapeLaySide', 100);
    if (!(tsp > 0)) tsp = 0.4;
    if (!(tapeLen > 0)) tapeLen = 100;
    /* 主管/支管按全组最大分区流量选取固定档位。当前组页只保留展示、总管绘制和材料清单，
       旧版 dnOver 快照字段仍保留读写兼容，但不能再覆盖当前自动选档结果。 */
    var baseMainFlow = 0, baseBranchFlow = 0;
    W.blocks.forEach(function (b) {
      var cuts0 = grZonesFor(b);
      if (!cuts0 || !cuts0.zoneCount) return;
      for (var z0 = 0; z0 < cuts0.zoneCount; z0++) {
        var zr0 = Math.floor(z0 / cuts0.cols), zc0 = z0 % cuts0.cols;
        var localRing0=window.RunyeBridge.polyToGrid(cuts0,b.ring);
        var cell0 = window.RunyeBridge.clipPolyToRect(localRing0, cuts0.xPos[zc0], cuts0.yPos[zr0], cuts0.xPos[zc0 + 1], cuts0.yPos[zr0 + 1]);
        var mu0 = window.RunyeBridge.polyArea(cell0 || []) / 666.67;
        if (!(mu0 > 1e-9)) continue;
        var f0 = mu0 * I;
        if (f0 > baseMainFlow) baseMainFlow = f0;
        var bf0 = f0 / branchParallelCount;
        if (bf0 > baseBranchFlow) baseBranchFlow = bf0;
      }
    });
    var constMp = selectPipe(Math.max(baseMainFlow, 0.01), tv, MAIN_PIPE_MIN_OD, Infinity);
    var constBp = selectPipe(Math.max(baseBranchFlow, 0.01), tv, 0, BRANCH_PIPE_MAX_OD);
    var ovMainOd = constMp.od, ovBranchOd = constBp.od;
    var ovMainId = constMp.id, ovBranchId = constBp.id;
    /* 组内统一取首个有效成员的第1分区长边；所有成员跟随该轴，不受全组多数票影响。 */
    var groupTapeAxis = null;
    for (var ga = 0; ga < W.blocks.length && !groupTapeAxis; ga++) {
      var firstCuts = grZonesFor(W.blocks[ga]);
      if (!firstCuts || !firstCuts.zoneCount) continue;
      var firstAxis = window.RyZoneGeometry && window.RyZoneGeometry.tapeAxisOf
        ? window.RyZoneGeometry.tapeAxisOf(firstCuts, grNum('planZoneFixedSide', 200)) : null;
      var firstW = Number(firstCuts.xSrc && firstCuts.xSrc[0]) || Number(firstCuts.xPlan && firstCuts.xPlan[0]) || 0;
      var firstH = Number(firstCuts.ySrc && firstCuts.ySrc[0]) || Number(firstCuts.yPlan && firstCuts.yPlan[0]) || 0;
      groupTapeAxis = firstAxis && firstAxis.ok ? firstAxis.tapeAxis : (firstW >= firstH ? 'x' : 'y');
    }
    var groupMainDirection = groupTapeAxis === 'x' ? 'v' : 'h';
    var blocks = [], totalFlow = 0, maxBlkLoss = 0, anyPipe = false;
    W.blocks.forEach(function (b, bi) {
      var cuts = grZonesFor(b);
      if (!cuts || !cuts.zoneCount) return;
      var slot = b.slot || {}, mains = slot.mainPipes || [], brs = slot.branchPipes || [];
      var nz = cuts.zoneCount;
      if ((mains.length + brs.length) > 0) anyPipe = true;
      var force = groupTapeAxis ? groupMainDirection : null;
      var cx = 0, cy = 0; b.ring.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= b.ring.length; cy /= b.ring.length;
      var zones = [], blkMax = 0, blkFlow = 0;
      for (var z = 0; z < nz; z++) {
        var zr = Math.floor(z / cuts.cols), zc = z % cuts.cols;
        var zx = cuts.xPos[zc], zy = cuts.yPos[zr], zW = cuts.xSrc[zc], zH = cuts.ySrc[zr];
        var B = window.RunyeBridge;
        var localRing=B.polyToGrid(cuts,b.ring);
        var cell = B.clipPolyToRect(localRing, cuts.xPos[zc], cuts.yPos[zr], cuts.xPos[zc + 1], cuts.yPos[zr + 1]);
        var mu = B.polyArea(cell || []) / 666.67;
        if (!(mu > 1e-9)) continue;   // No crop outside the actual block boundary.
        var flow = mu * I;
        var fs = (force === 'v') ? true : (force === 'h') ? false : (cuts.xSrc[zc] >= cuts.ySrc[zr]);
        var mPts;
        if (fs) { var mx = zx + 0.40 * zW; mPts = [{ x: mx, y: zy }, { x: mx, y: zy + zH }]; }
        else { var my = zy + 0.40 * zH; mPts = [{ x: zx, y: my }, { x: zx + zW, y: my }]; }
        mPts=B.polyToWorld(cuts,mPts);
        var d1 = dist(mPts[0], { x: cx, y: cy }), d2 = dist(mPts[1], { x: cx, y: cy });
        /* [v238] 拖动轨道：优先该分区**真实布的主管**（与图上所见一致），没布管就用合成的 mPts。
           有用户拖过的覆盖值时，把它再投影一次 —— 保证即使分区/管线变了也仍落在管上。 */
        var zLine = (mains.length === nz && mains[z] && mains[z].length >= 2) ? mains[z] : mPts;
        var tpDef = grProjectOnLine(d1 <= d2 ? mPts[0] : mPts[1], zLine);
        var tpOv = (b.tpOver && b.tpOver[z]) ? b.tpOver[z] : null;
        var tp = tpOv ? (grProjectOnLine(tpOv, zLine) || tpDef) : tpDef;
      /* [v233] 与二级页同款选型口径；主管/支管共用全组最大分区流量选出的自动档。 */
        var mp = { od: ovMainOd, id: ovMainId };
        var bFlow = flow / branchParallelCount;
        var bp = { od: ovBranchOd, id: ovBranchId };
        var mL = (mains[z] && mains.length === nz && mains[z].length >= 2) ? sumLen([mains[z]]) : (fs ? zH : zW);
        var branchSpan = fs ? zH : zW;
        var branchGap = Math.min(Math.max(branchSpan * 0.06, 4), 14, branchSpan * 0.22);
        var bL = (brs[z] && brs.length === nz && brs[z].length >= 2) ? sumLen([brs[z]]) : branchSpan - 2 * branchGap;
        /* 每根支管带的滴灌带段数 → christiansenF 折减（二级页扬程模型同款） */
        var zoneTapeLen = mu * 666.67 / tsp;
        var tapesPerZone = Math.max(1, Math.ceil(zoneTapeLen / tapeLen));
        var taps = Math.max(1, Math.ceil(tapesPerZone / branchParallelCount));
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
    /* [v655] 总管改纯手绘口径：没手画就不算总管损失、不算流速、不出料 ——
       trunkAuto 只保留几何给「参考线」幽灵虚线（视觉参考，不进任何数字）。
       trunkAutoDn（按满载流量推算的建议档）仍在汇总提示里给用户参考。 */
    var tk = handDrawn ? sumLen(W.trunk.lines) : 0;
    var trunkLoss = handDrawn ? hazenWilliams(tk, totalFlow, grId(W.trunk.dn)) : 0;
    /* [v654 2026-10-21 用户拍板「大总管流速体检」] 手选档位（手画模式）按满载流量算实际流速：
       内径走 grId（与 selectPipe 同一 SDR 口径），超出经济区间给建议档（单源 selectPipe）。
       常量按本页惯例带 typeof 兜底（inline-09 顶层 const 跨脚本可见，但防加载顺序意外）。 */
    var vMin = (typeof ECON_VMIN !== 'undefined') ? ECON_VMIN : 0.8;
    var vMax = (typeof ECON_VMAX !== 'undefined') ? ECON_VMAX : 2.0;
    var trunkVel = 0, trunkVelState = 'none', trunkVelSugOd = 0;
    if (handDrawn && totalFlow > 0) {
      var velId = grId(W.trunk.dn);
      trunkVel = totalFlow / 3600 / (Math.PI * Math.pow(velId / 2000, 2));
      trunkVelState = trunkVel > vMax ? 'high' : (trunkVel < vMin ? 'low' : 'ok');
      if (trunkVelState !== 'ok') {
        trunkVelSugOd = selectPipe(Math.max(totalFlow, 0.01), tv, MAIN_PIPE_MIN_OD, Infinity).od;
      }
    }
    W.hyd = {
      blocks: blocks, I: I, tv: tv, bc: bc, layoutSides: layoutSides,
      branchParallelCount: branchParallelCount, totalFlow: totalFlow,
      /* [v668] 恒定档设计值（供手动调档 select 的 ±3 档中心）与覆盖生效标志 */
      constMainOd: constMp.od, constBranchOd: constBp.od,
      dnOverridden: false,
      trunkAuto: trunkAuto, trunkAutoLen: trunkAutoLen, trunkAutoDn: trunkAutoP.od,
      trunkLen: tk, trunkLoss: trunkLoss, maxBlkLoss: maxBlkLoss,
      sysLoss: handDrawn ? (trunkLoss + maxBlkLoss) : maxBlkLoss,
      trunkMode: handDrawn ? '手画' : '未手绘', trunkDn: handDrawn ? W.trunk.dn : 0,
      trunkVel: trunkVel, trunkVelState: trunkVelState, trunkVelSugOd: trunkVelSugOd,
      hasPipe: anyPipe
    };
  }
  /* [v678 用户拍板「只保留 展示 + 画总管 + 材料清单」] grRenderHyd / grRefreshCalSels /
     grBindCalSels（水力面板：驳接点/管径覆盖/水头损失表 + 主管支管手动调档 select）整段删除。
     grComputeHydraulics 保留 —— 它是画布 DN 管径牌、总管流速体检行、「参考线」幽灵的数据源；
     W.dnOver 仅保留旧存档读写兼容；组页无调档入口，当前计算始终使用自动选档。 */
  /* [v678 用户拍板] grNodeRadius / grHitNode / grDragTrack / grDragTo / grClearNodeOverrides
     （驳接点拖动交互）整段删除 —— 驳接点 v669/v672 起已不显示、不参与命中，
     水力面板与「↺ 驳接点复位」也随本次瘦身移除，交互链路已无消费方。
     drawTakeoffs 保留（grTakeoffsOff 门控，代码可恢复）。 */
  function drawTakeoffs() {
    if (!W.hyd) return;
    var boxes = [];   /* [v652b] 已放标签的屏幕占位盒，后来的标签避让 */
    /* 各分区主管端：小琥珀点 + Ø主径 标签（管径见左侧明细表）
       [v652b] 标签改白底小牌：原裸 fillText 的管径字直接叠在管线上；
       位置不变（点右上），并登记占位盒供驳接点牌避让。
       [v672 用户要求] 分区驳接点先取消显示（grTakeoffsOff），代码保留可恢复。 */
    if (!grTakeoffsOff) W.hyd.blocks.forEach(function (b) {
      b.zones.forEach(function (z) {
        if (!z.tp) return;
        var q = toC(z.tp.x, z.tp.y);
        ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#7c2d12'; ctx.stroke();
        var txt = 'Ø' + z.mainDn;
        var w = grLabelW(txt);
        boxes.push(grLabelDraw(txt, q.x + 6 + w / 2, q.y - 9, '#7c2d12'));
      });
    });
    /* [v233] 各块总管：示意链（深红虚线）+ 水源点（大红点 = 本块驳接点）
       [v658 用户拍板方案A] 深红示意链并入「标注显示」勾选框——取消勾选时一起藏
       （它不进材料表、只是水力试算示意，图面留给真实管线）；红点驳接点是
       功能点，永远显示。
       [v669 用户要求] 红色驳接点相关整体取消：红链 / 红点 / 「Ø… 驳接点」红字牌
       全部不再画（grRedNodesOff 恒为 true），本段只保留代码不再执行。 */
    W.hyd.blocks.forEach(function (b) {
      if (grRedNodesOff) return;
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
      /* [v238] 原来固定上移 14px——白底牌不再正压红点，但块驳接点常与分区
         驳接点重合，牌子会盖住对方的 Ø 主径标签（v652b 用户截图两处箭头）。
         [v652b] 改四候选位 上→下→右→左，挑第一个不与已放标签相交的；
         全占时退回上方（v238 原位兜底）。 */
      var txt = 'Ø' + b.trunkDn + ' 驳接点';
      var hw = grLabelW(txt) / 2;
      var cands = [
        { x: q.x, y: q.y - 16 },
        { x: q.x, y: q.y + 16 },
        { x: q.x + hw + 12, y: q.y },
        { x: q.x - hw - 12, y: q.y }
      ];
      var pick = cands[0];
      for (var ci = 0; ci < cands.length; ci++) {
        var box = { x: cands[ci].x - hw - 1, y: cands[ci].y - 8, w: hw * 2 + 2, h: 16 };
        if (!grHits(boxes, box)) { pick = cands[ci]; break; }
      }
      boxes.push(grLabelDraw(txt, pick.x, pick.y, '#b91c1c'));
    });
  }

  /* [v678 用户拍板] 三级管路导入层（grTlRender / grTlSyncBtn / grTlToggle）删除 ——
     页面瘦身后只保留 展示 + 画总管 + 材料清单，本层整体退场。
     tlData/tlState 数据层仍在 grSync / grExportState / grBackFromTl 保留（旧存档兼容）。 */
  /* 本页工具栏的操作反馈（总管区已有 grHint，别混用两条 —— 否则用户分不清
     这句是「说总管的」还是「说各块管路的」）。用完 6 秒还原默认说明。 */
  function grDefaultHint() {
    /* [v678] 瘦身后只有一句话：展示只读、总管手画。不再提「生成按钮 / 双击进编辑」。
       [v844] 手画入口移除：这句话要跟 index.html 的 #grHint 初始文案保持同义。 */
    return '整组总览：各块分区线与管线为只读展示；总管在「在线地图」页绘制（本页不再手画），旧总管仍可选中删除并计入材料汇总';
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
    grComputeHydraulics(); grRender();   /* [v678] 水力面板已移除，grRenderHyd 不再调用 */
    var h = $('grHint'); if (h && !grHintT) h.textContent = grDefaultHint();
  }

  /* ---------------- 三级页按块链路（v678 瘦身） ----------------
     入口（块列表按钮 / 双击地块 / grEnterTlForBlock、grEnterPlotL2 外部导出）已随瘦身移除；
     保留 grSaveBlockTl（grExportState 存档要用）、grRenderTlBar / grBackFromTl
     （tl-workspace 返回按钮仍会调用，bar 无入口时恒隐藏）。 */
  function grSaveBlockTl() {
    var b = curBlock(); if (!b) return;
    var values = {};
    document.querySelectorAll('input[id^="tl_"]').forEach(function(el){values[el.id] = el.value;});
    var buttons = {};
    ['tl_branchGroup','tl_layoutGroup'].forEach(function(id){
      var selected = document.querySelector('#' + id + ' .selected');
      buttons[id] = selected ? selected.dataset.n || selected.dataset.sides : null;
    });
    var priorState = b.tlState && typeof b.tlState === 'object' && !Array.isArray(b.tlState)
      ? clone(b.tlState) : {};
    var nodeState = window.RyTlNodes && window.RyTlNodes._internals &&
      typeof window.RyTlNodes._internals.serialize === 'function'
      ? clone(window.RyTlNodes._internals.serialize()) : priorState.nodes;
    b.tlData = clone(window.tlDiagramData); b.tlAt = new Date().toISOString();
    b.tlState = Object.assign(priorState, {values: values, buttons: buttons, groups: clone(window.tlManualGroups || []),
      snapshot: clone(window._tlManualGroupsSnapshot),
      step: clone(window.tlZoneStep), override: clone(tlPipeOdOverride),
      edits: window.RyTlEditPipes ? clone(window.RyTlEditPipes.serialize()) : null,
      auto: window.RyTlAutoEdits ? clone(window.RyTlAutoEdits.serialize()) : null,
      nodes: nodeState == null ? null : nodeState,
      calibers: window.RyTlAutoEdits ? clone(window.RyTlAutoEdits.calibersMap()) : null});
  }
  /* [v678 用户拍板] grEnterBlock / grShowTl（含 grLoadBlockTl / grRestoreBlockEdits）删除 ——
     「▶ 进入三级页」入口已随瘦身移除，本页不再承担逐块三级设计的中转。 */
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
  var trunkGhost = false;   /* [v655] 参考线开关：临时显示系统建议走向幽灵虚线（默认关） */
  /* [v658] 组页「标注显示」开关（参考三级页 #tlWsLabelsChk 同款）：
     false=显示，true=隐藏 v236 各块尺寸标注线+文字 与 v198/v237 管径白底牌。
     驳接点（琥珀/红点）与红链是功能图层，不受此开关影响。
     状态持久化 localStorage['gr-labels-off']（'0'=明确显示），切页/刷新后保持。
     [v667 用户拍板] 默认改为【隐藏】——「标注现在没啥用，后面需要」：
     只有历史上明确勾过「显示」（存了 '0'）才显示，其余（含从未操作过）一律隐藏。
     勾选框保留，后面需要时勾上即恢复。 */
  /* [v669b 2026-10-23 用户要求] 主管/支管管径白底牌要显示——从「标注」总开关里拆出来
     单独控制：尺寸标注（grRenderBlockDims）仍隐藏，管径牌（v198/v237）恒显示。 */
  var grDnLabelsOff = false;
  /* [v669 用户要求] 标注整体取消——grLabelsOff 恒为 true，不再读 localStorage['gr-labels-off']
     （用户此前勾过「显示」存的 '0' 也一律忽略）。隐藏范围不变：v236 各块尺寸标注线+文字、
     v198/v237 管径白底牌。渲染代码全部保留，后面需要时把这个开关改回 false 即可整体恢复。 */
  var grLabelsOff = true;
  /* [v669 用户要求] 红色驳接点相关整体取消显示：深红块总管虚线链（#b91c1c）、
     大红点（#dc2626 = 块驳接点/水源点）、「Ø… 驳接点」红字牌都不再画到图面。
     ★ 只是**不画**——grComputeHydraulics 照常算、水力面板照常显示、拖动覆盖值照常存；
       红点也不再参与命中拖动（见 grHitNode）。代码保留，后面需要时改回 false 恢复。 */
  var grRedNodesOff = true;
  /* [v672 2026-10-23 用户要求] 分区驳接点（小琥珀点 + Ø主径 白底牌）也先取消显示，
     将来需要再改回 false 恢复。数据层完全不动——tp / 拖动覆盖值 / 水力链路
     （最短哈密顿路径、水头损失）照常计算，只是不画、也不参与鼠标命中（见 grHitNode）。 */
  var grTakeoffsOff = true;
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
      sel.addEventListener('change', function () {
        var dn = parseInt(this.value, 10) || W.trunk.dn;
        if (!grCommitTrunk(function (trunk) { trunk.dn = dn; })) {
          this.value = String(W.trunk.dn);
          grHint('总管管径未写入：规范组状态无法安全提交。');
          return;
        }
        grRenderTrunk(); grRenderMat();
      });
    }
    /* [v655] 参考线开关：临时显示系统建议走向的幽灵虚线（不参与计算、不出材料） */
    var ghostBtn = $('grTrunkGhost');
    if (ghostBtn) ghostBtn.addEventListener('click', function () {
      trunkGhost = !trunkGhost;
      this.classList.toggle('active', trunkGhost);
      grRender();
    });
    /* [v658] 组页「标注显示」勾选框：勾=显示标注（尺寸标注+管径牌），取消=隐藏。
       与三级页同一交互（文字恒为「标注显示」，状态走 localStorage）。 */
    var lblChk = $('grLabelsChk');
    if (lblChk) {
      lblChk.checked = !grLabelsOff;
      lblChk.addEventListener('change', function () {
        grLabelsOff = !this.checked;
        try { localStorage.setItem('gr-labels-off', grLabelsOff ? '1' : '0'); } catch (eGrLbl2) { }
        grRender();
      });
    }
    /* [v654] 流速体检「一键建议档」：切到手选建议外径 → 同步下拉显示 → 走 grRenderTrunk
       全链（内含 grComputeHydraulics + grUpdateTrunkVel），告警自然消掉。 */
    var velFix = $('grTrunkVelFix');
    if (velFix) velFix.addEventListener('click', function () {
      var od = parseInt(this.dataset.od, 10);
      if (!(od > 0)) return;
      if (!grCommitTrunk(function (trunk) { trunk.dn = od; })) {
        grHint('建议管径未写入：规范组状态无法安全提交。');
        return;
      }
      var sel2 = $('grTrunkDn'); if (sel2) sel2.value = String(od);
      grRenderTrunk(); grRenderMat();
    });
    var click = function (id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); };
    /* [v677 用户拍板] 「⚡ 生成各块管路」移除 —— 新方向：所有地块都先在二级页
       单地块完成划分与布管，最后才拼成一组（成组时继承各块已有设计）。
       [v678 用户拍板] 页面进一步瘦身：只保留 展示 + 画总管 + 材料清单 ——
       「🗑 清除各块管路」（grPipeClear/grClearAllPipes/grKeepMode）、「▤ 水力面板」、
       「↺ 驳接点复位」、「▣ 三级管路」四组绑定全部移除。各块管线改错了
       回二级页单地块改（成组继承会带过来），本页只画总管。
       [v844 用户拍板] 「✎ 画总管」入口移除：总管只在在线地图页画（plot.trunk v2
       是唯一权威，否则三套总管永远说不清谁算数）。按钮 DOM 与本绑定一起删。
       ★ 画线状态机（W.mode/W.draw、双击收线、右键回退、Esc）**保留不动**：
         W.mode 恒为 'pick' ⇒ 这些分支不可达，但存量总管的点选/删除仍走它们；
         将来若要恢复入口，加回按钮与绑定即可，不用重写状态机。 */
    click('grTrunkDel', function () {
      /* ★ 想删除就不是想画线 —— 先退出画线模式，否则用户点图想「选中」、实际还在加点 */
      grExitDraw();
      if (W.sel < 0) { grHint('先在图上点一根总管（点线上任意位置），再点删除。'); return; }
      var n = W.trunk.lines.length, selected = W.sel;
      if (!grCommitTrunk(function (trunk) { trunk.pipes.splice(selected, 1); })) {
        grHint('总管未删除：规范组状态无法安全提交。');
        return;
      }
      W.sel = -1;
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
      if (!grCommitTrunk(function (trunk) { trunk.pipes = []; })) {
        grHint('总管未清空：规范组状态无法安全提交。');
        return;
      }
      W.sel = -1; W.draw = null; grClearArm = 0;
      grDisarmClear();
      grRender(); grRenderTrunk(); grRenderMat();
      grHint('已清空 ' + n + ' 根总管。');
    });
    /* [v240] 「⤢ 适应 / － 缩小 / ＋ 放大」三个按钮按用户指令取消，对应三处 click 接线一并删除
       （缩放改由滚轮、平移改由拖拽 —— 见 cvs 的 wheel / mousedown 处理）。 */
    click('grTlBackBtn', function () { grBackFromTl(); });

    /* [v678] 子地块列表按钮委托（▶ 进入三级页 / ✎ 二级改这块的管）已随瘦身移除 ——
       列表改为纯只读展示（名称/亩数/管长/未布管状态），无任何跳转入口。 */

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
          ? '已选中第 ' + (W.sel + 1) + ' 根总管（长度 ' + fmt(sumLen([W.trunk.lines[W.sel]]), 1) + ' m），点「删除选中」或按 Delete 移除。'
          : '总管在「在线地图」页绘制（本页不再手画）；点一根旧总管仍可选中删除。';
      });
      cvs.addEventListener('dblclick', function (e) {
        if (W.mode !== 'draw' || !W.draw) return;
        e.__runyeTrunkFinished = true;
        var got = W.draw.length >= 2, completedLine = W.draw.slice();
        if (got && !grCommitTrunk(function (trunk) { trunk.pipes.push(completedLine); })) {
          grHint('总管未收线：规范组状态无法安全提交，当前草稿已保留。');
          return;
        }
        W.draw = null;
        /* ★ [v195] 收线即退出画线模式：总管通常只画一根，停在画线模式会让用户
             以为「点图 = 选中」，实际还在加点（本轮反馈「删除选中不能用」的根因）。
             二级页停在画线模式是对的（那边要连续画多根管）；总管这边不是。 */
        W.mode = 'pick';
        grRender(); grRenderTrunk(); grRenderMat();
        if ($('grTrunkHint')) $('grTrunkHint').textContent = got
          ? '已收线（共 ' + W.trunk.lines.length + ' 根）。点图可选中一根。'
          : '不足两点未收线。';
      });
      /* [v678] 非画线态双击 = 适应窗口（v240 取消「⤢ 适应」按钮后唯一的复位入口）。
         「双击地块进入二级编辑」已随瘦身移除，这里不再做块命中。 */
      cvs.addEventListener('dblclick', function (e) {
        if (e.__runyeTrunkFinished || W.mode === 'draw') return;      /* 收线不能继续触发适应 */
        if (!W.blocks.length) return;
        grFit(); grRender();
        grHint2('已适应窗口。滚轮缩放（以鼠标位置为中心）、按住左键拖动平移。');
      });
      cvs.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (W.mode === 'draw' && W.draw && W.draw.length) { W.draw.pop(); grRender(); }
      });
      /* [v232] 按下 → 准备平移。记录起点与当时的 ox/oy，真正挪不挪看 move 位移过阈值。
         [v678] 驳接点命中拖动已随瘦身移除，按下只做平移准备。 */
      cvs.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || !W.blocks.length) return;
        e.preventDefault();
        var r = cvs.getBoundingClientRect();
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
       平移就是改 view.ox/oy —— 与 wheel 缩放同一套坐标参数，grRender 一次即生效。
       [v678] 驳接点拖动分支与「悬停块高亮暗示可进编辑」分支已随瘦身移除。 */
    window.addEventListener('mousemove', function (e) {
      if (!cvs) return;
      if (!grPan) return;
      var r = cvs.getBoundingClientRect();
      var dx = (e.clientX - r.left) - grPan.sx, dy = (e.clientY - r.top) - grPan.sy;
      if (!grPan.moved && Math.abs(dx) + Math.abs(dy) > 4) grPan.moved = true;   /* 阈值内仍是原样点击 */
      if (grPan.moved) { view.ox = grPan.ox + dx; view.oy = grPan.oy + dy; grRender(); }
    });
    window.addEventListener('mouseup', function () {
      if (!grPan) return;
      grPanEat = grPan.moved;                          /* 拖过 ⇒ 吃掉随后的 click */
      grPan = null;
      cvs.classList.remove('gr-panning');
      if (grPanEat) setTimeout(function () { grPanEat = false; }, 0);   /* click 若没来也别影响下一次 */
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && W.mode === 'draw') { W.draw = null; W.mode = 'pick'; grRenderTrunk(); grRender(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && W.sel >= 0 && $('grPipeSection').classList.contains('ry-active') && document.activeElement === document.body) {
        var selected = W.sel;
        if (!grCommitTrunk(function (trunk) { trunk.pipes.splice(selected, 1); })) {
          grHint('总管未删除：规范组状态无法安全提交。');
          return;
        }
        W.sel = -1; grRender(); grRenderTrunk(); grRenderMat();
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
  function grObserveDrawingDesignSnapshot(snapshot, stage, roundTrip) {
    try {
      var adapter = window.RyDrawingDesignGroupAdapter;
      var memberIds = snapshot && Array.isArray(snapshot.subPlots)
        ? snapshot.subPlots.map(function (plot) { return String(plot && plot.id || ''); }) : [];
      if (!adapter || typeof adapter.fromGroupSnapshot !== 'function' || memberIds.length < 2 ||
          !memberIds.every(function (id) { return !!id; })) {
        window.__runyeDrawingDesignShadow = { ok: false, stage: stage, error: 'group-shadow-identity-unavailable' };
        return;
      }
      var groupKey = JSON.stringify(memberIds), groupId = 'legacy-group:' + groupKey;
      var shadow = adapter.fromGroupSnapshot(snapshot, {
        projectId: 'legacy-group-project:' + groupKey,
        groupId: groupId,
        frameId: 'legacy-frame:' + groupKey
      });
      if (!shadow || !shadow.ok) {
        window.__runyeDrawingDesignShadow = {
          ok: false, stage: stage, error: shadow && shadow.error || 'group-shadow-unavailable'
        };
        return;
      }
      var result = { ok: true, stage: stage, plotCount: shadow.design.plots.length, groupCount: shadow.design.groups.length };
      if (roundTrip) {
        var exported = adapter.toLegacyPatch(shadow.design, groupId, snapshot);
        result.roundTripOk = !!(exported && exported.ok);
        if (!result.roundTripOk) result.roundTripError = exported && exported.error || 'group-shadow-round-trip-unavailable';
      }
      window.__runyeDrawingDesignShadow = result;
    } catch (shadowError) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: stage, error: 'group-shadow-conversion-error' };
    }
  }
  function grCanonicalComparable(design) {
    var value = clone(design);
    if (!value) return null;
    delete value.revision;
    (value.plots || []).forEach(function (plot) {
      delete plot.revision;
      if (plot.generated) plot.generated.sourceRevision = 0;
    });
    (value.groups || []).forEach(function (group) { delete group.revision; });
    return JSON.stringify(value);
  }
  function grCanonicalComparableExceptPlotLevel3(design, plotIds) {
    var value = clone(design);
    if (!value) return null;
    var ignored = Object.create(null);
    (Array.isArray(plotIds) ? plotIds : [plotIds]).forEach(function (id) { ignored[id] = true; });
    delete value.revision;
    (value.plots || []).forEach(function (plot) {
      delete plot.revision;
      if (ignored[plot.plotId]) {
        delete plot.generated;
        if (plot.network) delete plot.network.level3Edits;
      } else if (plot.generated) {
        /* sourceRevision is binding metadata, like plot.revision. Legacy group import
           reconstructs it from the imported plot revision, so compare content after
           normalizing both sides instead of dropping a valid canonical history. */
        plot.generated.sourceRevision = 0;
      }
    });
    (value.groups || []).forEach(function (group) { delete group.revision; });
    return JSON.stringify(value);
  }
  function grPlotDesignComparable(plot) {
    var value = clone(plot);
    if (!value) return null;
    delete value.revision;
    delete value.generated;
    if (value.network) delete value.network.level3Edits;
    return JSON.stringify(value);
  }
  /* Group trunk writes now commit through the canonical group revision first. The legacy
     snapshot remains the compatibility projection used by existing save/undo consumers. */
  function grCommitTrunk(operation) {
    var model = window.RyDrawingDesignModel, adapter = window.RyDrawingDesignGroupAdapter;
    var ge = window.__runyeGroupEdit;
    if (!model || !adapter || !ge || W.groupRef !== ge || !window.grExportState) return false;
    var memberIds = (window.__runyeSubPlots || []).map(function (plot) { return String(plot && plot.id || ''); });
    if (memberIds.length < 2 || !memberIds.every(function (id) { return !!id; })) return false;
    var memberKey = JSON.stringify(memberIds), groupId = 'legacy-group:' + memberKey;
    var snapshot = window.grExportState();
    if (!snapshot) return false;
    var imported = adapter.fromGroupSnapshot(snapshot, {
      projectId: 'legacy-group-project:' + memberKey,
      groupId: groupId,
      frameId: 'legacy-frame:' + memberKey
    });
    if (!imported || !imported.ok) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'group-write', error: imported && imported.error || 'group-import-failed' };
      return false;
    }
    var base = imported.design;
    if (W.canonicalGroupId === groupId && W.canonicalDesign &&
        grCanonicalComparable(W.canonicalDesign) === grCanonicalComparable(imported.design)) {
      base = W.canonicalDesign;
    }
    var group = base.groups.filter(function (item) { return item.groupId === groupId; })[0];
    if (!group) return false;
    var next = model.updateGroup(base, groupId, base.revision, function (target) {
      operation(target.trunkNetwork);
    });
    if (!next || !next.ok) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'group-write', error: next && next.error || 'group-update-failed' };
      return false;
    }
    var projected = adapter.toLegacyPatch(next.design, groupId, snapshot);
    if (!projected || !projected.ok || !projected.snapshot || !projected.snapshot.trunk) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'group-write', error: projected && projected.error || 'group-projection-failed' };
      return false;
    }
    W.canonicalDesign = next.design;
    W.canonicalGroupId = groupId;
    W.trunk = clone(projected.snapshot.trunk);
    ge.trunkPipes = clone(W.trunk.lines);
    ge.trunkDn = W.trunk.dn;
    window.__runyeDrawingDesignShadow = {
      ok: true, stage: 'group-write', groupId: groupId,
      designRevision: next.design.revision,
      groupRevision: next.design.groups.filter(function (item) { return item.groupId === groupId; })[0].revision
    };
    return true;
  }
  window.grCommitGroupMemberSlots = function (changes) {
    var model = window.RyDrawingDesignModel, adapter = window.RyDrawingDesignGroupAdapter;
    var ge = window.__runyeGroupEdit, subs = window.__runyeSubPlots || [];
    if (!model || !adapter || !ge || !ge.active || !Array.isArray(changes) || !changes.length ||
        W.groupRef !== ge || !window.grExportState) return false;
    var memberIds = subs.map(function (plot) { return String(plot && plot.id || ''); });
    if (memberIds.length < 2 || !memberIds.every(function (id) { return !!id; })) return false;
    var seen = Object.create(null);
    for (var c = 0; c < changes.length; c++) {
      if (!changes[c] || !Number.isInteger(changes[c].index) || changes[c].index < 0 ||
          changes[c].index >= memberIds.length || !changes[c].slot || seen[changes[c].index]) return false;
      if (Object.prototype.hasOwnProperty.call(changes[c], 'stepOverrides')) {
        var nextStep = changes[c].stepOverrides;
        var oldStep = changes[c].stepPreimage;
        function validStep(value) {
          return value == null || (value && typeof value === 'object' && !Array.isArray(value) &&
            typeof value.sig === 'string' && value.x && typeof value.x === 'object' && !Array.isArray(value.x) &&
            value.y && typeof value.y === 'object' && !Array.isArray(value.y));
        }
        if (!validStep(nextStep) || !validStep(oldStep)) return false;
      }
      seen[changes[c].index] = true;
    }
    var memberKey = JSON.stringify(memberIds), groupId = 'legacy-group:' + memberKey;
    /* Keep the saved slot as the transaction preimage; grSync may still use the live
       ppState for its read-only block view, so the live slot is explicitly excluded here. */
    var baseline = window.grExportState({ includeLiveSlot: false });
    if (!baseline || !baseline.blocks || changes.some(function (change) { return !baseline.blocks[change.index]; })) return false;
    baseline = clone(baseline);
    changes.forEach(function (change) {
      var savedStep = change.stepPreimage;
      if (!Object.prototype.hasOwnProperty.call(change, 'stepOverrides')) {
        var priorState = baseline.blocks[change.index].tlState;
        savedStep = priorState && priorState.step;
      }
      baseline.blocks[change.index].tlData = null;
      baseline.blocks[change.index].tlState = savedStep ? { step: clone(savedStep) } : null;
    });
    var candidate = clone(baseline);
    changes.forEach(function (change) {
      candidate.edit.slots[change.index] = clone(change.slot);
      if (Object.prototype.hasOwnProperty.call(change, 'stepOverrides')) {
        var step = change.stepOverrides;
        candidate.blocks[change.index].tlState = step
          ? { step: clone(step) } : null;
      }
    });
    var options = {
      projectId: 'legacy-group-project:' + memberKey,
      groupId: groupId,
      frameId: 'legacy-frame:' + memberKey
    };
    var imported = adapter.fromGroupSnapshot(baseline, options);
    var desired = adapter.fromGroupSnapshot(candidate, options);
    if (!imported || !imported.ok || !desired || !desired.ok) {
      var conversionError = !imported || !imported.ok ? imported : desired;
      window.__runyeDrawingDesignShadow = {
        ok: false, stage: 'member-write', error: conversionError && conversionError.error || 'group-member-import-failed'
      };
      return false;
    }
    var changed = [];
    changes.forEach(function (change) {
      var plotId = memberIds[change.index];
      var currentPlot = imported.design.plots.filter(function (plot) { return plot.plotId === plotId; })[0];
      var desiredPlot = desired.design.plots.filter(function (plot) { return plot.plotId === plotId; })[0];
      if (currentPlot && desiredPlot && grPlotDesignComparable(currentPlot) !== grPlotDesignComparable(desiredPlot)) {
        changed.push({ index: change.index, plotId: plotId, desiredPlot: desiredPlot });
      }
    });
    if (changed.length !== changes.length) {
      var invalidMember = changes.filter(function (change) {
        var id = memberIds[change.index];
        return !imported.design.plots.some(function (plot) { return plot.plotId === id; }) ||
          !desired.design.plots.some(function (plot) { return plot.plotId === id; });
      })[0];
      if (invalidMember) return false;
    }
    if (!changed.length) {
      /* A compatibility-only difference is not a canonical design transaction. Keep the
         authoritative slot untouched instead of admitting fields the adapter did not model. */
      window.__runyeDrawingDesignShadow = {
        ok: true, stage: 'member-write', noChange: true, plotIds: []
      };
      return true;
    }
    /* Only changed members lose old L3 state. Reimport with those blocks sanitized while
       preserving untouched members' generated geometry and edits. */
    var projectionBaseline = window.grExportState({ includeLiveSlot: false });
    if (!projectionBaseline || !projectionBaseline.blocks) return false;
    projectionBaseline = clone(projectionBaseline);
    changed.forEach(function (item) {
      var stepChange = changes.filter(function (change) { return change.index === item.index; })[0];
      var savedStep = stepChange && Object.prototype.hasOwnProperty.call(stepChange, 'stepOverrides')
        ? stepChange.stepPreimage : (projectionBaseline.blocks[item.index].tlState && projectionBaseline.blocks[item.index].tlState.step);
      projectionBaseline.blocks[item.index].tlData = null;
      projectionBaseline.blocks[item.index].tlState = savedStep ? { step: clone(savedStep) } : null;
    });
    var fullBase = adapter.fromGroupSnapshot(projectionBaseline, options);
    if (!fullBase || !fullBase.ok) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'member-write', error: fullBase && fullBase.error || 'group-member-preimage-failed' };
      return false;
    }
    var base = imported.design;
    if (W.canonicalGroupId === groupId && W.canonicalDesign &&
        grCanonicalComparableExceptPlotLevel3(W.canonicalDesign, changed.map(function (item) { return item.plotId; })) ===
          grCanonicalComparableExceptPlotLevel3(fullBase.design, changed.map(function (item) { return item.plotId; }))) {
      base = W.canonicalDesign;
    } else {
      base = fullBase.design;
    }
    var updatedDesign = base;
    for (var u = 0; u < changed.length; u++) {
      var item = changed[u], updated = model.updatePlot(updatedDesign, item.plotId, updatedDesign.revision, function (target) {
        target.geometry = clone(item.desiredPlot.geometry);
        target.partition = clone(item.desiredPlot.partition);
        target.network = clone(item.desiredPlot.network);
        delete target.network.level3Edits;
        delete target.generated;
      });
      if (!updated || !updated.ok) {
        window.__runyeDrawingDesignShadow = { ok: false, stage: 'member-write', error: updated && updated.error || 'group-member-update-failed' };
        return false;
      }
      updatedDesign = updated.design;
    }
    var projected = adapter.toLegacyPatch(updatedDesign, groupId, projectionBaseline);
    if (!projected || !projected.ok || !projected.snapshot || !projected.snapshot.edit ||
        !projected.snapshot.edit.slots || !projected.snapshot.blocks) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'member-write', error: projected && projected.error || 'group-member-projection-failed' };
      return false;
    }
    var changedByIndex = Object.create(null);
    changed.forEach(function (item) { changedByIndex[item.index] = true; });
    changes.forEach(function (change) {
      if (changedByIndex[change.index]) {
        ge.slots[change.index] = clone(projected.snapshot.edit.slots[change.index]);
      }
    });
    W.blocks = clone(projected.snapshot.blocks);
    W.canonicalDesign = updatedDesign;
    W.canonicalGroupId = groupId;
    window.__runyeDrawingDesignShadow = {
      ok: true, stage: 'member-write', plotIds: changed.map(function (item) { return item.plotId; }),
      designRevision: updatedDesign.revision,
      plotRevisions: changed.map(function (item) {
        var plot = updatedDesign.plots.filter(function (entry) { return entry.plotId === item.plotId; })[0];
        return { plotId: item.plotId, revision: plot && plot.revision };
      }),
      groupRevision: updatedDesign.groups.filter(function (group) { return group.groupId === groupId; })[0].revision
    };
    return true;
  };
  window.grCommitGroupMemberSlot = function (index, slot) {
    return window.grCommitGroupMemberSlots([{ index: index, slot: slot }]);
  };
  /* [v678] grEnterTlForBlock / grEnterPlotL2 外部导出已随入口一起移除。 */
  window.grExportState = function (options) {
    options = options || {};
    var ge = window.__runyeGroupEdit;
    if (!ge || !ge.active || !window.__runyeSubPlots || window.__runyeSubPlots.length < 2) return null;
    grSaveBlockTl(); grSync();
    var edit = clone(ge), live = window.RunyeBridge.groupLiveSlot();
    /* Canonical member edits are committed at the editor action boundary. Rendering
       can lazily fill cutSnap/partitionCuts in the live canvas without a user edit;
       exporting that live view would turn a read into a design write and make a
       restored per-plot snapshot diverge from its canonical source. */
    if (live && options.includeLiveSlot !== false && !W.canonicalDesign) edit.slots[ge.current] = live;
    var blocks = clone(W.blocks);
    blocks.forEach(function(b){if(b.tlState){b.tlState.calibers=null;b.tlState.override=null;}});
    var snapshot = {version:1, subPlots:clone(window.__runyeSubPlots), frame:clone(W.frame), edit:edit,
      blocks:blocks, defaults:clone(W.tlDefaults), trunk:clone(W.trunk),
      dnOver:clone(W.dnOver || { main: null, branch: null })};
    /* Persist the canonical model as the group design authority; legacy fields below are
       a checked projection for the editors and older consumers. */
    try {
      var adapter = window.RyDrawingDesignGroupAdapter;
      var model = window.RyDrawingDesignModel;
      var memberIds = snapshot.subPlots.map(function (plot) { return String(plot && plot.id || ''); });
      var groupKey = JSON.stringify(memberIds), groupId = 'legacy-group:' + groupKey;
      var imported = adapter && adapter.fromGroupSnapshot(snapshot, {
        projectId: 'legacy-group-project:' + groupKey,
        groupId: groupId,
        frameId: 'legacy-frame:' + groupKey
      });
      if (!imported || !imported.ok || !model || !model.validate(imported.design).ok) {
        window.__runyeDrawingDesignShadow = {
          ok: false, stage: 'group-export',
          error: imported && imported.error || 'group-canonical-export-unavailable'
        };
        return null;
      }
      var hasCanonical = W.canonicalGroupId === groupId && W.canonicalDesign;
      if (hasCanonical && grCanonicalComparable(W.canonicalDesign) !== grCanonicalComparable(imported.design)) {
        window.__runyeDrawingDesignShadow = { ok: false, stage: 'group-export', error: 'canonical-legacy-group-divergence' };
        return null;
      }
      var canonical = hasCanonical ? W.canonicalDesign : imported.design;
      snapshot.canonicalDrawingDesign = clone(canonical);
      W.canonicalDesign = clone(canonical);
      W.canonicalGroupId = groupId;
    } catch (canonicalExportError) {
      window.__runyeDrawingDesignShadow = { ok: false, stage: 'group-export', error: 'group-canonical-export-error' };
      return null;
    }
    /* Migration shadow records the canonical/compatibility round trip after export. */
    grObserveDrawingDesignSnapshot(snapshot, 'export', false);
    return snapshot;
  };
  var grPreparedRestoreSource=null,grPreparedRestoreResult=null;
  function grPrepareRestoreState(saved) {
    if (!saved) return {ok:false,error:'group-snapshot-missing'};
    function ringOK(r){return Array.isArray(r) && r.length>=3 && r.every(function(p){return p && Number.isFinite(p.x) && Number.isFinite(p.y);});}
    if (saved.version!==1 || !ringOK(saved.frame) || !Array.isArray(saved.subPlots) || saved.subPlots.length<2 ||
      !saved.subPlots.every(function(s){return s && ringOK(s.poly);}) || !saved.edit ||
      !Array.isArray(saved.edit.slots) || saved.edit.slots.length!==saved.subPlots.length) return {ok:false,error:'group-snapshot-shape-invalid'};
    var prepared=saved, preparedCanonical=null;
    /* New snapshots restore from the canonical design, then project into the legacy
       fields still consumed by the group editor. Snapshots without this field remain
       on the legacy import path; a present but invalid/unprojectable model fails closed. */
    if (Object.prototype.hasOwnProperty.call(saved, 'canonicalDrawingDesign')) {
      try {
        var restoreAdapter = window.RyDrawingDesignGroupAdapter;
        var restoreModel = window.RyDrawingDesignModel;
        var restoreIds = saved.subPlots.map(function (plot) { return String(plot && plot.id || ''); });
        var restoreKey = JSON.stringify(restoreIds);
        var restoreGroupId = 'legacy-group:' + restoreKey;
        var canonical = saved.canonicalDrawingDesign;
        var canonicalGroup = canonical && Array.isArray(canonical.groups)
          ? canonical.groups.filter(function (group) { return group.groupId === restoreGroupId; })[0] : null;
        if (!restoreAdapter || !restoreModel || !restoreModel.validate(canonical).ok ||
            canonical.projectId !== 'legacy-group-project:' + restoreKey || !canonicalGroup ||
            JSON.stringify(canonicalGroup.memberPlotIds) !== JSON.stringify(restoreIds)) return {ok:false,error:'canonical-group-binding-invalid'};
        var canonicalProjection = restoreAdapter.toLegacyPatch(canonical, restoreGroupId, saved);
        if (!canonicalProjection || !canonicalProjection.ok || !canonicalProjection.snapshot) return {ok:false,error:'canonical-group-projection-failed'};
        prepared = Object.assign({}, canonicalProjection.snapshot, { canonicalDrawingDesign: clone(canonical) });
        var imported = restoreAdapter.fromGroupSnapshot(prepared, {
          projectId:'legacy-group-project:'+restoreKey,
          groupId:restoreGroupId,
          frameId:'legacy-frame:'+restoreKey
        });
        if (!imported || !imported.ok || !restoreModel.validate(imported.design).ok) return {ok:false,error:'canonical-group-import-failed'};
        if (grCanonicalComparable(canonical) !== grCanonicalComparable(imported.design)) {
          return {ok:false,error:'canonical-group-roundtrip-mismatch'};
        }
        preparedCanonical=clone(canonical);
      } catch (canonicalProjectionError) {
        return {ok:false,error:'canonical-group-projection-error'};
      }
    } else {
      try {
        var legacyAdapter = window.RyDrawingDesignGroupAdapter;
        var legacyModel = window.RyDrawingDesignModel;
        var legacyIds = saved.subPlots.map(function (plot) { return String(plot && plot.id || ''); });
        var legacyKey = JSON.stringify(legacyIds);
        var legacyGroupId = 'legacy-group:' + legacyKey;
        var legacyImport = legacyAdapter && legacyAdapter.fromGroupSnapshot(saved, {
          projectId:'legacy-group-project:'+legacyKey,
          groupId:legacyGroupId,
          frameId:'legacy-frame:'+legacyKey
        });
        if (!legacyImport || !legacyImport.ok || !legacyModel || !legacyModel.validate(legacyImport.design).ok) {
          return {ok:false,error:legacyImport && legacyImport.error || 'legacy-group-import-failed'};
        }
        preparedCanonical=clone(legacyImport.design);
      } catch (legacyProjectionError) {
        return {ok:false,error:'legacy-group-import-error'};
      }
    }
    return {ok:true,snapshot:prepared,canonicalDesign:preparedCanonical};
  }
  window.grValidateRestoreState = function(saved){
    grPreparedRestoreSource=null;grPreparedRestoreResult=null;
    var prepared=grPrepareRestoreState(saved);
    if(prepared.ok){grPreparedRestoreSource=saved;grPreparedRestoreResult=prepared;}
    return prepared.ok;
  };
  window.grRestoreState = function (saved) {
    if (!saved) { grPreparedRestoreSource=null;grPreparedRestoreResult=null;window.__runyeGroupEdit=null; window.__runyeSubPlots=null; grSync(); grRefreshUI(); return false; }
    var preparedRestore=grPreparedRestoreSource===saved&&grPreparedRestoreResult?grPreparedRestoreResult:null;
    grPreparedRestoreSource=null;grPreparedRestoreResult=null;
    if(!preparedRestore)preparedRestore=grPrepareRestoreState(saved);
    if(!preparedRestore.ok) return false;
    saved=preparedRestore.snapshot;
    /* Inspect legacy input through the canonical adapters before applying it. The projected
       result validates the canonical projection before the legacy-compatible editor state is applied. */
    grObserveDrawingDesignSnapshot(saved, 'restore', true);
    window.__runyeSubPlots=clone(saved.subPlots); window.measuredPolygon=clone(saved.frame);
    var edit=clone(saved.edit), mode=edit.mode, current=edit.current;
    edit.active=true; edit.mode='whole'; edit.current=Math.max(0,Math.min(edit.slots.length-1,Math.floor(num(current,0))));
    edit.trunkPipes=clone(saved.trunk && saved.trunk.lines || []); edit.trunkDn=num(saved.trunk && saved.trunk.dn,110);
    window.__runyeGroupEdit=edit; window.__runyeTlBlock=null; window.__runyeGroupPlotEdit=null;
    /* The mode bridge may save the current member through grExportState. Install the
       restored group and canonical source first, so that bridge reads this group rather
       than the previous W.groupRef (or an empty initial W). */
    W.groupRef=edit; W.groupKey=JSON.stringify(saved.subPlots.map(function(s){return s.id || s.name;}));
    W.blocks=clone(saved.blocks || []); W.tlDefaults=clone(saved.defaults);
    W.trunk={lines:edit.trunkPipes,dn:edit.trunkDn};
    W.canonicalDesign=preparedRestore.canonicalDesign;
    W.canonicalGroupId='legacy-group:' + JSON.stringify(saved.subPlots.map(function (plot) { return String(plot && plot.id || ''); }));
    window.RunyeBridge.setGroupMode('perPlot');
    if(mode!=='perPlot') window.RunyeBridge.setGroupMode('whole');
    /* Project/undo snapshots persist canonical design and its checked legacy projection,
       but intentionally omit in-progress canvas gestures. Reset transient interaction
       state even when restoring the same group identity (grSync only does this on key change). */
    W.mode='pick'; W.draw=null; W.drag=null; W.sel=-1; W.hovBlock=-1; W.hyd=null;
    /* [v654] trunk dn 恢复不再经 grSync 反写（见 grSync 内注释），这里显式落值并同步下拉显示；
       必须在 grSync/grRefreshUI 之前 —— 后续渲染链（grRenderTrunk）会把 ge.trunkDn 镜像成它。 */
    W.trunk.dn = edit.trunkDn;
    var selDn = document.getElementById('grTrunkDn'); if (selDn) selDn.value = String(W.trunk.dn);
    /* [v668] 主管/支管手动调档覆盖值恢复（缺档兜底，v657 最小存档纪律同款） */
    W.dnOver = clone(saved.dnOver) || { main: null, branch: null };
    if (!W.dnOver || typeof W.dnOver !== 'object') W.dnOver = { main: null, branch: null };
    if (!('main' in W.dnOver)) W.dnOver.main = null;
    if (!('branch' in W.dnOver)) W.dnOver.branch = null;
    grSync();
    grFit(); grRefreshUI(); return true;
  };
  /* [v242→v678] window.grEnterPlotL2 外部导出已随「双击/按钮进二级编辑」入口一起移除。 */
  /* 主区切换 / 窗口尺寸变化时，若本页正显示就重排一次（隐藏期间量到的宽高是 0） */
  window.addEventListener('resize', function () {
    var sec = $('grPipeSection');
    if (sec && sec.classList.contains('ry-active')) { grResize(); grFitScale(); grRender(); }
  });
  grBind();
})();
