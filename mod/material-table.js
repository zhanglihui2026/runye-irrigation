/* [v421-mat-table] 材料清单/材料表管理 —— 自 mod/inline-09.js 原 493..1491 行逐字节迁出（2026-10-14）。
   范围：TL_PIPE_PRICE_DEF 单价默认表（verify_settings S7 契约主体）+ tlPipePriceByOd + materialPrices +
   管材单价自检 + updateMaterialTotals + mat* 可编辑表格（腾讯文档式：行列增删/选区/公式/剪贴板/列宽拖拽）。
   边界审计（_p1/_audit09_mat.cjs）：出带依赖仅 render(5 处调用点)/fmt/fmt0（全 call-time，fmt/fmt0 留
   inline-09 供两侧行 388/1503+ 共用）；带外引用本带 18 符号全 call-time（顶层声明跨 script 全局可见，
   inline-09 本非 IIFE，符号原就是全局——迁移零语义变化）；带内 load-time 仅 726 行旧行迁移与 735 行
   document 事件委托绑定（自包含，DOM 就绪后执行）。
   加载顺序铁律：必须先于 mod/inline-09.js 加载——inline-09 尾部 IIFE 的 ready.then(render) 是微任务，
   会在两脚本之间触发首屏 render（其材料段调本文件 getMaterialPipeSpecs 等），本文件须先就位；
   带内 load-time 仅 726/735 两处自包含语句，不依赖 inline-09。fmt/fmt0（inline-09）与 render 均 call-time 解析。 */
/* ===== v184（2026-10-02，P5/P6）：管材单价表「单一来源」=====
   同一张 19 档价目表原先在 3 处各写一份字面量 —— 设置页自动预填的 DEF（L6934）、
   经济面板 PRICES_DEFAULT、设置页 PDEF。「同一事实三份记录」必然改一处漏一处。
   现收敛为本表**唯一一处**；上述三处一律改为引用本全局（var 使其挂到 window，
   供后面的独立 <script> 块取用）。
   层次：runye_tlEconPrices（用户在设置页/经济面板改的价，覆盖层）
        > TL_PIPE_PRICE_DEF（本表，默认值）。
   锁定：verify_settings.js S7 —— 本表在 index.html 中只允许出现 1 次、19 档键集与
   CAL_SERIES 一致、关键档位（160/220/225/500）抽验数值，防收敛时被静默改价。 */
var TL_PIPE_PRICE_DEF = { 50: 6, 63: 9, 75: 12, 90: 17, 110: 24, 125: 30, 140: 37, 160: 47, 180: 60,
  200: 73, 220: 88, 225: 92, 250: 113, 280: 141, 315: 178, 355: 225, 400: 286, 450: 362, 500: 447 };
/* 按管径取「价目表单价」：覆盖层优先，其次默认表；取不到（不在表内）返回 ''。 */
function tlPipePriceByOd(od) {
  var k = Math.round(Number(od));
  if (!(k > 0)) return '';
  var over = window.RyEconomicSettingsStore.readPriceOverrides();
  var v = (typeof over[k] === 'number' && over[k] > 0) ? over[k] : TL_PIPE_PRICE_DEF[k];
  return (typeof v === 'number' && v > 0) ? v : '';
}
/* 材料表中「按管径取价」的三行（其余行是按套计件，不参与管径联动） */
var MAT_PIPE_KEYS = ['frontPipe', 'mainPipe', 'branchPipe'];

const materialPrices = {mainPipe:32, branchPipe:16, tape:0.075};
const materialQtyOverrides = {};
const customMaterials = {c1:{name:'',spec:'',qty:'',price:''},c2:{name:'',spec:'',qty:'',price:''},c3:{name:'',spec:'',qty:'',price:''}};

function getMaterialPipeSpecs(r) {
  const pd = window.planData || {};
  const mainFromPlan = Number(pd.mainPipeODValue);
  const branchFromPlan = Number(pd.branchPipeODValue);
  return {
    mainPipeOD: Number.isFinite(mainFromPlan) && mainFromPlan > 0 ? mainFromPlan : r.mainPipe.od,
    branchPipeOD: Number.isFinite(branchFromPlan) && branchFromPlan > 0 ? branchFromPlan : r.branchPipe.od
  };
}

/* v184（P5）：管材单价自证 —— 「材料表三行单价」与「设置页价目表在同一图面管径下的单价」
   是同一事实的两处记录，必须一致。若被手改（matTbl.priceF 覆盖）就会分叉，此处红字点名，
   并提供一键「按价目表重取」。把报告 §3.C「同一根 Ø160 主管，材料表 32 元/m、设置页 47 元/m」
   从「用户看不见的口径打架」变成「用户可见的哨兵」。
   rows: [{key,label,od,price}]，数据全部来自 DOM 文本/数值，仍经 esc() 兜底。 */
function matRenderSelfCheck(rows) {
  var box = document.getElementById('matSelfCheck');
  if (!box) return;
  /* ★ 这里**不要**用 esc()：esc 定义在后面的独立 <script> 里、并非全局
     （v184 首版调用它 → ReferenceError，又被外层 try/catch 吞掉 → 自证行永远空白）。
     用同脚本内的 matEsc（v169 材料表专用转义）最稳。自检失败必须**可见**，不许静默。 */
  try {
    var refs = [], diffs = [];
    rows.forEach(function (r) {
      var ref = tlPipePriceByOd(r.od);
      if (ref === '') return;
      refs.push(matEsc(r.label) + ' Ø' + matEsc(String(r.od)) + ' = ' + ref + ' 元/m');
      if (Math.abs((Number(r.price) || 0) - Number(ref)) > 1e-9) {
        diffs.push(matEsc(r.label) + ' Ø' + matEsc(String(r.od)) + '：材料表 ' + (Number(r.price) || 0) + ' vs 价目表 ' + ref + ' 元/m');
      }
    });
    if (!refs.length) {
      box.className = 'mat-selfcheck';
      box.textContent = '管材单价：图面管径不在价目表中，未做自证。';
      return;
    }
    if (diffs.length) {
      box.className = 'mat-selfcheck bad';
      box.innerHTML = '⚠ 管材单价与设置页价目表不一致：' + diffs.join('；')
        + '　<button type="button" class="mat-price-resync">↺ 按价目表重取</button>';
    } else {
      box.className = 'mat-selfcheck ok';
      box.textContent = '✓ 管材单价与设置页价目表一致（' + refs.join(' · ') + '）';
    }
  } catch (eSelf) {
    box.className = 'mat-selfcheck bad';
    box.textContent = '⚠ 管材单价自证计算失败：' + (eSelf && eSelf.message ? eSelf.message : eSelf);
  }
}

