/* 总管右侧属性面板 + 水力派生量（四期）。
 *
 * 为什么单独一个文件：
 *   `mod/online-map.js` 已经 3000 行，且它的 IIFE 里全是 Leaflet 状态（map/图层/命中判定）。
 *   面板要做的是「读一条干线 → 算出 11 个只读量 → 把 4 个可编辑字段写回」，
 *   这套计算**与地图无任何关系**，混进宿主就没法用 Node 单测钉住了。
 *   所以：本文件 = 纯计算（compute）+ 一段 DOM 渲染；写库仍然由宿主走 commitTrunks
 *   （唯一写库口，见 online-map.js「唯一写库口」注释），本模块**不碰存储**。
 *
 * 数据契约（与 core/trunk-schema.js 对齐，全部落在 entry.params 里）：
 *   code      管线编号（显示用，"ZG-001"），不参与 id —— 改 id 会打断 activeTrunkId / labels 引用
 *   material  'PE' | 'PVC-U' | 'GI'（镀锌钢管），只影响沿程损失系数 C
 *   dn        公称外径 mm（null = 未选）
 *   designFlow 设计流量 m³/h（null = 未填）
 *   nodeTypes  { "<拐点下标>": "source" | "tee" }，plain 不落库（省体积）
 *
 * 三条硬口径：
 *   ① **缺数据一律显示「—」/「未关联高程数据」，绝不补 0** —— 伪造 0 高差会被拿去做水力判断。
 *   ② 沿程损失用海曾-威廉（C 值随管材变），局部损失按弯头/三通/进水口个数估；
 *      两者都要 v>0 才有意义，缺 dn 或 flow 时整个水力区显示「—」。
 *   ③ 流速分色只做提示：绿=经济(0.8~2.0)、黄=偏低/偏高、红=超标(>3.0)。
 *      **不阻断任何操作**（规格一⑧），纯视觉。
 */
