/* ============================================================
   plugins/bom — 材料清单插件（阶段二）
   ------------------------------------------------------------
   内核复用：管材按 DN 汇总长度、管件计数来自 runye-material-audit.js（RyMaterialAudit），
             由 Core 的 ctx.data.readBom() 封装后交给本插件 —— 插件不碰任何主程序全局。
   本插件负责：展示、估价汇总、CSV 导出、把 BOM 存进指定项目档案。
   ============================================================ */

var ctx = null, offBus = null, panel = null, linkEl = null;
var current = null;      /* 最近一次生成的 BOM */

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
function money(n) {
  n = Number(n) || 0;
  return (Math.round(n * 100) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hasBomFeature() {
  var ent = (typeof window !== 'undefined') ? window.RyEntitle : null;
  if (!ent || typeof ent.can !== 'function') return false;
  if (typeof ent.ready === 'function' && !ent.ready()) return false;
  return ent.can('bom-export');
}
function requireBomFeature() {
  if (hasBomFeature()) return true;
  var ui = window.RyMemberUI;
  if (ui && typeof ui.showUpgrade === 'function') ui.showUpgrade('BOM 清单');
  else toast('BOM 清单为高级会员功能 · 邀请好友即可开通');
  return false;
}

/* ---------------- 面板 ---------------- */
function buildPanel() {
  var p = el('div', 'bom-panel');
  p.setAttribute('data-ry-plugin', 'bom');
  p.style.display = 'none';

  var head = el('div', 'bom-head');
  head.appendChild(el('b', null, '材料清单（BOM）'));
  var close = el('button', 'bom-x', '×');
  close.type = 'button'; close.title = '关闭';
  close.addEventListener('click', togglePanel);
  head.appendChild(close);
  p.appendChild(head);

  var btns = el('div', 'bom-btns');
  var bGen = el('button', 'bom-btn primary', '生成清单');
  bGen.type = 'button';
  bGen.addEventListener('click', generate);
  var bCsv = el('button', 'bom-btn', '导出 CSV');
  bCsv.type = 'button';
  bCsv.addEventListener('click', exportCsv);
  var bSave = el('button', 'bom-btn', '存入档案');
  bSave.type = 'button';
  bSave.addEventListener('click', saveIntoArchive);
  btns.appendChild(bGen); btns.appendChild(bCsv); btns.appendChild(bSave);
  p.appendChild(btns);

  var selRow = el('div', 'bom-row');
  selRow.appendChild(el('span', 'bom-label', '目标档案'));
  var sel = el('select', 'bom-select');
  sel.appendChild(document.createElement('option'));
  selRow.appendChild(sel);
  p.appendChild(selRow);

  var body = el('div', 'bom-body');
  p.appendChild(body);

  p._f = { sel: sel, body: body };
  return p;
}

function openPanel() {
  if (!requireBomFeature()) return false;
  if (!panel) return false;
  panel.style.display = '';
  refreshArchives();
  generate();
  return true;
}

function togglePanel() {
  if (!panel) return false;
  if (panel.style.display === 'none') return openPanel();
  panel.style.display = 'none';
  return true;
}

/* ---------------- 生成 / 渲染 ---------------- */
function generate() {
  if (!requireBomFeature()) return;
  if (!ctx || !ctx.data.readBom) { toast('BOM 权限未开通'); return; }
  var bom = ctx.data.readBom();
  if (!bom) { toast('还没生成三级管网，出不了清单'); current = null; render(); return; }
  current = bom;
  render();
  toast('已生成 ' + bom.items.length + ' 项 · 合计 ¥' + money(bom.totalAmount));
}

function render() {
  var body = panel._f.body;
  body.innerHTML = '';
  if (!current) {
    body.appendChild(el('div', 'bom-empty', '点「生成清单」从当前设计图生成材料表'));
    return;
  }
  var m = current.meta || {};
  var head = el('div', 'bom-meta',
    '面积 ' + Math.round(m.areaM2 || 0) + ' m² ｜ 行距 ' + (m.tapeSpacing || '-') + ' m ｜ 管径 首/' +
    (m.od ? [m.od.front, m.od.main, m.od.branch].join('/') : '-') + ' mm');
  body.appendChild(head);

  var tb = el('div', 'bom-table');
  var hr = el('div', 'bom-tr bom-th');
  ['名称', '规格', '数量', '单价', '金额'].forEach(function (t) { hr.appendChild(el('div', null, t)); });
  tb.appendChild(hr);
  current.items.forEach(function (it) {
    var r = el('div', 'bom-tr');
    r.appendChild(el('div', null, it.label));
    r.appendChild(el('div', 'bom-dim', it.spec));
    r.appendChild(el('div', null, (Math.round(it.qty * 100) / 100) + ' ' + it.unit));
    r.appendChild(el('div', 'bom-dim', it.unitPrice > 0 ? money(it.unitPrice) : '未计价'));
    r.appendChild(el('div', null, it.unitPrice > 0 ? money(it.amount) : '—'));
    tb.appendChild(r);
  });
  body.appendChild(tb);

  var foot = el('div', 'bom-foot', '合计 ¥' + money(current.totalAmount) +
    (current.unpriced ? '（' + current.unpriced + ' 项未计价：管件无价目，需手填）' : ''));
  body.appendChild(foot);
}

/* ---------------- CSV 导出 ---------------- */
function exportCsv() {
  if (!requireBomFeature()) return;
  if (!current || !current.items.length) { toast('先生成清单'); return; }
  var rows = [['名称', '规格', '数量', '单位', '单价(元)', '金额(元)']];
  current.items.forEach(function (it) {
    rows.push([it.label, it.spec, it.qty, it.unit, it.unitPrice, it.amount]);
  });
  rows.push([]);
  rows.push(['合计', '', '', '', '', current.totalAmount]);
  var csv = '\ufeff' + rows.map(function (r) {
    return r.map(function (c) {
      var s = String(c == null ? '' : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\r\n');
  try {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = '材料清单_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('CSV 已导出');
  } catch (e) { toast('导出失败'); }
}

/* ---------------- 存入档案 ---------------- */
function refreshArchives() {
  if (!ctx || !ctx.data.readArchives) return;
  var sel = panel._f.sel;
  ctx.data.readArchives().then(function (list) {
    var keep = sel.value;
    sel.innerHTML = '';
    var ph = document.createElement('option');
    ph.value = ''; ph.textContent = '（新建档案并存入）';
    sel.appendChild(ph);
    (list || []).forEach(function (a) {
      var op = document.createElement('option');
      op.value = a.id; op.textContent = (a.project && a.project.name) || a.id;
      sel.appendChild(op);
    });
    sel.value = keep;
  });
}

function saveIntoArchive() {
  if (!requireBomFeature()) return;
  if (!current) { toast('先生成清单'); return; }
  if (!ctx || !ctx.data.saveArchive) { toast('存档权限未开通'); return; }
  var id = panel._f.sel.value;
  var put = function (base) {
    var arc = Object.assign({}, base || {});
    arc.design = Object.assign({}, arc.design || {}, { bom: { items: current.items, totalAmount: current.totalAmount } });
    return ctx.data.saveArchive(arc);
  };
  var p = id ? ctx.data.loadArchive(id).then(put) : put({
    project: { name: '（BOM 自动建档）' + new Date().toLocaleString('zh-CN'), crop: '', sourceType: '', region: '', areaM2: (current.meta && current.meta.areaM2) || 0 }
  });
  p.then(function (r) {
    if (!r) { toast('保存失败'); return; }
    toast(r.cloud ? 'BOM 已存入云端档案' : 'BOM 已存入本机档案');
    refreshArchives();
  });
}

/* ---------------- 生命周期 ---------------- */
export function activate(c) {
  ctx = c;
  try {
    linkEl = document.createElement('link');
    linkEl.rel = 'stylesheet';
    linkEl.href = new URL('./style.css', import.meta.url).href;
    linkEl.setAttribute('data-ry-plugin-style', 'bom');
    document.head.appendChild(linkEl);
  } catch (e) { }

  panel = buildPanel();
  ctx.ui.mountPoint.appendChild(panel);

  if (ctx.events && typeof ctx.events.on === 'function') {
    offBus = ctx.events.on('bom-open-request', openPanel);
  }
  ctx.runtime.log('boot', 'bom 插件已激活（由材料清单入口打开面板）');
}

export function deactivate() {
  if (offBus) { try { offBus(); } catch (e) { } offBus = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = null;
  if (linkEl && linkEl.parentNode) linkEl.parentNode.removeChild(linkEl);
  linkEl = null;
  current = null;
  ctx = null;
}
