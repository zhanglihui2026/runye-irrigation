
/* ===== 设置模块（自包含） ===== */
(function () {
  'use strict';
  var SCALE_KEY = 'tl-dim-scale';
  var GEO_DEF = { ext: 4, gap: 4, tick: 4, tickW: 2.8, font: 12 };
  var GEO_LABEL = { ext: '界线超出量', gap: '数字离尺寸线净距', tick: '斜短线半长', tickW: '斜短线线宽', font: '尺寸数字字号' };
  var GEO_TIP = {
    ext: '尺寸界线越过尺寸线的那一小截长度（正偏移时冒出的「小尾巴」）。',
    gap: '尺寸数字的墨迹离尺寸线的可见净距。横向、竖向、以及二级页共用这一个值（数字无降部，按基线推算）。',
    tick: '建筑斜短线的半长，实际总长 = 2 × 该值。',
    tickW: '建筑斜短线的描边宽度。',
    font: '尺寸数字的字号。'
  };
  /* 2026-10-02：档位改引全局单一来源 CAL_SERIES（见文件头部常量区注释），不再自带字面量副本 */
  var SERIES = CAL_SERIES;
  /* v184（P6）：设置页默认单价表收敛为单一来源 TL_PIPE_PRICE_DEF（原此处另有第 1 份字面量副本；
     三份副本的一致性原先靠 verify_settings.js S7 比对，现改为「只允许存在一份」的结构契约）。 */
  var PDEF = TL_PIPE_PRICE_DEF;
  var ADEF = { price: 0.65, hours: 1200, years: 8 };

  /* ---- window.RyBuryDepth：管道埋深 mm（2026-09-28 用户要求：暂定 600，可调；
         总管/主管同标高水平连接；将来主管用量统计按主管-支管连接处竖直段计入） ---- */
  window.RyBuryDepth = {
    KEY: 'runye_buryDepth', DEF: 600,
    get: function () { try { var v = parseFloat(localStorage.getItem(this.KEY)); return (isFinite(v) && v > 0) ? v : this.DEF; } catch (e) { return this.DEF; } },   /* mm */
    set: function (mm) { try { var v = parseFloat(mm); localStorage.setItem(this.KEY, String(isFinite(v) && v > 0 ? v : this.DEF)); } catch (e) { } }
  };
  /* ---- window.RyDimGeo：标注几何细项（三级/二级渲染读取；默认值 = 历史硬编码常量） ---- */
  window.RyDimGeo = {
    KEY: 'runye_dimGeo',
    DEF: GEO_DEF,
    get: function () {
      var o = {}, k;
      for (k in GEO_DEF) o[k] = GEO_DEF[k];
      try {
        var s = JSON.parse(localStorage.getItem(this.KEY) || '{}');
        for (k in GEO_DEF) { var v = s[k]; if (typeof v === 'number' && isFinite(v) && v >= 0) o[k] = v; }
      } catch (e) { }
      return o;
    },
    set: function (patch) {
      var cur = this.get(), k;
      for (k in GEO_DEF) { if (patch[k] != null) { var v = Number(patch[k]); if (isFinite(v) && v >= 0) cur[k] = v; } }
      try { localStorage.setItem(this.KEY, JSON.stringify(cur)); } catch (e) { }
      return cur;
    },
    reset: function () { try { localStorage.removeItem(this.KEY); } catch (e) { } }
  };

  /* ---- 存储读写 ---- */
  function loadPrices() {
    var p = {}, k;
    for (k in PDEF) p[k] = PDEF[k];
    var s = window.RyEconomicSettingsStore.readPriceOverrides();
    for (k in s) { if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] > 0) p[k] = s[k]; }
    return p;
  }
  function loadAssum() {
    var v = {}, k;
    for (k in ADEF) v[k] = ADEF[k];
    for (k in { pf: 1, pm: 1, pb: 1 }) v[k] = 0;
    var s = window.RyEconomicSettingsStore.readAssumptions();
    for (k in v) { if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] > 0) v[k] = s[k]; }
    return v;
  }
  function loadScale() { var v = parseFloat(localStorage.getItem(SCALE_KEY)); return (v >= 0.6 && v <= 1.8) ? Math.round(v * 10) / 10 : 1; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return String(Math.round(n * 1000) / 1000); }
  function setAssumRaw(patch) {
    window.RyEconomicSettingsStore.patchAssumptions(patch);
  }

  /* ---- 刷新（保存/导入后让各视图跟上） ---- */
  function refresh() {
    try { var b = document.getElementById('btnPipeOpt'); if (b) b.click(); } catch (e) { }
    setTimeout(function () {
      var poly = window.measuredPolygon;
      var hasPoly = (poly && poly.length >= 3);
      try { if (hasPoly && typeof tlAutoGenerate === 'function') tlAutoGenerate({ scroll: false, stay: true }); } catch (e) { }
      try { if (hasPoly && typeof ppGenerateDiagram === 'function') ppGenerateDiagram({ scroll: false }); } catch (e) { }
      try { var v = document.getElementById('tlDimScaleVal'); if (v) v.textContent = Math.round(loadScale() * 100) + '%'; } catch (e) { }
    }, 360);
  }

  /* ---- [v520] 灌溉参数集：二级「地块与灌溉参数」10 项的「当前生效参数集」 ----
     三个入口（工具栏手动改 / 设置页保存 / AI·命名方案回填）最终都落在这里：
     localStorage['runye_plan_params_v1'] = {version:1, params:{planLift:5, ...}, at:时间戳}
     · 工具栏输入框仍是数据源（10 个 id 全部不动 ⇒ calcPlan 实时重算 / fld_* 镜像 /
       planSrcDist→三级联动 / AI 回填 / 命名方案 全部零改动）；
       任何 input/change 经 write-through 自动落盘（防抖 350ms）⇒ 刷新不再丢；
     · 设置页「灌溉参数」页签读的就是当前值；保存后经 set() 同步回工具栏
       （派发 change+input ⇒ 既有监听链原样触发重算）；
     · planApply 与「命名方案回填 applyParams」同一手法：赋 .value + 派发事件，
       不走 .value 直接赋值不触发事件的坑。 */
  var PLAN_KEY = 'runye_plan_params_v1';
  var PLAN_DEFS = [
    { id: 'planLift',          label: '水泵提升高度', unit: 'm' },
    { id: 'planDh',            label: '地形高差',     unit: 'm' },
    { id: 'planSrcDist',       label: '水源距离',     unit: 'm',
      tip: '水源到地块边界的距离（m）：计入总管长度 → 总管沿程损失 → 水泵扬程，同时计入总管长度统计与材料清单。' },
    { id: 'planTapeSpacing',   label: '滴带间距',     unit: 'm' },
    { id: 'planEmitterSpacing',label: '滴孔间距',     unit: 'm' },
    { id: 'planEmitterFlow',   label: '滴头流量',     unit: 'L/h' },
    { id: 'planTapeLaySide',   label: '铺设长度',     unit: 'm' },
    { id: 'planZoneMuManual',  label: '分区划定',     unit: '亩/区' },
    { id: 'planTapePressure',  label: '入口压力',     unit: 'bar' },
    { id: 'planTargetV',       label: '目标流速',     unit: 'm/s' }
  ];
  var PLAN_DEF_VALUES = {};      /* 启动时从 DOM 捕获的 HTML 默认值（恢复默认用） */
  var planPersistT = null;
  function planInput(id) { return document.getElementById(id); }
  function planDomValues() {
    var o = {};
    PLAN_DEFS.forEach(function (d) { var el = planInput(d.id); if (el) o[d.id] = el.value; });
    return o;
  }
  function planStoreRead() {
    var o = {};
    try {
      var s = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
      if (s && s.version === 1 && s.params) o = s.params;
    } catch (e) { }
    return o;
  }
  function planStoreWrite(vals) {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify({ version: 1, params: vals, at: Date.now() })); } catch (e) { }
  }
  function planPersistSoon() {
    if (planPersistT) clearTimeout(planPersistT);
    planPersistT = setTimeout(function () { planPersistT = null; planStoreWrite(planDomValues()); }, 350);
  }
  function planDispatch(el) {
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { }
  }
  /* 把 patch 应用到工具栏输入框（值没变就不派发，避免无谓重算），并落盘 */
  function planApply(patch) {
    var fired = false;
    PLAN_DEFS.forEach(function (d) {
      var v = patch ? patch[d.id] : null;
      if (v === null || v === undefined || !isFinite(Number(v))) return;
      var el = planInput(d.id); if (!el) return;
      v = Number(v);
      if (String(el.value) === String(v)) return;
      el.value = String(v); fired = true;
      planDispatch(el);
    });
    planStoreWrite(planDomValues());
    return fired;
  }
  function planReset() {
    try { localStorage.removeItem(PLAN_KEY); } catch (e) { }
    PLAN_DEFS.forEach(function (d) {
      var el = planInput(d.id); if (!el) return;
      var dv = PLAN_DEF_VALUES[d.id]; if (dv == null) return;
      if (String(el.value) === String(dv)) return;
      el.value = dv;
      planDispatch(el);
    });
    planStoreWrite(planDomValues());
  }
  window.RyPlanParams = {
    KEY: PLAN_KEY,
    IDS: PLAN_DEFS.map(function (d) { return d.id; }),
    get: planDomValues,
    set: planApply,
    reset: planReset,
    openSettings: function () { open('irrig'); }
  };
  (function planInit() {
    /* 先捕默认值（HTML 里的 value），再回填存储值，最后挂 write-through */
    PLAN_DEFS.forEach(function (d) { var el = planInput(d.id); if (el) PLAN_DEF_VALUES[d.id] = el.value; });
    var saved = planStoreRead();
    PLAN_DEFS.forEach(function (d) {
      var v = saved[d.id];
      if (v === null || v === undefined || !isFinite(Number(v))) return;
      var el = planInput(d.id); if (!el) return;
      v = Number(v);
      if (String(el.value) === String(v)) return;
      el.value = String(v);
      planDispatch(el);
    });
    PLAN_DEFS.forEach(function (d) {
      var el = planInput(d.id); if (!el) return;
      el.addEventListener('input', planPersistSoon);
      el.addEventListener('change', planPersistSoon);
    });
    planStoreWrite(planDomValues());   /* 从第一天起就有参数集，消费方不用判空 */
    var sb = document.getElementById('ryCadGrpPipeSet');
    if (sb) sb.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();   /* 别触发分组折叠 */
      open('irrig');
    });
  })();

  /* ---- 各页 HTML ---- */
  function rowNum(label, key, val, unit, attrs, tip) {
    var h = '<div class="rs-row"><label' + (tip ? ' title="' + tip + '"' : '') + '>' + label + '</label>'
      + '<input type="number" ' + (attrs || '') + ' data-f="' + key + '" value="' + val + '">'
      + (unit ? '<span class="rs-unit">' + unit + '</span>' : '') + '</div>';
    if (tip) h += '<p class="rs-note" style="margin:-4px 0 10px 102px">' + tip + '</p>';
    return h;
  }
  function htmlPrice() {
    var p = loadPrices(), a = loadAssum();
    var cells = SERIES.map(function (d) {
      return '<div class="rs-cell"><span class="rs-phi">Ø' + d + '</span><input type="number" min="0" step="0.5" data-pd="' + d + '" value="' + (p[d] > 0 ? fmt(p[d]) : '') + '"></div>';
    }).join('');
    return '<h4>角色单价（元/m）</h4>'
      + '<p class="rs-note">留空 = 该角色按各自管径查下面的表；一旦填写，该角色的<b>所有管段统一按此价</b>，下面的表就不再参与该角色 —— 想「按管径算准」就保持这三格为空。</p>'
      + rowNum('总管', 'pf', a.pf > 0 ? fmt(a.pf) : '', '元/m', 'min="0" step="1"')
      + rowNum('主管', 'pm', a.pm > 0 ? fmt(a.pm) : '', '元/m', 'min="0" step="1"')
      + rowNum('支管', 'pb', a.pb > 0 ? fmt(a.pb) : '', '元/m', 'min="0" step="1"')
      + '<hr class="rs-sep">'
      + '<h4>按管径单价表（元/m · ' + SERIES.length + ' 档）</h4>'
      + '<p class="rs-note">必须 &gt; 0 才生效；留空或 0 表示该档未填（按 0 计）。</p>'
      + '<div class="rs-grid">' + cells + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="rs-btn" type="button" id="rySetExport">导出 CSV</button>'
      + '<button class="rs-btn" type="button" id="rySetImport">导入 CSV</button>'
      + '<button class="rs-btn ghost" type="button" id="rySetResetPrice">恢复系统默认单价</button>'
      + '</div>';
  }
  function htmlAssum() {
    var a = loadAssum();
    return '<h4>造价假设</h4>'
      + '<p class="rs-note">用于「经济指标分析」：年均总成本 = 管材投入 ÷ 折旧年限 + 功率 × 年运行小时 × 电价。三项都必须 &gt; 0 才生效。</p>'
      + rowNum('电价', 'price', fmt(a.price), '元/度', 'min="0" step="0.05"')
      + rowNum('年运行小时', 'hours', fmt(a.hours), 'h', 'min="0" step="100"')
      + rowNum('折旧年限', 'years', fmt(a.years), '年', 'min="0" step="1"');
  }
  function htmlScale() {
    var s = loadScale();
    return '<h4>标注比例</h4>'
      + '<p class="rs-note">统一缩放尺寸标注的<b>数字字号</b>与<b>建筑斜短线</b>的长短/粗细。与顶栏工具栏上的「Aa」四键组是同一个值，两边随时同步。</p>'
      + '<div class="rs-row"><label>比例</label><input type="range" min="0.6" max="1.8" step="0.1" id="rySetScaleRange" value="' + s + '">'
      + '<span class="rs-badge" id="rySetScaleVal">' + Math.round(s * 100) + '%</span></div>'
      + '<div style="margin-top:12px"><button class="rs-btn" type="button" id="rySetScaleReset">复位 100%</button></div>';
  }
  function htmlGeo() {
    var g = window.RyDimGeo.get();
    var h = '<h4>标注几何</h4>'
      + '<p class="rs-note">单位与图纸一致（图形单位）。这五项会再乘上面的「标注比例」生效；默认 4 / 4 / 4 / 2.8 / 12 与历史出图<b>完全一致</b>，不动它就是原样。</p>';
    ['ext', 'gap', 'tick', 'tickW', 'font'].forEach(function (k) {
      h += rowNum(GEO_LABEL[k], k, fmt(g[k]), '', 'min="0" step="0.1"', GEO_TIP[k]);
    });
    h += '<div style="margin-top:12px"><button class="rs-btn ghost" type="button" id="rySetGeoReset">恢复默认</button></div>';
    return h;
  }
  function htmlEng() {
    var d = window.RyBuryDepth.get();
    var h = '<h4>工程参数</h4>'
      + '<p class="rs-note">管网工程通用参数，改完点「保存」生效（存浏览器，不上传）。</p>';
    h += rowNum('管道埋深', 'bury', fmt(d), 'mm', 'min="0" step="50"', '总管/主管计划埋入地下的深度（暂定 600mm）。总管与主管同标高、水平连接；将来统计主管用量时，主管-支管连接处的竖直段按此值计入。');
    return h;
  }
  function htmlIrrig() {
    var dom = planDomValues();
    var h = '<h4>二级 · 地块与灌溉参数</h4>'
      + '<p class="rs-note">与二级工具栏是<b>同一套参数</b>：这里改完点「保存」，工具栏同步更新并立即重算（工具栏只作展示与调用，[v525] 起不可直接编辑）。</p>';
    PLAN_DEFS.forEach(function (d) {
      var el = planInput(d.id);
      var step = el ? (el.getAttribute('step') || 'any') : 'any';
      var mn = el ? (el.getAttribute('min') || '0') : '0';
      h += rowNum(d.label, d.id, el ? fmt(num(el.value)) : '', d.unit, 'min="' + mn + '" step="' + step + '"', d.tip);
    });
    /* [v526]（2026-10-17 用户要求）灌溉方案管理区：工具栏只留「选择+调用」，
       命名/保存/改名/删除统一在这里。按钮 data-ry-recipe 走 #rySetBody 事件委托调 window.RyRecipes
       （plot-editor ppRecipeFlow 暴露；#rySetBody 内容会被 render() 重建，故必须委托、不能直绑）。 */
    h += '<hr class="rs-sep">'
      + '<h4>灌溉方案</h4>'
      + '<p class="rs-note">把上面 10 项的<b>当前值</b>存成命名方案；地块分区页的「方案」下拉只负责调用。</p>'
      + '<div class="rs-row"><label>方案名称</label><input type="text" id="ryRecipeName" maxlength="40" placeholder="如：海南七彩花生-0.8L-300" style="flex:1;min-width:0"></div>'
      + '<div class="rs-row"><label></label><button type="button" data-ry-recipe="save" style="padding:5px 10px;border:1px solid #c9d8d0;border-radius:6px;background:#fff;color:#33604f;font-size:12px;cursor:pointer">💾 保存为方案（同名覆盖）</button></div>'
      + '<div class="rs-row"><label>已存方案</label><select id="ryRecipeSelect" style="flex:1;min-width:0"><option value="">— 选择方案 —</option></select></div>'
      + '<div class="rs-row"><label></label><button type="button" data-ry-recipe="rename" style="padding:5px 10px;border:1px solid #c9d8d0;border-radius:6px;background:#fff;color:#33604f;font-size:12px;cursor:pointer">✎ 改名为名称框文字</button></div>'
      + '<div class="rs-row"><label></label><button type="button" data-ry-recipe="del" style="padding:5px 10px;border:1px solid #c9d8d0;border-radius:6px;background:#fff;color:#33604f;font-size:12px;cursor:pointer">🗑 删除选中方案</button></div>'
      + '<p class="rs-note" id="ryRecipeStatus" role="status" style="min-height:14px"></p>';
    return h;
  }
  var RENDER = { price: htmlPrice, assum: htmlAssum, scale: htmlScale, geo: htmlGeo, eng: htmlEng, irrig: htmlIrrig };

  /* ---- CSV ---- */
  function csvExport() {
    var p = loadPrices(), a = loadAssum(), L = [];
    L.push('# 润野灌溉 · 设置导出（管材单价 / 造价假设）');
    L.push('# 用 Excel 改完后存成 UTF-8 CSV，再点设置里的「导入 CSV」读回即生效。');
    L.push('# 1) 角色单价留空 = 该角色按各自管径查「按管径单价」表；填写后该角色所有管段统一按此价。');
    L.push('# 2) 所有数值必须 > 0 才生效；留空或 0 视为未填。');
    L.push('类别,名称,数值');
    L.push('角色单价,总管,' + (a.pf > 0 ? fmt(a.pf) : ''));
    L.push('角色单价,主管,' + (a.pm > 0 ? fmt(a.pm) : ''));
    L.push('角色单价,支管,' + (a.pb > 0 ? fmt(a.pb) : ''));
    SERIES.forEach(function (d) { L.push('按管径单价,' + d + ',' + (p[d] > 0 ? fmt(p[d]) : '')); });
    L.push('假设,电价(元/度),' + fmt(a.price));
    L.push('假设,年运行小时(h),' + fmt(a.hours));
    L.push('假设,折旧年限(年),' + fmt(a.years));
    L.push('# 表格结束');
    var csv = L.join('\r\n') + '\r\n';
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob), el = document.createElement('a');
    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    el.href = url;
    el.download = '润野灌溉_设置_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.csv';
    document.body.appendChild(el); el.click(); document.body.removeChild(el);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function parseCsv(text) {
    var out = { prices: {}, roles: {}, assum: {} }, warns = [];
    var lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln || ln.charAt(0) === '#') continue;
      var c = ln.split(',');
      if (c.length !== 3) { warns.push('第 ' + (i + 1) + ' 行不是 3 列，已跳过'); continue; }
      var k1 = c[0].trim(), k2 = c[1].trim(), v = num(c[2]);
      if (k1 === '类别' && k2 === '名称') continue;
      if (k1.indexOf('角色单价') === 0) {
        var rk = (k2 === '总管' ? 'pf' : k2 === '主管' ? 'pm' : k2 === '支管' ? 'pb' : null);
        if (rk) out.roles[rk] = v; else warns.push('第 ' + (i + 1) + ' 行未知角色：' + k2);
      } else if (k1.indexOf('按管径') === 0) {
        var d2 = parseInt(k2, 10);
        if (isFinite(d2) && SERIES.indexOf(d2) >= 0) out.prices[d2] = v;
        else warns.push('第 ' + (i + 1) + ' 行未知管径：' + k2);
      } else if (k1 === '假设') {
        var ak = k2.indexOf('电价') === 0 ? 'price' : k2.indexOf('年运行') === 0 ? 'hours' : k2.indexOf('折旧') === 0 ? 'years' : null;
        if (ak) out.assum[ak] = v; else warns.push('第 ' + (i + 1) + ' 行未知假设：' + k2);
      } else {
        warns.push('第 ' + (i + 1) + ' 行未知类别：' + k1);
      }
    }
    return { data: out, warns: warns };
  }
  function applyCsv(text) {
    var r = parseCsv(text), d = r.data;
    var np = 0, nr = 0, na = 0, k;
    for (k in d.prices) { if (d.prices[k] > 0) np++; }
    for (k in d.roles) { if (d.roles[k] > 0) nr++; }
    for (k in d.assum) { if (d.assum[k] > 0) na++; }
    if (!np && !nr && !na) { alert('没有读到可写入的项。\n\n' + (r.warns.slice(0, 5).join('\n') || '请确认表头是「类别,名称,数值」三列。')); return; }
    var priceObj = {};
    for (k in d.prices) { if (d.prices[k] > 0) priceObj[k] = d.prices[k]; }
    if (np) window.RyEconomicSettingsStore.writePriceOverrides(priceObj);
    if (nr) setAssumRaw(d.roles);
    if (na) setAssumRaw(d.assum);
    var msg = '已导入：按管径单价 ' + np + ' 档 / 角色单价 ' + nr + ' 项 / 假设 ' + na + ' 项。';
    if (r.warns.length) msg += '\n\n另有 ' + r.warns.length + ' 行未识别：\n' + r.warns.slice(0, 5).join('\n');
    alert(msg);
    render(); refresh();
  }

  /* ---- 骨架 ---- */
  var tab = 'price';
  var modal = document.getElementById('rySetModal'), mask = document.getElementById('rySetMask'), body = document.getElementById('rySetBody');

  function markNav() {
    Array.prototype.slice.call(document.querySelectorAll('#rySetNav button')).forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
  }
  function collectFields() {
    var o = {};
    Array.prototype.slice.call(body.querySelectorAll('input[data-f]')).forEach(function (inp) {
      o[inp.getAttribute('data-f')] = num(inp.value);
    });
    return o;
  }
  function render() {
    body.innerHTML = RENDER[tab]();
    bind();
  }
  function bind() {
    var b;
    if (tab === 'price') {
      b = document.getElementById('rySetExport'); if (b) b.onclick = csvExport;
      b = document.getElementById('rySetImport'); if (b) b.onclick = function () { document.getElementById('rySetCsvInput').click(); };
      b = document.getElementById('rySetResetPrice'); if (b) b.onclick = function () {
        window.RyEconomicSettingsStore.clearPriceOverrides();
        setAssumRaw({ pf: 0, pm: 0, pb: 0 });
        render(); refresh();
      };
    } else if (tab === 'scale') {
      var r = document.getElementById('rySetScaleRange'), v = document.getElementById('rySetScaleVal');
      if (r) r.oninput = function () { if (v) v.textContent = Math.round(num(r.value) * 100) + '%'; };
      b = document.getElementById('rySetScaleReset'); if (b) b.onclick = function () { if (r) { r.value = '1'; } if (v) v.textContent = '100%'; };
    } else if (tab === 'geo') {
      b = document.getElementById('rySetGeoReset'); if (b) b.onclick = function () { window.RyDimGeo.reset(); render(); refresh(); };
    }
  }

  /* ---- 保存 ---- */
  function save() {
    var f = collectFields(), k;
    if (tab === 'price') {
      var pr = {};
      Array.prototype.slice.call(body.querySelectorAll('input[data-pd]')).forEach(function (inp) {
        var d = parseInt(inp.getAttribute('data-pd'), 10), v = num(inp.value);
        if (v > 0) pr[d] = v;
      });
      window.RyEconomicSettingsStore.writePriceOverrides(pr);
      setAssumRaw({ pf: f.pf || 0, pm: f.pm || 0, pb: f.pb || 0 });
    } else if (tab === 'assum') {
      setAssumRaw({ price: f.price || 0, hours: f.hours || 0, years: f.years || 0 });
    } else if (tab === 'scale') {
      var r = document.getElementById('rySetScaleRange');
      var v = r ? Math.round(num(r.value) * 10) / 10 : 1;
      try { localStorage.setItem(SCALE_KEY, String(v)); } catch (e) { }
    } else if (tab === 'geo') {
      var patch = {};
      for (k in GEO_DEF) { if (f[k] != null) patch[k] = f[k]; }
      window.RyDimGeo.set(patch);
    } else if (tab === 'eng') {
      if (f.bury != null) window.RyBuryDepth.set(f.bury);
    } else if (tab === 'irrig') {
      /* [v520] 只收可解析的数值项；经 RyPlanParams.set 同步回工具栏（派发事件→重算）并落盘 */
      var patch = {};
      PLAN_DEFS.forEach(function (d) {
        var inp = body.querySelector('input[data-f="' + d.id + '"]');
        if (!inp) return;
        var v = parseFloat(inp.value);
        if (isFinite(v)) patch[d.id] = v;
      });
      window.RyPlanParams.set(patch);
    }
  }
  function pageDefault() {
    var o;
    if (tab === 'price') {
      window.RyEconomicSettingsStore.clearPriceOverrides();
      setAssumRaw({ pf: 0, pm: 0, pb: 0 });
    } else if (tab === 'assum') {
      setAssumRaw({ price: 0, hours: 0, years: 0 });
    } else if (tab === 'scale') {
      try { localStorage.removeItem(SCALE_KEY); } catch (e) { }
    } else if (tab === 'geo') {
      window.RyDimGeo.reset();
    } else if (tab === 'eng') {
      window.RyBuryDepth.set(window.RyBuryDepth.DEF);
    } else if (tab === 'irrig') {
      window.RyPlanParams.reset();
    }
    render(); refresh();
  }

  /* ---- 开关 ---- */
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open(t) {
    tab = t || 'price';
    markNav(); render();
    mask.classList.add('open'); modal.classList.add('open');
    document.addEventListener('keydown', onKey);
  }
  function close() {
    modal.classList.remove('open'); mask.classList.remove('open');
    document.removeEventListener('keydown', onKey);
  }
  window.ryOpenSettings = open;
  window.ryCloseSettings = close;

  document.getElementById('rySetX').onclick = close;
  document.getElementById('rySetCancel').onclick = close;
  document.getElementById('rySetSave').onclick = function () { save(); close(); refresh(); };
  document.getElementById('rySetMask').onclick = close;
  document.getElementById('rySetPageDefault').onclick = pageDefault;
  /* [v526] 灌溉方案管理（保存/改名/删除）——#rySetBody 内容会被 render() 重建，
     用事件委托绑定：按钮 data-ry-recipe 调 plot-editor 暴露的 window.RyRecipes。 */
  document.getElementById('rySetBody').addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('[data-ry-recipe]') : null;
    if (!b) return;
    var api = window.RyRecipes;
    if (!api) return;
    var act = b.getAttribute('data-ry-recipe');
    if (act === 'save') api.save();
    else if (act === 'rename') api.rename();
    else if (act === 'del') api.del();
  });
  Array.prototype.slice.call(document.querySelectorAll('#rySetNav button')).forEach(function (b) {
    b.onclick = function () { tab = b.getAttribute('data-tab'); markNav(); render(); };
  });
  document.getElementById('rySetCsvInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () { applyCsv(String(fr.result || '')); };
    fr.readAsText(file, 'utf-8');
    e.target.value = '';
  });
})();