(function (root) {
  'use strict';

  var VERSION = 2;

  /* 海曾-威廉 C 值：PE 140 / PVC-U 145 / 镀锌钢管 120。
     这几个数是「管材联动沿程损失系数」的唯一实现点，别在别处再写一份。 */
  var MATERIALS = [
    { key: 'PE',    label: 'PE管',     hwC: 140 },
    { key: 'PVC-U', label: 'PVC-U',    hwC: 145 },
    { key: 'GI',    label: '镀锌钢管',  hwC: 120 }
  ];
  /* 管径下拉的候选档。**这是 UI 预设，不是水力档位表** —— 真正参与计算/选档的是
     inline-09 的 PE 外径序列（ci_check_static 锁着单一来源），这里只决定下拉里能直接
     点什么。v947 从 [110,125,160,200] 扩到常用大口径：总管按分区反推后常在 Ø225~Ø400
     （一组的合流是成倍于单区主管的），只给到 200 等于逼用户每次都走「自定义…」。
     新增档位必须是 PE 序列里的值，别自己造数。 */
  var DN_PRESETS = [110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];

  var NODE_TYPES = [
    { key: 'plain',  label: '普通拐点' },
    { key: 'source', label: '水源进水口' },
    { key: 'tee',    label: '分水三通节点' }
  ];

  /* 经济流速区间。规格六的黄色告警按 V_BAD 触发（>3.0 m/s）。 */
  var V_ECON_MIN = 0.8;
  var V_ECON_MAX = 2.0;
  var V_BAD = 3.0;

  var G = 9.81;

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function materialOf(key) {
    for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].key === key) return MATERIALS[i];
    return MATERIALS[0];
  }

  /* 经纬度球面距离（米）。不用 Leaflet：本函数要能在 Node 里跑，
     而在线地图的 `map.distance` 依赖 L 与实例。
     ★ 唯一实现在 `mod/trunk-geo.js`（v843 起）—— 扬程算总管长度用的是同一个公式。
       R 必须 6378137（与 __runyeGeoBase 的 mlat 同值），否则量出来的米和图上量的米
       差 0.11%，而扬程要把两边长度直接相加。
       本地副本只在 geo 未加载时兜底（Node 单测就是这种情形），
       tests/trunk_geo_ll2m.test.cjs ⑰ 有一条逐位相等锁着两者不许漂移。 */
  function haversineLocal(a, b) {
    var R = 6378137;
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    var h = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
    if (h < 0) h = 0;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function haversine(a, b) {
    var g = root.RyTrunkGeo;
    if (g && typeof g.haversine === 'function') return g.haversine(a, b);
    return haversineLocal(a, b);
  }

  function readPoint(q) {
    if (root.RyTrunkSchema && typeof root.RyTrunkSchema.readPoint === 'function') {
      return root.RyTrunkSchema.readPoint(q);
    }
    /* 兜底：宿主/测试里 schema 未加载时也要能读（形状与 schema 完全一致）。 */
    var lat, lng, z;
    if (Array.isArray(q)) {
      if (q.length < 2) return null;
      lat = Number(q[0]); lng = Number(q[1]);
      if (q.length >= 3 && num(q[2]) !== null) z = Number(q[2]);
    } else if (q && typeof q === 'object') {
      lat = Number(q.lat); lng = Number(q.lng);
      if (num(q.z) !== null) z = Number(q.z);
    } else return null;
    if (!isFinite(lat) || !isFinite(lng)) return null;
    var out = { lat: lat, lng: lng };
    if (z !== undefined) out.z = z;
    return out;
  }

  /* 一条干线的全部派生量。**纯函数**：不读 DOM、不读 window 状态、不改入参。 */
  function compute(entry) {
    var out = {
      ok: false,
      ptCount: 0,
      projM: null,
      slopeM: null,
      z0: null,
      z1: null,
      dz: null,
      dn: null,
      flow: null,
      v: null,
      vLevel: null,
      hf: null,
      hj: null,
      hfTotal: null,
      material: null,
      elbows: 0,
      tees: 0,
      hasZ: false
    };
    if (!entry || typeof entry !== 'object') return out;

    var raw = Array.isArray(entry.points) ? entry.points : [];
    out.ptCount = raw.length;

    var pts = [];
    for (var i = 0; i < raw.length; i++) {
      var p = readPoint(raw[i]);
      if (p) pts.push(p);
    }
    if (pts.length < 2) return out;

    /* ── 几何 ───────────────────────────────────────────────────────────── */
    var proj = 0, slope = 0, allZ = true;
    for (var j = 1; j < pts.length; j++) {
      var a = pts[j - 1], b = pts[j];
      var d = haversine(a, b);
      proj += d;
      if (typeof a.z === 'number' && typeof b.z === 'number') {
        var dz = b.z - a.z;
        slope += Math.sqrt(d * d + dz * dz);
      } else {
        allZ = false;
      }
    }
    out.projM = proj;
    out.hasZ = allZ;
    out.slopeM = allZ ? slope : null;
    out.z0 = typeof pts[0].z === 'number' ? pts[0].z : null;
    out.z1 = typeof pts[pts.length - 1].z === 'number' ? pts[pts.length - 1].z : null;
    /* 总高差 = 终点 − 起点（上坡为正、下坡为负）。首尾任一缺高程就是 null。 */
    out.dz = (out.z0 !== null && out.z1 !== null) ? (out.z1 - out.z0) : null;

    /* ── 水力 ───────────────────────────────────────────────────────────── */
    var prm = (entry.params && typeof entry.params === 'object') ? entry.params : {};
    var mat = materialOf(prm.material);
    out.material = mat.key;
    var dn = num(prm.dn), flow = num(prm.designFlow);
    out.dn = dn;
    out.flow = flow;
    if (!(dn > 0) || !(flow > 0)) {
      out.ok = true;          // 几何有效，水力缺输入
      return out;
    }

    var D = dn / 1000;                       // m
    var Q = flow / 3600;                     // m³/h → m³/s
    var area = Math.PI * D * D / 4;
    var v = Q / area;
    out.v = v;

    if (v < V_ECON_MIN) out.vLevel = 'low';
    else if (v <= V_ECON_MAX) out.vLevel = 'good';
    else if (v <= V_BAD) out.vLevel = 'warn';
    else out.vLevel = 'bad';

    /* 海曾-威廉：hf = 10.67 · L · Q^1.852 / (C^1.852 · D^4.8704) */
    var hf = 10.67 * out.projM * Math.pow(Q, 1.852) /
             (Math.pow(mat.hwC, 1.852) * Math.pow(D, 4.8704));
    out.hf = isFinite(hf) ? hf : null;

    /* 局部损失：中间拐点 = 弯头(ζ0.5)；分水三通 ζ1.5；水源进水口 ζ0.5。
       弯头数 = 拐点数 − 2（首尾是端点，不是弯头），最少 0。 */
    var nt = (prm.nodeTypes && typeof prm.nodeTypes === 'object') ? prm.nodeTypes : {};
    var elbows = Math.max(0, pts.length - 2);
    var tees = 0, inlet = 0;
    Object.keys(nt).forEach(function (k) {
      if (nt[k] === 'tee') tees++;
      if (nt[k] === 'source' && Number(k) === 0) inlet = 1;
    });
    var zeta = 0.5 * elbows + 1.5 * tees + 0.5 * inlet;
    var hj = zeta * v * v / (2 * G);
    out.elbows = elbows;
    out.tees = tees;
    out.hj = isFinite(hj) ? hj : 0;
    out.hfTotal = (out.hf === null) ? null : out.hf + out.hj;
    out.ok = true;
    return out;
  }

  /* ── 流速告警（规格六）：**黄色、非阻断、只对单根生效** ─────────────────
     判定与渲染分开：shouldWarn 是纯函数（Node 单测锁着），弹窗由宿主画。
     ★ 判据只有"偏高/超标"，不含"偏低" —— 偏低是选型浪费，不是水力风险；
       把它也塞进告警会让提示失去意义（低流速永远存在）。
     ★ `warnMuted` 只看严格 true：老数据里可能是 0/''/'false'，那些都当"没屏蔽"，
       宁可多提示一次，也不要因为一个脏值让用户以为"系统坏了不报警"。 */
  var WARN_TEXT = '流速超过推荐经济流速，水头损失偏大，请复核管径或流量。';

  function shouldWarn(entry, derived) {
    var d = derived || compute(entry);
    var prm = (entry && entry.params && typeof entry.params === 'object') ? entry.params : {};
    var out = {
      warn: false,
      muted: prm.warnMuted === true,
      vLevel: d.vLevel,
      v: d.v,
      text: WARN_TEXT
    };
    if (d.vLevel !== 'warn' && d.vLevel !== 'bad') return out;
    out.warn = !out.muted;
    return out;
  }

  /* ── 联合复核（规格七）：总管 + 下游分区管网 ─────────────────────────────
   *
   * [v843 定稿] 合计口径已由用户拍板（2026-11-01）：
   *   **扬程按「在线地图总管长度 + 分区主管及支管长度」算。**
   *   ⇒ 三段损失相加，而这个和**就是三级页 computeThreeLevel 的 totalPipeLoss**
   *     （它的 frontLenUsed 已改为优先取地图总管实测长度，见 mod/inline-09.js 的
   *     tlFrontLenUse）。所以本面板**不另算一份**，只把三个数拆开给人看。
   *
   * v842 当时不敢合计的理由（保留作记录）：总管流量取 designFlow（设计值）还是
   *   segments[].q（三级算出来的）没有定论。现在这个疑问被口径本身绕开了 ——
   *   合计走三级那套流量，总管长度走地图实测，两边不再各用一套流量相加。
   *
   * 仍然坚持的三条：
   *   ① 不做「Σ segments[].q」——并联支管的流量相加是重复计数，取**最大段流量**当下限。
   *   ② front 段整段不计（数量、长度都不算）：它是分区反投给总管画的代理线，
   *      算进去同一根管在"总管"行和"下游"行各出现一次。
   *   ③ 管长合计 ≠ 最不利路径长度：前者是画在地图上的所有管子之和（材料量口径），
   *      后者才是水力路径。界面上分开写「管长合计」与「损失拆分」，不许混用。
   *
   * layout = RyIrrigationDataStore 的管网快照：
   *   { plotId, segments:[{id,name,dn,kind,latLng, len?, q?}], valves, dripTapes }
   *   ★ len / q 是**可选**的：inline-09 反投时只写 id/name/dn/kind/latLng。
   *     长度靠 segLenOf 从 latLng 现算，流量没有就明说"没有"，不猜。
   *   宿主传入前已做地块绑定校验；不属于本块时传 { mismatch:true, plotId } 而不是 null，
   *   这样面板能说清"为什么没有下游数据"，而不是让人以为"下游没做"。
   *
   * design = computeThreeLevel() 的返回（宿主 getDesign 现算），取不到的字段一律 null。
   */
  function kindOf(seg) {
    var k = seg && seg.kind;
    /* [v878] 段总管（inline-09 反投 kind:'segTrunk'）按 front 桶处理：它的长度已经
       折进 computeThreeLevel 的 frontLenUsed（v859 口径 tlFrontLenUse + segLen），
       designBlock.front 就是那个数；下游合计（lenM/segCount）再算一遍，
       同一条管就在"总管"行和"下游"行各出现一次 —— v842 双重计数的同款错误。 */
    if (k === 'front' || k === 'segTrunk') return 'front';
    var tag = String((seg && (seg.id || seg.name)) || '');
    if (tag.indexOf('front') === 0) return 'front';
    if (tag.indexOf('branch') === 0) return 'branch';
    if (tag.indexOf('main') === 0) return 'main';
    return 'other';
  }

  /* 一条段的长度：优先用快照自带的 `len`，**没有就按 latLng 现算**。
     ★ 这一条是 v842 的真缺陷：`runye_network_layout.segments` 由 inline-09 反投时只写
       `{id,name,dn,kind,latLng}`，**根本没有 len / q** —— 面板上那个"总长"在生产环境一直是「—」。
       探针里我自己的 fixture 带了 len，所以没暴露。能现算的（长度）就必须现算。 */
  function segLenOf(seg) {
    var L = num(seg && seg.len);
    if (L !== null && L >= 0) return L;
    var arr = (seg && (seg.latLng || seg.points)) || null;
    if (!Array.isArray(arr) || arr.length < 2) return null;
    var tot = 0;
    for (var i = 1; i < arr.length; i++) {
      var a = readPoint(arr[i - 1]), b = readPoint(arr[i]);
      if (!a || !b) return null;          /* 有坏点就整段不给长度，不抄近道 */
      tot += haversine(a, b);
    }
    return tot;
  }

  /* 三级页的损失拆分（computeThreeLevel 的返回子集）。缺字段返回 null，界面就不显示这一段。 */
  function designBlock(dz) {
    if (!dz || typeof dz !== 'object') return null;
    var f = num(dz.frontLenUsed), m = num(dz.mainLenUsed), b = num(dz.branchLenUsed);
    if (f === null || m === null || b === null) return null;
    var fl = num(dz.frontPipeLoss), ml = num(dz.mainLoss), bl = num(dz.branchLoss);
    var tot = num(dz.totalPipeLoss);
    if (tot === null) tot = (fl || 0) + (ml || 0) + (bl || 0);
    var src = dz.frontLenSrc;
    if (src !== 'mapTrunk' && src !== 'figure' && src !== 'input') src = '';
    return {
      src: src,
      mapLen: num(dz.frontLenMap),
      front: f, main: m, branch: b, lenSum: f + m + b,
      frontLoss: fl, mainLoss: ml, branchLoss: bl, totalLoss: tot,
      pumpHead: num(dz.pumpHead)
    };
  }

  function jointReview(entry, layout, derived, design) {
    var d = derived || compute(entry);
    var prm = (entry && entry.params && typeof entry.params === 'object') ? entry.params : {};
    var out = {
      ok: !!d.ok,
      hasLayout: false,
      trunk: {
        code: String(prm.code || (entry && entry.id) || ''),
        material: d.material,
        dn: d.dn,
        flow: d.flow,
        v: d.v,
        hf: d.hfTotal,
        len: d.projM
      },
      down: { segCount: 0, mainCount: 0, branchCount: 0, mainMaxDn: null, lenMainM: null, lenBranchM: null, lenM: null, qMax: null },
      design: null,
      checks: [],
      note: ''
    };

    out.design = designBlock(design);

    if (layout && layout.mismatch === true) {
      out.note = '下游管网快照属于另一块地' + (layout.plotId ? '（' + String(layout.plotId) + '）' : '') +
                 '，与地图上正在编辑的地块不一致，不做联合复核。';
      return out;
    }
    var segs = (layout && Array.isArray(layout.segments)) ? layout.segments : null;
    if (!segs || !segs.length) {
      out.note = '未找到本块的下游设计快照：先在三级页「生成管线图」，下游主管/支管才会落到地图上。';
      return out;
    }
    out.hasLayout = true;

    /* ★ front 段整段跳过：既不算数量，也**不算长度**。
       v842 这里是"数量跳过、长度照加"，于是「总长」把总管代理线也算进去了，
       同一条管在"总管"行和"下游"行各出现一次。测试当时也照抄了这个错数（A4 断言 360）。 */
    var mainMax = null, lenMain = 0, lenBranch = 0, lenOther = 0, lenOK = true, qMax = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], k = kindOf(s);
      if (k === 'front') continue;
      out.down.segCount++;
      var L = segLenOf(s);
      if (L === null) lenOK = false;
      if (k === 'main') {
        out.down.mainCount++;
        var dn = num(s.dn);
        if (dn !== null && dn > 0 && (mainMax === null || dn > mainMax)) mainMax = dn;
        if (L !== null) lenMain += L;
      } else if (k === 'branch') {
        out.down.branchCount++;
        if (L !== null) lenBranch += L;
      } else if (L !== null) lenOther += L;
      var q = num(s.q);
      if (q !== null && q > 0 && (qMax === null || q > qMax)) qMax = q;
    }
    out.down.mainMaxDn = mainMax;
    /* 长度是**画在地图上的管线总长**（材料量口径），不是最不利路径长度。
       两者不能混：扬程要的是"一条路走到底"，而这里是一张网上所有管子的和。
       界面文案必须写清「管长合计」，别让人拿它去当水力路径。 */
    out.down.lenMainM = lenOK ? lenMain : null;
    out.down.lenBranchM = lenOK ? lenBranch : null;
    out.down.lenM = lenOK ? (lenMain + lenBranch + lenOther) : null;
    out.down.qMax = qMax;

    /* ① 管径：总管必须 ≥ 最大主管。缺任一边就明说"缺"，不拿 0 或猜测的档位顶。 */
    if (d.dn === null || mainMax === null) {
      out.checks.push({ level: 'info', text: '管径对照暂不可做：' + (d.dn === null ? '总管未选管径' : '下游主管没有管径数据') + '。' });
    } else if (d.dn < mainMax) {
      out.checks.push({ level: 'warn', text: '总管 DN' + d.dn + ' 比下游最大主管 DN' + mainMax + ' 还细，管径需复核。' });
    } else {
      out.checks.push({ level: 'ok', text: '总管 DN' + d.dn + ' ≥ 下游最大主管 DN' + mainMax + '。' });
    }

    /* ② 流量：总管设计流量不得小于下游最大段流量。 */
    if (d.flow === null || qMax === null) {
      out.checks.push({ level: 'info', text: '流量对照暂不可做：' + (d.flow === null ? '总管未填设计流量' : '下游段没有流量数据') + '。' });
    } else if (d.flow + 1e-9 < qMax) {
      out.checks.push({ level: 'warn', text: '总管设计流量 ' + round2(d.flow) + ' m³/h 小于下游最大段流量 ' + round2(qMax) + ' m³/h，总管不可能比它供的管子还小。' });
    } else {
      out.checks.push({ level: 'ok', text: '总管设计流量 ' + round2(d.flow) + ' m³/h ≥ 下游最大段流量 ' + round2(qMax) + ' m³/h。' });
    }

    /* [v843] 合计口径已定（用户 2026-11-01）：**总管长度取在线地图总管实测 ＋ 分区主管及支管**，
       三段损失相加。这个数就是三级页 computeThreeLevel 的 totalPipeLoss —— 本面板**不另算一份**。
       ★ 它不等于水泵扬程：扬程还要加静扬程、入口工作压力、过滤损失、富余水头，再乘 1.10 安全系数。
         界面上必须把这条界线写出来，否则用户会拿 1.28 m 去当扬程。 */
    if (out.design) {
      out.note = '合计 = 总管 + 主管 + 支管 的沿程与局部损失（按一条最不利路径）。' +
                 '不含静扬程、入口工作压力、过滤损失、富余水头与 1.10 安全系数 —— 完整扬程见三级页「扬程计算式」。';
    } else {
      out.note = '未取到三级计算式，合计损失暂不给出（需要三级页 computeThreeLevel 的结果）。';
    }
    return out;
  }
  function round2(v) {
    return (Math.round(Number(v) * 100) / 100).toString();
  }

  /* ── 格式化（面板与提示共用，避免两处口径不一） ─────────────────────── */
  function fmtLen(m) {
    if (m === null || m === undefined || !isFinite(m)) return '—';
    if (m < 1000) return m.toFixed(1) + ' m';
    return (m / 1000).toFixed(2) + ' km';
  }
  function fmtM(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(d === undefined ? 2 : d) + ' m';
  }
  function fmtZ(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(2) + ' m';
  }
  function fmtSigned(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + ' m';
  }
  function fmtV(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(2) + ' m/s';
  }

  /* ══════════════════════════════════════════════════════════════════════
     DOM：面板本体。挂载在宿主给的 container（.map-wrap）里，绝对定位右侧。
     所有写操作只通过 opts.onPatch(id, patch) 交给宿主 → commitTrunks；
     本模块**不直接改 entry**（entry 是库里的对象，就地改不会触发 revision 校验）。
     ══════════════════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildDom() {
    var d = document.createElement('div');
    d.className = 'ry-trunk-panel';
    d.id = 'trunkPropPanel';
    d.hidden = true;
    d.innerHTML =
      '<div class="tp-head">' +
        '<span class="tp-title">总管参数设置</span>' +
        '<button type="button" class="tp-fold" id="tpFold" title="折叠面板" aria-label="折叠或展开面板">▾</button>' +
        '<button type="button" class="tp-close" id="tpClose" title="关闭面板（不影响已保存的参数）">×</button>' +
      '</div>' +
      '<div class="tp-body">' +
        '<div class="tp-row"><span class="tp-k">管线编号</span><span class="tp-v">' +
          '<input class="tp-input" id="tpCode" type="text" maxlength="24" aria-label="管线编号"></span></div>' +
        '<div class="tp-row"><span class="tp-k">管材</span><span class="tp-v">' +
          '<select class="tp-sel" id="tpMaterial" aria-label="管材"></select></span></div>' +
        '<div class="tp-row"><span class="tp-k">管径</span><span class="tp-v">' +
          '<select class="tp-sel" id="tpDn" aria-label="管径"></select></span></div>' +
        '<div class="tp-row" id="tpDnCustomRow" hidden><span class="tp-k">自定义管径</span><span class="tp-v">' +
          '<input class="tp-input" id="tpDnCustom" type="number" min="20" max="1200" step="1" aria-label="自定义管径"><em>mm</em></span></div>' +
        '<div class="tp-row" id="tpDnAdviceRow" hidden><span class="tp-k">推算管径</span><span class="tp-v">' +
          '<b class="tp-ro" id="tpDnAdvice">—</b>' +
          '<button type="button" class="tp-adopt" id="tpDnAdopt" title="按当前地块分区推算的外径写入本线管径">采用</button>' +
        '</span></div>' +
        '<div class="tp-advice-note" id="tpDnAdviceNote" hidden></div>' +
        '<div class="tp-row"><span class="tp-k">设计流量</span><span class="tp-v">' +
          '<input class="tp-input" id="tpFlow" type="number" min="0" step="0.1" aria-label="设计流量"><em>m³/h</em></span></div>' +
        '<div class="tp-sep"></div>' +
        '<div class="tp-row"><span class="tp-k">投影长度</span><b class="tp-v tp-ro" id="tpProj">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">管线斜长</span><b class="tp-v tp-ro" id="tpSlope">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">起点高程</span><b class="tp-v tp-ro" id="tpZ0">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">终点高程</span><b class="tp-v tp-ro" id="tpZ1">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">总高差</span><b class="tp-v tp-ro" id="tpDz">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">计算流速</span><b class="tp-v tp-ro" id="tpV">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">沿程水头损失</span><b class="tp-v tp-ro" id="tpHf">—</b></div>' +
        '<div class="tp-row"><span class="tp-k">局部损失预估</span><b class="tp-v tp-ro" id="tpHj">—</b></div>' +
        '<div class="tp-sep"></div>' +
        '<div class="tp-joint" id="tpJoint">' +
          '<div class="tp-jt-h">联合复核<span class="tp-jt-sub">总管 + 下游分区管网</span></div>' +
          '<div class="tp-jt-rows" id="tpJointRows"></div>' +
          '<div class="tp-jt-checks" id="tpJointChecks"></div>' +
          '<div class="tp-jt-note" id="tpJointNote"></div>' +
        '</div>' +
      '</div>' +
      '<div class="tp-foot">' +
        '<button type="button" class="tp-btn" id="tpRecheck">重新复核水力</button>' +
        '<button type="button" class="tp-btn" id="tpMarkNode">标记该节点为水源 / 分水三通</button>' +
        '<button type="button" class="tp-btn tp-btn-quiet" id="tpWarnToggle" title="只影响这一根干线；关闭后其它干线照常提示">流速提醒：开启</button>' +
      '</div>';
    return d;
  }

  /* ══════════════════════════════════════════════════════════════════════
     面板外壳：拖拽 + 折叠（v855-panel-drag-fold）。
     只在元素上绑一次（__ryTpChrome 标记；mount 可能复用已存在的旧元素）。
   · 拖拽：按住标题栏 .tp-head 拖动（折叠/关闭按钮不触发）；首次移动时把
     right/bottom 定位切换成 inline left/top（此后 CSS 的 right/bottom 与
     PWA 安装条的 bottom:96px 规则自动失效），范围钳制在宿主 .map-wrap 内；
     位置存 localStorage('ryTrunkPanelPos')，下次打开自动恢复。
   · 折叠：#tpFold 收起/展开 .tp-body + .tp-foot，标题栏保留；
     状态存 localStorage('ryTrunkPanelFolded')。外观在 online-map.css 尾部。
     ══════════════════════════════════════════════════════════════════════ */
  function setupPanelChrome(el) {
    if (el.__ryTpChrome) return;
    el.__ryTpChrome = true;
    var POS_KEY = 'ryTrunkPanelPos', FOLD_KEY = 'ryTrunkPanelFolded';
    var head = el.querySelector('.tp-head');
    var foldBtn = el.querySelector('#tpFold');
    if (!head || !foldBtn) return;

    function setFolded(f) {
      el.classList.toggle('is-folded', !!f);
      foldBtn.textContent = f ? '▸' : '▾';
      foldBtn.title = f ? '展开面板' : '折叠面板';
      try { localStorage.setItem(FOLD_KEY, f ? '1' : '0'); } catch (e) { /* 隐私模式忽略 */ }
    }
    var folded0 = false;
    try { folded0 = localStorage.getItem(FOLD_KEY) === '1'; } catch (e) {}
    setFolded(folded0);
    foldBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      setFolded(!el.classList.contains('is-folded'));
    });

    /* 恢复上次拖出的位置（存的是相对宿主 .map-wrap 的 left/top，像素） */
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && isFinite(saved.x) && isFinite(saved.y)) {
      el.style.right = 'auto'; el.style.bottom = 'auto';
      el.style.left = saved.x + 'px'; el.style.top = saved.y + 'px';
    }

    head.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest('#tpFold,#tpClose')) return;
      var host = el.offsetParent || document.body;   /* absolute 定位的包含块（.map-wrap） */
      var hostRect = host.getBoundingClientRect();
      var r0 = el.getBoundingClientRect();
      var offX = ev.clientX - r0.left, offY = ev.clientY - r0.top;
      var moved = false;
      function clampTo(x, y) {
        var w = el.offsetWidth || r0.width, h = el.offsetHeight || r0.height;
        var maxX = Math.max(0, host.clientWidth - w);
        var maxY = Math.max(0, host.clientHeight - h);
        return [Math.min(Math.max(x, 0), maxX), Math.min(Math.max(y, 0), maxY)];
      }
      function onMove(e) {
        if (!moved) {
          moved = true;
          el.style.right = 'auto'; el.style.bottom = 'auto';
          el.style.left = (r0.left - hostRect.left) + 'px';
          el.style.top = (r0.top - hostRect.top) + 'px';
          el.classList.add('is-dragging');
        }
        var c = clampTo(e.clientX - hostRect.left - offX, e.clientY - hostRect.top - offY);
        el.style.left = c[0] + 'px'; el.style.top = c[1] + 'px';
        e.preventDefault();
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onUp, true);
        el.classList.remove('is-dragging');
        if (moved) {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify({
              x: parseFloat(el.style.left) || 0,
              y: parseFloat(el.style.top) || 0
            }));
          } catch (e) { /* 隐私模式忽略 */ }
        }
      }
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);
      ev.preventDefault();
    });
  }

  function mount(opts) {
    opts = opts || {};
    var host = opts.container;
    if (!host) return null;
    var existing = host.querySelector('#trunkPropPanel');
    var el = existing || buildDom();
    if (!existing) host.appendChild(el);
    setupPanelChrome(el);

    var curId = null;
    var api;
    var q = function (id) { return el.querySelector('#' + id); };
    var codeEl = q('tpCode'), matEl = q('tpMaterial'), dnEl = q('tpDn'),
        dnCustomRow = q('tpDnCustomRow'), dnCustomEl = q('tpDnCustom'),
        flowEl = q('tpFlow');

    /* 下拉选项一次建好；管径多一个「自定义」。 */
    matEl.innerHTML = MATERIALS.map(function (m) {
      return '<option value="' + esc(m.key) + '">' + esc(m.label) + '</option>';
    }).join('');
    dnEl.innerHTML = DN_PRESETS.map(function (v) {
      return '<option value="' + v + '">DN' + v + '</option>';
    }).join('') + '<option value="__custom">自定义…</option>';

    function patch(p) {
      if (!curId) return;
      if (typeof opts.onPatch === 'function') opts.onPatch(curId, p);
    }

    function curEntry() {
      if (!curId || typeof opts.getEntry !== 'function') return null;
      return opts.getEntry(curId);
    }

    function paint(d) {
      q('tpProj').textContent = fmtLen(d.projM);
      q('tpSlope').textContent = d.slopeM === null ? '未关联高程数据' : fmtLen(d.slopeM);
      q('tpZ0').textContent = fmtZ(d.z0);
      q('tpZ1').textContent = fmtZ(d.z1);
      q('tpDz').textContent = fmtSigned(d.dz);
      var vEl = q('tpV');
      vEl.textContent = fmtV(d.v);
      vEl.className = 'tp-v tp-ro' + (d.vLevel ? ' tp-v-' + d.vLevel : '');
      q('tpHf').textContent = fmtM(d.hf);
      q('tpHj').textContent = fmtM(d.hj);
      paintJoint(d);
    }

    /* 占位项文案：只在"外径还没选"时存在（refresh 里补的 option[value=""]）。
       有建议值就写进占位文案，没有就退回「未选择」——不动 prm.dn，不写库。 */
    function setDnPlaceholder(od) {
      var ph = dnEl && dnEl.querySelector ? dnEl.querySelector('option[value=""]') : null;
      if (!ph) return;
      ph.textContent = (od === null || od === undefined) ? '未选择' : '未选择（建议 Ø' + od + '）';
    }

    /* [v945] 推算管径行（用户 2026-11-04）：「地图上画的总管只是路由，直径要通过实际
       规划地块的分区推算出来」。数据由宿主 getOdAdvice 现算（算法在 mod/trunk-size.js：
       分区面积 → 分区流量 → 最不利组合流 → 经济流速选档 → 不小于下游主管/支管外径）。
       ★ 这里**只显示 + 一键采用**，不自动写库：自动改写会与用户手选的管径打架，
         而且面板是"看现状"的地方，静默改数据会让人以为选了没生效。
       [v947] 两处改动，都为了让"算不出来"和"算出来了但还没采用"不再无声：
         ① 反推失败时**不再整行隐藏**（以前 row.hidden=true ⇒ 用户只看到「管径 未选择」，
            连"为什么没推算"都读不到，第二次问同一个问题就是这么来的）⇒ 现在露行 + 说明原因；
         ② 管径还没选时，把建议值挂到下拉的占位项上（「未选择（建议 Ø355）」）——
            第一眼看的就是这个下拉，不写库、不抢值，只是别再让人对着「未选择」猜。 */
    function paintOdAdvice(entry) {
      var row = q('tpDnAdviceRow'), valEl = q('tpDnAdvice'), noteEl = q('tpDnAdviceNote'), btn = q('tpDnAdopt');
      if (!row || !valEl || !btn) return;
      var adv = (typeof opts.getOdAdvice === 'function') ? opts.getOdAdvice() : null;
      /* 宿主根本没给反推接口（别的页面/单测裸挂）⇒ 整行不出现，不留空壳 */
      if (!adv) {
        row.hidden = true;
        if (noteEl) noteEl.hidden = true;
        setDnPlaceholder(null);
        return;
      }
      if (adv.ok !== true) {
        row.hidden = false;
        valEl.textContent = '—';
        btn.hidden = true;
        if (noteEl) {
          noteEl.textContent = adv.text || '按当前数据推算不出管径（缺分区面积 / 滴灌参数 / 轮灌分组）。';
          noteEl.hidden = false;
        }
        setDnPlaceholder(null);
        return;
      }
      var cur = num(entry && entry.params && entry.params.dn);
      row.hidden = false;
      setDnPlaceholder(cur === null ? adv.od : null);
      valEl.textContent = 'Ø ' + adv.od + ' mm' +
        (isFinite(adv.velocity) ? '（' + Number(adv.velocity).toFixed(2) + ' m/s）' : '');
      /* 已一致就把按钮藏起来 —— 点了也不会有变化，留着反而是噪音。 */
      btn.hidden = (cur !== null && cur === adv.od);
      if (noteEl) {
        var txt = '按 ' + adv.basis + ' 反推';
        if (cur !== null && cur !== adv.od) txt += '；当前 DN' + cur + '，与推算不一致';
        noteEl.textContent = txt;
        noteEl.hidden = false;
      }
    }

    /* 联合复核渲染。每帧都重算：下游快照可能在别的页被重生成过（show/复核时都会重进这里）。
       ★ 这里只**展示** jointReview 的结论，不在这里做任何判断 —— 判断在纯函数里、Node 单测锁着。 */
    function paintJoint(d) {
      var rowsEl = q('tpJointRows'), ckEl = q('tpJointChecks'), noteEl = q('tpJointNote');
      if (!rowsEl || !ckEl || !noteEl) return;
      var layout = (typeof opts.getLayout === 'function') ? opts.getLayout() : null;
      /* 三级计算式：合计损失的唯一来源。宿主那边 getDesign 是「现算」的薄封装，
         取不到（未加载/异常）就传 null，本函数会退回只做对照。 */
      var design = (typeof opts.getDesign === 'function') ? opts.getDesign() : null;
      var jr = jointReview(curEntry(), layout, d, design);
      var T = jr.trunk, D = jr.down, G = jr.design;

      var tParts = [];
      if (T.code) tParts.push(esc(T.code));
      if (T.material) tParts.push(esc(T.material));
      if (T.dn !== null) tParts.push('DN' + T.dn);
      if (T.flow !== null) tParts.push('Q ' + round2(T.flow) + ' m³/h');
      if (T.v !== null) tParts.push(fmtV(T.v));
      if (T.hf !== null) tParts.push('损失 ' + fmtM(T.hf));

      /* [v954] 值片段包裹器：每段「数 + 单位 / 一句短说明」各自 nowrap，断行只许发生在段与段之间。
         不加这个，word-break:break-word 会把「1.91 km」拆成「1.91 / km」、「5.35 m」拆成
         「5.35 / m」—— 226px 面板里这几乎每行都会发生（用户截图指出）。
         ★ 分隔点「 · 」写进**后一段**的 span 里（见 sepJoin），否则行尾会吊一个孤零零的「·」。
         定义提到最前面：上面「总管」「下游」两行也要用。 */
      var nw = function (t, title) {
        return '<span class="tp-jt-nw"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(t) + '</span>';
      };
      /* segs: 字符串数组（空值跳过；对象形式 {t,title} 用来带悬停全文）
         → 第一段原样、后续段前面粘「· 」，段与段之间只留可断的普通空格 */
      var sepJoin = function (segs) {
        var out = [];
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          if (s === null || s === undefined || s === '') continue;
          var obj = (typeof s === 'object');
          var t = obj ? s.t : s;
          if (t === null || t === undefined || t === '') continue;
          out.push(nw((out.length ? '· ' : '') + t, obj ? s.title : null));
        }
        return out.length ? out.join(' ') : '—';
      };

      var html =
        '<div class="tp-jt-row"><span>总管</span><b>' + sepJoin(tParts) + '</b></div>' +
        '<div class="tp-jt-row"><span>下游</span><b>' + (jr.hasLayout
          ? sepJoin([
            '主管 ' + D.mainCount + ' 段',
            '支管 ' + D.branchCount + ' 段',
            D.mainMaxDn !== null ? '最大主管 DN' + D.mainMaxDn : null,
            D.lenM !== null ? '管长合计 ' + fmtLen(D.lenM) : null
          ])
          : '—') + '</b></div>';

      /* 损失拆分。三段长度口径不同，必须逐行标出来：
         总管 = 一条线（在线地图实测）、主管/支管 = 各自最不利那一条，不是地图上的管线总长。 */
      if (G) {
        /* [v954] 长度来源标签改「两个字的短词」，全文放 title：
           面板本体只有 226px，「在线地图实测」这 5 个字会把总管那一行撑到折行，
           而这一行的重点是长度与损失两个数 —— 来源是补充信息，悬停能看到全文就够。 */
        var srcTag = G.src === 'mapTrunk' ? '实测'
          : (G.src === 'figure' ? '图面' : (G.src === 'input' ? '试算' : ''));
        var srcFull = G.src === 'mapTrunk' ? '总管长度取在线地图实测'
          : (G.src === 'figure' ? '总管长度取设计图面'
            : (G.src === 'input' ? '总管长度取试算输入（尚未画总管/未生成施工图）' : ''));
        var FRONT = G.front, MAIN = G.main, BRANCH = G.branch;
        html += '<div class="tp-jt-sep"></div>' +
          '<div class="tp-jt-h2">损失拆分<span>按一条最不利路径</span></div>' +
          '<div class="tp-jt-row tp-jt-loss"><span>总管</span><b>' + sepJoin([
            fmtLen(FRONT),
            srcTag ? { t: srcTag, title: srcFull } : null,
            fmtM(G.frontLoss)
          ]) + '</b></div>' +
          '<div class="tp-jt-row tp-jt-loss"><span>主管</span><b>' +
            sepJoin([fmtLen(MAIN), fmtM(G.mainLoss)]) + '</b></div>' +
          '<div class="tp-jt-row tp-jt-loss"><span>支管</span><b>' +
            sepJoin([fmtLen(BRANCH), fmtM(G.branchLoss)]) + '</b></div>' +
          '<div class="tp-jt-row tp-jt-sum"><span>合计损失</span><b>' + nw(fmtM(G.totalLoss)) + '</b></div>' +
          '<div class="tp-jt-row"><span>管路总长</span><b>' + nw(fmtLen(G.lenSum)) + '</b></div>' +
          (G.pumpHead !== null
            ? '<div class="tp-jt-row"><span>三级页扬程</span><b>' + nw(fmtM(G.pumpHead)) + '</b></div>'
            : '');
      }
      rowsEl.innerHTML = html;

      ckEl.innerHTML = jr.checks.map(function (c) {
        return '<div class="tp-jt-check is-' + esc(c.level) + '">' + esc(c.text) + '</div>';
      }).join('');

      noteEl.textContent = jr.note || '';
      noteEl.hidden = !jr.note;
    }

    function refresh() {
      var entry = curEntry();
      if (!entry) { hide(); return; }
      var prm = entry.params || {};
      /* 用库里的真值回填，而不是回填用户上次输入的字符串：
         写库可能失败（版本冲突），面板必须显示"实际生效的是什么"。 */
      var code = (typeof prm.code === 'string' && prm.code) ? prm.code : '';
      if (document.activeElement !== codeEl) codeEl.value = code;
      matEl.value = materialOf(prm.material).key;
      var dn = num(prm.dn);
      if (dn !== null && DN_PRESETS.indexOf(dn) >= 0) {
        dnEl.value = String(dn);
        dnCustomRow.hidden = true;
      } else if (dn !== null) {
        dnEl.value = '__custom';
        dnCustomRow.hidden = false;
        if (document.activeElement !== dnCustomEl) dnCustomEl.value = String(dn);
      } else {
        dnEl.value = '';
        dnCustomRow.hidden = true;
      }
      var flow = num(prm.designFlow);
      if (document.activeElement !== flowEl) flowEl.value = flow === null ? '' : String(flow);
      /* 管径为空时 select 没有匹配项，补一个占位，免得它显示成 DN110（假值）。 */
      if (dnEl.value === '') {
        if (!dnEl.querySelector('option[value=""]')) {
          var ph = document.createElement('option');
          ph.value = ''; ph.textContent = '未选择';
          dnEl.insertBefore(ph, dnEl.firstChild);
        }
        dnEl.value = '';
      }
      paint(compute(entry));
      paintOdAdvice(entry);
      /* 屏蔽状态的唯一显示出口：用户必须能看出"这条线被我关掉提醒了"，
         否则下次复核不弹时会以为功能坏了。 */
      var wt = q('tpWarnToggle');
      if (wt) {
        var muted = prm.warnMuted === true;
        wt.textContent = '流速提醒：' + (muted ? '已屏蔽' : '开启');
        wt.classList.toggle('is-muted', muted);
        wt.setAttribute('aria-pressed', muted ? 'false' : 'true');
      }
    }

    function show(entry) {
      if (!entry || entry.id === undefined || entry.id === null) { hide(); return; }
      curId = String(entry.id);
      el.hidden = false;
      refresh();
    }
    function hide() {
      el.hidden = true;
    }
    function isOpen() { return !el.hidden; }
    function currentId() { return curId; }

    q('tpClose').onclick = function () {
      hide();
      /* 告诉宿主「是用户主动关的」—— 宿主据此不再自动弹回来，
         否则改一次管径面板就自己跳出来一次，等于关不掉。 */
      if (typeof opts.onClose === 'function') opts.onClose();
    };
    codeEl.onchange = function () {
      var v = String(codeEl.value || '').trim().slice(0, 24);
      patch({ code: v });
    };
    matEl.onchange = function () { patch({ material: matEl.value }); };
    dnEl.onchange = function () {
      if (dnEl.value === '__custom') {
        dnCustomRow.hidden = false;
        var cur = num((curEntry() || {}).params && curEntry().params.dn);
        dnCustomEl.value = cur === null ? '' : String(cur);
        dnCustomEl.focus();
        return;
      }
      dnCustomRow.hidden = true;
      patch({ dn: dnEl.value === '' ? null : Number(dnEl.value) });
    };
    dnCustomEl.onchange = function () {
      var v = num(dnCustomEl.value);
      if (v === null || !(v > 0)) { patch({ dn: null }); return; }
      patch({ dn: v });
    };
    flowEl.onchange = function () {
      var v = num(flowEl.value);
      patch({ designFlow: (v === null || v < 0) ? null : v });
    };
    q('tpRecheck').onclick = function () {
      if (!curId) return;
      if (typeof opts.onRecheck === 'function') opts.onRecheck(curId);
      refresh();
    };
    q('tpDnAdopt').onclick = function () {
      var adv = (typeof opts.getOdAdvice === 'function') ? opts.getOdAdvice() : null;
      if (!adv || adv.ok !== true) return;
      var entry = curEntry();
      var prm = (entry && entry.params) || {};
      var delta = { dn: adv.od };
      /* 设计流量只在**用户没填**时顺带写入（它就是推算用的合流 Q）；
         已经填过的一律不动 —— 用户的实测/经验值优先。 */
      if (num(prm.designFlow) === null && adv.flow > 0) delta.designFlow = Math.round(adv.flow * 10) / 10;
      patch(delta);
      refresh();
    };
    q('tpMarkNode').onclick = function () {
      if (!curId) return;
      if (typeof opts.onMarkNode === 'function') opts.onMarkNode(curId);
    };
    q('tpWarnToggle').onclick = function () {
      var entry = curEntry();
      if (!entry) return;
      var muted = !!(entry.params && entry.params.warnMuted === true);
      /* 反向写回：true/false 都要落库。只写 true、取消时"不写"，会让用户点了没反应
         （normalize 里 false 会被删掉，但那是"存了等于没存"，不是"没存"）。 */
      patch({ warnMuted: !muted });
    };

    api = {
      el: el,
      show: show,
      hide: hide,
      refresh: refresh,
      isOpen: isOpen,
      currentId: currentId
    };
    return api;
  }

  root.RyTrunkPanel = {
    VERSION: VERSION,
    MATERIALS: MATERIALS,
    DN_PRESETS: DN_PRESETS,
    NODE_TYPES: NODE_TYPES,
    V_ECON_MIN: V_ECON_MIN,
    V_ECON_MAX: V_ECON_MAX,
    V_BAD: V_BAD,
    WARN_TEXT: WARN_TEXT,
    shouldWarn: shouldWarn,
    jointReview: jointReview,
    designBlock: designBlock,
    segLenOf: segLenOf,
    haversine: haversine,
    compute: compute,
    fmtLen: fmtLen,
    fmtM: fmtM,
    fmtZ: fmtZ,
    fmtSigned: fmtSigned,
    fmtV: fmtV,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
