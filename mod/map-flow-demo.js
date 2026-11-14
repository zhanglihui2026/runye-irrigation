(function(){
  'use strict';
  /* ═══════════════════════════════════════════════════════════════════════
     [v861 用户需求] 在线地图轮灌演示：把三级页的分区水流动画搬到在线地图实际地块。
     用户原话（摘要）：原来分区水流动画演示搬到在线地图左侧控制面板了，那就直接
     在在线地图实际地块中演示；拾取手动绘制的总管跟分区内的主管、支管；手动绘制
     的总管跟分区主管没有连接就报错；总管与主管怎么连接后面再考虑。

     分工：
     · 本模块 = 分组/校验纯函数（Node 单测锁） + Leaflet 图层演示 + chips 面板
       （#mapDemoBar，挂在左工具栏底部「分组组合 · 轮灌演示」组内，v858 组）。
     · 宿主（online-map.js）注入 ctx：map / toLL(世界米→经纬度，走 v835 geoBridge) /
       getTrunkLines(当前地块全部 trunk v2 总管) / getTrunkPoints(旧宿主兼容) / tip / isMapActive。
     · 数据全部来自既有事实：tlDiagramData（mainPipes/branchPipes/valves/segTrunk/
       combinedN）+ window.tlManualGroups（面积成组）+ trunkSaved（手绘总管）。
       与规划页简图演示（inline-09 v215/v218）互不干扰：地图页激活时隐藏 #tlDemoBar、
       显示本模块 #mapDemoBar；切回规划页自动还原。

     连接判定（validateConnection，接入容差默认 5m，haversine R=6378137 唯一口径）：
     · 总管线体与主管线体或施工/驳接节点相距不超过容差时，命中主管作为水路入口。
     · 分区主管若首尾相接（端点落到另一主管线体 2m 内），就沿接续关系传播可达性；
       只靠近的平行管线不会因此合并。
     · 每组至少有一根主管可从入口到达；仍有断组时 start() 报错且不播放。
     [M14] 唯一节点源为三级工作区 RyTlNodes（N-xx）；旧 dd.couplerNodes 不参与连接判定。
     [v917] 多条保存总管分线演示，不合并虚构连接段。
     [v924] 手绘总管接入主管后，沿几何相接的分区主管段传播可达性；在线地图浮卡展示当前轮灌组水力摘要。
     [v927] 活动区使用独立地图Pane和脉冲色层；无mi的分区阀按支管几何归属，并动画显示开阀。
     ═══════════════════════════════════════════════════════════════════════ */
  var TOL_M = 5, LINK_EPS_M = 0.5, NODE_ATTACH_EPS_M = 1.5, INTERVAL_MS = 1000, FLOW_PANE = 'ryMapFlowPane';
  /* [v1084d] 宽松吸附容差：总管/节点/主管三者的"贴着"判据共用这一份。
     为什么不是 0.5/1.5：总管存的是**实体坐标**，而节点标记画在**显示坐标**
     （主管/支管显示副本平移 ±gap/2≈0.96m；用户实测「阀离支管 0.96m」正是这半个间距），
     点选落点与实体坐标天然差约 1m。地块尺度是几十米、两根主管相距 30m 以上，
     3m 不会把相邻管错连；严格值优先，宽松值兜底并在提示里记账（couplersLoose）。 */
  var LOOSE_ATTACH_M = 3.0;
  /* [v1084] 配件切口去重半径：与线上已有切口（节点/阀门垂足/端点）近于此值就复用，
     不再另切一刀 —— 否则一段管子被劈成 0.1m 碎片，水力切片身份 (key,a,b) 会漂移。 */
  var FIT_DEDUPE_M = 0.25;
  /* [v1084] 最近一次建图的诊断（详见 buildFlowRoutes 开头）。宿主失败时读它生成人话；
     探针/单测也读它 —— 这是"为什么没连上"的唯一机器可读出口。 */
  var lastDiag = null;
  var DOT_FILLS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
  var DOT_FILLS_LT = ['#fca5a5', '#fcd34d', '#86efac', '#93c5fd'];
  var DOT_INKS_LT = ['#7f1d1d', '#78350f', '#14532d', '#1e3a8a'];

  /* ── 纯函数（Node 单测锁） ─────────────────────────────────────────── */
  /* 分区 zi（行主序下标）→ 组下标 g。手动分组优先（mg=数组的数组）；
     自动均分：每组 nPer 个分区。越界返回 -1。 */
  function groupOf(zi, manual, nPer) {
    if (!(zi >= 0)) return -1;
    if (manual && manual.length) {
      for (var g = 0; g < manual.length; g++) {
        var arr = manual[g] || [];
        for (var i = 0; i < arr.length; i++) {
          if (parseInt(arr[i], 10) === zi) return g;
        }
      }
      return -1;
    }
    var n = Math.max(1, nPer || 1);
    return Math.floor(zi / n);
  }
  function groupCount(total, manual, nPer) {
    if (!(total > 0)) return 0;
    if (manual && manual.length) return manual.length;
    return Math.max(1, Math.ceil(total / Math.max(1, nPer || 1)));
  }
  /* 将三级施工节点 N-xx 投影为在线地图的轮灌入口点。
     pid=main-i / branch-i，atM 沿工作区有效管线弧长；支管节点归属同索引分区。 */
  function collectWorkspaceNodes(dd, list, pointAt, toLL) {
    var out=[];
    if(!dd||!Array.isArray(list)||typeof pointAt!=='function'||typeof toLL!=='function')return out;
    list.forEach(function(n){
      if(!n)return;
      var m=/^(main|branch)-(\d+)$/.exec(String(n.pid||''));
      if(!m)return;
      var mi=Number(m[2]), lines=m[1]==='main'?dd.mainPipes:dd.branchPipes;
      if(!isFinite(mi)||mi<0||!Array.isArray(lines)||!Array.isArray(lines[mi])||lines[mi].length<2)return;
      var p;try{p=pointAt(n.pid,dd,Number(n.atM));}catch(e){return;}
      if(!p||p.x==null||p.y==null)return;
      var q;try{q=toLL(p);}catch(e2){return;}
      if(!q)return;
      out.push({pipeKey:(m[1]==='main'?'m':'b')+(mi+1),mi:mi,ll:q,nodeId:String(n.id||''),source:'tl-node'});
    });
    return out;
  }
  /* 动画只消费与管网同次发布的地图分区快照，不读取规划页的实时草稿。 */
  function collectPublishedZonePolygons(network) {
    var out=[],parts=network&&network.partitions;
    if(!Array.isArray(parts))return out;
    parts.forEach(function(z){
      if(!z||z.zoneIndex==null||!Number.isInteger(Number(z.zoneIndex))||!Array.isArray(z.latLng))return;
      var ll=[];
      z.latLng.forEach(function(p){var q=readLL(p);if(q)ll.push(q);});
      /* Zone polygons are display geometry only. Hydraulic inputs come from
         the generated design; published polygon area must never feed Q/H. */
      if(ll.length>=3)out.push({zi:Number(z.zoneIndex),ll:ll});
    });
    return out;
  }
  function diagramGeometrySignature(dd) {
    return dd?JSON.stringify([dd.frontPipe,dd.mainPipes,dd.branchPipes,dd.valves,dd.poly]):'';
  }
  /* 连接校验。o = {
       hasTrunk:bool, trunkLL:[{lat,lng}], mainsLL:[[{lat,lng}]×N],
       hasSeg:bool, tolM:number, dist:(a,b)=>米,
       nodesLL:[{pipeKey,mi,ll}]|null, groupOfZi:fn(zi)=>g|null, groups:number|null }
     返回 { ok, code:'no-trunk'|'no-data'|'connected'|'disconnected'|'partial',
            minM, brokenGroups?:[g] }
     [v915 步骤 3] 判据升级（任务清单 §9.4 次序 4）：
     · 结构化匹配：N-xx 施工节点被总管任一
       拐点贴近（≤tol）⇒ 该节点所在主管（mi）视为贯通——与 2b 的「总管吸到节点」
       用户操作一一对应（吸附落点就是拐点）。
     · 逐组可达性：每组（轮灌组）至少一根主管贯通（主管端点贴近 或 该组任一节点的
       主管匹配）才算连通；有组不通 ⇒ code:'partial' + brokenGroups（演示前逐组报错）。
     · 兼容：未提供 nodesLL/groupOfZi（旧档/没放节点/单组）⇒ 走 v861 原口径
       （整体 min(主管端点, 驳接点) ≤tol），旧测试与既有用户流程零影响。 */
  function validateConnection(o) {
    o = o || {};
    var inputTrunks=Array.isArray(o.trunkLinesLL)&&o.trunkLinesLL.length?o.trunkLinesLL:
      (Array.isArray(o.trunkLL)&&o.trunkLL.length?[o.trunkLL]:[]);
    if (!o.hasTrunk || !inputTrunks.length) {
      return { ok: false, code: 'no-trunk', minM: null };
    }
    var mainsFlat = [];
    (o.mainsLL || []).forEach(function (l) {
      (l || []).forEach(function (p) { if (p) mainsFlat.push(p); });
    });
    if (!mainsFlat.length) return { ok: false, code: 'no-data', minM: null };
    var dist = o.dist || function () { return Infinity; };
    if (o.strictNodeEntry) {
      var mainNodes=(o.nodesLL||[]).filter(function(n){return n&&n.kind==='main'&&n.ll&&n.mi>=0;});
      if(!mainNodes.length)return {ok:false,code:'no-node',minM:null};
      /* [v1084c 根因修复] 原来只认「总管折点顶点」贴近节点（line.some(p=>dist(p,n.ll))）。
         但用户画总管是「从 N-01 一路拉到 N-03」，中间 N-02 落在段中间、不是折点 ⇒
         节点明明被线穿过却判未接通；更糟的是 buildFlowRoutes 里同一处判据与这里不一致
         （一处按顶点、一处按线段），于是出现「校验说通了、建图说断了」或反过来的自相矛盾。
         现在两边统一为**点到线段的垂距 ≤ NODE_ATTACH_EPS_M**，与 buildFlowRoutes 的
         project() 用同一套等距投影数学，判据只有一份。 */
      function segDistM(a,b,p){
        var latRef=(a.lat+b.lat)/2,cos=Math.max(.01,Math.cos(latRef*Math.PI/180));
        var k=111320*cos, ax=a.lng*k, ay=a.lat*110540, bx=b.lng*k, by=b.lat*110540,
            px=p.lng*k, py=p.lat*110540, dx=bx-ax, dy=by-ay, den=dx*dx+dy*dy;
        var t=den?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)):0;
        return Math.sqrt((px-(ax+dx*t))*(px-(ax+dx*t))+(py-(ay+dy*t))*(py-(ay+dy*t)));
      }
      function distToLineM(line,p){
        var m=Infinity;
        for(var i=1;i<line.length;i++){var d=segDistM(line[i-1],line[i],p);if(d<m)m=d;}
        return m;
      }
      var attached=mainNodes.some(function(n){
        /* [v1084d] 光"总管贴着节点"还不够：节点本身必须真的落在**自己那根主管**上，
           否则建图时节点会因「不在主管上」被丢弃 —— 这就是"校验说通了、建图说断了"
           的第二次翻版。两处判据现在同时检查（主管侧宽松 3m，容纳显示副本的 0.96m 偏移）。 */
        var ml=(o.mainsLL||[])[n.mi];
        if(ml&&ml.length>=2&&distToLineM(ml,n.ll)>LOOSE_ATTACH_M)return false;
        return inputTrunks.some(function(line){
          return (line||[]).length>=2 && distToLineM(line,n.ll)<=NODE_ATTACH_EPS_M;});
      });
      return attached ? {ok:true,code:'connected',minM:0} : {ok:false,code:'node-not-connected',minM:null};
    }
    var tol = (typeof o.tolM === 'number' && o.tolM > 0) ? o.tolM : TOL_M;
    /* [v920] 判定口径升级：**总管与主管都**按 2m 步长插值成密点再算贴近——
       旧口径只认双方**拐点**，一条直线总管横穿主管（穿越处无拐点、且穿越点
       在主管中段离两端点都远）会被判「未接通」，违背「线穿过=接上」的直觉
       （真机反馈：总管明明穿过两根主管仍报 6 组断）。插值点含全部原拐点，
       行为只放宽不收紧；2m 步长在 5m 容差下精度足够（最坏欠估 <1m）。 */
    function densifyLL(ll) {
      if (!Array.isArray(ll) || ll.length < 2) return (ll || []).slice();
      var out = [];
      for (var i = 1; i < ll.length; i++) {
        var a = ll[i - 1], b = ll[i], d = dist(a, b);
        if (!isFinite(d) || d <= 0) { continue; }
        var n = Math.max(1, Math.ceil(d / 2));
        for (var k = 0; k < n; k++) {
          out.push({ lat: a.lat + (b.lat - a.lat) * k / n, lng: a.lng + (b.lng - a.lng) * k / n });
        }
      }
      out.push(ll[ll.length - 1]);
      return out;
    }
    /* 分区主管在设计图中可能是一根物理主管按分区切成的相邻线段。
       只有两段的端点碰到另一段线体（或彼此端点相碰）才视为主管接续，
       避免把两根仅仅平行靠近的主管误并成一条水路。 */
    /* [perf-cold 20261106] 入参改为「已 densify 的主管点集」：传播循环里同一根
       主管会被反复比较，原实现每对都重新 densify 两次（含大量 dist），纯属重复。
       densifyLL 的首点/末点就是原折线首末点，故端点判据逐字节不变。 */
    function mainSegmentsJoin(ad, bd, joinTol) {
      if (!ad || ad.length < 2 || !bd || bd.length < 2) return false;
      var min = Infinity;
      var ae = [ad[0], ad[ad.length-1]], be = [bd[0], bd[bd.length-1]];
      for (var i = 0; i < ae.length && min > joinTol; i++)
        for (var j = 0; j < bd.length; j++) { var d1 = dist(ae[i], bd[j]); if (d1 < min) min = d1; }
      for (var i2 = 0; i2 < be.length && min > joinTol; i2++)
        for (var j2 = 0; j2 < ad.length; j2++) { var d2 = dist(be[i2], ad[j2]); if (d2 < min) min = d2; }
      return min<=joinTol;
    }
    /* 每条总管独立加密后作为点集比较；绝不把一条线的末点连到下一条线首点。 */
    var trunkDense=[];
    inputTrunks.forEach(function(line){trunkDense=trunkDense.concat(densifyLL(line));});
    /* [perf-cold 20261106] 段剪枝：把总管密点按弧长顺序切成连续段，每段记录
       代表点 c 与半径 R=max dist(c,tp)。由三角不等式
         dist(p,tp) >= dist(p,c) - dist(c,tp) >= dist(p,c) - R
       当 dist(c,p) - R >= 当前最小值 m 时，整段不可能给出更小值 ⇒ 跳过。
       ★ 只跳过「可证明不优」的段，minTo 返回值与原来逐点全比较逐字节一致，
         不是降采样、不是近似、不改 tol、不改任何连通结论。
       ★ 前提：o.dist 为对称度量（页面注入 haversine，Node 单测注入欧氏距离）。
         R 非有限时该段退化为全量比较，异常 dist 下结果仍一致。 */
    var SEG = 24, segs = [];
    for (var si = 0; si < trunkDense.length; si += SEG) {
      var pts = trunkDense.slice(si, Math.min(si + SEG, trunkDense.length));
      var c = pts[Math.floor(pts.length / 2)], R = 0, finite = true;
      for (var pi = 0; pi < pts.length; pi++) {
        var dd = dist(c, pts[pi]);
        if (!isFinite(dd)) { finite = false; break; }
        if (dd > R) R = dd;
      }
      segs.push({ pts: pts, c: c, R: finite ? R : Infinity });
    }
    function minTo(set) {
      var m = Infinity;
      for (var xi = 0; xi < set.length; xi++) {
        var p = set[xi];
        for (var sj = 0; sj < segs.length; sj++) {
          var sg = segs[sj];
          if (isFinite(sg.R) && isFinite(m)) {
            var dc = dist(sg.c, p);
            if (isFinite(dc) && dc - sg.R >= m) continue;
          }
          for (var qi = 0; qi < sg.pts.length; qi++) {
            var d = dist(sg.pts[qi], p);
            if (d < m) m = d;
          }
        }
      }
      return m;
    }
    var mainLines=(o.mainsLL||[]).map(function(l){return(l||[]).filter(Boolean);});
    var mainsDense=mainLines.map(densifyLL);
    /* [perf-cold 20261106] mMain 的点集 = 全部主管密点，与下面 perMain 完全相同；
       而逐组分支（真实页面的正常路径）返回值只用 minMainDistance/perMain，
       mMain/mCoup 一个都不读。原实现无条件先算一遍 ⇒ 白烧近半数 dist。
       延后到旧口径分支再算，判据与返回值一字不改。 */

    /* [v915] 逐组判定：需要 nodesLL + groupOfZi + groups 三者齐备；任一缺席退旧口径。 */
    var perMain = null;   /* mZi[zi]=该主管到总管的最小距离（线体口径） */
    if (typeof o.groupOfZi === 'function' && o.groups > 1 && Array.isArray(o.mainsLL)) {
      perMain = mainsDense.map(function (l) { return minTo(l); });   /* [v920] 线体×线体（双向插值） */
      /* Keep the main-to-main continuation tolerance aligned with the map's
         5 m snap/connectivity contract. Generated zone segments can move a
         little at clipped boundaries; a 2 m-only join falsely marks the
         downstream groups unreachable and prevents the demo from starting. */
      var minMainDistance=Math.min.apply(null,perMain.filter(isFinite));
      var mainReach=perMain.map(function(m){return m<=tol;}),joinTol=tol;
      if (Array.isArray(o.nodesLL)) {
        o.nodesLL.forEach(function (n) {
          if (!n || !n.ll || !(n.mi >= 0)) return;
          var hit = false;
          /* [perf-cold] 命中即停：hit 是 OR 语义，继续扫总管点不会改变结论 */
          for (var ti = 0; ti < trunkDense.length && !hit; ti++) {
            if (dist(trunkDense[ti], n.ll) <= tol) hit = true;   /* [v920] 线体命中也算 */
          }
          if (hit && n.mi < mainReach.length) mainReach[n.mi] = true;   /* 节点匹配 ⇒ 该主管贯通 */
        });
      }
      /* 从总管直接接入的主管出发，沿相接的主管分段传播可达性。
         例如主管 1–4 首尾连成一条物理管时，捕捉到主管 1 会同时接通 2、3、4。 */
      var grew=true;
      while(grew){
        grew=false;
        for(var mi=0;mi<mainLines.length;mi++){
          if(!mainReach[mi])continue;
          for(var mj=0;mj<mainLines.length;mj++){
            if(mainReach[mj]||mi===mj)continue;
            if(mainSegmentsJoin(mainsDense[mi],mainsDense[mj],joinTol)){mainReach[mj]=true;grew=true;}
          }
        }
      }
      mainReach.forEach(function(reachable,mi){if(reachable)perMain[mi]=0;});
      var broken = [];
      for (var g = 0; g < o.groups; g++) {
        var gMin = Infinity;
        for (var zi = 0; zi < perMain.length; zi++) {
          if (o.groupOfZi(zi) === g && perMain[zi] < gMin) gMin = perMain[zi];
        }
        if (!(gMin <= tol)) broken.push(g);
      }
      if (broken.length) {
        /* [v919] 断组对应的主管索引（去重）：宿主在地图上把这些主管线画红，
           用户直接看到「哪几根还没接」，不用对着组号猜。 */
        var brokenMains = [];
        for (var zi2 = 0; zi2 < perMain.length; zi2++) {
          if (perMain[zi2] > tol && broken.indexOf(o.groupOfZi(zi2)) > -1 &&
              brokenMains.indexOf(zi2) === -1) brokenMains.push(zi2);
        }
        return { ok: false, code: 'partial', minM: minMainDistance, brokenGroups: broken, brokenMains: brokenMains };
      }
      return { ok: true, code: 'connected', minM: minMainDistance };
    }

    /* [perf-cold] 只有旧口径分支（无逐组数据）才需要 mMain/mCoup，此处才计算 */
    var mainsDenseFlat=[];
    mainsDense.forEach(function(l){l.forEach(function(p){mainsDenseFlat.push(p);});});
    var mMain = minTo(mainsDenseFlat);   /* [v920] 线体×线体，判据不变 */
    var mCoup = (o.hasSeg && Array.isArray(o.couplersLL) && o.couplersLL.length) ? minTo(o.couplersLL) : Infinity;
    var ok = (mMain <= tol) || (mCoup <= tol);
    return { ok: ok, code: ok ? 'connected' : 'disconnected', minM: Math.min(mMain, isFinite(mCoup) ? mCoup : Infinity) };
  }

  /* [v916 步骤 4] 演示水路入口精确化（纯函数，Node 单测锁）。
     活动组 g 的「水流入口」= 该组内 N-xx 节点所在主管的节点（nodesLL 来自
     RyTlNodes 的有效管线投影并由 geoBridge 反算经纬度）。返回 [{pipeKey, mi, ll}]；
     无节点数据/该组没放节点 ⇒ []（渲染层自然退化为只高亮主管，零破坏）。 */
  function entrancesOf(d, g) {
    if (!d || !Array.isArray(d.nodesLL)) return [];
    var gof = d.groupOfZi || function (zi) { return groupOf(zi, d.manual, d.nPer); };
    return d.nodesLL.filter(function (n) {
      return n && n.ll && (n.mi >= 0) && gof(n.mi) === g;
    });
  }

  /* ── 运行时（依赖宿主注入 ctx） ────────────────────────────────────── */
  var ctx = null, layer = null, active = null, timer = null, playing = false;
  var collectBlockReason = null, renderSnapshotRoutes = null;
  /* [perf-20261106 阶段B] 切组缓存：validateConnection 是纯函数，但每次切组都要把
     总管/主管按 2m 步长插值成密点做「线体×线体」距离比较（阶段A实测：36 区异形
     地块单次 136ms，占一次切换 149ms 的 91%，并触发 >50ms 长任务）。
     几何/分组数据未变时复用上次校验结果——判据、容差与返回值一字不改，只省重算。
     签名覆盖校验的全部输入（总管/主管/支管/段总管/接驳点/节点/阀门/分区多边形/
     分组/组数）+ 数据对象引用；拖动分区、旋转或重生成管线、节点编辑、总管编辑、
     换地块、恢复工程任一发生都会换签名 ⇒ 立即重算。
     ★ 缓存仅在演示模块内，绝不外溢到水力、设计、施工图或持久化链路。 */
  var lastValidationSig = null, lastValidation = null, lastD = null, lastDDRef = null;
  /* start → render 的同一次切组数据快照（render 取用后立即清空）。刻意不改
     render() 的函数签名：tests/demo_flow_revive.test.cjs 用 `function render(g)`
     字面量切源码区域做回归锁，签名一变会打破既有契约。独立调用 render 时
     该值为 null，行为与改动前逐字节一致（自行 collect）。 */
  var renderSnapshotD = null;

  function readLL(p) {
    if (Array.isArray(p)) return (isFinite(p[0]) && isFinite(p[1])) ? { lat: p[0], lng: p[1] } : null;
    if (p && isFinite(p.lat) && isFinite(p.lng)) return { lat: p.lat, lng: p.lng };
    return null;
  }
  function toLLSafe(pt) {
    try { var q = ctx.toLL(pt); return q ? readLL(q) : null; } catch (e) { return null; }
  }
  function toLLLine(line) {
    var out = [];
    (line || []).forEach(function (p) { var q = toLLSafe(p); if (q) out.push(q); });
    return out.length >= 2 ? out : null;
  }

  /* 拾取当前地块的全部演示素材（经纬度）。不可反算（地块不一致/无图）返回 null。 */
  function collect() {
    collectBlockReason = null;
    if (!ctx) return null;
    var dd = window.tlDiagramData;
    if (!dd || dd.world !== 'meter') return null;
    var network=null,mapPlotId=typeof ctx.currentPlotId==='function'?ctx.currentPlotId():null;
    if(typeof ctx.getNetworkSnapshot==='function'){
      try{network=ctx.getNetworkSnapshot();}catch(eNetwork){}
      if(mapPlotId==null||String(mapPlotId)===''){
        collectBlockReason='请先在在线地图选中当前地块，再生成和演示轮灌水路。';
        return null;
      }
      if(!network){
        collectBlockReason='当前地块没有可核验的管路快照，已停止轮灌演示。请先回「分区与管路」生成并保存当前地块管线。';
        return null;
      }
      if(network&&network.needsReplan){
        collectBlockReason='当前分区已变化，管路快照标记为需重新规划；请回「分区与管路」重新生成管线。';
        return null;
      }
      if(network&&mapPlotId!=null&&String(network.plotId==null?'':network.plotId)!==String(mapPlotId)){
        collectBlockReason='当前管路快照不属于地图选中的地块，已停止轮灌演示。请先打开该地块对应的设计并重新生成管线。';
        return null;
      }
      /* 页面恢复/重绘会重建相同几何并刷新 generatedAt；时间不是管路版本身份。
         下面的几何签名仍严格拒绝尚未发布的新分区或管线。 */
      if(String(network.diagramGeometrySig||'')!==diagramGeometrySignature(dd)){
        collectBlockReason='在线地图管网与节点几何版本不一致，请重新生成施工图后再演示。';
        return null;
      }
      if(!network.publishedNodes||network.publishedNodes.version!==2||
          network.publishedNodes.geometrySig!==network.diagramGeometrySig||!Array.isArray(network.publishedNodes.items)){
        collectBlockReason='当前管网快照尚未包含同版施工节点，请回「分区与管路」重新生成施工图后再演示。';
        return null;
      }
      if(!network.routeGeometry||network.routeGeometry.version!==2||
          network.routeGeometry.geometrySig!==network.diagramGeometrySig||
          !Array.isArray(network.routeGeometry.mains)||!Array.isArray(network.routeGeometry.branches)||
          !Array.isArray(network.routeGeometry.valves)||!Array.isArray(network.routeGeometry.nodes)){
        collectBlockReason='当前管网快照尚未包含同版寻路几何，请回「分区与管路」重新生成施工图后再演示。';
        return null;
      }
    }else{
      collectBlockReason='当前在线地图缺少可核验的已发布管网快照，已停止轮灌演示。';
      return null;
    }
    var mainsLL = [], branchLL = [], displayMainsLL = [], displayBranchLL = [], valves = [], couplersLL = [], segLL = null, nodesLL = [];
    var sourceLL=null;
    try{sourceLL=typeof ctx.getWaterSource==='function'?readLL(ctx.getWaterSource()):null;}catch(eSource){}
    /* 动画管线、阀门和节点只读同一发布快照，不再混入实时 DD/AutoEdits 草稿。 */
    var routeGeometry=network.routeGeometry;
    function snapshotLine(raw){var out=[];(raw||[]).forEach(function(p){var q=readLL(p);if(q)out.push(q);});return out.length>=2?out:null;}
    routeGeometry.mains.forEach(function(line){var q=snapshotLine(line);if(q)mainsLL.push(q);});
    routeGeometry.branches.forEach(function(line){var q=snapshotLine(line);if(q)branchLL.push(q);});
    /* 显示副本只用于动画描边贴合地图上可见管线；拓扑和连接判断仍使用上面的物理中心线。
       旧快照缺少显示副本时逐线回退到实体几何。 */
    displayMainsLL=mainsLL.map(function(line,i){return snapshotLine((routeGeometry.displayMains||[])[i])||line;});
    displayBranchLL=branchLL.map(function(line,i){return snapshotLine((routeGeometry.displayBranches||[])[i])||line;});
    routeGeometry.valves.forEach(function(v){if(!v)return;var ll=readLL(v.ll),anchor=readLL(v.anchorLL);if(ll)valves.push({ll:ll,anchorLL:anchor,mi:Number(v.mi),tier:String(v.tier||'zone')});});
    /* [v1084 阀门/三通归属] 三级页插入的配件按「所属管线 + 桩号」读入：这是精确归属，
       不靠几何容差。老快照没有 fittings 字段 ⇒ 空数组，行为与 v1083 一致。
       逐件宽容：坐标或管线信息不全就跳过这一件，不阻断演示（宁可少一个节点，
       也不要因为一个坏配件把整场演示拦掉）。 */
    var fittings = [];
    (Array.isArray(routeGeometry.fittings)?routeGeometry.fittings:[]).forEach(function(f){
      if(!f)return;
      var ll=readLL(Array.isArray(f.ll)?f.ll:[f.lat,f.lng]);
      if(!ll)return;
      var pk=String(f.pipeKind||''),mi=Number(f.mi);
      if(pk!=='main'&&pk!=='branch')return;
      if(!Number.isInteger(mi)||mi<0)return;
      fittings.push({
        id:String(f.id||''),kind:String(f.kind||''),tier:String(f.tier||'pipe'),
        pipeKind:pk,mi:mi,atM:Number(f.atM)||0,ll:ll,
        displayLL:readLL(Array.isArray(f.displayLL)?f.displayLL:[f.displayLat,f.displayLng])||ll
      });
    });
    routeGeometry.nodes.forEach(function(n){
      if(!n||!Number.isInteger(Number(n.mi)))return;var ll=readLL(n.ll);if(!ll)return;
      nodesLL.push({pipeKey:(n.kind==='main'?'m':'b')+(Number(n.mi)+1),kind:n.kind,mi:Number(n.mi),ll:ll,
        displayLL:readLL(n.displayLL)||ll,nodeId:String(n.id||''),source:'published-node'});
    });
    if(valves.length!==routeGeometry.valves.length||nodesLL.length!==routeGeometry.nodes.length||
        nodesLL.length!==(network.publishedNodes.items||[]).length){
      collectBlockReason='同版快照中的阀门或施工节点数据不完整，请重新生成施工图后再演示。';
      return null;
    }
    var zonePolygons=collectPublishedZonePolygons(network);
    if(routeGeometry.segTrunk)segLL=snapshotLine(routeGeometry.segTrunk);
    var trunkLinesLL = [];
    if(typeof ctx.getTrunkLines==='function'){
      var gotLines=ctx.getTrunkLines();
      if(Array.isArray(gotLines))gotLines.forEach(function(line){if(Array.isArray(line)&&line.length>=2)trunkLinesLL.push(line);});
    } else {
      var legacyTrunk=ctx.getTrunkPoints?ctx.getTrunkPoints():null;
      if(Array.isArray(legacyTrunk)&&legacyTrunk.length>=2)trunkLinesLL.push(legacyTrunk);
    }
    var trunkLL=[];
    trunkLinesLL.forEach(function(line){trunkLL=trunkLL.concat(line);});
    var total = mainsLL.length;
    if(total!==routeGeometry.mains.length||branchLL.length!==routeGeometry.branches.length||
        total!==(dd.mainPipes||[]).length||branchLL.length!==(dd.branchPipes||[]).length){
      collectBlockReason='同版快照中的主管/支管数量不完整，请重新生成施工图后再演示。';
      return null;
    }
    if (!total) return null;
    /* 分区面只负责地图着色，不是水力路径/流量/扬程输入。
       只有整套发布分区轮廓与生成管线区号一一对应时才显示；缺失、重复或错号时
       隐去分区面，但继续用已核验的管网几何执行后续闭环校验与动画。 */
    var zoneByIndex={},zoneOverlayComplete=zonePolygons.length===total;
    zonePolygons.forEach(function(z){
      if(!z||!Number.isInteger(z.zi)||z.zi<0||z.zi>=total||zoneByIndex[z.zi])zoneOverlayComplete=false;
      else zoneByIndex[z.zi]=z;
    });
    for(var zi=0;zi<total;zi++)if(!zoneByIndex[zi])zoneOverlayComplete=false;
    if(!zoneOverlayComplete)zonePolygons=[];
    var manual = (window.tlManualGroups && window.tlManualGroups.length) ? window.tlManualGroups : null;
    return {
      mainsLL: mainsLL, branchLL: branchLL, displayMainsLL:displayMainsLL, displayBranchLL:displayBranchLL, valves: valves,
      fittings: fittings,
      couplersLL: couplersLL, segLL: segLL, trunkLL: trunkLL, trunkLinesLL: trunkLinesLL,
      nodesLL: nodesLL, zonePolygons:zonePolygons, sourceLL:sourceLL,
      manual: manual, nPer: dd.combinedN || 1, total: total,
      gCount: groupCount(total, manual, dd.combinedN || 1)
    };
  }

  /* [perf-20261106] 连通校验输入签名：用完整坐标串（不用哈希）⇒ 零碰撞风险。
     生成/比较一次约 0.3ms，相对 validateConnection 的百毫秒量级可忽略。
     只列 validateConnection 真正读到的字段；渲染专用字段不进签名以免误失效，
     但分区多边形纳入（拖动/重划分区后必定失效，满足任务书的失效口径）。 */
  function validationSignature(d) {
    function p2(p) {
      return p && isFinite(p.lat) && isFinite(p.lng)
        ? p.lat.toFixed(7) + ',' + p.lng.toFixed(7) : 'x';
    }
    function line(l) { return (l || []).map(p2).join(';'); }
    var a = [];
    a.push((d.trunkLinesLL || []).map(line).join('|'));
    a.push((d.mainsLL || []).map(line).join('|'));
    a.push((d.branchLL || []).map(line).join('|'));
    a.push(line(d.segLL));
    a.push((d.couplersLL || []).map(p2).join(';'));
    a.push((d.nodesLL || []).map(function (n) { return n.kind + ':' + n.mi + ':' + p2(n.ll); }).join(';'));
    a.push((d.valves || []).map(function (v) { return v.mi + ':' + p2(v.ll); }).join(';'));
    /* zonePolygons are display-only and are not read by validateConnection. */
    a.push(String(d.total) + ':' + String(d.nPer) + ':' + String(d.gCount));
    a.push(d.manual ? JSON.stringify(d.manual) : '-');
    return a.join('#');
  }

  /* [perf-cold 20261106] 缓存读取/计算的唯一入口：start() 与空闲预热共用，
     保证两者填的是同一份缓存、走同一套失效判据，不产生第二套口径。 */
  function ensureValidation(d) {
    var ddRef = window.tlDiagramData;
    if (ddRef !== lastDDRef) { lastDDRef = ddRef; lastValidationSig = null; }
    var sig = validationSignature(d);
    if (sig === lastValidationSig && lastValidation) return lastValidation;
    var v = validateConnection({
      hasTrunk: !!(d.trunkLL && d.trunkLL.length),
      trunkLL: d.trunkLL || [],
      trunkLinesLL: d.trunkLinesLL || [],
      mainsLL: d.mainsLL, couplersLL: d.couplersLL, hasSeg: !!d.segLL,
      tolM: TOL_M,
      dist: (window.RyTrunkGeo && window.RyTrunkGeo.haversine) ? window.RyTrunkGeo.haversine : function () { return Infinity; },
      /* [v915] 步骤 3：逐组可达性 + 节点结构化匹配（齐备才启用，缺则退 v861 原口径） */
      nodesLL: d.nodesLL,
      strictNodeEntry: true,
      groupOfZi: function (zi) { return groupOf(zi, d.manual, d.nPer); },
      groups: d.gCount
    });
    lastValidationSig = sig;
    lastValidation = v;
    return v;
  }

  /* [perf-cold 20261106] 空闲预热：页面加载 / 回到地图页且数据就绪后，在浏览器
     空闲期先把连通校验算好填进缓存。用户首次点「轮灌演示」时 start() 直接命中
     ⇒ 交互关键路径不再出现 >50ms 长任务。
     ★ 纯计算：不渲染、不写 DOM、不改 active/playing、不碰 chips；
     ★ 与 start() 共用 ensureValidation，判据与结果完全一致；
     ★ 数据变更时签名失效，start() 仍按新数据重算，无陈旧缓存风险。 */
  var warmupPending = false;
  function scheduleWarmup(d) {
    if (warmupPending || !d) return;
    warmupPending = true;
    var run = function () {
      warmupPending = false;
      try { ensureValidation(d); } catch (e) {}
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1500 });
    else if (typeof setTimeout === 'function') setTimeout(run, 0);
  }

  function ensureLayer() {
    if (!ctx || !ctx.map) return null;
    if(ctx.map.getPane&&!ctx.map.getPane(FLOW_PANE)){
      var pane=ctx.map.createPane(FLOW_PANE);
      pane.style.zIndex='450';
      pane.style.pointerEvents='none';
    }
    if (!layer) layer = window.L.layerGroup().addTo(ctx.map);
    return layer;
  }
  function poly(ll, color, weight, anim) {
    return window.L.polyline(ll.map(function (p) { return [p.lat, p.lng]; }),
      { pane:FLOW_PANE,color: color, weight: weight, opacity: 0.95, className: anim ? 'mapflow-anim' : '', interactive: false });
  }

  /* [v1084f 2026-11-14] 可见元素一律落在**显示世界**——这是 v1082 定下、却被本模块漏掉一半的规则：
     只要有一个点还留在实体坐标，它就会比周围的可见管线偏半个显示间距（≈0.96m），
     用户看到的就是「动画飘在管线旁边」。下面两个 helper 是这条规则在本模块的唯一出口。 */

  /* 实体点 → 挂在「某区支管」上的显示位（阀门、分水连接点用；支管副本是整线刚性平移）。 */
  function shiftToBranchDisplay(d, zi, p) {
    if (!p || !(zi >= 0)) return p;
    var phys = (d.branchLL || [])[zi], show = (d.displayBranchLL || [])[zi];
    if (!phys || !show || !phys.length || !show.length) return p;
    return { lat: p.lat + (show[0].lat - phys[0].lat), lng: p.lng + (show[0].lng - phys[0].lng) };
  }

  /* 实体点 → 显示位，走地图投影层同一实现（online-map 的 toShownPoint，逐点就近管线取位移）。
     取不到投影层就原样返回：宁可不偏移，也不要自己猜一个方向。 */
  function shiftToShown(p) {
    if (!p) return p;
    var PR = window.RyMapPointProjector;
    if (!PR || typeof PR.toShown !== 'function') return p;
    try {
      var q = PR.toShown(p);
      return (q && isFinite(q.lat) && isFinite(q.lng)) ? { lat: q.lat, lng: q.lng } : p;
    } catch (e) { return p; }
  }

  /* Build only the network-root-to-active-zone route. The graph is split at the saved
     coupler nodes, main-line end joins and branch takeoffs, so a later trunk
     junction (for example N-02) is not animated when an earlier zone (zone 3)
     can be supplied from N-01 directly. */
  /* [v1084] 诊断转人话。用户原话「这个地图上的轮灌区演示，到现在都查不清原因」——
     原因不能被藏在闭包里：失败时把「哪一区、缺什么、差多少米」直接写进提示条。
     只取前 3 条，避免 36 区的提示条被刷成一片。 */
  function demoDiagText(diag){
    if(!diag)return '';
    var bits=[],f=diag.fittings||{},zs=diag.zones||[];
    if(diag.blocked)bits.push(diag.blocked);
    if(f.placed)bits.push('已按「管线+桩号」接入阀门/三通 '+f.placed+' 个');
    if(f.noPipe)bits.push(f.noPipe+' 个配件的所属管线已不存在（重新生成施工图即可清掉）');
    if(zs.length){
      var sample=zs.slice(0,3).map(function(z){return '第'+(Number(z.zi)+1)+'区：'+z.reason;});
      bits.push('未接通 '+zs.length+' 处 —— '+sample.join('；')+(zs.length>3?' 等':''));
    }else if(diag.missing){
      bits.push('有 '+diag.missing+' 个支管端点水路不通');
    }
    return bits.length?' 【诊断】'+bits.join('；')+'。':'';
  }

  /* [v1084c] 观测量转人话：把「支管多长、阀门落哪、阀到主管多远、切了几刀、成路几条、
     首条路线里有没有真实支管边」直接写在提示里。覆盖判定只认 key 以 branch: 开头的边，
     所以这一行能一句话区分「图没建对」和「建对了但数不到」。 */
  function demoDebugText(diag,d){
    var parts=[];
    if(d){
      parts.push('主管'+(d.mainsLL||[]).length+'/支管'+(d.branchLL||[]).length+'/阀门'+
        (d.valves||[]).length+'/配件'+(d.fittings||[]).length+'/总管段'+
        (d.trunkLinesLL||[]).length+'（共'+d.total+'区）');
    }
    if(diag&&diag.nodeTotal!=null){
      var cp='总管接上节点 '+(diag.couplers||0)+'/'+diag.nodeTotal+
        (diag.couplersLoose?('（其中 '+diag.couplersLoose+' 个为宽松吸附）'):'');
      var pb=diag.nodeProbe;
      if(pb&&isFinite(pb.minMainD)&&isFinite(pb.minTrunkD)){
        cp+='；最近节点离主管 '+pb.minMainD.toFixed(2)+'m、离总管 '+pb.minTrunkD.toFixed(2)+
          'm（严格容差 0.5 / 1.5）';
      }
      parts.push(cp);
    }
    var g=diag&&diag.debug;
    if(g){
      parts.push('第'+(g.zi+1)+'区：支管长'+g.branchLen+'m，阀门桩号'+g.valveS+
        'm（离支管'+g.valveD+'m），阀到主管'+g.mainDist+'m，支管切口'+g.branchCuts+
        '刀'+(g.hasValveAnchor?'（带锚点）':'（无锚点）'));
    }
    if(diag&&diag.routes!=null)parts.push('成路'+diag.routes+'条/目标'+(diag.targets||0)+'/馈线'+(diag.feeds||0));
    if(diag&&diag.routeKeys&&diag.routeKeys.length)parts.push('首条路线支管边：'+diag.routeKeys.join('、'));
    else if(diag&&diag.routes)parts.push('首条路线无 branch: 边（主支管同列定线时正常，覆盖已按目标点计）');
    return parts.length?' 【数据】'+parts.join('；')+'。':'';
  }

  /* [v1084b] 兜底补诊断：还有一类失败是「路线到了，但没经过真实支管段」——
     支管切口与阀门/端点重合时切出来的段长为 0，`allCovered` 数不到 2，而 diag 里
     一条原因都没有 ⇒ 提示条只剩通用建议，等于又回到"查不清"。
     这里按 allCovered 逐区补原因，保证失败时一定点得出是哪一区。 */
  function mergeDiagForTip(diag,allCovered,total){
    var out={zones:(diag&&diag.zones?diag.zones.slice():[]),
      fittings:diag&&diag.fittings,blocked:diag&&diag.blocked,
      missing:diag&&diag.missing,active:diag&&diag.active};
    var has={};out.zones.forEach(function(z){has[z.zi]=1;});
    for(var zi=0;zi<total;zi++){
      if(allCovered[zi]===2||has[zi])continue;
      out.zones.push({zi:zi,reason:(allCovered[zi]
        ?'只通一端：支管另一端没接到主管/总管'
        :'支管两端都没进入水路（切口与端点重合，或图没连到本区）')});
    }
    return out;
  }

  /* [v1084e] 覆盖口径**唯一实现**。为什么单独抽出来：v1084d 只改了 start() 和
     routesAll() 两处，whyNot() 里还留着老口径（数 branch: 边），于是「控制台诊断说
     0/2、点下去却能演示」——排查工具自己会撒谎，比没有工具更糟。
     规则（别再加分支）：每区两个目标（支管两端），一条到达该区的路线计 1，满 2 即闭合。
     `counted` 是实际计入的路线数（== 成路条数里带 zi 的），供提示里对账
     「成路 24 条 ⇒ 12 区 × 2」。 */
  function coverageOf(routes,total){
    var covered={},counted=0;
    (routes||[]).forEach(function(r){
      if(r&&r.zi!=null){covered[r.zi]=(covered[r.zi]||0)+1;counted++;}
    });
    var missing=[];
    for(var zi=0;zi<total;zi++)if(covered[zi]!==2)missing.push(zi);
    return {covered:covered,counted:counted,missing:missing,closed:missing.length===0};
  }

  function buildFlowRoutes(d,g,allZones){
    /* [v1084] 每轮建图重置诊断：{zones:[{zi,reason}], fittings:{placed,dup,offLine,noPipe},
       active, missing, blocked}。失败时宿主把它翻成人话，用户才知道"哪个区缺什么"。 */
    lastDiag={zones:[],fittings:{placed:0,dup:0,offLine:0,noPipe:0},active:0,missing:0,blocked:null};
    if(!d||!Array.isArray(d.trunkLinesLL)){lastDiag.blocked='没有手绘总管线数据';return null;}
    /* [v1019] 无手绘总管时 segLL（段总管反投线）也可作干线参与寻路——扬程链/最远水路
       共享本引擎（用户拍板 2026-11-08）。两者皆无 ⇒ 由下方 byTrunk 空守卫统一拒绝，
       行为与旧版一致。 */
    var activeZones=[];
    if(allZones){for(var z0=0;z0<d.total;z0++)activeZones.push(z0);}
    else for(var zi=0;zi<d.total;zi++)if(groupOf(zi,d.manual,d.nPer)===g)activeZones.push(zi);
    lastDiag.active=activeZones.length;
    if(!activeZones.length){lastDiag.blocked='本组没有分区';return null;}
    var refLat=(d.trunkLinesLL[0]&&d.trunkLinesLL[0][0]&&isFinite(d.trunkLinesLL[0][0].lat))
      ?d.trunkLinesLL[0][0].lat:0;
    var cos=Math.max(.01,Math.cos(refLat*Math.PI/180)), lines=[], byMain={}, byTrunk=[];
    function xy(p){return{x:p.lng*111320*cos,y:p.lat*110540};}
    function gap(a,b){var dx=a.x-b.x,dy=a.y-b.y;return Math.sqrt(dx*dx+dy*dy);}
    function makeLine(key,kind,index,raw){
      if(!Array.isArray(raw)||raw.length<2)return null;
      var pts=raw.map(xy), cum=[0];
      for(var i=1;i<pts.length;i++)cum[i]=cum[i-1]+gap(pts[i-1],pts[i]);
      var o={key:key,kind:kind,index:index,raw:raw,pts:pts,cum:cum,len:cum[cum.length-1],cuts:[]};
      if(!(o.len>0))return null;
      function endpoint(s,id){o.cuts.push({s:s,id:id});}
      endpoint(0,key+':a');endpoint(o.len,key+':b');lines.push(o);return o;
    }
    function project(o,p){
      var q=xy(p),best={d:Infinity,s:0};
      for(var i=1;i<o.pts.length;i++){
        var a=o.pts[i-1],b=o.pts[i],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
        var t=den?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/den)):0;
        var x=a.x+dx*t,y=a.y+dy*t,d=Math.hypot(q.x-x,q.y-y);
        if(d<best.d)best={d:d,s:o.cum[i-1]+gap(a,{x:x,y:y}),p:{x:x,y:y}};
      }
      return best;
    }
    function addCut(o,s,id){o.cuts.push({s:Math.max(0,Math.min(o.len,s)),id:id});}
    function at(o,s){
      s=Math.max(0,Math.min(o.len,s));
      for(var i=1;i<o.cum.length;i++)if(s<=o.cum[i]){
        var span=o.cum[i]-o.cum[i-1],t=span?(s-o.cum[i-1])/span:0,a=o.raw[i-1],b=o.raw[i];
        return{lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
      }
      return o.raw[o.raw.length-1];
    }
    function slice(o,a,b){
      var rev=b<a;if(rev){var tmp=a;a=b;b=tmp;}
      var out=[at(o,a)];
      for(var i=1;i<o.cum.length-1;i++)if(o.cum[i]>a+.01&&o.cum[i]<b-.01)out.push(o.raw[i]);
      out.push(at(o,b));if(rev)out.reverse();return out;
    }
    (d.trunkLinesLL||[]).forEach(function(l,i){var o=makeLine('trunk:'+i,'trunk',i,l);if(o)byTrunk.push(o);});
    if(!byTrunk.length&&d.segLL){var seg=makeLine('segment:0','trunk',0,d.segLL);if(seg)byTrunk.push(seg);}
    (d.mainsLL||[]).forEach(function(l,i){var o=makeLine('main:'+i,'main',i,l);if(o)byMain[i]=o;});
    var branchLines={};
    activeZones.forEach(function(i){var o=makeLine('branch:'+i,'branch',i,d.branchLL&&d.branchLL[i]);if(o)branchLines[i]=o;});
    if(!byTrunk.length){lastDiag.blocked='没有可用的总干线（手绘总管为空）';return null;}

    /* 完整水路校验只关心管网拓扑。水源是独立地图点，不作为连通根或播放前置条件；
       从第一条总管的首端建立稳定图根，再要求所有分区支管两端都能沿管网到达。 */
    var rootLine=byTrunk[0];
    var rootId='flow:network-root';
    addCut(rootLine,0,rootId);

    /* Join trunk polylines at actual touching endpoints. */
    for(var ti=0;ti<byTrunk.length;ti++)for(var tj=ti+1;tj<byTrunk.length;tj++){
      var ta=byTrunk[ti],tb=byTrunk[tj],endsA=[0,ta.len],endsB=[0,tb.len];
      endsA.forEach(function(sa,ai){var p=at(ta,sa),q=project(tb,p);if(q.d<=LINK_EPS_M){var id='trunk-join:'+ti+':'+tj+':'+ai;addCut(ta,sa,id);addCut(tb,q.s,id);}});
      endsB.forEach(function(sb,bi){var p=at(tb,sb),q=project(ta,p);if(q.d<=LINK_EPS_M){var id='trunk-join:'+ti+':'+tj+':b'+bi;addCut(tb,sb,id);addCut(ta,q.s,id);}});
    }

    /* A saved coupler is the authoritative trunk-to-main junction. */
    var seenNodes={};
    /* [v1084d] 宽松兜底容差：严格 0.5m/1.5m 不中时，3m 内仍认接通并**记账**
       （couplersLoose），提示里会写明「其中 N 个为宽松吸附」。
       为什么需要：总管存的是实体坐标、节点标记画在显示坐标（±gap/2≈0.96m，用户实测
       「阀离支管 0.96m」就是这半个间距），点选落点与实体坐标天然差约 1m；再加上地块
       尺度是几十米、两根主管相距 30m 以上，3m 不会把相邻管错连。宁可明确地宽一点，
       也不要让「明明贴着」被判成没接。 */
    lastDiag.nodeProbe = { n: 0, minMainD: Infinity, minTrunkD: Infinity };
    (d.nodesLL||[]).forEach(function(n){
      if(!n||n.kind!=='main'||!n.ll||!(n.mi>=0)||!byMain[n.mi])return;
      var sig=n.mi+':'+n.ll.lat.toFixed(6)+':'+n.ll.lng.toFixed(6);if(seenNodes[sig])return;seenNodes[sig]=true;
      var mp=project(byMain[n.mi],n.ll);
      /* 最近总管的垂距（不论是否通过），专供诊断：这两个数就是"为什么没接上"的答案。 */
      var anyBest=null;
      byTrunk.forEach(function(o){
        if(o.kind!=='trunk')return;
        var p=project(o,n.ll);if(!anyBest||p.d<anyBest.p.d)anyBest={o:o,p:p};
      });
      var pr=lastDiag.nodeProbe;
      if(mp.d<pr.minMainD)pr.minMainD=mp.d;
      if(anyBest&&anyBest.p.d<pr.minTrunkD)pr.minTrunkD=anyBest.p.d;
      pr.n++;
      /* 严格：节点在本区主管上(≤0.5m) + 总管贴到节点(≤1.5m) */
      if(mp.d<=LINK_EPS_M){
        var best=null;
        byTrunk.forEach(function(o){
          if(o.kind!=='trunk')return;
          var p=project(o,n.ll);if(p.d<=NODE_ATTACH_EPS_M&&(!best||p.d<best.p.d))best={o:o,p:p};
        });
        if(best){
          var id0='coupler:'+sig;addCut(best.o,best.p.s,id0);addCut(byMain[n.mi],mp.s,id0);
          lastDiag.couplers=(lastDiag.couplers||0)+1;return;
        }
      }
      /* 宽松：两者都在 3m 内 —— 仍然接通，但要记账，别让它偷偷变成"默认行为" */
      if(mp.d<=LOOSE_ATTACH_M&&anyBest&&anyBest.p.d<=LOOSE_ATTACH_M){
        var id1='coupler:'+sig;addCut(anyBest.o,anyBest.p.s,id1);addCut(byMain[n.mi],mp.s,id1);
        lastDiag.couplers=(lastDiag.couplers||0)+1;
        lastDiag.couplersLoose=(lastDiag.couplersLoose||0)+1;
      }
    });
    lastDiag.nodeTotal=(d.nodesLL||[]).filter(function(n){return n&&n.kind==='main'&&n.ll;}).length;

    /* Main pipes are continuous only where a main endpoint meets another main
       line. This links zone 1 -> 2 -> 3 but does not bridge separate rows. */
    for(var mi=0;mi<d.mainsLL.length;mi++)for(var mj=mi+1;mj<d.mainsLL.length;mj++){
      var a=byMain[mi],b=byMain[mj];if(!a||!b)continue;
      [[0,a.raw[0]],[a.len,a.raw[a.raw.length-1]]].forEach(function(e,ei){var p=project(b,e[1]);if(p.d<=LINK_EPS_M){var id='main-join:'+mi+':'+mj+':a'+ei;addCut(a,e[0],id);addCut(b,p.s,id);}});
      [[0,b.raw[0]],[b.len,b.raw[b.raw.length-1]]].forEach(function(e,ei){var p=project(a,e[1]);if(p.d<=LINK_EPS_M){var id='main-join:'+mi+':'+mj+':b'+ei;addCut(b,e[0],id);addCut(a,p.s,id);}});
    }

    /* [v1084g 2026-11-14 用户口径「必须经过阀门」] 阀门是该区支管的**唯一进水口**：
       某区阀门（或其锚点）确实落在本区主管上时，禁止「支管端点绕过阀门直连本区主管」。
       以前不禁止，最短路会从主管直接切进支管端点 —— 动画看起来"没经过阀门"；
       更糟的是「到左端」「到右端」两条路线因此互为旁路，被判 redundant 后只剩一条
       ⇒ 支管只亮一半（用户实测「支管要全部水流」正是这条）。
       v1084h 修正：当初只堵「本区支管 ↔ 本区主管」这一对是想保住 v1073 的跨区借道，
       但实测证明**跨区那几个洞才是真凶**（见下方 v1084h 注释）。 */
    var valveOnOwnMain={};
    (d.valves||[]).forEach(function(v){
      if(!v||!(v.mi>=0)||!v.ll)return;
      var mo=byMain[v.mi];if(!mo)return;
      var vpt=v.anchorLL||v.ll;
      if(project(mo,vpt).d<=NODE_ATTACH_EPS_M)valveOnOwnMain[v.mi]=1;
    });

    /* [v1073] 支管端点直连：带状/列状布局里，相邻行的支管首尾相接、支管端点顶到
       下一行主管——「主管↔主管端点直连」不覆盖这类跨行连接，整图会断成孤岛
       （「尚未形成覆盖所有分区支管两端的连续管路」的真凶之一）。补：每个支管
       两端点投影到**其它**线体（主管/支管/总管）≤LINK_EPS_M 即在垂足打通。 */
    /* [v1084h 2026-11-14 用户实测 7 区「水没走 7 区那段主管就进支管了」]
       支管在**实体世界与主管同线**（v1079 主/支管同列定线，只在显示副本里左右错开
       0.96m），所以支管端点与上游 `main:N-1` 的端点距离**恰好 0** —— v1073 的
       「端点打洞」把支管顶端直接焊死在上一区主管的末端。最短路于是：
       沿主管走到本区顶部 → 0 米跳进支管 → 本区那段主管（顶部→阀门）一段都不走，
       画面上就是「没经过阀门」。v1084g 只堵了「本区支管↔本区主管」这一对，
       隔壁区主管、上下邻区支管这几个洞照样通，所以 7 区/4 区/…还是错。
       改为：**本区阀门落在自己主管上 ⇒ 本区支管两端一律不打洞**，阀门是唯一进水口。
       不怕断岛：这类支管必经阀门进水，阀门本身接在本区主管上；真正没有阀门的支管
       在上面的阀门分支里已按 reason 记账跳过，它们的跨区打洞规则原样保留。
       反方向也要挡：别的支管不许往「有阀门的支管」上打洞（否则洞又从另一头打进来）。 */
    Object.keys(branchLines).forEach(function(bk){
      var b=branchLines[bk];
      if(valveOnOwnMain[bk])return;
      [[0,b.raw[0]],[b.len,b.raw[b.raw.length-1]]].forEach(function(e,ei){
        lines.forEach(function(o){
          if(o.key===b.key||o.kind==='trunk')return;
          if(o.kind==='branch'&&valveOnOwnMain[o.index])return;
          var p=project(o,e[1]);
          if(p.d<=LINK_EPS_M){var id='branch-end:'+bk+':'+ei+':'+o.key;addCut(b,e[0],id);addCut(o,p.s,id);}
        });
      });
    });

    /* ══ [v1084 阀门/三通按归属入图] ══════════════════════════════════════
       三级页插入的配件带「所属管线 + 桩号」，是精确归属，不需要几何容差去猜。
       以前它们根本不进图：阀门只当"分水节点"、三通/手工阀门完全不参与，
       于是「闸门层级」在地图端不存在，用户插了阀门却不影响演示，只能靠 0.5m
       容差把线接上——角度一变就断，且看不出是哪一级闸门的问题。
       现在：按 pipeKind+mi 找到那根线，用 ll 投影定桩号（atM 兜底），在该处切一刀
       成为图节点。★ 与已有切口 ≤FIT_DEDUPE_M 就跳过：多切一刀只会把一段管子劈成
       0.1m 碎片，让水力切片身份 (key,a,b) 漂移（v1025/v1023 踩过这个坑）。 */
    var diag=lastDiag;
    (d.fittings||[]).forEach(function(f){
      var o=(f.pipeKind==='main')?byMain[f.mi]:branchLines[f.mi];
      if(!o){diag.fittings.noPipe++;return;}
      var p=project(o,f.ll),s=null;
      if(p.d<=NODE_ATTACH_EPS_M)s=p.s;
      else if(isFinite(f.atM))s=Math.max(0,Math.min(o.len,f.atM));
      if(s==null){diag.fittings.offLine++;return;}
      var dup=o.cuts.some(function(c){return Math.abs(c.s-s)<=FIT_DEDUPE_M;});
      if(dup){diag.fittings.dup++;return;}
      addCut(o,s,'fit:'+(f.id||(f.pipeKind+':'+f.mi+':'+f.atM)));
      diag.fittings.placed++;
    });

    /* Treat each valve as the branch flow splitter. Generated施工图 stores the
       main-side takeoff in valve.ax/ay and the valve center in x/y; the visible
       connector between them is part of the designed route even when the main
       and branch centerlines are parallel and separated. */
    var targets=[],feeds=[],zoneBranch={};
    activeZones.forEach(function(i){
      var main=byMain[i],branch=branchLines[i];
      /* [v1084 诊断] 以前这几条分支都是静默 return：某个分区少一根管、少一个阀门、
         阀门锚点没落在主管上，图里就少一个目标点，最后只报「未覆盖所有分区支管」——
         用户面对 36 个区根本查不出是哪个区、缺什么。现在逐条记原因。 */
      if(!main){diag.zones.push({zi:i,reason:'没有主管管段'});return;}
      if(!branch){diag.zones.push({zi:i,reason:'没有支管管段'});return;}
      var valve=null;(d.valves||[]).some(function(v){if(v&&v.mi===i&&v.ll){valve=v;return true;}return false;});
      if(!valve){diag.zones.push({zi:i,reason:'没有分区阀门（阀门数组里缺 mi='+i+'）'});return;}
      var valveProj=project(branch,valve.ll);
      var valvePoint=at(branch,valveProj.s),mainJoin=valve.anchorLL||valvePoint;
      var mainProj=project(main,mainJoin);
      /* [v1084c 观测量] 首区的一组真实数字：支管多长、阀门落在支管什么桩号、
         阀到主管多远、支管被切了几刀。这四个数直接决定「能不能切出两段支管」，
         以前全看不见 —— 只能靠猜。 */
      if(!diag.debug){
        diag.debug={zi:i,mainLen:+main.len.toFixed(1),branchLen:+branch.len.toFixed(1),
          valveS:+valveProj.s.toFixed(2),valveD:+valveProj.d.toFixed(2),
          mainDist:+mainProj.d.toFixed(2),branchCuts:branch.cuts.length,
          hasValveAnchor:!!valve.anchorLL};
      }
      /* Legacy valve records without an anchor retain the prior direct-feed
         rule. With an anchor, verify that anchor lands on this zone's main;
         the drawn anchor→valve connector is the physical bridge to the branch. */
      if(mainProj.d<=LINK_EPS_M){
        var feedMainId='branch-feed-main:'+i,feedValveId='branch-valve:'+i;
        addCut(main,mainProj.s,feedMainId);addCut(branch,valveProj.s,feedValveId);
        var startId='branch-start:'+i,endId='branch-end:'+i;
        addCut(branch,0,startId);addCut(branch,branch.len,endId);
        var feedPoints=[at(main,mainProj.s)];
        if(valve.anchorLL)feedPoints.push(valve.anchorLL);
        feedPoints.push(valve.ll);
        if(gap(xy(valve.ll),xy(valvePoint))>.05)feedPoints.push(valvePoint);
        feeds.push({zi:i,from:feedMainId,to:feedValveId,points:feedPoints});
        targets.push({zi:i,id:startId},{zi:i,id:endId});
        /* [v1084g 用户口径「支管要全部水流」] 支管整段（阀门两侧各一段）一次给全：
           以前渲染只画「最短路走到的那一个端点」，另一侧靠另一条路线补；一旦那条路线
           被判冗余过滤掉，支管就只亮一半。这里与路线数量无关地给出两段，
           阀门位置精确来自 valveProj.s（就是切在支管上的那一刀）。 */
        try{
          var vPtOnBranch=at(branch,valveProj.s);
          zoneBranch[i]=[
            {key:'branch:'+i,points:[at(branch,0),vPtOnBranch]},
            {key:'branch:'+i,points:[vPtOnBranch,at(branch,branch.len)]}
          ];
        }catch(eZB){}
        return;
      }
      diag.zones.push({zi:i,reason:'阀门/锚点不在本区主管上（垂距 '+mainProj.d.toFixed(2)+'m > 容差 '+LINK_EPS_M+'m）'});
    });

    var graph={},linkGeometry={};
    function node(id){if(!graph[id])graph[id]=[];}
    var nextLinkId=0;
    function link(a,b,weight,edge){
      node(a);node(b);
      var id=nextLinkId++;linkGeometry[id]=edge;
      graph[a].push({to:b,weight:weight,edge:edge,linkId:id});
      graph[b].push({to:a,weight:weight,edge:edge,linkId:id});
    }
    lines.forEach(function(o){
      var cuts=o.cuts.slice().sort(function(a,b){return a.s-b.s;});
      var groups=[];
      cuts.forEach(function(c){var last=groups[groups.length-1];if(last&&Math.abs(last.s-c.s)<.05)last.ids.push(c.id);else groups.push({s:c.s,ids:[c.id]});});
      groups.forEach(function(gr){gr.ids.forEach(node);for(var i=1;i<gr.ids.length;i++)link(gr.ids[0],gr.ids[i],0,null);});
      for(var i=1;i<groups.length;i++){
        var ga=groups[i-1],gb=groups[i],pts=slice(o,ga.s,gb.s),weight=Math.max(.01,gb.s-ga.s);
        /* [v1025] 相邻切组间只建「组代表」一条边：同组多 id（同一弧长位置 ±0.05 内出现
           两个以上切口——三条主管 T 接、阀切口与接点重合等）时，旧写法按 id 笛卡尔积建
           多条同几何边，不同分区的 Dijkstra 路径可能走同一物理切片的不同 (a,b) 边对象；
           扬程链 edgeZones 以 (key,a,b) 为切片身份 ⇒ 同一段被拆成多份、downZi 各拿一部分，
           过境段流量被低估（v1023 重算链的输入在源头就分裂了）。组内 0 权边（上一行）
           已保证组内任意 id 互相连通，只连代表 id 不改变最短路权重与路径几何。 */
        link(ga.ids[0],gb.ids[0],weight,{key:o.key,kind:o.kind,points:pts,a:ga.ids[0],b:gb.ids[0]});
      }
    });
    feeds.forEach(function(f){
      var dx=xy(f.points[1]).x-xy(f.points[0]).x,dy=xy(f.points[1]).y-xy(f.points[0]).y;
      link(f.from,f.to,Math.max(.01,Math.sqrt(dx*dx+dy*dy)),{
        key:'branch-feed:'+f.zi,kind:'branch',points:f.points,a:f.from,b:f.to
      });
    });
    if(!graph[rootId]){lastDiag.blocked='水路根节点没有进入管网图（总管未与任何主管相接）';return null;}
    /* [v1084c] 图体检：节点数 / 根节点度数 / 目标节点是否真的在图上。
       「水路走不到」有三种完全不同的原因（根是孤岛、目标没进图、中间断），这三个数能分开。 */
    diag.graphNodes=Object.keys(graph).length;
    diag.rootDeg=(graph[rootId]||[]).length;
    diag.targetsInGraph=0;
    targets.forEach(function(t){if(graph[t.id])diag.targetsInGraph++;});

    /* Dijkstra from the network root. The reconstructed edges retain their
       direction, which makes the moving dash travel toward the selected zone. */
    var distMap={},prev={},open={};distMap[rootId]=0;open[rootId]=true;
    while(Object.keys(open).length){
      var u=null,bestD=Infinity;Object.keys(open).forEach(function(k){if(distMap[k]<bestD){u=k;bestD=distMap[k];}});
      if(u==null)break;delete open[u];
      (graph[u]||[]).forEach(function(e){var nd=bestD+e.weight;if(nd<(distMap[e.to]==null?Infinity:distMap[e.to])){distMap[e.to]=nd;prev[e.to]={from:u,edge:e.edge,linkId:e.linkId};open[e.to]=true;}});
    }
    function reachableWithout(target,bannedLinkId){
      var seen={},queue=[rootId],head=0;seen[rootId]=true;
      while(head<queue.length){
        var u=queue[head++];if(u===target)return true;
        (graph[u]||[]).forEach(function(e){if(e.linkId!==bannedLinkId&&!seen[e.to]){seen[e.to]=true;queue.push(e.to);}});
      }
      return false;
    }
    var routes=[];
    targets.forEach(function(t){
      /* [v1084 诊断] 目标点没跑到 ⇒ 沿图断开。以前直接 return，等于把「哪一区断了」
         这条唯一有用的信息扔掉，只留一句笼统提示。 */
      if(distMap[t.id]==null){diag.missing++;diag.zones.push({zi:t.zi,reason:'水路走不到支管端（图在总管/主管/阀门处断开）'});return;}
      var path=[],pathLinkIds=[],cur=t.id,guard=0;
      while(cur!==rootId&&prev[cur]&&guard++<5000){var step=prev[cur];pathLinkIds.push(step.linkId);if(step.edge)path.push({edge:step.edge,forward:step.from===step.edge.a});cur=step.from;}
      /* [v1084c] 这里原本是静默 return —— 第 5 个「不说话就放弃」的口子。
         distMap 有值但 prev 链回不到根（权重 NaN/断链）时，目标被无声丢掉，
         整图只报「未覆盖」，跟没诊断一样。改为记账。 */
      if(cur!==rootId){diag.missing++;diag.zones.push({zi:t.zi,reason:'路径回溯不到水源根（图权重异常或断链）'});return;}
      /* [v1073] 冗余不再剔除、只打标：v1023 口径「任一管段被移除后目标仍可达 ⇒ 存在
         另一条物理路线」在网格布局里会双杀——同一主管既有施工节点又有贴近直连、
         上下行支管链互相备份，都会让同一目标存在两条可达路径；两条路线互判冗余
         全部剔除 ⇒ 该区被判「未覆盖」⇒ 整图门禁拦截（真实地块「链路明明通了却拦」
         的主因之一）。改为：冗余路线照常入列打 redundant 标——覆盖判定（start()
         的 wholeFieldClosed）数的是「可达」；动画路线过滤 redundant。 */
      var redundant=false;
      for(var pi=0;pi<pathLinkIds.length;pi++){
        var pathLinkId=pathLinkIds[pi];
        if(linkGeometry[pathLinkId]&&reachableWithout(t.id,pathLinkId)){redundant=true;break;}
      }
      path.reverse();
      var route={zi:t.zi,trunk:[],main:[],branch:[],redundant:redundant};
      path.forEach(function(s){
        var pts=s.forward?s.edge.points:s.edge.points.slice().reverse();
        /* [v1020 待办③] 切片补 a/b（线体弧长端点）：同一物理管段的 edge 对象被各分区
           路径共享，(key,a,b) 即切片身份 —— 供扬程链按「下游覆盖区数」组合过境段流量。 */
        route[s.edge.kind].push({key:s.edge.key,points:pts,a:s.edge.a,b:s.edge.b});
      });
      routes.push(route);
    });
    /* [v1084g] 每区的「支管整段」挂到该区所有路线上，渲染直接消费（与路线条数无关）。 */
    routes.forEach(function(r){if(r&&zoneBranch[r.zi])r.zoneBranch=zoneBranch[r.zi];});
    /* [v1084] 把本轮建图的诊断交出去（同一分区多条原因去重，最多留 3 条摘要）。 */
    try{
      var seen={},uniq=[];
      diag.zones.forEach(function(z){var k=z.zi+'|'+z.reason;if(seen[k])return;seen[k]=1;uniq.push(z);});
      diag.zones=uniq;
      /* [v1084c] 观测量：成路条数 + 首条路线里到底有没有真实支管边（key 以 branch: 开头）。
         覆盖判定只认这种边，所以「有没有」比「有几条路」更能说明问题。 */
      diag.routes=routes.length;
      diag.routeKeys=(routes[0]&&routes[0].branch)?routes[0].branch.map(function(x){return x.key;}).slice(0,3):[];
      diag.targets=targets.length;diag.feeds=feeds.length;
      lastDiag=diag;
    }catch(eDiag){lastDiag=null;}
    return routes.length?routes:null;
  }

  function render(g) {
    var ly = ensureLayer(); if (!ly) return;
    ly.clearLayers();
    active = g;
    /* [perf-20261106] 复用 start() 已收集好的同一份快照，避免一次切组 collect() 两次 */
    var d = renderSnapshotD || collect();
    renderSnapshotD = null;
    if (!d) { stop(); return; }
    updateGroupInfo(d,g);
    /* 先压暗非活动区，再用青蓝蒙版突出当前组；管网线随后绘制，保持可读。 */
    (d.zonePolygons||[]).forEach(function(z){
      var on=groupOf(z.zi,d.manual,d.nPer)===g;
      ly.addLayer(window.L.polygon(z.ll.map(function(p){return[p.lat,p.lng];}),{
        pane:FLOW_PANE,color:on?'#fff7ed':'#475569',weight:on?2.5:1,opacity:on?1:0.4,
        fillColor:on?'#fb923c':'#0f172a',fillOpacity:on?0.5:0.14,
        dashArray:on?'7 4':null,interactive:false,
        className:on?'mapflow-zone-active':'mapflow-zone-dim'
      }));
    });
    /* 底态：全部主管/支管淡化灰（[v1082] 显示副本，与可见线体一致） */
    (d.displayMainsLL||d.mainsLL).forEach(function (l) { if (l) ly.addLayer(poly(l, '#cbd5e1', 2, false)); });
    (d.displayBranchLL||d.branchLL).forEach(function (l) { if (l) ly.addLayer(poly(l, '#e2e8f0', 1.5, false)); });
    /* 全部总管与分段总管仅作淡色底图；实际流动路线在后面按管网根节点到当前分区裁剪，
       不再把 N01 之后通往 N02 的下游干线误画成每一组都在流动。 */
    (d.trunkLinesLL || (d.trunkLL && d.trunkLL.length >= 2 ? [d.trunkLL] : [])).forEach(function(line){
      if(!line||line.length<2)return;
      ly.addLayer(poly(line, '#cbd5e1', 2, false));
    });
    /* [v1027 用户拍板B] 段总管反投底图不再常态绘制——与设计页 v1017b「图面不画」口径
       对齐（用户此前把白线误认成多余总管，删总管重画它也不消失才定位到这是 segTrunk
       反投）。仅当**无手绘总管**（segLL 兼任干线参与寻路，v1019 口径）时保留底图，
       否则该场景下「水源→主管」的干线结构完全不可见。寻路/校验仍用 d.segLL（本函数
       上游 531 行 makeLine('segment:0') 与 412/432 行校验签名不动），演示路由的
       segment:0 切片照常按路由色绘制。段总管存在性待办登记 AGENT_HANDOFF.md。 */
    if (d.segLL && !(d.trunkLinesLL && d.trunkLinesLL.length)) {
      ly.addLayer(poly(d.segLL, '#cbd5e1', 2, false));
    }
    /* 活动区水路：水源→已吸附节点→相接主管段→目标分区阀门支管。 */
    var routes=renderSnapshotRoutes||buildFlowRoutes(d,g),drawn={};
    renderSnapshotRoutes=null;
    if(routes)routes.forEach(function(route){
      route.trunk.concat(route.main).concat(route.branch).concat(route.zoneBranch||[]).forEach(function(seg){
        if(!seg.points||seg.points.length<2)return;
        var key=seg.key+':'+seg.points[0].lat.toFixed(6)+':'+seg.points[0].lng.toFixed(6)+':'+seg.points[seg.points.length-1].lat.toFixed(6)+':'+seg.points[seg.points.length-1].lng.toFixed(6);
        if(drawn[key])return;drawn[key]=true;
        /* [v1082] 地图线体画显示副本，描边跟着显示副本走，才不会浮在可见管线旁边。 */
        var shownPoints=seg.points,segKey=String(seg.key||'');
        var match=/^(main|branch):(\d+)$/.exec(segKey);
        var feedMatch=/^branch-feed:(\d+)$/.exec(segKey);
        if(match){
          var main=match[1]==='main',index=Number(match[2]);
          var physical=(main?d.mainsLL:d.branchLL)[index],shown=(main?d.displayMainsLL:d.displayBranchLL)[index];
          if(physical&&shown&&physical.length&&shown.length){
            /* ppGetPipeDisplayGeometry 只平移整条折线，点序不变；用首点位移仅改绘制坐标。 */
            var dLat=shown[0].lat-physical[0].lat,dLng=shown[0].lng-physical[0].lng;
            shownPoints=seg.points.map(function(p){return{lat:p.lat+dLat,lng:p.lng+dLng};});
          }
        } else if(feedMatch){
          /* [v1084f 用户实测 2026-11-14「动画位置跟管线不重叠」] 只换算 main:N/branch:N 不够：
             路线里还有两类段照样浮着，整段偏半个显示间距（≈0.96m）。
             branch-feed:N 是「主管接点 → 阀门」的分水连接段，起点属于主管世界、终点属于
             支管世界，两头本来就不在同一个偏移里 ⇒ 按点序把两个位移线性混合。
             该段通常短于 1m，插值误差可忽略；比"整段用一个位移"准得多。 */
          var fzi=Number(feedMatch[1]);
          var mp=(d.mainsLL||[])[fzi],mShow=(d.displayMainsLL||[])[fzi];
          var bp=(d.branchLL||[])[fzi],bShow=(d.displayBranchLL||[])[fzi];
          var mD=(mp&&mShow&&mp.length&&mShow.length)?{lat:mShow[0].lat-mp[0].lat,lng:mShow[0].lng-mp[0].lng}:{lat:0,lng:0};
          var bD=(bp&&bShow&&bp.length&&bShow.length)?{lat:bShow[0].lat-bp[0].lat,lng:bShow[0].lng-bp[0].lng}:{lat:0,lng:0};
          var nPt=seg.points.length;
          shownPoints=seg.points.map(function(p,pi){
            var t=nPt>1?pi/(nPt-1):0;
            return {lat:p.lat+mD.lat*(1-t)+bD.lat*t, lng:p.lng+mD.lng*(1-t)+bD.lng*t};
          });
        } else if(/^(trunk|segment):/.test(segKey)){
          /* trunk:N（手绘总管）/ segment:0（段总管反投线）存的是**实体坐标**，而地图渲染
             总管时逐点走 RyMapPointProjector.toShown（online-map: toDisplay(toShownPoint(q))）。
             这里必须用同一个函数，否则「总管上的水流」会整体偏离地图总管半个间距。
             取不到投影层（老页面/未挂载）⇒ 原样返回，宁可不偏移也不乱偏。 */
          shownPoints=seg.points.map(shiftToShown);
        }
        ly.addLayer(poly(shownPoints,seg.key.indexOf('branch:')===0?'#16a34a':'#185FA5',seg.key.indexOf('branch:')===0?3:5,true));
      });
    });
    /* [v916] 接驳节点标记（常驻）：全部节点小橙点——用户能看见「水路入口在哪」；
       失配节点（collect 已跳过 x/y null）不出现在图上。 */
    (d.nodesLL || []).forEach(function (n) {
      if (!n || !n.ll) return;
      var shown=n.displayLL||n.ll;   /* [v1082] 显示位=可见管线上 */
      ly.addLayer(window.L.circleMarker([shown.lat, shown.lng], {
        radius: 4, color: '#b45309', weight: 2,
        fillColor: '#f59e0b', fillOpacity: 1, pane:FLOW_PANE, interactive: false
      }));
    });
    /* [v916] 活动组水路入口：该组节点位置画双环大标记（外环描边+白芯橙心）——
       「水从节点进入主管」的精确入口（步骤 4 验收：入口坐标=节点坐标）。 */
    entrancesOf(d, g).forEach(function (n) {
      var shown=n.displayLL||n.ll;   /* [v1082] 入口画在可见管线上 */
      ly.addLayer(window.L.circleMarker([shown.lat, shown.lng], {
        radius: 9, color: '#b45309', weight: 2.5, fillOpacity: 0, interactive: false
      }));
      ly.addLayer(window.L.circleMarker([shown.lat, shown.lng], {
        radius: 5, color: '#ffffff', weight: 2,
        fillColor: '#f59e0b', fillOpacity: 1, interactive: false
      }));
    });
    d.valves.forEach(function (v) {
      var on = (v.mi >= 0) && (groupOf(v.mi, d.manual, d.nPer) === g);
      var cls=on?'is-open':'is-closed',iconHtml='<span class="mapflow-valve '+cls+'" aria-hidden="true"><svg viewBox="0 0 24 24"><circle class="mapflow-valve-ring" cx="12" cy="12" r="10"/><path class="mapflow-valve-pipe" d="M1 12h6m10 0h6"/><path class="mapflow-valve-body" d="M7 7l5 5-5 5zm10 0l-5 5 5 5z"/><g class="mapflow-valve-handle"><path d="M12 7V1.5M8 1.5h8"/></g></svg></span>';
      /* [v1084f] 阀门挂在支管上 ⇒ 画在该支管的显示副本上（以前直接用实体坐标，
         整排阀门比可见支管偏半个间距，用户看到的就是"图标没落在管线上"）。 */
      var vll=shiftToBranchDisplay(d,v.mi,v.ll)||v.ll;
      ly.addLayer(window.L.marker([vll.lat,vll.lng],{
        icon:window.L.divIcon({className:'mapflow-valve-icon',html:iconHtml,iconSize:[24,24],iconAnchor:[12,12]}),
        keyboard:false,interactive:false,zIndexOffset:1200
      }));
    });
    if(d.sourceLL){
      /* [v1084f] 水源/蓄水池：贴近管线时同样走显示位（离管线 >reach 的空中点原样） */
      var sll=shiftToShown(d.sourceLL);
      ly.addLayer(window.L.marker([sll.lat,sll.lng],{
        icon:window.L.divIcon({className:'ry-reservoir-icon-wrap mapflow-reservoir-icon',iconSize:[54,48],iconAnchor:[27,42],
          html:'<span class="ry-reservoir-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5C9.4 6.1 5.3 10.2 5.3 14.4a6.7 6.7 0 0 0 13.4 0C18.7 10.2 14.6 6.1 12 2.5Z"/></svg></span><span class="ry-reservoir-label">蓄水池</span>'}),
        interactive:false,zIndexOffset:1500
      }));
    }
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    playing = false;
    active = null;
    renderSnapshotRoutes = null;
    renderSnapshotD = null;
    if (layer) layer.clearLayers();
    hideGroupInfo();
    syncChipsState();
  }
  function playToggle() {
    var d = collect();
    var M = d ? d.gCount : 0;
    if (M <= 0) return;
    if (playing) {
      clearInterval(timer); timer = null; playing = false;
    } else {
      var g0 = (active == null || active < 0 || active >= M) ? 0 : active;
      if(!start(g0, true)){syncChipsState();return;}
      timer = setInterval(function () {
        /* [perf-20261106] 原实现先 collect() 取组数、start() 内又 collect() 一次；
           组数改取最近一次 start 的快照（start 每次都会收最新数据），省掉重复收集。 */
        var M2 = lastD ? lastD.gCount : 0;
        if (M2 <= 0) { stop(); return; }
        start(((active == null ? 0 : active) + 1) % M2, true);
      }, INTERVAL_MS);
      playing = true;
    }
    syncChipsState();
  }
  /* start：校验（总管↔主管连通）通过才渲染；失败 tip 报错（用户明确要求） */
  function start(g, silentChips) {
    var d = collect();
    lastD = d;   /* 自动播放定时器取组数用；start 每次都收集最新数据，故不另收一次 */
    if (!d) { stop(); if (ctx.tip) ctx.tip(collectBlockReason||'轮灌演示需要先在「分区与管路」生成管线图，且与当前地块一致。'); return false; }
    /* [perf-20261106] 数据对象被替换（换地块 / 恢复工程 / 重生成管线）⇒ 强制失效；
       同一对象被原地改写（拖动分区、编辑节点或总管）⇒ 由坐标签名兜住。 */
    var v = ensureValidation(d);         /* 与空闲预热共用同一缓存入口 */
    if (!v.ok) {
      if(layer)layer.clearLayers();
      active = null;
      hideGroupInfo();
      if (timer) { clearInterval(timer); timer = null; }
      playing = false;
      syncChipsState();
      if (ctx.tip) {
        if (v.code === 'no-trunk') ctx.tip('还没有手动绘制的总管：请先在在线地图绘制总管（并打开捕捉吸到「驳接点」），再演示水流。');
        else if (v.code === 'no-data') ctx.tip('图面上没有分区主管，无法演示水流。');
        else if (v.code === 'no-node') ctx.tip('已发布管网没有主管施工节点。请在「分区与管路」主管上放置节点并重新生成施工图。');
        else if (v.code === 'node-not-connected') ctx.tip('手绘总管还没接到已发布主管施工节点上：请把总管画到紫色主管节点处（线从节点 ' + NODE_ATTACH_EPS_M + ' m 内经过就算接通，不必刚好落在折点上）。');
        else if (v.code === 'partial') {
          var gs = (v.brokenGroups || []).map(function (g) { return g + 1; }).join('、');
          /* [v919] 文案去误导（旧「最近 0.0 m」是已接主管的距离）：改报已通/未通统计 +
             两条可操作路径；并把未接通的主管线在地图上画红（redMains），用户直接看到补哪里。 */
          var done = (d.gCount || 0) - (v.brokenGroups || []).length;
          var redMains = Array.isArray(v.brokenMains) ? v.brokenMains : [];
          var ly2 = ensureLayer(); if (ly2) ly2.clearLayers();
          (redMains || []).forEach(function (mi) {
            var line = (d.displayMainsLL&&d.displayMainsLL[mi])||(d.mainsLL&&d.mainsLL[mi]);   /* [v1082] 显示副本 */
            if (line && line.length >= 2) {
              ly2.addLayer(window.L.polyline(line.map(function (p) { return [p.lat, p.lng]; }),
                { color: '#dc2626', weight: 6, opacity: 0.85, interactive: false, className: 'mapflow-anim' }));
            }
          });
          ctx.tip('轮灌组 ' + gs + ' 的主管还没接到总管上（已通 ' + done + '/' + (d.gCount || '?') +
            ' 组，容差 ' + TOL_M + ' m），暂无法演示水流。图中红色主管就是还没接通的——延伸总管，让每根红色主管贴到总管 ' +
            TOL_M + ' m 内（在它附近点一个拐点，或吸它的施工节点）；也可在「分区与管路」为每根主管放施工节点并重新生成管线图后，回地图吸附。');
        }
        else ctx.tip('手动绘制的总管与分区主管没有连接（最近 ' + (v.minM == null ? '?' : v.minM.toFixed(1)) + ' m > 容差 ' + TOL_M + ' m），暂无法演示水流。请把总管画到「驳接点」或主管端点附近。');
      }
      return false;
    }
    var allRoutes=buildFlowRoutes(d,0,true),routes=[],expected={},activeCount=0,groupRoutes=[];
    var diagAll=lastDiag;   /* [v1084] 全图那一趟的诊断，是"为什么没连上"的权威版本 */
    /* [v1084d 第二个根因] 覆盖判定原来要求「路线里必须有一条 key 以 branch: 开头的边」。
       这只在「主管与支管是两条分开的线」时成立；而 v1079 起主管/支管是**同列定线**
       （实体中心线重合，只有显示副本平移 ±gap/2≈0.96m）。两线重合时最短路会沿主管
       直接走到支管端点（拓扑完全等价），路线里一条 branch: 边都没有 ⇒ 覆盖数恒为 0
       ⇒ 12 个区全报「支管两端都没进入水路」，而实际上 24 条路线全都建出来了。
       用户实测数据完全对上：`成路 24 条/目标 24`，`首条路线支管边：没有 branch: 开头的边`。
       现在改为**按目标点数**：每个区两个目标（支管两端），到达一个计 1。
       目标本身就是 branch-start/branch-end 两个切口，到达即代表该端进水 —— 比数边种类更准，
       也不再依赖「主支管是否重合」这种和气流无关的布局细节。
       ★ 实现在 coverageOf()：start / routesAll / whyNot 三处共用，禁止就地再数一遍。 */
    var cov=coverageOf(allRoutes,d.total),allCovered=cov.covered;
    (allRoutes||[]).forEach(function(route){
      if(route&&groupOf(route.zi,d.manual,d.nPer)===g)groupRoutes.push(route);
    });
    /* [v1073] 动画优先非冗余路线；本组全部冗余时回退全量（不因打标丢动画）。 */
    routes=groupRoutes.filter(function(r){return !r.redundant;});
    if(!routes.length)routes=groupRoutes;
    var wholeFieldClosed=!!allRoutes&&cov.closed;
    for(var zi=0;zi<d.total;zi++){
      if(groupOf(zi,d.manual,d.nPer)===g){expected[zi]=1;activeCount++;}
    }
    var incomplete=Object.keys(expected).some(function(key){return allCovered[key]!==2;});
    if(!wholeFieldClosed||!routes.length||incomplete||!activeCount){
      if(layer)layer.clearLayers();
      active=null;hideGroupInfo();if(timer){clearInterval(timer);timer=null;}playing=false;syncChipsState();
      /* [v1084b] 诊断放最前：提示条是 max-height:25vh 可滚动的，通用建议很长，
         把「哪一区、缺什么」压到末尾等于没有。先给原因，再给处理建议。 */
      var dgTip=mergeDiagForTip(diagAll,allCovered,d.total);
      if(ctx.tip)ctx.tip(demoDiagText(dgTip)
        +demoDebugText(diagAll,d)
        +'处理建议：请检查手绘总管、捕捉节点、主管、分区阀门和支管连接；'
        +'若刚点过「生成施工图」或刚更新过版本，请删掉旧总管沿图上管线重画（先点「捕捉点」开启吸附，白圈吸到施工节点再落点），再演示轮灌。');
      return false;
    }
    renderSnapshotD = d;     /* [perf-20261106] 复用同一份快照，不再 collect 第二次 */
    renderSnapshotRoutes=routes;
    render(g);
    if (!silentChips) syncChipsState();
    return true;
  }
  function syncChipsState() {
    var box = document.getElementById('mapDemoChips');
    if (!box) return;
    var play = document.getElementById('mapDemoPlay');
    if (play) play.textContent = playing ? '⏸' : '▶';
    var dots = box.querySelectorAll('[data-mapdemo-g]');
    for (var i = 0; i < dots.length; i++) {
      var g = parseInt(dots[i].getAttribute('data-mapdemo-g'), 10);
      /* [v867] 选中态与简图版同源：切 .selected 类（白+绿双环，#tlDemoChips 同款规则
         已由 v867 扩到 #mapDemoChips），不再用内联 outline —— 视觉与「原来的圆形样式」一致。 */
      if (dots[i].classList) dots[i].classList.toggle('selected', g === active);
      else dots[i].style.outline = (g === active) ? '2px solid #1f2937' : 'none';
    }
  }

  function rebuildChips(d) {
    var box = document.getElementById('mapDemoChips');
    if (!box) return;
    var M = d.gCount, h = '';
    for (var g = 0; g < M; g++) {
      var ci = g % DOT_FILLS.length, lite = g >= DOT_FILLS.length;
      h += '<button type="button" class="tl-demo-dot" data-mapdemo-g="' + g + '"' +
        ' style="background:' + (lite ? DOT_FILLS_LT[ci] : DOT_FILLS[ci]) + ';color:#fff"' +
        ' title="高亮第 ' + (g + 1) + ' 轮灌组（在线地图实际地块上演示水流）">' + (g + 1) + '</button>';
    }
    h += '<button type="button" id="mapDemoPlay" class="tl-demo-ctl" aria-label="轮播" title="自动轮流演示各组（1 秒一组），再点暂停">▶</button>';
    h += '<button type="button" id="mapDemoExit" class="tl-demo-ctl" aria-label="退出" title="退出演示，清除地图上的演示图层">■</button>';
    box.innerHTML = h;
    syncChipsState();
  }
  function wireChips() {
    var box = document.getElementById('mapDemoChips');
    if (!box || box.__mapDemoWired) return;
    box.__mapDemoWired = true;
    box.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var gb = t.closest('[data-mapdemo-g]');
      if (gb) {
        if (timer) { clearInterval(timer); timer = null; playing = false; }
        start(parseInt(gb.getAttribute('data-mapdemo-g'), 10));
        return;
      }
      if (t.closest('#mapDemoPlay')) { playToggle(); return; }
      if (t.closest('#mapDemoExit')) { stop(); return; }
    });
  }

  /* [v864] 地图左栏 dock 搬移：在线地图激活时把「分组组合 · 轮灌演示」组内容搬进
     地图左栏卡片（section/sec-t 与该栏其他卡片同款，样式零新增）；离开地图按 memo
     原样搬回并隐藏卡片。[v884] 工具模式同样搬 #tlPlanBar（绘图轨在地图区块整条
     隐藏，不搬就是「切地图按钮全消失」）；#tlPlanBar 归属与 ry-cad-toolbar（v858
     工具模式搬移）靠 memo 闭环互不破坏。 */
  var dockMemo = null;   /* { pb:{parent,next}, mb:{parent,next} } */
  function ensureDock() {
    var dock = document.getElementById('mapDemoDock');
    if (dock) { dock.parentNode.style.display = ''; return dock; }
    var sec = document.getElementById('onlineMapSection');
    var side = sec ? sec.querySelector('aside.side') : null;
    if (!side) return null;
    var card = document.createElement('section');
    card.id = 'mapDemoDockCard';
    var h = document.createElement('h4');
    h.className = 'sec-t';
    h.textContent = '分组组合 · 轮灌演示';
    dock = document.createElement('div');
    dock.id = 'mapDemoDock';
    card.appendChild(h); card.appendChild(dock);
    side.appendChild(card);
    return dock;
  }
  function dockDockIn(dock) {
    if (!dockMemo) dockMemo = { pb: null, mb: null };   /* 幂等：重复 refresh 不覆盖已记原位 */
    var pb = document.getElementById('tlPlanBar');
    var mb = document.getElementById('mapDemoBar');
    /* [v884] #tlPlanBar（联合灌溉/轮播组）工具模式也搬。v858~v864 曾让绘图轨代管、
       dock 不抢 —— 但绘图轨只在绘图区块显示（ry-cad-vp 门控，VPS 不含
       onlineMapSection）⇒ 切到在线地图整条轨 display:none，联合灌溉 chips 全部
       消失（用户实测「切地图后按钮就没有了」）。地图页统一归 dock 管，离开按
       memo 原样搬回；ry-cad-toolbar 的 moveDemoIn/back 加了 #mapDemoDock 守卫
       （dock 持有期间轨不抢不拽），两边 memo 各自闭环不冲突。 */
    if (pb && pb.parentNode !== dock) {
      dockMemo.pb = { parent: pb.parentNode, next: pb.nextSibling };
      dock.appendChild(pb);
    }
    if (mb && mb.parentNode !== dock) {
      dockMemo.mb = { parent: mb.parentNode, next: mb.nextSibling };
      dock.appendChild(mb);   /* mb 在 pb 之后：先搬 pb 再搬 mb，顺序即组内顺序 */
    }
  }
  function dockDockBack(dock) {
    if (!dockMemo) return;
    var m = dockMemo; dockMemo = null;
    var pb = document.getElementById('tlPlanBar');
    if (pb && pb.parentNode === dock && m.pb && m.pb.parent && m.pb.parent.parentNode) {
      var ref1 = (m.pb.next && m.pb.next.parentNode === m.pb.parent) ? m.pb.next : null;
      m.pb.parent.insertBefore(pb, ref1);
    }
    var mb = document.getElementById('mapDemoBar');
    if (mb && mb.parentNode === dock && m.mb && m.mb.parent && m.mb.parent.parentNode) {
      var ref2 = (m.mb.next && m.mb.next.parentNode === m.mb.parent) ? m.mb.next : null;
      m.mb.parent.insertBefore(mb, ref2);
    }
    var card = document.getElementById('mapDemoDockCard');
    if (card) card.style.display = 'none';
  }

  /* 刷新：地图页激活且数据可拾取 ⇒ 显示面板 + 重建 chips；否则隐藏并清层。
     规划简图演示条（#tlDemoBar）在地图页隐藏（两套演示不同画布）。 */
  function refresh() {
    var bar = document.getElementById('mapDemoBar');
    if (!bar || !ctx) return;
    var onMap = !!(ctx.isMapActive && ctx.isMapActive());
    if (!onMap) {
      bar.style.display = 'none';
      var dock0 = document.getElementById('mapDemoDock');
      if (dock0) dockDockBack(dock0);
      if (active != null || playing) stop();
      var tb0 = document.getElementById('tlDemoBar');
      if (tb0 && window.__tlDemoGroup == null && !tb0.__keepHidden) tb0.style.display = '';
      return;
    }
    var dock = ensureDock();
    if (dock) dockDockIn(dock);
    var d = collect();
    if (!d || d.gCount <= 0) {
      /* [v863] 无可拾取数据时给引导提示而不是整条隐藏 —— 用户找不到入口。 */
      bar.style.display = '';
      bar.__noData = true;
      /* 恢复/换地块后数据源可能暂不可用。旧 chips 不能留在屏上伪装成可播放状态。 */
      var chips = document.getElementById('mapDemoChips');
      if (chips) chips.innerHTML = '';
      var hint = document.getElementById('mapDemoHint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'mapDemoHint';
        hint.style.cssText = 'margin-top:4px;color:#9a3412';
        bar.appendChild(hint);
      }
      hint.textContent = collectBlockReason||'尚未拾取到当前地块的分区主管/支管：请先到「分区与管路」页生成分区图面（并保存总管），再回这里演示。';
      if (active != null || playing) stop();
      return;
    }
    bar.__noData = false;
    var hint0 = document.getElementById('mapDemoHint');
    if (hint0) hint0.parentNode.removeChild(hint0);
    bar.style.display = '';
    rebuildChips(d);
    var tb = document.getElementById('tlDemoBar');
    if (tb) tb.style.display = 'none';   /* 简图演示 chips 在地图页无意义，隐藏防误点 */
    scheduleWarmup(d);                   /* [perf-cold] 空闲期预填校验缓存，消除首次点击的长任务 */
  }

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('mapFlowDemoCss')) return;
    var st = document.createElement('style');
    st.id = 'mapFlowDemoCss';
    st.textContent = '.mapflow-anim{stroke-dasharray:10 8;animation:mapflowDash .45s linear infinite}@keyframes mapflowDash{to{stroke-dashoffset:-18}}';
    document.head.appendChild(st);
  }

  function hideGroupInfo(){
    var el=document.getElementById('mapFlowGroupInfo');
    if(el){el.hidden=true;el.innerHTML='';}
  }

  /* [v957] 这张卡原来是 pointer-events:none 的纯展示浮层（点击穿透给地图，不挡任何操作）。
     用户 2026-11-04：「这个悬浮卡片要变成可拖动的」—— 一旦可交互就必然吃指针事件，
     所以口径定为：**只有卡片自身这块矩形吃事件**，卡外的地图操作完全不变；
     拖动整张卡（不是只能抓标题），位置存 localStorage，双击标题复位。
     不 preventDefault（那会连带压掉 dblclick 的兼容事件），防选中靠 .is-dragging 的 user-select:none，
     防触摸滚动靠 CSS 的 touch-action:none（手机端没它一拖就变成页面滚动）。 */
  var GROUP_CARD_POS_KEY = 'ryMapGroupCardPos';
  var GROUP_CARD_DEFAULT = { left: 12, top: 52 };

  /* 位置必须夹在宿主（.map-wrap）内：卡片被拖出可视区就再也抓不回来了 */
  function clampCardPos(el, host, x, y) {
    var maxX = Math.max(0, host.clientWidth - el.offsetWidth);
    var maxY = Math.max(0, host.clientHeight - el.offsetHeight);
    return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
  }

  function setupGroupCardDrag(el){
    if(el.__ryDragBound) return;
    el.__ryDragBound = true;
    el.title = '按住可拖动；双击标题复位';
    el.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      var t = ev.target;
      if (t && t.closest && t.closest('a,button,input,select,textarea')) return;  /* 卡片以后加按钮别被拖走 */
      var host = el.offsetParent || el.parentElement;
      if (!host) return;
      var hr = host.getBoundingClientRect(), r0 = el.getBoundingClientRect();
      var offX = ev.clientX - r0.left, offY = ev.clientY - r0.top;
      var moved = false;
      el.style.right = 'auto'; el.style.bottom = 'auto';
      el.style.left = Math.round(r0.left - hr.left) + 'px';
      el.style.top = Math.round(r0.top - hr.top) + 'px';
      el.classList.add('is-dragging');
      try { el.setPointerCapture(ev.pointerId); } catch (eCap) {}
      function onMove(e2) {
        moved = true;
        var p = clampCardPos(el, host, e2.clientX - hr.left - offX, e2.clientY - hr.top - offY);
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
      }
      function onUp() {
        el.classList.remove('is-dragging');
        try { el.releasePointerCapture(ev.pointerId); } catch (eRel) {}
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        if (!moved) return;   /* 单击（没移动）不写位置，避免误触把默认位顶掉 */
        var keep = clampCardPos(el, host, parseInt(el.style.left, 10) || 0, parseInt(el.style.top, 10) || 0);
        try { localStorage.setItem(GROUP_CARD_POS_KEY, JSON.stringify({ x: keep.x, y: keep.y })); } catch (eLs) {}
      }
      /* capture 阶段监听：手指划出卡片、或指针被别的元素接管时也不会丢事件 */
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    });
    /* 双击标题复位。**不能用 ev.target.closest('.mfg-title') 判断**：这张卡会随组切换
       /地图移动重渲染 innerHTML，按下与松开之间标题节点可能已被换掉，事件 target 就变成
       整个 section（探针实测：pointerdown 命中 mfg-title，dblclick 却落在 map-flow-group-info），
       用 closest 判断会直接失效。改成用坐标命中标题矩形 —— 与"哪个节点被重渲染"无关。 */
    el.addEventListener('dblclick', function (ev) {
      var t = el.querySelector('.mfg-title');
      if (!t) return;
      var r = t.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return;
      el.style.left = GROUP_CARD_DEFAULT.left + 'px';
      el.style.top = GROUP_CARD_DEFAULT.top + 'px';
      try { localStorage.removeItem(GROUP_CARD_POS_KEY); } catch (eRm) {}
    });
  }

  /* 每次显示都按存档复位（并重新夹一遍）：窗口变小/地图换尺寸后旧坐标可能已在可视区外 */
  function restoreGroupCardPos(el){
    if(!el) return;
    var host = el.offsetParent || el.parentElement;
    if(!host) return;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(GROUP_CARD_POS_KEY) || 'null'); } catch (e) { saved = null; }
    if(!saved || !isFinite(saved.x) || !isFinite(saved.y)) return;
    var p = clampCardPos(el, host, saved.x, saved.y);
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  }

  function updateGroupInfo(d,g){
    var el=document.getElementById('mapFlowGroupInfo');
    if(!el||!d||!(g>=0))return;
    var members=[], memberIndexes=[];
    for(var zi=0;zi<d.total;zi++)if(groupOf(zi,d.manual,d.nPer)===g){members.push(zi+1);memberIndexes.push(zi);}
    var manual=!!(d.manual&&d.manual.length), totalGroups=d.gCount||0;
    var groupName=manual?'M'+(g+1):'G'+(g+1);
    var loss=null;
    /* [v967] 把地图端**自己的全部轮灌组**递进去（用户 2026-11-05：「每个分区的管径都一样才行，
       用流量最大那个分区/联合流量最大分区 确定总管管径」）。
       总管是一条物理管，全项目只能有一个口径 ⇒ 必须按最不利组选一次。
       不递 groups，inline-09 只能按它自己还原的分组推算，可能与地图上正在演示的分组对不上，
       于是算出的总管口径和「建议手绘总管」面板给的又不是同一个。 */
    var gsAll=[];
    for(var gzi0=0;gzi0<d.total;gzi0++){
      var ggi0=groupOf(gzi0,d.manual,d.nPer);
      if(ggi0>=0){ if(!gsAll[ggi0])gsAll[ggi0]=[]; gsAll[ggi0].push(gzi0); }
    }
    gsAll=gsAll.filter(function(x){return Array.isArray(x)&&x.length;});
    try{
      /* 水力计算自行从当前地块地图分区读取唯一面积数组；地图仅传轮灌成员。 */
      if(typeof window.tlMapGroupHydraulicsOf==='function')loss=window.tlMapGroupHydraulicsOf(memberIndexes,{groups:gsAll});
      else if(typeof window.tlGroupLossOf==='function')loss=window.tlGroupLossOf(g);
    }catch(e){}
    /* [v945] 没有图面路径时的口径反推（用户 2026-11-04）：
       「地图上画的总管只是路由，直径要通过实际规划地块的分区推算出来」。
       tlMapGroupHydraulicsOf 需要 wp.fromFigure（设计侧段总管），手绘总管路线常常没有，
       于是整块卡只会说「尚未齐备」。但分区面积 + 滴灌参数 + 主管/支管管径本来就有，
       足够把**手绘总管该选多大**推出来 —— 缺的只是扬程（那确实要路径长度）。 */
    var adv=null;
    if(!(loss&&loss.trunkAdvice)){
      try{
        if(typeof window.tlTrunkOdAdvice==='function'){
          /* [v967] 不再传 groupIndex：总管口径是项目级共享值，按最不利组定一次。
             传了 groupIndex 就等于「每区各算一个总管口径」——正是被否掉的那个做法。 */
          adv=window.tlTrunkOdAdvice({
            groups:gsAll
          });
        }
      }catch(eAdv){ adv=null; }
    }
    var lines='<div class="mfg-head"><span class="mfg-title">'+(manual?'手动组 ':'联合灌溉组 ')+groupName+'</span>'+
      '<span class="mfg-sub">含 '+(members.length?members.join('、'):'—')+' 区 · 共 '+totalGroups+' 组</span></div>';
    var TA=loss&&loss.trunkAdvice||null, PP=loss&&loss.pipes||null, LL=loss&&loss.lengths||null, LS=loss&&loss.lengthSource||null;
    var tableReady=!!(TA&&PP&&PP.front&&isFinite(TA.od)&&isFinite(PP.mainOd)&&isFinite(PP.branchOd));
    var trunkOd=tableReady?Number(TA.od):(adv&&adv.ok===true?Number(adv.od):null);
    var mainOd=tableReady?Number(PP.mainOd):(TA&&isFinite(Number(TA.mainOd))?Number(TA.mainOd):null);
    var branchOd=tableReady?Number(PP.branchOd):(TA&&isFinite(Number(TA.branchOd))?Number(TA.branchOd):null);
    var tableDash='—';
    var fLen=(LL&&isFinite(Number(LL.front)))?Number(LL.front):0;
    var fVel=TA&&isFinite(TA.velocity)?Number(TA.velocity).toFixed(2)+' m/s':'—';
    var mVel=PP&&isFinite(PP.mainV)?Number(PP.mainV).toFixed(2)+' m/s':'—';
    var bVel=PP&&isFinite(PP.branchV)?Number(PP.branchV).toFixed(2)+' m/s':'—';
    var mainEst=LS&&LS.main==='estimate', branchEst=LS&&LS.branch==='estimate';
    lines+='<table class="mfg-seg"><thead><tr><th>管段</th><th>管径</th><th>长度</th><th>流速</th></tr></thead><tbody>'+
      '<tr><td>总管</td><td class="od">'+(trunkOd!=null&&isFinite(trunkOd)&&trunkOd>0?'Ø '+trunkOd:'—')+'</td><td>'+(tableReady?(fLen>0?fLen.toFixed(1)+' m':'未绘制'):tableDash)+'</td><td>'+fVel+'</td></tr>'+
      '<tr><td>主管</td><td class="od">'+(mainOd!=null&&isFinite(mainOd)&&mainOd>0?'Ø '+mainOd:'—')+'</td><td>'+(tableReady?Number(LL.main||0).toFixed(1)+' m'+(mainEst?'*':''):tableDash)+'</td><td>'+mVel+'</td></tr>'+
      '<tr><td>支管</td><td class="od">'+(branchOd!=null&&isFinite(branchOd)&&branchOd>0?'Ø '+branchOd:'—')+'</td><td>'+(tableReady?Number(LL.branch||0).toFixed(1)+' m'+(branchEst?'*':''):tableDash)+'</td><td>'+bVel+'</td></tr>'+
      '</tbody></table>';
    if(tableReady&&(mainEst||branchEst))lines+='<div class="mfg-star">* 试算长，生成施工图后改为逐区实长</div>';
    if(loss&&isFinite(loss.flow)){
      var est=loss.estimated===true;
      var totalLoss=Number(loss.totalLoss==null?loss.total:loss.totalLoss);
      /* [v977] 管径/长度/流速三行列表（用户 2026-11-05 拍板版式）：切组只变数字不变版式，
         总管/主管/支管各自一行，管径蓝色加重。解释性长段压缩成一句并点名最不利区。 */
      if(tableReady){
        if(TA.shared){
          var wName='G'+((TA.sharedGroupIndex!=null?TA.sharedGroupIndex:0)+1);
          var wFlow=isFinite(TA.sharedFlow)?Number(TA.sharedFlow).toFixed(2):null;
          if(TA.sharedGroupIndex===g){
            lines+='<div class="mfg-note mfg-note-worst"><b>本轮即最不利点</b><span class="mfg-king mfg-king-flow">流量王</span>'+(wFlow?('（'+wFlow+' m³/h 全项目最大）'):'')+
              '：总管按它定一次、主管按它复核取大，各区共用</div>';
          }else{
            lines+='<div class="mfg-note">总管按最不利点 <b class="mfg-king-flow">'+wName+(wFlow?('（'+wFlow+' m³/h）'):'')+'</b><span class="mfg-king mfg-king-flow">流量王</span>定一次、各区共用；主管按最大区复核取大'+
              (isFinite(TA.velocity)&&isFinite(TA.targetVelocity)&&TA.velocity<TA.targetVelocity?' —— 本轮流速低于目标属正常':'')+'</div>';
          }
        }else{
          lines+='<div class="mfg-note">三段口径按本组流量选档；下限按主管 Ø '+Number(TA.mainOd)+' / 支管 Ø '+Number(TA.branchOd)+' mm</div>';
        }
      }
      /* [v979] 双王标记（用户 2026-11-05 拍板）：流量王=组合流最大的组（总管口径按它定，
         TA.sharedGroupIndex 已有）；扬程王=全组需求扬程最大的组（损失=路径×流量共同决定，
         不一定是路径最远）。逐组复算一遍水力只为找扬程王——估算/路径都是毫秒级，
         切组频率下无感。找不到有效扬程（缺路径/缺面积）就不标，绝不硬造。 */
      var headKing=null;
      try{
        for(var gk=0;gk<gsAll.length;gk++){
          var _memK=gsAll[gk];
          if(!Array.isArray(_memK)||!_memK.length)continue;
          var _LK=null;
          try{_LK=window.tlMapGroupHydraulicsOf(_memK,{groups:gsAll});}catch(eKH){_LK=null;}
          /* [v1026 方案C] 记录王组是否估算口径（_LK.estimated），校核行明示「（估算口径）」
             ——估算值全组共用试算长、天然偏保守，与路径精确口径不同精度，只标注不修正。 */
          if(_LK&&isFinite(_LK.head)&&(!headKing||Number(_LK.head)>headKing.head))headKing={gi:gk,head:Number(_LK.head),est:_LK.estimated===true};
        }
      }catch(eKingAll){headKing=null;}
      var isHeadKing=!!(headKing&&headKing.gi===g);
      lines+='<div class="mfg-metrics">'+
        '<div class="mfg-metric"><span>本轮流量</span><b>'+Number(loss.flow).toFixed(2)+' m³/h</b></div>'+
        '<div class="mfg-metric"><span>需求扬程'+(est?'（估算）':'')+'</span><b class="mfg-head-val'+(isHeadKing?' mfg-head-king':'')+'">'+(isFinite(loss.head)?Number(loss.head).toFixed(2)+' m':'—')+'</b>'+
        (isHeadKing?'<span class="mfg-king mfg-king-head">扬程王</span>':'')+'</div></div>';
      if(headKing){
        /* [v980] 本轮即扬程王时校核行亮淡红底（用户 2026-11-05 拍板）——与流量王的
           mfg-note-worst 淡蓝底对称：切到王卡，说明区一眼知道自己就是那个王。 */
        lines+='<div class="mfg-note mfg-note-headking'+(isHeadKing?' mfg-note-headking-active':'')+'">需求扬程按损失最大组 <b class="mfg-king-head">G'+(headKing.gi+1)+'（'+headKing.head.toFixed(2)+' m）</b><span class="mfg-king mfg-king-head">扬程王</span>'+(headKing.est?'（估算口径）':'')+'校核 · 损失由路径×流量共同决定，不只是远近</div>';
      }
      var foot='管损 '+totalLoss.toFixed(2)+' m = 总管 '+(Number(loss.frontLoss)||0).toFixed(2)+
        ' + 主管 '+(Number(loss.mainLoss)||0).toFixed(2)+' + 支管 '+(Number(loss.branchLoss)||0).toFixed(2)+' m';
      if(isFinite(loss.marginHead)) foot+='　·　另加富余 '+Number(loss.marginHead).toFixed(1)+' m';
      if(isFinite(loss.safetyFactor)) foot+=' × 安全系数 '+Number(loss.safetyFactor).toFixed(2);
      lines+='<div class="mfg-foot">'+foot+'</div>';
      if(loss.missing&&loss.missing.length) lines+='<div class="mfg-unavailable">缺少 '+loss.missing.map(function(zi){return(zi+1)+'区';}).join('、')+' 的有效分区管路路径</div>';
        }else{
      lines+='<div class="mfg-metrics">'+
        '<div class="mfg-metric"><span>本轮流量</span><b>未计算</b></div>'+
        '<div class="mfg-metric"><span>需求扬程</span><b class="mfg-head-val">未计算</b></div></div>';
      lines+='<div class="mfg-foot">管损与扬程需完整分区路径和有效管长，目前未计算</div>';
      /* [v945] 分三种情况说话，不再一律「尚未齐备」：
         · 反推成功 ⇒ 直接给出总管该选多大（这是用户真正要的那个数），并说清为什么没有扬程；
         · 反推失败 ⇒ 把缺什么原样说出来（没有分区面积 / 缺滴灌参数…），用户知道去哪补；
         · 连反推接口都没有（脚本未加载） ⇒ 才退回原来那句「尚未齐备」。 */
      if(adv&&adv.ok===true){
        /* [v967] adv 现在恒为「全项目最不利组」的结果（不再按 groupIndex 逐组算），
           所以不能写「本轮 N 区」——本轮可能只有 1 个区，口径却由别的组定。 */
        lines+='<div class="mfg-trunk-advice">项目统一总管：PE 外径 Ø '+Number(adv.od)+' mm'+
          (isFinite(adv.velocity)?' · 最不利组流速 '+Number(adv.velocity).toFixed(2)+' m/s':'')+'（按分区反推）</div>'+
          '<div class="mfg-advice-note">全项目一根管，口径按最不利组（'+Number(adv.zoneCount)+' 区同轮 Q '+
          Number(adv.flow).toFixed(2)+' m³/h）定一次 · 总管不小于下游主管/支管 Ø '+Number(adv.minDownstreamOd)+' mm</div>'+
          '<div class="mfg-unavailable">扬程与最不利路径损失要等「分区与管路」页生成管线图后才有（那两项需要真实管道长度）</div>';
      }else if(adv&&adv.ok===false&&adv.text){
        lines+='<div class="mfg-unavailable">'+adv.text+'</div>';
      }else{
        lines+='<div class="mfg-unavailable">分区管路路径或水力参数尚未齐备，暂不能可靠计算本轮扬程及手绘总管建议口径</div>';
      }
    }
    el.innerHTML=lines;
    el.hidden=false;
    /* [v957] 显示后再接管拖动：hidden 时 offsetParent 为 null，量不到宿主尺寸 */
    setupGroupCardDrag(el);
    restoreGroupCardPos(el);
  }

  window.RyMapFlowDemo = {
    /* [v989] 只读诊断：宿主 console 一行取找路图实况（排障用，不写任何状态）。
       debugGraph(g) => { ver, groups, trunkPts, perMainMinM[mi], entries[mi],
                          routes(g) 的段键序列 }。
       entries 按与 buildFlowRoutes 相同的口径重扫（端点+线体 2m 步长），
       perMainMinM 用平面近似（度差×111320/110540），排障精度足够。 */
    debugGraph: function (g) {
      function flatDist(a, b) {
        var x = (b.lng - a.lng) * 111320 * Math.max(0.1, Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
        var y = (b.lat - a.lat) * 110540;
        return Math.sqrt(x * x + y * y);
      }
      function densify(ll) {
        var out = [];
        for (var i = 1; i < ll.length; i++) {
          var a = ll[i - 1], b = ll[i], dd2 = flatDist(a, b);
          var n = Math.max(1, Math.ceil(dd2 / 2));
          for (var k = 0; k < n; k++) out.push({ lat: a.lat + (b.lat - a.lat) * k / n, lng: a.lng + (b.lng - a.lng) * k / n });
        }
        if (ll.length) out.push(ll[ll.length - 1]);
        return out;
      }
      try {
        var d = collect();
        if (!d) return { ver: 'v992-cold-prune', error: 'collect-null（页面缺管线图数据）' };
        var trunkPts = [];
        (d.trunkLinesLL || []).forEach(function (l) { l.forEach(function (p) { trunkPts.push([+p.lat.toFixed(6), +p.lng.toFixed(6)]); }); });
        var trunkDense = densify(d.trunkLinesLL ? [].concat.apply([], d.trunkLinesLL) : []);
        var perMainMinM = [], entries = [];
        (d.mainsLL || []).forEach(function (line, mi) {
          var dense = densify(line), min = Infinity, hitS = null;
          for (var i = 0; i < dense.length; i++) {
            for (var j = 0; j < trunkDense.length; j++) {
              var dd3 = flatDist(dense[i], trunkDense[j]);
              if (dd3 < min) min = dd3;
            }
          }
          perMainMinM.push(+min.toFixed(1));
          if (min <= TOL_M) entries.push(mi);
        });
        var routes = (typeof g === 'number') ? buildFlowRoutes(d, g) : null;
        var routeSeq = null;
        if (routes) routeSeq = routes.map(function (rt) {
          var seq = [];
          rt.trunk.concat(rt.main).concat(rt.branch).forEach(function (s) { seq.push(s.key); });
          return { zi: rt.zi, keys: seq };
        });
        return { ver: 'v992-cold-prune', groups: d.gCount, manual: d.manual, nPer: d.nPer,
                 trunkPts: trunkPts, perMainMinM: perMainMinM, entries: entries,
                 nodes: (d.nodesLL || []).length, routes: routeSeq };
      } catch (e) { return { ver: 'v992-cold-prune', error: String(e && e.message || e) }; }
    },
    VERSION: 'v992-cold-prune',
    TOL_M: TOL_M,
    INTERVAL_MS: INTERVAL_MS,
    init: function (c) {
      ctx = c;
      injectCss();
      wireChips();
      refresh();
      /* section 切换跟随：在线地图激活 ⇒ 显示面板+重建 chips；离开 ⇒ 隐藏+清层 */
      try {
        var sec = document.getElementById('onlineMapSection');
        if (sec && typeof MutationObserver === 'function' && !sec.__mapDemoObs) {
          sec.__mapDemoObs = new MutationObserver(function () { try { refresh(); } catch (e) { } });
          sec.__mapDemoObs.observe(sec, { attributes: true, attributeFilter: ['class'] });
        }
        if (!window.__mapDemoHashHook) {
          window.__mapDemoHashHook = true;
          window.addEventListener('hashchange', function () { try { refresh(); } catch (e) { } });
        }
      } catch (e) { }
    },
    refresh: refresh,
    stop: stop,
    isActive: function () { return active != null || playing; },
    /* 只读导出当前地块地图分区面积；缺少地图分区时返回 null，水力计算必须停止，不能回退网格或手填面积。 */
    zoneAreasOf: function () {
      try { return (ctx && typeof ctx.getZoneAreas === 'function') ? ctx.getZoneAreas() : null; }
      catch (eZA) { return null; }
    },
    /* 纯函数导出（Node 单测） */
    groupOf: groupOf, groupCount: groupCount, validateConnection: validateConnection,
    entrancesOf: entrancesOf, collectWorkspaceNodes: collectWorkspaceNodes,
    /* [v1019] 寻路引擎纯函数导出（单测/探针用合成数据直测，不经 collect/ctx） */
    buildRoutes: buildFlowRoutes,
    /* [v1019 用户拍板] 最远水路共享数据源：全分区逐区寻路（不分轮灌组），与轮灌演示
       动画同引擎同图（buildFlowRoutes allZones 模式）。返回：
       · null —— 引擎不可用（无图数据/干线与段总管皆无/图断裂）；
       · { routes, total, missing } —— missing 非空 = 有分区拿不到有效路径，
         调用方必须整体放弃（被跳过的区可能才是真最远，宁缺不错）。 */
    routesAll: function () {
      try {
        var d = collect();
        if (!d || !d.total) return null;
        var routes = buildFlowRoutes(d, 0, true);
        if (!routes || !routes.length) return null;
        var cov = coverageOf(routes, d.total);
        return { routes: routes, total: d.total, missing: cov.missing };
      } catch (e) { return null; }
    },
    /* [v945] 导出给探针/宿主驱动：分组浮层文案（含"没有图面路径时按分区反推口径"这条分支）。
       它是纯 DOM 拼装、不写任何状态，导出去比藏在闭包里更好验。 */
    updateGroupInfo: updateGroupInfo,
    /* [v1084] 建图诊断：{blocked, active, missing, fittings:{placed,dup,offLine,noPipe},
       zones:[{zi,reason}]}。失败提示用它逐条说清"哪个区、缺什么、差多少米"。 */
    lastDiagnostics: function () { return lastDiag; },
    /* [v1084] 诊断文案纯函数（单测直测，不必起地图） */
    diagText: demoDiagText,
    /* [v1084b] 诊断补齐（按 allCovered 逐区补原因）纯函数 */
    mergeDiag: mergeDiagForTip,
    /* [v1084b] 一句话回答「为什么不能演示」：纯读，不改任何状态。
       控制台 `RyMapFlowDemo.whyNot()` 一次拿到门禁代码/容差/断组/逐区覆盖/诊断，
       不必再靠"退一个版本试一次"来猜。 */
    whyNot: function (g, dInj) {
      var out = { ok: false, gate: '', code: '', minM: null, brokenGroups: [],
        counts: {}, zones: [], hint: '', diag: null };
      var d = null;
      if (dInj) { d = dInj; }   /* 单测注入（等价于 collect() 的返回形状） */
      else {
        try { d = collect(); } catch (eC) { out.gate = 'collect'; out.hint = 'collect() 抛错：' + eC.message; return out; }
      }
      if (!d) { out.gate = 'collect'; out.hint = collectBlockReason || '没有可用的简图数据（tlDiagramData 缺失或 world≠meter）'; return out; }
      out.counts = { mains: (d.mainsLL || []).length, branches: (d.branchLL || []).length,
        valves: (d.valves || []).length, fittings: (d.fittings || []).length,
        trunkLines: (d.trunkLinesLL || []).length, groups: d.gCount, total: d.total };
      var v = null;
      try { v = ensureValidation(d); } catch (eV) { out.gate = 'validation'; out.hint = '校验抛错：' + eV.message; return out; }
      out.code = (v && v.code) || '';
      out.minM = (v && v.minM != null) ? v.minM : null;
      out.brokenGroups = (v && v.brokenGroups) || [];
      if (!v || !v.ok) { out.gate = 'validation'; out.hint = '手绘总管与已发布主管/节点未接通（code=' + out.code + '）'; return out; }
      var allRoutes = null;
      try { allRoutes = buildFlowRoutes(d, 0, true); } catch (eR) { out.gate = 'routes'; out.hint = 'buildFlowRoutes 抛错：' + eR.message; return out; }
      out.diag = lastDiag;
      /* [v1084e] 覆盖口径改走 coverageOf()，与 start()/routesAll() 同源。
         旧实现在这里数 branch: 边 ⇒ 主支管同列定线时恒为 0，控制台会报
         「12 区全是 0/2」而实际能演示 —— 诊断工具撒谎比没有诊断更耽误事。 */
      var cov = coverageOf(allRoutes, d.total);
      out.coverage = { counted: cov.counted, missingZones: cov.missing,
        wholeFieldClosed: !!allRoutes && cov.closed };
      var gg = (typeof g === 'number') ? g : 0, groupRoutes = [], expected = 0, incompleteInGroup = false;
      for (var zi = 0; zi < d.total; zi++) {
        out.zones.push({ zi: zi, covered: cov.covered[zi] || 0 });
        if (groupOf(zi, d.manual, d.nPer) === gg) {
          expected++;
          out.zones[zi].group = gg;
          if (cov.covered[zi] !== 2) incompleteInGroup = true;
        } else out.zones[zi].group = groupOf(zi, d.manual, d.nPer);
      }
      (allRoutes || []).forEach(function (r) { if (r && groupOf(r.zi, d.manual, d.nPer) === gg) groupRoutes.push(r); });
      out.coverage.incompleteInGroup = incompleteInGroup;
      /* 判定与 start() 的四道条件逐一对齐（wholeFieldClosed && routes.length && !incomplete && activeCount），
         否则又会出现「诊断说不能、点下去能演示」的第二类分叉。 */
      out.gate = (allRoutes && cov.closed && groupRoutes.length && !incompleteInGroup && expected) ? 'pass' : 'routes';
      out.ok = out.gate === 'pass';
      out.hint = out.ok ? '可以演示（第 ' + (gg + 1) + ' 组 ' + expected + ' 区，成路 ' + groupRoutes.length + ' 条）'
        : (!allRoutes ? 'buildFlowRoutes 返回空图'
          : (!cov.closed ? '全场未闭合：' + (cov.missing.length) + ' 区覆盖≠2（第 ' + cov.missing.slice(0, 8).map(function (z) { return z + 1; }).join('、') + ' 区）'
            : !groupRoutes.length ? '本组没有可用路线'
              : '本组 ' + expected + ' 区里有区覆盖≠2，成路 ' + groupRoutes.length + ' 条（逐区 covered 见 zones）'));
      return out;
    },
    /* [v1084b] 同上，但要一段可直接截图/粘贴的文字 */
    whyNotText: function (g, dInj) {
      var r = null;
      try { r = this.whyNot(g, dInj); } catch (e) { return '诊断失败：' + e.message; }
      var c = r.counts || {};
      var head = '【演示诊断】门禁=' + r.gate + (r.code ? ' / code=' + r.code : '') +
        '；主管 ' + (c.mains || 0) + ' / 支管 ' + (c.branches || 0) + ' / 阀门 ' + (c.valves || 0) +
        ' / 配件 ' + (c.fittings || 0) + ' / 总管段 ' + (c.trunkLines || 0) +
        ' / 分区 ' + (c.total || 0) + ' / 轮灌组 ' + (c.groups || 0);
      var gg = (typeof g === 'number') ? g : 0;
      var bad = (r.zones || []).filter(function (z) { return z.group === gg && z.covered !== 2; });
      var covTxt = '';
      if (r.coverage) {
        covTxt = '；覆盖口径=按目标点数，计入 ' + r.coverage.counted + ' 条' +
          (r.coverage.wholeFieldClosed ? '，全场闭合' : '，全场未闭合（' + r.coverage.missingZones.length + ' 区不足）');
      }
      var tail = bad.length ? '；本组覆盖≠2 的区：' + bad.slice(0, 8).map(function (z) { return '第' + (z.zi + 1) + '区(' + z.covered + '/2)'; }).join('、') + (bad.length > 8 ? ' 等' + bad.length + '个' : '') : '';
      return head + covTxt + '；' + r.hint + tail + demoDiagText(r.diag);
    },
    /* [v1084f 2026-11-14 用户报「4区/7区动画路径不对」] 单区路线段清单 —— 让「水实际走哪几段」
       可以直接打出来看，不用再靠肉眼猜动画对不对。
       用法：RyMapFlowDemo.routeSegments(3)   // 0 基：3 = 图上第 4 区，6 = 第 7 区
       返回 { zi, group, routes:[{ redundant, segs:[{dir,key,lenM,from,to}] }] }，
       其中 segs 按「水源 → 支管端」的顺序排列；lenM 是段长（米），from/to 是等距投影米坐标。
       期望形状（1 列 4 行的网格）：第 4 区必须出现 main:0（1 区那段主管）再 main:3，
       第 7 区必须出现 main:0 → main:3 → main:6；只有 main:6 说明上游段没进路线。 */
    routeSegments: function (zi, dInj) {
      var out = { zi: zi, group: null, routes: [], error: '' };
      try {
        var d = dInj || collect();
        if (!d) { out.error = '无可用简图数据'; return out; }
        var gg = groupOf(zi, d.manual, d.nPer);
        out.group = gg;
        /* 与建图同一套等距投影（buildFlowRoutes 里的 xy 是它的局部函数，这里按同一公式另算一份，
           仅供人读坐标，不参与任何判定）。参考纬度取本区主管首点，避免跨区累积误差。 */
        var refM = (d.mainsLL || [])[zi];
        var refLat = (refM && refM[0] && isFinite(refM[0].lat)) ? refM[0].lat
          : ((d.trunkLinesLL && d.trunkLinesLL[0] && d.trunkLinesLL[0][0]) ? d.trunkLinesLL[0][0].lat : 0);
        var cosL = Math.max(.01, Math.cos(refLat * Math.PI / 180));
        var proj = function (p) { return { x: p.lng * 111320 * cosL, y: p.lat * 110540 }; };
        var segLen = function (a, b) { var p = proj(a), q = proj(b); return Math.sqrt(Math.pow(q.x - p.x, 2) + Math.pow(q.y - p.y, 2)); };
        var rs = buildFlowRoutes(d, gg, false);
        (rs || []).forEach(function (r) {
          if (!r || r.zi !== zi) return;
          var segs = [];
          ['trunk', 'main', 'branch'].forEach(function (k) {
            (r[k] || []).forEach(function (s) {
              if (!s || !s.points || s.points.length < 2) return;
              var a = s.points[0], b = s.points[s.points.length - 1], pa = proj(a), pb = proj(b);
              segs.push({ dir: k, key: s.key, lenM: Math.round(segLen(a, b) * 10) / 10,
                from: [Math.round(pa.x * 10) / 10, Math.round(pa.y * 10) / 10],
                to: [Math.round(pb.x * 10) / 10, Math.round(pb.y * 10) / 10] });
            });
          });
          out.routes.push({ redundant: !!r.redundant, segs: segs });
        });
        if (!out.routes.length) out.error = '该区没有可用路线（图没连到本区）';
      } catch (e) { out.error = e.message; }
      return out;
    }
  };
})(window);
