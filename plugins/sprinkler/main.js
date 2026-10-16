/* ============================================================
   plugins/sprinkler —— 「喷灌成果」（terrain 内核宿主 · 壳）
   ------------------------------------------------------------
   任务书：TASK_sprinkler-pipeline_20261012（P0）。照抄 plugins/hydraulics v379
   的「内核宿主」骨架 + plugins/bom 的面板模式，职责三步：

     ① 注入内核：主页 index.html 并不加载 terrain/terrain-core.js（只有 terrain
        页自己用 <script> 加载），插件体系所在的主页上下文里没有这套喷灌内核。
        本插件把 terrain-core.js 按需 <script> 注入 → window.RyTerrainData
        （★ terrain-core.js UMD 实际挂的全局名是 RyTerrainData，不是任务书草稿
        里的 RyTerrainCore —— 以内核源码为准），就绪后广播 sprinkler-core-ready；
        超时/失败 → reportError + fail-open，不冒异常到主程序。
     ② 暴露 API（activate 返回值 → registry['sprinkler'].api）：
        estimate / layout / bom 全部透传内核纯函数，无内核返回 null ——
        宁可「算不了」也不造假数（PLUGIN_DEV §9.6）。
     ③ BOM 桥消费：terrain 页「估算」会把 {version,ts,plotRef,bom,layout} 写进
        localStorage[storageKey]（先 remove 再 set 的全新快照）。本插件只读展示，
        不写回任何主程序数据。同文档 set 不触发 storage 事件，但跨标签页会触发 ——
        两条路都接：activate 时读一次 + storage 事件命中 key 时刷新面板。

   类名一律 sp- 前缀（PLUGIN_DEV §5.4）；label 单一来源 manifest（C33）；
   deactivate 摘掉本插件全部 DOM / 监听 / 注入的 script 标签。
   ============================================================ */

var ctxRef = null;
var stopped = false;
var coreP = null;        /* 内核加载 Promise（并发共享） */
var coreSettled = false;
var unnav = null;        /* registerNav 注销函数 */
var panel = null;
var storageHandler = null;

function cfg(ctx) { return (ctx && ctx.manifest && ctx.manifest.config) || {}; }
function navCfg(ctx) { return (ctx && ctx.manifest && ctx.manifest.ui && ctx.manifest.ui.nav) || {}; }
function storageKey(ctx) { return cfg(ctx).storageKey || 'runyeSprinklerResult'; }

/* ---------------- ① 内核注入（照抄 hydraulics loadOne/loadCore 的容错模式） ----------------
   terrain-core.js 是纯计算、零 DOM 的 UMD（Node 也能 require），重复执行无副作用，
   所以「判据只用目标全局是否出现」+ 过期重注入的同款策略直接适用。 */
var CORE_FILE = 'terrain/terrain-core.js';
var CORE_GLOBAL = 'RyTerrainData';   /* terrain-core.js UMD 实际挂的全局名 */

var SITE_ROOT = (function () {
  try { return new URL('../../', import.meta.url).href; } catch (e) { return ''; }
})();

var injected = [];
function injectedFor(file) {
  var hit = null;
  injected.forEach(function (t) { if (t.getAttribute('data-ry-spcore') === file) hit = t; });
  return hit;
}

function coreGlobalFn() { return (typeof window !== 'undefined') ? window : null; }

function coreMissing() {
  var W = coreGlobalFn();
  if (!W || !W[CORE_GLOBAL]) return [CORE_GLOBAL];
  return [];
}
function coreReady() { return coreMissing().length === 0; }

function loadOne() {
  return new Promise(function (resolve) {
    var W = coreGlobalFn();
    var tries = 0, MAX = 60;                 /* 60×50ms = 3s */
    var tag = null;
    (function poll() {
      if (stopped) { resolve({ ok: false, reason: 'deactivated' }); return; }
      if (W && W[CORE_GLOBAL]) { resolve({ ok: true, reused: !tag }); return; }
      var had = injectedFor(CORE_FILE);
      if (!tag && (!had || tries > 20)) {
        try {
          tag = document.createElement('script');
          tag.setAttribute('data-ry-spcore', CORE_FILE);
          tag.src = SITE_ROOT + CORE_FILE;
          tag.async = false;
          document.head.appendChild(tag);
          injected.push(tag);
        } catch (e) {
          resolve({ ok: false, reason: 'inject-failed: ' + CORE_FILE });
          return;
        }
      }
      if (++tries >= MAX) { resolve({ ok: false, reason: 'timeout: ' + CORE_GLOBAL }); return; }
      setTimeout(poll, 50);
    })();
  });
}

