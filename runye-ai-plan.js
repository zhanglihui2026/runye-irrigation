/* AI规划 v260：候选预览、地块版本核对、实测工况锁定、原引擎重建复算与撤销。在线额度绑定服务端用户，每人5次。 */
(function (root) {
  'use strict';
  var MU_TO_SQM = 666.67;
  var smartEntry = !!(root.location && /[?&]smart=1(?:&|$)/.test(root.location.search));
  var conversation = [];
  try { conversation = JSON.parse(root.sessionStorage.getItem('runye_ai_conversation_v1') || '[]'); } catch (e) {}
  if (!Array.isArray(conversation)) conversation = [];
  conversation = conversation.filter(function(m){return m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string';}).slice(-12);
  function renderConversation() {
    if (!panel) return;
    var log = panel.querySelector('[data-ai=conversation]'); if (!log) return;
    log.innerHTML = conversation.map(function(m){return '<div class="ai-chat-turn '+m.role+'"><b>'+ (m.role==='user'?'我的需求':'规划建议') +'</b><p>'+esc(m.text)+'</p></div>';}).join('');
    log.scrollTop=log.scrollHeight;
  }
  function addConversation(role,text){
    conversation.push({role:role,text:String(text).slice(0,5000)});conversation=conversation.slice(-12);
    try{root.sessionStorage.setItem('runye_ai_conversation_v1',JSON.stringify(conversation));}catch(e){}
    renderConversation();
  }

  var SCHEMA_VERSION = 1;
  var STORE_KEY = 'runye_ai_plan_v1', PROVENANCE_KEY = 'runye_ai_plan_provenance_v1';

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
    var terrain = root.RyTerrain && root.RyTerrain.exportState ? root.RyTerrain.exportState() : null;
    if(terrain) { var selected = ge && ge.active && Array.isArray(root.__runyeSubPlots) ? (ge.mode==='perPlot' ? [root.__runyeSubPlots[ge.current]] : root.__runyeSubPlots) : null; var keys=selected ? selected.filter(Boolean).map(function(p){return 'plot:'+(p.id!=null?p.id:JSON.stringify(p.poly));}) : ['plot:'+(root.currentPlotId || JSON.stringify(root.measuredPolygon))]; var relevant={};keys.forEach(function(k){if(terrain.plots && terrain.plots[k])relevant[k]=terrain.plots[k];});terrain.plots=relevant; }
    var slope = null; // 水源相对高差不能推导地块坡度，需实测坡向与水平距离。
    return {
      terrain: terrain,
      conditions: { existing_pressure: domNum('fld_existPressure',0), filter_loss: domNum('fld_filterLoss',5), pump_efficiency: domNum('fld_efficiency',65), simultaneous_zones: domNum('planN',1), pipe_loss_method:'Hazen-Williams' },
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

  var lastUndo=null;
  function fingerprint() {
    var c=collect(),ge=root.__runyeGroupEdit, b=root.RunyeBridge;
    return JSON.stringify({plot:root.currentPlotId,poly:c.poly,groups:c.groups,area:c.area_m2,terrain:c.terrain,conditions:c.conditions,cur:c.cur,lift:c.pump_lift,source:c.src_distance,pressure:c.tape_pressure,mode:ge&&ge.mode,current:ge&&ge.current,pipes:b&&b.state&&[b.state.mainPipes,b.state.branchPipes,b.state.subBranchPipes],slots:ge&&ge.slots,trunk:ge&&ge.trunkPipes,cuts:b&&b.state&&b.state.cutSnap,rotated:b&&b.state&&b.state.zoneRotated});
  }
  function clone(v){return v == null?v:JSON.parse(JSON.stringify(v));}
  function capture(){
    var nodes=root.document.querySelectorAll?Array.from(root.document.querySelectorAll('input[id],select[id]')):FIELDS.reduce(function(a,f){return a.concat(f.ids.map(el).filter(Boolean));},[]);
    return {nodes:nodes.map(function(n){return {node:n,value:n.value,checked:n.checked};}),state:clone(root.RunyeBridge&&root.RunyeBridge.state),group:clone(root.__runyeGroupEdit),groupRef:root.__runyeGroupEdit,blocks:clone(root.__runyeGroupWork&&root.__runyeGroupWork.blocks),data:clone(root.planData)};
  }
  function restore(s){
    s.nodes.forEach(function(p){p.node.value=p.value;if(p.checked!==undefined)p.node.checked=p.checked;});
    if(s.state&&root.RunyeBridge&&root.RunyeBridge.state){var target=root.RunyeBridge.state;Object.keys(target).forEach(function(k){delete target[k];});Object.assign(target,clone(s.state));}
    if(s.group){var g=s.groupRef;Object.keys(g).forEach(function(k){delete g[k];});Object.assign(g,clone(s.group));root.__runyeGroupEdit=g;}if(s.blocks&&root.__runyeGroupWork)root.__runyeGroupWork.blocks=clone(s.blocks);root.planData=clone(s.data);
    if(typeof root.calcPlan==='function')try{root.calcPlan();}catch(e){}
    if(typeof root.grRefreshGroupPage==='function'&&s.group&&s.group.active)root.grRefreshGroupPage();
  }
  function undoApply(){if(!lastUndo)return false;restore(lastUndo);lastUndo=null;return true;}
  /* ---------- 4. 应用（写现有输入框 + 调现有 calcPlan） ---------- */
  function apply(plan, options) {
    options = options || {};
    if (!root.document) return { ok: false, kind: 'nodom', msg: '当前环境不支持渲染。' };
    if (!plan || !plan.design) return { ok: false, kind: 'missing', msg: 'AI 方案参数不全：没有 design 字段。' };
    var checked = validate(plan); if (!checked.ok) return checked; plan = checked.plan;
    if (typeof root.calcPlan !== 'function') return { ok: false, kind: 'nodom', msg: '未找到计算入口 calcPlan()，请确认页面已完整加载。' };
    var c = collect();
    if (!(c.area_m2 > 0)) return { ok: false, kind: 'noplot', msg: '尚未绘制地块：请先在画布上描绘地块边界并确认面积，再导入方案。' };
    if(isNum(plan.plot&&plan.plot.area_m2) && Math.abs(plan.plot.area_m2-c.area_m2)>Math.max(1,c.area_m2*.01)) return {ok:false,msg:'方案地块面积与当前边界不一致，未应用，请核对地块。'};
    var d = plan.design, lockedWarnings = [];
    ['pump_lift','terrain_dh','src_distance','tape_pressure'].forEach(function(k) { if(isNum(d[k])) { delete d[k]; lockedWarnings.push(k==='terrain_dh'?'已保留手动高程或原地形高差；AI建议未覆盖。':'已保留实测工况：'+FIELDS.filter(function(f){return f.key===k;})[0].name); } });
    var written = [], terrainOverride = root.RyTerrain && root.RyTerrain.exportState().enabled && isNum(d.terrain_dh);
    if (terrainOverride) delete d.terrain_dh;
    var bridge=root.RunyeBridge, hasPipes=!!(bridge && bridge.state && ['mainPipes','branchPipes','subBranchPipes'].some(function(k){return (bridge.state[k]||[]).length;}));
    var layoutChanged=FIELDS.some(function(f){return ['tape_lay_side','zone_mu','tape_spacing'].indexOf(f.key)>=0 && isNum(d[f.key]) && f.ids.some(function(id){var n=el(id);return n&&Number(n.value)!==d[f.key];});});
    if(hasPipes && layoutChanged && !options.rebuild) return {ok:false,kind:'rebuild',msg:'分区参数会改变现有管路，请在预览中确认按原规则重建；尚未修改参数。'};
    if(options.rebuild && (!bridge || typeof bridge.autoPipesWhole!=='function')) return {ok:false,msg:'当前页面尚未加载布管入口，未写入参数。'};
    var undo=capture();
    try {
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
    if(options.rebuild && !bridge.autoPipesWhole()) throw new Error('按原规则生成管路失败');
    if(options.rebuild) root.calcPlan();
    /* 成组页在编辑态时，同步刷新成组视图（沿用 RyTerrain 的刷新约定） */
    if (root.__runyeGroupEdit && root.__runyeGroupEdit.active && typeof root.grRefreshGroupPage === 'function') {
      try { root.grRefreshGroupPage(); } catch (e) { }
    }
    var pd = root.planData || null, warnings = (plan.warnings || []).concat(lockedWarnings);
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
    lastUndo=undo;
    return {
      ok: true, rebuilt:!!options.rebuild, written: written, warnings: warnings,
      summary: pd ? { pumpFlow: pd.zoneFlow, pumpHead: pd.pumpHead, mainOD: pd.mainPipeODValue, branchOD: pd.branchPipeODValue, zones: pd.zoneCols + '×' + pd.zoneRows } : null
    };
      } catch(e) { restore(undo); return {ok:false,msg:'应用失败，原参数与管路已恢复：'+e.message}; }
  }

  /* ---------- 4.5 云端接口（v255）：user_id / 接口地址 / POST ---------- */
  var UID_KEY = 'runye_ai_uid', API_CFG_KEY = 'runye_ai_api_base';
  var DEFAULT_API = 'https://runye-irrigation.vercel.app/api/ai-irrigation';
  function apiBase() {
    try { var v = root.localStorage.getItem(API_CFG_KEY); if (v && /^https?:\/\//.test(v)) return v; } catch (e) { }
    return DEFAULT_API;
  }
  function accessToken() { return panel && panel.querySelector ? String((panel.querySelector('[data-ai=access]') || {}).value || '').trim() : ''; }
  /* user_id：本机首次生成后常驻 localStorage，只用于次数统计，不含任何个人信息 */
  function uid() {
    try {
      var u = root.localStorage.getItem(UID_KEY);
      if (!u) { u = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); root.localStorage.setItem(UID_KEY, u); }
      return u;
    } catch (e) { return 'u_web_anonymous'; }
  }
  function postPlan(url, payload, timeoutMs, tokenOverride) { /* [v330] 第4参：管理员登录用指定码验证 */
    return new Promise(function (resolve, reject) {
      if (typeof root.fetch !== 'function') { reject(new Error('当前浏览器不支持 fetch，请更新浏览器或改用离线流程')); return; }
      var ctrl = (typeof root.AbortController === 'function') ? new root.AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) { try { ctrl.abort(); } catch (e) { } }
        reject(new Error('请求超时（' + Math.round(timeoutMs / 1000) + ' 秒未返回）'));
      }, timeoutMs);
      var tok = (tokenOverride === undefined) ? accessToken() : tokenOverride; /* [v330] */
      var init = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization':'Bearer '+tok }, body: JSON.stringify(payload) };
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
      401: '（请填写作者分配的有效用户访问码）',
      503: '（用户额度服务未配置或暂不可用，请联系作者；不会回退到可重置计数）',
      400: '（请求参数不对：请确认已画好地块、需求已填写）',
      403: '（网页域名不在接口白名单：核对接口地址是不是本项目自己的 Vercel 域名）',
      405: '（接口只接受 POST，多半是地址填错了）',
      413: '（地块顶点太多，请简化边界后重试）',
      422: '（大模型这次没按要求输出 JSON，本次不扣次数，可再点一次）',
      429: '（本用户共5次；处理中请求会预占额度，已用完的额度不会自动重置）',
      500: '（服务端未配置 DeepSeek 密钥：需到 Vercel 项目里添加 DEEPSEEK_API_KEY 后重新部署）',
      502: '（上游大模型调用失败：常见原因是余额不足或网络问题）',
      504: '（推理模型较慢、这次超时了，可再点一次）'
    };
    return H[code] ? ' ' + H[code] : '';
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION, FIELDS: FIELDS, ADVISORY: ADVISORY,
    parse: parse, validate: validate, collect: collect, buildPrompt: buildPrompt, apply: apply, fingerprint:fingerprint, undo:undoApply, schemaHint: schemaHint,
    apiBase: apiBase, getAccessToken: accessToken,
    getProvenance: function(){ try{return root.localStorage.getItem(PROVENANCE_KEY)==='ai'?'ai':'manual';}catch(e){return 'manual';} }
  };
  root.RyAiPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;

  /* ---------- 5. 面板 UI（左侧栏内联折叠，风格对齐「手动地形高程」） ---------- */
  var doc = root.document, panel, openBtn, store = { req: '', remark: '', risks: [] };
  /* [v277] 标题栏提示语：折叠态会临时换成「点击展开…」，故原文抽成常量，收起/展开两处共用一份。 */
  var HEAD_TITLE = '拖动 = 移动面板 · 双击 = 回右上角默认位 · 单击 = 折叠/展开（收起后贴右缘成竖条）';
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
  var POS_KEY = 'runye_aiPanel_pos', W_KEY = 'runye_aiPanel_w', H_KEY = 'runye_aiPanel_h';
  var collapsed = false, manualPos = false;
  /* [v258] 高度下限；hgMax()/topMin() 必须是**外层作用域**函数——
     setCollapsed() 也会调它们，而 setCollapsed 定义在 buildPanel 之外（展开分支会命中）。
     [v278 2026-10-06 用户要求] 顶端不得越过导航栏、底端不得越过状态栏：
       · 顶 = 吸顶导航（.fn-nav，高 --fn-nav-h=36px + 1px 下边线）下沿 + EDGE_PAD；
       · 底 = 状态栏（body.ry-tool .ry-statusbar：fixed、height:--ry-status-h=30px、1px 上边线）上沿 − EDGE_PAD；
       · 可用高度由这两条推出 ⇒ 内容再长也只让 .ai-body 内部滚动，不再把面板顶出屏幕。
     同款约束的既有先例：#ryCadSide{top:var(--fn-nav-h,36px);bottom:calc(var(--ry-status-h,30px) + 1px)}。 */
  var HG_MIN = 160;
  /* [v279 2026-10-06 用户要求] 展开态「顶端紧贴导航栏、底端紧贴状态栏」⇒ 顶底视觉间隙改 0：
     顶 = 导航下沿（--fn-nav-h + 1px 下边线）、底 = 状态栏上沿（--ry-status-h + 1px 上边线）。
     间隙 0 之后，拖动下界 = 状态栏上沿 − 面板高，正好等于 topMin() ⇒ 纵向被自然钉死在贴边位。 */
  var EDGE_PAD = 0;
  function navBottom() {
    var n = doc.querySelector('.fn-nav');
    if (n) { var r = n.getBoundingClientRect(); if (r.height > 0 && r.bottom > 0) return r.bottom; }
    var h = 0; try { h = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--fn-nav-h')) || 0; } catch (e) { }
    return h > 0 ? h : 36;
  }
  /* [v278c] ★ 状态栏只有**真的 fixed** 时，它的 rect.top 才是「底部常驻栏的上沿」。
     窄屏（实测 ≤900px）会摘掉 body.ry-tool ⇒ .ry-statusbar 变回 static、跑到文档末尾
     （_p1/_dbg278_status.cjs 实测 900×600：position:static、rect.top=7045、height=26px、
       --ry-status-h 为空）⇒ 拿它当底界会把面板撑到 2054px 高、底落到 2100（视口才 600），
       而且「bottom ≤ 7045」这条断言**恒真**，等于没测。
     ⇒ 不是 fixed 就没有「常驻状态栏」可避让，退化成「不越出视口」。 */
  function statusTop() {
    var vh = root.innerHeight || doc.documentElement.clientHeight || 800;
    var el = doc.getElementById('ryStatusBar');
    if (el) {
      var pos = '';
      try { pos = getComputedStyle(el).position || ''; } catch (e) { }
      if (pos === 'fixed') {
        var r = el.getBoundingClientRect();
        if (r.height > 0 && r.top > 0) return r.top;
      }
    }
    return vh - 1;                        /* 无常驻状态栏 ⇒ 以视口下沿为界 */
  }
  /* 顶的安全下限：只许在导航之下（拖动、位置记忆恢复、双击复位三处共用） */
  function topMin() { return Math.round(navBottom() + EDGE_PAD); }
  /* 当前顶位下面板还能有多高（底不许进状态栏） */
  function hgMax() {
    var top = (panel && panel.offsetTop) || topMin();
    return Math.max(HG_MIN, Math.round(statusTop() - EDGE_PAD - top));
  }
  /* 把可用高度写进内联 max-height：height:auto（内容自适应）时也要兜住底部 ——
     CSS 类里那条 max-height 是按「默认顶位」算的，兜不住「用户把面板往下拖过」的情形（顶越低、可用高度越小）。
     折叠态是贴右缘的竖条、不参与这条约束 ⇒ 清掉内联值，交回 CSS 类。 */
  function syncMaxH() {
    if (!panel) return;
    if (collapsed) { panel.style.maxHeight = ''; return; }
    panel.style.maxHeight = hgMax() + 'px';
  }
  /* [v277] 折叠标签的水平落点：默认贴视口右缘（right:0，与「工具栏」折叠标签 .pp-rail-tab-float 同款）；
     但二级右侧工具轨**展开**时，轨内按钮顶到视口右缘只剩 7px —— 贴 0 会压住按钮文字
     （_p1/_v277_ai_fold_e2e.cjs 真渲染实测：横向侵入 21px、「垂直」按钮文字被压 8px；
       而展开态面板侵入 0px ⇒ 「收起来反而比展开更碍事」，不能接受）。
     故轨展开时量轨左缘、把标签让到轨外；轨宽可被用户拖（--pp-tool-w）⇒ 只能量不能写死。
     ★ 必须用**布局宽度** tb.offsetWidth + 舞台右缘（两者都不含 transform）：工具轨展开带过渡
       （transition ... transform .18s，折叠态 translateX(24px)），而类一变观察器就回调 ——
       getBoundingClientRect 会量到过渡中间态，算出的让位量偏大 16px，标签反倒压住按钮（实测过）。 */
  function foldRightPx() {
    var st = doc.querySelector('#pipePlanSection .pp-stage');
    var tb = doc.querySelector('#pipePlanSection #ppToolbar');
    if (!st || !tb || st.classList.contains('pp-rail-off')) return 0;
    var railW = tb.offsetWidth || 0;
    var stR = st.getBoundingClientRect().right;
    if (!(railW > 0) || !(stR > 0)) return 0;
    return Math.max(0, Math.round((root.innerWidth || 0) - stR) + railW + 2);
  }
  /* 只在折叠态需要；写进面板自己的内联自定义属性，由 CSS 的 var(--ai-fold-right,0px) 取用 */
  function syncFoldPos() {
    if (!panel || !collapsed) return;
    panel.style.setProperty('--ai-fold-right', foldRightPx() + 'px');
  }
  function setCollapsed(c) {
    collapsed = !!c;
    if (!panel) return;
    /* [v277 2026-10-06 用户要求] 折叠态 = 贴右缘的竖排标签条（样式见 runye-ai-plan.css .ai-folded）：
       收起后不再是横在右上角的标题条，而是贴右缘写「AI灌溉方案规划」的窄条，点整条即展开。
       只挂一个类，定位/尺寸/竖排全部交给 CSS（含 !important 压内联），展开态一切照旧。 */
    panel.classList.toggle('ai-folded', collapsed);
    syncFoldPos();
    var hdr = panel.querySelector('[data-head]');
    if (hdr) hdr.title = collapsed ? '点击展开「AI灌溉方案规划」面板' : HEAD_TITLE;
    var body = panel.querySelector('.ai-body'), caret = panel.querySelector('[data-caret]');
    if (body) body.style.display = collapsed ? 'none' : '';
    /* [v258] 折叠态：高度交还内容（否则收起来仍撑着一个空高盒）。
       [v279] 展开态也一律 auto：上贴导航、下贴状态栏（内联 top+bottom）自然拉伸，
       高度记忆 H_KEY 不再参与（↕ 手柄已撤）——否则一条旧存档的高度会把面板拉离贴边位。 */
    var vg = panel.querySelector('[data-grip-v]');
    if (vg) vg.style.display = collapsed ? 'none' : '';
    if (collapsed) {
      panel.style.height = 'auto';
    } else {
      panel.style.height = 'auto';
    }
    /* [v278] 折叠态清掉内联 max-height（贴边竖条不参与顶/底约束），展开态按当前顶位重算 */
    syncMaxH();
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
  function preview(plan, expected){
    var slot=panel.querySelector('[data-ai="slot"]');
    var changes=FIELDS.filter(function(f){return ['pump_lift','terrain_dh','src_distance','tape_pressure'].indexOf(f.key)<0 && isNum(plan.design[f.key]);}).map(function(f){var n=el(f.ids[0]);return f.name+'：'+(n?n.value:'—')+' → '+plan.design[f.key]+' '+f.unit;});
    slot.innerHTML='<div class="ai-block"><b>待应用方案</b><p>'+esc(changes.join('；'))+'</p><p>实测高程、水源距离、提升高度及入口压力保持原值。模型说明仅供参考；数值以工具复算为准。</p><label><input type="checkbox" data-ai="replace"> 确认按原规则重建管路（包含已有手工调整；应用后可撤销）</label><button type="button" data-ai="apply">应用并生成管路</button><button type="button" data-ai="discard">取消</button></div>';
    slot.querySelector('[data-ai="discard"]').onclick=function(){slot.innerHTML='';setStatus('已取消，原规划未修改。');};
    slot.querySelector('[data-ai="apply"]').onclick=function(){
      if(expected!==fingerprint()){setStatus('地块或参数已改变，旧方案未应用，请重新生成。',true);return;}
      if(!slot.querySelector('[data-ai="replace"]').checked){setStatus('请确认管路重建后再应用，原规划尚未修改。',true);return;}
      var ap=apply(plan,{rebuild:true});if(!ap.ok){setStatus(ap.msg,true);return;}
      try { root.localStorage.setItem(PROVENANCE_KEY, 'ai'); } catch (e) { }
      store.remark='模型建议（未作工程复算）：'+(plan.remark||'');store.risks=(plan.risks||[]).concat(ap.warnings||[]);persist();renderRemark();
      var r=ap.summary;addConversation('assistant','方案已应用并完成复算。'+(r?'分区 '+r.zones+' 个，泵扬程 '+r.pumpHead.toFixed(1)+' m。':'')+'可以继续告诉我需要调整的地方。');setStatus('已按原规则生成并复算。'+(r?'主管 Ø'+r.mainOD+' mm；支管 Ø'+r.branchOD+' mm；分区 '+r.zones+'；泵扬程 '+r.pumpHead.toFixed(1)+' m。':''));
      if (typeof root.__runyeSmartThumb === 'function') setTimeout(root.__runyeSmartThumb, 300); /* [v348] 分区缩略图 */
      var applied=fingerprint();slot.innerHTML='<button type="button" data-ai="undo">撤销本次应用</button>';
      slot.querySelector('[data-ai="undo"]').onclick=function(){if(fingerprint()!==applied){setStatus('应用后规划已有修改，为避免覆盖，请使用原页面的撤销操作。',true);return;}undoApply();slot.innerHTML='';setStatus('已恢复应用前的参数与管路。');};
    };
    setStatus('已取得候选方案，尚未修改规划；请检查参数后应用。');
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
      preview(res.plan, fingerprint());
    };
    ta.focus();
    setStatus('粘贴 JSON 后点「确认导入」；参数超出工程合理范围会拒绝渲染。');
  }
  /* [v255] 在线生成：POST 云端 → 云端调大模型 → 回传 JSON → 走既有 validate/apply 通道。
     任何一步失败都给出可执行结论，并提示可改用离线流程；按钮期间禁用防重复提交。 */
  function doOnline() {
    var btn = panel.querySelector('[data-ai="online"]');
    var reqEl = panel.querySelector('[data-ai="req"]');
    if (btn.disabled) return;
    var req = reqEl ? reqEl.value.trim() : '';
    if (!req) { setStatus('请先说出你的规划需求。', true); return; }
    if (req.length > 5000) { setStatus('本次需求请控制在 5000 字以内。',true); return; }
    store.req = req; persist();
    var c = collect();
    if (!(c.area_m2 > 0)) { setStatus('尚未绘制地块：请先在画布上描绘地块边界并确认面积，再点在线生成。', true); return; }
    if(!panel.querySelector('[data-ai=access]').value.trim()){setStatus('在线 AI 规划为会员功能。请先注册会员并填写会员访问码；每位会员仍共5次。',true);return;}
    var history = conversation.slice(-4).map(function(m){return {role:m.role,text:m.text.slice(0,800)};});
    addConversation('user',req);
    var expected=fingerprint();
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '生成中…';
    setStatus('已提交云端：正在调用大模型推算方案，通常 10~40 秒，请勿重复点击。');
    var payload = {
      user_id: uid(),
      polygon: c.poly, groups: c.groups, area: c.area_m2, mu: c.mu, slope: c.slope_percent,
      terrain_dh: c.terrain_dh, pump_lift: c.pump_lift, src_distance: c.src_distance, tape_pressure: c.tape_pressure,
      terrain:c.terrain, conditions:c.conditions, cur: c.cur, user_text: (history.length ? '以下是此前对话，仅作需求上下文，以本次需求和当前地块为准：\n'+history.map(function(m){return (m.role==='user'?'用户：':'此前建议：')+m.text;}).join('\n')+'\n本次需求：' : '') + req
    };
    postPlan(apiBase(), payload, 180000).then(function (data) {
      btn.disabled = false; btn.textContent = old;
      if (!data || data.code !== 0) {
        setStatus('在线生成失败：' + ((data && data.msg) || '未知错误') + errHint(data && data.code), true);
        return;
      }
      var res = parse(typeof data.data === 'string' ? data.data : JSON.stringify(data.data));
      if (!res.ok) { setStatus('云端返回的方案校验未通过：' + res.msg, true); return; }
      if(expected!==fingerprint()){setStatus('生成期间地块或参数发生变化，返回方案未写入当前地块。请重新生成。',true);return;}
      addConversation('assistant',(res.plan.remark || '已生成候选方案。')+'\n请核对下面的参数变化，确认后应用；系统会重新划分、生成管路并进行水力复算。');
      preview(res.plan,expected);
      if(typeof data.quota_left==='number')setStatus('已取得候选方案，尚未应用；本用户剩余 '+data.quota_left+' 次。');

    }).catch(function (err) {
      btn.disabled = false; btn.textContent = old;
      setStatus('连不上云端接口（' + ((err && err.message) || err) + '）。可改用「导出文本 → 本地 Python 脚本 → 导入 JSON」的离线流程。', true);
    });
  }
  /* [v329 用户要求] 会员自助注册入口：面板内一键开通，成功后访问码自动填入（码只显示一次，提醒保存）。 */
  function doRegister() {
    var btn = panel.querySelector('[data-ai="reg"]');
    var old = btn.textContent;
    btn.disabled = true; btn.textContent = '注册中…';
    setStatus('正在为你开通会员，请稍候…');
    postPlan(apiBase(), { action: 'register', user_id: uid() }, 30000).then(function (data) {
      btn.disabled = false; btn.textContent = old;
      if (!data || data.code !== 0) { setStatus('注册失败：' + ((data && data.msg) || '未知错误'), true); return; }
      var info = {};
      try { info = JSON.parse(typeof data.data === 'string' ? data.data : '{}'); } catch (e) { }
      var acc = panel.querySelector('[data-ai="access"]');
      if (acc && info.access_code) acc.value = info.access_code;
      setStatus('✅ 注册成功！会员访问码已自动填入，请复制保存：' + (info.access_code || '（未取到，请重试）') + '（每位会员共 5 次；码丢失无法找回，请联系作者重置。）');
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = old;
      setStatus('注册连不上云端接口（' + ((err && err.message) || err) + '）。', true);
    });
  }
  /* [v330 用户要求] 管理员登录入口：内嵌表单贴管理访问码 → 云端 whoami 验证 → 徽标 + 不限次。
     登录态存 sessionStorage（切页保持、关浏览器即清），不写 localStorage（访问码不落盘约定）。 */
  var ADMIN_KEY = 'runye_ai_admin_code';
  function setAdminUI(uidStr) {
    var b = panel.querySelector('[data-ai="adminBtn"]'), bd = panel.querySelector('[data-ai="adminBadge"]');
    if (!b) return;
    if (panel.__adminIn) { b.textContent = '退出'; if (bd) bd.textContent = '🛡 管理员' + (uidStr ? ' ' + uidStr : '') + ' · 不限次'; }
    else { b.textContent = '🛡 登录'; if (bd) bd.textContent = ''; }
  }
  function doAdminLogin() {
    if (panel.__adminIn) {
      panel.__adminIn = false;
      var access = panel.querySelector('[data-ai=access]'); if (access) access.value = '';
      try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { }
      setAdminUI(null); setStatus('已退出管理员登录。'); return;
    }
    var slot = panel.querySelector('[data-ai="slot"]');
    slot.innerHTML = '<div class="ai-block"><div class="ai-block-head"><span>管理员登录（粘贴管理访问码）</span>' +
      '<span><button type="button" data-ai="alogin">登录</button><button type="button" data-ai="acancel">取消</button></span></div>' +
      '<input type="password" class="ai-json" data-ai="acode" placeholder="管理员访问码（与会员码同形态，由作者配发）" style="width:100%;margin-top:4px"></div>';
    slot.querySelector('[data-ai="acancel"]').onclick = function () { slot.innerHTML = ''; setStatus(''); };
    slot.querySelector('[data-ai="alogin"]').onclick = doAdminVerify;
    slot.querySelector('[data-ai="acode"]').focus();
  }
  function doAdminVerify() {
    var code = String((panel.querySelector('[data-ai="acode"]') || {}).value || '').trim();
    if (!code) { setStatus('请输入管理员访问码。', true); return; }
    setStatus('正在验证管理员身份…');
    postPlan(apiBase(), { action: 'whoami' }, 15000, code).then(function (data) {
      var info = {};
      try { info = JSON.parse(typeof data.data === 'string' ? data.data : '{}'); } catch (e) { }
      if (!data || data.code !== 0) { setStatus('管理员登录失败：' + ((data && data.msg) || '未知错误'), true); return; }
      if (!info.admin) { setStatus('该访问码不是管理员（普通会员仍受 5 次限制）。', true); return; }
      panel.__adminIn = true;
      var acc = panel.querySelector('[data-ai="access"]'); if (acc) acc.value = code;
      try { sessionStorage.setItem(ADMIN_KEY, code); } catch (e) { }
      panel.querySelector('[data-ai="slot"]').innerHTML = '';
      setAdminUI(info.user_id || '');
      setStatus('✅ 管理员已登录' + (info.user_id ? '（' + info.user_id + '）' : '') + '：在线 AI 规划不限次数。');
    }).catch(function (err) {
      setStatus('验证连不上云端接口（' + ((err && err.message) || err) + '）。', true);
    });
  }
  function buildPanel() {
    panel = doc.createElement('div');
    panel.className = 'ai-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'AI灌溉方案规划');
    /* [v253] 定位/尺寸/投影内联（同 #tlWsLayerPanel 款）：fixed 挂 body 跨页常驻，
       默认视口右上（right:136px 避让二级页右侧固定工具列）；面板不再用 hidden（常驻可折叠）。 */
    panel.style.cssText = 'position:fixed;top:calc(var(--fn-nav-h,36px) + 1px);right:136px;bottom:calc(var(--ry-status-h,30px) + 1px);z-index:9993;width:262px;background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.18);display:flex;flex-direction:column;overflow:hidden';
    panel.innerHTML =
      '<header data-head title="' + HEAD_TITLE + '">' +
      '<h3 class="ai-title">AI灌溉方案规划</h3><span class="ai-tag">云端版</span>' +
      '<span class="ai-grip" data-grip title="左右拖动调节面板宽度（200~480px，自动记忆）">\u2194</span>' +
      '<span class="ai-caret" data-caret>\u25be</span></header>' +
      '<div class="ai-body">' +
      '<div class="ai-conversation" data-ai="conversation" role="log" aria-live="polite"></div>' +
      '<label class="ai-label">告诉我怎么规划（可继续补充或修改）</label>' +
      '<textarea class="ai-text" data-ai="req" rows="3" placeholder="描述你的灌溉设计需求，例如：辣椒地块，主管160PE，支管90PE，滴灌带间距0.7m..."></textarea>' +
      '<div class="ai-actions">' +
      '<button type="button" data-ai="online">发送并生成方案</button>' +
      '<button type="button" data-ai="export">导出文本</button>' +
      '<button type="button" data-ai="import">导入JSON</button>' +
      '<button type="button" data-ai="reg" title="自助开通会员：获取专属访问码并自动填入（每人5次；管理员不限次）">注册会员</button>' + /* [v329] */

      '</div>' +
      '<p class="ai-status" role="status" data-ai="status"></p>' +
      '<div class="ai-slot" data-ai="slot"></div>' +
      '<div class="ai-remark" data-ai="remark" hidden></div>' +
      '<div class="ai-api"><label>会员访问码</label><input type="password" data-ai="access" autocomplete="off" placeholder="点「注册会员」自助获取；每会员共5次"></div>' + /* [v329] */
      '<div class="ai-api ai-admin"><label>管理员</label><button type="button" class="ai-admin-btn" data-ai="adminBtn" title="管理员用管理访问码登录；登录后在线 AI 规划不限次数">🛡 登录</button><span class="ai-admin-badge" data-ai="adminBadge"></span></div>' + /* [v330] */
      '<div class="ai-api"><label>接口</label>' +
      '<input type="text" data-ai="api" spellcheck="false" placeholder="云端接口地址（默认官方，一般不用改）"></div>' +
      '<p class="ai-note">在线 AI 规划仅向已注册会员开放：没有访问码可点「注册会员」自助开通（每人 5 次，管理员不限次）。网页把地块与需求发给云端函数，云端调大模型并把方案 JSON 发回来，网页不持密钥。' + /* [v329] */
      '断网或次数用完时，可用「导出文本 → 本地脚本 → 导入JSON」的离线流程。</p>' +
      '</div>';
    /* [v279 2026-10-06 用户要求] ↕ 高度手柄撤掉：展开态改为「上下贴满」（导航下沿 → 状态栏上沿），
       高度由 内联 top + bottom 拉伸决定，用户不再拖定高度 ⇒ 手柄留在这里没有意义。
       下方 `var vgrip = panel.querySelector('[data-grip-v]')` 与 `if (vgrip){…}` 整块随之成为死支，
       但**保留原函数体 + 空值守卫**（本项目既有纪律：删元素保留函数体并加空值守卫，便于日后回退）。 */
    var head = panel.querySelector('[data-head]');
    /* 标题栏拖动 = 移动面板（>4px 判拖动；fixed 下 offsetParent=null → 以视口为界 clamp）；
       双击 = 回右上默认位；单击 = 折叠/展开（拖动后抑制误触）。同 #tlWsLayerPanel。 */
    var dragPid = null, dragStart = null, moved = false, suppressClick = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      /* [v277] 折叠态是贴右缘的竖条（定位由 CSS !important 接管）：此时拖动既看不出效果，
         又会在 pointerup 把「竖条的坐标」写进 POS_KEY ⇒ 展开后面板落到视口外。故折叠态不启动拖动，
         单击照旧走 click 分支展开（pointermove/pointerup 因 dragPid===null 全部提前返回，无副作用）。 */
      if (collapsed) return;
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
      /* [v278] 纵向：上不过导航、下不把底推进状态栏（顶的上界 = 状态栏上沿 − 面板高 − 间隙） */
      var T = Math.max(topMin(), Math.min(dragStart.t + dy, Math.round(statusTop() - h - EDGE_PAD)));
      panel.style.left = L + 'px'; panel.style.top = T + 'px'; panel.style.right = 'auto';
      syncMaxH();
    });
    function aiEndDrag(e) {
      if (dragPid === null || (e && e.pointerId !== dragPid)) return;
      dragPid = null;
      if (moved) {
        manualPos = true;
        try { localStorage.setItem(POS_KEY, JSON.stringify({ x: panel.offsetLeft, y: panel.offsetTop })); } catch (err) { }
      }
      syncMaxH();
    }
    head.addEventListener('pointerup', aiEndDrag);
    head.addEventListener('pointercancel', aiEndDrag);
    head.addEventListener('click', function () {
      if (suppressClick) { suppressClick = false; return; }
      setCollapsed(!collapsed);
    });
    head.addEventListener('dblclick', function () {
      manualPos = false; panel.style.left = 'auto'; panel.style.right = '136px'; panel.style.top = 'calc(var(--fn-nav-h,36px) + 1px)';
      try { localStorage.removeItem(POS_KEY); } catch (err) { }
      /* [v258] 双击复位同时放开高度限制，回到内容自适应 */
      panel.style.height = 'auto';
      syncMaxH();
      try { localStorage.removeItem(H_KEY); } catch (err) { }
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
    /* [v258 2026-10-06 用户要求] ↕ 底部手柄调高（对齐宽度手柄做法）：
       top 锚定 → 向下长高；上限 = 视口底留 40px（且不小于 200）；160px 起。
       注意：panel 已去掉 max-height:70vh，改由本手柄 + 恢复时的 clamp 控制，否则拖不高。
       上界函数 hgMax() 在外层作用域定义（setCollapsed 也要用），此处不再重复声明。 */
    var hPid = null, hStart = null;
    var vgrip = panel.querySelector('[data-grip-v]');
    if (vgrip) {
      vgrip.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        hPid = e.pointerId;
        hStart = { y: e.clientY, h: panel.offsetHeight };
        try { vgrip.setPointerCapture(e.pointerId); } catch (err) { }
        e.preventDefault(); e.stopPropagation();
      });
      vgrip.addEventListener('pointermove', function (e) {
        if (hPid === null || e.pointerId !== hPid || !hStart) return;
        var nh = hStart.h + (e.clientY - hStart.y);
        panel.style.height = Math.max(HG_MIN, Math.min(hgMax(), nh)) + 'px';
        e.preventDefault();
      });
      function aiEndH() {
        if (hPid === null) return;
        hPid = null;
        try { localStorage.setItem(H_KEY, String(panel.offsetHeight)); } catch (err) { }
      }
      vgrip.addEventListener('pointerup', aiEndH);
      vgrip.addEventListener('pointercancel', aiEndH);
    }
    panel.querySelector('[data-ai="online"]').onclick = doOnline;
    panel.querySelector('[data-ai="reg"]').onclick = doRegister; /* [v329] 会员自助注册 */
    panel.querySelector('[data-ai="adminBtn"]').onclick = doAdminLogin; /* [v330] 管理员登录 */
    (function () { /* [v330] 会话内恢复管理员登录态：验证通过才亮徽标 */
      var c = null; try { c = sessionStorage.getItem(ADMIN_KEY); } catch (e) { }
      if (!c) return;
      postPlan(apiBase(), { action: 'whoami' }, 15000, c).then(function (data) {
        var info = {};
        try { info = JSON.parse(typeof data.data === 'string' ? data.data : '{}'); } catch (e) { }
        if (data && data.code === 0 && info.admin) {
          panel.__adminIn = true;
          var acc = panel.querySelector('[data-ai="access"]'); if (acc) acc.value = c;
          setAdminUI(info.user_id || '');
        } else { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { } }
      }).catch(function () { });
    })();
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
    /* 恢复宽度/位置记忆（有位置存档=手动定位，默认右上不再自动对齐）；[v303] 桌面端也默认折叠（原仅手机端），点右缘竖条即可展开 */
    try { var sw = parseInt(localStorage.getItem(W_KEY), 10); if (isFinite(sw) && sw >= 200 && sw <= 480) panel.style.width = sw + 'px'; } catch (e) { }
    /* [v258] 恢复高度记忆：按当前视口重新 clamp（换屏/缩窗后不越界） */
    try {
      var sh = parseInt(localStorage.getItem(H_KEY), 10);
      if (isFinite(sh) && sh >= 160) panel.style.height = Math.max(HG_MIN, Math.min(sh, hgMax())) + 'px';
    } catch (e) { }
    /* 双击标题栏复位时高度一并回到自适应（下次拖动前不锁死） */
    try {
      var sp = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      /* [v278] 存档里的顶位也要夹：老存档存过 top:8px（旧默认位）⇒ 不夹会照样压在导航上。
         [v279] 夹取后必然落在 topMin() = 导航下沿（贴边）——纵向只剩左右可拖。 */
      if (sp && isFinite(sp.x) && isFinite(sp.y)) { manualPos = true; panel.style.left = sp.x + 'px'; panel.style.right = 'auto'; panel.style.top = Math.max(topMin(), Math.min(sp.y, Math.round(statusTop() - HG_MIN - EDGE_PAD))) + 'px'; }
    } catch (e) { }
    /* [v278] 位置定下来后再夹一次 max-height：顶越低，可用高度越小 */
    syncMaxH();
    setCollapsed(true); /* [v303 2026-10-08 用户要求] 默认折叠（原仅手机端），点右缘竖条展开 */
    /* [v277] 折叠标签落点的跟随：视口尺寸变、工具轨折叠态变、轨宽被拖都要重算 */
    root.addEventListener('resize', function () { syncFoldPos(); syncMaxH(); });
    try {
      var stEl = doc.querySelector('#pipePlanSection .pp-stage');
      if (stEl && root.MutationObserver) new root.MutationObserver(syncFoldPos).observe(stEl, { attributes: true, attributeFilter: ['class', 'style'] });
    } catch (e) { }
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
    renderConversation();
    var reqBox=panel.querySelector('[data-ai=req]');
    reqBox.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();doOnline();}});
    if (smartEntry) {
      doc.body.classList.add('ry-smart-entry');
      if(typeof root.ryShowSection==='function') root.ryShowSection(doc.getElementById('pipePlanSection'));
      setCollapsed(false);syncSection();
      panel.querySelector('.ai-title').textContent='智能规划';
      var guide=doc.createElement('div');guide.className='ai-smart-guide';
      guide.innerHTML='<b>说出需求，自动规划地块</b><p>① 在左侧确认地块边界　② 描述滴灌与分区要求　③ 检查方案并应用</p><p>例如：滴头 1.38 L/h，滴孔间距 0.3 m，带间距 0.8 m，单边长 60 m，每区流量不超过 80 m³/h。</p><a href="runye-map-measure.html">绘制或导入地块</a> · <a href="index.html#pipePlanSection">返回地块分区</a>';
      panel.querySelector('.ai-body').prepend(guide);
      installSmartWorkbench();
    }
  }
  /* [v253] 左栏 .ai-open 触发按钮全部移除：悬浮面板本身就是常驻入口（可折叠/可拖走/可调宽） */
  function installSmartWorkbench() {
    var KEY='runye_smart_threads_v1', threads=[], active='';
    try { var saved=JSON.parse(root.localStorage.getItem(KEY)||'null'); if(saved&&Array.isArray(saved.threads)){threads=saved.threads;active=saved.active;} } catch(e){}
    threads=threads.filter(function(t){return t&&typeof t.id==='string'&&Array.isArray(t.messages);}).slice(0,30).map(function(t){
      return {id:t.id,title:typeof t.title==='string'?t.title.slice(0,80):'新的规划',updated:t.updated,
        messages:t.messages.filter(function(m){return m&&(m.role==='user'||m.role==='assistant')&&typeof m.text==='string';}).slice(-12).map(function(m){return {role:m.role,text:m.text.slice(0,5000)};})};
    });
    if(!threads.length){active=String(Date.now());threads=[{id:active,title:'新的规划',messages:conversation.slice(),updated:Date.now()}];}
    if(!threads.some(function(t){return t.id===active;}))active=threads[0].id;
    conversation=threads.filter(function(t){return t.id===active;})[0].messages.slice(-12);
    var body=panel.querySelector('.ai-body'), log=panel.querySelector('[data-ai=conversation]'), req=panel.querySelector('[data-ai=req]');
    var actions=panel.querySelector('.ai-actions'), status=panel.querySelector('[data-ai=status]'), slot=panel.querySelector('[data-ai=slot]'), remark=panel.querySelector('[data-ai=remark]');
    var oldSettings=Array.prototype.slice.call(panel.querySelectorAll('.ai-api,.ai-note'));
    var grid=doc.createElement('div');grid.className='smart-workbench';
    grid.innerHTML='<header class="smart-titlebar" role="banner"><span class="smart-tb-dot"></span><span>润野灌溉 · 智能规划</span><span class="smart-tb-sub">专业滴灌设计 · AI 方案规划</span><span class="smart-tb-spacer"></span><a class="smart-tb-link" href="index.html?full=1">返回完整工具 ↗</a></header><aside class="smart-history"><div class="smart-brand">润野 · 智能规划</div><button class="smart-new" type="button">＋ 新建对话</button><nav class="smart-nav"><a href="index.html#areaTool"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.3 2.3l2.4 2.4L5.2 13l-3.2.7.7-3.2z"/></svg><span>地块绘制</span></a><a href="runye-map-measure.html"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4l4.5-2 4.5 2 4-2v10l-4 2-4.5-2-4.5 2z"/><path d="M6 2v10M10.5 4v10"/></svg><span>在线地图</span></a><a href="index.html#pipePlanSection"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></svg><span>地块分区</span></a><a href="index.html#tlPipePlanSection"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h5.5a3 3 0 013 3v5"/><circle cx="2.5" cy="4" r="1.2"/><circle cx="11" cy="12.5" r="1.2"/></svg><span>管路规划</span></a><details class="smart-nav-more"><summary><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4" r="1.3"/><circle cx="12" cy="4" r="1.3"/><circle cx="4" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/></svg><span>更多功能</span></summary><div class="smart-nav-sub"><a href="index.html#designInput"><span>标准分区预设</span></a><a href="terrain/index.html"><span>地形模块</span></a><a href="index.html#grPipeSection"><span>多地块规划</span></a><a href="runye-hydraulics.html"><span>水力校核</span></a><a href="index.html#detailsSection"><span>材料清单</span></a><a href="index.html#nav-iso"><span>轴测图</span></a><a href="index.html#filterSystemSection"><span>过滤系统</span></a><a href="index.html#nav-sys"><span>系统图</span></a><a href="管路接驳拼装.html"><span>管路拼装</span></a><a href="index.html#threeDModelingSection"><span>经济指标分析</span></a><a href="index.html#parametricModelingSection"><span>数字化建模</span></a><a href="耐特菲姆滴灌带长度查询器.html"><span>滴灌带查询</span></a></div></details></nav><div class="smart-label">历史对话 · 本机保存</div><div class="smart-thread-list"></div></aside><section class="smart-center"><header class="smart-chat-head"><h2>把需求说出来，让规划更简单</h2><p>描述作物、滴灌参数和分区要求，生成方案后在右侧确认应用。</p><details class="smart-howto" open><summary>第一次用？三步生成规划方案</summary><ol class="smart-steps"><li><i>1</i><div><b>在线地图 · 绘制地块</b><span>在「在线地图」绘制地块边界，点击「绘制完成」。</span><a href="runye-map-measure.html">去绘制地块 ↗</a></div></li><li><i>2</i><div><b>地块分区 · 旋转地块</b><span>在「地块分区」页把地块旋转到合适的铺设角度。</span><a href="index.html#pipePlanSection">去旋转地块 ↗</a></div></li><li><i>3</i><div><b>智能规划 · 输入参数发送</b><span>在下方输入滴灌参数（滴头流量、滴孔间距、带间距、每区流量…），发送后自动规划；方案在右侧确认应用。</span></div></li></ol></details></header><div class="smart-welcome"><b>今天想怎样规划地块？</b><p>例如：滴头流量 1.38 L/h，滴孔间距 0.3 m，带间距 0.8 m，单边长 60 m，每区流量不超过 80 m³/h。</p><button type="button" class="smart-example">填入这个示例</button><ol class="smart-steps"><li><i>1</i><div><b>在线地图 · 绘制地块</b><span>在「在线地图」绘制地块边界，点击「绘制完成」。</span><a href="runye-map-measure.html">去绘制地块 ↗</a></div></li><li><i>2</i><div><b>地块分区 · 旋转地块</b><span>在「地块分区」页把地块旋转到合适的铺设角度。</span><a href="index.html#pipePlanSection">去旋转地块 ↗</a></div></li><li><i>3</i><div><b>智能规划 · 输入参数发送</b><span>在下方输入滴灌参数（滴头流量、滴孔间距、带间距、每区流量…），发送后自动规划；方案在右侧确认应用。</span></div></li></ol></div><div class="smart-composer"><label>继续补充你的要求</label><div class="smart-compose-bottom"></div><details class="smart-settings"><summary>会员与连接设置</summary></details></div></section><aside class="smart-results"><header><h2>规划成果</h2><p>当前地块与待应用方案</p></header><div class="smart-result-scroll"><div class="smart-plan-thumb" hidden></div><div class="smart-plot"></div><div class="smart-result-empty">还没有候选方案。发送需求后，参数变化及应用按钮会显示在这里。</div></div></aside><div class="smart-statusbar" role="status"><span class="smart-sb-dot"></span><span>润野 · 智能规划</span><span class="smart-sb-sep"></span><span>v348</span><span class="smart-sb-spacer"></span><span>当前地块 <b data-sb="mu">—</b></span><span class="smart-sb-sep"></span><span>历史 <b data-sb="threads">0</b> 条</span><span class="smart-sb-sep"></span><span>对话仅保存在本机</span></div>';
    body.innerHTML='';body.appendChild(grid);
    var center=grid.querySelector('.smart-center'), composer=grid.querySelector('.smart-composer');
    center.insertBefore(log,composer);composer.insertBefore(req,composer.querySelector('.smart-compose-bottom'));
    composer.querySelector('.smart-compose-bottom').appendChild(actions);composer.appendChild(status);
    oldSettings.forEach(function(n){grid.querySelector('.smart-settings').appendChild(n);});
    var results=grid.querySelector('.smart-result-scroll');results.appendChild(slot);results.appendChild(remark);
    req.value='';req.placeholder='说说你的地块怎么种、想怎么分区…';req.rows=3;
    panel.querySelector('[data-ai=online]').textContent='发送需求 ↑';
    var header=panel.querySelector('[data-head]');header.style.display='none';
    function pending(){return panel.querySelector('[data-ai=online]').disabled;}
    function persistThreads(){try{root.localStorage.setItem(KEY,JSON.stringify({active:active,threads:threads}));root.sessionStorage.setItem('runye_ai_conversation_v1',JSON.stringify(conversation));}catch(e){status.textContent='本机存储空间不足，对话暂时只能保留在当前页面。';}}
    function saveCurrent(){var t=threads.filter(function(t){return t.id===active;})[0];t.messages=conversation.slice(-12);t.updated=Date.now();var first=conversation.filter(function(m){return m.role==='user';})[0];if(first)t.title=first.text.slice(0,22);persistThreads();drawHistory();}
    function drawHistory(){var sbTh=grid.querySelector('[data-sb=threads]');if(sbTh)sbTh.textContent=String(threads.length);var list=grid.querySelector('.smart-thread-list');list.innerHTML='';threads.forEach(function(t){var b=doc.createElement('button');b.type='button';b.className='smart-thread'+(t.id===active?' selected':'');b.textContent=t.title||'新的规划';b.title=b.textContent;b.setAttribute('aria-pressed',String(t.id===active));b.onclick=function(){if(pending()){setStatus('当前方案正在生成，请完成后再切换对话。',true);return;}active=t.id;conversation=t.messages.slice(-12);req.value='';slot.innerHTML='';remark.hidden=true;setStatus('已切换对话。右侧显示当前地块；历史对话不会恢复旧地块或旧方案。');renderConversation();persistThreads();drawHistory();drawPlot();};list.appendChild(b);});grid.querySelector('.smart-welcome').hidden=conversation.length>0;var howto=grid.querySelector('.smart-howto');if(howto)howto.hidden=conversation.length===0;}
    function drawPlot(){var c=collect(), ring=c.poly||[], host=grid.querySelector('.smart-plot');
      var sbMu=grid.querySelector('[data-sb=mu]');if(sbMu)sbMu.textContent=ring.length<3?'未绘制':(Number(c.mu||0).toFixed(2)+' 亩');
      if(ring.length<3){host.innerHTML='<p>还没有地块边界，请先绘制或导入。</p><a href="runye-map-measure.html">绘制 / 导入地块 ↗</a>';return;}
      var xs=ring.map(function(p){return p.x;}),ys=ring.map(function(p){return p.y;}),x=Math.min.apply(null,xs),y=Math.min.apply(null,ys),w=Math.max(1,Math.max.apply(null,xs)-x),h=Math.max(1,Math.max.apply(null,ys)-y),k=Math.min(300/w,170/h);
      var points=ring.map(function(p){return (20+(p.x-x)*k).toFixed(2)+','+(20+(y+h-p.y)*k).toFixed(2);}).join(' ');
      host.innerHTML='<div class="smart-area"><b>'+esc(Number(c.mu||0).toFixed(2))+'</b> 亩 <span>当前地块</span></div><svg viewBox="0 0 340 210" role="img" aria-label="当前地块边界"><polygon points="'+points+'" fill="#dff0e5" stroke="#15803d" stroke-width="2"/></svg><a href="index.html#pipePlanSection">查看分区及完整管路成果 ↗</a><p>此处显示当前地块边界；应用后的完整分区与管路可通过上方链接查看。</p>';
      grid.querySelector('.smart-result-empty').hidden=!!slot.textContent.trim();
    }
    grid.querySelector('.smart-new').onclick=function(){if(pending()){setStatus('请等当前方案生成完成后再新建对话。',true);return;}saveCurrent();active=String(Date.now());threads.unshift({id:active,title:'新的规划',messages:[],updated:Date.now()});threads=threads.slice(0,30);conversation=[];req.value='';slot.innerHTML='';remark.hidden=true;setStatus('新对话已创建，继续使用当前地块。');renderConversation();persistThreads();drawHistory();drawPlot();req.focus();};
    grid.querySelector('.smart-example').onclick=function(){req.value='滴头流量 1.38 L/h，滴孔间距 0.3 m，滴灌带间距 0.8 m，单边铺设长度 60 m，每区流量不超过 80 m³/h，请重新规划地块。';req.focus();};
    /* [v341 2026-10-09 用户要求] 左右栏宽可拖动：手柄贴两列分界，拖动改 grid-template-columns 并持久化 */
    var COLS_KEY='runye_smart_cols_v1',colW={l:220,r:360};
    try{var cs=JSON.parse(root.localStorage.getItem(COLS_KEY)||'null');if(cs&&isFinite(cs.l)&&isFinite(cs.r)){colW.l=Math.min(420,Math.max(160,cs.l));colW.r=Math.min(520,Math.max(260,cs.r));}}catch(e){}
    var colsWide=function(){return root.innerWidth>1050;};
    function colsStr(){return colW.l+'px minmax(280px,1fr) '+colW.r+'px';}
    function applyCols(){if(colsWide()){grid.style.gridTemplateColumns=colsStr();}else{grid.style.gridTemplateColumns='';}placeGrips();}
    function placeGrips(){var gl=grid.querySelector('.smart-grip-l'),gr=grid.querySelector('.smart-grip-r');if(!gl||!gr)return;var cw=grid.clientWidth;gl.style.left=(colW.l-4)+'px';gr.style.left=(cw-colW.r-4)+'px';gl.style.display=gr.style.display=colsWide()?'':'none';}
    function startDrag(e,which){var sx=e.clientX,sl=colW.l,sr=colW.r;
      function mv(ev){if(which==='l'){colW.l=Math.min(420,Math.max(160,sl+ev.clientX-sx));}else{colW.r=Math.min(520,Math.max(260,sr-(ev.clientX-sx)));}grid.style.gridTemplateColumns=colsStr();placeGrips();}
      function up(){doc.removeEventListener('pointermove',mv);doc.removeEventListener('pointerup',up);var g=grid.querySelector('.smart-grip-'+which);if(g)g.classList.remove('dragging');try{root.localStorage.setItem(COLS_KEY,JSON.stringify(colW));}catch(e){}}
      doc.addEventListener('pointermove',mv);doc.addEventListener('pointerup',up);}
    ['l','r'].forEach(function(k){var g=doc.createElement('div');g.className='smart-grip smart-grip-'+k;g.title='拖动调整栏宽';g.addEventListener('pointerdown',function(e){if(!colsWide())return;e.preventDefault();g.classList.add('dragging');startDrag(e,k);});grid.appendChild(g);});
    applyCols();
    root.addEventListener('resize',applyCols);
    if(root.MutationObserver){new root.MutationObserver(function(){saveCurrent();drawPlot();}).observe(log,{childList:true});new root.MutationObserver(drawPlot).observe(slot,{childList:true,subtree:true});}
    /* [v348] 规划成果缩略图：把二级简图(#ppCanvas)当前画面截进右栏；撤显由模板 hidden 控制 */
    function refreshPlanThumb() {
      var host = grid.querySelector('.smart-plan-thumb'); if (!host) return;
      try {
        var cv = doc.getElementById('ppCanvas');
        if (!cv || !cv.width || !cv.height) return;
        var url = cv.toDataURL('image/png');
        host.hidden = false;
        host.innerHTML = '<div class="smart-plan-thumb-head">分区结果缩略图 · 二级简图</div><img alt="分区结果缩略图" src="' + url + '">';
      } catch (e) { }
    }
    root.__runyeSmartThumb = refreshPlanThumb; /* 供 preview() 应用成功后调用 */
    renderConversation();drawHistory();drawPlot();
    /* [v348] 载入时若已有已算方案（项目恢复/上次会话），延迟一拍补显缩略图 */
    setTimeout(function () { if (root.planData && root.planData.zoneCols) refreshPlanThumb(); }, 1200);
  }

  function init() {
    buildPanel();
    refresh();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