function updateMaterialTotals() {
  let grand = 0;
  let pfDirty = false;
  const pipeRows = [];
  document.querySelectorAll('.materials-card tbody tr').forEach(tr => {
    const isCustom = tr.classList.contains('custom-row');
    let qty, price;
    if (isCustom) {
      const key = tr.dataset.key;
      const qtyInput = tr.querySelector('.custom-qty');
      const priceInput = tr.querySelector('.price-input');
      const nameInput = tr.querySelector('.custom-name');
      const specInput = tr.querySelector('.custom-spec');
      /* v169：自定义行改动态存储（matTbl.custom），原 c1~c3 固定行退役 */
      const mrow = (matTbl.custom || []).find(rw => rw.id === key);
      if (mrow) { mrow.name = nameInput.dataset.formula || nameInput.value; mrow.spec = specInput.dataset.formula || specInput.value; mrow.qty = qtyInput.dataset.formula || qtyInput.value; mrow.price = priceInput.dataset.formula || priceInput.value; matTblSave(); }
      qty = matParseNum(qtyInput.value) || 0;
      price = matParseNum(priceInput.value) || 0;
    } else {
      qty = matParseNum(tr.dataset.qty) || 0;
      const input = tr.querySelector('.price-input');
      const rawIn = String(input.value == null ? '' : input.value).trim();
      price = matParseNum(rawIn) || 0;
      materialPrices[tr.dataset.key] = price;
      /* v184（P5）：**单价持久化唯一写入点**。
         原实现只有「公式格」写 matTbl.priceF，纯数值手改只进内存 materialPrices（const 对象）
         ⇒ 刷新即丢，与工具条「输入单价后自动汇总」的承诺不符。
         现在把「要不要留覆盖」的判断集中在此（与 auto 值比较，相等就不留，免得把当前自动值
         冻结成永久覆盖；清空即删除覆盖，回到自动取值）。
         ⚠ 不要把写入分散到别的事件里：v184 首版曾在 document 的 change 里再写一次，
           结果本函数末尾的 delete 分支立刻把它删掉（两个写入者互相打架），手改永远存不下来。 */
      const fKey = tr.dataset.key;
      const autoRef = (RyMaterialAudit.pipeKey(fKey)) ? tlPipePriceByOd(tr.dataset.od) : null;
      matTbl.priceF = matTbl.priceF || {};
      const had = matTbl.priceF[fKey];
      var want;
      if (input.dataset.formula) {
        want = input.dataset.formula;                                     /* v171：公式格存公式串 */
      } else if (rawIn === '' || (autoRef !== null && Number(rawIn) === Number(autoRef))) {
        want = undefined;                                                 /* 空 / 与价目表自动值相同 */
      } else if (autoRef === null && rawIn === '') {
        want = undefined;                                                 /* 非管材行且等于内存默认值 */
      } else {
        want = rawIn;                                                     /* 用户手改 ⇒ 记为覆盖 */
      }
      if (want === undefined) {
        if (had !== undefined) { delete matTbl.priceF[fKey]; pfDirty = true; }
      } else if (String(had) !== String(want)) {
        matTbl.priceF[fKey] = want; pfDirty = true;
      }
    }
    /* v180：若该格被用户手工改过（matTbl.edits），合计/亩均不覆盖，保留用户值 */
    const ovTotal = matEditFor(tr.dataset.key, 'total');
    const ovPermu = matEditFor(tr.dataset.key, 'permu');
    const subtotal = qty * price;
    const cell = tr.querySelector('.total-cell');
    if (cell && ovTotal == null) cell.textContent = price > 0 && qty > 0 ? '¥' + fmt0(subtotal) : '—';
    const permuCell = tr.querySelector('.permu-cell');
    if (permuCell && ovPermu == null) {
      const permu = parseFloat(tr.dataset.permu) || 0;
      permuCell.textContent = permu > 0
        ? permu.toFixed(1) + ' m/亩 · ' + (price > 0 ? '¥' + (permu * price).toFixed(1) : '—')
        : '—';
    }
    tr.dataset.matSubtotal=String(subtotal);
    grand += ovTotal==null?subtotal:(matParseNum(cell&&cell.textContent)||0);
    /* v184（P5）：收集管材三行的「行名 / 图面管径 / 当前单价」供自证行比对 */
    if (RyMaterialAudit.pipeKey(tr.dataset.key)) {
      var td0 = tr.querySelector('td');
      pipeRows.push({ key: tr.dataset.key, label: td0 ? td0.textContent.trim() : tr.dataset.key,
        od: tr.dataset.od || '', price: price });
    }
  });
  if (pfDirty) matTblSave();
  const gt = document.querySelector('.materials-card .grand-total-val');
  if (gt) {var bad=Array.from(document.querySelectorAll('.materials-card .mat-formula-err')).length>0;gt.textContent=bad?'公式错误，请检查标红单元格':'¥ '+fmt0(grand);}
  matRenderSelfCheck(pipeRows);
}

/* ===== v169（2026-10-01 用户要求）：材料表做成可编辑表格（腾讯文档式）=====
   ① 每行新增「备注 / 说明」列，手输内容随表持久化；② 列宽拖拽记忆；
   ③ ＋添加行 = 无限自定义行（原固定 c1~c3 退役并一次性迁移）；＋添加列 = 自定义列（列头可删）；
   ④ 统计口径不变：自动行数量仍按原公式渲染，合计仍由 updateMaterialTotals 逐行求积。
   存储键 runyeMatTable_v1：{notes, extraCols, extraCells, colW, custom, migrated}。
   事件全部委托到 document（表体随 render() 重建，容器级绑定会失效）。整段删除即卸载本功能。 */
const MAT_TBL_KEY = 'runyeMatTable_v1';
let matTbl = (function () {
  try { const s = JSON.parse(localStorage.getItem(MAT_TBL_KEY) || 'null'); if (s && s.ver === 1) return s; } catch (e) {}
  return { ver: 1, notes: {}, extraCols: [], extraCells: {}, colW: {}, custom: [], priceF: {}, migrated: false };
})();
function matTblSave() { try { localStorage.setItem(MAT_TBL_KEY, JSON.stringify(matTbl)); } catch (e) {} }
/* v171：自动行单价优先取持久化覆盖(matTbl.priceF：公式串或用户改的数值)，否则回退默认值。
   v184（P5）：管材三行（总管/主管/支管）在**没有用户覆盖**时，按 `od`（图面实际管径）
   从价目表自动带出 —— 消除「材料表默认 32 元/m、设置页同径显示 47 元/m」的两套口径。
   od 缺省（不传）时退回旧行为，保证非管材行与旧调用点逐字节不变。 */
function matPriceVal(key, od) {
  var f = matTbl.priceF ? matTbl.priceF[key] : null;
  if (f !== null && f !== undefined && f !== '') return f;
  if (od > 0 && RyMaterialAudit.pipeKey(key)) return tlPipePriceByOd(od);
  var base=key.split('-spec-')[0];if(base!==key)return matPriceVal(base);
  var legacy=/^(nodeFit-(?:tee|valve|elbow45|elbow90|reducer))-/.exec(key);if(legacy&&matTbl.priceF&&matTbl.priceF[legacy[1]]!=null)return matTbl.priceF[legacy[1]];
  return materialPrices[key] || '';
}
function matEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const MAT_BASE_COLS = [
  ['mat', 190, '材料'], ['spec', 215, '规格'], ['qty', 150, '估算数量'],
  ['price', 165, '单价(元)'], ['total', 125, '合计(元)'], ['permu', 185, '亩均(m/亩)·折合(元/亩)'],
  ['note', 235, '备注 / 说明']
];
function matColgroup() {
  let h = '<colgroup>';
  MAT_BASE_COLS.forEach(c => { h += '<col data-mcol="' + c[0] + '" style="width:' + (matTbl.colW[c[0]] || c[1]) + 'px">'; });
  (matTbl.extraCols || []).forEach(c => { h += '<col data-mcol="' + c.id + '" style="width:' + (c.w || 130) + 'px">'; });
  return h + '</colgroup>';
}
/* v171：把表格显式宽度设为各列宽度之和。
   关键：table-layout:fixed 下，只有表格显式宽度 == 列宽之和时，各列才会严格按 colgroup 宽度渲染；
   若表格宽度由 CSS 自动决定（width:auto / max-content），列会被内容宽度重排、相互挤占，
   拖拽列宽时其它列跟着缩放、被拖列只微动——这正是用户说的「拖动跳动」。
   设成显式列宽和后，拖哪列哪列按 1:1 变化，超宽部分由 .mat-tablescroll 横向滚动。 */
