/* ============================================================
   plugins/archive — 项目档案插件（插件协议第一批业务样板）
   ------------------------------------------------------------
   能力：保存当前设计为档案（4 个标签：作物 / 水源类型 / 区域 / 面积）
        · 档案列表检索（按名称 / 作物 / 区域）
        · 打开历史档案 → 还原设计图（走 ctx.data.applyProject，插件自己绝不写主程序数据）
        · 删除档案
   存储：云优先（ry_kv + RLS，仅登录态可用），不可用降级 localStorage（UI 明示）
   ============================================================ */

var ctx = null;
var unnav = null;
var panel = null;
var linkEl = null;
var onPipeExport = null;

var CROPS = ['芒果', '槟榔', '香蕉', '柑橘', '火龙果', '菠萝', '蔬菜', '花卉', '咖啡', '茶叶', '橡胶', '其他'];
var SOURCES = ['井水', '河水', '水库', '山塘', '自来水', '雨水收集', '其他'];

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function select(options, value) {
  var s = el('select', 'archive-input');
  options.forEach(function (o) {
    var op = document.createElement('option');
    op.value = o; op.textContent = o;
    if (o === value) op.selected = true;
    s.appendChild(op);
  });
  return s;
}

function toast(msg) {
  /* 复用主站 toast（runye-nav.css 的 .ry-nav-toast），缺失时退化为自建 */
  var d = el('div', 'ry-nav-toast', msg);
  d.setAttribute('role', 'status');
  document.body.appendChild(d);
  setTimeout(function () { d.classList.add('show'); }, 10);
  setTimeout(function () {
    d.classList.remove('show');
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
  }, 2400);
}

/* ---------------- 面板骨架 ---------------- */
function buildPanel() {
  var p = el('div', 'archive-panel');
  p.setAttribute('data-ry-plugin', 'archive');
  p.style.display = 'none';

  var head = el('div', 'archive-head');
  var title = el('b', null, '项目档案');
  var mode = el('span', 'archive-mode', '');
  var close = el('button', 'archive-x', '×');
  close.type = 'button';
  close.title = '关闭';
  close.addEventListener('click', function () { p.style.display = 'none'; });
  head.appendChild(title); head.appendChild(mode); head.appendChild(close);
  p.appendChild(head);

  /* --- 保存区 --- */
  var form = el('div', 'archive-form');
  var fName = el('input', 'archive-input'); fName.placeholder = '项目名（如：崖州芒果基地 A 区）';
  var fCrop = select(CROPS, CROPS[0]);
  var fSource = select(SOURCES, SOURCES[0]);
  var fRegion = el('input', 'archive-input'); fRegion.placeholder = '区域（如：三亚崖州）';
  var fArea = el('input', 'archive-input'); fArea.type = 'number'; fArea.step = '1'; fArea.placeholder = '面积（m²）';

  try { fArea.value = String(Math.round(window.measuredArea || 0) || ''); } catch (e) { }

  form.appendChild(row('项目名', fName));
  form.appendChild(row('作物', fCrop));
  form.appendChild(row('水源类型', fSource));
  form.appendChild(row('区域', fRegion));
  form.appendChild(row('面积 m²', fArea));
  p.appendChild(form);

  var btnRow = el('div', 'archive-btns');
  var btnSave = el('button', 'archive-btn primary', '保存为档案');
  btnSave.type = 'button';
  btnSave.addEventListener('click', function () {
    doSave({ name: fName.value, crop: fCrop.value, sourceType: fSource.value, region: fRegion.value, areaM2: parseFloat(fArea.value) || 0 });
  });
  var btnRefresh = el('button', 'archive-btn', '刷新列表');
  btnRefresh.type = 'button';
  btnRefresh.addEventListener('click', renderList);
  btnRow.appendChild(btnSave); btnRow.appendChild(btnRefresh);
  p.appendChild(btnRow);

  /* --- 检索 + 列表 --- */
  var search = el('input', 'archive-input');
  search.placeholder = '检索：项目名 / 作物 / 区域';
  search.addEventListener('input', renderList);
  p.appendChild(row('检索', search));

  var listWrap = el('div', 'archive-list');
  p.appendChild(listWrap);

  p._f = { name: fName, crop: fCrop, sourceType: fSource, region: fRegion, area: fArea, search: search, list: listWrap, mode: mode };
  return p;
}

