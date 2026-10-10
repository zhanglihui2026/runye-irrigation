
/* —— 分区材料统计栏渲染（2026-09-13）：读 RyIsoDiagram.computeStats 只读汇总，填 #tlIsoStatsBody —— */
function tlIsoStatsRender() {
  var body = document.getElementById('tlIsoStatsBody');
  if (!body || !window.RyIsoDiagram || typeof window.RyIsoDiagram.computeStats !== 'function' || !window.tlDiagramData) return;
  var st = window.RyIsoDiagram.computeStats(window.tlDiagramData);
  if (!st) { body.innerHTML = '<div class="tl-iso-note">暂无可统计的数据</div>'; return; }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  var h = '<table><thead><tr><th>分区</th><th>面积(亩)</th><th>阀门</th><th>三通</th><th>弯头</th><th>管道(m)</th></tr></thead><tbody>';
  st.zones.forEach(function (z) {
    h += '<tr><td>' + z.id + '</td><td>' + f2(z.areaMu) + '</td><td>' + z.valves + '</td><td>' + z.tees + '</td><td>' + z.elbows + '</td><td>' + f1(z.pipeLen) + '</td></tr>';
  });
  var t = st.totals;
  h += '<tr class="sum"><td>合计</td><td>' + f2(t.areaMu) + '</td><td>' + t.valves + '</td><td>' + t.tees + '</td><td>' + t.elbows + '</td><td>' + f1(t.pipeLen) + '</td></tr>';
  h += '</tbody></table>';
  h += '<div class="tl-iso-note">共 ' + t.zones + ' 区 · 面积 ' + f1(t.area) + ' ㎡（' + f2(t.areaMu) + ' 亩）<br>'
    + '总管 ' + f1(t.frontLen) + ' m · 主管 ' + f1(t.mainLen) + ' m · 支管 ' + f1(t.branchLen) + ' m<br>'
    + '含主管接入阀 ' + t.inletValves + ' 个，已计入阀门合计；弯头 / 手工三通按「配件布置」统计；手工三通接管长度已计入管道长度';
  if (t.manual.tee || t.manual.elbow || t.manual.valve) h += '<br>手工配件：三通 ' + t.manual.tee + ' · 弯头 ' + t.manual.elbow + ' · 阀门 ' + t.manual.valve;
  if (t.unmappedPipe > 0.05) h += '<br>未归入分区的管段 ' + f1(t.unmappedPipe) + ' m（已计入合计）';
  h += '</div>';
  body.innerHTML = h;
}
function tlIsoStatsReset() {
  var body = document.getElementById('tlIsoStatsBody');
  if (body) body.innerHTML = '<div class="tl-iso-note">生成轴测图后自动统计各分区面积、阀门 / 三通 / 弯头数量与管道长度，并汇总合计。</div>';
}
/* 分区材料统计左右折叠（2026-09-15 用户要求）：收起 = 右缘竖排窄条（画布加宽），
   展开 = 完整面板；点标题切换，localStorage 记忆；默认展开 */
(function () {
  var tg = document.getElementById('tlIsoStatsToggle');
  var body = document.getElementById('tlIsoStatsBody');
  var arrow = document.getElementById('tlIsoStatsArrow');
  var aside = document.getElementById('tlIsoStats');
  var pane = aside ? aside.closest('.ry-pane-iso') : null;
  if (!tg || !body || !arrow || !aside || !pane) return;
  var KEY = 'runye_tlIsoStats_collapsed';
  function apply(c) {
    body.style.display = c ? 'none' : '';
    aside.classList.toggle('stats-collapsed', c);
    pane.classList.toggle('iso-stats-collapsed', c);
    /* 展开箭头朝下（▾）；收起箭头朝左（◂，指向展开方向） */
    arrow.style.transform = c ? 'rotate(180deg)' : 'rotate(90deg)';
    tg.title = c ? '点击展开分区材料统计' : '点击收起分区材料统计（收起为右缘窄条，画布加宽）';
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  apply(saved === '1');
  tg.addEventListener('click', function () {
    var c = !aside.classList.contains('stats-collapsed');   /* 当前展开 → 收起 */
    apply(c);
    try { localStorage.setItem(KEY, c ? '1' : '0'); } catch (e) {}
  });
})();

/* 统计栏宽度拖拽（2026-09-15 用户要求）：拖左缘细条调节右列宽度。
   约定「没拖过不写变量」：默认宽度走 CSS var 回退值，拖过才写 inline var + localStorage；
   双击恢复默认（清 inline var + 存档）。 */
(function () {
  var grip = document.getElementById('tlWsStatsGrip');
  var aside = document.getElementById('tlIsoStats');
  if (!grip || !aside) return;
  var pane = aside.closest('.ry-pane-iso');
  if (!pane) return;
  var KEY = 'runye_tlIsoStats_w';
  function applySaved() {
    var w = 0;
    try { w = parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) {}
    if (w > 0) pane.style.setProperty('--tlStatsW', w + 'px');
  }
  applySaved();
  var drag = null;
  grip.addEventListener('pointerdown', function (e) {
    if (aside.classList.contains('stats-collapsed')) return;
    var pr = pane.getBoundingClientRect();
    var maxW = Math.min(600, pr.width - 260);
    if (maxW < 160) return;
    drag = { pr: pr, maxW: maxW };
    grip.classList.add('on');
    document.body.style.userSelect = 'none';
    if (grip.setPointerCapture) { try { grip.setPointerCapture(e.pointerId); } catch (err) {} }
    e.preventDefault();
  });
  grip.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var w = Math.round(Math.max(160, Math.min(drag.maxW, drag.pr.right - e.clientX)));
    pane.style.setProperty('--tlStatsW', w + 'px');
    drag.w = w;
  });
  function endDrag() {
    drag = null;
    grip.classList.remove('on');
    document.body.style.userSelect = '';
  }
  grip.addEventListener('pointerup', function () {
    var w = null;
    if (drag) w = drag.w;
    endDrag();
    if (w) { try { localStorage.setItem(KEY, String(w)); } catch (e) {} }
  });
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('dblclick', function () {
    pane.style.removeProperty('--tlStatsW');
    try { localStorage.removeItem(KEY); } catch (e) {}
  });
})();

/* 轴测图「插入管线」入口已按用户要求取消（2026-09-16 第三十四轮）：画线走「三级设计」工作区，
   双向同步保留；画线模式仍可编程触发（startPipeMode，模块自带 iso-pipe-drafting 光标态与
   onPipeModeChange 守卫），页面侧按钮接线整体移除。#tlIsoPipeHint 保留为图面操作反馈行。 */

