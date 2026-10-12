/* ============================================================
   plugins/case-lib — 案例检索与推荐（阶段三）
   ------------------------------------------------------------
   · 相似度匹配跑在 Core 的 ctx.data.findSimilar() 上（权重：面积 .4 / 作物 .25 / 区域 .2 / 水源 .15）
   · 数据源 = 项目档案库（自带标签 + BOM），案例库达 20 条后推荐才真正有意义（UI 会提示样本量）
   · 「导出方案报告」复用 runye-case-library.js 的脱敏内核（不上传任何数据）
   ★ 参数反推（如 Hazen-Williams 实际 C 值修正）**默认不做**，方案要求 opt-in + 文档化；
     本阶段只出「参考区间」，绝不静默改动现有水力计算。
   ============================================================ */

var ctx = null, unnav = null, panel = null, linkEl = null;

var CROPS = ['芒果', '槟榔', '香蕉', '柑橘', '火龙果', '菠萝', '蔬菜', '花卉', '咖啡', '茶叶', '橡胶', '其他'];
var SOURCES = ['井水', '河水', '水库', '山塘', '自来水', '雨水收集', '其他'];

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function toast(msg) {
  var d = el('div', 'ry-nav-toast', msg);
  d.setAttribute('role', 'status');
  document.body.appendChild(d);
  setTimeout(function () { d.classList.add('show'); }, 10);
  setTimeout(function () {
    d.classList.remove('show');
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
  }, 2400);
}
function select(options, value) {
  var s = el('select', 'case-input');
  s.appendChild(document.createElement('option'));
  options.forEach(function (o) {
    var op = document.createElement('option');
    op.value = o; op.textContent = o;
    if (o === value) op.selected = true;
    s.appendChild(op);
  });
  return s;
}
function row(label, input) {
  var r = el('div', 'case-row');
  var l = el('label', 'case-label', label);
  l.appendChild(input);
  r.appendChild(l);
  return r;
}

function buildPanel() {
  var p = el('div', 'case-panel');
  p.setAttribute('data-ry-plugin', 'case-lib');
  p.style.display = 'none';

  var head = el('div', 'case-head');
  head.appendChild(el('b', null, '案例检索与推荐'));
  var close = el('button', 'case-x', '×');
  close.type = 'button'; close.title = '关闭';
  close.addEventListener('click', function () { p.style.display = 'none'; });
  head.appendChild(close);
  p.appendChild(head);

  var fCrop = select(CROPS, '');
  var fSource = select(SOURCES, '');
  var fRegion = el('input', 'case-input'); fRegion.placeholder = '区域（如：三亚崖州，可留空）';
  var fArea = el('input', 'case-input'); fArea.type = 'number'; fArea.step = '1'; fArea.placeholder = '面积 m²';
  try { fArea.value = String(Math.round(window.measuredArea || 0) || ''); } catch (e) { }

  var form = el('div', 'case-form');
  form.appendChild(row('作物', fCrop));
  form.appendChild(row('水源类型', fSource));
  form.appendChild(row('区域', fRegion));
  form.appendChild(row('面积 m²', fArea));
  p.appendChild(form);

  var btns = el('div', 'case-btns');
  var bFind = el('button', 'case-btn primary', '找相似案例');
  bFind.type = 'button';
  bFind.addEventListener('click', find);
  var bReport = el('button', 'case-btn', '导出方案报告');
  bReport.type = 'button';
  bReport.addEventListener('click', exportReport);
  btns.appendChild(bFind); btns.appendChild(bReport);
  p.appendChild(btns);

  var out = el('div', 'case-out');
  p.appendChild(out);

  p._f = { crop: fCrop, source: fSource, region: fRegion, area: fArea, out: out };
  return p;
}

/* ---------------- 检索 ---------------- */
function find() {
  if (!ctx || !ctx.data.findSimilar) { toast('检索权限未开通'); return; }
  var f = panel._f;
  var q = {
    crop: f.crop.value, sourceType: f.source.value,
    region: (f.region.value || '').trim(), areaM2: parseFloat(f.area.value) || 0
  };
  if (!q.areaM2) { toast('请先填面积（相似度主要看面积）'); return; }
  f.out.innerHTML = '';
  f.out.appendChild(el('div', 'case-dim', '检索中…'));

  var run = ctx.data.recommend || ctx.data.findSimilar;
  run(q, { minScore: 0.35, limit: 10 }).then(function (res) {
    f.out.innerHTML = '';
    if (!res || !res.count) {
      f.out.appendChild(el('div', 'case-empty', '没有相似案例。先用「项目档案」存几个项目（带 BOM）再来看推荐。'));
      return;
    }
    if (res.count < 20) {
      f.out.appendChild(el('div', 'case-warn', '样本仅 ' + res.count + ' 个，以下仅供参考；案例库达 20 条以上更可信。'));
    }
    recoBlock(res, f.out);
    if (res.range) {
      var r = res.range;
      f.out.appendChild(el('div', 'case-range',
        '参考造价区间：¥' + r.p25 + ' ~ ¥' + r.p75 + ' / 亩（中位 ¥' + r.median + '，样本 ' + r.n + ' 个）'));
    }
    res.hits.forEach(function (h) { f.out.appendChild(hitRow(h)); });
  });
}