function loadCore() {
  if (coreReady()) {
    return coreP || (coreP = Promise.resolve({ ok: true, reused: true, missing: [] }));
  }
  if (coreP && coreSettled) { coreP = null; coreSettled = false; }
  if (coreP) return coreP;
  coreSettled = false;
  coreP = loadOne().then(function (r) {
    coreSettled = true;
    var missing = coreMissing();
    var out = { ok: r.ok && missing.length === 0, missing: missing, reason: r.reason || '' };
    if (!out.ok && ctxRef && ctxRef.runtime && typeof ctxRef.runtime.reportError === 'function') {
      /* 内核拿不到 ≠ 插件废了：面板照常可开（显示「无成果」），API 层降级为 null。 */
      ctxRef.runtime.reportError(new Error('喷灌内核加载不完整：' + (out.reason || missing.join(','))));
    }
    if (out.ok && ctxRef && ctxRef.events && typeof ctxRef.events.emit === 'function') {
      ctxRef.events.emit('sprinkler-core-ready', { at: Date.now() });
    }
    return out;
  });
  return coreP;
}

/* ---------------- ② API 透传（全部判空返回 null，不造假数） ---------------- */
function coreFn(name) {
  var W = coreGlobalFn();
  return (W && W[CORE_GLOBAL] && typeof W[CORE_GLOBAL][name] === 'function') ? W[CORE_GLOBAL][name] : null;
}
function passthrough(name, args) {
  var f = coreFn(name);
  if (!f) return null;
  try { return f.apply(null, args); }
  catch (e) { if (ctxRef && ctxRef.runtime) ctxRef.runtime.reportError(e); return null; }
}

/* 深拷贝读桥数据（PLUGIN_DEV §5.2：数据只读），解析失败返回 null */
function readBridged() {
  var store = (typeof window !== 'undefined') ? window.RySprinklerBridgeStore : null;
  return store && typeof store.readSnapshot === 'function'
    ? store.readSnapshot(storageKey(ctxRef)) : null;
}

/* ---------------- 会员门控（feat=pro-others，三态 fail-open，同 runye-nav.js gate()） ---------------- */
function gate(ctx) {
  var feat = cfg(ctx).feat;
  if (!feat) return true;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  if (!E || typeof E.can !== 'function') return true;
  if (E.mockPlan) return E.can(feat);
  if (typeof E.ready === 'function' && !E.ready()) return true;
  return E.can(feat);
}
function pending(ctx) {
  var feat = cfg(ctx).feat;
  var E = (typeof window !== 'undefined') ? window.RyEntitle : null;
  return !!(feat && E && typeof E.access === 'function' && E.access(feat) === 'pending');
}
function onLocked(ctx) {
  var lb = navCfg(ctx).label || ctx.id;
  var U = (typeof window !== 'undefined') ? window.RyMemberUI : null;
  if (U && typeof U.showUpgrade === 'function') { U.showUpgrade(lb); return; }
  toast('「' + lb + '」为高级会员功能 · 邀请好友即可开通');
}

function toast(msg) {
  try {
    var d = document.createElement('div');
    d.className = 'ry-nav-toast';
    d.setAttribute('role', 'status');
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.classList.add('show'); }, 10);
    setTimeout(function () {
      d.classList.remove('show');
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300);
    }, 2400);
  } catch (e) { }
}

/* ---------------- ③ 面板（只读展示桥数据；类名 sp- 前缀，内联样式零外部依赖） ---------------- */
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmtRow(k, v) {
  var r = el('div', 'sp-row');
  r.style.display = 'flex';
  r.style.justifyContent = 'space-between';
  r.style.gap = '8px';
  r.style.padding = '3px 0';
  r.style.borderBottom = '1px dashed rgba(100,116,139,.25)';
  r.appendChild(el('span', 'sp-k', k));
  var vv = el('span', 'sp-v', v);
  vv.style.fontWeight = '600';
  vv.style.textAlign = 'right';
  r.appendChild(vv);
  return r;
}

