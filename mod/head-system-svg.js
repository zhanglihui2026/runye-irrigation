// 首部系统图 SVG 几何与绘制核心；纯函数，仅通过命名空间提供给 inline-14。
(function (global) {
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
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
global.RyHeadSystemSvg = Object.freeze({
  layout: layout,
  svgSize: svgSize,
  drawSVG: drawSVG
});
})(window);
