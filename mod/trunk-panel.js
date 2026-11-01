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

  var VERSION = 1;

  /* 海曾-威廉 C 值：PE 140 / PVC-U 145 / 镀锌钢管 120。
     这几个数是「管材联动沿程损失系数」的唯一实现点，别在别处再写一份。 */
  var MATERIALS = [
    { key: 'PE',    label: 'PE管',     hwC: 140 },
    { key: 'PVC-U', label: 'PVC-U',    hwC: 145 },
    { key: 'GI',    label: '镀锌钢管',  hwC: 120 }
  ];
  var DN_PRESETS = [110, 125, 160, 200];

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
     而在线地图的 `map.distance` 依赖 L 与实例。R 取 IUGG 平均半径，
     与 Leaflet 的 6371000 差 8.8 m 半径 ⇒ 300 m 上差 4 mm，可忽略。 */
  function haversine(a, b) {
    var R = 6371008.8;
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLng / 2);
    var h = s1 * s1 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * s2 * s2;
    if (h < 0) h = 0;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
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
   * ★ 本版**只对照、不合计**，这是有意的，不是半成品：
   *   「系统总损失 = 总管 hf + 下游最不利路径」听着简单，但**总管流量取哪个数**没有定论：
   *   面板上的 designFlow 是用户填的设计依据，下游快照里的 segments[].q 是三级页算出来的
   *   实际值，两者可以不一样（而且经常不一样）。随便挑一个相加，结果会被当成"复核结论"用；
   *   错在口径上比错在算术上更难发现。
   *   ⇒ 先把两边的数并排放，只指认**必然不成立**的不自洽：
   *     ① 总管比最大主管还细（总管不可能比它供的管子细）
   *     ② 总管设计流量小于下游最大段流量（同理）
   *     ★ 不做「Σ segments[].q」——并联支管的流量相加是重复计数，那个数看着像总流量，
   *       其实没有物理意义。取**最大段流量**当下限才是安全的。
   *   合计等口径定下来再做（AGENT_HANDOFF §26.81）。
   *
   * layout = RyIrrigationDataStore 的管网快照：
   *   { plotId, segments:[{id,name,dn,kind,len,q,latLng}], valves, dripTapes }
   *   宿主传入前已做地块绑定校验；不属于本块时传 { mismatch:true, plotId } 而不是 null，
   *   这样面板能说清"为什么没有下游数据"，而不是让人以为"下游没做"。
   */
  function kindOf(seg) {
    var k = seg && seg.kind;
    if (k === 'front' || k === 'main' || k === 'branch') return k;
    var tag = String((seg && (seg.id || seg.name)) || '');
    if (tag.indexOf('front') === 0) return 'front';
    if (tag.indexOf('branch') === 0) return 'branch';
    if (tag.indexOf('main') === 0) return 'main';
    return 'other';
  }

  function jointReview(entry, layout, derived) {
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
      down: { segCount: 0, mainCount: 0, branchCount: 0, mainMaxDn: null, lenM: null, qMax: null },
      checks: [],
      note: ''
    };

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

    var mainMax = null, lenSum = 0, lenAll = true, qMax = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], k = kindOf(s);
      if (k !== 'front') {
        out.down.segCount++;
        if (k === 'main') {
          out.down.mainCount++;
          var dn = num(s.dn);
          if (dn !== null && dn > 0 && (mainMax === null || dn > mainMax)) mainMax = dn;
        } else if (k === 'branch') out.down.branchCount++;
        var q = num(s.q);
        if (q !== null && q > 0 && (qMax === null || q > qMax)) qMax = q;
      }
      var L = num(s.len);
      if (L === null || L < 0) lenAll = false; else lenSum += L;
    }
    out.down.mainMaxDn = mainMax;
    out.down.lenM = lenAll ? lenSum : null;
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

    out.note = '合计损失暂不给出：总管流量取设计值还是下游实际值尚未定口径，本版只做对照。';
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

  function mount(opts) {
    opts = opts || {};
    var host = opts.container;
    if (!host) return null;
    var existing = host.querySelector('#trunkPropPanel');
    var el = existing || buildDom();
    if (!existing) host.appendChild(el);

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

    /* 联合复核渲染。每帧都重算：下游快照可能在别的页被重生成过（show/复核时都会重进这里）。
       ★ 这里只**展示** jointReview 的结论，不在这里做任何判断 —— 判断在纯函数里、Node 单测锁着。 */
    function paintJoint(d) {
      var rowsEl = q('tpJointRows'), ckEl = q('tpJointChecks'), noteEl = q('tpJointNote');
      if (!rowsEl || !ckEl || !noteEl) return;
      var layout = (typeof opts.getLayout === 'function') ? opts.getLayout() : null;
      var jr = jointReview(curEntry(), layout, d);
      var T = jr.trunk, D = jr.down;

      var tParts = [];
      if (T.code) tParts.push(esc(T.code));
      if (T.material) tParts.push(esc(T.material));
      if (T.dn !== null) tParts.push('DN' + T.dn);
      if (T.flow !== null) tParts.push('Q ' + round2(T.flow) + ' m³/h');
      if (T.v !== null) tParts.push(fmtV(T.v));
      if (T.hf !== null) tParts.push('损失 ' + fmtM(T.hf));
      rowsEl.innerHTML =
        '<div class="tp-jt-row"><span>总管</span><b>' + (tParts.length ? tParts.join(' · ') : '—') + '</b></div>' +
        '<div class="tp-jt-row"><span>下游</span><b>' + (jr.hasLayout
          ? ('主管 ' + D.mainCount + ' 段 · 支管 ' + D.branchCount + ' 段' +
             (D.mainMaxDn !== null ? ' · 最大主管 DN' + D.mainMaxDn : '') +
             (D.lenM !== null ? ' · 总长 ' + fmtLen(D.lenM) : ''))
          : '—') + '</b></div>';

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
