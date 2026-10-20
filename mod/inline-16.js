
(function(){
  function resolvePlotRef(d){
    if(!d || !d.ryPlotRef) return d;
    var ref=d.ryPlotRef;
    if(!ref || !ref.id) throw new Error('地图回传地块引用缺少 id');
    var store=window.RyPlotLibraryStore;
    if(!store||typeof store.read!=='function') throw new Error('地块库安全读取接口未加载');
    var snapshot=store.read();
    if(!snapshot||!snapshot.ok) throw new Error('地块库数据无法读取');
    var lib=snapshot.plots;
    function geometryKey(x){
      function ringKey(r){
        if(!Array.isArray(r)||r.length<3)return null;
        return r.map(function(q){
          var lat=Array.isArray(q)?Number(q[0]):Number(q&&q.lat);
          var lng=Array.isArray(q)?Number(q[1]):Number(q&&q.lng);
          return isFinite(lat)&&isFinite(lng)?[+lat.toFixed(7),+lng.toFixed(7)]:null;
        });
      }
      var rings=[];
      if(x&&x.merged){
        var set=Array.isArray(x.polyLatLngSet)?x.polyLatLngSet:[];
        var subs=Array.isArray(x.subPlots)?x.subPlots:[];
        var n=Math.max(set.length,subs.length);
        for(var i=0;i<n;i++)rings.push(ringKey(set[i]||subs[i]&&subs[i].polyLatLng));
      }else rings.push(ringKey(x&&x.polyLatLng));
      if(!rings.length||rings.some(function(r){return !r;}))return null;
      return JSON.stringify(rings);
    }
    var candidates=Array.isArray(lib)?lib.filter(function(x){return x&&String(x.id)===String(ref.id);}):[];
    if(candidates.length>1)throw new Error('地块库中存在重复编号，无法安全设为当前地块');
    if(ref.geometryKey)candidates=candidates.filter(function(x){return geometryKey(x)===ref.geometryKey;});
    else if(ref.savedAt!=null)candidates=candidates.filter(function(x){return Number(x.savedAt||x.ts)===Number(ref.savedAt);});
    var p=candidates.length===1?candidates[0]:null;
    if(!p) throw new Error('地块库中找不到地块 '+ref.id+'，请回地图重新回传');
    var ring=Array.isArray(p.polyLatLng)?p.polyLatLng:null;
    if((!ring || ring.length<3) && p.geojson){
      try{
        var g=typeof p.geojson==='string'?JSON.parse(p.geojson):p.geojson;
        var geom=g&&g.type==='Feature'?g.geometry:g;
        var coords=geom&&geom.coordinates;
        if(geom&&geom.type==='Polygon'&&coords&&coords[0]) ring=coords[0].map(function(q){return [+q[1],+q[0]];});
        else if(geom&&geom.type==='MultiPolygon'&&coords&&coords[0]&&coords[0][0]) ring=coords[0][0].map(function(q){return [+q[1],+q[0]];});
      }catch(eGeo){ throw new Error('地块 GeoJSON 格式无效'); }
    }
    var sqm=Number(p.areaM2)||Number(p.sqm)||Number(ref.areaM2)||0;
    if(!ring || ring.length<3 || !isFinite(sqm) || sqm<=0) throw new Error('地块边界或面积无效，请先在地图检查地块');
    return {plotId:p.id,name:p.name||'',sqm:sqm,mu:Number(p.mu)||+(sqm/666.67).toFixed(2),poly:ring,
      source:p.source||'map',merged:!!p.merged,grouped:!!p.grouped,subPlots:p.subPlots||[],
      polyLatLngSet:p.polyLatLngSet||null,partitionPlan:p.partitionPlan||null,
      terrainProfile:p.terrainProfile||null};
  }

  function applyMapMeasuredArea(provided){
    try{
      /* 独立地图页跳到 index.html#pipePlanSection 时，本接收器会在 DOMContentLoaded
         先切换区块；通知导航模块跳过随后同一初始 hash，避免重复重绘。 */
      var suppressInitialHashRoute = !provided && window.location && window.location.hash === '#pipePlanSection' && document.readyState !== 'complete';
      var transferStore = window.RyMeasuredAreaBridgeStore;
      if(!transferStore) throw new Error('地块回传存储服务未加载');
      var transferId = typeof provided === 'string' ? provided : null;
      var suppliedPayload = provided && typeof provided === 'object';
      var urlTransferId = !provided && typeof transferStore.currentTransferId==='function' ? transferStore.currentTransferId() : null;
      var isPartitionPreview = new URLSearchParams(location.search).has('partitionPreview');
      var raw = transferId ? transferStore.readRaw(transferId)
        : suppliedPayload ? JSON.stringify(provided)
        : (isPartitionPreview && !urlTransferId ? null : transferStore.readRaw());
      if(!raw) return false;
      var payload=JSON.parse(raw);
      var d = resolvePlotRef(payload);
      if(!d || !d.sqm){ transferStore.remove(transferId); return false; }
      if(typeof window.runyePersistMeasuredPlot!=='function') throw new Error('地块库接收接口未加载');

      // 写入全局实测面积（㎡），驱动「二级管路」的计算
      window.measuredArea = d.sqm;
      window.measuredPolygonSource='map';
      window.currentPlotId=null;
      /* terrain 页只回传已落在各地块内的 RTK 高低程摘要；不回传整片点云，
         由用户在「地形高程」面板确认后才写入正式水力计算。 */
      window.__runyeImportedTerrain = d.terrainProfile && d.terrainProfile.source === 'rtk_xyz' ? d.terrainProfile : null;
      /* 先清跨页恢复锚点，随后由当前地块接收流程写入新的工程锚点。 */
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
           ★ 幂等：本函数只消费当前 URL 所指的回传载荷，且成功后删除该编号对应的存储项
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
      // 地块引用已在库中：只更新当前工程，不把旋转后的图面坐标写回地图原始边界。
      // 旧版完整载荷仍走落库路径；两种路径都刷新管线绘图区并保存当前工程。
      // [2026-10-12 数字农业剥离] 原「持久化函数缺失时改走对端回写」的回落分支随桥接层
      //   一并删除；现在持久化函数缺失就是缺失，不再有第二套落库路径可绕。
      window.runyePersistMeasuredPlot({ plotId:d.plotId||null, name:d.name||null, preserveSource:!!payload.ryPlotRef });
      if(window.RyMapPartition && d.partitionPlan){if(typeof ppLoadPolygon==='function')ppLoadPolygon();RyMapPartition.restore(d.partitionPlan);}
      if(d.partitionPlan && d.plotId && typeof window.runyeSetCurrentPlot==='function') window.runyeSetCurrentPlot(d.plotId);
      showMapBanner(d);
      transferStore.remove(transferId);
      if(typeof window.ryJumpToSection==='function'){
        if(suppressInitialHashRoute) window.__rySkipNextLinkedSectionRoute='pipePlanSection';
        window.ryJumpToSection('pipePlanSection');
      }
      return true;
    }catch(e){
      console.error('applyMapMeasuredArea error', e);
      /* 引用失效时保留当前编号的载荷和 URL 参数供恢复，并把原因明确反馈给用户。 */
      try{ alert('地块回传未完成：'+(e&&e.message?e.message:'数据读取失败')+'。回地图重新回传后再试。'); }catch(eAlert){}
      return false;
    }
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