/* 轴测图「插入配件」总开关（2026-10-01 v179 用户要求：「三级管路编辑中的节点能解决大部分问题，
   因此轴测图中关于插入配件的功能都取消」）。true = 全入口下线：
     · 左栏「配件布置」卡的配件放置三件套（三通/弯头/阀门 + 弯头规格 + 确定·放置 + 放置提示）
     · 左栏「自动管线」卡的「⊞ 在点击位置插三通 / 🔩 在点击位置插阀门」
     · 图面接管右键菜单的「插入阀门 / 插入弯头 / 插入三通·分支口型号」整段
     · 图面自动管线右键菜单的「＋ 加三通 / 加弯头 / 加阀门」段
   改回 false 即可全量恢复（HTML 与处理逻辑一行未删，只做运行时收起与接线跳过）。
   保留项：➕ 管道插入（画线）、已有配件的图上显示与材料统计、右键对已有配件的
   旋转 / 快速转向 / 改长 / 删除 / 从分支口接管道；「管网装配」卡的收起见
   iso-diagram/network-editor.js 的 ISO_OFF。
   注：本变量是**页面级顶层 var**（非 IIFE 内局部），块内各独立 IIFE 直接取用，
   跨 <script> 的工作区右键菜单（openMenu）经 window.ISO_FITTING_UI_OFF 取用。 */
var ISO_FITTING_UI_OFF = true;

/* 轴测图「自动管线选中」卡接线（2026-09-15 阶段2）：点选二级传递的自动管线
   → 信息 + 改长 + 在点击位置插三通/阀门；点图面配件标记（A-F##）可删除。 */