function row(label, input) {
  var r = el('div', 'archive-row');
  var l = el('label', 'archive-label', label);
  l.appendChild(input);
  r.appendChild(l);
  return r;
}

/* ---------------- 业务动作 ---------------- */
function doSave(project) {
  if (!ctx || !ctx.data.saveArchive) { toast('存档权限未开通'); return; }
  var snap = ctx.data.captureProject ? ctx.data.captureProject() : null;
  var diag = ctx.data.readDiagram ? ctx.data.readDiagram() : null;
  if (!snap && !diag) { toast('当前没有可存档的设计内容'); return; }

  var arc = {
    project: {
      name: (project.name || '').trim() || ('未命名 ' + new Date().toLocaleString('zh-CN')),
      crop: project.crop || '',
      sourceType: project.sourceType || '',
      region: (project.region || '').trim(),
      areaM2: project.areaM2 || 0
    },
    design: {
      diagramSnapshot: diag ? diag.diagram : null,
      projectSnapshot: snap || null,
      flowModel: diag ? diag.meta.flowModel : null,
      optimization: null,
      bom: null
    },
    fieldFeedback: { actualItems: [], actualCost: 0, revisionNote: '', deviationPct: null }
  };

  ctx.data.saveArchive(arc).then(function (r) {
    if (!r) { toast('保存失败'); return; }
    if (r.cloud) toast('已保存到云端 · ' + arc.project.name);
    else toast('已保存到本机（未登录，云端不可用）· ' + arc.project.name);
    if (ctx.events.emit && ctx.events.EVENTS) { /* 事件类型由主程序常量提供 */ }
    emitSaved(r.archive);
    renderList();
    try { panel._f.area.value = String(Math.round(window.measuredArea || 0) || ''); } catch (e) { }
  });
}

function emitSaved(arc) {
  try {
    if (ctx.events && typeof ctx.events.emit === 'function') ctx.events.emit('archive-saved', { id: arc && arc.id });
  } catch (e) { }
}

function renderList() {
  if (!ctx || !ctx.data.readArchives || !panel) return;
  var f = panel._f;
  ctx.data.readArchives().then(function (list) {
    var kw = String(f.search.value || '').trim();
    f.mode.textContent = (ctx.data.storageMode && ctx.data.storageMode() === 'cloud') ? '☁ 云端' : '💻 本机';
    f.list.innerHTML = '';
    var hits = (list || []).filter(function (a) {
      if (!kw) return true;
      var p = a.project || {};
      return [p.name, p.crop, p.region].join(' ').indexOf(kw) >= 0;
    });
    if (!hits.length) {
      f.list.appendChild(el('div', 'archive-empty', kw ? '没有匹配的档案' : '还没有档案，先保存一个吧'));
      return;
    }
    hits.forEach(function (a) { f.list.appendChild(archiveRow(a)); });
  });
}