function matSyncTableWidth() {
  var t = document.querySelector('.materials-card table');
  if (!t) return;
  var sum = 0, cols = t.querySelectorAll('colgroup col'), w;
  for (var i = 0; i < cols.length; i++) { w = parseFloat(cols[i].style.width); if (!isNaN(w)) sum += w; }
  if (sum > 0) t.style.width = sum + 'px';
}
function matGrip(id) { return '<span class="mat-colgrip" data-mcol="' + id + '" title="拖动调列宽"></span>'; }
function matBaseHeads() {
  return MAT_BASE_COLS.map(c => '<th data-mcol="' + c[0] + '">' + c[2] + matGrip(c[0]) + '</th>').join('');
}
function matExtraHeads() {
  return (matTbl.extraCols || []).map(c =>
    '<th class="mat-extra-th" data-mcol="' + c.id + '">' + matEsc(c.title)
    + '<span class="mat-col-del" data-mcoldel="' + c.id + '" title="删除此列">×</span>' + matGrip(c.id) + '</th>').join('');
}
/* 每行行尾：备注 + 自定义列单元格（rowKey = 行 data-key 或自定义行 id） */
function matRowTail(rowKey) {
  let h = '<td class="mat-note-cell"><input class="mat-note" type="text" placeholder="备注…" data-mrow="' + rowKey + '" value="' + matEsc(matTbl.notes[rowKey] || '') + '"></td>';
  (matTbl.extraCols || []).forEach(c => {
    h += '<td class="mat-extra-cell"><input class="mat-extra" type="text" data-mcol="' + c.id + '" data-mrow="' + rowKey + '" value="' + matEsc((matTbl.extraCells[c.id] || {})[rowKey] || '') + '"></td>';
  });
  return h;
}
function matCustomRowsHtml() {
  return (matTbl.custom || []).map(rw =>
    '<tr class="custom-row" data-key="' + rw.id + '">'
    + '<td><span class="mat-row-del" data-mrowdel="' + rw.id + '" title="删除此行">×</span><input class="custom-input custom-name" type="text" placeholder="材料名称" value="' + matEsc(rw.name) + '"></td>'
    + '<td><input class="custom-input custom-spec" type="text" placeholder="规格" value="' + matEsc(rw.spec) + '"></td>'
    + '<td><input class="custom-input custom-qty" type="text" inputmode="decimal" min="0" step="0.1" placeholder="0" value="' + matEsc(rw.qty) + '"></td>'
    + '<td><input class="price-input" type="text" inputmode="decimal" min="0" step="0.1" placeholder="0" value="' + matEsc(rw.price) + '"><span class="unit-tag">元/m</span></td>'
    + '<td class="total-cell">—</td>'
    + '<td class="permu-cell">—</td>'
    + matRowTail(rw.id) + '</tr>').join('');
}
/* 一次性迁移：旧固定 c1~c3 行有内容 → 迁入动态行 */
if (!matTbl.migrated) {
  const seed = [];
  ['c1', 'c2', 'c3'].forEach(k => {
    const c = customMaterials[k];
    if (c && (c.name || c.spec || c.qty || c.price)) seed.push({ id: 'u1' + k, name: c.name, spec: c.spec, qty: c.qty, price: c.price });
  });
  if (seed.length) matTbl.custom = seed.concat(matTbl.custom || []);
  matTbl.migrated = true; matTblSave();
}
if (!window._matTblDelegated) {
  window._matTblDelegated = true;
  document.addEventListener('input', function (e) {
    const t = e.target;
    if (t.classList && t.classList.contains('mat-note')) { const k = t.dataset.mrow; if (k) { matTbl.notes[k] = t.value; matTblSave(); } }
    else if (t.classList && t.classList.contains('mat-extra')) { const k = t.dataset.mrow, cid = t.dataset.mcol; if (k && cid) { (matTbl.extraCells[cid] = matTbl.extraCells[cid] || {})[k] = t.value; matTblSave(); } }
  });
  /* v171：公式格聚焦还原原始公式、失焦重算并持久化 */
  document.addEventListener('focusin', function (e) {
    const t = e.target;
    if (t && t.classList && t.classList.contains('mat-formula') && t.dataset.formula) { t.value = t.dataset.formula; }
  });
  document.addEventListener('focusout', function (e) {
    const t = e.target;
    if (t && t.classList && (t.classList.contains('mat-formula') || (t.dataset && t.dataset.formula))) {
      try { matApplyFormulas(); } catch (e2) {}
      try { updateMaterialTotals(); } catch (e2) {}
    }
  });
  document.addEventListener('click', function (e) {
    const rd = e.target.closest ? e.target.closest('.mat-row-del') : null;
    if (rd) { matDeleteRow(rd.dataset.mrowdel); return; }
    const cd = e.target.closest ? e.target.closest('.mat-col-del') : null;
    if (cd) { matDeleteCol(cd.dataset.mcoldel); return; }
    /* v180c：＋添加行/＋添加列 改为「在选中位置下方/右侧插入」（对齐全表自由编辑的在线表格手感）；
       未选中任何格时退化为追加到末尾。中间插入的完整控制见行号/列头右键菜单。 */
    if (e.target.closest && e.target.closest('#matAddRow')) {
      var rows2 = matRows();
      var selRow = rows2[Math.max(0, Math.min(matSel.r, rows2.length) - 1)];
      if (selRow && selRow.dataset.key) matInsertRow(selRow.dataset.key, true);
      else { matTbl.custom = (matTbl.custom || []).concat([{ id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: '', spec: '', qty: '', price: '' }]); matTblSave(); render(); }
      return;
    }
    if (e.target.closest && e.target.closest('#matAddCol')) {
      var ids3 = matColIds().filter(function (x) { return x !== MAT_RN; });
      var selCol = ids3[Math.max(0, Math.min(matSel.c, ids3.length - 1))];
      if (selCol) matInsertCol(selCol, true); else matInsertCol('note', true);
      return;
    }
  });
  document.addEventListener('mousedown', function (e) {
    const grip = e.target.closest ? e.target.closest('.mat-colgrip') : null;
    if (!grip) return;
    document.body.classList.add('mat-resizing');
    const cid = grip.dataset.mcol;
    const col = document.querySelector('.materials-card colgroup col[data-mcol="' + cid + '"]');
    if (!col) return;
    /* v171 修正：<col> 元素无渲染盒子，getBoundingClientRect().width 恒为 0；
       必须以列实际宽度（内联 style.width，退化取同列 <th> 宽度）为基准，否则每次拖拽都从 0 算起被 clamp 到最小值，列宽永远跳变。 */
    const thEl = document.querySelector('.materials-card th[data-mcol="' + cid + '"]');
    const startX = e.clientX, startW = parseFloat(col.style.width) || (thEl ? thEl.getBoundingClientRect().width : 0);
    e.preventDefault();
    const move = ev => { const w = Math.max(56, Math.round(startW + ev.clientX - startX)); col.style.width = w + 'px'; matSyncTableWidth(); };
    const up = ev => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      document.body.classList.remove('mat-resizing');
      const w = Math.max(56, Math.round(startW + ev.clientX - startX));
      const xc = (matTbl.extraCols || []).find(c => c.id === cid);
      if (xc) { xc.w = w; } else { matTbl.colW[cid] = w; }
      matSyncTableWidth();
      matTblSave();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}


/* ===== v171（2026-10-01 用户要求）：材料表支持 =公式（加减乘除 + 单元格引用 + 区域求和）=====
   作用范围：所有带存储绑定的可编辑格（单价 / 自定义行数量·单价·名称·规格 / 备注 / 自定义列）。
   坐标系：列按渲染顺序 A..（基础7列 mat/spec/qty/price/total/permu/note + 自定义列）；
           行按 tbody 数据行 1..（自动行 + 节点配件/连线行 + 自定义行）。
   语法：以 = 开头；支持 + - * / ( )、数字、单元格引用（如 C2）、区域求和 SUM(C2:C9)。
   求值：先填字面量值，再迭代解析公式（最多 行数+列数 轮）以解开单元格间依赖；自引用标 #REF!。
   显示：公式格平时显示计算结果（原始公式存于 dataset.formula 与存储）；聚焦时还原公式可编辑；失焦重算。
   整段删除即卸载本功能。 */
function matParseNum(ss) { return window.RyMatFormula.parseNum(ss); }
function matColLetter(i) { return window.RyMatFormula.colLetter(i); }
function matColLetterIndex(letter) { return window.RyMatFormula.colLetterIndex(letter); }
function matCellRefs(expr) { return window.RyMatFormula.cellRefs(expr); }
function matEvalExpr(expr, vals) { return window.RyMatFormula.evalExpr(expr, vals); }
function matFmtNum(n) { return window.RyMatFormula.fmtNum(n); }
/* ===== v180（2026-10-02 用户要求「材料表还是要改为跟腾讯文档/飞书类似的在线表格」）=====
   目标：把「一堆散落 <input> 的表」升级为真正的电子表 —— 单元格选中态、行列坐标、纯键盘操作、
   复制粘贴/剪切、拖拽填充柄、公式引用高亮，且**全表自由编辑**。
   关键约束：tbody 由 render() 每次重建 ⇒ 手改值必须存 matTbl.edits（按 行key|列id，非按 A1 地址，
   这样增删行不会错位）并在 matDecorate() 里回填，否则改参数即丢。
   原生 input 格（单价/备注/自定义列/自定义行）继续走各自既有持久化，不进 edits，避免双写冲突。 */
var MAT_RN = '__rn';        /* 行号槽列的 data-mcol，占 children[0]，不参与 A1 地址 */
var MAT_ADDR_OFF = 1;      /* 数据列 dcol = children 索引 - 1 */
var matSel = { r: 1, c: 1, ar: 1, ac: 1, editing: false };
var matClip = null;        /* {rows:[[txt,...]], cut:bool} */
var matFill = null;        /* 填充柄拖拽态 */
var matEditsReady = false;

function matTblEl() { return document.querySelector('.materials-card table'); }
function matRows() { var t = matTblEl(); return t ? Array.prototype.slice.call(t.querySelectorAll('tbody tr')) : []; }
function matColIds() {
  var t = matTblEl(); if (!t) return [];
  return Array.prototype.slice.call(t.querySelectorAll('colgroup col')).map(function (c) { return c.getAttribute('data-mcol'); });
}
function matKey(tr, i) { return (tr && tr.dataset.key) || ('r' + ((i || 0) + 1)); }
/* 取 (数据列, 行) 对应的 td；dcol 从 0 起，自动跳过行号槽 */
function matCell(dcol, row) {
  var rows = matRows(); if (row < 1 || row > rows.length) return null;
  var td = rows[row - 1].children[dcol + MAT_ADDR_OFF];
  return (td && td.tagName === 'TD') ? td : null;
}
function matAddr(dcol, row) { return matColLetter(dcol) + row; }
function matEditFor(rowKey, colId) {
  if (!rowKey || !colId) return null;
  var e = matTbl.edits; if (!e) return null;
  var v = e[rowKey + '|' + colId];
  return (v == null) ? null : v;
}

/* ---------- 1. 铺设：行号槽 + 列标 + 回填用户改写 ---------- */
function matDecorate() {
  var t = matTblEl(); if (!t) return;
  /* v180c：顺序很关键 —— 先补行号槽/打标，再按模型重排行与列，最后补列标与表脚。
     render() 每次按「基础列 + 自定义列(数组序)」重建，本函数负责把它摆成用户要的顺序。 */
  matEnsureRowNumCol(t);
  matStampColIds(t);
  var order = matOrderedColIds();
  var full = [MAT_RN].concat(order);
  matReorderCols(t, full);
  matReorderRows(t);
  matSetColLetters(t);
  matRenumberRows(t);
  matRebuildFoot(t, full);
  matApplyEdits();
  try { matApplyFormulas(); } catch (e) {}
  try { updateMaterialTotals(); } catch (e) {}
  try { matApplyFormulas(); } catch (e) {}
  matSyncTableWidth();
  if (!matEditsReady) { matEditsReady = true; matBindGrid(); }
  matSelect(matSel.r, matSel.c, false, true);
}

/* ---- v180c 列顺序模型：自定义列用 after 锚定在某一列之后（'__top__' = 最前）；无 after = 末尾（向后兼容） ---- */
function matOrderedColIds() {
  var out = ['mat', 'spec', 'qty', 'price', 'total', 'permu', 'note'];
  (matTbl.extraCols || []).forEach(function (c) {
    var at = c.after;
    if (!at) { out.push(c.id); return; }
    if (at === '__top__') { out.splice(0, 0, c.id); return; }
    var i = out.indexOf(at);
    if (i < 0) out.push(c.id); else out.splice(i + 1, 0, c.id);
  });
  return out;
}
function matEnsureRowNumCol(t) {
  var cols = t.querySelector('colgroup');
  if (cols && matColIds()[0] !== MAT_RN) {
    var rnCol = document.createElement('col');
    rnCol.setAttribute('data-mcol', MAT_RN); rnCol.style.width = '46px';
    cols.insertBefore(rnCol, cols.firstChild);
  }
  var hr = t.querySelector('thead tr');
  if (hr && !hr.querySelector('.mat-rownum')) {
    var rnTh = document.createElement('th');
    rnTh.className = 'mat-rownum'; rnTh.setAttribute('data-mcol', MAT_RN); rnTh.textContent = '#';
    hr.insertBefore(rnTh, hr.firstChild);
  }
  matRows().forEach(function (tr) {
    if (!tr.querySelector(':scope > .mat-rownum')) {
      var td = document.createElement('td');
      td.className = 'mat-rownum'; td.setAttribute('data-mcol', MAT_RN);
      tr.insertBefore(td, tr.firstChild);
    }
  });
}
function matStampColIds(t) {
  var ids = matColIds();
  matRows().forEach(function (tr) {
    Array.prototype.slice.call(tr.children).forEach(function (td, ci) {
      var cid = ids[ci]; if (!cid) return;
      td.setAttribute('data-mcol', cid);
      if (cid !== MAT_RN) td.setAttribute('tabindex', '-1');
    });
  });
}
function matReorderChildren(box, order) {
  var map = {};
  Array.prototype.slice.call(box.children).forEach(function (ch) { var id = ch.getAttribute('data-mcol'); if (id) map[id] = ch; });
  for (var i = 0; i < order.length; i++) { if (map[order[i]]) box.appendChild(map[order[i]]); }
}
function matReorderCols(t, full) {
  var cg = t.querySelector('colgroup'); if (cg) matReorderChildren(cg, full);
  var hr = t.querySelector('thead tr'); if (hr) matReorderChildren(hr, full);
  matRows().forEach(function (tr) { matReorderChildren(tr, full); });
}
/* ---- v180c 行顺序模型：自定义行用 after 锚定在某一行的 data-key 之后（'__top__' = 最前） ---- */
function matReorderRows(t) {
  var tb = t.querySelector('tbody'); if (!tb) return;
  var customs = (matTbl.custom || []);
  if (!customs.length) return;
  var byKey = {};
  Array.prototype.slice.call(tb.children).forEach(function (tr) { if (tr.dataset.key) byKey[tr.dataset.key] = tr; });
  var lastOn = {};
  customs.forEach(function (rw) {
    var tr = byKey[rw.id]; if (!tr) return;
    var at = rw.after;
    if (!at) { tb.appendChild(tr); return; }
    if (at === '__top__') {
      var pv = lastOn['__top__'];
      tb.insertBefore(tr, pv ? pv.nextSibling : tb.firstChild);
      lastOn['__top__'] = tr; return;
    }
    var a = byKey[at];
    if (!a) { tb.appendChild(tr); return; }
    var prev = lastOn[at];
    if (prev && prev.parentNode === tb) tb.insertBefore(tr, prev.nextSibling);
    else tb.insertBefore(tr, a.nextSibling);
    lastOn[at] = tr;
  });
}
function matSetColLetters(t) {
  var hr = t.querySelector('thead tr'); if (!hr) return;
  var ids = matColIds().filter(function (x) { return x !== MAT_RN; });
  Array.prototype.slice.call(hr.querySelectorAll('th[data-mcol]')).forEach(function (th) {
    var cid = th.getAttribute('data-mcol'); if (cid === MAT_RN) return;
    var dcol = ids.indexOf(cid); if (dcol < 0) return;
    var old = th.querySelector('.mat-col-letter'); if (old) old.parentNode.removeChild(old);
    var lb = document.createElement('span');
    lb.className = 'mat-col-letter'; lb.textContent = matColLetter(dcol);
    th.insertBefore(lb, th.firstChild);
  });
}
function matRenumberRows(t) {
  matRows().forEach(function (tr, i) {
    var td = tr.querySelector(':scope > .mat-rownum');
    if (td) td.textContent = String(i + 1);
  });
}
/* 表脚按最终列序重建：标签格跨到「合计」列，其后补空格（不再依赖 nth-child/累加 colspan） */
function matRebuildFoot(t, full) {
  var fr = t.querySelector('tfoot tr'); if (!fr) return;
  var ti = full.indexOf('total'); if (ti < 1) ti = 1;
  var before = ti, after = Math.max(0, full.length - ti - 1);
  var gtv = '\u00a5 0';
  var oldGt = fr.querySelector('.grand-total-val'); if (oldGt && oldGt.textContent) gtv = oldGt.textContent;
  fr.innerHTML = '<td colspan="' + before + '">\u6750\u6599\u603b\u8ba1</td>'
    + '<td class="grand-total-val" data-mcol="total">' + gtv + '</td>'
    + (after > 0 ? '<td colspan="' + after + '"></td>' : '');
}

/* ---- v180c 插入/删除（中间插入的核心） ---- */
function matNewId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function matInsertRow(anchorKey, below) {
  var rows = matRows(), idx = -1;
  rows.forEach(function (tr, i) { if (tr.dataset.key === anchorKey) idx = i; });
  var after;
  if (below) after = anchorKey;
  else after = (idx <= 0) ? '__top__' : (rows[idx - 1].dataset.key || '__top__');
  matTbl.custom = (matTbl.custom || []).concat([{ id: matNewId('u'), name: '', spec: '', qty: '', price: '', after: after }]);
  matTblSave(); render();
}
function matInsertCol(anchorColId, right, presetTitle) {
  var title = presetTitle;
  if (title == null) title = (window.prompt('\u65b0\u5217\u540d\u79f0\uff1a', '\u8bf4\u660e ' + ((matTbl.extraCols || []).length + 1)) || '').trim();
  if (!title) return;
  var order = matOrderedColIds(), i = order.indexOf(anchorColId), after;
  if (right) after = anchorColId;
  else after = (i <= 0) ? '__top__' : order[i - 1];
  matTbl.extraCols = (matTbl.extraCols || []).concat([{ id: matNewId('x'), title: title, w: 130, after: after }]);
  matTblSave(); render();
}
function matDeleteCol(cid) {
  matTbl.extraCols = (matTbl.extraCols || []).filter(function (c) { return c.id !== cid; });
  delete matTbl.extraCells[cid];
  if (matTbl.edits) Object.keys(matTbl.edits).forEach(function (k) { if (k.split('|')[1] === cid) delete matTbl.edits[k]; });
  matTblSave(); render();
}
function matDeleteRow(key) {
  matTbl.custom = (matTbl.custom || []).filter(function (c) { return c.id !== key; });
  if (matTbl.edits) Object.keys(matTbl.edits).forEach(function (k) { if (k.split('|')[0] === key) delete matTbl.edits[k]; });
  matTblSave(); render();
}

/* ---- v180c 右键菜单（飞书/腾讯文档式：在行号上右键＝行操作，在列头上右键＝列操作） ---- */
function matMenuClose() { var d = document.getElementById('matMenu'); if (d && d.parentNode) d.parentNode.removeChild(d); }
function matMenu(items, x, y) {
  matMenuClose();
  var d = document.createElement('div');
  d.className = 'mat-menu'; d.id = 'matMenu';
  items.forEach(function (it) {
    if (it.sep) { var s = document.createElement('div'); s.className = 'mat-menu-sep'; d.appendChild(s); return; }
    var a = document.createElement('div');
    a.className = 'mat-menu-item' + (it.disabled ? ' disabled' : '');
    a.textContent = it.label;
    if (!it.disabled) a.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); matMenuClose(); it.run(); });
    d.appendChild(a);
  });
  document.body.appendChild(d);
  var w = d.offsetWidth, h = d.offsetHeight;
  d.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 8)) + 'px';
  d.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 8)) + 'px';
}