/* ---------------- 参考方案（逐管段 DN + 参考拓扑）----------------
   ★ 这是「参考」，不是「替你做设计」：给出历史多数派口径 + 可信度，
     绝不写回主程序，也不改任何现有水力计算。 */
var SEG_LABEL = { front: '首部接管', main: '主管', branch: '支管' };

function recoBlock(res, box) {
  var wrap = el('div', 'case-reco');
  wrap.appendChild(el('div', 'case-reco-title', '参考方案（来自 ' + res.count + ' 个相似案例）'));

  if (res.pipes) {
    var dn = el('div', 'case-dn');
    ['front', 'main', 'branch'].forEach(function (s) {
      var v = res.pipes[s];
      dn.appendChild(el('span', 'case-dn-item',
        SEG_LABEL[s] + '：' + (v ? ('Ø' + v.od + ' mm（' + Math.round(v.confidence * 100) + '% 一致）') : '样本无数据')));
    });
    wrap.appendChild(dn);
  } else {
    wrap.appendChild(el('div', 'case-dim', '相似案例都还没存 BOM，无法给出参考口径 —— 先到「材料清单」存一次。'));
  }

  if (res.topology) {
    var t = res.topology;
    var bits = [];
    if (t.mainLenPerMu != null) bits.push('主管 ' + t.mainLenPerMu + ' m/亩');
    if (t.branchLenPerMu != null) bits.push('支管 ' + t.branchLenPerMu + ' m/亩');
    if (t.tapeLenPerMu != null) bits.push('滴灌带 ' + t.tapeLenPerMu + ' m/亩');
    if (t.mainSegments != null) bits.push('主管段 ' + t.mainSegments + ' 条');
    if (t.branchSegments != null) bits.push('支管段 ' + t.branchSegments + ' 条');
    wrap.appendChild(el('div', 'case-topo', '参考拓扑（中位）：' + (bits.length ? bits.join(' · ') : '样本无数据')));
  }
  box.appendChild(wrap);
}

function hitRow(h) {
  var a = h.archive || {}, p = a.project || {};
  var r = el('div', 'case-hit');
  var main = el('div', 'case-hit-main');
  main.appendChild(el('div', 'case-hit-title',
    (p.name || '(未命名)') + '  ' + Math.round((h.score || 0) * 100) + '%'));
  var mu = p.areaM2 ? (p.areaM2 / 666.67).toFixed(1) + ' 亩' : '';
  main.appendChild(el('div', 'case-hit-sub',
    [p.crop, p.sourceType, p.region, mu].filter(Boolean).join(' · ')));
  if (h.perMu != null) {
    main.appendChild(el('div', 'case-hit-sub', '造价 ¥' + h.perMu + ' / 亩'));
  }
  var why = [];
  if (h.parts.crop) why.push('作物同');
  if (h.parts.source) why.push('水源同');
  if (h.parts.region) why.push('区域近');
  why.push('面积 ' + Math.round((h.parts.area || 0) * 100) + '%');
  main.appendChild(el('div', 'case-why', why.join(' ｜ ')));
  r.appendChild(main);
  return r;
}

/* ---------------- 方案报告导出 ---------------- */
function exportReport() {
  if (!ctx || !ctx.data.buildCase) { toast('案例内核不可用'); return; }
  var f = panel._f;
  var c = ctx.data.buildCase({ status: 'pending', rating: 0, note: (f.region.value || '') });
  if (!c) { toast('还没生成三级管网，或案例内核缺失'); return; }
  try {
    var blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = '润野方案报告_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('方案报告已导出（已脱敏）');
  } catch (e) { toast('导出失败'); }
}

/* ---------------- 生命周期 ---------------- */
export function activate(c) {
  ctx = c;
  try {
    linkEl = document.createElement('link');
    linkEl.rel = 'stylesheet';
    linkEl.href = new URL('./style.css', import.meta.url).href;
    linkEl.setAttribute('data-ry-plugin-style', 'case-lib');
    document.head.appendChild(linkEl);
  } catch (e) { }

  panel = buildPanel();
  ctx.ui.mountPoint.appendChild(panel);

  if (ctx.ui.registerNav) {
    var clNav = (ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {};
    unnav = ctx.ui.registerNav({
      label: clNav.label || '案例推荐',
      title: clNav.title || '按作物/面积/水源/区域找历史相似项目，给造价区间参考',
      onClick: function () {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
      }
    });
  }
  ctx.runtime.log('boot', 'case-lib 插件已激活');
}

export function deactivate() {
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = null;
  if (linkEl && linkEl.parentNode) linkEl.parentNode.removeChild(linkEl);
  linkEl = null;
  ctx = null;
}