(function () {
  var ISO = window.RyIsoDiagram;
  if (!ISO) return;
  var card = document.getElementById('tlIsoAutoCard');
  var info = document.getElementById('tlIsoAutoInfo');
  var lenBtn = document.getElementById('tlIsoAutoLenBtn');
  var teeBtn = document.getElementById('tlIsoAutoTeeBtn');
  var valveBtn = document.getElementById('tlIsoAutoValveBtn');
  var fitDelBtn = document.getElementById('tlIsoAutoFitDelBtn');
  var distBox = document.getElementById('tlIsoAutoDist');
  var fitA = document.getElementById('tlIsoFitA');
  var fitB = document.getElementById('tlIsoFitB');
  /* v179（2026-10-01）：插入配件下线 → 两个插入按钮收起（📏 改长保留） */
  if (ISO_FITTING_UI_OFF) {
    if (teeBtn) teeBtn.style.display = 'none';
    if (valveBtn) valveBtn.style.display = 'none';
  }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  /* 图面三通第三口旋转按钮行（2026-09-16 用户要求面板兜底入口）：
     懒创建（首次选中三通才 appendChild）→ 未选中时 DOM 零增量（eq 基线不受影响）。 */
  var spinRow = null;
  function ensureSpinRow() {
    if (spinRow) return spinRow;
    spinRow = document.createElement('div');
    spinRow.id = 'tlIsoFitSpinRow';
    spinRow.style.cssText = 'display:none;margin-top:6px';
    spinRow.innerHTML = '<div id="tlIsoFitSpinTxt" style="font-size:11px;color:#47555e;margin:2px 0">第三口方向：垂直管道（0°）</div>'
      + '<div style="display:flex;gap:4px">'
      + '<button class="pp-btn-ghost" id="tlIsoFitSpinM" type="button" style="flex:1;font-size:11px;padding:2px 0">第三口 -15°</button>'
      + '<button class="pp-btn-ghost" id="tlIsoFitSpinP" type="button" style="flex:1;font-size:11px;padding:2px 0">第三口 +15°</button>'
      + '<button class="pp-btn-ghost" id="tlIsoFitSpinR" type="button" style="flex:1;font-size:11px;padding:2px 0">复位</button>'
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#47555e;margin-top:6px">第三口口径'
      + '<select id="tlIsoFitSpecSel" style="flex:1;padding:2px 4px;font-size:11px;border:1px solid #cbd5e1;border-radius:4px"></select></label>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-top:6px"><label for="tlIsoConnLen" style="font-size:11px;color:#47555e;white-space:nowrap">接管长度</label>'
      + '<input type="number" id="tlIsoConnLen" value="30" min="1" step="1" style="width:72px;padding:2px 4px;font-size:12px;border:1px solid #cbd5e1;border-radius:4px">'
      + '<span style="font-size:11px;color:#47555e">m</span></div>'
      + '<button class="pp-btn-ghost" id="tlIsoFitConnBtn" type="button" style="width:100%;margin-top:6px">🔗 管道接入</button>'
      + '<div id="tlIsoFitConnHint" style="font-size:11px;color:#47555e;margin-top:3px">选口径、设接管长度，点「管道接入」，鼠标到图上第三口附近自动吸附（紫色虚线=按比例预览），点击即生成接管；端头可直接插三通/弯头。</div>';
    card.appendChild(spinRow);
    /* 第三口口径下拉（任务⑨）：随管 / 常用外径档；仅标注，不进水力计算 */
    var specSel = document.getElementById('tlIsoFitSpecSel');
    var SPEC_OPTS = ['随管', 63, 75, 90, 110, 140, 160, 180, 200, 225, 250, 315, 355, 400];
    specSel.innerHTML = SPEC_OPTS.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('');
    specSel.addEventListener('change', function () {
      var AE2 = window.RyTlAutoEdits;
      var a2 = ISO.autoSelInfo && ISO.autoSelInfo();
      if (!AE2 || !AE2.setFitBranchSpec || !a2 || !a2.fit || a2.kind !== 'tee') return;
      AE2.setFitBranchSpec(a2.id, specSel.value === '随管' ? '' : specSel.value, 'iso-panel');
    });
    document.getElementById('tlIsoFitConnBtn').addEventListener('click', function () {
      ISO.setConnectMode(!ISO.connectMode());
    });
    ISO.onConnectModeChange = function (on) {
      var b = document.getElementById('tlIsoFitConnBtn');
      var h = document.getElementById('tlIsoFitConnHint');
      if (b) b.textContent = on ? '✕ 退出管道接入' : '🔗 管道接入';
      if (h) h.textContent = on ? '移动鼠标到第三口附近吸附（紫色虚线=按比例预览），点击生成接管；点空白处退出。'
        : '选口径、设接管长度，点「管道接入」，鼠标到图上第三口附近自动吸附（紫色虚线=按比例预览），点击即生成接管；端头可直接插三通/弯头。';
    };
    function spinBy(d) {
      var AE = window.RyTlAutoEdits;
      var a2 = ISO.autoSelInfo && ISO.autoSelInfo();
      if (!AE || !AE.setFitSpin || !a2 || !a2.fit || a2.kind !== 'tee') return;
      var oldS = AE.fitSpinOf ? AE.fitSpinOf(a2.id) : 0;
      var newS = (d === null) ? 0 : (oldS + d);
      AE.setFitSpin(a2.id, newS, 'iso-panel');
      /* 任务⑨：第三口旋转后，已接出的管道（teeId 回链）刚体跟随 */
      if (ISO.syncAutoFitSpin) ISO.syncAutoFitSpin(a2.id, newS, oldS);
    }
    document.getElementById('tlIsoFitSpinM').addEventListener('click', function () { spinBy(-15); });
    document.getElementById('tlIsoFitSpinP').addEventListener('click', function () { spinBy(15); });
    document.getElementById('tlIsoFitSpinR').addEventListener('click', function () { spinBy(null); });
    return spinRow;
  }
  function syncSpinRow(a) {
    var AE = window.RyTlAutoEdits;
    var show = !!(a && a.fit && a.kind === 'tee' && AE && AE.setFitSpin);
    if (!show) { if (spinRow) spinRow.style.display = 'none'; return; }
    ensureSpinRow();
    spinRow.style.display = '';
    var sp = AE.fitSpinOf ? AE.fitSpinOf(a.id) : 0;
    var t2 = document.getElementById('tlIsoFitSpinTxt');
    if (t2) t2.textContent = sp ? ('第三口方向：已绕管道轴转 ' + sp + '°') : '第三口方向：垂直管道（0°）';
    var sel2 = document.getElementById('tlIsoFitSpecSel');
    if (sel2) sel2.value = (AE.fitBranchSpecOf ? AE.fitBranchSpecOf(a.id) : '') || '随管';
  }
  ISO.onAutoSel = function (a) {
    if (!card) return;
    if (!a) { card.style.display = 'none'; if (distBox) distBox.style.display = 'none'; syncSpinRow(null); return; }
    card.style.display = '';
    if (a.fit) {
      if (info) info.innerHTML = '已选配件 <b>' + a.id + '</b>（' + a.kindLabel + '）<br>位于 ' + (a.pipeName || a.pid || '—') + '<br>可在管上拖动，或输入两侧距离精确定位';
      if (distBox) distBox.style.display = '';
      if (fitA && fitB) {
        var at = a.atM || 0, tot = (a.pipeLen != null) ? a.pipeLen : at;
        fitA.value = at.toFixed(1); fitB.value = Math.max(0, tot - at).toFixed(1);
      }
      if (lenBtn) lenBtn.style.display = 'none';
      if (teeBtn) teeBtn.style.display = 'none';
      if (valveBtn) valveBtn.style.display = 'none';
      if (fitDelBtn) fitDelBtn.style.display = '';
      syncSpinRow(a);
    } else {
      syncSpinRow(null);
      var edited = a.baseLen && Math.abs(a.baseLen - a.len) > 0.05;
      var calTxt = (window.tlPipeCalText && window.tlPipeCalText(a.id)) || '';
      if (info) info.innerHTML = '已选 <b>' + a.kindLabel + '</b>（' + a.id + '）<br>长度 ' + f1(a.len) + 'm'
        + (edited ? '（设计值 ' + f1(a.baseLen) + 'm）' : '')
        + '<br>点击位置：距起点 ' + f1(a.pickAt || 0) + 'm'
        + (calTxt ? '<br><b style="color:#15803d;font-size:13px">' + calTxt + '</b>' : '<br>右键管身可改管径')
        + (window.tlPipeHfText && window.tlPipeHfText(a.id) ? '<br>' + window.tlPipeHfText(a.id) : '')
        + (ISO_FITTING_UI_OFF ? '' : '<br><span style="color:#b45309;font-size:11px">⊞ 插三通 / 🔩 插阀门将自动继承本管管径，接管口径默认"随管"</span>');
      if (lenBtn) lenBtn.style.display = '';
      if (teeBtn && !ISO_FITTING_UI_OFF) teeBtn.style.display = '';
      if (valveBtn && !ISO_FITTING_UI_OFF) valveBtn.style.display = '';
      if (fitDelBtn) fitDelBtn.style.display = 'none';
      if (distBox) distBox.style.display = 'none';
    }
  };
  if (lenBtn) lenBtn.addEventListener('click', function () {
    var a = ISO.autoSelInfo && ISO.autoSelInfo();
    if (!a || a.fit) return;
    var v = prompt('新总长度（米）——前段保持不动，末段沿原方向拉伸/收缩', a.len.toFixed(1));
    if (v === null) return;
    if (!ISO.setAutoLen(parseFloat(v))) alert('改长失败：请输入大于前段总长的正数');
  });
  if (teeBtn && !ISO_FITTING_UI_OFF) teeBtn.addEventListener('click', function () { ISO.insertAutoFit('tee'); });
  if (valveBtn && !ISO_FITTING_UI_OFF) valveBtn.addEventListener('click', function () { ISO.insertAutoFit('valve'); });
  if (fitDelBtn) fitDelBtn.addEventListener('click', function () { ISO.deleteSelFit(); });
  /* 两侧距离输入（阶段2b）：改任一侧，另一侧自动补齐（和=当前有效管长） */
  function isoFitInput(which) {
    var a = ISO.autoSelInfo && ISO.autoSelInfo();
    if (!a || !a.fit || a.pipeLen == null) return;
    var v = parseFloat((which === 'a' ? fitA : fitB).value);
    if (!isFinite(v) || v < 0) return;
    ISO.moveSelFit(which === 'a' ? v : a.pipeLen - v);
  }
  if (fitA) fitA.addEventListener('change', function () { isoFitInput('a'); });
  if (fitB) fitB.addEventListener('change', function () { isoFitInput('b'); });
})();

/* 轴测图工具栏（#tlIsoSide）接线：配件布置 + 构件参数（2026-09-13）。
   模块保持纯几何/无 DOM 依赖（Node 可测），页面侧 UI 逻辑集中在此。 */