/* 把 matTbl.edits 的手改值回填到「无原生 input」的格（qty 同步 dataset.qty 供合计计算） */
function matApplyEdits() {
  var edits = matTbl.edits; if (!edits) return;
  var t = matTblEl(); if (!t) return;
  var cids = matColIds();
  matRows().forEach(function (tr) {
    var rk = tr.dataset.key; if (!rk) return;
    Array.prototype.slice.call(tr.children).forEach(function (td, ci) {
      var cid = cids[ci]; if (!cid || cid === MAT_RN) return;
      if (td.querySelector('input')) return;          /* 原生 input 格自行持久化 */
      var key = rk + '|' + cid;
      if (!Object.prototype.hasOwnProperty.call(edits, key)) return;
      var v = edits[key];
      if (cid === 'qty') tr.dataset.qty = v;
      matPaintCell(td, v);
    });
  });
}
/* 画值到无 input 的格：保留单位角标（qty-text + unit-tag 结构） */
function matPaintCell(td, v) {
  var qs = td.querySelector('.qty-text');
  if (qs) { qs.textContent = v; td.dataset.raw = v; }
  else { td.textContent = v; td.dataset.raw = v; }
}

/* ---------- 2. 选中态 ---------- */
function matSelRect() {
  return {
    r1: Math.min(matSel.r, matSel.ar), r2: Math.max(matSel.r, matSel.ar),
    c1: Math.min(matSel.c, matSel.ac), c2: Math.max(matSel.c, matSel.ac)
  };
}
function matClearSelClass() {
  document.querySelectorAll('.materials-card td.mat-sel, .materials-card td.mat-inrange').forEach(function (td) {
    td.classList.remove('mat-sel', 'mat-inrange');
  });
}
function matSelect(r, c, extend, quiet) {
  var cids = matColIds().filter(function (x) { return x !== MAT_RN; });
  if (cids.length < 1) return;
  r = Math.max(1, Math.min(r, matRows().length));
  c = Math.max(0, Math.min(c, cids.length - 1));
  if (!extend) { matSel.ar = r; matSel.ac = c; }
  matSel.r = r; matSel.c = c;
  matClearSelClass();
  var q = matSelRect();
  for (var rr = q.r1; rr <= q.r2; rr++) {
    for (var cc = q.c1; cc <= q.c2; cc++) {
      var td = matCell(cc, rr); if (!td) continue;
      td.classList.add(rr === r && cc === c ? 'mat-sel' : 'mat-inrange');
    }
  }
  var box = document.querySelector('.mat-namebox');
  if (box) box.textContent = matAddr(c, r);
  /* v180：焦点必须落进网格，matGridKey 的 card.contains(activeElement) 守卫才成立。
     否则 activeElement 停在 body → 方向键/Tab/Ctrl+C 等全部被守卫挡掉（v180 首版即此 bug）。
     quiet=true（render 后恢复选区）时不抢焦点，避免打断用户正在做的事。 */
  if (!quiet) {
    var act = matCell(c, r);
    if (act) {
      var inner = act.querySelector('input');
      try { (inner || act).focus({ preventScroll: true }); } catch (eF) { try { (inner || act).focus(); } catch (eF2) {} }
    }
  }
  matPlaceHandle();
}
/* ---------- 3. 填充柄 ---------- */
function matEnsureHandle() {
  var h = document.getElementById('matFillHandle');
  if (h) return h;
  h = document.createElement('div');
  h.id = 'matFillHandle'; h.className = 'mat-fill-handle'; h.title = '拖动填充';
  document.body.appendChild(h);
  return h;
}
function matPlaceHandle() {
  var h = document.getElementById('matFillHandle');
  if (!h) return;
  var q = matSelRect();
  var td = matCell(q.c2, q.r2);
  var t = matTblEl();
  if (!td || !t || (q.r1 === q.r2 && q.c1 === q.c2)) { h.style.display = 'none'; return; }
  var a = td.getBoundingClientRect(), b = t.getBoundingClientRect();
  h.style.display = 'block';
  h.style.left = (a.right - 4 + window.scrollX) + 'px';
  h.style.top = (a.bottom - 4 + window.scrollY) + 'px';
}