function renderPanel() {
  if (!panel) return;
  var body = panel.querySelector('.sp-body');
  if (!body) return;
  body.innerHTML = '';
  var data = ctxRef ? readBridged() : null;
  if (!coreReady()) {
    body.appendChild(el('div', 'sp-empty', '喷灌内核未就绪（terrain-core 加载中或失败）——成果展示暂不可用，刷新本页或稍后再试。'));
    return;
  }
  if (!data || !data.bom || data.bom.ok !== true) {
    body.appendChild(el('div', 'sp-empty', '还没有喷灌成果。去 terrain 页（地块与地形）填好喷灌参数点「估算」，这里会自动读到 BOM 快照。'));
    return;
  }
  var b = data.bom;
  var meta = el('div', 'sp-meta');
  meta.style.cssText = 'font-size:12px;opacity:.75;margin-bottom:6px;';
  var pr = data.plotRef || {};
  meta.textContent = (pr.name || '—') + ' · ' + (pr.mu != null ? pr.mu + ' 亩' : (pr.sqm != null ? Math.round(pr.sqm) + ' ㎡' : ''));
  body.appendChild(meta);

  var h = b.heads || {};
  body.appendChild(fmtRow('喷头', (h.count != null ? h.count + ' 个' : '—') + (h.flowLh ? ' × ' + h.flowLh + ' L/h' : '') + (h.spacing_m ? ' · 间距 ' + h.spacing_m + ' m' : '')));
  var ri = b.risers || {};
  body.appendChild(fmtRow('镀锌立管', (ri.count != null ? ri.count + ' 根' : '—') + (ri.od_mm ? ' · Φ' + ri.od_mm + '×' + ri.height_m + ' m' : '')));
  var pi = b.pipes || {};
  var ml = pi.mainline || {}, lt = pi.laterals || {};
  body.appendChild(fmtRow('布置图估算干管', (ml.dn_mm ? 'Φ' + ml.dn_mm : '—') + (ml.len_m != null ? ' × ' + ml.len_m + ' m' : '')));
  body.appendChild(fmtRow('布置图估算支管', (lt.dn_mm ? 'Φ' + lt.dn_mm : '—') + (lt.len_m != null ? ' × ' + lt.len_m + ' m' : '')));
  if (pi.specified) body.appendChild(fmtRow('任务书固定管径', '主管 DN' + pi.specified.main_dn_mm + ' / 干管 DN' + pi.specified.distribution_dn_mm + ' / 小区支管 DN' + pi.specified.branch_dn_mm));
  var sh = b.shifts || {};
  body.appendChild(fmtRow('轮灌运行批次', (sh.groupCount != null ? sh.groupCount + ' 组' : '—') + (sh.headsPerShift ? '（每组 ' + sh.headsPerShift + ' 个）' : '')));
  if (b.valves && b.valves.count != null) body.appendChild(fmtRow('地理小区总阀', b.valves.count + ' 个（按分区面积估算）'));
  if (b.project && b.project.zones) body.appendChild(fmtRow('50–60 亩小区', b.project.zones.recommended + ' 个，平均 ' + b.project.zones.average_mu + ' 亩'));
  if (b.tank) body.appendChild(fmtRow('蓄水池', (b.tank.volume_m3 != null ? b.tank.volume_m3 + ' m³' : '—')));
  if (b.boost && b.boost.stage1 && b.boost.stage2) body.appendChild(fmtRow('二次加压', '一段 ' + b.boost.stage1.power_kw + ' kW + 二段 ' + b.boost.stage2.power_kw + ' kW'));
  if (b.trench) body.appendChild(fmtRow('沟槽土方', (b.trench.volume_m3 != null ? b.trench.volume_m3 + ' m³' : '—') + '（深 ' + b.trench.depth_m + ' m）'));
  if (b.filter) body.appendChild(fmtRow('板框过滤器', (b.filter.sets || 1) + ' 套'));
  if (b.fert) body.appendChild(fmtRow('溶肥设施', (b.fert.sets || 1) + ' 套'));

  var foot = el('div', 'sp-foot');
  foot.style.cssText = 'font-size:11px;opacity:.6;margin-top:6px;';
  foot.textContent = '快照时间 ' + (data.ts ? new Date(data.ts).toLocaleString('zh-CN') : '—') + ' · 管径/长度与泵参数尚需全网水力及现场路线校核，详细布置见 terrain 页';
  body.appendChild(foot);
}

