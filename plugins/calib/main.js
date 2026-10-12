/* ============================================================
   plugins/calib — 水力参数标定（Hazen-Williams C 值反推）
   ------------------------------------------------------------
   ★ 方案硬性要求（§5 阶段三第 3 项）：「口径文档化 + 人工确认后 opt-in，
     不得静默改变现有计算」。本插件的对应实现：
     1. 反推/正算全是 Core 的纯函数（ctx.data.invertHazenC / hazenLoss），
        本插件自己**不实现任何公式**，保证与主程序同源、口径不会漂移；
     2. 口径文档由 Core 的 hazenDefaults() 提供（与代码同源，不是手抄的文案）；
     3. 只有用户**显式勾选「采纳」**才会写 —— 且只写进档案的
        design.optimization.hazenC 字段，**主程序的 C_HAZEN / hazenWilliams 一律不动**；
     4. 没勾选就点写入 → 拒绝并提示，绝不留半个写入。
   ============================================================ */

var ctx = null, unnav = null, panel = null, lastC = null;

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
function row(label, input) {
  var r = el('div', 'calib-row');
  var l = el('label', 'calib-label', label);
  l.appendChild(input);
  r.appendChild(l);
  return r;
}
function numInput(ph, val) {
  var i = el('input', 'calib-input');
  i.type = 'number'; i.step = 'any'; i.placeholder = ph;
  if (val != null) i.value = String(val);
  return i;
}

function buildPanel() {
  var p = el('div', 'calib-panel');
  p.setAttribute('data-ry-plugin', 'calib');
  p.style.display = 'none';

  var head = el('div', 'calib-head');
  head.appendChild(el('b', null, '水力参数标定（Hazen-Williams C 值反推）'));
  var close = el('button', 'calib-x', '×');
  close.type = 'button';
  close.addEventListener('click', function () { p.style.display = 'none'; });
  head.appendChild(close);
  p.appendChild(head);

  p.appendChild(el('div', 'calib-note',
    '只给参考：反推出的 C 不会自动进入任何计算。勾选下方「采纳」才会写进所选档案，作为记录留痕。'));

  var fL = numInput('管长 L（m）');
  var fQ = numInput('流量 Q（m³/h）');
  var fD = numInput('内径 D（mm）');
  var fHf = numInput('实测水头损失 hf（m）');
  var form = el('div', 'calib-form');
  form.appendChild(row('管长 L（m）', fL));
  form.appendChild(row('流量 Q（m³/h）', fQ));
  form.appendChild(row('内径 D（mm）', fD));
  form.appendChild(row('实测水头损失 hf（m）', fHf));
  p.appendChild(form);

  var btns = el('div', 'calib-btns');
  var bGo = el('button', 'calib-btn primary', '反推 C 值');
  bGo.type = 'button';
  bGo.addEventListener('click', function () { run(fL, fQ, fD, fHf); });
  btns.appendChild(bGo);
  p.appendChild(btns);

  var out = el('div', 'calib-out');
  p.appendChild(out);

  /* ---- opt-in 区：档案下拉 + 采纳勾选 + 写入 ---- */
  var opt = el('div', 'calib-opt');
  var sel = el('select', 'calib-input');
  sel.appendChild(document.createElement('option'));
  var chk = el('input', 'calib-check');
  chk.type = 'checkbox';
  chk.checked = !!(ctx && ctx.manifest && ctx.manifest.config && ctx.manifest.config.optInDefault);
  var lab = el('label', 'calib-label', ' ');
  lab.insertBefore(chk, lab.firstChild);
  lab.appendChild(document.createTextNode('采纳该 C 值并写入所选档案（opt-in，默认不勾）'));
  var bSave = el('button', 'calib-btn', '写入档案');
  bSave.type = 'button';
  bSave.addEventListener('click', function () { save(sel, chk); });
  opt.appendChild(row('目标档案', sel));
  opt.appendChild(lab);
  opt.appendChild(bSave);
  p.appendChild(opt);

  /* ---- 口径文档（与 Core 同源，不是手抄文案）---- */
  var d = (ctx && ctx.data.hazenDefaults) ? ctx.data.hazenDefaults() : null;
  if (d) {
    var doc = el('div', 'calib-doc');
    doc.appendChild(el('div', null, '口径：' + d.formula));
    doc.appendChild(el('div', null, '单位：hf ' + d.units.hf + ' ｜ L ' + d.units.L + ' ｜ Q ' + d.units.Q + ' ｜ D ' + d.units.D));
    doc.appendChild(el('div', null, '当前默认 C = ' + d.C + '（来源：' + d.source + '）'));
    doc.appendChild(el('div', null, '适用：' + d.scope));
    doc.appendChild(el('div', 'calib-caution', '提醒：' + d.caution));
    p.appendChild(doc);
  }

  p._f = { L: fL, Q: fQ, d: fD, hf: fHf, out: out, sel: sel, chk: chk };
  return p;
}