/* ---------- 4. 编辑 ---------- */
function matCommitCell(td, text) {
  var tr = td.parentNode;
  var cids = matColIds();
  var ci = Array.prototype.indexOf.call(tr.children, td);
  var cid = cids[ci];
  var rk = matKey(tr, matRows().indexOf(tr));
  var inp = td.querySelector('input');
  if (inp) {
    inp.value = text;
    if (text.charAt(0) === '=') inp.dataset.formula = text; else delete inp.dataset.formula;
    matTblSave();
  } else {
    if (cid === 'qty') tr.dataset.qty = text;
    matPaintCell(td, text);
    matTbl.edits = matTbl.edits || {};
    var k = rk + '|' + cid;
    if (text === '') delete matTbl.edits[k]; else matTbl.edits[k] = text;
    matTblSave();
  }
  /* v180 修正：必须「先回填 edits、再求值」。反序时 matApplyEdits 会把公式原文盖在计算结果上，格内显示 =SUM(..) 而非数字。 */
  matApplyEdits();
  try { matApplyFormulas(); } catch (e) {}
  try { updateMaterialTotals(); } catch (e) {}
  try { matApplyFormulas(); } catch (e) {}
}
function matBeginEdit(td, initial) {
  if (!td || matSel.editing) return;
  var inp = td.querySelector('input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'mat-cell-editor'; inp._matCreated = true;
    var raw = (td.dataset.raw != null) ? td.dataset.raw : (td.querySelector('.qty-text') ? td.querySelector('.qty-text').textContent : td.textContent);
    inp.value = initial != null ? initial : raw;
    td.textContent = '';
    td.appendChild(inp);
    if (td.querySelector('.unit-tag')) { /* 单位已随 textContent 清掉，编辑态不显示 */ }
  }
  matSel.editing = true;
  inp.classList.add('mat-editing');
  inp.focus();
  if (initial != null) { inp.value = initial; }
  else inp.select();
  matHighlightRefs(inp.value);
  inp.addEventListener('keydown', matEditKey);
  inp.addEventListener('input', function () { matHighlightRefs(inp.value); });
  inp._matBlur = function () { matEndEdit(inp, true); };
  inp.addEventListener('blur', inp._matBlur);
}
function matEndEdit(inp, commit) {
  if (!inp) { matSel.editing = false; return; }
  var td = inp.closest('td');
  var val = inp.value;
  /* 先摘掉自建编辑器再提交：否则 matPaintCell 写 textContent 时，输入框仍挂在 td 里，文本会被顶掉 */
  if (inp._matCreated) {
    inp.removeEventListener('blur', inp._matBlur);
    if (inp.parentNode) inp.parentNode.removeChild(inp);
  } else {
    inp.classList.remove('mat-editing');
  }
  /* _matDone 只用于去重（Enter 之后的 blur 不再重复提交），不参与是否提交的判断 */
  if (commit && !inp._matDone && td) matCommitCell(td, val);
  inp._matDone = true;
  matHighlightRefs(null);
  matSel.editing = false;
}
function matCancelEdit() {
  var inp = document.querySelector('.mat-cell-editor');
  if (!inp) { matSel.editing = false; return; }
  var td = inp.closest('td');
  inp._matDone = true;
  inp.removeEventListener('blur', inp._matBlur);
  if (td && !td.querySelector('input:not(.mat-cell-editor)')) matApplyEdits();
  if (inp.parentNode) inp.parentNode.removeChild(inp);
  if (td) matApplyEdits();
  matSel.editing = false;
  matHighlightRefs(null);
}

