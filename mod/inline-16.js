
(function(){
  function applyMapMeasuredArea(provided){
    try{
      var raw = provided ? JSON.stringify(provided) : (new URLSearchParams(location.search).has('partitionPreview') ? null : localStorage.getItem('runyeMeasuredArea'));
      if(!raw) return;
      var d = JSON.parse(raw);
      if(!d || !d.sqm){ localStorage.removeItem('runyeMeasuredArea'); return; }

      // 写入全局实测面积（㎡），驱动「二级管路」的计算
      window.measuredArea = d.sqm;
      window.measuredPolygonSource='map';
      window.currentPlotId=null;
      /* terrain 页只回传已落在各地块内的 RTK 高低程摘要；不回传整片点云，
         由用户在「地形高程」面板确认后才写入正式水力计算。 */
      window.__runyeImportedTerrain = d.terrainProfile && d.terrainProfile.source === 'rtk_xyz' ? d.terrainProfile : null;
      /* v161：先清跨页恢复锚点（本函数随后的 runyePersistMeasuredPlot 会按新地块写回） */
      try{ if(window.runyeSetCurrentPlot) window.runyeSetCurrentPlot(null); }catch(e){}

      // 由真实经纬度换算成本地米坐标，供 A/B 边长估算
      /* [v298 P0-3] terrain 模块回传（d.isXY）：poly/subPlots 已是 CGCS2000 平面米坐标
         （terrain 画布口径，y 向下），与主页画布同口径 ⇒ 跳过经纬度投影与 v217 镜像，
         直接入画。旧版把 {x,y} 当 [lat,lng] 解析会得到 NaN 环。 */
      var isXY = !!d.isXY || (Array.isArray(d.poly) && d.poly.length >= 3 && d.poly[0] &&
                 typeof d.poly[0] === 'object' && !Array.isArray(d.poly[0]) && ('x' in d.poly[0]));
      if(d.poly && d.poly.length >= 3 && isXY){
        window.measuredPolygon = d.poly.map(function(p){ return { x:+p.x, y:+p.y }; });
        window.__runyeGeoBase = null;
        window.__runyeMapFramePoly = null;
      } else if(d.poly && d.poly.length >= 3){
        var lats = d.poly.map(function(p){return p[0];});
        var lngs = d.poly.map(function(p){return p[1];});
        var clat = lats.reduce(function(a,b){return a+b;},0) / lats.length;
        var R = 6378137, mlat = R * Math.PI / 180, cosLat = Math.cos(clat * Math.PI / 180);
        var xs = [], ys = [];
        d.poly.forEach(function(p){
          xs.push((p[1] - lngs[0]) * mlat * cosLat);
          ys.push((p[0] - clat) * mlat);
        });
        /* [v217 2026-10-04 用户要求] 在线地图回传的地块自动**垂直镜像**一次：
           上面 ys=(lat−clat)·mlat 把「北」编成了 +y，而画布 y 轴向下 ⇒ 地图里「北在上」的
           地块到二级页是上下颠倒的（图片测量路径用屏幕像素、天然正确，只有 map 路径被翻）。
           ⇒ 供图面用的 measuredPolygon 取 −y（北 → 屏幕上方），与在线地图大体方向对应。
            ★ 只翻「供图面」的这一份：__runyeMapFramePoly 仍是地图口径（北 = +y，不翻），
              反投段 fInv 是仿射逆（det 取 abs）⇒ 反射同样成立，地图侧方位自动不变。
            ★ 幂等：本函数只在 localStorage['runyeMeasuredArea'] 存在时动作，且末尾 removeItem
              （每次「回传」恰好消费一次）；刷新/读存档走 setCurrent / ryAutoRestoreProject，
              读的都是已定向好的数据 ⇒ 不会叠加第二次。 */
        window.measuredPolygon = xs.map(function(x,i){return {x:x, y:-ys[i]};});
        /* [map-enhance 2026-09-29] 「地图口径」地块顶点：二级页旋转/镜像一律不得改动它，
           反投时以它为基准把整张图还原到地图方位（见 tlAutoGenerate 反投段）。 */
        window.__runyeMapFramePoly = xs.map(function(x,i){return {x:x, y:ys[i]};});
        window.__runyeGeoBase = { refLat: clat, refLng: lngs[0] };  // [map-enhance] network projection datum (x=first lng, y=mean lat, matches runye-geo m2ll)
      } else {
        window.__runyeGeoBase=null;
        window.measuredPolygon = [];
        window.__runyeMapFramePoly = null;
      }

      /* [v185/v189 2026-10-03] 成组地块：把各子地块环一并换算成本地米坐标存到全局。
         子地块之间可能有道路/田埂/水渠/空地隔开 —— 二级页需要各自的**原环**才能
         「分别布管、总管互连」，所以这里必须逐块换算并保留，而不是只留一个外轮廓。
         ★ v189 语义纠正：传进来的是**各子地块本身**（不是合并后的大块），
           块间空隙原样保留；换算口径与主地块严格一致（同 clat / 同首点经度原点），
           保证各子地块与主地块叠得上。 */
      try{
        if(isXY && Array.isArray(d.subPlots) && d.subPlots.length){
          /* [v298 P0-3] terrain 多环直通：子环已是米坐标，无需投影/镜像/GeoBase。
             字段口径与 v185 成组消费方一致（id/name/sqm/poly），二级管路页按块分别布管。 */
          window.__runyeGroupName = d.name || '地形模块地块';
          window.__runyeSubPlots = d.subPlots.map(function(s, si){
            var ll=Array.isArray(s.poly)?s.poly:[];
            return {
              id:s.id||('st'+si), name:s.name||('子地块'+(si+1)),
              sqm:s.sqm||0, mu:s.mu||undefined, crop:s.crop||null,
              poly: ll.map(function(q){ return { x:+q.x, y:+q.y }; })
            };
          });
        } else if(d.merged && Array.isArray(d.subPlots) && d.subPlots.length && window.__runyeGeoBase){
          var _b=window.__runyeGeoBase, _mlat=6378137*Math.PI/180, _cos=Math.cos(_b.refLat*Math.PI/180);
          /* [v194] 成组管路页要显示成组地块的名（列表里的「→ 回传」带的是 d.name） */
          window.__runyeGroupName = d.name || '成组地块';
          window.__runyeSubPlots = d.subPlots.map(function(s, si){
            var ll=s.polyLatLng||[];
            return {
              id:s.id, name:s.name||('子地块'+(si+1)), mu:s.mu, sqm:s.sqm, crop:s.crop,
              polyLatLng: ll.map(function(q){return [+q[0],+q[1]];}),
              center: s.center || null,
              /* [v217] 与主地块同一口径：y 取反（垂直镜像），否则子地块与外框上下错位 */
              poly: ll.map(function(q){
                return { x:+((q[1]-_b.refLng)*_mlat*_cos).toFixed(2), y:-(+((q[0]-_b.refLat)*_mlat).toFixed(2)) };
              })
            };
          });
        } else {
          window.__runyeSubPlots = null;
        }
      }catch(eSub){ window.__runyeSubPlots=null; }

      if(window.RyMapPartition && RyMapPartition.valid(d.partitionPlan)){
        var ctr=RyMapPartition.center(window.measuredPolygon);
        window.measuredPolygon=RyMapPartition.orient(window.measuredPolygon,d.partitionPlan.angle,ctr);
        (window.__runyeSubPlots||[]).forEach(function(p){p.poly=RyMapPartition.orient(p.poly,d.partitionPlan.angle,ctr);});
      }
      if(typeof updatePlan === 'function') updatePlan();
      // 落库 + 桥接地块中心：地图实测回传的地块持久化到 runye_plot_library，并写回 runye_db_v1(地块中心)
      // 管线绘图区由 runyePersistMeasuredPlot 一并刷新，避免回传后仅内存可见、刷新即丢
      try{
        if(typeof window.runyePersistMeasuredPlot==='function'){
          window.runyePersistMeasuredPlot({ plotId:d.plotId||null, name:d.name||null });
        } else if(window.runyeBridgeWriteBack){
          var pid=d.plotId||('pm'+Date.now());
          var fplot={ id:pid, name:d.name||'地图地块', mu:Math.round((d.sqm||0)/666.67*100)/100, sqm:d.sqm||0,
            poly:(window.measuredPolygon||[]).map(function(pt){return {x:Math.round((pt.x||0)*100)/100,y:Math.round((pt.y||0)*100)/100};}),
            crop:'七彩花生', source:'map', ts:Date.now(), note:'' };
          window.runyeBridgeWriteBack(pid, fplot);
        }
      }catch(e){ console.error('map plot persist failed', e); }
      if(window.RyMapPartition && d.partitionPlan){if(typeof ppLoadPolygon==='function')ppLoadPolygon();RyMapPartition.restore(d.partitionPlan);}
      var sec = document.getElementById('areaTool');
      if(sec) sec.scrollIntoView({behavior:'smooth', block:'start'});
      showMapBanner(d);
      localStorage.removeItem('runyeMeasuredArea');
    }catch(e){ console.error('applyMapMeasuredArea error', e); }
  }

  function showMapBanner(d){
    var sec = document.getElementById('areaTool');
    if(!sec) return;
    var old = document.getElementById('mapMeasuredBanner');
    if(old) old.parentNode.removeChild(old);
    var banner = document.createElement('div');
    banner.id = 'mapMeasuredBanner';
    banner.style.cssText = 'margin:10px 16px 0;padding:10px 14px;background:#e8f5e9;border:1px solid #a5d6a7;border-left:4px solid #2e7d32;font-size:13px;color:#1b5e20;display:flex;align-items:center;gap:12px;flex-wrap:wrap';
    /* [v200] 用户指正：页面叫「二级管路」（导航同名），不叫「二级管路」——旧编号叫法已废弃 */
    banner.innerHTML = '🗺️ <b>地图实测面积已回传：' + d.mu + ' 亩（' + d.sqm + ' ㎡）</b>，已自动填入「二级管路」参与计算。' +
      '<span style="flex:1"></span>' +
      '<button id="mapBannerClear" style="height:30px;padding:0 14px;border:1px solid #2e7d32;background:#fff;color:#2e7d32;cursor:pointer;font-size:12px;">清除回传</button>';
    sec.insertBefore(banner, sec.firstChild);
    document.getElementById('mapBannerClear').onclick = function(){
      window.measuredArea = 0;
      window.__runyeGeoBase=null;
      window.measuredPolygon = [];
      window.__runyeMapFramePoly = null;
      if(typeof clearPlanResults === 'function') clearPlanResults();
      banner.parentNode.removeChild(banner);
    };
  }

  window.runyeApplyMapPayload=applyMapMeasuredArea;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){applyMapMeasuredArea();});
  else applyMapMeasuredArea();
})();