function archiveRow(a) {
  var p = a.project || {};
  var r = el('div', 'archive-item');
  var main = el('div', 'archive-item-main');
  main.appendChild(el('div', 'archive-item-title', p.name || '(未命名)'));
  var sub = [p.crop, p.sourceType, p.region].filter(Boolean).join(' · ');
  var mu = p.areaM2 ? (p.areaM2 / 666.67).toFixed(1) + ' 亩' : '';
  main.appendChild(el('div', 'archive-item-sub', [sub, mu, String(a.createdAt || '').slice(0, 16).replace('T', ' ')].filter(Boolean).join(' ｜ ')));
  r.appendChild(main);

  /* 偏差率：超支为红（中国习惯：增=红），节约为绿 */
  var fb = a.fieldFeedback || {};
  var base = (a.design && a.design.bom && Number(a.design.bom.totalAmount)) || 0;
  if (base > 0 && Number.isFinite(Number(fb.actualCost)) && Number(fb.actualCost) > 0) {
    var dev = (Number(fb.actualCost) - base) / base * 100;
    var tag = el('span', 'archive-dev ' + (dev >= 0 ? 'over' : 'under'),
      (dev >= 0 ? '超支 +' : '节约 ') + dev.toFixed(1) + '%');
    main.appendChild(tag);
  }

  var ops = el('div', 'archive-item-ops');
  var openB = el('button', 'archive-mini', '打开');
  openB.type = 'button';
  openB.addEventListener('click', function () { doOpen(a); });
  var fbB = el('button', 'archive-mini', '实测');
  fbB.type = 'button';
  fbB.addEventListener('click', function () { toggleFeedback(a, r); });
  var delB = el('button', 'archive-mini danger', '删除');
  delB.type = 'button';
  delB.addEventListener('click', function () { doDelete(a); });
  ops.appendChild(openB); ops.appendChild(fbB); ops.appendChild(delB);
  r.appendChild(ops);
  return r;
}

/* ---------------- 实测反馈（阶段二） ---------------- */
function toggleFeedback(a, rowEl) {
  var exist = rowEl.parentNode.querySelector('.archive-fb[data-fb="' + a.id + '"]');
  if (exist) { exist.parentNode.removeChild(exist); return; }
  var box = el('div', 'archive-fb');
  box.setAttribute('data-fb', a.id);

  var base = (a.design && a.design.bom && Number(a.design.bom.totalAmount)) || 0;
  box.appendChild(el('div', 'archive-fb-hint',
    base > 0 ? '设计造价 ¥' + (Math.round(base * 100) / 100) + '（来自档案内的 BOM）' : '该档案还没存 BOM，偏差率无法计算'));

  var fCost = el('input', 'archive-input'); fCost.type = 'number'; fCost.step = '0.01'; fCost.placeholder = '实际总造价（元）';
  var fItems = el('textarea', 'archive-input'); fItems.rows = 2; fItems.placeholder = '实际用材（每行一条：名称 规格 数量 单价）';
  var fNote = el('textarea', 'archive-input'); fNote.rows = 2; fNote.placeholder = '改管说明（现场为什么改的）';
  var fb = a.fieldFeedback || {};
  if (fb.actualCost) fCost.value = String(fb.actualCost);
  if (Array.isArray(fb.actualItems) && fb.actualItems.length) {
    fItems.value = fb.actualItems.map(function (x) { return [x.type, x.spec, x.qty, x.unitPrice].filter(Boolean).join(' '); }).join('\n');
  }
  fNote.value = fb.revisionNote || '';

  box.appendChild(row('实际造价（元）', fCost));
  box.appendChild(row('实际用材', fItems));
  box.appendChild(row('改管说明', fNote));

  var btns = el('div', 'archive-btns');
  var save = el('button', 'archive-btn primary', '保存实测');
  save.type = 'button';
  save.addEventListener('click', function () { saveFeedback(a, { cost: fCost.value, items: fItems.value, note: fNote.value }); });
  btns.appendChild(save);
  box.appendChild(btns);

  rowEl.parentNode.insertBefore(box, rowEl.nextSibling);
}