/* ---------- 5. 公式引用高亮 ---------- */
function matHighlightRefs(expr) {
  document.querySelectorAll('.materials-card td.mat-ref, .materials-card td.mat-refsrc').forEach(function (td) {
    td.classList.remove('mat-ref', 'mat-refsrc');
  });
  if (!expr || expr.charAt(0) !== '=') return;
  var tds = Array.prototype.slice.call(document.querySelectorAll('.materials-card tbody td'));
  var self = null;
  expr.replace(/([A-Z]+)(\d+):([A-Z]+)(\d+)/g, function (m, c1, r1, c2, r2) {
    var a = matColLetterIndex(c1), b = matColLetterIndex(c2);
    for (var cc = Math.min(a, b); cc <= Math.max(a, b); cc++)
      for (var rr = Math.min(+r1, +r2); rr <= Math.max(+r1, +r2); rr++) { var x = matCell(cc, rr); if (x) x.classList.add('mat-ref'); }
    return m;
  });
  expr.replace(/([A-Z]+\d+)/g, function (m) {
    if (m.indexOf(':') >= 0) return m;
    var mm = m.match(/^([A-Z]+)(\d+)$/); if (!mm) return m;
    var x = matCell(matColLetterIndex(mm[1]), +mm[2]);
    if (x) { x.classList.add('mat-ref'); self = x; }
    return m;
  });
}