function buildPanel() {
  var p = el('div', 'sp-panel');
  p.setAttribute('data-ry-plugin', 'sprinkler');
  p.style.cssText = 'display:none;position:fixed;right:16px;bottom:64px;width:300px;max-height:60vh;overflow:auto;' +
    'background:#fff;color:#1e293b;border:1px solid rgba(100,116,139,.35);border-radius:10px;padding:12px;' +
    'box-shadow:0 8px 24px rgba(15,23,42,.18);z-index:9998;font-size:13px;line-height:1.5;';
  var head = el('div', 'sp-head');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
  head.appendChild(el('b', 'sp-title', navCfgLabel()));
  var x = el('button', 'sp-x', '×');
  x.type = 'button';
  x.title = '关闭';
  x.style.cssText = 'border:0;background:none;font-size:16px;cursor:pointer;color:#64748b;';
  x.addEventListener('click', function () { p.style.display = 'none'; });
  head.appendChild(x);
  p.appendChild(head);
  var body = el('div', 'sp-body');
  p.appendChild(body);
  return p;
}

function navCfgLabel() {
  var m = (typeof ctxRef !== 'undefined' && ctxRef && ctxRef.manifest && ctxRef.manifest.ui && ctxRef.manifest.ui.nav) || {};
  return m.label || 'sprinkler';
}

/* ---------------- 生命周期 ---------------- */
export function activate(ctx) {
  ctxRef = ctx;
  stopped = false;
  coreP = null; coreSettled = false;

  if (cfg(ctx).autoloadCore !== false) {
    loadCore().then(function (r) {
      ctx.runtime.log('core', '喷灌内核' + (r.ok ? '就绪（RyTerrainData）' : '未就绪：' + (r.reason || (r.missing || []).join(','))));
    });
  }

  panel = buildPanel();
  try { ctx.ui.mountPoint.appendChild(panel); } catch (e) { document.body.appendChild(panel); }

  if (ctx.ui.registerNav) {
    var nc = navCfg(ctx);
    unnav = ctx.ui.registerNav({
      label: nc.label || ctx.id,        /* 标签单一来源 manifest（C33） */
      title: nc.title || '',
      order: nc.order,
      gate: function () { return gate(ctx); },
      pending: function () { return pending(ctx); },
      onLocked: function () { onLocked(ctx); },
      onClick: function () {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
        if (panel.style.display !== 'none') renderPanel();
      }
    });
  }

  /* 跨标签页：terrain 页另开一个标签时，估算后本页 storage 事件命中 → 刷新面板 */
  storageHandler = function (ev) {
    if (!ev || ev.key !== storageKey(ctx)) return;
    if (panel && panel.style.display !== 'none') renderPanel();
    if (ctx.events && typeof ctx.events.emit === 'function') {
      try { ctx.events.emit('sprinkler-bridged', { at: Date.now() }); } catch (e) { }
    }
  };
  window.addEventListener('storage', storageHandler);

  ctx.runtime.log('boot', 'sprinkler 插件已激活（terrain 内核宿主 · 壳）');

  return {
    loadCore: loadCore,
    coreReady: coreReady,
    coreMissing: coreMissing,
    estimate: function (input, areaM2) { return passthrough('sprinklerEstimate', [input, areaM2]); },
    layout: function (plots, input) { return passthrough('sprinklerLayout', [plots, input]); },
    bom: function (layoutResult, opts) { return passthrough('sprinklerBom', [layoutResult, opts]); },
    readBridged: readBridged,
    state: function () {
      return { nav: !!unnav, panel: !!panel, coreReady: coreReady(), stopped: stopped };
    }
  };
}

export function deactivate() {
  stopped = true;
  if (storageHandler) { try { window.removeEventListener('storage', storageHandler); } catch (e) { } storageHandler = null; }
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  panel = null;
  /* 内核不卸载（同 hydraulics 策略）：RyTerrainData 是纯计算 UMD，页面级公共资源；
     只摘自己注入的 <script> 标签（本插件的 DOM 产物）。 */
  injected.forEach(function (t) { if (t && t.parentNode) t.parentNode.removeChild(t); });
  injected = [];
  coreP = null; coreSettled = false;
  ctxRef = null;
}
