
// ===== 地块库：保存/召回多个实际地块（localStorage 数组，不覆盖） =====
(function(){
  var LIB_KEY='runye_plot_library';
  window.currentPlotId=null;
  function loadLib(){ try{ var r=localStorage.getItem(LIB_KEY); return r?JSON.parse(r):[]; }catch(e){ return []; } }
  function saveLib(a){ try{ localStorage.setItem(LIB_KEY, JSON.stringify(a)); }catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function fmtDate(ts){ var d=new Date(ts); if(isNaN(d)) return ''; var p=function(n){return (n<10?'0':'')+n;}; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
  function srcLabel(s){ return s==='map'?'地图测量':(s==='area'?'图片测量':'手动'); }
  // 统一提示：优先用页内 toast(#atToast)，页面没有该容器/调用异常时兜底到原生 alert。
  // 加 try 是为了「提示失败不能中断后续流程」—— 例如 setCurrent 里提示之后还要跳转二级管路制图区。
  function toast(m){ try{ if(typeof atShowToast==='function'){ atShowToast(m); return; } }catch(e){} alert(m); }

  function renderLib(){
    var arr=loadLib();
    var list=document.getElementById('plotLibList');
    var sum=document.getElementById('plotLibSummary');
    var cnt=document.getElementById('plotLibCount');
    if(cnt) cnt.textContent=arr.length;
    if(sum){ if(!arr.length) sum.textContent='还没有保存的地块'; else { var t=arr.reduce(function(a,p){return a+(p.mu||0);},0); sum.innerHTML='已保存 <b>'+arr.length+'</b> 个 · 合计 <b>'+t.toFixed(2)+'</b> 亩'; } }
    if(!list) return;
    list.innerHTML='';
    arr.forEach(function(p){
      var item=document.createElement('div');
      item.className='at-lib-item'+(p.id===window.currentPlotId?' current':'');
      item.innerHTML='<div class="pli-main"><div class="pli-name">'+esc(p.name)+' <span class="pli-crop">'+esc(p.crop||'七彩花生')+'</span></div><div class="pli-meta">'+((p.mu!=null)?p.mu.toFixed(2):'0')+' 亩 · '+srcLabel(p.source)+' · '+fmtDate(p.ts)+'</div></div><div class="pli-actions"><button class="at-btn-action pli-btn" data-act="current">设为当前</button><button class="at-btn-action pli-btn" data-act="rename">重命名</button><button class="at-btn-action danger pli-btn" data-act="del">删除</button></div>';
      item.querySelector('[data-act="current"]').addEventListener('click',function(){ setCurrent(p.id); });
      item.querySelector('[data-act="rename"]').addEventListener('click',function(){ renamePlot(p.id); });
      item.querySelector('[data-act="del"]').addEventListener('click',function(){ delPlot(p.id); });
      list.appendChild(item);
    });
  }
  window.runyeRenderPlotLib=renderLib;   /* v161：供方案/地块恢复后刷新「当前地块」高亮 */
  // 地图实测回传消费后调用：把当前 window.measuredPolygon 作为地块落库(runye_plot_library)，
  // 并桥接到数字农业控制台·地块中心(runye_db_v1)，使「在线地图绘制」链能持久化、且地块中心可见。
  // 与 saveCurrent 共用同一套落库/桥接逻辑，plotId 稳定以支持去重（重复回传同一地块只更新不新增）。
  window.runyePersistMeasuredPlot=function(opts){
    opts=opts||{};
    var area=window.measuredArea||0;
    if(area<=0) return null;
    var arr=loadLib();
    var id=opts.plotId || ('pm'+Date.now());
    var exist=null; arr.forEach(function(x){ if(x.id===id) exist=x; });
    var name=opts.name || (exist&&exist.name) || ('地块 '+(arr.length+1));
    var plot={ id:id, name:name, mu:Math.round(area/666.67*100)/100, sqm:Math.round(area*100)/100,
      poly:(window.measuredPolygon||[]).map(function(pt){return {x:Math.round((pt.x||0)*100)/100,y:Math.round((pt.y||0)*100)/100};}),
      crop:(exist&&exist.crop)||'七彩花生', source:'map', ts:Date.now(), note:(exist&&exist.note)||'' };
    /* [map-enhance 补全 2026-09-28] 回传落库时补 polyLatLng + geo，否则地图页叠加地块
       框线因缺经纬度被 runye-map-enhance.js 跳过。基准 __runyeGeoBase 来自地图页画框
       的 GCJ-02 经纬度，反投结果与地图页 btnSavePlot 存的 polyLatLng 同坐标系。 */
    try{
      var base=window.__runyeGeoBase;
      /* [v217] measuredPolygon 自 v217 起是**垂直镜像后**的图面坐标
         （y = −(lat−refLat)·mlat，见 applyMapMeasuredArea），故反算经纬度必须取反号：
         lat = refLat − y/mlat。仍写成 `+` 会把地块南北整个翻过去 ⇒ 在线地图叠加的框线跟着翻。
         ★ 刻意**不改数据来源**（仍用 measuredPolygon）：改成读 __runyeMapFramePoly 会让
           polyLatLng 不再随旋转/镜像变化 ⇒ 既有闸门 R2「旋转后框线与基线一致」退化成恒绿
           （实测 J2 注入不再命中），属于把判据改废。这里的取舍：保住闸门有效性。
         （base 存在 ⟺ 来源是地图回传 ⟺ measuredPolygon 已镜像，故减号在此分支恒正确。） */
      if(base && isFinite(base.refLat) && isFinite(base.refLng) && window.measuredPolygon && window.measuredPolygon.length>=3){
        var R=6378137, mlat=R*Math.PI/180, cosLat=Math.cos(base.refLat*Math.PI/180);
        var pll=window.measuredPolygon.map(function(pt){
          return [ +(base.refLat - pt.y/mlat).toFixed(7), +(base.refLng + pt.x/(mlat*cosLat)).toFixed(7) ];
        });
        plot.polyLatLng = pll;
        var sl=0,sn=0; pll.forEach(function(q){ sl+=q[0]; sn+=q[1]; });
        plot.center = { lat:+(sl/pll.length).toFixed(6), lng:+(sn/pll.length).toFixed(6) };
        plot.geo = { refLat:+base.refLat.toFixed(6), refLng:+base.refLng.toFixed(6), proj:'mercatorLocal' };
      }
    }catch(ePll){}
    /* [v191] 成组地块：把各子地块环一并落库（本地米 poly + 经纬度 polyLatLng）。
       否则「设为当前 / 刷新」后只剩凸包外框，块间空隙被吞、看起来像合并。 */
    try{
      var subs=window.__runyeSubPlots;
      if(subs && subs.length){
        plot.merged=true; plot.grouped=true;
        plot.subPlots=subs.map(function(s){
          return { id:s.id, name:s.name, mu:s.mu, sqm:s.sqm, crop:s.crop,
                   poly:(s.poly||[]).map(function(q){return{x:Math.round((q.x||0)*100)/100,y:Math.round((q.y||0)*100)/100};}),
                   polyLatLng:s.polyLatLng||null };
        });
      }
    }catch(eSub){}
    if(exist){ arr=arr.map(function(x){ return x.id===id?plot:x; }); }
    else { arr.push(plot); }
    saveLib(arr); window.currentPlotId=id; renderLib();
    // 同步本页「管线绘图区」（管道规划）
    try{ if(window.measuredPolygon && window.measuredPolygon.length>=3 && typeof window.ppLoadPolygon==='function') window.ppLoadPolygon(); }catch(e){}
    try{ if(typeof window.ppGenerateDiagram==='function') window.ppGenerateDiagram({scroll:false}); }catch(e){}
    // 同步数字农业控制台·地块中心(runye_db_v1)
    try{ if(window.runyeSharePlotToDigital) window.runyeSharePlotToDigital(); }catch(e){}
    if(window.runyeBridgeWriteBack) window.runyeBridgeWriteBack(id, plot);
    /* v161：回传落库后该地块即为当前地块 → 记锚点 + 静默留存，供切页返回恢复 */
    try{ if(typeof window.runyeSetCurrentPlot==='function') window.runyeSetCurrentPlot(id); }catch(e){}
    return plot;
  };

  /* ---------- [v219 2026-10-04 用户要求] 地块库「设为当前」也要自动垂直镜像 ----------
   * 用户原话：「存入地块库的地块 点击设为当前之后，地块也要自动垂直镜像。」
   * 背景：v217 只管了「在线地图回传」那一条入口（applyMapMeasuredArea）。地块库里存的 .poly
   *       （本地米）对**地图来源**的地块而言可能是**两种口径之一**：
   *         · v217 之前落库 / 地图页自行落库（btnSavePlot）⇒ 仍是「地图口径」（北 = +y，图面上下颠倒）
   *         · v217 之后由本页落库（poly 取自 measuredPolygon）⇒ 已经是镜像后的图面口径
   *       ⇒ 若「每次设为当前都无脑翻一次」，正本页存的那些会被翻回去（负负得正）。
   *         ★ 这是本轮最容易踩的坑 —— 幂等必须**用几何判据**保证，不能靠版本号或记忆。
   * 判据：拿一个**独立于 poly 的参考 REF**（= 地图口径，来自 p.mapFramePoly 或由 polyLatLng 还原）
   *       与 poly 比一比（容差 0.5 m，覆盖台账里 poly 保留 2 位小数造成的量化误差）：
   *         poly ≈ REF      ⇒ 未镜像 ⇒ 翻一次；
   *         poly ≈ mirror(REF) ⇒ 已镜像 ⇒ 原样不动。
   *       两者都不像 ⇒ 不翻（宁可不翻，也不猜）。
   * ★ REF 若退化成 poly 自身（地块没有经纬度、只能落到 `p.poly` 兜底）⇒ 恒满足第一条 ⇒ 会误翻
   *   手画地块。所以调用方必须先判断「REF 是否独立于 poly」，退化情形一律不进本函数。
   * ★ 主环与子环必须同口径：同一个翻转决定要让 __runyeSubPlots 的每个环一起跟上，
   *   否则子地块与外框上下错位（v217 在 applyMapMeasuredArea 里就是这么配对的）。 */
  function ryOrientPlotPoly(poly, ref) {
    var NO = { pts: poly, flipped: false };
    try {
      if (!Array.isArray(poly) || poly.length < 3 || !Array.isArray(ref) || ref.length !== poly.length) return NO;
      var dSame = 0, dFlip = 0, tol = 0.5;
      for (var i = 0; i < poly.length; i++) {
        var px = +poly[i].x, py = +poly[i].y, rx = +ref[i].x, ry = +ref[i].y;
        if (!isFinite(px) || !isFinite(py) || !isFinite(rx) || !isFinite(ry)) return NO;
        dSame = Math.max(dSame, Math.abs(px - rx), Math.abs(py - ry));
        dFlip = Math.max(dFlip, Math.abs(px - rx), Math.abs(py + ry));
      }
      if (dFlip <= tol && dFlip < dSame) return NO;                                   /* 已是图面口径 */
      if (dSame <= tol) return { pts: poly.map(function (q) { return { x: +q.x, y: -(+q.y) }; }), flipped: true };
      return NO;
    } catch (e) { return NO; }
  }

  function saveCurrent(){
    var area=window.measuredArea||0;
    if(area<=0){ toast('请先测量/生成地块再保存'); return; }
    var nameInput=document.getElementById('plotNameInput');
    var arr=loadLib();
    var name=(nameInput&&nameInput.value||'').trim();
    if(!name) name='地块 '+(arr.length+1);
    var id='p'+Date.now()+Math.floor(Math.random()*1000);
    var plot={ id:id, name:name, mu:Math.round(area/666.67*100)/100, sqm:Math.round(area*100)/100, poly:(window.measuredPolygon||[]).map(function(pt){return {x:Math.round((pt.x||0)*100)/100,y:Math.round((pt.y||0)*100)/100};}), crop:'七彩花生', source:(window.measuredPolygonSource||'area'), ts:Date.now(), note:'' };
    if(window.__runyeGeoBase && window.RunyeGeo){
      plot.geo=Object.assign({},window.__runyeGeoBase);
      var frame=window.__runyeMapFramePoly;
      if(Array.isArray(frame) && frame.length===plot.poly.length) plot.mapFramePoly=frame.map(function(p){return {x:p.x,y:p.y};});
      plot.polyLatLng=RunyeGeo.polyM2ll(plot.mapFramePoly || plot.poly,plot.geo);plot.crs='GCJ-02';
    }
    arr.push(plot); saveLib(arr); window.currentPlotId=id;
    if(nameInput) nameInput.value='';
    renderLib(); toast('已保存到地块库：'+name);
    // 同步到本页「管线绘图区」（管道规划）：即时把刚画好的边界载入管线画布
    try{ if(window.measuredPolygon && window.measuredPolygon.length>=3 && typeof window.ppLoadPolygon==='function') window.ppLoadPolygon(); }catch(e){}
    try{ if(typeof window.ppGenerateDiagram==='function') window.ppGenerateDiagram({scroll:false}); }catch(e){}
    // 同步到数字农业控制台·地块中心：写 runye_db_v1（runyeBridgeWriteBack 内部处理独立/来自工作台两种来源）
    try{ if(window.runyeSharePlotToDigital) window.runyeSharePlotToDigital(); }catch(e){}
    if(window.runyeBridgeWriteBack) window.runyeBridgeWriteBack(id, plot);
    /* v161：保存地块后该地块即为当前地块 → 记锚点 + 静默留存，供切页返回恢复 */
    try{ if(typeof window.runyeSetCurrentPlot==='function') window.runyeSetCurrentPlot(id); }catch(e){}
  }
  function setCurrent(id){
    var arr=loadLib(); var p=arr.filter(function(x){return x.id===id;})[0];
    if(!p) return;
    if(p.polyLatLng && p.polyLatLng.length>=3 && window.RunyeGeo){
      if(!p.geo) p.geo=RunyeGeo.baseOfFeature(p);
      if(!Array.isArray(p.poly) || p.poly.length<3) p.poly=RunyeGeo.toCanvasPoly(p);
      if(typeof p.sqm!=='number' || !isFinite(p.sqm) || p.sqm<=0){p.sqm=Math.round(RunyeGeo.geodesicArea(p.polyLatLng));p.mu=+(p.sqm/666.67).toFixed(2);saveLib(arr);}
    }
    window.measuredArea=p.sqm||0;
    window.measuredPolygon=Array.isArray(p.poly)?p.poly:[];
    /* [map-enhance] 任务2（2026-09-26）：「设为当前」同步 geo 反投基准 —— 地图页存的地块带
       geo（refLat/refLng），带基准的地块在主程序生成管网后也能反投卫星图；手画地块无 geo →
       置 null，反投按既有逻辑静默跳过。 */
    window.__runyeGeoBase = (p.geo && typeof p.geo.refLat==='number' && typeof p.geo.refLng==='number' && isFinite(p.geo.refLat) && isFinite(p.geo.refLng)) ? p.geo : null;
    window.measuredPolygonSource=p.source || 'area';
    /* [map-enhance 2026-09-29] 有 geo 基准的地块：同时记录「地图口径」顶点（地块库里的 poly
       是回传当时的几何，未叠加二级页旋转/镜像），供旋转后反投还原方位。 */
    window.__runyeMapFramePoly = (window.__runyeGeoBase && Array.isArray(p.poly) && p.poly.length>=3)
      ? (p.mapFramePoly || (p.polyLatLng && window.RunyeGeo ? RunyeGeo.polyLL2m(p.polyLatLng,p.geo) : p.poly)).map(function(q){return {x:q.x,y:q.y};}) : null;
    window.currentPlotId=id;
    /* [v219] 上面的 __runyeMapFramePoly 就是「地图口径」参考 REF。只有 REF **独立于 p.poly**
       （来自 p.mapFramePoly 或 polyLatLng 还原）时才能用几何判据定方向；退化到 p.poly 本身
       （无经纬度的手画地块）恒等于 REF ⇒ 不翻（手画的地块本来就是图面口径）。 */
    var _v219Flip = false;
    try {
      var _refInd = !!(p.mapFramePoly || (p.polyLatLng && p.polyLatLng.length >= 3 && p.geo && window.RunyeGeo));
      if (_refInd && window.__runyeMapFramePoly && Array.isArray(window.measuredPolygon) &&
          window.__runyeMapFramePoly.length === window.measuredPolygon.length) {
        var _o = ryOrientPlotPoly(window.measuredPolygon, window.__runyeMapFramePoly);
        if (_o.flipped) { window.measuredPolygon = _o.pts; _v219Flip = true; }
      }
    } catch (e219) { }
    /* [v191] 恢复成组地块的各子环（本地米坐标，与 measuredPolygon 同坐标系）。
       无库存子环则置 null，二级页回退画单块凸包。
       ★ [v219] 主环翻了子环必须跟着翻，否则子地块相对外框上下错位。 */
    try{
      if(p && Array.isArray(p.subPlots) && p.subPlots.length){
        var _rec=[];
        p.subPlots.forEach(function(s){
          if(s && Array.isArray(s.poly) && s.poly.length>=3){
            var _ring = s.poly.map(function(q){return{x:+q.x,y:_v219Flip?-(+q.y):+q.y};});
            _rec.push({ id:s.id, name:s.name, mu:s.mu, sqm:s.sqm, crop:s.crop,
                        polyLatLng:s.polyLatLng||null,
                        poly:_ring });
          }
        });
        window.__runyeSubPlots=_rec.length?_rec:null;
      } else { window.__runyeSubPlots=null; }
    }catch(e){ window.__runyeSubPlots=null; }
    try{ if(typeof updatePlan==='function') updatePlan(); }catch(e){}
    try{ if(typeof window.ppLoadPolygon==='function') window.ppLoadPolygon(); }catch(e){}
    try{ if(typeof window.ppGenerateDiagram==='function') window.ppGenerateDiagram({scroll:false}); }catch(e){}
    try{ if(typeof window.runyeSharePlotToDigital==='function') window.runyeSharePlotToDigital(); }catch(e){}
    renderLib();
    // 2026-09-13：按用户要求去掉「已设为当前地块」提示（该提示在页面无 toast 容器时兜底为
    // 阻塞式原生 alert，需多点一次「确定」）——点击「设为当前」后直接跳转「二级管路制图区」。
    // 落点几何复用导航的 ryJumpToSection（stickyOffset() 已含吸顶栏真实高度 43px）。
    try{ if(typeof window.ryJumpToSection==='function') window.ryJumpToSection('pipePlanSection'); }catch(e){}
    /* v161：设为当前后记锚点并静默留存完整工作状态（地块 + 二级/三级划分）。
       否则整页跳到「在线地图」再切回时内存状态全丢 —— 见 ryAutoRestoreProject。 */
    try{ if(typeof window.runyeSetCurrentPlot==='function') window.runyeSetCurrentPlot(id); }catch(e){}
  }
  function renamePlot(id){
    var arr=loadLib(); var p=arr.filter(function(x){return x.id===id;})[0];
    if(!p) return;
    var n=prompt('重命名地块', p.name); if(n==null) return; n=n.trim(); if(!n) return;
    p.name=n; saveLib(arr); renderLib();
  }
  function delPlot(id){
    if(!confirm('确定删除该地块？此操作不可撤销。')) return;
    var arr=loadLib().filter(function(x){return x.id!==id;});
    saveLib(arr);
    if(window.currentPlotId===id){ window.currentPlotId=null; try{ if(window.runyeSetCurrentPlot) window.runyeSetCurrentPlot(null); }catch(e){} }
    renderLib();
  }
  var sb=document.getElementById('savePlotBtn');
  if(sb) sb.addEventListener('click', saveCurrent);
  renderLib();
})();
