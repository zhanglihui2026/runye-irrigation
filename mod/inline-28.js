
/* ===== 设置模块（自包含） ===== */
(function () {
  'use strict';
  var PRICE_KEY = 'runye_tlEconPrices', ASSUM_KEY = 'runye_tlEconAssum', SCALE_KEY = 'tl-dim-scale';
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
  function readRaw(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function loadPrices() {
    var p = {}, k;
    for (k in PDEF) p[k] = PDEF[k];
    var s = readRaw(PRICE_KEY);
    for (k in s) { if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] > 0) p[k] = s[k]; }
    return p;
  }
  function loadAssum() {
    var v = {}, k;
    for (k in ADEF) v[k] = ADEF[k];
    for (k in { pf: 1, pm: 1, pb: 1 }) v[k] = 0;
    var s = readRaw(ASSUM_KEY);
    for (k in v) { if (typeof s[k] === 'number' && isFinite(s[k]) && s[k] > 0) v[k] = s[k]; }
    return v;
  }
  function loadScale() { var v = parseFloat(localStorage.getItem(SCALE_KEY)); return (v >= 0.6 && v <= 1.8) ? Math.round(v * 10) / 10 : 1; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return String(Math.round(n * 1000) / 1000); }
  function setAssumRaw(patch) {
    var o = readRaw(ASSUM_KEY), k;
    for (k in patch) { var v = patch[k]; if (typeof v === 'number' && isFinite(v) && v > 0) o[k] = v; else delete o[k]; }
    try { localStorage.setItem(ASSUM_KEY, JSON.stringify(o)); } catch (e) { }
  }

  /* ---- 刷新（保存/导入后让各视图跟上） ---- */
  function refresh() {
    try { var b = document.getElementById('btnPipeOpt'); if (b) b.click(); } catch (e) { }
    setTimeout(function () {
      try { if (window.tlEconPanel && window.tlEconPanel.render) window.tlEconPanel.render(); } catch (e) { }
      var poly = window.measuredPolygon;
      var hasPoly = (poly && poly.length >= 3);
      try { if (hasPoly && typeof tlAutoGenerate === 'function') tlAutoGenerate({ scroll: false, stay: true }); } catch (e) { }
      try { if (hasPoly && typeof ppGenerateDiagram === 'function') ppGenerateDiagram({ scroll: false }); } catch (e) { }
      try { var v = document.getElementById('tlDimScaleVal'); if (v) v.textContent = Math.round(loadScale() * 100) + '%'; } catch (e) { }
    }, 360);
  }

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
  var RENDER = { price: htmlPrice, assum: htmlAssum, scale: htmlScale, geo: htmlGeo, eng: htmlEng };

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
    if (np) { try { localStorage.setItem(PRICE_KEY, JSON.stringify(priceObj)); } catch (e) { } }
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
        try { localStorage.removeItem(PRICE_KEY); } catch (e) { }
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
      try { localStorage.setItem(PRICE_KEY, JSON.stringify(pr)); } catch (e) { }
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
    }
  }
  function pageDefault() {
    var o;
    if (tab === 'price') {
      try { localStorage.removeItem(PRICE_KEY); } catch (e) { }
      setAssumRaw({ pf: 0, pm: 0, pb: 0 });
    } else if (tab === 'assum') {
      setAssumRaw({ price: 0, hours: 0, years: 0 });
    } else if (tab === 'scale') {
      try { localStorage.removeItem(SCALE_KEY); } catch (e) { }
    } else if (tab === 'geo') {
      window.RyDimGeo.reset();
    } else if (tab === 'eng') {
      window.RyBuryDepth.set(window.RyBuryDepth.DEF);
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