(function () {
  /* 插入配件下线（2026-10-01 v179，开关见上方页面级 ISO_FITTING_UI_OFF）：
     只收起「配件放置」四件套（类型三选一 / 弯头规格 / 确定·放置 / 放置提示），
     **不整卡隐藏** —— 同一张卡里还挂着「管线类型 + ➕ 管道插入」画线入口
     （2026-09-25 任务J 用户要回、2026-10-01 再次确认保留）。
     静态 HTML 全量保留（verify_pp_tabs 骨架契约仍在），仅运行时收起；
     下方「构件参数」卡与删除接线一并保留（已有配件仍可查看/删除）。 */
  if (ISO_FITTING_UI_OFF) {
    ['tlIsoKinds', 'tlIsoSpecRow', 'tlIsoPlaceBtn', 'tlIsoPlaceHint'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
  var ISO = window.RyIsoDiagram;
  var KINDS = { tee: '三通', elbow: '弯头', valve: '阀门' };
  var kindsEl = document.getElementById('tlIsoKinds');
  var specEl = document.getElementById('tlIsoSpec');
  var btn = document.getElementById('tlIsoPlaceBtn');
  var hint = document.getElementById('tlIsoPlaceHint');
  var infoCard = document.getElementById('tlIsoInfoCard');
  var infoBody = document.getElementById('tlIsoInfoBody');
  var delBtn = document.getElementById('tlIsoDelBtn');
  if (!ISO || !kindsEl || !btn || !hint || !infoCard || !infoBody || !delBtn) return;
  var curKind = 'tee', curId = null;
  var specRow = document.getElementById('tlIsoSpecRow');

  function setHint(t) { hint.textContent = t; }
  /* 三通/阀门规格自动随所在管道管径（2026-09-14），仅弯头保留规格下拉 */
  function syncSpecRow() { if (specRow) specRow.style.display = curKind === 'elbow' ? '' : 'none'; }
  syncSpecRow();

  /* 管道插入（任务J 2026-09-25 用户要求）：进入/退出画线模式；图面点击依次取点
     （pipeDataPoint 内建吸附：管线节点/三通/阀门），双击或 Enter 成管，Esc 撤销当前折线。
     画线与配件放置互斥：进入画线前先取消未完成的放置。 */
  var pipeInsBtn = document.getElementById('tlIsoPipeInsBtn');
  var pipeKindSel = document.getElementById('tlIsoPipeKindSel');
  var syncPipeBtn = function () {
    if (!pipeInsBtn) return;
    var on = ISO.pipeModeKind();
    pipeInsBtn.textContent = on ? '✕ 退出画线' : '➕ 管道插入';
    pipeInsBtn.classList.toggle('active', !!on);
  };
  if (pipeInsBtn && pipeKindSel) {
    pipeInsBtn.addEventListener('click', function () {
      if (!document.querySelector('#tlIsoDiagramContent svg')) {
        setHint('请先生成轴测图（需已生成三级管线平面图）'); return;
      }
      if (ISO.pipeModeKind()) { ISO.endPipeMode(); syncPipeBtn(); setHint('已退出画线模式'); return; }
      if (ISO.placingKind()) { ISO.cancelPlace(); btn.textContent = '确定 · 放置'; }
      var k = ISO.startPipeMode(pipeKindSel.value);
      if (!k) { setHint('画线模式启动失败：管线类型无效'); return; }
      syncPipeBtn();
      setHint('画线模式（' + (k === 'main' ? '主管' : '支管') + '）：在图上依次点击 起点→转折点→终点，双击或 Enter 成管，Esc 撤销折线；端点自动吸附节点/三通');
    });
    ISO.onPipeModeChange = function () { syncPipeBtn(); };
  }

  /* 配件类型三选一 */
  kindsEl.addEventListener('click', function (e) {
    if (ISO_FITTING_UI_OFF) return;   /* v179：插入配件下线（元素已收起，此处为双保险） */
    var b = e.target.closest('button[data-kind]');
    if (!b) return;
    curKind = b.getAttribute('data-kind');
    Array.prototype.forEach.call(kindsEl.querySelectorAll('button[data-kind]'), function (x) {
      x.classList.toggle('active', x === b);
    });
    syncSpecRow();
  });

  /* 确定 · 放置 / 取消放置（v179：插入配件下线时本按钮已收起，handler 短路为双保险） */
  btn.addEventListener('click', function () {
    if (ISO_FITTING_UI_OFF) return;
    if (ISO.placingKind()) {
      ISO.cancelPlace();
      return;
    }
    if (!document.querySelector('#tlIsoDiagramContent svg')) {
      setHint('请先生成轴测图（需已生成三级管线平面图）');
      return;
    }
    var spec = specEl ? specEl.value : '';
    ISO.startPlace(curKind, spec);
    btn.textContent = '取消放置';
    setHint('放置模式：在右侧图上沿管线点击放置「' + KINDS[curKind] + (spec ? ' · ' + spec : '') + '」；再点本按钮可取消');
  });

  /* 放置结果反馈 */
  ISO.onPlaceResult = function (res) {
    if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender(); /* 放置/取消后统计同步（2026-09-13） */
    if (res && res.ok) {
      btn.textContent = '确定 · 放置';
      setHint('已放置 ' + res.id + '（' + KINDS[res.kind] + (res.spec ? ' · ' + res.spec : '') + '）。点击图中构件可查看参数');
    } else if (ISO.placingKind()) {
      setHint((res && res.reason) || '请沿管线点击');
    } else {
      btn.textContent = '确定 · 放置';
      setHint((res && res.reason) || '已取消放置');
    }
  };

  /* 构件参数显示（自动三通/阀门 + 手工配件）
     注：iso-diagram/editor.js 加载在后，会把 onFittingClick 覆盖为编辑面板 open()，
     此处实际不再被调用（保留原逻辑备查）；接管长度输入见 editor.js open() 的 branchLen 字段。 */
  function row(k, v) { return '<div class="tl-iso-kv"><span>' + k + '</span><b>' + v + '</b></div>'; }
  ISO.onFittingClick = function (info) {
    if (!info) return;
    curId = info.id;
    var h = row('类型', info.typeName || info.kindLabel)
      + row('编号', info.id)
      + row('规格', info.spec || '—');
    if (info.segName) h += row('所在管段', info.segName);
    if (info.upstream) h += row('上游', info.upstream);
    if (info.downstream) h += row('下游', info.downstream);
    if (info.zone) h += row('分区', info.zone);
    if (info.point) h += row('坐标', 'x=' + info.point.x.toFixed(1) + ', y=' + info.point.y.toFixed(1) + ' m');
    infoBody.innerHTML = h;
    infoCard.style.display = '';
    delBtn.style.display = info.manual ? '' : 'none';
  };
  delBtn.addEventListener('click', function () {
    if (!curId) return;
    if (ISO.removeManual(curId)) {
      if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender(); /* 删除后统计同步（2026-09-13） */
      infoCard.style.display = 'none';
      curId = null;
      setHint('配件已删除');
    }
  });

})();

/* 轴测图构件右键菜单（2026-09-16 独立常开）：
   手工三通绕 X/Y/Z 轴 ±15° 旋转（未转换也可见方向）、从分支口接管道、
   接管「延长 1 m / 删除」、三通「同径 / 异径」转换。
   ⚠ 本段必须独立于上方 ISO_FITTING_UI_OFF 门控：该开关只下线左栏「配件布置 /
   构件参数」两张卡（2026-09-15 用户下线），而右键构件属图面操作，须继续可用。
   故单独成 IIFE，且不依赖左栏任何 DOM（对 onFittingClick/统计函数一律 typeof 守卫）。
   菜单 body 级懒创建（与 #tlPipeCalMenu 同款）：未使用前不改动加载态 DOM。 */
(function () {
  var ISO = window.RyIsoDiagram;
  if (!ISO) return;
  /* 提示优先写轴测图仍在显示的提示行（插入管线卡保留显示），否则退回放置提示行 */
  function setHint(t) {
    var h = document.getElementById('tlIsoPipeHint') || document.getElementById('tlIsoPlaceHint');
    if (h) h.textContent = t;
  }
  var ctx = null;   /* 懒创建 */
  var ctxBtnCss = 'display:block;width:100%;text-align:left;border:0;background:none;padding:6px 10px;'
    + 'cursor:pointer;border-radius:4px;font:inherit;color:inherit';
  /* 分支口异径型号档（2026-09-24 任务⑥）：右键三通「分支口型号」可选项 = 小于宿管径的 PE 外径 */
  var TEE_OD_SERIES = [63, 75, 90, 110, 140, 160, 200, 250, 315, 355, 400];
  function hideCtx() { if (ctx) ctx.style.display = 'none'; }
  /* 左键点构件的兜底提示（2026-09-16）：参数面板已下线（editor.js ISO_PARAM_EDITOR_OFF），
     ISO.onFittingClick 保持 null → 左键点三通/接管毫无反馈，用户会以为该处不可交互
     （这正是「旋转入口在哪里？没看到」的成因之一）。此处兜底：没有真面板时把
     「右键能做什么」写进提示行；将来面板恢复（prev 为函数）则原样转发，不抢。 */
  (function () {
    var prev = ISO.onFittingClick;
    ISO.onFittingClick = function (info) {
      if (typeof prev === 'function') { prev(info); return; }
      if (!info) return;
      var tip = info.kind === 'pipe'
        ? '接管 ' + (info.id || '') + '：右键可「延长 / 删除 / 插入三通·阀门·弯头」'
        : '配件 ' + (info.id || '') + '：右键可旋转第三口（每点 ±15°，绕管道中心轴）／转换同径·异径';
      setHint(tip);
    };
  })();
  /* 菜单点击：旋转 / 接管道 / 延长 / 删除 / 转换 */
  function onCtxClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) { hideCtx(); return; }
    var tfid = ctx.getAttribute('data-tlfit');   /* 图面配件（A-F##）路由优先（2026-09-16） */
    if (tfid) {
      var AE = window.RyTlAutoEdits;
      if (b.getAttribute('data-rot') && AE && AE.setFitSpin) {
        var rd2 = parseInt(b.getAttribute('data-rot'), 10);
        if (AE.setFitSpin(tfid, (AE.fitSpinOf ? AE.fitSpinOf(tfid) : 0) + rd2, 'iso-menu')) {
          var sp2 = AE.fitSpinOf ? AE.fitSpinOf(tfid) : 0;
          setHint('第三口已绕管道轴旋转 ' + (rd2 > 0 ? '+' : '') + rd2 + '°（累计 ' + sp2 + '°，左侧面板可继续调整）');
        }
      } else if (b.getAttribute('data-reset') && AE && AE.setFitSpin) {
        if (AE.setFitSpin(tfid, 0, 'iso-menu')) setHint('第三口已复位（垂直管道）');
      }
      hideCtx(); return;
    }
    var id = ctx.getAttribute('data-fit');
    if (!id) { hideCtx(); return; }
    if (b.getAttribute('data-rot')) {
      var rd = parseInt(b.getAttribute('data-rot'), 10);
      if (ISO.rotateTee(id, rd)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        if (typeof ISO.onFittingClick === 'function') ISO.onFittingClick(ISO.fittingInfo(id));
        var spin = ISO.teeBranchSpin ? ISO.teeBranchSpin(id) : rd;
        setHint('第三口已绕管道轴旋转 ' + (rd > 0 ? '+' : '') + rd + '°（累计 ' + spin + '°，可继续旋转或从分支口接管道）');
      }
      hideCtx(); return;
    }
    if (b.getAttribute('data-reset')) {
      if (ISO.resetTeeBranch && ISO.resetTeeBranch(id)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        if (typeof ISO.onFittingClick === 'function') ISO.onFittingClick(ISO.fittingInfo(id));
        setHint('第三口已复位（垂直于管道，水平指向一侧）');
      }
      hideCtx(); return;
    }
    if (b.getAttribute('data-spawn')) {
      var sp = ISO.spawnPipeFromTee ? ISO.spawnPipeFromTee(id) : null;
      if (sp) { if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender(); setHint('已从分支口接出管道 ' + sp + '（右键接管可延长/删除）'); }
      else setHint('接管道失败');
      hideCtx(); return;
    }
    /* 就地插入配件（2026-09-24 任务⑰）：以右键点为放置点插入 三通（型号可选）/阀门/弯头 */
    if (b.getAttribute('data-itfits')) {
      var itfKind = b.getAttribute('data-itfits');
      var itfSpec = b.getAttribute('data-ispec');
      var itfX = parseFloat(ctx.getAttribute('data-x')), itfY = parseFloat(ctx.getAttribute('data-y'));
      var itfRes = (ISO.insertFittingAt && isFinite(itfX) && isFinite(itfY))
        ? ISO.insertFittingAt(itfKind, itfSpec == null ? '' : itfSpec, itfX, itfY) : null;
      if (itfRes) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        setHint(itfKind === 'tee'
          ? ('已在接管上插入三通 ' + itfRes.id + (itfSpec ? '（分支口 ' + itfSpec + '）' : '（同径）') + ' —— 右键三通可旋转第三口 / 从分支口接管道')
          : (itfKind === 'valve'
            ? ('已插入阀门 ' + itfRes.id)
            : ('已插入弯头 ' + itfRes.id + '，接管已分段 —— 右键弯头可调整角度（水平面内）')));
      } else setHint('插入失败：请右键更靠近接管管身的位置再试');
      hideCtx(); return;
    }
    if (b.getAttribute('data-ext')) {
      if (ISO.extendManualPipe && ISO.extendManualPipe(id, 1)) { if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender(); setHint('接管已延长 1 m'); }
      hideCtx(); return;
    }
    if (b.getAttribute('data-del')) {
      if (ISO.removeManual && ISO.removeManual(id)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        var ic = document.getElementById('tlIsoInfoCard'); if (ic) ic.style.display = 'none';
        setHint('接管已删除');
      }
      hideCtx(); return;
    }
    /* 快速转向（2026-09-24 任务⑥）：目标角 − 当前累计角 = 旋转增量，走既有 rotateTee 链
       （手工/自动三通都支持；接管/子树刚体跟随）。0° 与复位同义，增量 0 时静默。 */
    if (b.getAttribute('data-rotq') !== null) {
      var tq = parseInt(b.getAttribute('data-rotq'), 10);
      var curq = (ISO.teeBranchSpin ? ISO.teeBranchSpin(id) : 0) || 0;
      var dq = tq - curq;
      if (dq && ISO.rotateTee(id, dq)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        if (typeof ISO.onFittingClick === 'function') ISO.onFittingClick(ISO.fittingInfo(id));
        setHint('第三口已快速转向 ' + tq + '°（可 ±15° 微调或从分支口接管道）');
      }
      hideCtx(); return;
    }
    /* 分支口型号（2026-09-24 任务⑥）：手工三通直接转异径并指定分支口规格。
       走 beginEdit→previewEdit→applyEdit 事务（与 convertTee 同链路，撤销/存档天然打通）。 */
    if (b.getAttribute('data-tspec')) {
      var odv = b.getAttribute('data-tspec');
      var inf = ISO.fittingInfo ? ISO.fittingInfo(id) : null;
      if (inf && inf.manual && ISO.beginEdit && ISO.beginEdit(id)) {
        var curp = ISO.getParams ? ISO.getParams(id) : {};
        var vals = { teeType: 'reducing', branchSpec: odv, branchLen: (curp.teeType && Number.isFinite(curp.branchLen)) ? curp.branchLen : 1 };
        if (ISO.previewEdit(vals)) ISO.applyEdit(); else ISO.cancelEdit();
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        if (typeof ISO.onFittingClick === 'function') ISO.onFittingClick(ISO.fittingInfo(id));
        setHint('三通已转异径（分支口 ' + odv + '），右键三通可「从分支口接管道」');
      } else setHint('分支口型号调整仅对手工三通可用');
      hideCtx(); return;
    }
    /* 弯头调角（2026-09-24 任务⑰）：data-erot = 目标累计角（绝对值），增量 = 目标 − 当前 */
    if (b.getAttribute('data-erot') !== null) {
      var etq = parseFloat(b.getAttribute('data-erot'));
      var ecq = (ISO.elbowSpin ? ISO.elbowSpin(id) : 0) || 0;
      var edq = etq - ecq;
      if (edq && ISO.rotateElbow && ISO.rotateElbow(id, edq)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        setHint('弯头已转至 ' + (((ISO.elbowSpin ? ISO.elbowSpin(id) : 0) % 360 + 360) % 360) + '°（下游管道刚体跟随；可 ±15° 微调或复位）');
      }
      hideCtx(); return;
    }
    if (b.getAttribute('data-ereset')) {
      if (ISO.resetElbow && ISO.resetElbow(id)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        setHint('弯头已复位（下游管道回到插入时方向）');
      }
      hideCtx(); return;
    }
    if (b.getAttribute('data-edel')) {
      if (ISO.removeElbow && ISO.removeElbow(id)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        var icE = document.getElementById('tlIsoInfoCard'); if (icE) icE.style.display = 'none';
        setHint('弯头已删除，下游管道并回上游接管');
      }
      hideCtx(); return;
    }
    /* 接管随转（2026-09-26 任务L）：data-ehrot = 相对转角（±15°），绕接管固定端整链刚体旋转 */
    if (b.getAttribute('data-ehrot') !== null) {
      var ehq = parseFloat(b.getAttribute('data-ehrot'));
      if (ISO.rotateElbowWithHost && ISO.rotateElbowWithHost(id, ehq)) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        setHint('接管已随弯头同转 ' + ehq + '°（绕接管固定端整链刚体旋转，Ctrl+Z 可撤销）');
      } else {
        setHint('接管随转失败：未找到可旋转的接管');
      }
      hideCtx(); return;
    }
    if (b.getAttribute('data-t')) {
      if (ISO.convertTee(id, b.getAttribute('data-t'))) {
        if (typeof tlIsoStatsRender === 'function') tlIsoStatsRender();
        if (typeof ISO.onFittingClick === 'function') ISO.onFittingClick(ISO.fittingInfo(id));
        setHint('三通已转换，分支口自动接 1 米管道（可在构件参数中改长度）');
      }
      hideCtx(); return;
    }
    hideCtx();
  }
  function onCtxHover(e) {
    var sel = 'button[data-t],button[data-rot],button[data-reset],button[data-spawn],button[data-ext],button[data-del],button[data-rotq],button[data-tspec],button[data-itfits],button[data-erot],button[data-ereset],button[data-edel],button[data-ehrot]';
    var b = e.target.closest ? e.target.closest(sel) : null;
    Array.prototype.forEach.call(ctx.querySelectorAll(sel), function (x) { x.style.background = x === b ? '#f0fdf4' : ''; });
  }
  function ensureCtx() {
    if (ctx) return ctx;
    ctx = document.createElement('div');
    ctx.id = 'tlIsoCtxMenu';
    ctx.style.cssText = 'display:none;position:fixed;z-index:9999;background:#fff;border:1px solid #cbd5e1;'
      + 'border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;min-width:170px;'
      + 'font:12px/1.6 system-ui,sans-serif;color:#1f2937';
    document.body.appendChild(ctx);
    ctx.addEventListener('mouseover', onCtxHover);
    ctx.addEventListener('click', onCtxClick);
    document.addEventListener('click', hideCtx, true);
    window.addEventListener('blur', hideCtx);
    return ctx;
  }
  ISO.onFittingContextMenu = function (info, x, y) {
    /* 2026-09-16：**自动三通（TEE-F01 总管上 / TEE-B01 主管上）同样可右键旋转** ——
       图上绝大多数三通是自动生成的，若只认手工层（旧逻辑 !info.manual 直接返回），
       用户在图上右键三通将毫无反应 = 「功能没有实现」。自动三通第三口旋转记在
       表达层覆盖表（不动模型），菜单其余项（同径/异径转换）仍只对手工三通出现。 */
    if (!info || (info.kind !== 'tee' && info.kind !== 'pipe' && info.kind !== 'elbow')) {   /* elbow：弯头调角菜单（2026-09-24 任务⑰） */
      /* 立管/阀门等「无分支可旋转」的构件：旧行为是静默 return → 用户右键毫无反应，
         与「旋转入口找不到」同源。2026-09-16 改为在提示行说明，让入口边界可见。 */
      hideCtx();
      if (info && info.id) setHint('配件 ' + info.id + '：无分支可旋转（第三口旋转、同径/异径转换仅对三通可用；接管道请用左侧「插入管线」）');
      return;
    }
    if (info.kind === 'pipe') {
      ensureCtx();
      ctx.removeAttribute('data-tlfit');   /* 属性成对清理：防上一次 A-F## 菜单的路由残留（2026-09-16） */
      ctx.setAttribute('data-fit', info.id);
      /* 记录右键点屏幕坐标：插入三通/阀门/弯头以该点为放置点（2026-09-24 任务⑰） */
      ctx.setAttribute('data-x', String(Math.round(x)));
      ctx.setAttribute('data-y', String(Math.round(y)));
      /* 就地插入配件（2026-09-24 任务⑰）：三通型号可选；阀门/弯头自动生成。
         2026-10-01（v179 用户要求）起整段下线 —— 插入配件改走三级管路编辑的节点；
         恢复方式：把页面级 ISO_FITTING_UI_OFF 改回 false。延长 / 删除两项始终保留。 */
      var hPipeMenu = '<button type="button" data-ext="1" style="' + ctxBtnCss + '">延长 1 m（沿当前方向）</button>'
        + '<button type="button" data-del="1" style="' + ctxBtnCss + ';color:#b91c1c">删除接管</button>';
      if (!ISO_FITTING_UI_OFF) {
        hPipeMenu += '<div style="border-top:1px solid #e5e7eb;margin:2px 0"></div>'
          + '<button type="button" data-itfits="valve" style="' + ctxBtnCss + '">插入阀门（自动）</button>'
          + '<button type="button" data-itfits="elbow" style="' + ctxBtnCss + ';color:#15803d">插入弯头（自动 · 可调角度）</button>'
          + '<div style="padding:3px 10px 1px;font-weight:700;color:#0369a1">插入三通 · 分支口型号</div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:2px;padding:0 4px">'
          + '<button type="button" data-itfits="tee" data-ispec="" style="' + ctxBtnCss + ';width:auto;flex:1 0 28%;text-align:center">同径</button>'
          + TEE_OD_SERIES.map(function (v) { return '<button type="button" data-itfits="tee" data-ispec="' + v + '" style="' + ctxBtnCss + ';width:auto;flex:1 0 28%;text-align:center">' + v + '</button>'; }).join('')
          + '</div>';
      }
      ctx.innerHTML = hPipeMenu;
      ctx.style.display = 'block';
      ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - 200)) + 'px';
      ctx.style.top = Math.max(4, y) + 'px';
      var rcP = ctx.getBoundingClientRect();
      if (rcP.bottom > window.innerHeight - 8) ctx.style.top = Math.max(4, window.innerHeight - rcP.height - 12) + 'px';
      return;
    }
    /* 弯头右键菜单（2026-09-24 任务⑰）：±15° 微调（按钮携带「当前角 ±15」的绝对目标）、
       快速转向 0/90/180/270、复位、删除（并回上游管）。data-erot 一律为绝对目标角。 */
    if (info.kind === 'elbow') {
      ensureCtx();
      ctx.removeAttribute('data-tlfit');
      ctx.setAttribute('data-fit', info.id);
      var eCur = (ISO.elbowSpin ? ISO.elbowSpin(info.id) : 0) || 0;
      var eNow = ((eCur % 360) + 360) % 360;
      ctx.innerHTML = '<div style="padding:4px 10px;font-weight:700;color:#0369a1">弯头 · 调整角度<br><span style="font-weight:400;color:#475569">下游管道绕弯点在水平面内转向（当前 ' + eNow + '°）</span></div>'
        + '<button type="button" data-erot="' + (eCur - 15) + '" style="' + ctxBtnCss + '">转 -15°</button>'
        + '<button type="button" data-erot="' + (eCur + 15) + '" style="' + ctxBtnCss + '">转 +15°</button>'
        + '<button type="button" data-ereset="1" style="' + ctxBtnCss + '">复位（回到插入时方向）</button>'
        + '<div style="padding:3px 10px 1px;font-weight:700;color:#0369a1">快速转向</div>'
        + '<div style="display:flex;gap:2px;padding:0 4px">'
        + [0, 90, 180, 270].map(function (a) { return '<button type="button" data-erot="' + a + '" style="' + ctxBtnCss + ';width:auto;flex:1;text-align:center">' + a + '°</button>'; }).join('')
        + '</div>'
        /* 接管随转（2026-09-26 任务L）：端部插弯头调角只转符号、接管不动；想带接管一起转用这两键（绕接管固定端整链刚体旋转） */
        + '<div style="padding:3px 10px 1px;font-weight:700;color:#0369a1">带动接管同转</div>'
        + '<div style="padding:0 10px 2px;color:#64748b">接管没跟着转时用这两键：绕接管固定端整链刚体旋转</div>'
        + '<button type="button" data-ehrot="-15" style="' + ctxBtnCss + '">接管随转 -15°</button>'
        + '<button type="button" data-ehrot="15" style="' + ctxBtnCss + '">接管随转 +15°</button>'
        + '<button type="button" data-edel="1" style="' + ctxBtnCss + ';color:#b91c1c">删除弯头（并回上游管）</button>';
      ctx.style.display = 'block';
      ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - 200)) + 'px';
      ctx.style.top = Math.max(4, y) + 'px';
      var rcE2 = ctx.getBoundingClientRect();
      if (rcE2.bottom > window.innerHeight - 8) ctx.style.top = Math.max(4, window.innerHeight - rcE2.height - 12) + 'px';
      return;
    }
    if (info.kind !== 'tee') { hideCtx(); return; }
    var mh = String(info.spec || '').match(/\d+(?:\.\d+)?/);
    var host = mh ? mh[0] : '';   /* 宿主管段管径（可能为空：管径待定/—） */
    var other = '';
    var pipes = window.tlDiagramData && window.tlDiagramData.meta && window.tlDiagramData.meta.pipes;
    if (pipes) {
      var alt = info.segType === 'branch' ? (pipes.main || '') : (pipes.branch || '');
      var mo = String(alt).match(/\d+(?:\.\d+)?/);
      other = mo ? mo[0] : '';
    }
    ensureCtx();
    ctx.removeAttribute('data-tlfit');   /* 同上：模型三通菜单不得带 data-tlfit 路由 */
    ctx.setAttribute('data-fit', info.id);
    /* 旋转分支与「从分支口接管道」只依赖 3D 分支方向，与管径无关 ——
       管径未知（无计算值/显示为 —）时也必须可用；同径/异径转换才需要管径，故单独收尾。 */
    /* 旋转轴 = 三通所在管道的中心轴（沿 Y 走向绕 Y、沿 X 走向绕 X），第三口绕该轴扫。
       管口始终垂直于管轴，故旋转后不会把支管拧歪。 */
    var axisTxt = info.axisLabel || '管道中心轴';
    var spinNow = (ISO.teeBranchSpin ? ISO.teeBranchSpin(info.id) : 0) || 0;
    var h = (info.teeType ? '已转换 · ' : '') + '<div style="padding:4px 10px;font-weight:700;color:#0369a1">第三口绕管道轴旋转<br><span style="font-weight:400;color:#475569">旋转轴：' + axisTxt + '（每点 ±15°' + (spinNow ? '，已转 ' + spinNow + '°' : '') + '）</span></div>'
      + '<button type="button" data-rot="-15" style="' + ctxBtnCss + '">第三口 -15°</button>'
      + '<button type="button" data-rot="15" style="' + ctxBtnCss + '">第三口 +15°</button>'
      + '<button type="button" data-reset="1" style="' + ctxBtnCss + '">复位（垂直管道）</button>'
      /* 「从分支口接管道」只对手工三通生效（spawnPipeFromTee 走 manual 层）；自动三通上
         渲染成灰色说明，避免出现点了没反应的死按钮。 */
      + (info.manual
        ? '<button type="button" data-spawn="1" style="' + ctxBtnCss + ';color:#15803d">从分支口接管道</button>'
        : '<div style="padding:4px 10px;color:#94a3b8">自动三通：第三口可旋转；接管道用左侧工具栏画线</div>')
      /* 快速转向（2026-09-24 任务⑥）：常用角度一步到位，免连点 ±15° */
      + '<div style="padding:3px 10px 1px;font-weight:700;color:#0369a1">快速转向</div>'
      + '<div style="display:flex;gap:2px;padding:0 4px">'
      + '<button type="button" data-rotq="0" style="' + ctxBtnCss + ';width:auto;flex:1;text-align:center">0°</button>'
      + '<button type="button" data-rotq="90" style="' + ctxBtnCss + ';width:auto;flex:1;text-align:center">90°</button>'
      + '<button type="button" data-rotq="180" style="' + ctxBtnCss + ';width:auto;flex:1;text-align:center">180°</button>'
      + '<button type="button" data-rotq="270" style="' + ctxBtnCss + ';width:auto;flex:1;text-align:center">270°</button>'
      + '</div>';
    if (host) {
      h += '<div style="border-bottom:1px solid #e5e7eb;margin:2px 0"></div>'
        + '<button type="button" data-t="equal" style="' + ctxBtnCss + '">' + host + '转' + host + '（同径三通）</button>'
        + (other && other !== host ? '<button type="button" data-t="reducing" style="' + ctxBtnCss + '">' + host + '转' + other + '（异径三通）</button>' : '');
    }
    /* 分支口型号（2026-09-24 任务⑥）：手工三通可任选小于宿管径的异径档 */
    if (info.manual && host) {
      var hostNum = parseFloat(host);
      var smaller = TEE_OD_SERIES.filter(function (v) { return hostNum && v < hostNum; });
      if (smaller.length) {
        h += '<div style="padding:3px 10px 1px;font-weight:700;color:#0369a1">分支口型号（异径）</div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:2px;padding:0 4px">'
          + smaller.map(function (v) { return '<button type="button" data-tspec="' + v + '" style="' + ctxBtnCss + ';width:auto;flex:1 0 28%;text-align:center">' + v + '</button>'; }).join('')
          + '</div>';
      }
    }
    ctx.innerHTML = h;
    ctx.style.display = 'block';
    ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - 200)) + 'px';
    ctx.style.top = Math.max(4, y) + 'px';
    var rc = ctx.getBoundingClientRect();
    if (rc.bottom > window.innerHeight - 8) ctx.style.top = Math.max(4, window.innerHeight - rc.height - 12) + 'px';
  };
  /* 图面配件（A-F## 共享编辑层）右键菜单（2026-09-16）：三通第三口绕管道轴旋转 ——
     旧右键链路只认模型三通 g[data-fit] 与管线 [data-tlpipe]，用户在轴测图右键
     插在总管上的三通（A-F01）毫无反应。菜单复用同一懒创建容器，用 data-tlfit
     区分路由（onCtxClick 里优先分流），第三口状态记在 AE（随配件序列化）。 */
  ISO.onTlFitContextMenu = function (fid, x, y) {
    var AE = window.RyTlAutoEdits;
    var f = null;
    if (AE && AE.fitsList) (AE.fitsList() || []).forEach(function (z) { if (z.id === fid) f = z; });
    if (!f) return;
    if (f.kind !== 'tee') {
      hideCtx();
      setHint('配件 ' + fid + '：阀门无第三口，不可旋转（可在左侧面板删除或拖动定位）');
      return;
    }
    var axisTxt = '管道中心轴';
    if (AE.tangentAt && window.tlDiagramData) {
      var td = AE.tangentAt(f.pid, window.tlDiagramData, f.atM);
      if (td) axisTxt = Math.abs(td.x) >= Math.abs(td.y) ? '沿 X 轴走向' : '沿 Y 轴走向';
    }
    var spinNow = AE.fitSpinOf ? AE.fitSpinOf(fid) : 0;
    ensureCtx();
    ctx.removeAttribute('data-fit');
    ctx.setAttribute('data-tlfit', fid);
    ctx.innerHTML = '<div style="padding:4px 10px;font-weight:700;color:#0369a1">图面配件 ' + fid + ' · 第三口绕管道轴旋转<br><span style="font-weight:400;color:#475569">旋转轴：' + axisTxt + '（每点 ±15°' + (spinNow ? '，已转 ' + spinNow + '°' : '') + '）</span></div>'
      + '<button type="button" data-rot="-15" style="' + ctxBtnCss + '">第三口 -15°</button>'
      + '<button type="button" data-rot="15" style="' + ctxBtnCss + '">第三口 +15°</button>'
      + '<button type="button" data-reset="1" style="' + ctxBtnCss + '">复位（垂直管道）</button>'
      + '<div style="padding:4px 10px;color:#94a3b8">第三口方向为示意；接管道/删除见左侧「已选配件」卡</div>';
    ctx.style.display = 'block';
    ctx.style.left = Math.max(4, Math.min(x, window.innerWidth - 200)) + 'px';
    ctx.style.top = Math.max(4, y) + 'px';
    var rc2 = ctx.getBoundingClientRect();
    if (rc2.bottom > window.innerHeight - 8) ctx.style.top = Math.max(4, window.innerHeight - rc2.height - 12) + 'px';
  };
})();
