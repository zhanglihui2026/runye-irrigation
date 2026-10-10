
// ===== 滴灌供水首部系统图编辑器（合并自 滴灌供水图编辑器.html，IIFE 隔离，不污染全局） =====
(function(){
var DEFAULTS = {
  title: '润野灌溉 — 供水首部系统图', figNo: 'DG-01', date: '2026.08', unit: '（填写）',
  paper: 'a3', density: 1, source: '蓄水池', pump: '离心/自吸泵', filter: '叠片式',
  suctionDN: 80, mainDN: 90, checkValve: true, airValve: true,
  fertCount: 1, ferts: [{ type: '文丘里', dn: 25 }],
  show: { num: true, dn: true, legend: true, table: true, notes: true, sign: true }
};
var DN_OPT = [50, 63, 75, 80, 90, 100, 110, 125, 140, 150, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
var FDN_OPT = [16, 20, 25, 32, 40];
var cfg = null;
var saved = null;
try { saved = JSON.parse(localStorage.getItem('drip-cfg')); } catch (e) {}
cfg = mergeDeep(clone(DEFAULTS), saved || {});
if (!cfg.ferts || !cfg.ferts.length) cfg.ferts = [{ type: '文丘里', dn: 25 }];
cfg.fertCount = Math.min(4, Math.max(1, cfg.fertCount || 1));

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function mergeDeep(a, b) {
  if (!b) return a;
  for (var k in b) {
    if (typeof b[k] === 'object' && b[k] && !Array.isArray(b[k]) && typeof a[k] === 'object' && a[k]) {
      a[k] = mergeDeep(a[k], b[k]);
    } else if (b[k] !== undefined && b[k] !== null) { a[k] = b[k]; }
  }
  return a;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fillDNSelect(sel, arr, val) {
  sel.innerHTML = '';
  arr.forEach(function (d) {
    var o = document.createElement('option');
    o.value = d; o.textContent = d;
    if (d === val) o.selected = true;
    sel.appendChild(o);
  });
}

function bindUI() {
  fillDNSelect(document.getElementById('cfg_suctionDN'), DN_OPT, cfg.suctionDN);
  fillDNSelect(document.getElementById('cfg_mainDN'), DN_OPT, cfg.mainDN);
  document.getElementById('cfg_title').value = cfg.title;
  document.getElementById('cfg_figNo').value = cfg.figNo;
  document.getElementById('cfg_date').value = cfg.date;
  document.getElementById('cfg_unit').value = cfg.unit;
  document.getElementById('cfg_paper').value = cfg.paper;
  document.getElementById('cfg_density').value = String(cfg.density);
  document.getElementById('cfg_source').value = cfg.source;
  document.getElementById('cfg_pump').value = cfg.pump;
  document.getElementById('cfg_filter').value = cfg.filter;
  document.getElementById('cfg_fertCount').value = String(cfg.fertCount);
  document.getElementById('cfg_checkValve').checked = !!cfg.checkValve;
  document.getElementById('cfg_airValve').checked = !!cfg.airValve;
  // 「显示内容」复选框组已按用户要求移除（2026-09-13）：出图恒为六项全显示（cfg.show 用默认值）
  renderFertList();
}

function renderFertList() {
  var box = document.getElementById('fertList');
  var n = cfg.fertCount;
  while (cfg.ferts.length < n) cfg.ferts.push({ type: '文丘里', dn: 25 });
  cfg.ferts = cfg.ferts.slice(0, n);
  var html = '';
  for (var i = 0; i < n; i++) {
    html += '<div class="hm-fert-item"><div class="ft">第 ' + (i + 1) + ' 路吸肥管（图面编号 4-' + (i + 1) + '）</div>' +
      '<div class="hm-row"><label>施肥方式</label><select data-i="' + i + '" data-f="type">' +
      ['文丘里','压差式','注肥泵'].map(function (t) { return '<option' + (cfg.ferts[i].type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="hm-row"><label>吸肥管 DN</label><select data-i="' + i + '" data-f="dn">' +
      FDN_OPT.map(function (d) { return '<option value="' + d + '"' + (cfg.ferts[i].dn === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') +
      '</select></div></div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('select[data-f]').forEach(function (s) {
    s.addEventListener('change', function () {
      var i = +s.getAttribute('data-i'), f = s.getAttribute('data-f');
      cfg.ferts[i][f] = (f === 'dn') ? +s.value : s.value;
      persist(); render(); hmFit();
    });
  });
}

function collect() {
  cfg.title = document.getElementById('cfg_title').value.trim() || DEFAULTS.title;
  cfg.figNo = document.getElementById('cfg_figNo').value.trim() || 'DG-01';
  cfg.date = document.getElementById('cfg_date').value.trim();
  cfg.unit = document.getElementById('cfg_unit').value.trim() || '（填写）';
  cfg.paper = document.getElementById('cfg_paper').value;
  cfg.density = parseFloat(document.getElementById('cfg_density').value) || 1;
  cfg.source = document.getElementById('cfg_source').value;
  cfg.pump = document.getElementById('cfg_pump').value;
  cfg.filter = document.getElementById('cfg_filter').value;
  cfg.suctionDN = +document.getElementById('cfg_suctionDN').value;
  cfg.mainDN = +document.getElementById('cfg_mainDN').value;
  cfg.checkValve = document.getElementById('cfg_checkValve').checked;
  cfg.airValve = document.getElementById('cfg_airValve').checked;
  cfg.fertCount = +document.getElementById('cfg_fertCount').value;
  // 「显示内容」复选框组已按用户要求移除（2026-09-13）：出图恒为六项全显示（cfg.show 用默认值）
  while (cfg.ferts.length < cfg.fertCount) cfg.ferts.push({ type: '文丘里', dn: 25 });
  cfg.ferts = cfg.ferts.slice(0, cfg.fertCount);
}
function persist() { try { localStorage.setItem('drip-cfg', JSON.stringify(cfg)); } catch (e) {} }

document.addEventListener('change', function (e) {
  if (!document.getElementById('headModal') || document.getElementById('headModal').style.display === 'none') return;
  if (e.target.closest('#fertList')) return;
  if (e.target.id && e.target.id.indexOf('cfg_') === 0) { collect(); if (e.target.id === 'cfg_fertCount') renderFertList(); persist(); render(); hmFit(); }
});
document.addEventListener('input', function (e) {
  if (!document.getElementById('headModal') || document.getElementById('headModal').style.display === 'none') return;
  if (e.target.id && e.target.id.indexOf('cfg_') === 0) { collect(); persist(); render(); hmFit(); }
});

/* 布局计算：全部横向段长与密度 k、图纸尺寸一致，供 drawSVG 与 render 共用 */
function layout(cfg) {
  var k = cfg.density;
  var fW = 92 * k, fH = 58 * k;
  var fGap = Math.min(fW + 18 * k, 96 + 24 * k);   // 吸肥管盒子间距 ≥ 盒宽，杜绝重叠
  var x = 60 * k + (96 * k + 26 * k) + (26 * k + 26 * k + 20 * k);   // 水源 + 底阀吸水管
  x += (cfg.fertCount - 1) * fGap + fW + 30 * k;  // 吸肥区
  x += (34 + 20) * k;                              // 闸阀
  x += (22 + 34 + 27 + 16) * k;                    // 水泵
  x += 40 * k;                                     // 压力表
  x += (10 + 30 + 14) * k;                         // 止回阀
  x += (14 + 96 + 16) * k;                         // 过滤器
  x += 340;                                        // 主管保留段（弯折前水平段，拉长使主图横向铺满 A3 绘图区）
  return { k: k, fW: fW, fH: fH, fGap: fGap, xEnd: x };
}
/* SVG 尺寸：W/H 与纸张绘图区宽高比匹配（A3 满布），render/exportSVG/exportPNG 三处共用，避免不一致 */
function svgSize(cfg) {
  var L = layout(cfg);
  var W = Math.ceil(L.xEnd + 60);
  var ly = 255 + 52 * L.k + 40;                   // 图例区起始 y
  var H = Math.ceil(ly + (cfg.show.legend ? 134 : 40));   // 底部留白 20（注记下方）
  return { W: W, H: H, L: L, ly: ly };
}
function pw(dn) { return 2 + (dn / 25) * 0.8; }
function drawSVG(cfg, W, H) {
  var L = layout(cfg), k = L.k;
  var yMain = 255;
  var g = [];
  g.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">');
  g.push('<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>');
  g.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');

  var blue = '#185FA5', blueT = '#0C447C', blueF = '#378ADD', blueL = '#E6F1FB', green = '#0F6E56', greenL = '#E1F5EE';

  function tag(x, y, n, opt) {
    if (!cfg.show.num) return;
    g.push('<circle cx="' + x + '" cy="' + y + '" r="' + (opt && opt.r || 11) + '" fill="#fff" stroke="' + blueT + '" stroke-width=".6"/>');
    g.push('<text x="' + x + '" y="' + y + '" font-size="' + (opt && opt.fs || 12) + '" text-anchor="middle" dominant-baseline="central" fill="' + blueT + '">' + n + '</text>');
  }
  function pipe(x1, y1, x2, y2, w, col) {
    g.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (col || blue) + '" stroke-width="' + w + '"/>');
  }
  function txt(x, y, s, fs, col, anchor) {
    g.push('<text x="' + x + '" y="' + y + '" font-size="' + (fs || 12) + '" text-anchor="' + (anchor || 'middle') + '" fill="' + (col || '#222') + '">' + esc(s) + '</text>');
  }

  var x = 60 * k;

  /* 1 水源 */
  var sw = 96 * k, sh = 100 * k;
  g.push('<text x="' + (x + 14) + '" y="' + (yMain - sh / 2 - 24) + '" font-size="13" fill="' + blueT + '">水源</text>');
  tag(x + 14, yMain - sh / 2 - 8, '1');
  g.push('<rect x="' + x + '" y="' + (yMain - sh / 2) + '" width="' + sw + '" height="' + sh + '" rx="6" fill="' + blueL + '" stroke="' + blue + '" stroke-width=".6"/>');
  g.push('<path d="M' + x + ' ' + (yMain - sh / 2 + 18) + ' Q ' + (x + sw / 4) + ' ' + (yMain - sh / 2 + 10) + ' ' + (x + sw / 2) + ' ' + (yMain - sh / 2 + 18) + ' T ' + (x + sw) + ' ' + (yMain - sh / 2 + 18) + '" stroke="' + blue + '" stroke-width="1.1" fill="none"/>');
  g.push('<path d="M' + x + ' ' + (yMain - sh / 2 + 18) + ' L' + (x + sw) + ' ' + (yMain - sh / 2 + 18) + ' L' + (x + sw) + ' ' + (yMain + sh / 2) + ' L' + x + ' ' + (yMain + sh / 2) + ' Z" fill="#B5D4F4" opacity=".5"/>');
  txt(x + sw / 2, yMain + sh / 2 - 30, cfg.source, 13, blueT);
  txt(x + sw / 2, yMain + sh / 2 - 12, '水源', 12, blue);
  x += sw + 26 * k;

  /* 2 底阀滤网 + 3 吸水管 */
  pipe(x - 26 * k, yMain, x + 26 * k, yMain, pw(cfg.suctionDN));   // 水源出口(156k)→底阀圆心(208k)
  x += 26 * k;                          // x = 底阀圆心（208k）
  g.push('<circle cx="' + x + '" cy="' + yMain + '" r="13" fill="#fff" stroke="' + blue + '" stroke-width=".6"/>');
  g.push('<line x1="' + x + '" y1="' + (yMain - 9) + '" x2="' + x + '" y2="' + (yMain + 9) + '" stroke="' + blue + '" stroke-width="1.2"/>');
  g.push('<line x1="' + (x - 9) + '" y1="' + yMain + '" x2="' + (x + 9) + '" y2="' + yMain + '" stroke="' + blue + '" stroke-width=".6" stroke-dasharray="2.5 1.8"/>');
  tag(x, yMain - 26, '2', { r: 10 });
  txt(x, yMain + 34, '底阀+滤网', 12, blueT);
  x += 26 * k;                          // x = 吸水管段起点（234k）
  pipe(x - 26 * k, yMain, x + 20 * k, yMain, pw(cfg.suctionDN));   // 底阀圆心(208k)→吸水管段终点(254k)
  if (cfg.show.dn) txt(x + 8, yMain + 26, '吸水管 DN' + cfg.suctionDN, 12.5, blueT, 'start');
  tag(x + 8, yMain - 28, '3', { r: 10 });
  x += 20 * k;

  /* 4 吸肥区（4-1 ~ 4-n） */
  var fc = cfg.fertCount, fW = L.fW, fH = L.fH, fGap = L.fGap;
  var regionStart = x, regionW = (fc - 1) * fGap + fW;
  for (var i = 0; i < fc; i++) {
    var cx = regionStart + i * fGap + fW / 2;
    var yTop = yMain - 96 * k - fH;
    var numY = yTop - 20 * k;
    pipe(cx, yMain, cx, numY, pw(cfg.ferts[i].dn || 25) + 1.5, green);
    g.push('<rect x="' + (cx - fW / 2) + '" y="' + yTop + '" width="' + fW + '" height="' + fH + '" rx="6" fill="' + greenL + '" stroke="' + green + '" stroke-width=".6"/>');
    txt(cx, yTop + 18, '施肥器 · ' + cfg.ferts[i].type, 12.5, '#04342C');
    txt(cx, yTop + 38, '第 ' + (i + 1) + ' 路 · 吸肥 DN' + cfg.ferts[i].dn, 11.5, green);
    var gy = yMain - 50 * k;
    g.push('<rect x="' + (cx - 5) + '" y="' + (gy - 5) + '" width="10" height="10" fill="#fff" stroke="' + green + '" stroke-width=".6" transform="rotate(45 ' + cx + ' ' + gy + ')"/>');
    if (cfg.show.num) {
      g.push('<circle cx="' + cx + '" cy="' + numY + '" r="10" fill="#fff" stroke="' + green + '" stroke-width=".6"/>');
      g.push('<text x="' + cx + '" y="' + numY + '" font-size="11.5" text-anchor="middle" dominant-baseline="central" fill="' + green + '">4-' + (i + 1) + '</text>');
    }
  }
  pipe(regionStart, yMain, regionStart + regionW + 30 * k, yMain, pw(cfg.suctionDN));  // 吸肥区水平管延伸至闸阀段起点
  x = regionStart + regionW + 30 * k;

  /* 5 闸阀 */
  pipe(x, yMain, x + 54 * k, yMain, pw(cfg.suctionDN));   // 贯穿闸阀段（54k）
  var gx = x + 27 * k;
  g.push('<rect x="' + (gx - 8) + '" y="' + (yMain - 8) + '" width="16" height="16" fill="#fff" stroke="' + blue + '" stroke-width=".6" transform="rotate(45 ' + gx + ' ' + yMain + ')"/>');
  txt(gx, yMain + 28, '闸阀', 12, blueT);
  tag(gx, yMain - 30, '5', { r: 10 });
  x = gx + 27 * k;

  /* 6 水泵 */
  pipe(x, yMain, x + 99 * k, yMain, pw(cfg.suctionDN));   // 贯穿水泵段（22+34+27+16=99k），圆覆盖中部
  var px = x + 22 * k + 34 * k;
  g.push('<circle cx="' + px + '" cy="' + yMain + '" r="' + (27 * k) + '" fill="#fff" stroke="' + blue + '" stroke-width=".6"/>');
  g.push('<path d="M' + px + ' ' + (yMain - 15 * k) + ' L' + (px + 12 * k) + ' ' + (yMain + 10 * k) + ' L' + (px - 12 * k) + ' ' + (yMain + 10 * k) + ' Z" fill="' + blueF + '"/>');
  tag(px, yMain - 42 * k, '6');
  txt(px, yMain - 60 * k, '水泵', 13, blueT);
  txt(px, yMain + 27 * k + 18, cfg.pump, 12, blue);
  x = px + 27 * k + 16 * k;

  /* 7 压力表（泵后） */
  pipe(x, yMain, x + 40 * k, yMain, pw(cfg.suctionDN));
  var mgx = x + 20 * k;
  g.push('<line x1="' + mgx + '" y1="' + yMain + '" x2="' + mgx + '" y2="' + (yMain - 22 * k) + '" stroke="' + blue + '" stroke-width="2"/>');
  g.push('<circle cx="' + mgx + '" cy="' + (yMain - 34 * k) + '" r="11" fill="#fff" stroke="' + blue + '" stroke-width=".6"/>');
  g.push('<line x1="' + mgx + '" y1="' + (yMain - 34 * k) + '" x2="' + (mgx + 6) + '" y2="' + (yMain - 40 * k) + '" stroke="' + blue + '" stroke-width="1.2"/>');
  txt(mgx, yMain - 52 * k, '压力表', 12, blueT);
  tag(mgx, yMain - 52 * k - 26, '7', { r: 9 });
  x += 40 * k;

  /* 8 止回阀 */
  if (cfg.checkValve) {
    var cvx = x + 10 * k;
    g.push('<line x1="' + x + '" y1="' + yMain + '" x2="' + cvx + '" y2="' + yMain + '" stroke="' + blue + '" stroke-width="' + pw(cfg.suctionDN) + '"/>');
    g.push('<line x1="' + cvx + '" y1="' + yMain + '" x2="' + (x + 54 * k) + '" y2="' + yMain + '" stroke="' + blue + '" stroke-width="' + pw(cfg.suctionDN) + '" marker-end="url(#arrow)"/>');
    txt(cvx + 15 * k, yMain + 28, '止回阀', 12, blueT);
    tag(cvx + 15 * k, yMain - 30, '8', { r: 10 });
    x = cvx + 30 * k + 14 * k;
  } else {
    x += 54 * k;   // 无止回阀时也推进段宽，与 layout() 一致
  }

  /* 9 过滤器 */
  var fw = 96 * k, fh = 62 * k;
  pipe(x, yMain, x + 14 * k, yMain, pw(cfg.suctionDN));
  var fx = x + 14 * k;
  g.push('<rect x="' + fx + '" y="' + (yMain - fh / 2) + '" width="' + fw + '" height="' + fh + '" rx="4" fill="' + blueL + '" stroke="' + blue + '" stroke-width=".6"/>');
  g.push('<path d="M' + (fx + 10) + ' ' + (yMain - 16 * k) + ' L' + (fx + fw / 2) + ' ' + yMain + ' L' + (fx + fw - 10) + ' ' + (yMain - 16 * k) + ' L' + (fx + fw - 10) + ' ' + (yMain + 16 * k) + ' L' + (fx + fw / 2) + ' ' + yMain + ' L' + (fx + 10) + ' ' + (yMain + 16 * k) + ' Z" fill="none" stroke="' + blueF + '" stroke-width="1.2"/>');
  tag(fx + fw / 2, yMain - fh / 2 - 26, '9');
  txt(fx + fw / 2, yMain - fh / 2 - 44, '过滤器', 13, blueT);
  txt(fx + fw / 2, yMain + fh / 2 + 20, cfg.filter, 12, blue);
  x = fx + fw + 16 * k;

  /* 10 供水主管（末端向上弯折 90°，箭头朝上；标注移至弯折段上方，避免与图框重叠） */
  var end = W - 40;
  var mw = pw(cfg.mainDN) + 3;
  var bendX = end - 120;                   // 弯折点 x
  var upH = 100 * k;                       // 弯折竖管高度（向上）
  var topY = yMain - upH;                  // 竖管顶部（箭头终点）
  g.push('<line x1="' + x + '" y1="' + yMain + '" x2="' + bendX + '" y2="' + yMain + '" stroke="' + blue + '" stroke-width="' + mw + '"/>');
  g.push('<line x1="' + bendX + '" y1="' + yMain + '" x2="' + bendX + '" y2="' + topY + '" stroke="' + blue + '" stroke-width="' + mw + '" marker-end="url(#arrow)"/>');
  var dnX = x + (end - x) / 3;
  var avX = bendX - 56;                    // 排气阀固定在弯折点左侧的水平管段上
  if (cfg.show.dn) txt(dnX, yMain + 30, '供水主管 Ø' + cfg.mainDN, 12.5, blueT);
  tag(bendX + 26, yMain - 34, '10', { r: 10 });
  txt(bendX, topY - 20, '至各轮灌区（滴灌带/滴头）', 12, blueT);
  if (cfg.airValve) {
    g.push('<line x1="' + avX + '" y1="' + yMain + '" x2="' + avX + '" y2="' + (yMain - 18) + '" stroke="' + blue + '" stroke-width="2"/>');
    g.push('<circle cx="' + avX + '" cy="' + (yMain - 24) + '" r="8" fill="#fff" stroke="' + blue + '" stroke-width=".6"/>');
    txt(avX, yMain - 42, '排气阀', 11, blueT);
    tag(avX + 34, yMain - 24, '11', { r: 9 });
  }

  /* 图例（网格排版：每行 4 项，图标垂直居中，文字统一在图标右侧） */
  if (cfg.show.legend) {
    var ly = yMain + 52 * k + 40;
    var lgW = W - 80;                       // 图例可用宽度
    var lgCols = 4, lgRowGap = 32;          // 每行列数 / 行距（紧凑，压缩 SVG 高度）
    var lgColW = lgW / lgCols;              // 列宽（等分）
    var lgY = ly + 38;                      // 第一行图标中心 y

    txt(40, ly, '图例', 14, blueT, 'start');
    g.push('<line x1="40" y1="' + (ly + 11) + '" x2="' + (W - 40) + '" y2="' + (ly + 11) + '" stroke="' + blue + '" stroke-width=".5"/>');

    var legendItems = [
      {
        name: '闸阀', draw: function (cx, cy) {
          g.push('<rect x="' + (cx - 8) + '" y="' + (cy - 8) + '" width="16" height="16" fill="#fff" stroke="' + blue + '" stroke-width=".6" transform="rotate(45 ' + cx + ' ' + cy + ')"/>');
        }
      },
      {
        name: '止回阀', draw: function (cx, cy) {
          g.push('<line x1="' + (cx - 16) + '" y1="' + cy + '" x2="' + (cx + 16) + '" y2="' + cy + '" stroke="' + blue + '" stroke-width="1.6" marker-end="url(#arrow)"/>');
        }
      },
      {
        name: '底阀+滤网', draw: function (cx, cy) {
          g.push('<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="#fff" stroke="' + blue + '" stroke-width=".6"/>');
          g.push('<line x1="' + cx + '" y1="' + (cy - 7) + '" x2="' + cx + '" y2="' + (cy + 7) + '" stroke="' + blue + '" stroke-width="1.2"/>');
          g.push('<line x1="' + (cx - 7) + '" y1="' + cy + '" x2="' + (cx + 7) + '" y2="' + cy + '" stroke="' + blue + '" stroke-width=".6" stroke-dasharray="2.5 1.8"/>');
        }
      },
      {
        name: '水泵', draw: function (cx, cy) {
          g.push('<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="#fff" stroke="' + blue + '" stroke-width=".6"/>');
          g.push('<path d="M' + cx + ' ' + (cy - 8) + ' L' + (cx + 6) + ' ' + (cy + 4) + ' L' + (cx - 6) + ' ' + (cy + 4) + ' Z" fill="' + blueF + '"/>');
        }
      },
      {
        name: '过滤器', draw: function (cx, cy) {
          g.push('<rect x="' + (cx - 13) + '" y="' + (cy - 10) + '" width="26" height="20" rx="3" fill="' + blueL + '" stroke="' + blue + '" stroke-width=".6"/>');
          g.push('<path d="M' + (cx - 8) + ' ' + (cy - 3) + ' L' + (cx - 4) + ' ' + (cy + 2) + ' L' + cx + ' ' + (cy - 3) + ' L' + (cx + 4) + ' ' + (cy + 2) + ' L' + (cx + 8) + ' ' + (cy - 3) + '" fill="none" stroke="' + blueF + '" stroke-width=".9"/>');
        }
      },
      {
        name: '施肥器', draw: function (cx, cy) {
          g.push('<circle cx="' + cx + '" cy="' + cy + '" r="11" fill="' + greenL + '" stroke="' + green + '" stroke-width=".6"/>');
          g.push('<line x1="' + (cx - 7) + '" y1="' + (cy - 9) + '" x2="' + (cx + 7) + '" y2="' + (cy - 9) + '" stroke="' + green + '" stroke-width=".8"/>');
          g.push('<line x1="' + cx + '" y1="' + (cy - 9) + '" x2="' + cx + '" y2="' + (cy - 12) + '" stroke="' + green + '" stroke-width=".8"/>');
          g.push('<path d="M' + (cx - 6) + ' ' + (cy + 1) + ' L' + (cx - 3) + ' ' + (cy - 2) + ' L' + cx + ' ' + (cy + 1) + ' L' + (cx + 3) + ' ' + (cy - 2) + ' L' + (cx + 6) + ' ' + (cy + 1) + '" fill="none" stroke="' + green + '" stroke-width=".8"/>');
          g.push('<circle cx="' + cx + '" cy="' + (cy + 6) + '" r="1.6" fill="' + green + '"/>');
        }
      },
      {
        name: '水流方向', draw: function (cx, cy) {
          g.push('<line x1="' + (cx - 14) + '" y1="' + cy + '" x2="' + (cx + 14) + '" y2="' + cy + '" stroke="' + blue + '" stroke-width="1.6" marker-end="url(#arrow)"/>');
        }
      }
    ];

    for (var li = 0; li < legendItems.length; li++) {
      var lcol = li % lgCols, lrow = Math.floor(li / lgCols);
      var lx = 40 + lcol * lgColW + 22;        // 图标中心 x（列起点 + 缩进）
      var lyy = lgY + lrow * lgRowGap;         // 图标中心 y
      legendItems[li].draw(lx, lyy);
      txt(lx + 32, lyy + 4, legendItems[li].name, 12, '#333', 'start');
    }

    var noteY = lgY + Math.ceil(legendItems.length / lgCols) * lgRowGap + 12;
    txt(40, noteY, '注：管材Ø为外径，设备DN为公称接口，两者不可直接等同；吸水管须独立核查流速、吸程及接口。吸肥管接于泵前吸水管。', 11.5, '#555', 'start');
  }

  g.push('</svg>');
  return g.join('');
}
/* ===== 主渲染：组装整张图纸 ===== */
function render() {
  collect();
  var S = svgSize(cfg), L = S.L, W = S.W, H = S.H;

  var paperW, paperH;
  if (cfg.paper === 'a4') { paperW = 297; paperH = 210; }
  else { paperW = 420; paperH = 297; }

  var sheet = document.getElementById('hmSheet');
  sheet.className = 'hm-sheet print-area ' + cfg.paper;
  sheet.style.width = paperW + 'mm';
  sheet.style.height = paperH + 'mm';

  /* 同步 @page 打印尺寸，保证打印/转 PDF 时图纸满布整页（横向） */
  var pageStyle = document.getElementById('hm-print-page');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'hm-print-page';
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = '@page { size: ' + paperW + 'mm ' + paperH + 'mm; margin: 0; }';

  /* 布局参数（mm） */
  var headTop = 11, headH = 14;
  var svgTop = headTop + headH + 3;          // 28mm
  var signH = cfg.show.sign ? 17 : 0;
  var signBottom = 10;
  var lowerH = (cfg.show.table || cfg.show.notes) ? (cfg.paper === 'a4' ? 78 : 82) : 0;
  var lowerGap = 6;
  var svgBottom = signH + signBottom + lowerH + (lowerH > 0 ? lowerGap : 0) + 4;

  var html = '';
  html += '<div class="hm-sheet-inner"></div>';
  html += '<div class="hm-sheet-inner2"></div>';
  html += '<div class="hm-head"><span class="proj">' + esc(cfg.title) + '</span>';
  html += '<span class="sub">' + esc(cfg.unit) + '</span>';
  html += '<span class="code">' + esc(cfg.figNo) + '</span></div>';
  html += '<div class="hm-svg-zone" style="top:' + svgTop + 'mm;bottom:' + svgBottom + 'mm;">' + drawSVG(cfg, W, H) + '</div>';

  if (lowerH > 0) {
    html += '<div class="hm-lower" style="bottom:' + (signH + signBottom + lowerGap) + 'mm;height:' + lowerH + 'mm;">';
    if (cfg.show.table) {
      html += '<div class="hm-tab" style="flex:1.5; padding-left:2mm;"><h3>设备表</h3>' + buildTable() + '</div>';
    }
    if (cfg.show.notes) {
      html += '<div class="hm-tab" style="flex:1.15;"><h3>设计说明</h3>' + buildNotes() + '</div>';
    }
    html += '</div>';
  }

  if (cfg.show.sign) {
    html += buildSign();
  }

  sheet.innerHTML = html;
}

/* ===== 设备表 ===== */
function buildTable() {
  var rows = [];
  rows.push(['1', '水源', cfg.source, '座', '1', '蓄水/取水设施']);
  rows.push(['2', '底阀+滤网', 'DN' + cfg.suctionDN + ' 铸铁/不锈钢', '套', '1', '吸水口防杂物']);
  rows.push(['3', '吸水管', 'DN' + cfg.suctionDN + ' PE/PVC', 'm', '\u2014', '流速 \u2264 1.5 m/s']);
  for (var i = 0; i < cfg.fertCount; i++) {
    var f = cfg.ferts[i];
    rows.push(['4-' + (i + 1), '施肥器', f.type + ' DN' + f.dn, '套', '1', '含施肥罐']);
  }
  rows.push(['5', '闸阀', 'DN' + cfg.suctionDN, '个', '1', '泵前检修用']);
  rows.push(['6', '水泵', cfg.pump + '（Q、H 按计算）', '台', '1', '配电机与控制柜']);
  rows.push(['7', '压力表', '0~1.0 MPa', '块', '1', '泵后监测']);
  if (cfg.checkValve) rows.push(['8', '止回阀', 'DN' + cfg.suctionDN, '个', '1', '防肥液/水回流']);
  rows.push(['9', '过滤器', cfg.filter + ' DN' + cfg.suctionDN, '套', '1', '按水源水质选型']);
  rows.push(['10', '供水主管', 'Ø' + cfg.mainDN + ' mm PE/PVC（外径）', 'm', '\u2014', '至各轮灌区']);
  if (cfg.airValve) rows.push(['11', '排气阀', 'DN25', '个', '1', '主管首端高点']);

  var h = '<table><thead><tr>' +
    '<th style="width:8%">编号</th>' +
    '<th class="l" style="width:22%">名称</th>' +
    '<th style="width:22%">规格/型号</th>' +
    '<th style="width:8%">单位</th>' +
    '<th style="width:8%">数量</th>' +
    '<th class="l" style="width:32%">备注</th>' +
    '</tr></thead><tbody>';
  rows.forEach(function (r) {
    h += '<tr><td>' + r[0] + '</td><td class="l">' + r[1] + '</td><td>' + r[2] +
      '</td><td>' + r[3] + '</td><td>' + r[4] + '</td><td class="l">' + r[5] + '</td></tr>';
  });
  h += '</tbody></table>';
  return h;
}

/* ===== 设计说明（详细版） ===== */
function buildNotes() {
  var notes = [
    '<b>系统组成与流程：</b>水源（蓄水池）→ 底阀+滤网 → 吸水管 →（吸肥管/施肥器接入）→ 水泵 → 过滤器 → 供水主管 → 各轮灌区（滴灌带/滴头）。本图范围为水源至供水主管段，主干分支与田间管网另图绘制。',
    '<b>流量与管径确定：</b>设计流量 Q = 灌溉面积 × 设计灌水率（或毛灌水定额 ÷ 轮灌周期 ÷ 日运行时间）。吸水管、主管流速取 1.0~1.5 m/s，管道内径 d = 1000×√(4Q/(3600πv))，Q 用 m³/h、v 用 m/s、d 用 mm。例：Q=20 m³/h、v=1.5 m/s，所需内径约 68.7 mm；管材外径须结合壁厚选取，设备接口 DN 按厂家核对，不能按流量翻倍机械升一级。',
    '<b>水泵选型：</b>流量按系统最大设计流量的 1.1 倍取；扬程 H = 净扬程 + 管路沿程/局部损失 + 过滤器损失（约 5~8 m）+ 灌水器工作压力（滴头 10~15 m）。自吸泵吸程一般 ≤ 5~6 m，水位落差超出时应改用离心泵配底阀灌水或潜水泵。',
    '<b>过滤器选型：</b>水源为塘/河水（含泥沙、藻类、悬浮物）时，建议砂石过滤器 + 叠片过滤器二级过滤；井水、清水可用叠片式或网式。过滤精度 100~130 目，出口压损 ≤ 7 m；过滤器前后设压力表，压差 &gt; 0.05 MPa 时及时反冲洗。',
    '<b>吸肥装置：</b>本图按吸肥管接于吸水管（泵前）布置，配置施肥罐与调节阀，利用泵前负压吸入肥液；亦可采用泵后旁路文丘里施肥器方案。施肥浓度控制 0.1%~0.3%，施肥完毕用清水冲洗管路 10~15 min，防止肥液结晶堵塞灌水器。',
    '<b>附属设施：</b>泵前设闸阀与底阀保证灌水；泵后设止回阀防止回流污染水源；主管首端高点设排气阀，末端设冲洗阀；冬季或停用期排空管路存水防冻。'
  ];
  var h = '<ul class="hm-notes" style="list-style:none;padding:0;margin:0;">';
  notes.forEach(function (n, i) {
    h += '<li>' + (i + 1) + '. ' + n + '</li>';
  });
  h += '</ul>';
  return h;
}

/* ===== 图签 ===== */
function buildSign() {
  return '<table class="hm-sign"><tr>' +
    '<td class="cap">设计</td><td class="cap">校核</td><td class="cap">审核</td><td class="cap">日期</td></tr>' +
    '<tr><td class="name">&nbsp;</td><td class="name">&nbsp;</td><td class="name">&nbsp;</td>' +
    '<td class="name">' + esc(cfg.date) + '</td></tr></table>';
}

/* ===== 导出 SVG ===== */
function exportSVG() {
  collect();
  var S = svgSize(cfg), W = S.W, H = S.H;
  var svg = drawSVG(cfg, W, H);
  var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = cfg.figNo + '_滴灌供水设计图.svg';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}

/* ===== 导出 PNG ===== */
function exportPNG() {
  collect();
  var S = svgSize(cfg), W = S.W, H = S.H;
  var svg = drawSVG(cfg, W, H);
  var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var img = new Image();
  img.onload = function () {
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(function (b) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = cfg.figNo + '_滴灌供水设计图.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.onerror = function () {
    URL.revokeObjectURL(url);
    alert('PNG 导出失败，请尝试导出 SVG。');
  };
  img.src = url;
}

/* ===== 模态框交互：缩放适配 / 联动 / 开关 ===== */
function hmFit() {
  var sheet = document.getElementById('hmSheet');
  var main = document.getElementById('hmMain');
  var holder = document.getElementById('hmSheetHolder');
  if (!sheet || !main || !holder) return;
  var w = sheet.offsetWidth, h = sheet.offsetHeight;
  if (!w || !h) return;
  var mw = main.clientWidth - 36, mh = main.clientHeight - 36;
  var s = Math.min(mw / w, mh / h, 1.1);
  if (s <= 0) s = 0.5;
  sheet.style.transform = 'scale(' + s + ')';
  sheet.style.transformOrigin = 'top left';
  holder.style.width = (w * s) + 'px';
  holder.style.height = (h * s) + 'px';
}

function nearestDN(v, arr) {
  var best = arr[0];
  for (var i = 0; i < arr.length; i++) { if (Math.abs(arr[i] - v) < Math.abs(best - v)) best = arr[i]; }
  return best;
}

/* 从润野计算结果联动：水泵流量/扬程/功率、主管管径；吸水管按水泵总流量同主管联动 */
function hmSyncFromRunye() {
  function txt(id) { var el = document.getElementById(id); return el ? el.textContent.trim() : ''; }
  var flow = txt('planPumpFlow'), head = txt('planPumpHead'), power = txt('planPumpPower');
  var mainTxt = txt('planMainPipe');
  var mainDN = (mainTxt.match(/(\d+)/) || [])[1];
  var hasCalc = flow && flow !== '—' && flow !== '';

  // 工程名称联动计算结果
  var parts = ['润野灌溉 — 供水首部系统图'];
  if (hasCalc) {
    if (flow) parts.push('Q ' + flow);
    if (head) parts.push('H ' + head);
    if (power) parts.push('P ' + power);
  }
  cfg.title = parts.join(' · ');

  // 管径联动
  if (mainDN) {
    var mv = parseInt(mainDN, 10);
    cfg.mainDN = nearestDN(mv, DN_OPT);
    cfg.suctionDN = nearestDN(mv, DN_OPT);
  }
  // 水泵备注：写入图签日期旁的说明已够用，这里不额外处理
  persist();
}

/* 从三级系统计算结果联动（一键生成管线图的结果栏）：
   供水主管 ← 三级「总管」（承载联合流量，首部至各轮灌区，物理同根）
   吸水管   ← 三级「总管」（泵前同样承载联合总流量，避免按单区主管导致偏小）
   Q/H/P    ← 三级「水泵流量/扬程/功率」 */
function hmSyncFromThreeLevel() {
  function txt(id) { var el = document.getElementById(id); return el ? el.textContent.trim() : ''; }
  function dnOf(v) { return (v.match(/(\d+)/) || [])[1]; }
  /* v139：与系统图同款——取「应用到图面」后的当前值（tlFigParamLines 同源），不读结果栏主数字文本 */
  var fpHm = window.tlFigParamLines ? window.tlFigParamLines(computeThreeLevel()) : null;
  var flow = fpHm ? fpHm.pump.flow : txt('tlPlanPumpFlow'), head = fpHm ? fpHm.pump.head : txt('tlPlanPumpHead'), power = fpHm ? fpHm.pump.power : txt('tlPlanPumpPower');
  var frontDN = fpHm ? String(fpHm.ods.front) : dnOf(txt('tlPlanFrontPipe')), mainDN = fpHm ? String(fpHm.ods.main) : dnOf(txt('tlPlanMainPipe'));
  /* v109b：文本自带单位（未计算时为「— m³/h」），有值判定改为不含占位符「—」 */
  var hasCalc = flow && flow.indexOf('—') < 0;

  if (hasCalc) {
    var parts = ['润野灌溉 — 供水首部系统图'];
    if (flow) parts.push('Q ' + flow);
    if (head) parts.push('H ' + head);
    if (power) parts.push('P ' + power);
    cfg.title = parts.join(' · ');
  }
  // 管径联动：三级「总管」同时决定供水主管和泵前吸水管。
  if (frontDN) {
    var fv = parseInt(frontDN, 10);
    cfg.mainDN = nearestDN(fv, DN_OPT);
    cfg.suctionDN = nearestDN(fv, DN_OPT);
  }
  persist();
  return hasCalc;
}

/* 三级系统入口：有三级计算结果则用三级数据，无则回退润野方案区联动 */


function hmCloseFn() {
  document.getElementById('headModal').style.display = 'none';
}

/* 二级系统图：打开独立页面（二级系统图.html），把润野方案计算结果（Q/H/P/主管/支管）通过 URL 参数传入 */
function openL2Head() {
  function txt(id) { var el = document.getElementById(id); return el ? el.textContent.trim() : ''; }
  var q = txt('planPumpFlow'), h = txt('planPumpHead'), p = txt('planPumpPower');
  var main = (txt('planMainPipe').match(/(\d+)/) || [])[1] || '';
  var suc = main;
  var base = encodeURI('二级系统图.html');
  var url = base + '?q=' + encodeURIComponent(q) +
            '&h=' + encodeURIComponent(h) +
            '&p=' + encodeURIComponent(p) +
            '&main=' + encodeURIComponent(main) +
            '&suc=' + encodeURIComponent(suc);
  window.open(url, '_blank');
}

/* 二级「⚙️ 生成系统图」按钮（#ppHeadGen）已按要求取消（用户 2026-09-12），
   其点击绑定 document.getElementById('ppHeadGen').addEventListener('click', openL2Head)
   与 #ppGenerate 内的 openL2Head() 自动调用同步移除；openL2Head() 函数体保留备查。 */
// 三级系统图：独立页面（三级系统图.html），由 tlOpenSystemDiagram() 全局函数打开
document.getElementById('hmClose').addEventListener('click', hmCloseFn);
document.getElementById('hmExportSVG').addEventListener('click', exportSVG);
document.getElementById('hmExportPNG').addEventListener('click', exportPNG);
document.getElementById('hmPrint').addEventListener('click', function () { window.print(); });
document.getElementById('hmLoadDefault').addEventListener('click', function () { cfg = clone(DEFAULTS); bindUI(); persist(); render(); hmFit(); });
document.getElementById('hmClearSave').addEventListener('click', function () { localStorage.removeItem('drip-cfg'); cfg = clone(DEFAULTS); bindUI(); persist(); render(); hmFit(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hmCloseFn(); });
window.addEventListener('resize', function () { if (document.getElementById('headModal').style.display !== 'none') hmFit(); });

/* 初始化（模态框隐藏状态下渲染，打开时即时可用） */
bindUI();
// 首笔渲染同样等待 native 就绪，避免隐藏预渲染走 JS 回退（数值一致，仅一致性考虑）
(function(){
  var ry = (typeof window !== 'undefined' && window.RyHydraulicNative) || null;
  var ready = (ry && ry.ready) ? ry.ready : Promise.resolve();
  Promise.resolve(ready).then(function(){ if (typeof render === 'function') render(); });
})();
})();