/* ---------- 6. 写值（粘贴/填充/键入共用） ---------- */
function matWriteAt(dcol, row, text) {
  var td = matCell(dcol, row); if (!td) return;
  matCommitCell(td, text);
  matPaintCell(td, text);
}

/* ---------- 7. 复制 / 剪切 / 粘贴 ---------- */
function matBuildClip() {
  var q = matSelRect(), rows = [];
  for (var r = q.r1; r <= q.r2; r++) {
    var line = [];
    for (var c = q.c1; c <= q.c2; c++) {
      var td = matCell(c, r);
      var v = '';
      if (td) { var i2 = td.querySelector('input'); v = i2 ? i2.value : ((td.dataset.raw != null) ? td.dataset.raw : td.textContent); }
      line.push(v);
    }
    rows.push(line);
  }
  return rows;
}
function matClipText(rows) {
  return rows.map(function (l) { return l.join('\t'); }).join('\n');
}
function matCopy(cut) {
  var rows = matBuildClip();
  matClip = { rows: rows, cut: !!cut };
  var txt = matClipText(rows);
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt); } catch (e) {}
  var ta = document.createElement('textarea');
  ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  if (cut) { for (var r = matSelRect().r1; r <= matSelRect().r2; r++) for (var c = matSelRect().c1; c <= matSelRect().c2; c++) matWriteAt(c, r, ''); }
  matFlash('已' + (cut ? '剪切' : '复制') + ' ' + rows.length + '×' + rows[0].length);
}
function matPaste(text) {
  if (text == null) text = (matClip ? matClipText(matClip.rows) : '');
  if (!text) return;
  var rows = String(text).replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
  var q = matSelRect();
  for (var i = 0; i < rows.length; i++)
    for (var j = 0; j < rows[i].length; j++) matWriteAt(q.c1 + j, q.r1 + i, rows[i][j]);
  if (matClip && matClip.cut) matClip = null;
  matFlash('已粘贴 ' + rows.length + ' 行');
}
/* ---------- 8. 填充柄拖拽 ---------- */
function matFillApply(srcR1, srcC1, srcR2, srcC2, dstR2, dstC2) {
  var srcH = srcR2 - srcR1 + 1, srcW = srcC2 - srcC1 + 1;
  for (var r = srcR1; r <= dstR2; r++)
    for (var c = srcC1; c <= dstC2; c++) {
      if (r >= srcR1 && r <= srcR2 && c >= srcC1 && c <= srcC2) continue;
      var sr = srcR1 + ((r - srcR1) % srcH), sc = srcC1 + ((c - srcC1) % srcW);
      var td = matCell(sc, sr); if (!td) continue;
      var i2 = td.querySelector('input');
      matWriteAt(c, r, i2 ? i2.value : ((td.dataset.raw != null) ? td.dataset.raw : td.textContent));
    }
}
function matCellFromPoint(x, y) {
  var el = document.elementFromPoint(x, y);
  var td = el ? el.closest('.materials-card tbody td') : null;
  if (!td) return null;
  var tr = td.parentNode, cids = matColIds();
  var ci = Array.prototype.indexOf.call(tr.children, td);
  var cid = cids[ci]; if (!cid || cid === MAT_RN) return null;
  return { c: ci - MAT_ADDR_OFF, r: matRows().indexOf(tr) + 1 };
}

/* ---------- 9. 事件绑定（一次） ---------- */
function matBindGrid() {
  /* v180c 修正：监听器绝不能挂 .materials-card 本体 —— render() 会把 detailsSection.innerHTML
     整体重写，该元素被重建，旧引用沦为游离节点：此后点单元格选不中、右键菜单打不开、双击不进编辑
     （全部静默失效、无报错）。统一挂 document + closest('.materials-card') 守卫。 */
  function matInCard(e) { return !!(e.target && e.target.closest && e.target.closest('.materials-card')); }
  document.addEventListener('mousedown', function (e) {
    if (e.target.id === 'matFillHandle') {
      var q0 = matSelRect();
      matFill = { r1: q0.r1, c1: q0.c1, r2: q0.r2, c2: q0.c2 };
      e.preventDefault();
      return;
    }
    if (!matInCard(e)) return;
    var td = e.target.closest ? e.target.closest('tbody td') : null;
    if (!td) return;
    if (td.classList.contains('mat-rownum')) { var q = matSelRect(); matSelect(q.r1, q.c1, false); return; }
    var ci = Array.prototype.indexOf.call(td.parentNode.children, td);
    var dcol = ci - MAT_ADDR_OFF; if (dcol < 0) return;
    var r = matRows().indexOf(td.parentNode) + 1;
    var ext = e.shiftKey;
    matSelect(r, dcol, ext);
  });
  document.addEventListener('dblclick', function (e) {
    if (!matInCard(e)) return;
    var td = e.target.closest ? e.target.closest('tbody td') : null;
    if (!td || td.classList.contains('mat-rownum')) return;
    var ci = Array.prototype.indexOf.call(td.parentNode.children, td);
    matBeginEdit(td, null);
  });
  document.addEventListener('mousemove', function (e) {
    if (!matFill) return;
    var p = matCellFromPoint(e.clientX, e.clientY); if (!p) return;
    if (p.r !== matSel.r || p.c !== matSel.c) { matSel.r = p.r; matSel.c = p.c; matSelect(p.r, p.c, true); }
  });
  document.addEventListener('mouseup', function () {
    if (!matFill) return;
    var f = matFill; matFill = null;
    var q = matSelRect();
    if (q.r2 > f.r2 || q.c2 > f.c2) matFillApply(f.r1, f.c1, f.r2, f.c2, q.r2, q.c2);
  });
  document.addEventListener('keydown', matGridKey, true);
  window.addEventListener('resize', matPlaceHandle);
  window.addEventListener('scroll', matPlaceHandle, true);
  /* v180c：右键菜单 —— 行号右键＝行操作；列头右键＝列操作（对应在线表格的中间插入） */
  document.addEventListener('contextmenu', function (e) {
    if (!matInCard(e)) return;
    var th = e.target.closest ? e.target.closest('thead th') : null;
    if (th) {
      var cid = th.getAttribute('data-mcol');
      if (cid === MAT_RN) { e.preventDefault(); return; }
      e.preventDefault();
      var isExtra = (matTbl.extraCols || []).some(function (c) { return c.id === cid; });
      matMenu([
        { label: '\u5728\u5de6\u4fa7\u63d2\u5165\u5217', run: function () { matInsertCol(cid, false); } },
        { label: '\u5728\u53f3\u4fa7\u63d2\u5165\u5217', run: function () { matInsertCol(cid, true); } },
        { sep: true },
        { label: '\u5220\u9664\u672c\u5217', disabled: !isExtra, run: function () { matDeleteCol(cid); } }
      ], e.clientX, e.clientY);
      return;
    }
    var rn = e.target.closest ? e.target.closest('tbody td.mat-rownum') : null;
    if (rn) {
      e.preventDefault();
      var key = rn.parentNode.dataset.key;
      var isCustom = (matTbl.custom || []).some(function (c) { return c.id === key; });
      matMenu([
        { label: '\u5728\u4e0a\u65b9\u63d2\u5165\u884c', run: function () { matInsertRow(key, false); } },
        { label: '\u5728\u4e0b\u65b9\u63d2\u5165\u884c', run: function () { matInsertRow(key, true); } },
        { sep: true },
        { label: '\u5220\u9664\u672c\u884c', disabled: !isCustom, run: function () { matDeleteRow(key); } }
      ], e.clientX, e.clientY);
    }
  });
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest || !e.target.closest('#matMenu')) matMenuClose();
  });
}
function matEditKey(e) {
  /* ⚠ 不要再在此提前置 _matDone：那会让 matEndEdit 内部的去重判断跳过提交（v180 首版即此 bug，Enter 提交静默失效） */
  if (e.key === 'Enter') { e.preventDefault(); matEndEdit(e.target, true); matMove(0, e.shiftKey ? -1 : 1); }
  else if (e.key === 'Tab') { e.preventDefault(); matEndEdit(e.target, true); matMove(0, e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); matCancelEdit(); }
  e.stopPropagation();
}
function matMove(dr, dc) {
  matSelect(matSel.r + dr, matSel.c + dc, false);
}
function matGridKey(e) {
  var card = document.querySelector('.materials-card');
  var ae = document.activeElement;
  if (card && !card.contains(ae)) return;
  if (ae && ae.classList && ae.classList.contains('mat-cell-editor')) return;   /* 编辑中交给 matEditKey */
  var nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (nav[e.key]) { e.preventDefault(); matMove(nav[e.key][0], nav[e.key][1]); return; }
  if (e.key === 'Tab') { e.preventDefault(); matMove(0, e.shiftKey ? -1 : 1); return; }
  if (e.key === 'Enter' || e.key === 'F2') {
    e.preventDefault();
    var td = matCell(matSel.c, matSel.r); if (td) matBeginEdit(td, null);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    var q = matSelRect();
    for (var r = q.r1; r <= q.r2; r++) for (var c = q.c1; c <= q.c2; c++) matWriteAt(c, r, '');
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); matCopy(false); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); matCopy(true); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
    e.preventDefault();
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) { matPaste(t); }).catch(function () { matPaste(null); });
    } else matPaste(null);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    var q2 = matSelRect();
    var snap = [];
    for (var rr = q2.r1; rr <= q2.r2; rr++) { var line = []; for (var cc = q2.c1; cc <= q2.c2; cc++) { var x = matCell(cc, rr); var iv = x && x.querySelector('input'); line.push(iv ? iv.value : (x ? ((x.dataset.raw != null) ? x.dataset.raw : x.textContent) : '')); } snap.push(line); }
    for (var i = 0; i < snap.length; i++) for (var j = 0; j < snap[i].length; j++) matWriteAt(q2.c1 + j, q2.r2 + 1 + i, snap[i][j]);
    return;
  }
  /* 直接键入即进入编辑（覆盖原值）—— 电子表核心手感 */
  if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
    var td2 = matCell(matSel.c, matSel.r);
    if (td2) { e.preventDefault(); matBeginEdit(td2, e.key); }
  }
}
function matFlash(msg) {
  var el = document.getElementById('matFlash'); if (!el) return;
  el.textContent = msg; el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.opacity = '0'; }, 1400);
}