function saveFeedback(a, v) {
  if (!ctx || !ctx.data.saveArchive) { toast('权限未开通'); return; }
  var cost = parseFloat(v.cost);
  if (!(cost > 0)) { toast('请填实际总造价'); return; }
  var items = String(v.items || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
    var p = s.split(/\s+/);
    return { type: p[0] || '', spec: p[1] || '', qty: parseFloat(p[2]) || 0, unit: '', unitPrice: parseFloat(p[3]) || 0, amount: 0 };
  });
  var base = (a.design && a.design.bom && Number(a.design.bom.totalAmount)) || 0;
  /* 偏差率计算下沉到 Core（纯函数、可复用、可被测），插件不自己算 */
  var dev = ctx.data.computeDeviation ? ctx.data.computeDeviation(base, cost) : null;
  var arc = Object.assign({}, a);
  arc.fieldFeedback = {
    actualItems: items,
    actualCost: Math.round(cost * 100) / 100,
    revisionNote: String(v.note || ''),
    deviationPct: dev
  };
  ctx.data.saveArchive(arc).then(function (r) {
    if (!r) { toast('保存失败'); return; }
    toast(dev == null ? '实测已保存（无 BOM 基准，偏差率未计算）' : '实测已保存 · 偏差 ' + (dev >= 0 ? '+' : '') + dev + '%');
    renderList();
  });
}

function doOpen(a) {
  if (!ctx || !ctx.data.applyProject) { toast('还原权限未开通'); return; }
  var snap = a && a.design && a.design.projectSnapshot;
  if (!snap) { toast('该档案没有可还原的工程快照'); return; }
  if (!window.confirm('打开档案「' + ((a.project && a.project.name) || a.id) + '」？\n当前未保存的设计将被覆盖。')) return;
  var ok = ctx.data.applyProject(snap);
  toast(ok ? '已还原：' + ((a.project && a.project.name) || a.id) : '还原失败（见控制台）');
  try { if (ctx.events && ctx.events.emit) ctx.events.emit('archive-loaded', { id: a.id }); } catch (e) { }
}

function doDelete(a) {
  if (!ctx || !ctx.data.deleteArchive) { toast('权限未开通'); return; }
  if (!window.confirm('删除档案「' + ((a.project && a.project.name) || a.id) + '」？此操作不可撤销。')) return;
  ctx.data.deleteArchive(a.id).then(function (ok) {
    toast(ok ? '已删除' : '删除失败');
    renderList();
  });
}

/* ---------------- 生命周期 ---------------- */
export function activate(c) {
  ctx = c;

  /* 样式：插件自带，类名一律 archive- 前缀 */
  try {
    linkEl = document.createElement('link');
    linkEl.rel = 'stylesheet';
    /* 用 import.meta.url 解析：插件被搬动目录也不会丢样式（相对文档写死路径曾有此隐患） */
    linkEl.href = new URL('./style.css', import.meta.url).href;
    linkEl.setAttribute('data-ry-plugin-style', 'archive');
    document.head.appendChild(linkEl);
  } catch (e) { }

  panel = buildPanel();
  ctx.ui.mountPoint.appendChild(panel);

  if (ctx.ui.registerNav) {
    var arcNav = (ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {};
    unnav = ctx.ui.registerNav({
      label: arcNav.label || '项目档案',
      title: arcNav.title || '项目档案：保存 / 检索 / 还原历史设计',
      onClick: function () {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
        if (panel.style.display !== 'none') renderList();
      }
    });
  }

  /* 阶段一钩子：管网优化导出后提示可存档（不改 pipe_optim 内部逻辑，只监听事件） */
  onPipeExport = function () { toast('优化结果已导出 · 可在「项目档案」中存档'); };
  try { document.addEventListener('ry:pipe-optim-export', onPipeExport); } catch (e) { }

  ctx.runtime.log('boot', 'archive 插件已激活');
}

export function deactivate() {
  try { if (onPipeExport) document.removeEventListener('ry:pipe-optim-export', onPipeExport); } catch (e) { }
  onPipeExport = null;
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = null;
  if (linkEl && linkEl.parentNode) linkEl.parentNode.removeChild(linkEl);
  linkEl = null;
  ctx = null;
}
