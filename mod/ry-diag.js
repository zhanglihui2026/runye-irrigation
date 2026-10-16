/* [v474] 面积缩水诊断入口：地址栏 index.html#rydiag 打开，自动采集当前内存地块状态
   与地块库记录，弹层展示并支持一键复制。只读，不改任何状态。 */
(function () {
  function build() {
    function sl(p) { var a = 0, i, q; for (i = 0; i < p.length; i++) { q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a / 2); }
    function bb(p) { var a = 1e18, b = 1e18, c = -1e18, d = -1e18, i; for (i = 0; i < p.length; i++) { a = Math.min(a, p[i].x); c = Math.max(c, p[i].x); b = Math.min(b, p[i].y); d = Math.max(d, p[i].y); } return Math.round(c - a) + 'x' + Math.round(d - b); }
    var lib = []; try { lib = JSON.parse(localStorage.getItem('runye_plot_library') || '[]'); } catch (e) { }
    var rows = lib.map(function (p) {
      var ll = p.polyLatLng || [], g = 0;
      try { g = Math.round(window.RunyeGeo.geodesicArea(ll)); } catch (e) { }
      return 'id=' + p.id + ' 名=' + (p.name || '') + ' mu=' + p.mu + ' sqm=' + p.sqm + ' areaM2=' + p.areaM2
        + ' 顶点=' + ll.length + ' 环实测=' + g + ' 成组=' + (!!p.merged) + ' 子块=' + ((p.subPlots || []).length);
    });
    var L = [
      '--- 当前内存状态 ---',
      'measuredArea = ' + (window.measuredArea ? (window.measuredArea / 666.67).toFixed(2) : '0') + ' 亩（' + Math.round(window.measuredArea || 0) + ' m²）',
      'measuredPolygon 顶点数 = ' + ((window.measuredPolygon || []).length),
      'measuredPolygon 鞋带面积 = ' + Math.round(sl(window.measuredPolygon || [])) + ' m²',
      'measuredPolygon 包围盒 = ' + bb(window.measuredPolygon || []),
      'measuredPolygonSource = ' + (window.measuredPolygonSource || ''),
      'runyePlanDims = ' + JSON.stringify(window.runyePlanDims || null),
      '--- 地块库 ' + lib.length + ' 条 ---'
    ].concat(rows).join('\n');
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:999999;top:12px;left:12px;right:12px;background:#fff;border:2px solid #16a34a;border-radius:8px;padding:10px;font:12px/1.5 monospace;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.35)';
    var h = document.createElement('div'); h.style.cssText = 'font-weight:700;margin-bottom:6px;color:#14532d';
    h.textContent = '润野诊断数据（点「复制全部」后发给助手）：';
    var t = document.createElement('textarea');
    t.style.cssText = 'width:100%;height:46vh;font:12px/1.5 monospace;white-space:pre';
    t.value = L; t.readOnly = true;
    var b = document.createElement('button'); b.textContent = '复制全部';
    b.style.cssText = 'margin-top:6px;padding:6px 14px;background:#16a34a;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:13px';
    b.onclick = function () { t.select(); try { document.execCommand('copy'); b.textContent = '已复制 ✓'; } catch (e) { b.textContent = '请在框内 Ctrl+A 全选后 Ctrl+C'; } };
    var x = document.createElement('button'); x.textContent = '关闭';
    x.style.cssText = 'margin:6px 0 0 8px;padding:6px 14px;border:1px solid #999;background:#fff;border-radius:6px;cursor:pointer;font-size:13px';
    x.onclick = function () { if (d.parentNode) d.parentNode.removeChild(d); };
    d.appendChild(h); d.appendChild(t); d.appendChild(b); d.appendChild(x);
    document.body.appendChild(d);
  }
  function init() {
    /* [v476] 附带：#ryresetpwa 重置「添加桌面快捷方式」面板的关闭标记
       （runye_pwa_install_dismissed=1 ⇒ 面板永久隐藏，见 pwa.js）。 */
    if (location.hash.indexOf('ryresetpwa') >= 0) {
      try { localStorage.removeItem('runye_pwa_install_dismissed'); alert('已重置安装面板。\n请重新刷新页面（Ctrl+Shift+R），右下角安装面板会重新出现。'); } catch (e) { }
      return;
    }
    if (location.hash.indexOf('rydiag') < 0) return;
    /* 等主程序初始化/项目恢复完成后再采集 */
    setTimeout(function () { try { build(); } catch (e) { alert('诊断失败：' + e.message); } }, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