function refreshArchives() {
  var f = panel._f;
  if (!f || !ctx.data.readArchives) return;
  ctx.data.readArchives().then(function (list) {
    var cur = f.sel.value;
    f.sel.innerHTML = '';
    f.sel.appendChild(document.createElement('option'));
    (list || []).forEach(function (a) {
      var op = document.createElement('option');
      op.value = a.id;
      op.textContent = ((a.project && a.project.name) || a.id) +
        (a.project && a.project.crop ? ' · ' + a.project.crop : '');
      f.sel.appendChild(op);
    });
    if (cur) f.sel.value = cur;
  });
}

function run(fL, fQ, fD, fHf) {
  if (!ctx.data.invertHazenC) { toast('反推能力未开通'); return; }
  var f = panel._f;
  var p = { L: parseFloat(fL.value), Q: parseFloat(fQ.value), d: parseFloat(fD.value), hf: parseFloat(fHf.value) };
  f.out.innerHTML = '';

  var c = ctx.data.invertHazenC(p);
  if (c == null) {
    f.out.appendChild(el('div', 'calib-empty', '四个输入都必须是正数（L/Q/D/hf），否则无法反推 —— 不臆造结果。'));
    lastC = null;
    return;
  }
  lastC = c;
  var d = ctx.data.hazenDefaults ? ctx.data.hazenDefaults() : { C: 150 };
  var dev = d.C > 0 ? Math.round((c - d.C) / d.C * 10000) / 100 : null;
  f.out.appendChild(el('div', 'calib-res', '反推 C = ' + c + '（当前默认 ' + d.C + '，偏差 ' +
    (dev == null ? '-' : (dev > 0 ? '+' : '') + dev + '%') + '）'));

  if (ctx.data.hazenLoss) {
    var theo = ctx.data.hazenLoss({ L: p.L, Q: p.Q, d: p.d, C: d.C });
    if (theo != null) {
      f.out.appendChild(el('div', 'calib-sub',
        '按默认 C 的理论损失 ' + theo + ' m ｜ 实测 ' + p.hf + ' m ｜ 差 ' +
        (Math.round((p.hf - theo) * 10000) / 10000) + ' m'));
    }
  }
  f.out.appendChild(el('div', 'calib-sub', dev == null ? '' :
    (dev < 0 ? '实测损失偏大 ⇒ 实际 C 低于默认，管路可能有老化/结垢/局部堵塞。'
      : '实测损失偏小 ⇒ 实际 C 高于默认，不要据此放大管径。')));
}

function save(sel, chk) {
  if (!ctx.data.saveArchive || !ctx.data.loadArchive) { toast('存档权限未开通'); return; }
  /* ★ 硬闸门：没勾 opt-in 就绝不写 —— 方案要求「不得静默改变」，这里连「半写入」都不允许 */
  if (!chk.checked) { toast('未勾选「采纳」—— 不写入任何档案'); return; }
  if (lastC == null) { toast('先反推出 C 值再采纳'); return; }
  var id = sel.value;
  if (!id) { toast('请先选择目标档案'); return; }

  ctx.data.loadArchive(id).then(function (a) {
    if (!a) { toast('档案不存在'); return null; }
    var f = panel._f;
    var arc = JSON.parse(JSON.stringify(a));
    arc.design = arc.design || {};
    arc.design.optimization = arc.design.optimization || {};
    arc.design.optimization.hazenC = lastC;
    arc.design.optimization.hazenCAt = new Date().toISOString();
    arc.design.optimization.hazenCBasis = {
      L: parseFloat(f.L.value), Q: parseFloat(f.Q.value),
      d: parseFloat(f.d.value), hf: parseFloat(f.hf.value), note: '单次实测反推，仅供留痕，未改动任何计算'
    };
    return ctx.data.saveArchive(arc).then(function (r) {
      toast(r && r.cloud ? '已写入云端档案' : '已写入本机档案');
      return r;
    });
  }).catch(function () { toast('写入失败'); });
}

export function activate(c) {
  ctx = c;
  panel = buildPanel();
  c.ui.mountPoint.appendChild(panel);
  var styleEl = document.getElementById('calibCss');
  if (!styleEl) {
    var link = document.createElement('link');
    link.id = 'calibCss';
    link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href;
    document.head.appendChild(link);
  }
  if (c.ui.registerNav) {
    var nav = (c.manifest && c.manifest.ui && c.manifest.ui.nav) || {};
    unnav = c.ui.registerNav({
      label: nav.label || '参数标定',
      title: nav.title || '',
      order: nav.order,
      onClick: function () {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
        if (panel.style.display !== 'none') refreshArchives();
      }
    });
  }
  c.runtime.log('boot', 'calib 已激活（默认只读，opt-in 才写）');
  return {
    open: function () { panel.style.display = ''; refreshArchives(); },
    lastC: function () { return lastC; }
  };
}

export function deactivate() {
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  var css = document.getElementById('calibCss');
  if (css && css.parentNode) css.parentNode.removeChild(css);
  panel = null; ctx = null; lastC = null;
}
