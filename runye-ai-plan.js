/* [v251 2026-10-05] AI 灌溉方案规划 · 本地测试版
   网页端只做两件事：① 把「地块坐标 + 面积 + 地形 + 需求文字」拼成一段提示词文本导出；
   ② 导入本地 Python 脚本调用大模型后返回的 JSON，校验后写回现有输入框并调用现有
   calcPlan()（布管 + 水力计算 + 渲染），不改任何原有引擎代码。
   网页端不调用任何大模型 API。
   面板形态沿用 v245「手动地形高程」：左侧栏内联折叠面板，不用弹窗。
   [v253 2026-10-05] 悬浮面板化（用户要求）：从左侧栏拿出来 → 制图区右上角常驻浮层，
   对齐三级页「图层控制」面板同款属性（拖动/双击复位/单击折叠/↔调宽/记忆/手机默认折叠）；
   左栏 .ai-open 触发按钮移除，position:fixed 跨页常驻。缓存 js?v=255、css?v=254，PWA v18。
   [v255 2026-10-06 用户要求] 上云端：面板新增【在线生成】——把「地块多边形 + 面积 + 坡度 + 需求文字」
   POST 给 Vercel Serverless 函数 api/plan.js（函数里读 DeepSeek Key、做次数校验、调大模型、
   JSON 校验、扣次数、回传 JSON）；拿到结果后走既有的 validate → apply → calcPlan 通道出图。
   网页端依旧不持有任何密钥；离线流程（导出文本 → 本地脚本 → 导入 JSON）完整保留作回退。
   user_id 由浏览器首次生成后存 localStorage；接口地址可用面板底部输入框覆盖后存 localStorage。
   [v256 2026-10-06] 接口换成 Vercel 的 api/ai-irrigation.js（模型 deepseek-reasoner / temperature 0.1）：
     返回格式改为 {code, msg, data(JSON 字符串), quota_left}；测试期每人 5 次由云端写死。
     前端拿到 data 字符串后仍走既有的 parse → validate → apply → calcPlan 通道，绘图引擎一行未动。 */