function matBuildCellMap() {
  var tbl = document.querySelector('.materials-card table');
  if (!tbl) return null;
  var cols = Array.prototype.slice.call(tbl.querySelectorAll('colgroup col'));
  var colIds = cols.map(function (c) { return c.getAttribute('data-mcol'); });
  var rows = Array.prototype.slice.call(tbl.querySelectorAll('tbody tr'));
  var map = { cells: {}, colIds: colIds, rowCount: rows.length };
  rows.forEach(function (tr, ri) {
    var r = ri + 1;
    Array.prototype.slice.call(tr.children).forEach(function (td, ci) {
      var cid = colIds[ci]; if (!cid || cid === MAT_RN) return;
      /* v180：行号槽列（MAT_RN）是纯 UI，不参与 A1 地址空间；数据列 dcol 从 0 起 */
      var dcol = ci - MAT_ADDR_OFF; if (dcol < 0) return;
      var key = matColLetter(dcol) + r;
      var inp = td.querySelector('input');
      var raw;
      if (inp) { raw = (inp.dataset.formula && inp.value.charAt(0) !== '=') ? inp.dataset.formula : inp.value; }
      else { raw = (td.dataset.raw != null) ? td.dataset.raw : (td.textContent || ''); }
      map.cells[key] = { raw: raw, el: inp || td, colId: cid, row: r, col: dcol, letter: matColLetter(dcol) };
    });
  });
  return map;
}
function matSetFormulaCell(c, display, isErr) {
  if (!c.el) return;
  if (c.el.tagName === 'INPUT') {
    c.el.dataset.formula = c.raw;
    if (document.activeElement !== c.el) c.el.value = display;
  } else {
    /* v180 修正：纯文本 td 也要显示求值结果（原先只处理 INPUT 直接 return，=SUM 在全表自由编辑下永不生效）。
       注意只改可见文本、绝不回写 dataset.raw —— 那里要保留公式原文供下次 matBuildCellMap 重新求值。 */
    var qs = c.el.querySelector('.qty-text');
    if (qs) qs.textContent = display; else c.el.textContent = display;
    if(c.colId==='qty')c.el.closest('tr').dataset.qty=isErr?'NaN':String(display);
  }
  c.el.classList.toggle('mat-formula', !isErr);
  c.el.classList.toggle('mat-formula-err', !!isErr);
}
function matApplyFormulas() {
  var map=matBuildCellMap();if(!map)return;var vals={},state={},errors={};
  Object.keys(map.cells).forEach(function(k){vals[k]=matParseNum(map.cells[k].raw);});
  function evalCell(k){
    if(state[k]===2)return !errors[k];if(state[k]===1){errors[k]='#REF!';return false;}
    var c=map.cells[k];if(!c)return false;
    if(typeof c.raw!=='string'||c.raw.charAt(0)!=='='){
      if(c.colId==='total'&&matEditFor(c.el.closest('tr').dataset.key,'total')==null){
        state[k]=1;var peers=Object.keys(map.cells).filter(q=>map.cells[q].row===c.row&&(map.cells[q].colId==='qty'||map.cells[q].colId==='price'));
        if(peers.some(q=>!evalCell(q))){errors[k]='#REF!';state[k]=2;return false;}
        vals[k]=peers.reduce((n,q)=>n*(Number.isFinite(vals[q])?vals[q]:0),1);state[k]=2;
      }
      if(c.el.tagName==='INPUT'){delete c.el.dataset.formula;c.el.classList.remove('mat-formula','mat-formula-err');}return true;
    }
    state[k]=1;var err=null,expr=c.raw.slice(1).toUpperCase();
    RyMaterialAudit.refs(expr).forEach(function(ref){if(!map.cells[ref]||!evalCell(ref))err='#REF!';});
    var v=err?null:matEvalExpr(expr,vals);if(!err&&(!v||v.err||!Number.isFinite(Number(v.val))))err='#ERR!';
    if(err){errors[k]=err;vals[k]=NaN;matSetFormulaCell(c,err,true);}else{vals[k]=Number(v.val);matSetFormulaCell(c,matFmtNum(vals[k]),false);}state[k]=2;return !err;
  }
  Object.keys(map.cells).forEach(evalCell);
  updateMaterialTotals();
}