(function (root) {
  'use strict';
  var MU_TO_SQM = 666.67;
  var SCHEMA_VERSION = 1;
  var STORE_KEY = 'runye_ai_plan_v1';

  /* 字段定义：key / 中文名 / 单位 / 工程合理范围 / 是否必填 / 默认值 / 落地输入框 id
     落地 id 全部是现有页面已有输入框 —— 导入只写值 + 调 calcPlan()，不新增引擎逻辑。 */
  var FIELDS = [
    { key: 'tape_spacing', name: '滴灌带间距', unit: 'm', min: 0.1, max: 3, required: true, ids: ['planTapeSpacing'] },
    { key: 'emitter_spacing', name: '滴孔间距', unit: 'm', min: 0.05, max: 2, required: true, ids: ['planEmitterSpacing'] },
    { key: 'emitter_flow', name: '滴头流量', unit: 'L/h', min: 0.2, max: 8, required: true, ids: ['planEmitterFlow'] },
    { key: 'tape_lay_side', name: '单边铺设长度', unit: 'm', min: 10, max: 300, def: 100, ids: ['planTapeLaySide'] },
    { key: 'zone_mu', name: '单区亩数', unit: '亩/区', min: 0.5, max: 200, def: 18, ids: ['planZoneMuManual'] },
    { key: 'src_distance', name: '水源距离', unit: 'm', min: 0, max: 2000, def: 0, ids: ['planSrcDist'] },
    { key: 'pump_lift', name: '水泵提升高度', unit: 'm', min: 0, max: 300, def: 5, ids: ['fld_lift', 'planLift'] },
    { key: 'terrain_dh', name: '地形高差', unit: 'm', min: -200, max: 300, def: 5, ids: ['fld_dh', 'planDh'] },
    { key: 'tape_pressure', name: '入口压力', unit: 'bar', min: 0, max: 10, def: 1, ids: ['fld_tapePressure', 'planTapePressure'] },
    { key: 'target_velocity', name: '目标流速', unit: 'm/s', min: 0.3, max: 5, def: 1.5, ids: ['planTargetV'] }
  ];
  /* 仅供参考字段：不写回引擎（管径由水力计算按流量/流速选定），导入后与计算结果比对并提示 */
  var ADVISORY = [
    { key: 'main_pipe_od', name: '主管外径', unit: 'mm', min: 32, max: 500 },
    { key: 'branch_pipe_od', name: '支管外径', unit: 'mm', min: 16, max: 400 }
  ];
  /* 同义字段名（容忍上一版规范 / 中文键 / 驼峰） */
  var ALIAS = {
    tape_spacing: ['tape_spacing', 'tapeSpacing', 'dripSpacing', '滴灌带间距', '滴灌管间距', '毛管间距'],
    emitter_spacing: ['emitter_spacing', 'emitterSpacing', '滴孔间距', '滴头间距'],
    emitter_flow: ['emitter_flow', 'emitterFlow', '滴头流量', '滴孔流量'],
    tape_lay_side: ['tape_lay_side', 'tapeLaySide', '单边铺设长度', '铺设长度'],
    zone_mu: ['zone_mu', 'zoneMu', 'zoneAreaMu', '单区亩数', '分区亩数', '单区面积'],
    src_distance: ['src_distance', 'srcDistance', '水源距离'],
    pump_lift: ['pump_lift', 'pumpLift', 'lift', '水泵提升高度', '提升高度'],
    terrain_dh: ['terrain_dh', 'terrainDh', 'dh', '地形高差', '高差'],
    tape_pressure: ['tape_pressure', 'tapePressure', 'inletPressure', '入口压力', '入口工作压力'],
    target_velocity: ['target_velocity', 'targetVelocity', '目标流速', '设计流速'],
    main_pipe_od: ['main_pipe_od', 'mainPipeOd', 'mainOD', '主管外径', '主管管径', '主管'],
    branch_pipe_od: ['branch_pipe_od', 'branchPipeOd', 'branchOD', '支管外径', '支管管径', '支管']
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function toNum(v) {
    if (isNum(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') { var text = v.trim(); if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null; var n = Number(text); return isFinite(n) ? n : null; }
    return null;
  }
  function pick(src, key) {
    if (!src || typeof src !== 'object') return undefined;
    var names = ALIAS[key] || [key];
    for (var i = 0; i < names.length; i++) if (src[names[i]] !== undefined && src[names[i]] !== null && src[names[i]] !== '') return src[names[i]];
    return undefined;
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  /* ---------- 1. 解析 + 校验（纯函数，可在 node 下单测） ---------- */
  function stripFences(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return '';
    var fence = s.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    if (fence && fence[1]) return fence[1].trim();
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a > 0 && b > a) return s.slice(a, b + 1);   /* 模型前后加了说明文字时兜底截取 */
    return s;
  }
  function parse(text) {
    var s = stripFences(text);
    if (!s) return { ok: false, kind: 'format', msg: '导入内容为空：请把大模型返回的完整 JSON 粘贴进来。' };
    var data;
    try { data = JSON.parse(s); }
    catch (e) { return { ok: false, kind: 'format', msg: 'JSON 格式错误：' + String(e && e.message || e) + '。请粘贴完整 JSON（以 { 开头、以 } 结尾）。' }; }
    return validate(data);
  }
  function validate(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, kind: 'format', msg: 'JSON 格式错误：顶层应为对象，例如 {"version":1,"design":{...},"remark":"..."}。' };
    if (data.version != null && data.version !== SCHEMA_VERSION) return { ok: false, kind: 'format', msg: '不支持此方案版本，请使用 version: 1。' };
    var box = (data.design && typeof data.design === 'object') ? data.design : data;
    var design = {}, missing = [], bad = [], warn = [];
    FIELDS.forEach(function (f) {
      var raw = pick(box, f.key);
      if (raw === undefined) {
        if (f.required) missing.push(f.name);
        return;
      }
      var v = toNum(raw);
      if (v === null) { bad.push(f.name + ' 不是数值（' + raw + '）'); return; }
      if (v < f.min || v > f.max) { bad.push(f.name + ' ' + v + ' ' + f.unit + '（工程合理范围 ' + f.min + '–' + f.max + ' ' + f.unit + '）'); return; }
      design[f.key] = v;
    });
    ADVISORY.forEach(function (f) {
      var raw = pick(box, f.key);
      if (raw === undefined) return;
      var v = toNum(raw);
      if (v === null) { warn.push(f.name + ' 不是数值，已忽略'); return; }
      if (v < f.min || v > f.max) { warn.push(f.name + ' ' + v + ' ' + f.unit + ' 超出常见范围 ' + f.min + '–' + f.max + ' ' + f.unit + '，仅供参考'); return; }
      design[f.key] = v;
    });
    if (missing.length) return { ok: false, kind: 'missing', msg: 'AI 方案参数不全：缺少 ' + missing.join('、') + '。请让模型补全后重新导入。', missing: missing };
    if (bad.length) return { ok: false, kind: 'range', msg: 'AI 方案参数超出工程合理范围：' + bad.join('；') + '。已拒绝渲染图纸，请修正后重新导入。', bad: bad };
    var plot = (data.plot && typeof data.plot === 'object') ? data.plot : {};
    var area = toNum(pick(plot, 'area_m2'));
    var slope = toNum(pick(plot, 'slope_percent'));
    var risks = Array.isArray(data.risks) ? data.risks.filter(function (x) { return typeof x === 'string' && x.trim(); }).map(function (x) { return x.trim(); }) : [];
    return {
      ok: true,
      plan: {
        version: SCHEMA_VERSION,
        design: design,
        plot: { area_m2: area, slope_percent: slope },
        remark: typeof data.remark === 'string' ? data.remark.trim() : '',
        risks: risks,
        warnings: warn
      }
    };
  }

  /* ---------- 2. 地块信息采集 ---------- */
  function el(id) { return root.document ? root.document.getElementById(id) : null; }
  function domNum(id, fallback) {
    var node = el(id);
    if (!node || node.value.trim() === '') return fallback;
    var v = Number(node.value);
    return isFinite(v) ? v : fallback;
  }
  function collect() {
    var poly = [];
    if (root.measuredPolygon && root.measuredPolygon.length >= 3) {
      poly = root.measuredPolygon.map(function (p) { return { x: r2(+p.x || 0), y: r2(+p.y || 0) }; });
    } else if (root.ppState && root.ppState.polyPts && root.ppState.polyPts.length >= 3) {
      poly = root.ppState.polyPts.map(function (p) { return { x: r2(+p.x || 0), y: r2(+p.y || 0) }; });
    }
    var groups = [], ge = root.__runyeGroupEdit;
    if (ge && ge.active && ge.mode !== 'perPlot' && Array.isArray(root.__runyeSubPlots)) {
      groups = root.__runyeSubPlots.map(function (p) { return { name: p.name || '地块', poly: (p.poly || []).map(function (v) { return { x: +v.x, y: +v.y }; }) }; });
    }
    function polygonArea(ring) { var sum = 0; for (var k = 0, j = ring.length - 1; k < ring.length; j = k++) sum += ring[j].x * ring[k].y - ring[k].x * ring[j].y; return Math.abs(sum / 2); }
    var area = isNum(root.measuredArea) ? root.measuredArea : 0;
    if (area <= 0 && poly.length >= 3) {
      var s = 0;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
      area = Math.abs(s / 2);
    }
    if (groups.length) area = groups.reduce(function (sum, p) { return sum + polygonArea(p.poly); }, 0);
    var bb = { w: 0, h: 0 };
    if (poly.length) {
      var xs = poly.map(function (p) { return p.x; }), ys = poly.map(function (p) { return p.y; });
      bb.w = r2(Math.max.apply(null, xs) - Math.min.apply(null, xs));
      bb.h = r2(Math.max.apply(null, ys) - Math.min.apply(null, ys));
    }
    var dhFallback = domNum('planDh', domNum('fld_dh', 5));
    var dh = root.RyTerrain && typeof root.RyTerrain.resolveDh === 'function' ? root.RyTerrain.resolveDh(dhFallback, false) : dhFallback;
    var lift = domNum('planLift', domNum('fld_lift', 5));
    var slope = null; // 水源相对高差不能推导地块坡度，需实测坡向与水平距离。
    return {
      poly: poly, groups: groups, area_m2: r2(area), mu: r2(area / MU_TO_SQM), bbox_w: bb.w, bbox_h: bb.h,
      terrain_dh: r2(dh), slope_percent: slope,
      pump_lift: lift, src_distance: domNum('planSrcDist', 0), tape_pressure: domNum('planTapePressure', domNum('fld_tapePressure', 1)),
      cur: {
        tape_spacing: domNum('planTapeSpacing', 0.4), emitter_spacing: domNum('planEmitterSpacing', 0.3),
        emitter_flow: domNum('planEmitterFlow', 0.8), tape_lay_side: domNum('planTapeLaySide', 100),
        zone_mu: domNum('planZoneMuManual', 18), target_velocity: domNum('planTargetV', 1.5)
      }
    };
  }

  /* ---------- 3. 导出提示词文本 ---------- */
  function schemaHint() {
    var design = { tape_spacing: 0.4, emitter_spacing: 0.3, emitter_flow: 0.8 };
    FIELDS.forEach(function (f) { if (isNum(f.def)) design[f.key] = f.def; });
    design.main_pipe_od = 160; design.branch_pipe_od = 90;
    return JSON.stringify({ version: 1, design: design, remark: '方案说明', risks: ['风险提示'] }, null, 2);
  }

  function buildPrompt(reqText) {
    var c = collect();
    var pts = c.poly.map(function (p) { return '(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')'; }).join(',');
    var L = [];
    L.push('# 润野灌溉 · 地块与需求（AI 规划输入）');
    L.push('');
    L.push('## 一、地块几何');
    L.push('- 面积：' + (c.area_m2 > 0 ? c.area_m2.toFixed(1) + ' m²（' + c.mu.toFixed(2) + ' 亩）' : '未测量（请先在工具里手绘地块边界并确认面积）'));
    L.push('- 外接矩形：' + c.bbox_w.toFixed(1) + ' m × ' + c.bbox_h.toFixed(1) + ' m');
    L.push('- 顶点数：' + c.poly.length + '（平面相对坐标，单位 m，按手绘顺序）');
    L.push('- 顶点坐标：[' + (pts || '（无）') + ']');
    L.push('');
    if (c.groups.length) { L.push('成组面积为各子地块面积之和，不含地块之间的空隙；以下子地块边界用于规划，外框仅供定位：'); c.groups.forEach(function (p) { L.push('- ' + p.name + '：' + JSON.stringify(p.poly)); }); }
    L.push('## 二、地形与水源');
    L.push('- 地形高差：' + c.terrain_dh.toFixed(2) + ' m' + (c.slope_percent != null ? '（估算坡度 ' + c.slope_percent.toFixed(2) + '%）' : ''));
    L.push('- 坡度与坡向：未测量，请勿根据水源高差或地块面积推算。');
    L.push('- 水泵提升高度：' + c.pump_lift + ' m');
    L.push('- 水源距离：' + c.src_distance + ' m');
    L.push('- 滴灌带入口工作压力：' + c.tape_pressure + ' bar');
    L.push('');
    L.push('## 三、灌溉需求（用户填写）');
    L.push(String(reqText && reqText.trim() ? reqText.trim() : '（用户未填写，请按地块条件给出常规滴灌方案）'));
    L.push('');
    L.push('## 四、当前设计参数（可在此基础上调整）');
    L.push('- 滴灌带间距 ' + c.cur.tape_spacing + ' m；滴孔间距 ' + c.cur.emitter_spacing + ' m；滴头流量 ' + c.cur.emitter_flow + ' L/h');
    L.push('- 单边铺设长度 ' + c.cur.tape_lay_side + ' m；单区 ' + c.cur.zone_mu + ' 亩；目标流速 ' + c.cur.target_velocity + ' m/s');
    L.push('');
    L.push('## 五、输出要求');
    L.push('只输出一个 JSON 对象，不要解释文字，字段与取值如下（单位固定）：');
    L.push(schemaHint());
    L.push('');
    L.push('约束：tape_spacing 0.1~3；emitter_spacing 0.05~2；emitter_flow 0.2~8；tape_lay_side 10~300；');
    L.push('zone_mu 0.5~200；src_distance 0~2000；pump_lift 0~300；terrain_dh -200~300；');
    L.push('tape_pressure 0~10；target_velocity 0.3~5。remark 写方案说明，risks 写风险提示。');
    return L.join('\n');
  }

  /* ---------- 4. 应用（写现有输入框 + 调现有 calcPlan） ---------- */
  function apply(plan) {
    if (!root.document) return { ok: false, kind: 'nodom', msg: '当前环境不支持渲染。' };
    if (!plan || !plan.design) return { ok: false, kind: 'missing', msg: 'AI 方案参数不全：没有 design 字段。' };
    var checked = validate(plan); if (!checked.ok) return checked; plan = checked.plan;
    if (typeof root.calcPlan !== 'function') return { ok: false, kind: 'nodom', msg: '未找到计算入口 calcPlan()，请确认页面已完整加载。' };
    var c = collect();
    if (!(c.area_m2 > 0)) return { ok: false, kind: 'noplot', msg: '尚未绘制地块：请先在画布上描绘地块边界并确认面积，再导入方案。' };
    var d = plan.design, written = [], terrainOverride = root.RyTerrain && root.RyTerrain.exportState().enabled && isNum(d.terrain_dh);
    if (terrainOverride) delete d.terrain_dh;
    FIELDS.forEach(function (f) {
      var v = d[f.key];
      if (!isNum(v)) return;
      f.ids.forEach(function (id) {
        var node = el(id);
        if (!node) return;
        node.value = String(v);
      });
      written.push(f.name + ' ' + v + ' ' + f.unit);
    });
    if (isNum(d.zone_mu)) { var mode = el('planZoneMode'); if (mode) mode.value = 'manual'; }
    if (typeof root.calcPlan !== 'function') return { ok: false, kind: 'nodom', msg: '未找到计算入口 calcPlan()，请确认页面已完整加载。' };
    root.calcPlan();
    /* 成组页在编辑态时，同步刷新成组视图（沿用 RyTerrain 的刷新约定） */
    if (root.__runyeGroupEdit && root.__runyeGroupEdit.active && typeof root.grRefreshGroupPage === 'function') {
      try { root.grRefreshGroupPage(); } catch (e) { }
    }
    var pd = root.planData || null, warnings = (plan.warnings || []).slice();
    if (terrainOverride) warnings.push('已保留手动高程数据；AI 地形高差未覆盖测量设置。');
    if (pd) {
      if (isNum(d.main_pipe_od) && isNum(pd.mainPipeODValue) && Math.abs(pd.mainPipeODValue - d.main_pipe_od) > 1) {
        warnings.push('模型建议主管外径 ' + d.main_pipe_od + ' mm，工具按流量与流速算得 ' + pd.mainPipeODValue + ' mm（以水力计算为准）');
      }
      if (isNum(d.branch_pipe_od) && isNum(pd.branchPipeODValue) && Math.abs(pd.branchPipeODValue - d.branch_pipe_od) > 1) {
        warnings.push('模型建议支管外径 ' + d.branch_pipe_od + ' mm，工具按流量与流速算得 ' + pd.branchPipeODValue + ' mm（以水力计算为准）');
      }
    }
    if (isNum(plan.plot && plan.plot.area_m2) && Math.abs(plan.plot.area_m2 - c.area_m2) / Math.max(c.area_m2, 1) > 0.5) {
      warnings.push('方案里的地块面积 ' + plan.plot.area_m2.toFixed(1) + ' m² 与当前实测 ' + c.area_m2.toFixed(1) + ' m² 相差较大，请核对是否为同一地块');
    }
    return {
      ok: true, written: written, warnings: warnings,
      summary: pd ? { pumpFlow: pd.zoneFlow, pumpHead: pd.pumpHead, mainOD: pd.mainPipeODValue, branchOD: pd.branchPipeODValue, zones: pd.zoneCols + '×' + pd.zoneRows } : null
    };
  }

  /* ---------- 4.5 云端接口（v255）：user_id / 接口地址 / POST ---------- */
  var UID_KEY = 'runye_ai_uid', API_CFG_KEY = 'runye_ai_api_base';
  var DEFAULT_API = 'https://runye-irrigation.vercel.app/api/ai-irrigation';
  function apiBase() {
    try { var v = root.localStorage.getItem(API_CFG_KEY); if (v && /^https?:\/\//.test(v)) return v; } catch (e) { }
    return DEFAULT_API;
  }
  /* user_id：本机首次生成后常驻 localStorage，只用于次数统计，不含任何个人信息 */
  function uid() {
    try {
      var u = root.localStorage.getItem(UID_KEY);
      if (!u) { u = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); root.localStorage.setItem(UID_KEY, u); }
      return u;
    } catch (e) { return 'u_web_anonymous'; }
  }
  function postPlan(url, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (typeof root.fetch !== 'function') { reject(new Error('当前浏览器不支持 fetch，请更新浏览器或改用离线流程')); return; }
      var ctrl = (typeof root.AbortController === 'function') ? new root.AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { } }
        reject(new Error('请求超时（' + Math.round(timeoutMs / 1000) + ' 秒未返回）'));
      }, timeoutMs);
      var init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
      if (ctrl) init.signal = ctrl.signal;
      root.fetch(url, init).then(function (r) {
        return r.text().then(function (t) {
          var d = null;
          try { d = JSON.parse(t); } catch (e) { }
          if (!d) throw new Error('云端返回不是 JSON（HTTP ' + r.status + '）：' + String(t).slice(0, 120));
          resolve(d);
        });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return;   /* 已由超时分支 reject */
        reject(new Error((e && e.message) ? e.message : String(e)));
      }).then(function () { clearTimeout(timer); });
    });
  }
  /* [v256] 新接口的错误码（{code,msg}）→ 一句「接下来怎么办」 */
  function errHint(code) {
    var H = {
      400: '（请求参数不对：请确认已画好地块、需求已填写）',
      403: '（网页域名不在接口白名单：核对接口地址是不是本项目自己的 Vercel 域名）',
      405: '（接口只接受 POST，多半是地址填错了）',
      413: '（地块顶点太多，请简化边界后重试）',
      422: '（大模型这次没按要求输出 JSON，本次不扣次数，可再点一次）',
      429: '（次数已用完，或上游限流：稍后再试；测试期每人 5 次）',
      500: '（服务端未配置 DeepSeek 密钥：需到 Vercel 项目里添加 DEEPSEEK_API_KEY 后重新部署）',
      502: '（上游大模型调用失败：常见原因是余额不足或网络问题）',
      504: '（推理模型较慢、这次超时了，可再点一次）'
    };
    return H[code] ? ' ' + H[code] : '';
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION, FIELDS: FIELDS, ADVISORY: ADVISORY,
    parse: parse, validate: validate, collect: collect, buildPrompt: buildPrompt, apply: apply, schemaHint: schemaHint
  };
  root.RyAiPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;

  /* ---------- 5. 面板 UI（左侧栏内联折叠，风格对齐「手动地形高程」） ---------- */
  var doc = root.document, panel, openBtn, store = { req: '', remark: '', risks: [] };
  try { var saved = JSON.parse(root.localStorage.getItem(STORE_KEY) || 'null'); if (saved && typeof saved === 'object') store = { req: saved.req || '', remark: saved.remark || '', risks: Array.isArray(saved.risks) ? saved.risks : [] }; } catch (e) { }
  function persist() { try { root.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function renderRemark() {
    var box = panel.querySelector('[data-ai="remark"]');
    if (!box) return;
    if (!store.remark && !store.risks.length) { box.hidden = true; box.innerHTML = ''; return; }
    var h = '<div class="ai-block"><div class="ai-block-head"><span>AI 方案备注</span></div>';
    if (store.remark) h += '<div class="ai-remark-text">' + esc(store.remark).replace(/\n/g, '<br>') + '</div>';
    if (store.risks.length) h += '<ul class="ai-risk">' + store.risks.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
    h += '</div>';
    box.hidden = false; box.innerHTML = h;
  }
  function setStatus(msg, isErr) {
    var s = panel.querySelector('[data-ai="status"]');
    if (!s) return;
    s.textContent = msg || '';
    s.className = 'ai-status' + (isErr ? ' ai-err' : '');
  }
  /* [v253 2026-10-05 用户要求] 悬浮面板化——对齐三级页「图层控制」面板（#tlWsLayerPanel）同款属性：
     标题栏 拖动=移动 / 双击=回右上默认位 / 单击=折叠展开；↔ 手柄调宽 200~480px；
     位置/宽度 localStorage 记忆；fixed 定位跨页常驻（03/04/成组页都可用）。 */
  var POS_KEY = 'runye_aiPanel_pos', W_KEY = 'runye_aiPanel_w';
  var collapsed = false, manualPos = false;
  function setCollapsed(c) {
    collapsed = !!c;
    if (!panel) return;
    var body = panel.querySelector('.ai-body'), caret = panel.querySelector('[data-caret]');
    if (body) body.style.display = collapsed ? 'none' : '';
    if (caret) caret.textContent = collapsed ? '\u25b8' : '\u25be';
  }
  function refresh() {
    if (!panel) return;
    renderRemark();
  }
  function doExport() {
    var req = panel.querySelector('[data-ai="req"]').value;
    store.req = req; persist();
    var text = buildPrompt(req);
    var slot = panel.querySelector('[data-ai="slot"]');
    slot.innerHTML = '<div class="ai-block"><div class="ai-block-head"><span>导出文本 · 复制后进本地 Python 脚本</span>' +
      '<span><button type="button" data-ai="copy">复制</button><button type="button" data-ai="close">收起</button></span></div>' +
      '<textarea class="ai-text ai-out" data-ai="out" readonly rows="10"></textarea></div>';
    var out = slot.querySelector('[data-ai="out"]');
    out.value = text;
    slot.querySelector('[data-ai="copy"]').onclick = function () {
      out.focus(); out.select(); try { out.setSelectionRange(0, out.value.length); } catch (e) { }
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { }
      if (!ok && root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(text).then(function () { setStatus('已复制到剪贴板。'); }, function () { setStatus('自动复制失败，请手动全选后 Ctrl+C。'); });
        return;
      }
      setStatus(ok ? '已复制到剪贴板。' : '自动复制失败，请手动全选后 Ctrl+C。');
    };
    slot.querySelector('[data-ai="close"]').onclick = function () { slot.innerHTML = ''; setStatus(''); };
    setStatus('已生成导出文本（' + text.length + ' 字）：地块坐标 + 面积 + 地形 + 需求。');
  }
  function doImport() {
    var slot = panel.querySelector('[data-ai="slot"]');
    slot.innerHTML = '<div class="ai-block"><div class="ai-block-head"><span>粘贴大模型返回的完整 JSON</span>' +
      '<span><button type="button" data-ai="confirm">确认导入</button><button type="button" data-ai="cancel">取消</button></span></div>' +
      '<textarea class="ai-text ai-json" data-ai="json" rows="10" spellcheck="false" placeholder=\'{"version":1,"design":{"tape_spacing":0.7,"emitter_spacing":0.3,"emitter_flow":0.8,"zone_mu":18},"remark":"...","risks":["..."]}\'></textarea></div>';
    var ta = slot.querySelector('[data-ai="json"]');
    slot.querySelector('[data-ai="cancel"]').onclick = function () { slot.innerHTML = ''; setStatus(''); };
    slot.querySelector('[data-ai="confirm"]').onclick = function () {
      var res = parse(ta.value);
      if (!res.ok) { setStatus(res.msg, true); return; }
      var ap = apply(res.plan);
      if (!ap.ok) { setStatus(ap.msg, true); return; }
      store.remark = res.plan.remark || '';
      store.risks = (res.plan.risks || []).concat(ap.warnings || []);
      persist(); renderRemark();
      slot.innerHTML = '';
      var s = ap.summary;
      var cur = doc.querySelector('.ry-sec.ry-active');
      var hint = (cur && cur.id !== 'pipePlanSection' && cur.id !== 'grPipeSection') ? '已写入参数，请切到「04 二级管路规划」查看图纸。' : '';
      setStatus('已导入并渲染：' + ap.written.join('；') + (s ? '。计算结果：主管 Ø' + s.mainOD + ' mm、支管 Ø' + s.branchOD + ' mm、分区 ' + s.zones + '、水泵扬程 ' + (isNum(s.pumpHead) ? s.pumpHead.toFixed(1) : '—') + ' m。' : '。') + hint);
    };
    ta.focus();
    setStatus('粘贴 JSON 后点「确认导入」；参数超出工程合理范围会拒绝渲染。');
  }
  /* [v255] 在线生成：POST 云端 → 云端调大模型 → 回传 JSON → 走既有 validate/apply 通道。
     任何一步失败都给出可执行结论，并提示可改用离线流程；按钮期间禁用防重复提交。 */
  function doOnline() {
    var btn = panel.querySelector('[data-ai="online"]');
    var reqEl = panel.querySelector('[data-ai="req"]');
    var req = reqEl ? reqEl.value : '';
    store.req = req; persist();
    var c = collect();
    if (!(c.area_m2 > 0)) { setStatus('尚未绘制地块：请先在画布上描绘地块边界并确认面积，再点在线生成。', true); return; }
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '生成中…';
    setStatus('已提交云端：正在调用大模型推算方案，通常 10~40 秒，请勿重复点击。');
    var payload = {
      user_id: uid(),
      polygon: c.poly, groups: c.groups, area: c.area_m2, mu: c.mu, slope: c.slope_percent,
      terrain_dh: c.terrain_dh, pump_lift: c.pump_lift, src_distance: c.src_distance, tape_pressure: c.tape_pressure,
      cur: c.cur, user_text: req
    };
    postPlan(apiBase(), payload, 180000).then(function (data) {
      btn.disabled = false; btn.textContent = old;
      if (!data || data.code !== 0) {
        setStatus('在线生成失败：' + ((data && data.msg) || '未知错误') + errHint(data && data.code), true);
        return;
      }
      var res = parse(typeof data.data === 'string' ? data.data : JSON.stringify(data.data));
      if (!res.ok) { setStatus('云端返回的方案校验未通过：' + res.msg, true); return; }
      var ap;
      try { ap = apply(res.plan); }
      catch (e) { setStatus('方案写入图纸时出错：' + ((e && e.message) || e) + '。参数已记在面板里，可改用「导入JSON」重试。', true); return; }
      if (!ap.ok) { setStatus(ap.msg, true); return; }
      store.remark = res.plan.remark || '';
      store.risks = (res.plan.risks || []).concat(ap.warnings || []);
      persist(); renderRemark();
      var s = ap.summary;
      var left = (data && typeof data.quota_left === 'number')
        ? ('；剩余 ' + data.quota_left + ' 次（测试期每人 5 次，云端记在内存、冷启动会重置）') : '';
      setStatus('已在线生成并渲染：' + ap.written.join('；') +
        (s ? '。计算结果：主管 Ø' + s.mainOD + ' mm、支管 Ø' + s.branchOD + ' mm、分区 ' + s.zones +
          '、水泵扬程 ' + (isNum(s.pumpHead) ? s.pumpHead.toFixed(1) : '—') + ' m' : '') + left);
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = old;
      setStatus('连不上云端接口（' + ((err && err.message) || err) + '）。可改用「导出文本 → 本地 Python 脚本 → 导入 JSON」的离线流程。', true);
    });
  }
  function buildPanel() {
    panel = doc.createElement('div');
    panel.className = 'ai-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'AI灌溉方案规划');
    /* [v253] 定位/尺寸/投影内联（同 #tlWsLayerPanel 款）：fixed 挂 body 跨页常驻，
       默认视口右上（right:136px 避让二级页右侧固定工具列）；面板不再用 hidden（常驻可折叠）。 */
    panel.style.cssText = 'position:fixed;top:8px;right:136px;z-index:9993;width:262px;max-height:70vh;overflow:auto;background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.18)';
    panel.innerHTML =
      '<header data-head title="拖动 = 移动面板 · 双击 = 回右上角默认位 · 单击 = 折叠/展开">' +
      '<h3 class="ai-title">AI灌溉方案规划</h3><span class="ai-tag">云端版</span>' +
      '<span class="ai-grip" data-grip title="左右拖动调节面板宽度（200~480px，自动记忆）">\u2194</span>' +
      '<span class="ai-caret" data-caret>\u25be</span></header>' +
      '<div class="ai-body">' +
      '<label class="ai-label">灌溉需求描述</label>' +
      '<textarea class="ai-text" data-ai="req" rows="3" placeholder="描述你的灌溉设计需求，例如：辣椒地块，主管160PE，支管90PE，滴灌带间距0.7m..."></textarea>' +
      '<div class="ai-actions">' +
      '<button type="button" data-ai="online">在线生成</button>' +
      '<button type="button" data-ai="export">导出文本</button>' +
      '<button type="button" data-ai="import">导入JSON</button>' +
      '</div>' +
      '<p class="ai-status" role="status" data-ai="status"></p>' +
      '<div class="ai-slot" data-ai="slot"></div>' +
      '<div class="ai-remark" data-ai="remark" hidden></div>' +
      '<div class="ai-api"><label>接口</label>' +
      '<input type="text" data-ai="api" spellcheck="false" placeholder="云端接口地址（默认官方，一般不用改）"></div>' +
      '<p class="ai-note">在线生成：网页把地块与需求发给云端函数，云端调大模型并把方案 JSON 发回来，网页不持密钥。' +
      '断网或次数用完时，可用「导出文本 → 本地脚本 → 导入JSON」的离线流程。</p>' +
      '</div>';
    var head = panel.querySelector('[data-head]');
    /* 标题栏拖动 = 移动面板（>4px 判拖动；fixed 下 offsetParent=null → 以视口为界 clamp）；
       双击 = 回右上默认位；单击 = 折叠/展开（拖动后抑制误触）。同 #tlWsLayerPanel。 */
    var dragPid = null, dragStart = null, moved = false, suppressClick = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragPid = e.pointerId; moved = false;
      dragStart = { x: e.clientX, y: e.clientY, l: panel.offsetLeft, t: panel.offsetTop };
      try { head.setPointerCapture(e.pointerId); } catch (err) { }
    });
    head.addEventListener('pointermove', function (e) {
      if (dragPid === null || e.pointerId !== dragPid || !dragStart) return;
      var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true; suppressClick = true;
      var op = panel.offsetParent || doc.documentElement;
      var w = panel.offsetWidth || 262, h = panel.offsetHeight || 120;
      var L = Math.max(4, Math.min(dragStart.l + dx, (op.clientWidth || 1200) - w - 4));
      var T = Math.max(4, Math.min(dragStart.t + dy, (op.clientHeight || 800) - h - 4));
      panel.style.left = L + 'px'; panel.style.top = T + 'px'; panel.style.right = 'auto';
    });
    function aiEndDrag(e) {
      if (dragPid === null || (e && e.pointerId !== dragPid)) return;
      dragPid = null;
      if (moved) {
        manualPos = true;
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop })); } catch (err) { }
      }
    }
    head.addEventListener('pointerup', aiEndDrag);
    head.addEventListener('pointercancel', aiEndDrag);
    head.addEventListener('click', function () {
      if (suppressClick) { suppressClick = false; return; }
      setCollapsed(!collapsed);
    });
    head.addEventListener('dblclick', function () {
      manualPos = false; panel.style.left = 'auto'; panel.style.right = '136px'; panel.style.top = '8px';
      try { localStorage.removeItem(POS_KEY); } catch (err) { }
    });
    /* ↔ 手柄调宽（同 #tlWsLayerPanelGrip）：右锚定拖左加宽 / 左锚定拖右加宽，200~480px + 记忆 */
    var grip = panel.querySelector('[data-grip]'), rPid = null, rStart = null;
    if (grip) {
      grip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        rPid = e.pointerId;
        rStart = { x: e.clientX, w: panel.offsetWidth, ra: !(panel.style.left && panel.style.left !== 'auto') };
        try { grip.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault(); e.stopPropagation();
      });
      grip.addEventListener('pointermove', function (e) {
        if (rPid === null || e.pointerId !== rPid || !rStart) return;
        var nw = rStart.ra ? (rStart.w + (rStart.x - e.clientX)) : (rStart.w + (e.clientX - rStart.x));
        panel.style.width = Math.max(200, Math.min(480, nw)) + 'px';
      });
      function aiEndR() {
        if (rPid === null) return;
        rPid = null;
        try { localStorage.setItem(W_KEY, String(panel.offsetWidth)); } catch (err) { }
      }
      grip.addEventListener('pointerup', aiEndR);
      grip.addEventListener('pointercancel', aiEndR);
    }
    panel.querySelector('[data-ai="online"]').onclick = doOnline;
    panel.querySelector('[data-ai="export"]').onclick = doExport;
    panel.querySelector('[data-ai="import"]').onclick = doImport;
    var apiIn = panel.querySelector('[data-ai="api"]');
    if (apiIn) {
      apiIn.value = apiBase();
      apiIn.addEventListener('change', function () {
        var v = String(this.value || '').trim();
        try { if (v && /^https?:\/\//.test(v)) { root.localStorage.setItem(API_CFG_KEY, v); setStatus('接口地址已更新为：' + v); } else { root.localStorage.removeItem(API_CFG_KEY); this.value = apiBase(); setStatus('地址不合法，已恢复默认接口。', true); } } catch (e) { }
      });
    }
    panel.querySelector('[data-ai="req"]').value = store.req || '';
    panel.querySelector('[data-ai="req"]').addEventListener('change', function () { store.req = this.value; persist(); });
    doc.body.appendChild(panel);
    /* 恢复宽度/位置记忆（有位置存档=手动定位，默认右上不再自动对齐）；手机端默认折叠（同图层控制） */
    try { var sw = parseInt(localStorage.getItem(W_KEY), 10); if (isFinite(sw) && sw >= 200 && sw <= 480) panel.style.width = sw + 'px'; } catch (e) { }
    try {
      var sp = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (sp && isFinite(sp.x) && isFinite(sp.y)) { manualPos = true; panel.style.left = sp.x + 'px'; panel.style.top = sp.y + 'px'; panel.style.right = 'auto'; }
    } catch (e) { }
    if (root.RyMobile && root.RyMobile.isActive()) setCollapsed(true);
    /* [v254 2026-10-05 用户要求] 只在二级管路页显示：读当前活动 section 的 id，非二级页隐藏面板。
       双保险：① MutationObserver 盯各 .ry-sec 的 class（覆盖任何切换路径）；
       ② 包装 window.ryShowSection 兜底（页签切换主入口，切换后异步同步一次）。
       拖动/折叠/宽度记忆不受影响——隐藏只是 display:none。 */
    function syncSection() {
      var cur = doc.querySelector('main > .ry-sec.ry-active');
      panel.style.display = (cur && cur.id === 'pipePlanSection') ? '' : 'none';
    }
    if (root.MutationObserver) {
      try {
        var mo = new root.MutationObserver(syncSection);
        Array.prototype.forEach.call(doc.querySelectorAll('main > .ry-sec'), function (s) {
          mo.observe(s, { attributes: true, attributeFilter: ['class'] });
        });
      } catch (e) { }
    }
    if (typeof root.ryShowSection === 'function') {
      var origShow = root.ryShowSection;
      root.ryShowSection = function (sec) { var r = origShow.apply(this, arguments); setTimeout(syncSection, 0); return r; };
    }
    syncSection();
  }
  /* [v253] 左栏 .ai-open 触发按钮全部移除：悬浮面板本身就是常驻入口（可折叠/可拖走/可调宽） */
  function init() {
    buildPanel();
    refresh();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
