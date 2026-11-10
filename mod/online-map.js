(function(){
  if(typeof L === 'undefined'){
    document.getElementById('warn').style.display='block';
    document.getElementById('warn').textContent='⚠️ Leaflet 库未能加载，请检查网络后刷新。';
    return;
  }

  /* ===== [v150 2026-09-29] 矢量渲染器防呆：切断「一个坏图层拖垮全部矢量层」=====
   * 根因（用户反复反馈「面积框与标点不吻合，一放大缩小面积框就变」）——
   *   Leaflet 1.9.4 的 Renderer 里三个循环
   *     _onZoomEnd()  : for (var id in this._layers) { this._layers[id]._project(); }
   *     _updatePaths(): for (var id in this._layers) { this._layers[id]._update();  }
   *     _reset()      : for (var id in this._layers) { this._layers[id]._reset();   }
   *   全都**没有 try/catch**。地图上所有矢量图层共享同一个 Renderer，所以：
   *   任一图层（如地块库里含 null 顶点的坏地块）抛错 ⇒ 循环中断 ⇒ 排在其后的
   *   图层不再重投影。测量框每次 refresh() 都先 removeLayer 再 addTo，永远排在
   *   _layers 末尾 ⇒ 必然是最容易被牺牲的那一个 ⇒ 只有它停在上一级缩放，
   *   缩放级差 2^k 倍：标点（marker pane，独立链路）走了，框没走。
   * 对策：把三个循环替换为「逐层独立 try/catch」，坏图层只牺牲自己并打日志。
   *   对正常数据完全等价（同一循环、同一顺序、同一调用），只多一层隔离。 */
  var ryRendPatched = false;
  function rySafeLoop(rend, method, tag) {
    var bad = 0, id, lay;
    for (id in rend._layers) {
      lay = rend._layers[id];
      try { lay[method](); }
      catch (e) {
        bad++;
        try { if (lay && lay._parts !== undefined) lay._parts = []; } catch (e2) {}   // 坏图层自己消失，不再参与绘制
      }
    }
    if (bad && window.console && console.warn) {
      console.warn('[map-measure] 矢量层 ' + tag + ' 有 ' + bad + ' 个图层异常（已逐层隔离，其它图层/测量框不受影响）。');
    }
  }
  function hardenRendererLoop() {
    if (ryRendPatched) return true;
    var proto = null;
    try { if (typeof L !== 'undefined' && L.Renderer && L.Renderer.prototype) proto = L.Renderer.prototype; } catch (e) {}
    if (!proto) {   // 兜底：直接从实例取原型，不依赖 L.Renderer 是否导出
      try { map.eachLayer(function (l) { if (!proto && l instanceof L.Path && l._renderer) proto = Object.getPrototypeOf(l._renderer); }); } catch (e) {}
    }
    if (!proto || proto.__rySafeLoop) return false;
    proto.__rySafeLoop = true;
    proto._onZoomEnd   = function () { rySafeLoop(this, '_project', 'zoomend/_project'); };
    proto._updatePaths = function () { rySafeLoop(this, '_update', 'update/_update'); };
    proto._reset       = function () {
      try { this._update(); } catch (e) {}
      try { this._updateTransform(this._center, this._zoom); } catch (e) {}
      rySafeLoop(this, '_reset', 'viewreset/_reset');
    };
    ryRendPatched = true;
    return true;
  }
  hardenRendererLoop();

  // ===== 地图初始化 =====
  // [GCJ-02 修复 2026-09-28] 高德瓦片是 GCJ-02；默认中心/定位三亚的
  // 18.2528,109.5119 是真实 WGS-84，须先转 GCJ-02 才能贴合高德影像。
  var defCenter = RunyeGeo ? RunyeGeo.wgs2gcj(18.2528, 109.5119) : { lat: 18.2528, lng: 109.5119 };
  // 数据始终存 GCJ-02；仅在 OSM 显示边界转为 WGS-84。
  var baseIdx=0, switchingBase=false;
  function toDisplay(p){var q=RunyeGeo.coordPair(p);if(baseIdx===2){var w=RunyeGeo.gcj2wgs(q[0],q[1]);return [w.lat,w.lng];}return q;}
  function fromDisplay(p){var q=RunyeGeo.coordPair(p);return baseIdx===2?RunyeGeo.wgs2gcj(q[0],q[1]):{lat:q[0],lng:q[1]};}
  function displayRing(ll){return ll.map(toDisplay);}
  var map = L.map('map', { center:[defCenter.lat, defCenter.lng], zoom:15, doubleClickZoom:false });
  /* [v961] 预热「总管参数设置」面板（挂载即 hidden，buildDom 里已有 hidden=true）：
     右缘抽屉的「总管参数」标签要在**还没点选总管**时给出「先点选一条总管」的提示；
     面板不在 DOM 里时标签只能报「面板还没准备好」，那是句废话。
     面板本体一直是懒创建的（syncTrunkPanel 在进入编辑态时才 ensure），这里只提前建壳，
     不影响选中即弹的时序（syncTrunkPanel 仍按 trunkMode/activeTrunkId 决定显隐）。 */
  setTimeout(function(){ try{ var P0=ensureTrunkPanel(); if(P0) P0.hide(); }catch(eWarm){} }, 0);
  function refreshMapSize(){
    var section=document.getElementById('onlineMapSection');
    if(section && section.classList.contains('ry-active')) setTimeout(function(){map.invalidateSize({animate:false});},60);
  }
  window.addEventListener('hashchange', refreshMapSize);
  window.addEventListener('load', refreshMapSize);
  if(window.location.hash==='#onlineMapSection') refreshMapSize();
  // 高德卫星瓦片（免Key直连，国内快）
  var gaodeSat = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    { subdomains:'1234', maxZoom:19, attribution:'© 高德地图' });
  // 高德路网标注（叠加，可选）
  var gaodeLabel = L.tileLayer('https://wprd0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
    { subdomains:'1234', maxZoom:19, opacity:0.9 });
  // OSM 街道图（备选）
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { subdomains:'abc', maxZoom:19, attribution:'© OpenStreetMap' });

  var baseLayers = { '高德卫星':gaodeSat, '高德卫星+路网':L.layerGroup([gaodeSat,gaodeLabel]), 'OSM街道':osm };
  gaodeSat.addTo(map);

  // ===== 位置持久化（2026-09-19 v60）=====
  // K_VIEW   上次视图（自动记忆）——保证「下次打开回到上次位置」
  // K_PLACES 用户显式「保存地点」的书签列表（可点击回跳、可删除）
  var K_VIEW='runye_map_view', K_PLACES='runye_map_places', K_Q='runye_map_lastq';
  function lsGet(k,d){
    try{
      if(k==='runye_plot_library'){
        var store=window.RyPlotLibraryStore;
        if(!store||typeof store.read!=='function') return d;
        var snapshot=store.read();
        return snapshot&&snapshot.ok?snapshot.plots:d;
      }
      var s=localStorage.getItem(k); return s?JSON.parse(s):d;
    }catch(e){ return d; }
  }
  /* [v820] 写失败不再静默返回 false：先让容量守卫回收一次性交接槽重试，
     仍失败则把占用 Top 8 打进控制台，便于定位是谁把本机存储撑满的。 */
  function lsSet(k,v){
    var json; try{ json=JSON.stringify(v); }catch(e){ return false; }
    try{ localStorage.setItem(k,json); return true; }catch(e){}
    try{
      if(window.RyStorageGuard&&typeof window.RyStorageGuard.write==='function'){
        if(window.RyStorageGuard.write(k,json).ok) return true;
        window.RyStorageGuard.report('地图页写入失败：'+k,8);
      }
    }catch(e2){}
    return false;
  }
  function syncBottomMapHints(){
    var message=document.getElementById('tip'), hint=document.getElementById('mapTrunkHint');
    if(!hint) return;
    if(hint.hidden){ hint.style.bottom=''; return; }
    /* #tip 的底边固定在状态栏上方；按实际换行高度抬高常驻帮助，避免两条文案相撞。 */
    var messageHeight=message&&message.textContent.trim()?message.getBoundingClientRect().height:0;
    hint.style.bottom=(messageHeight?34+messageHeight+8:50)+'px';
  }
  function tip(s){
    var el=document.getElementById('tip');
    if(!el) return;
    el.textContent=s;
    requestAnimationFrame(syncBottomMapHints);
  }
  function curView(){ var c=fromDisplay(map.getCenter()); return {lat:+c.lat.toFixed(6),lng:+c.lng.toFixed(6),zoom:map.getZoom()}; }
  function saveView(){ if(switchingBase) return; var v=curView(); v.ts=Date.now(); lsSet(K_VIEW,v); }

  // 打开时恢复上次位置（数据缺失/损坏则保持默认中心，不影响首次使用）
  (function(){
    var v=lsGet(K_VIEW,null);
    if(v && isFinite(v.lat) && isFinite(v.lng) && isFinite(v.zoom)){
      map.setView([v.lat,v.lng], Math.max(3,Math.min(19,v.zoom)));
      tip('已回到上次位置（'+v.lat.toFixed(4)+', '+v.lng.toFixed(4)+'）。');
    }
    var q=lsGet(K_Q,'');
    if(q) document.getElementById('search').value=q;
  })();
  // 视图变化即记忆（拖拽/缩放/定位都会触发 moveend）——下次打开据此恢复
  map.on('moveend', saveView);

  // 瓦片加载失败探测
  [gaodeSat,gaodeLabel,osm].forEach(function(layer){ layer.on('tileerror', function(){ document.getElementById('warn').style.display='block'; }); layer.on('tileload', function(){ document.getElementById('warn').style.display='none'; }); });

  // ===== 左侧工具栏宽度拖拽（2026-09-20）=====
  // 项目约定：没拖过不写任何变量——.side 宽度走 var(--mapSideW,250px) 回退，默认视觉逐像素不变；
  // 拖过才写内联变量 + localStorage 记忆；双击拖拽条恢复默认。拖动时 rAF 节流调 map.invalidateSize()。
  (function(){
    var side=document.querySelector('.side'), grip=document.getElementById('mapSideGrip');
    if(!side||!grip) return;
    var K_W='runye_map_side_w', MIN=180, MAX=520;
    function apply(w){
      side.style.setProperty('--mapSideW', w+'px');
      if(typeof map!=='undefined' && map && map.invalidateSize) map.invalidateSize();
    }
    var drag=null, raf=0, pendW=0;
    function frame(){ raf=0; if(drag) apply(pendW); }
    grip.addEventListener('pointerdown', function(e){
      e.preventDefault();
      drag={x:e.clientX, w:side.getBoundingClientRect().width};
      pendW=Math.round(drag.w);
      try{ grip.setPointerCapture(e.pointerId); }catch(err){}
      document.body.classList.add('side-resizing');
    });
    grip.addEventListener('pointermove', function(e){
      if(!drag) return;
      pendW=Math.max(MIN, Math.min(MAX, Math.round(drag.w + (e.clientX-drag.x))));
      if(!raf) raf=requestAnimationFrame(frame);
    });
    function endDrag(){
      if(!drag) return;
      drag=null;
      if(raf){ cancelAnimationFrame(raf); raf=0; }
      document.body.classList.remove('side-resizing');
      try{ localStorage.setItem(K_W, String(pendW)); }catch(err){}
    }
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);
    grip.addEventListener('dblclick', function(){
      side.style.removeProperty('--mapSideW');
      try{ localStorage.removeItem(K_W); }catch(err){}
      if(typeof map!=='undefined' && map && map.invalidateSize) map.invalidateSize();
    });
    // 恢复记忆宽度（有存档才写变量）
    try{
      var s=localStorage.getItem(K_W);
      if(s){ var w=parseInt(s,10); if(isFinite(w) && w>=MIN && w<=MAX) apply(w); }
    }catch(err){}
  })();

  // ===== 绘制逻辑 =====
  var drawing = false;
  var currentMapPlotId=null;
  var reservoirPlaceMode=false;
  var reservoirMarkerLayer=L.layerGroup().addTo(map);
  var reservoirMarker=null;
  /* ===== [v831] 总管绘制状态（多干线） =====
   * 旧模型是一个布尔 drawingTrunk + 一个 trunkPoints 数组，把「是否在画」和「画的是哪条」
   * 混在一起 ⇒ 想表达「已存两条、正在画第三条」根本无处安放，打断/合并也无从谈起。
   * 现在拆成：
   *   trunkMode  'idle' | 'draw'（三期再加 'edit'）
   *   trunkSaved 当前地块已保存的规范 v2（RyTrunkSchema.normalize 的结果）；null = 无总管
   *   trunkDraft 正在画的那条 {id, points, params}；id 为 null 表示「要新增一条」
   *   trunkPoints 保留旧名 = 草稿折点，撤销按钮 / 渲染 / 探针都还读它
   * drawingTrunk 这个名字**不再有变量** —— 它是 IIFE 私有的，外部读不到，
   *   仓库内 5 个写点已全部改走 setTrunkMode()，不留垫片（残留垫片只会让两套状态打架）。
   *   外部想读状态走 window.RyMapHost.trunkState()。 */
  var trunkMode = 'idle';
  var trunkSaved = null;
  /* [v993] 这份 trunkSaved 真正属于哪块地。currentMapPlotId 是「当前选中的地块」，
     两者会分叉（画完 A 的总管 → 保存了新地块 B → 当前指向 B，线还是 A 的）。
     删除判据只认它，不认 currentMapPlotId —— 否则删 A 时若当前选中 B 会漏清。 */
  var trunkOwnerPlotId=null;
  var trunkDraft = null;
  var trunkTargetPlotId=null;
  var points = [];           // [{lat,lng}]
  var markers = [];          // L.marker —— 与 points 必须始终同长同序（下标即点序）
  var poly = null;           // L.polygon 实时
  var trunkPoints = [];      // GCJ-02 [{lat,lng,z?}]；当前草稿折点
  var trunkLine = null;      // 草稿虚线
  var trunkSavedLayers = []; // 已保存干线的 polyline（不含草稿）
  var trunkClickTs = 0;      // 双击完成的判定锚点（Leaflet 双击会先发两次 click）
  var trunkClickPt = null;
  /* ===== [v833] 编辑态（三期）：选中 / 拖拐点 / 右键菜单 =====
     activeTrunkId   当前选中的干线 id（null = 未选）；只有选中才渲染拐点手柄
     activeVertexIdx 命中的拐点下标（-1 = 点在线身上，不是拐点）
     trunkActiveLine 选中线的高亮 polyline（拖动时直接改它，不整层重画）
     trunkEditLayers 拐点手柄 marker（白点蓝边）
     trunkCtxMenu    右键菜单 DOM（懒建，只建一次）
     paramsClipboard 参数剪贴板；**故意只放内存**，不落库 —— 用户复制一条线的参数
                     往往是为了贴到另一块地去，没必要为它写一条存储契约。
     ★ 不变量：activeTrunkId 必须指向 trunkSaved 里真实存在的 id。
       打断/合并/删除都会让 id 消失 ⇒ 每次写库后由 applyTrunkEdit 统一复核。 */
  var activeTrunkId = null;
  var activeVertexIdx = -1;
  var trunkActiveLine = null;
  var trunkEditLayers = [];
  var trunkCtxMenu = null;
  var paramsClipboard = null;
  /* 拖动中的预览折点（GCJ-02）。**只喂状态栏**，不参与写库、不参与命中判定：
     库里那份要等 dragend 才变，状态栏若只读库，拖动全程数字就是死的。 */
  var trunkDragPreview = null;
  /* [v834] 撤销 / 重做栈：只认 plot.trunk 这棵子树（见 mod/trunk-history.js 文件头）。
     ★ 归零时机只有两个 —— 换地块（renderMyPlots 的 .place-go）和页面重载。
       别在 setTrunkMode('idle') 里清：每次保存都会走到那儿，一清就没法撤销了。 */
  var trunkHistory = window.RyTrunkHistory
    ? window.RyTrunkHistory.create({limit:window.RyTrunkHistory.LIMIT})
    : null;
  var rubber = null;         // 橡皮筋线
  var lastAdded = null;      // [v153] 最近新增的顶点 marker；「撤销」优先撤它（无记录时等同弹队尾）
  var latlngs = function(){ return points.map(function(p){return [p.lat,p.lng];}); };

  /* ===== [v152 2026-09-29] 测量框接入「图层」面板 =====
   * 用户诉求：地图上自己画的测量框/顶点标点/面积文字，也要能一键隐藏显示
   *   （看地块叠加层、管网走向时不想被自己画的框挡）。
   * 做法：把 poly / markers / rubber 全部收进同一个 LayerGroup —— 勾选框一关 = 整组
   *   摘离地图（框、顶点、橡皮筋、面积文字一起消失），一开 = 整组放回，原样复原。
   *   数据（points）与数值一律不动，也不重建对象，所以「开关」永远是免费的。
   * 三个必须配套处理的点（漏一个就会「藏了还留在屏幕上」）：
   *   ① 面积文字是 permanent tooltip，它挂在 marker 上但属于独立的层 —— 摘组前显式
   *      unbind、放回时由 updateAreaBox() 重绑，否则文字会残留或被清一半。
   *   ② 测量标点原本与「搜索定位红标」共用 .ry-pin 类名 ⇒ 测量标点另加 ry-mpin，
   *      保证搜索结果的红标不跟着被关掉，闸门也能按 .ry-mpin 精确计数。
   *   ③ 关着的时候又开始画框会看不见落点 ⇒ addPoint 里自动把开关打开。
   * 状态随既有 runye_map_layers 一起持久化（刷新后保持）。
   * 注意：本条只管「面积测量」；紫色测距线是另一套（measureLayer），不受本开关影响。 */
  var measureGroup = L.layerGroup().addTo(map);

  /* ===== [v841] 总管独立图层组 + 独立 pane（规格五：图层顺序 / 线宽）=====
   *
   * 两个问题，一个修法：
   *   ① **图层顺序**：总管此前和面积测量框共用一个 measureGroup，而 AI 分区管网在
   *      runye-map-enhance.js 的 networkGroup 里 —— 那个组建得晚，同一 overlayPane 里
   *      DOM 顺序在后 ⇒ **总管被压在管网下面**（细管盖住粗管，越放大越明显）。
   *      Leaflet 的图层顺序只由「pane 的 z-index」和「同 pane 内的添加顺序」决定，
   *      跨组拔 DOM 顺序不可靠 ⇒ 给总管单开一个 pane（overlayPane=400，本 pane=430），
   *      总管恒在管网之上、markerPane(600) 之下（编辑手柄/捕捉点仍然盖在最上面）。
   *   ② **「测量框」开关会连带关掉总管**（同一个组的副作用）：关掉面积测量框，
   *      总管跟着消失 —— 那不是用户的意思。独立成组后两者互不影响。
   *
   * 为什么不用 `map.bringToFront()`：它只在同 pane 内改 DOM 顺序，下一次管网重绘
   * （runye-map-enhance 的 renderNetwork 每次 clearLayers 再重加）就把顺序打回去了。
   */
  var TRUNK_PANE = 'ryTrunkPane';
  if (!map.getPane(TRUNK_PANE)) {
    var trunkPaneEl = map.createPane(TRUNK_PANE);
    trunkPaneEl.style.zIndex = '430';
  }
  var trunkGroup = L.layerGroup().addTo(map);

  var measureOn = true;
  function setMeasureOn(on){
    on = !!on;
    if (on === measureOn) return;          // 幂等：状态没变就返回（同时切断「同步面板→回调→再同步」的递归）
    measureOn = on;
    if (measureOn){
      if (!map.hasLayer(measureGroup)) measureGroup.addTo(map);
      updateAreaBox(geodesicArea(points));  // 面积文字随组摘除被清掉，放回时必须重绑
    } else {
      if (areaAnchor){ try{ areaAnchor.unbindTooltip(); }catch(e){} areaAnchor = null; }
      if (map.hasLayer(measureGroup)) measureGroup.remove();
    }
    if (rymHandle && rymHandle.setLayer){ try{ rymHandle.setLayer('measure', measureOn); }catch(e){} }
  }

  function toRad(d){ return d*Math.PI/180; }
  // 球面多边形面积（平方米）
  function geodesicArea(pts){ return RunyeGeo.geodesicArea(pts); }
  // haversine 距离（米）
  function hav(a,b){
    var R=6378137, dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
    var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)*Math.sin(dLng/2);
    return 2*R*Math.asin(Math.sqrt(s));
  }
  function perimeter(pts){
    if(pts.length<2) return 0;
    var s=0; for(var i=0;i<pts.length-1;i++) s+=hav(pts[i],pts[i+1]);
    if(pts.length>2) s+=hav(pts[pts.length-1],pts[0]); // 闭合
    return s;
  }

  // ===== 实时面积框（2026-09-28 用户要求）：点击测量点后，地图上实时显示面积/周长 =====
  // 2026-09-28 二次修改：吸附到最后一个顶点标点（marker tooltip 与标记严格同步，
  // 缩放/平移/拖顶点都不漂移）。旧版独立 tooltip 挂均值中心经纬度，缩放动画中会漂移。
  // 少于 2 点不显示；markers 与 points 平行维护（撤销/清除同步 pop），重绑安全。
  var areaAnchor=null;   // 当前吸附面积框的顶点 marker
  function updateAreaBox(area){
    // 锚点未变时只更新文字、绝不 unbind/rebind：否则 permanent tooltip 每次 refresh
    // （尤其 zoomend→syncView→refresh）都会销毁重建 DOM，重触发淡入动画，缩放时面积框「闪烁/变化」。
    // 实证（_zoom_drift_test）：位置本就恒定吸附标点（dxr 摆幅≈0），问题只在重建闪烁，故改为原地更新内容。
    if(!measureOn || points.length<2 || markers.length!==points.length){
      if(areaAnchor){ areaAnchor.unbindTooltip(); areaAnchor=null; }
      return;
    }
    var muTxt = points.length>=3 ? (area/666.67).toLocaleString('zh-CN',{maximumFractionDigits:2})+' 亩' : '—';
    var html='<div class="ab-t">📐 '+muTxt+'</div>'
      +'<div class="ab-s">周长 '+perimeter(points).toLocaleString('zh-CN',{maximumFractionDigits:0})+' m · '+points.length+' 顶点</div>';
    var newAnchor=markers[markers.length-1];
    if(areaAnchor===newAnchor && areaAnchor.getTooltip()){
      areaAnchor.setTooltipContent(html);          // 标点未变：仅改文字，零闪烁
    }else{
      if(areaAnchor){ areaAnchor.unbindTooltip(); }
      areaAnchor=newAnchor;
      areaAnchor.bindTooltip(html,{permanent:true,direction:'right',offset:[10,0],className:'ry-area-tip',interactive:false,zoomAnimation:true});
    }
  }

  /* [v153 2026-09-29] 多边形绘制独立成 drawPoly(ring)：refresh() 传当前点表；
   * 加点模式下拖 ⊕ 手柄时传「临时把待插入点算进去」的 ring，做实时预览（数据不动）。
   * 加点模式下额外挂 click：贴着框线单击也能插点（见 onPolyClick）。 */
  function drawPoly(ring){
    if(poly){ measureGroup.removeLayer(poly); poly=null; }
    if(ring && ring.length>=2){
      poly = L.polygon(displayRing(ring), {color:'#ff6b00', weight:3, fillColor:'#ff8c1a', fillOpacity:0.22, className:'ry-mpoly'}).addTo(measureGroup);
      if(addMode) poly.on('click', onPolyClick);
    }
  }
  function refresh(){
    // 更新多边形
    drawPoly(points.length>=2 ? latlngs() : null);
    // 数值
    var area = geodesicArea(points);
    document.getElementById('mu').textContent = (area/666.67).toLocaleString('zh-CN',{maximumFractionDigits:2});
    document.getElementById('ha').textContent = (area/10000).toLocaleString('zh-CN',{maximumFractionDigits:3});
    document.getElementById('sq').textContent = area.toLocaleString('zh-CN',{maximumFractionDigits:0});
    document.getElementById('peri').textContent = perimeter(points).toLocaleString('zh-CN',{maximumFractionDigits:0});
    document.getElementById('pts').textContent = points.length;
    updateAreaBox(area);
  }

  /* ===== 视图同步保险（2026-09-28 修：用户报「面积框线不吸附标点，在标点外面一大圈」）=====
   * 症状（对用户截图做像素取证）：框线 8 个顶点 = 8 个标点绕缩放锚点整体放大 2.008 倍
   *   （纯缩放、无旋转、残差 ≤4.6px），而描边宽度仍是 3px（未被 CSS 缩放）
   *   ⇒ 不是样式问题，是「矢量路径坐标停在高一级缩放」：框线错、标点/面积提示框/底图都对。
   * 成因（Leaflet 1.9.4 的事件分工）：标点在 zoom/viewreset 就重定位，而矢量层要等
   *   zoomend/viewreset 才重新投影路径（Renderer._onZoomEnd → Path._project）。
   *   出现「缩放级已切换但矢量层没收到重投影」的时序，就会稳定复现这个症状。
   * 对策：视图安定后强制 ①矢量层整体重投影 + 容器 transform 归位 ②标点按当前缩放重定位
   *   ③重建多边形并重绑面积框。全程走 Leaflet 自己走的同一条路（renderer._reset），
   *   不引入新依赖、不改数据、不改数值。 */
  var viewSyncing=false, syncRetry=0;
  function syncView(){
    /* [v150 2026-09-29 重写] 旧版三处缺陷，逐一改对：
     *  ① `|| map._animatingZoom` 是「静默放弃」：恰在动画中触发就直接 return 且
     *     永不重试，等于这次同步被丢掉 ⇒ 改为「不打断动画，但补一次」（限次防死循环）。
     *  ② 用 rend._reset() 一把梭：它内部同样是「无 try/catch 的整轮循环」，
     *     任一坏图层抛错就整段跳过，而外层 catch(e){} 把异常静默吞掉 ——
     *     于是连后面的 refresh() 都没跑（这正是 2026-09-28 那次「修了没用」的原因）。
     *     ⇒ 改为**逐图层独立 try/catch** 重投影，坏图层只牺牲自己。
     *  ③ 异常不再静默：全部记进数组并 console.warn，杜绝「改了跟没改一样」。
     *  ④ 不再每次 zoomend 都 refresh() 重建测量框（那会让它永远排在 renderer
     *     _layers 末尾，成为最容易被牺牲的图层）；只在它真的坏了才重建。 */
    if(viewSyncing || switchingBase) return;
    if(map._animatingZoom){                                     // 缩放动画未结束：等它结束再补（最多 20 次≈1.6s）
      if(syncRetry++ < 20) setTimeout(syncView, 80);
      return;
    }
    syncRetry=0;
    viewSyncing=true;
    hardenRendererLoop();                                       // 兜底：实例存在后确保原型已加固
    var errs=[];
    try{
      // ① renderer 容器：尺寸/viewBox/transform 归位（先做，后面的 _update/_project 依赖 _bounds）
      var rends=[], seen=[];
      map.eachLayer(function(l){
        try{
          if(l instanceof L.Path && l._renderer && seen.indexOf(l._renderer)<0){ seen.push(l._renderer); rends.push(l._renderer); }
        }catch(e){}
      });
      for(var r=0;r<rends.length;r++){
        try{ rends[r]._update(); }catch(e){ errs.push('renderer._update: '+((e&&e.message)||e)); }
        try{ rends[r]._updateTransform(rends[r]._center, rends[r]._zoom); }catch(e){ errs.push('renderer._updateTransform: '+((e&&e.message)||e)); }
      }
      // ② 每个矢量层各自重投影（含地块叠加层）；坏图层只跳过自己，绝不连累测量框
      var polyBad=false;
      map.eachLayer(function(l){
        if(!(l instanceof L.Path)) return;
        try{ l._project(); }
        catch(e){ errs.push('path._project: '+((e&&e.message)||e)); if(l===poly) polyBad=true; return; }
        try{ l._update(); }
        catch(e){ errs.push('path._update: '+((e&&e.message)||e)); if(l===poly) polyBad=true; }
      });
      // ③ 标点按当前缩放重定位（marker pane 独立链路，正常本就正确，这里只兜底）
      for(var i=0;i<markers.length;i++){
        if(points[i]){ try{ markers[i].setLatLng(toDisplay(points[i])); }catch(e){ errs.push('marker.setLatLng: '+((e&&e.message)||e)); } }
      }
      // ④ 测量框自检：只有它缺失/没投影出来/本轮投影失败，才重建
      if(points.length>=2 && (polyBad || !poly || !poly._parts)) refresh();
    }catch(e){ errs.push('syncView: '+((e&&e.message)||e)); }
    viewSyncing=false;
    if(errs.length && window.console && console.warn){
      console.warn('[map-measure] syncView 捕获 '+errs.length+' 项异常（已逐层隔离，测量框不受影响）：', errs);
    }
  }
  map.on('zoomend viewreset resize', syncView);

  /* 顶点标识（2026-09-15 用户要求）：默认大头针太大，缩小到 60%（15×25），样式同默认蓝针 */
  function pinIcon(){
    return L.divIcon({
      className:'ry-pin ry-mpin',
      html:'<svg width="15" height="25" viewBox="0 0 25 41"><path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#2a81cb" stroke="#fff" stroke-width="1.5"/><circle cx="12.5" cy="12.5" r="4" fill="#fff"/></svg>',
      iconSize:[15,25],iconAnchor:[7,24]
    });
  }

  /* ===== [v153 2026-09-29] 「➕ 加点」：画完之后仍能在框线上增加标点，把地块贴得更准 =====
   * 用户诉求（截图：画好的橙色框 + 「189.49 亩 · 17 顶点」）：
   *   「地图绘制的框线 要可以增加标点，这样我可以更精准的得到地块。」
   * 现状：画完再点「开始画框」，新点只能**接在队尾** ⇒ 框线立刻拐出一个尖角，
   *   对「把某条边贴准田埂」毫无帮助。
   * 做法（两条入口，都只动点表、不动别的）：
   *   ① 每条边中点挂一个橙色 ⊕ 手柄。它是 marker（marker-pane），因此**天然不会**被
   *      地块/管网那些 interactive path 抢走点击 —— v150 实测 overlay path 命中后不再把
   *      click 补给 map，拿 path 当手柄会时灵时不灵。把 ⊕ 拖到真实边界松手 ⇒ 就在这条边上
   *      插进一个顶点，并直接成为可继续拖动的普通标点。
   *   ② 贴着框线（≤ EDGE_TOL px）单击 ⇒ 先吸附到最近边上的垂足再插点，框线不会被点歪。
   * 配套必修：原 addPoint 的 drag 处理器把下标 idx **闭包写死**，一旦在中间插点，
   *   其后所有标点的下标全部错位 —— 拖动就会改到别的点、把框线搅乱。
   *   这里改成运行时用 markers.indexOf(m) 现取，插入/撤销都不再错位。
   * 类名约定：顶点标点 = .ry-mpin（既有闸门按它计数）；中点手柄 = .ry-mid（互不污染）。 */
  var addMode=false;          // 「加点」模式开关
  var midHandles=[];          // 每边中点的 ⊕ 手柄 marker（只在 addMode 下存在）
  var EDGE_TOL=14;            // 判定「贴着框线单击」的像素容差

  /* 中点手柄图标：白底橙圈 ⊕；锚点居中（不像顶点针那样靠下尖端） */
  function midIcon(){
    return L.divIcon({
      className:'ry-pin ry-mid',
      html:'<svg width="18" height="18" viewBox="0 0 18 18">'
         + '<circle cx="9" cy="9" r="6.5" fill="#ffffff" fill-opacity="0.92" stroke="#ff6b00" stroke-width="2"/>'
         + '<path d="M9 5.6V12.4M5.6 9H12.4" stroke="#ff6b00" stroke-width="1.8" stroke-linecap="round"/>'
         + '</svg>',
      iconSize:[18,18], iconAnchor:[9,9]
    });
  }

  /* 顶点 marker 的拖动绑定：下标**运行时现取**（插点/撤销之后仍指向正确的点） */
  function bindVertexDrag(m){
    m.on('dragstart', function(){ clearMidHandles(); });   // 拖顶点期间手柄位置必然过期，先撤掉
    m.on('drag', function(e){
      var i=markers.indexOf(m);
      if(i<0) return;
      var ll=fromDisplay(e.target.getLatLng());
      points[i]={lat:ll.lat,lng:ll.lng};
      if(rubber) measureGroup.removeLayer(rubber);
      refresh();
    });
    m.on('dragend', function(){ buildMidHandles(); });     // 松手后按新形位重建手柄
    return m;
  }

  /* 在 points / markers 的 idx 位置**同步**插入一个顶点（idx 越界则追加到队尾）。
   * 两个数组必须始终同长同序 —— updateAreaBox 里就有 markers.length!==points.length 的守卫。 */
  function addPointAt(idx,lat,lng){
    if(!measureOn) setMeasureOn(true);   // 框关着还画就看不见落点：绘制即自动显示
    var n=points.length;
    if(!(idx>=0) || idx>n) idx=n;
    points.splice(idx,0,{lat:lat,lng:lng});
    var m=bindVertexDrag(L.marker(toDisplay([lat,lng]),{draggable:true,icon:pinIcon(),keyboard:false}));
    m.addTo(measureGroup);
    markers.splice(idx,0,m);
    lastAdded=m;
    refresh();
    return idx;
  }
  function addPoint(lat,lng){ return addPointAt(points.length, lat, lng); }   // 旧行为：追加到队尾

  /* ---- 中点 ⊕ 手柄 ---- */
  function clearMidHandles(keep){
    var remain=[];
    for(var i=0;i<midHandles.length;i++){
      var h=midHandles[i];
      if(h===keep){ remain.push(h); continue; }   // 正在拖的那个绝不能从地图上摘掉（会打断 Leaflet 拖拽）
      try{ if(map.hasLayer(h)) measureGroup.removeLayer(h); }catch(e){}
    }
    midHandles=remain;
  }
  function buildMidHandles(){
    clearMidHandles();
    if(!addMode || points.length<2) return;       // 不足 2 点没有「边」，无从插点
    for(var i=0;i<points.length;i++){
      if(points.length===2 && i===1) break;       // 两点时首尾是同一段，只给一个手柄
      midHandles.push(makeMidHandle(i));
    }
  }
  function makeMidHandle(edgeIdx){
    var a=points[edgeIdx], b=points[(edgeIdx+1)%points.length];
    var h=L.marker(toDisplay([(a.lat+b.lat)/2,(a.lng+b.lng)/2]),
      {draggable:true, icon:midIcon(), keyboard:false, zIndexOffset:800});
    h._ryEdge=edgeIdx;
    h.bindTooltip('拖动我 → 在此边增加标点',{direction:'top',offset:[0,-14]});
    // 拖动中实时预览：把该边按「已在此处插了一点」重绘框线（points 不动，纯预览）
    h.on('drag', function(e){
      var p=fromDisplay(e.target.getLatLng());
      if(points.length>=2){
        var ring=points.slice();
        ring.splice(Math.min(h._ryEdge+1, ring.length), 0, {lat:p.lat,lng:p.lng});
        drawPoly(ring.map(function(q){ return [q.lat,q.lng]; }));
      }
    });
    h.on('dragend', function(e){ commitMidHandle(h, e.target.getLatLng()); });
    h.on('click', function(e){ commitMidHandle(h, e.target.getLatLng()); });   // 不拖、点一下也插点
    h.addTo(measureGroup);
    return h;
  }
  /* 把中点手柄「转正」为正式顶点：插点 + 换标准顶点针 + 重建手柄。
   * 注意**不要复用这个 marker**：Leaflet 的 MarkerDrag 把拖动监听绑在创建时的 icon 元素上，
   * setIcon() 会换掉该元素 ⇒ 复用会让新顶点再也拖不动。这里直接新建一个标准顶点 marker。 */
  function commitMidHandle(h, latlng){
    if(!latlng || !isFinite(latlng.lat) || !isFinite(latlng.lng)) return;
    if(!(h._ryEdge>=0)) return;                   // 已提交过（dragend 与 click 可能连着触发）⇒ 防重复插点
    var e=h._ryEdge, n=points.length;
    if(n<2) return;
    var at=Math.min(e+1, n);                      // 首尾那条边（e=n-1）插到队尾，环序不变
    var canonical=fromDisplay(latlng);
    var lat=canonical.lat, lng=canonical.lng;
    h._ryEdge=null;
    midHandles=midHandles.filter(function(x){ return x!==h; });   // 先把自己从手柄集合摘掉
    clearMidHandles();                                            // 其余手柄的边号已失效，全部撤掉
    try{ if(map.hasLayer(h)) measureGroup.removeLayer(h); }catch(err){}
    addPointAt(at, lat, lng);
    buildMidHandles();                                            // 新裂成的两条边重新给出手柄
    tip('已在框线上增加标点（共 '+points.length+' 个顶点）；继续拖动它微调，或再拖别的 ⊕。');
  }
  /* 找离点击处最近的边，返回该边上的垂足（吸附用，避免把框线点歪） */
  function nearestEdgeSnap(latlng){
    var n=points.length; if(n<2) return null;
    var p=map.latLngToContainerPoint(latlng), best=null;
    for(var i=0;i<n;i++){
      var a=map.latLngToContainerPoint(toDisplay(points[i]));
      var b=map.latLngToContainerPoint(toDisplay(points[(i+1)%n]));
      var vx=b.x-a.x, vy=b.y-a.y, l2=vx*vx+vy*vy;
      var t=l2>0 ? ((p.x-a.x)*vx+(p.y-a.y)*vy)/l2 : 0;
      if(t<0) t=0; else if(t>1) t=1;
      var qx=a.x+vx*t, qy=a.y+vy*t;
      var d=Math.sqrt((p.x-qx)*(p.x-qx)+(p.y-qy)*(p.y-qy));
      if(!best || d<best.d) best={d:d, edge:i, x:qx, y:qy};
    }
    if(!best || best.d>EDGE_TOL) return null;      // 离框线太远不算，避免误加点
    var ll=fromDisplay(map.containerPointToLatLng([best.x,best.y]));
    return { edge:best.edge, lat:ll.lat, lng:ll.lng };
  }
  /* 加点模式下「贴着框线单击」⇒ 吸附垂足后插点 */
  function onPolyClick(e){
    if(!addMode) return;
    var sn=nearestEdgeSnap(e.latlng);
    if(!sn){ tip('请贴着框线单击（或拖动线上的 ⊕ 手柄）来增加标点。'); return; }
    addPointAt(sn.edge+1, sn.lat, sn.lng);
    buildMidHandles();
    tip('已在框线上增加标点（共 '+points.length+' 个顶点）；可拖动它微调。');
  }
  function setAddMode(on){
    on = !!on && points.length>=2;                 // 少于 2 点没有边，加点无从谈起
    if(on===addMode){ if(on) buildMidHandles(); return; }   // 幂等
    if(on&&reservoirPlaceMode)setReservoirPlaceMode(false);
    addMode=on;
    var b=document.getElementById('btnAddPt');
    if(b){ b.classList.toggle('btn-on',addMode); b.setAttribute('aria-pressed',addMode?'true':'false'); setBtnLabel(b, addMode ? '加点中…' : '加点'); }
    if(addMode){
      if(drawing) setDrawing(false);               // 与「画框」互斥
      if(measuring) finishMeasure();               // 与「测距」互斥
      /* [v833] 与总管编辑互斥：编辑态的拐点手柄会盖在框线边上，两套手柄同时活着必然抢鼠标。 */
      if(trunkMode!=='idle') setTrunkMode('idle');
      buildMidHandles();
      tip('加点模式：把框线上的 ⊕ 手柄拖到地块真实边界处松手即增加标点；也可贴着框线单击。再点「加点」退出。');
    }else{
      clearMidHandles();
      tip('已退出加点模式。');
    }
  }

  map.on('click', function(e){
    if(reservoirPlaceMode){
      var sourcePoint=fromDisplay(e.latlng);
      sourcePoint={lat:+sourcePoint.lat,lng:+sourcePoint.lng};
      var sourceSnap=snapApi();
      if(snapOn&&sourceSnap){var sourceHit=sourceSnap.nearest(sourcePoint);if(sourceHit)sourcePoint={lat:sourceHit.lat,lng:sourceHit.lng};}
      if(saveWaterSource(sourcePoint)){
        setReservoirPlaceMode(false);
        tip('蓄水池已保存；拖动水池图标可调整位置，开启捕捉时会吸附到附近节点。');
      }
      return;
    }
    if(trunkMode==='draw'){
      /* Leaflet 的双击会先派发两次 click、再派发 dblclick。若只在 dblclick 里收线，
         那两次 click 已经各塞了一个点（位置几乎重合）⇒ 收线后白白多出两个点。
         所以在这里用「时间 + 屏幕距离」认出双击的第二下，直接收线。 */
      var now=Date.now(), cp=e.containerPoint;
      if(now-trunkClickTs<320 && trunkClickPt && cp.distanceTo(trunkClickPt)<8){
        trunkClickTs=0; trunkClickPt=null;
        commitTrunkDraft();
        return;
      }
      trunkClickTs=now; trunkClickPt=cp;
      var trunkPoint=fromDisplay(e.latlng);
      trunkPoint={lat:+trunkPoint.lat,lng:+trunkPoint.lng};
      var shiftOn=!!(e.originalEvent && e.originalEvent.shiftKey);
      trunkPoint=trunkSnapPoint(trunkPoint, shiftOn);
      trunkPoints.push(trunkPoint);
      renderTrunkDraft();
      updateTrunkRubber(toDisplay(trunkPoint)); /* [v852] 落点后虚线收缩到新末点（长度 0），随鼠标再长出来 */
      return;
    }
    if(!drawing) return;
    var p=fromDisplay(e.latlng);
    addPoint(p.lat, p.lng);
  });
  /* Shift 正交：在「水平」与「垂直」两条轴里取更接近鼠标实际方向的那条。
     经度差要乘 cos(lat) 才能和纬度差直接比较（否则高纬度地区会系统性地偏向水平）。 */
  function orthoPoint(prev, cur){
    if(!prev || !cur) return cur;
    var cos=Math.cos(prev.lat*Math.PI/180) || 1;
    var dLng=Math.abs(cur.lng-prev.lng)*cos;
    var dLat=Math.abs(cur.lat-prev.lat);
    return dLng>=dLat ? {lat:prev.lat,lng:cur.lng} : {lat:cur.lat,lng:prev.lng};
  }
  /* [v852] 落点/预览共用一个换算：Shift 优先于捕捉（v832 语义原样保留）——
     按住 Shift 是**显式**声明"我要正交"，这时再去吸附会把点拽离轴线，
     用户看到的就是"正交没生效"。所以两者互斥，Shift 期间不捕捉。
     click（真落点）与 mousemove（橡皮筋预览）必须走同一个函数：
     两边各写一份迟早漂移——预览吸到了、落点没吸上（或反过来）是最迷惑的一种 bug。 */
  function trunkSnapPoint(cur, shiftOn){
    if(shiftOn && trunkPoints.length){
      return orthoPoint(trunkPoints[trunkPoints.length-1], cur);
    }
    if(snapOn){
      var _snap=snapApi(), hit=_snap?_snap.nearest(cur):null;
      if(hit) return {lat:hit.lat,lng:hit.lng};
    }
    return cur;
  }
  /* [v852 用户反馈] 橡皮筋虚线：点下第一个点后，线跟着鼠标走（虚线、更细更淡），
     点击第二个点才真正落线。只挂 trunkGroup（TRUNK_PANE、interactive:false）——
     关「测量框」不连坐，也不会吃地图点击。 */
  var trunkRubber=null;
  function removeTrunkRubber(){
    if(trunkRubber && map.hasLayer(trunkRubber)) trunkGroup.removeLayer(trunkRubber);
    trunkRubber=null;
  }
  function updateTrunkRubber(cursorDisp){
    removeTrunkRubber();
    if(trunkMode!=='draw' || !trunkPoints.length || !cursorDisp) return;
    var last=toDisplay(trunkPoints[trunkPoints.length-1]);
    trunkRubber=L.polyline([last,cursorDisp],{
      color:TRUNK_STYLE.draft.color, weight:2, opacity:.65,
      dashArray:'4,7', pane:TRUNK_PANE, interactive:false
    }).addTo(trunkGroup);
  }
  /* 同一套读点口径（[lat,lng] / [lat,lng,z] / {lat,lng}）统一走 schema 模块，别在这里重写分支。 */
  function readTrunkPoint(q){
    var S=window.RyTrunkSchema;
    return S&&S.readPoint?S.readPoint(q):null;
  }
  function loadSavedTrunkFor(plot){
    var S=window.RyTrunkSchema;
    if(!S||!plot) return null;
    if(plot.merged||plot.grouped||plot.mergedInto) return null;
    return S.normalize(plot.trunk);
  }
  /* [v841] 总管线型（规格五「图层顺序 / 线宽：总管粗深蓝」）。
     深蓝取 #1e3a8a —— 与 DXF 的 ZG_TRUNK 图层同一个色值，图纸与地图对得上；
     比原来的深灰 #475569 在卫星图上结实得多（深灰跟田埂、道路几乎同色）。
     主次只靠**粗细**分开（6 / 4），不用两套颜色：同一根总管换条线就换个色，
     用户会以为是两种东西。选中用亮蓝加粗（编辑态需要"哪根被选中"一眼可辨）。
     草稿仍留紫色：它**还不是总管**（没保存），与深蓝实线区分开才不会误以为已完成。 */
  var TRUNK_STYLE = {
    main:   { color: '#1e3a8a', weight: 6, opacity: 1 },
    sub:    { color: '#1e3a8a', weight: 4, opacity: 0.75 },
    active: { color: '#2563eb', weight: 7, opacity: 1 },
    draft:  { color: '#7c3aed', weight: 6, opacity: 0.95 }
  };
  function trunkLineStyle(entry, isActive){
    if(isActive) return TRUNK_STYLE.active;
    return entry && entry.main ? TRUNK_STYLE.main : TRUNK_STYLE.sub;
  }
  function renderTrunkDraft(){
    if(trunkLine && map.hasLayer(trunkLine)) trunkGroup.removeLayer(trunkLine);
    trunkLine=null;
    trunkSavedLayers.forEach(function(l){ if(l && map.hasLayer(l)) trunkGroup.removeLayer(l); });
    trunkSavedLayers=[];
    trunkActiveLine=null;
    /* 已保存的干线：主干粗深蓝、次干细深蓝（只差粗细，不差颜色）。
       interactive:false 很重要：否则这些线会吃掉地图点击，无法在上面继续加点。
       三期例外：edit 态另加一条**透明加宽命中线**（weight 16 / opacity 0）专门接点击。
       为什么不让可见线自己 interactive —— idle 态下它会挡住地块点选和右键"回传"弹窗，
       那是现役功能，不能为了编辑手感把它压掉。 */
    if(trunkSaved && trunkSaved.trunks){
      trunkSaved.trunks.forEach(function(entry){
        var pts=(entry.points||[]).map(function(q){
          var rd=readTrunkPoint(q);
          return rd?toDisplay({lat:rd.lat,lng:rd.lng}):null;
        }).filter(function(q){return !!q;});
        if(pts.length<2) return;
        var isActive=trunkMode==='edit' && activeTrunkId!==null && String(entry.id)===String(activeTrunkId);
        var st=trunkLineStyle(entry,isActive);
        var line=L.polyline(pts,{
          color:st.color, weight:st.weight, opacity:st.opacity,
          pane:TRUNK_PANE,
          interactive:false
        }).addTo(trunkGroup);
        if(isActive) trunkActiveLine=line;
        trunkSavedLayers.push(line);
        if(trunkMode==='edit'){
          var hit=L.polyline(pts,{color:'#2563eb',weight:16,opacity:0,interactive:true,pane:TRUNK_PANE,className:'ry-trunk-hit'}).addTo(trunkGroup);
          hit.on('click',function(ev){
            if(ev&&ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
            selectTrunk(entry.id);
          });
          trunkSavedLayers.push(hit);
        }
      });
    }
    /* 草稿：紫色虚线（绘制态）／紫事实线（只读显示态） */
    if(trunkPoints.length){
      trunkLine=L.polyline(trunkPoints.map(toDisplay),{
        color:TRUNK_STYLE.draft.color, weight:TRUNK_STYLE.draft.weight,
        opacity:TRUNK_STYLE.draft.opacity,
        dashArray:trunkMode==='draw'?'8,5':null, pane:TRUNK_PANE, interactive:false
      }).addTo(trunkGroup);
    }
    /* [v838] 水源/三通标记画在线的上面：它是"这条线的用途"，比线本身更需要被看见。 */
    renderTrunkNodes();
  }
  /* ===== [v833] 唯一写库口 =====
     commitTrunkDraft / 拖拐点 / 打断 / 合并 / 删除 / 粘贴参数 —— 全部走 commitTrunks。
     为什么非抽不可：旧版把「拼 entry」和「写库 + revision 冲突处理」揉在 commitTrunkDraft 里，
     三期每加一个编辑动作就要把后面那 20 行复制一遍。复制出来的分支必然有人抄漏 revision 校验，
     而那种错是**静默**的（别的标签页刚存过地块，这一笔就覆盖掉了），事后根本查不出来。

     mutator(next, ctx) 直接在深拷贝上改，返回 {ok:true, trunk} 或 {ok:false, error}。
     ★ trunks 空数组存不进去 —— RyTrunkSchema.normalize/validate 都要求非空
       （normalize 见空数组直接返回 null）。所以「删掉最后一条」统一落成 trunk=null，
       也就是「这块地没有总管」，读取方本来就按 null 处理。 */
  function resolveTrunkTarget(){
    var plotId=String(trunkTargetPlotId||currentMapPlotId||'');
    if(!plotId) return {ok:false,error:'请先选中并保存一个地块，再编辑该地块总管。'};
    var store=window.RyPlotLibraryStore;
    var snapshot=store&&typeof store.read==='function'?store.read():null;
    if(!snapshot||!snapshot.ok) return {ok:false,error:'地块库读取失败，总管未保存。'};
    var matches=(snapshot.plots||[]).filter(function(p){return p&&String(p.id)===plotId;});
    if(matches.length!==1) return {ok:false,error:'当前地块编号不唯一或已删除，请重新选择地块。'};
    if(matches[0].merged||matches[0].grouped||matches[0].mergedInto)
      return {ok:false,error:'成组地块的总管由多地块规划单独管理，请到多地块规划中编辑。'};
    return {ok:true,plotId:plotId,snapshot:snapshot,plot:matches[0]};
  }

  function commitTrunks(mutator, opts){
    opts=opts||{};
    var S=window.RyTrunkSchema;
    if(!S){tip('总管数据模块未加载，无法保存；请刷新页面后重试。');return {ok:false,error:'no_schema'};}
    var ctx=resolveTrunkTarget();
    if(!ctx.ok){ if(!opts.silent) tip(ctx.error); return {ok:false,error:ctx.error}; }

    var next=S.normalize(ctx.plot.trunk) ||
      {schema:S.VERSION,source:'map',coordinateSystem:'GCJ-02',revision:0,trunks:[]};
    next=JSON.parse(JSON.stringify(next));

    var r;
    try{ r=mutator(next,{plotId:ctx.plotId,schema:S,plot:ctx.plot}); }
    catch(err){ r={ok:false,error:'编辑失败：'+((err&&err.message)||String(err))}; }
    if(!r||!r.ok){
      var m1=(r&&r.error)||'编辑未生效';
      if(!opts.silent) tip(m1);
      return {ok:false,error:m1};
    }

    /* ★ 不能用 `r.trunk || next`：撤销回"没有总管"时 mutator 返回 trunk:null，
       逻辑或会把它换成 next（当前状态）⇒ 撤销看起来"没生效"，且库里仍是新的。
       所以按"有没有这个键"取值。 */
    var out=Object.prototype.hasOwnProperty.call(r,'trunk')?r.trunk:next;
    var empty=!out||!Array.isArray(out.trunks)||!out.trunks.length;
    if(!empty){
      /* main 丢了就顺延给第一条：整块地"没有主干"会让下游施工图直接没有总管。 */
      if(!out.trunks.some(function(t){return t.main===true;})) out.trunks[0].main=true;
      var chk=S.validate(out);
      if(!chk.ok){
        var m2='总管数据校验未通过：'+chk.errors.join('；');
        if(!opts.silent) tip(m2);
        return {ok:false,error:m2};
      }
      /* ★ revision 必须从**库里当前那份**往上加，不能用 out.revision 加。
         撤销/重做送进来的是旧快照，它自带的 revision 是当时的号（比如 3），
         用 `out.revision+1` 会算出 4 —— 正好等于撤销前的号，库里出现
         "revision 没变但内容变了"。下游（水力校验 / 施工图快照）按 revision 配对，
         看到号没变就会继续用旧快照，属于最难查的那类静默故障。 */
      out.revision=(Number(ctx.plot.trunk&&ctx.plot.trunk.revision)||0)+1;
    }

    var pid=ctx.plotId, payload=empty?null:out;
    /* [v834] 撤销栈要的是**写库前**的真实值：它既当基线，也用来发现"栈顶和现实对不上"
       （别的标签页改过 / 切了地块）。放在这里取，是因为这是唯一看得到 before 的地方。 */
    var beforeRaw=ctx.plot.trunk==null?null:JSON.parse(JSON.stringify(ctx.plot.trunk));
    var nextPlots=ctx.snapshot.plots.map(function(p){
      if(String(p.id)!==pid) return p;
      var copy=JSON.parse(JSON.stringify(p));
      copy.trunk=payload;
      return copy;
    });
    var result=window.RyPlotLibraryStore.replace(nextPlots,ctx.snapshot.revision);
    if(!result||!result.ok){
      var m3='总管保存失败：'+((result&&result.error)||'地块库版本冲突');
      if(!opts.silent) tip(m3);
      return {ok:false,error:m3};
    }
    currentMapPlotId=pid;
    trunkSaved=payload;
    trunkOwnerPlotId=pid;   /* [v993] 写库成功后同步归属（含 payload=null「这块地没有总管」） */
    /* 只有**写成功之后**才入栈（写失败绝不能留一步能撤销的假历史）。
       undo/redo 自己回写时带 noHistory:true，否则撤销会把撤销本身记成一步新历史。 */
    if(!opts.noHistory && trunkHistory){
      try{
        trunkHistory.record({plotId:pid,before:beforeRaw,after:payload,activeTrunkId:activeTrunkId});
      }catch(err){}
    }
    if(opts.tipText) tip(opts.tipText);
    return {ok:true,trunk:payload};
  }

  /* 把当前草稿提交成一条干线：id 为空 = 新增一条，否则替换同 id 那条。
     ★ 多干线的写入点只有 commitTrunks 这一个 —— 别在别处再拼 plot.trunk。 */
  function commitTrunkDraft(){
    if(trunkMode!=='draw'){tip('请先进入总管绘制状态，再完成保存。');return false;}
    if(trunkPoints.length<2){tip('总管至少需要两个点，请继续绘制。');return false;}
    var trunkLengthM=0;for(var tli=1;tli<trunkPoints.length;tli++)trunkLengthM+=map.distance(L.latLng(trunkPoints[tli-1].lat,trunkPoints[tli-1].lng),L.latLng(trunkPoints[tli].lat,trunkPoints[tli].lng));
    if(!(trunkLengthM>0.5)){tip('总管长度不足 0.5 米，请调整折点后再保存。');return false;}

    var draft=trunkDraft||{};
    var draftId=draft.id?String(draft.id):null;
    /* 有高程才带第三位，绝不补 0 —— 缺数据要让 UI 显示「—」，不是伪造 0 高差。 */
    var pts=trunkPoints.map(function(p){
      return (p.z===undefined||p.z===null||!isFinite(Number(p.z))) ? [p.lat,p.lng] : [p.lat,p.lng,Number(p.z)];
    });
    var params=draft.params?JSON.parse(JSON.stringify(draft.params)):{material:'PE',dn:null,designFlow:null};

    var savedId=null;
    var res=commitTrunks(function(next,ctx){
      var S=ctx.schema;
      /* [v838] 显示用管线编号：默认 ZG-001 / ZG-002…递增（规格五①）。
         只在"新建"时补，重画同一条时 params 里已经带着原编号，不动它。 */
      if(!params.code) params.code=S.makeCode(next);
      var entry={
        id: draftId || S.makeId(next),
        main: draftId ? false : !next.trunks.length,
        points: pts,
        params: params
      };
      var replaced=false;
      for(var i=0;i<next.trunks.length;i++){
        if(draftId && String(next.trunks[i].id)===draftId){
          /* 替换时要**继承原来的 main**：否则重画主干会把它悄悄降级，
             再被「ensure main」顺延给列表第一条 —— 主干换了一条用户完全不知道。 */
          entry.main = next.trunks[i].main===true || entry.main;
          next.trunks[i]=entry; replaced=true;
        }
      }
      if(!replaced){
        if(next.trunks.length>=S.MAX_TRUNKS) return {ok:false,error:'干线数量已达上限（'+S.MAX_TRUNKS+' 条），请先删掉不用的线。'};
        next.trunks.push(entry);
      }
      savedId=String(entry.id);   /* [v839] 保存完要按这条线判一次流速告警 */
      return {ok:true,trunk:next};
    });
    if(!res.ok) return false;
    setTrunkMode('idle');
    tip('总管已保存（共 '+res.trunk.trunks.length+' 条）。回到分区页重新回传该地块后可读取这条地图总管。');
    /* [v839] 保存时也判一次：用户常常"画完才想起没填管径"，保存是最自然的那次复核。 */
    if(savedId) maybeWarnTrunk(savedId);
    return true;
  }
  /* 进入/退出总管绘制。**所有互斥都收口在这里**，别在各按钮里各写一份
     （旧版就是这样：setDrawing / 测距 / 右键 各清一次，漏一处就出现"两个工具同时活着"）。 */
  function setTrunkMode(mode){
    var nextMode = (mode==='draw'||mode==='edit') ? mode : 'idle';
    if(nextMode!=='idle'&&reservoirPlaceMode)setReservoirPlaceMode(false);
    trunkDragPreview=null;      // 切模式一律丢掉拖动预览，别让状态栏停在旧数字上
    removeTrunkRubber();        // [v852] 橡皮筋跟着模式走：退出绘制（含 Esc/完成/双击收线）即清
    if(nextMode==='draw'){
      if(drawing) setDrawing(false);
      hideTrunkWarn();          // 卡里说的是"已保存的那根线"，开始画新的就过时了
      if(measuring) finishMeasure();
      if(addMode) setAddMode(false);
      map.dragging.disable();
      /* 双击 = 收线，不能同时触发地图缩放，否则点完线地图自己跳一下。 */
      if(map.doubleClickZoom) map.doubleClickZoom.disable();
      trunkClickTs=0; trunkClickPt=null;
      trunkTargetPlotId=String(currentMapPlotId||'');
      /* [v832] 进入绘制才采候选点（地块环/水源/已存拐点在这期间不会变）。 */
      lastCursorLatLng=null;
      refreshSnapTargets();
      activeTrunkId=null; activeVertexIdx=-1;
      closeTrunkMenu();
    }else if(nextMode==='edit'){
      if(drawing) setDrawing(false);
      if(measuring) finishMeasure();
      if(addMode) setAddMode(false);
      /* 编辑态**不关** map.dragging：拖拐点时也常常要平移地图找位置。
         双击缩放保留 —— 编辑态不需要双击干任何事（选中靠单击命中线）。 */
      trunkTargetPlotId=String(trunkTargetPlotId||currentMapPlotId||'');
      trunkPoints=[];
      trunkDraft=null;
      trunkClickTs=0; trunkClickPt=null;
      lastCursorLatLng=null;
      if(snapApi()) snapApi().clearMarker();
    }else{
      trunkPoints=[];
      trunkDraft=null;
      trunkTargetPlotId=null;
      trunkClickTs=0; trunkClickPt=null;
      lastCursorLatLng=null;
      activeTrunkId=null; activeVertexIdx=-1;
      closeTrunkMenu();
      if(snapApi()) snapApi().clearMarker();
      if(map.doubleClickZoom) map.doubleClickZoom.enable();
      if(!drawing && !measuring) map.dragging.enable();
    }
    trunkMode=nextMode;
    /* [v920] 进入编辑态后重采捕捉目标：此前只有 draw 态刷新，edit 态目标表是空的——
       用户拖白点到节点附近永远不吸（真机反馈「不能形成闭环」的主因之一）。 */
    if(trunkMode==='edit') refreshSnapTargets();
    map.getContainer().classList.toggle('drawing', drawing || trunkMode==='draw');
    renderTrunkDraft();
    renderTrunkEditHandles();
    syncTrunkUI();
    updateTrunkHint();
    updateStatusbar();
    syncTrunkPanel();
  }
  function syncTrunkUI(){
    var btn=document.getElementById('btnDrawTrunk');
    if(btn){
      var on=trunkMode==='draw';
      btn.classList.toggle('is-trunk-on',on);
      /* 不再同时挂 .btn-on：它是绿色皮肤，靠 .is-trunk-on 后写覆盖才变蓝，
         一旦有人调整 CSS 顺序就会"突然变绿"。激活态只留一个类。 */
      btn.setAttribute('aria-pressed',on?'true':'false');
      btn.title=on?'退出总管绘制（草稿丢弃，已保存的线不动）；快捷键 M':'绘制当前地块的输水总管；快捷键 M';
      setBtnLabel(btn, on?'总管绘制中…':'绘制');
    }
    /* 互斥矩阵：总管绘制中，画框/加点不可用；反过来在读地块框时总管按钮不可用。 */
    [['btnDraw',trunkMode==='draw'],['btnAddPt',trunkMode==='draw'],['btnDrawTrunk',!!drawing]].forEach(function(it){
      var el=document.getElementById(it[0]);
      if(el) el.disabled=!!it[1];
    });
    ['btnFinishTrunk','btnUndoTrunk'].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.disabled=trunkMode!=='draw';
    });
    /* [v833] 编辑总管：没有已保存的干线就没东西可编辑，直接置灰（别让用户点进空态再被告知）。 */
    var eb=document.getElementById('btnEditTrunk');
    if(eb){
      var onEdit=trunkMode==='edit';
      eb.classList.toggle('is-trunk-on',onEdit);
      eb.setAttribute('aria-pressed',onEdit?'true':'false');
      eb.disabled = trunkMode==='draw' || !!drawing || !(trunkSaved&&trunkSaved.trunks&&trunkSaved.trunks.length);
      eb.title = onEdit ? '退出总管编辑（Esc）；快捷键 E'
        : '编辑当前地块已保存的干线：点线选中、拖白点改拐点、右键开菜单；快捷键 E';
      setBtnLabel(eb, onEdit ? '编辑中' : '编辑总管');
    }
  }
  /* ===== [v832] 捕捉 + 状态栏 + 常驻提示条（二期） =====
     职责划分：判定逻辑全在 mod/trunk-snap.js（纯函数、可 Node 单测）；
     这里只负责「给素材 / 给投影器 / 给标记 / 写 DOM」。 */
  /* [v846 规格意见] 捕捉重开默认**关闭**：吸附是高级手感，默认吸容易让新用户困惑
     「点下去线怎么自己弯了」；要吸的时候按 S 或点按钮打开。会话内记住切换，不落库。 */
  var snapOn = false;
  var snapMarker = null;
  var lastCursorLatLng = null;

  function snapApi(){ return window.RyTrunkSnap || null; }

  /* GCJ-02 经纬度 → Leaflet 用的显示坐标（地图底图可能是 WGS-84，toDisplay 负责换）。 */
  function displayLatLngOf(lat,lng){
    var d=toDisplay({lat:+lat,lng:+lng});
    return Array.isArray(d)?L.latLng(d[0],d[1]):L.latLng(d.lat,d.lng);
  }

  function ensureSnapSupport(){
    var S=snapApi();
    if(!S) return;
    S.setProjector(function(ll){
      try{
        var cp=map.latLngToContainerPoint(displayLatLngOf(ll.lat,ll.lng));
        return {x:cp.x,y:cp.y};
      }catch(e){ return null; }
    });
    S.setUnprojector(function(cp){
      try{ return fromDisplay(map.containerPointToLatLng([cp.x,cp.y])); }
      catch(e){ return null; }
    });
    S.setMarkerApi({
      show:function(hit){
        if(trunkMode!=='draw') return;
        var ll=displayLatLngOf(hit.lat,hit.lng);
        if(!snapMarker){
          /* 白色空心小圆 + 深蓝描边；interactive:false 否则它会挡住后续点击。
             className 是给探针的稳定锚点 —— 靠 fill 颜色猜太脆（Leaflet 会改写属性）。 */
          snapMarker=L.circleMarker(ll,{radius:5,weight:2,color:'#1e40af',fillColor:'#fff',fillOpacity:1,
            interactive:false,className:'ry-snap-mark'}).addTo(map);
        }else{
          snapMarker.setLatLng(ll);
          if(!map.hasLayer(snapMarker)) snapMarker.addTo(map);
        }
      },
      hide:function(){
        if(snapMarker && map.hasLayer(snapMarker)) map.removeLayer(snapMarker);
      }
    });
  }

  /* ===== [v835] 施工图素材 → 经纬度（三期遗留：阀门 / 支管起点 / 分区顶点） =====
     这三类在 tlDiagramData 里是**画布世界米坐标**，接进捕捉得先反算成 GCJ-02。
     ★ 符号不许硬编码。实测（_probe_trunk_p5_geo.mjs）：同一份 geoBase 下，
       plot.poly（地图页存的）是 +y、measuredPolygon / tlDiagramData 是 −y，
       两边差一个镜像；地块库里的历史数据两种都存在（inline-13 的 ryOrientPlotPoly
       就是在判方向）。选错符号时 300×170m 的地块误差正好 170m —— 整块南北颠倒。
     ⇒ 拿地块库的 polyLatLng 当标尺，对 ±y 各算一次 RMS，选能对上的；
       对不上（或两个都像）就返回 null，让这三类静默跳过。
       宁可少吸一个点，不要吸到错误位置。
     取证：与站点自己反投进 runye_network_layout 的经纬度逐点对照，
       最大差 7cm（纯 toFixed(6) 舍入），见 _probe_trunk_p5_geo_out.json。 */
  /* 判定与换算全在 mod/trunk-geo.js（纯函数，Node 单测覆盖 ±y 与旋转 frame）；
     这里只负责「取素材 / 缓存 / 落地」。 */
  var geoBridgeMemo=null;
  function trunkGeoBridge(plot){
    var G=window.RyTrunkGeo;
    if(!G) return null;
    var dd=window.tlDiagramData, base=window.__runyeGeoBase;
    if(!dd||dd.world!=='meter') return null;
    if(!Array.isArray(dd.poly)||dd.poly.length<3) return null;
    if(!plot||!Array.isArray(plot.polyLatLng)||plot.polyLatLng.length!==dd.poly.length) return null;
    /* ★ 地块一致性（最容易被忽略的一条）：tlDiagramData 属于「分区页当前地块」
       （window.currentPlotId）；本函数服务的 plot 是「地图页正在编辑的地块」
       （currentMapPlotId）。两者不是同一块时，把前者的阀门吸到后者身上
       = 吸到别人家的管子，比不接更糟。 */
    if(String(window.currentPlotId||'')!==String(currentMapPlotId||'')) return null;
    var sig=String(currentMapPlotId)+'|'+String(dd.generatedAt||'')+'|'+dd.poly.length;
    if(geoBridgeMemo&&geoBridgeMemo.sig===sig) return geoBridgeMemo.bridge;
    var cal=G.autoSign(dd.poly, plot.polyLatLng, base);
    var bridge=cal.ok?{
      sign:cal.sign, rms:cal.rms,
      toLL:function(pt){ return pt?G.m2ll(pt.x, pt.y, base, cal.sign):null; }
    }:null;
    geoBridgeMemo={sig:sig, bridge:bridge};
    return bridge;
  }

  /* 分区网格交点数上限：nearest() 每帧对全部候选做一次投影，
     太大的网格会把 mousemove 拖慢 ⇒ 超限就不接（宁缺不卡）。 */
  var ZONE_VERT_CAP=150;

  function extraSnapTargets(plot){
    var dd=window.tlDiagramData;
    var bridge=trunkGeoBridge(plot);
    if(!bridge) return null;
    var valves=[], branchStarts=[], zoneVerts=[], couplers=[], mainPipeLines=[], mainCouplers=[], zoneNote=null;
    (Array.isArray(dd.valves)?dd.valves:[]).forEach(function(v){
      var ll=bridge.toLL(v); if(ll) valves.push(ll);
    });
    (Array.isArray(dd.branchPipes)?dd.branchPipes:[]).forEach(function(line){
      if(!line||!line.length) return;
      var ll=bridge.toLL(line[0]); if(ll) branchStarts.push(ll);
    });
    var G=window.RyTrunkGeo, zw=G?G.zoneWorlds(dd.zones):[];
    if(zw.length>ZONE_VERT_CAP){ zoneNote='capped:'+zw.length; zw=[]; }
    zw.forEach(function(p){ var ll=bridge.toLL(p); if(ll) zoneVerts.push(ll); });
    /* 2a：每区主管折线按 geoBridge 从画布米坐标反算；失败坐标跳过，不作猜测。 */
    (Array.isArray(dd.mainPipes)?dd.mainPipes:[]).forEach(function(line){
      if(!Array.isArray(line)||line.length<2) return;
      var llLine=[], valid=true;
      line.forEach(function(p){ var ll=bridge.toLL(p); if(ll) llLine.push(ll); else valid=false; });
      if(valid && llLine.length>=2) mainPipeLines.push(llLine);
    });
    /* [v859] 段总管驳接点（自动生成的串联干线两端）：手绘总管接到这里即贯通地块内水路 */
    /* [v914] 设计页接驳节点（dd.couplerNodes，世界米投影坐标）：手绘总管吸到节点上=
       与该主管在设计页的接驳点精确贯通。失配节点（x/y null，v913 missing）静默跳过——
       宁可少吸，不吸错位（§五投影保真口径）。桥（trunkGeoBridge）已含地块一致性守卫。 */
    (Array.isArray(dd.couplerNodes)?dd.couplerNodes:[]).forEach(function(n){
      if(!n||n.x==null||n.y==null) return;
      var ll=bridge.toLL(n); if(!ll) return;
      mainCouplers.push({lat:ll.lat, lng:ll.lng,
        label:'主管节点 '+n.pipeKey+(isFinite(Number(n.s))?(' · 距起点 '+(Math.round(Number(n.s)*10)/10)+'m'):'')});
    });
    /* [v917] 三级施工节点（N-01 等）也直接作为地图总管吸附目标。
       RyTlNodes 只保存 pid+atM；位置按工作区实际有效管线（含长度/平移覆盖）重算，
       再经同一地块 geoBridge 反算。front 节点不映射到灌溉分区；主管/支管节点可接入水路。 */
    (function(){
      var N=window.RyTlNodes, A=window.RyTlAutoEdits;
      if(!N||typeof N.list!=='function'||!A||typeof A.pointAt!=='function')return;
      var list;try{list=N.list();}catch(e){return;}
      if(!Array.isArray(list))return;
      list.forEach(function(n){
        if(!n||!/^((main|branch))-\d+$/.test(String(n.pid||'')))return;
        var p;try{p=A.pointAt(n.pid,dd,Number(n.atM));}catch(e){return;}
        if(!p||!isFinite(p.x)||!isFinite(p.y))return;
        var ll=bridge.toLL(p);if(!ll)return;
        var name=typeof A.pipeName==='function'?A.pipeName(n.pid):n.pid;
        mainCouplers.push({lat:ll.lat,lng:ll.lng,
          label:'施工节点 '+String(n.id||'')+' · '+name+' · 桩号 '+(Math.round(Number(n.atM)*10)/10)+'m'});
      });
    })();
    return {valves:valves, branchStarts:branchStarts, zoneVerts:zoneVerts, couplers:couplers, mainPipeLines:mainPipeLines, mainCouplers:mainCouplers,
      stats:{sign:bridge.sign, rms:Math.round(bridge.rms*1000)/1000,
        valves:valves.length, branchStarts:branchStarts.length, zoneVerts:zoneVerts.length, couplers:couplers.length, mainPipeLines:mainPipeLines.length, mainCouplers:mainCouplers.length, zoneNote:zoneNote}};
  }

  var snapExtras=null;

  /* 采集捕捉候选。三类「本身就带经纬度」的直接给（地块顶点 / 水源 / 已存干线拐点），
     另三类（阀门 / 支管起点 / 分区顶点）走 trunkGeoBridge 反算 —— 反算不成就跳过，
     绝不拿猜出来的坐标去吸。 */
  function refreshSnapTargets(options){
    options=options||{};
    var S=snapApi();
    if(!S) return 0;
    var input={};
    var snap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
    var plot=null;
    if(snap&&snap.ok&&currentMapPlotId){
      plot=snap.plots.filter(function(p){return p&&String(p.id)===String(currentMapPlotId);})[0]||null;
    }
    if(plot){
      input.plotRing=plot.polyLatLng||null;
      if(plot.waterSource&&!options.excludeWaterSource) input.waterSource=plot.waterSource;
    }
    if(trunkSaved&&Array.isArray(trunkSaved.trunks)){
      input.savedTrunks=trunkSaved.trunks;
      var SS=window.RyTrunkSchema, m=SS?SS.pickMainTrunk(trunkSaved):null;
      if(m) input.mainTrunkPoints=m.points;
    }
    /* [v914] 编辑已有总管时：该线拐点与 trunk-edge 线段都不吃自己的（v911 记过#2 收口） */
    if(trunkMode==='edit'&&activeTrunkId!=null) input.excludeTrunkId=activeTrunkId;
    snapExtras=extraSnapTargets(plot);
    if(snapExtras){
      input.valves=snapExtras.valves;
      input.branchStarts=snapExtras.branchStarts;
      input.zoneVerts=snapExtras.zoneVerts;
      input.mainPipeLines=snapExtras.mainPipeLines;
      if(snapExtras.couplers&&snapExtras.couplers.length) input.couplers=snapExtras.couplers;
      if(snapExtras.mainCouplers&&snapExtras.mainCouplers.length) input.mainCouplers=snapExtras.mainCouplers;   /* [v914] 设计页接驳节点 */
    }
    var list=S.buildTargets(input);
    var rc=S.setTargets(list,{plotId:currentMapPlotId?String(currentMapPlotId):null, extras:snapExtras?snapExtras.stats:null});
    renderCouplerMarkers(snapExtras);
    return rc;
  }

  function reservoirIcon(){
    return L.divIcon({className:'ry-reservoir-icon-wrap',iconSize:[54,48],iconAnchor:[27,42],
      html:'<span class="ry-reservoir-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5C9.4 6.1 5.3 10.2 5.3 14.4a6.7 6.7 0 0 0 13.4 0C18.7 10.2 14.6 6.1 12 2.5Z"/></svg></span><span class="ry-reservoir-label">蓄水池</span>'});
  }
  function renderReservoir(){
    reservoirMarkerLayer.clearLayers();
    reservoirMarker=null;
    if(!currentMapPlotId)return;
    var snap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
    var matches=snap&&snap.ok?(snap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);}):[];
    var source=matches.length===1&&!matches[0].merged&&!matches[0].grouped&&!matches[0].mergedInto&&matches[0].waterSource?matches[0].waterSource:null;
    if(!source)return;
    var point=window.RyTrunkSnap&&window.RyTrunkSnap.readPoint?window.RyTrunkSnap.readPoint(source):null;
    if(!point)return;
    reservoirMarker=L.marker(toDisplay(point),{icon:reservoirIcon(),draggable:true,keyboard:false,zIndexOffset:1400})
      .addTo(reservoirMarkerLayer).bindTooltip('蓄水池 · 拖动调整位置',{direction:'top',offset:[0,-35],className:'ry-reservoir-tip',opacity:.96});
    reservoirMarker.on('dragend',function(){
      var moved=fromDisplay(reservoirMarker.getLatLng());
      moved={lat:+moved.lat,lng:+moved.lng};
      var S=snapApi();
      if(snapOn&&S){refreshSnapTargets({excludeWaterSource:true});var hit=S.nearest(moved);if(hit)moved={lat:hit.lat,lng:hit.lng};}
      if(!saveWaterSource(moved))renderReservoir();
    });
  }
  function saveWaterSource(point){
    if(!currentMapPlotId||!point||!isFinite(point.lat)||!isFinite(point.lng)||Math.abs(point.lat)>90||Math.abs(point.lng)>180){
      tip('请先选中一个已保存的单独地块，再放置蓄水池。');return false;
    }
    var store=window.RyPlotLibraryStore, snap=store&&store.read();
    if(!snap||!snap.ok){tip('蓄水池保存失败：地块库读取失败。');return false;}
    var matches=(snap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);});
    if(matches.length!==1){tip('蓄水池保存失败：当前地块身份无法唯一确认。');return false;}
    var plot=matches[0];
    if(plot.merged||plot.grouped||plot.mergedInto){tip('成组地块暂不支持单独设置蓄水池，请先选择单独地块。');return false;}
    var next=snap.plots.map(function(p){
      if(!p||String(p.id)!==String(currentMapPlotId))return p;
      var copy=JSON.parse(JSON.stringify(p));copy.waterSource={lat:+point.lat,lng:+point.lng};return copy;
    });
    var saved=store.replace(next,snap.revision);
    if(!saved||!saved.ok){tip('蓄水池保存失败：地块库已变化，请重新操作。');return false;}
    renderReservoir();
    refreshSnapTargets();
    return true;
  }
  function setReservoirPlaceMode(on){
    reservoirPlaceMode=!!on;
    var btn=document.getElementById('btnPlaceReservoir');
    if(btn){btn.classList.toggle('btn-on',reservoirPlaceMode);btn.setAttribute('aria-pressed',reservoirPlaceMode?'true':'false');setBtnLabel(btn, reservoirPlaceMode?'点击地图放置…':'蓄水池');}
    map.getContainer().classList.toggle('placing-reservoir',reservoirPlaceMode);
    if(!reservoirPlaceMode)return;
    if(drawing)setDrawing(false);
    if(measuring)finishMeasure();
    if(addMode)setAddMode(false);
    if(trunkMode!=='idle')setTrunkMode('idle');
    if(!currentMapPlotId){setReservoirPlaceMode(false);tip('请先在地图中选中已保存的地块，再放置蓄水池。');return;}
    var activeSnap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
    var activePlots=activeSnap&&activeSnap.ok?(activeSnap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);}):[];
    if(activePlots.length!==1||activePlots[0].merged||activePlots[0].grouped||activePlots[0].mergedInto){
      setReservoirPlaceMode(false);tip('蓄水池需要绑定唯一的单独地块；请先从「我的地块」选择一个单独地块。');return;
    }
    refreshSnapTargets({excludeWaterSource:true});
    tip('请在地图上点击蓄水池位置；开启捕捉时会吸附到附近的总管节点。放置后可直接拖动调整。');
  }

  /* ===== [v918] 设计页节点常显标记层：手绘总管前用户能直接看到「节点在哪」。
     此前（v914/v917）节点只是吸附目标——不开捕捉看不见、开了也要靠近才出气泡，
     用户真机反馈「地图上根本没看到节点」。数据源=snapExtras.mainCouplers
     （v914 参数接驳节点 + v917 三级施工节点，label 已带管名/桩号）。
     样式与演示层入口标记同语言（外环 #b45309 描边 + 橙芯 #f59e0b）；
     interactive:false 不吃绘制点击；permanent tooltip 常显标签，
     CSS pointer-events:none 不挡地图操作。无选中地块/地块不一致
     （snapExtras=null）⇒ 清层。标记层与捕捉开关（snapOn）无关——它是指引，不是捕捉。 */
  var couplerMarkerLayer=null, couplerTipCssDone=false;
  function renderCouplerMarkers(extras){
    if(!couplerMarkerLayer) couplerMarkerLayer=window.L.layerGroup().addTo(map);
    couplerMarkerLayer.clearLayers();
    if(!couplerTipCssDone){
      couplerTipCssDone=true;
      try{
        var st=document.createElement('style');
        st.textContent='.ry-coupler-tip{pointer-events:none;background:rgba(255,255,255,.93);'+
          'color:#7c2d12;border:1px solid #b45309;font-size:11px;padding:1px 6px;box-shadow:none;white-space:nowrap}'+
          '.ry-coupler-tip::before{display:none}';
        document.head.appendChild(st);
      }catch(eCss){}
    }
    var list=(extras&&Array.isArray(extras.mainCouplers))?extras.mainCouplers:[];
    list.forEach(function(n){
      if(!n||!isFinite(n.lat)||!isFinite(n.lng)) return;
      window.L.circleMarker([n.lat,n.lng],{
        radius:9, color:'#b45309', weight:2.5, fillOpacity:0, interactive:false
      }).addTo(couplerMarkerLayer);
      window.L.circleMarker([n.lat,n.lng],{
        radius:5, color:'#ffffff', weight:2, fillColor:'#f59e0b', fillOpacity:1, interactive:false
      }).addTo(couplerMarkerLayer).bindTooltip(n.label||'主管节点',{
        permanent:true, direction:'top', offset:[0,-9], className:'ry-coupler-tip', opacity:0.95
      });
    });
  }

  /* ===== [v861] 在线地图轮灌演示（RyMapFlowDemo）：拾取手绘总管 + 分区主管/支管，
     在实际地块上播放水流；总管与主管未连接时报错。ctx 注入闭包上下文：
     toLL 走 v835 geoBridge（地块一致/±y 符号判定复用）；getTrunkPoints 读 trunkSaved
     主干（闭包变量，函数捕获引用 ⇒ 后续重绘自动可见）。init 内自挂 section 观察器。 */
  try {
    if (window.RyMapFlowDemo && typeof window.RyMapFlowDemo.init === 'function') {
      window.RyMapFlowDemo.init({
        map: map,
        toLL: function (pt) {
          var plot = (function () {
            var snap = window.RyPlotLibraryStore && window.RyPlotLibraryStore.read();
            if (snap && snap.ok && currentMapPlotId) {
              return snap.plots.filter(function (p) { return p && String(p.id) === String(currentMapPlotId); })[0] || null;
            }
            return null;
          })();
          var b = trunkGeoBridge(plot);
          return b ? b.toLL(pt) : null;
        },
        getTrunkPoints: function () {
          if (!trunkSaved || !Array.isArray(trunkSaved.trunks) || !trunkSaved.trunks.length) return null;
          var SS = window.RyTrunkSchema, m = SS ? SS.pickMainTrunk(trunkSaved) : null;
          var lines = m ? [m.points] : trunkSaved.trunks.map(function (t) { return t && t.points; });
          var out = [];
          lines.forEach(function (pts) {
            (pts || []).forEach(function (p) {
              if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) out.push({ lat: p[0], lng: p[1] });
              else if (p && isFinite(p.lat) && isFinite(p.lng)) out.push({ lat: p.lat, lng: p.lng });
            });
          });
          return out.length >= 2 ? out : null;
        },
        getTrunkLines: function () {
          if (!trunkSaved || !Array.isArray(trunkSaved.trunks)) return [];
          return trunkSaved.trunks.map(function (t) {
            var line=[];
            (t&&Array.isArray(t.points)?t.points:[]).forEach(function(p){
              if(Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1]))line.push({lat:p[0],lng:p[1]});
              else if(p&&isFinite(p.lat)&&isFinite(p.lng))line.push({lat:p.lat,lng:p.lng});
            });
            return line.length>=2?line:null;
          }).filter(Boolean);
        },
        getWaterSource: function () {
          var snap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
          var plot=snap&&snap.ok&&currentMapPlotId?(snap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);})[0]:null;
          var point=plot&&window.RyTrunkSnap&&window.RyTrunkSnap.readPoint?window.RyTrunkSnap.readPoint(plot.waterSource):null;
          if(!point)return null;
          var display=toDisplay(point);
          return {lat:display[0],lng:display[1]};
        },
        /* [v945] 逐区分区面积（m²）—— 演示浮层按分区反推总管口径时用；
           与属性面板的「推算管径」同一个取数口，不在地图端另算面积。 */
        getZoneAreas: currentZoneAreas,
        tip: tip,
        isMapActive: function () {
          var s = document.getElementById('onlineMapSection');
          return !!(s && s.classList.contains('ry-active'));
        }
      });
    }
  } catch (eDemoInit) { /* 演示面板初始化失败不影响地图主流程 */ }

  function setSnapOn(on){
    snapOn=!!on;
    var S=snapApi();
    if(S) S.setEnabled(snapOn);
    if(!snapOn && snapMarker && map.hasLayer(snapMarker)) map.removeLayer(snapMarker);
    var b=document.getElementById('btnSnapToggle');
    if(b){
      b.textContent='捕捉：'+(snapOn?'开启':'关闭');
      b.setAttribute('aria-pressed',snapOn?'true':'false');
    }
    updateTrunkHint();
  }

  /* 单点高程：缺就返回 null（**不补 0**）。状态栏据此显示「—」。 */
  function zOfPoint(q){
    var S=window.RyTrunkSchema;
    var rd=S&&S.readPoint?S.readPoint(q):null;
    return rd&&typeof rd.z==='number'&&isFinite(rd.z)?rd.z:null;
  }

  function fmtLen(m){
    if(!isFinite(m)||m<=0) return '—';
    return (m<1000?m.toFixed(1):(m/1000).toFixed(2))+' '+(m<1000?'m':'km');
  }
  function setField(id,val){
    var el=document.getElementById(id);
    if(el&&el.textContent!==val) el.textContent=val;   // 值没变就不写 DOM（mousemove 每帧都在跑）
  }

  /* 状态栏 5 字段。缺数据一律「—」：**绝不写 0.00**，那会被当成真值去做水力判断。
     [v833] 拖动拐点时状态栏必须跟着**拖动中的位置**走：
       库里那份在 dragend 之前是不动的，直接读 trunkSaved 会让数字在拖动全程是死的
       （用户看到"拖了半天投影不变"，会以为拖动没生效）。所以拖动期间用 trunkDragPreview
       顶替几何来源；它只供显示，绝不参与写库。 */
  function updateStatusbar(){
    if(!mapSectionVisible()) return;
    var S=window.RyTrunkSchema;
    /* [v838] 编辑态选中了某条线，状态栏就该显示**那一条**（编号/投影/高差/流速），
       否则用户在面板里改 ZG-003，状态栏却还念着主干的数字，两个控件互相拆台。 */
    var shown=(trunkMode==='edit'&&activeTrunkId)?findSavedTrunk(activeTrunkId):null;
    var main=shown||((S&&trunkSaved)?S.pickMainTrunk(trunkSaved):null);

    setField('msbTrunk', main?((main.params&&main.params.code)||String(main.id)):'—');

    /* 几何来源优先级：绘制中的草稿 > 拖动中的预览 > 库里的主干 */
    var pts=(trunkMode==='draw'&&trunkPoints.length)?trunkPoints
      :(trunkDragPreview?trunkDragPreview.points:(main?main.points:null));

    /* 投影：绘制中=首点到光标的累计平面长度（实时预览）；否则=该线全长。
       [v853] 测距唯一口径：走 mod/trunk-geo.js 的 haversine（R=6378137，与右侧属性面板、
       扬程 tlFrontLenUse 同源）。v843 面板切到唯一实现后这里还留在 Leaflet
       map.distance（CRS Earth R=6371000），326 m 的线上两处差 0.38 m —— 状态栏显示的数
       既不等于面板、也不等于水力计算用的总管长。探针 _probe_trunk_p7_panel.mjs B1 守着
       （v838~v842 一直绿，v843 起红，本次复跑 #8 核查时抓出）。RyTrunkGeo 缺席时才退
       map.distance（不应发生：trunk-geo 在 SW CORE，先于本文件加载）。 */
    var proj='—';
    if(pts&&pts.length){
      var G=window.RyTrunkGeo;
      var geoDist=(G&&typeof G.haversine==='function')?G.haversine
        :function(u,v){ return map.distance(L.latLng(u.lat,u.lng),L.latLng(v.lat,v.lng)); };
      var total=0;
      for(var i=1;i<pts.length;i++){
        var a=S.readPoint(pts[i-1]), b=S.readPoint(pts[i]);
        if(a&&b) total+=geoDist(a,b);
      }
      if(trunkMode==='draw'&&lastCursorLatLng&&pts.length){
        var last=S.readPoint(pts[pts.length-1]);
        if(last) total+=geoDist(last,lastCursorLatLng);
      }
      proj=fmtLen(total);
    }
    setField('msbProj', proj);

    /* 高差：首尾两点都有高程才算，否则「—」。 */
    var drop='—';
    if(pts&&pts.length>=2){
      var z0=zOfPoint(pts[0]), z1=zOfPoint(pts[pts.length-1]);
      if(z0!==null&&z1!==null){
        var d=z1-z0;
        drop=(d>=0?'+':'')+d.toFixed(2)+' m';
      }
    }
    setField('msbDrop', drop);

    /* 流速：v = Q/(π·D²/4)，D 取主干管径(mm)，Q 按 m³/h 折算成 m³/s。
       任一缺失就「—」—— 编一个流速出来会误导选型。
       流速只与管径/流量有关，与拖动位置无关 ⇒ 拖动中不重算，天然满足"不在拖动中跑水力"。 */
    var flow='—';
    if(main&&main.params){
      var dn=Number(main.params.dn), q=Number(main.params.designFlow);
      if(isFinite(dn)&&dn>0&&isFinite(q)&&q>0){
        var D=dn/1000, v=(q/3600)/(Math.PI*D*D/4);
        if(isFinite(v)) flow=v.toFixed(2)+' m/s';
      }
    }
    setField('msbFlow', flow);
  }

  function updateTrunkHint(){
    var el=document.getElementById('mapTrunkHint');
    if(!el) return;
    if(trunkMode==='idle'){ el.hidden=true; el.textContent=''; syncBottomMapHints(); return; }
    el.hidden=false;
    el.textContent = trunkMode==='draw'
      ? ('点击加点 · 双击/回车完成 · Esc 取消 · 按住 Shift 正交 · Ctrl+Z 撤销 · 捕捉：'+(snapOn?'开启':'关闭'))
      : '点选干线后可拖拐点 · 右键打开菜单 · Ctrl+Z 撤销 · Esc 退出';
    syncBottomMapHints();
  }

  (function(){
    var message=document.getElementById('tip');
    if(message&&typeof ResizeObserver==='function') new ResizeObserver(syncBottomMapHints).observe(message);
    window.addEventListener('resize',syncBottomMapHints);
    requestAnimationFrame(syncBottomMapHints);
  })();

  var snapToggleBtn=document.getElementById('btnSnapToggle');
  if(snapToggleBtn)snapToggleBtn.onclick=function(){ setSnapOn(!snapOn); };
  ensureSnapSupport();
  setSnapOn(snapOn); /* [v846] 初始态三处同步：引擎 enabled / 按钮 DOM / 提示条（别只改变量） */

  /* 光标移动：更新吸附标记 + 橡皮筋虚线 + 状态栏投影预览。 */
  map.on('mousemove', function(e){
    if(trunkMode!=='draw') return;
    lastCursorLatLng=fromDisplay(e.latlng);
    var S=snapApi();
    if(S){
      if(snapOn) S.nearest(lastCursorLatLng);
      else S.clearMarker();
    }
    /* [v852] 橡皮筋：预览终点与真实落点走同一个 trunkSnapPoint——
       吸附白点吸到哪，虚线就跟到哪（Shift 正交同理），落点不会和预览不一致。 */
    var shiftOn=!!(e.originalEvent && e.originalEvent.shiftKey);
    var pv=trunkSnapPoint(lastCursorLatLng, shiftOn);
    updateTrunkRubber(pv?toDisplay(pv):null);
    updateStatusbar();
  });

  var trunkDrawBtn=document.getElementById('btnDrawTrunk');
  if(trunkDrawBtn)trunkDrawBtn.onclick=function(){
    if(trunkMode==='draw'){
      setTrunkMode('idle');
      tip('已退出总管绘制，草稿已丢弃；已保存的线没有被改动。');
      return;
    }
    if(!currentMapPlotId){tip('请先在地图中选中已保存的地块，再绘制总管。');return;}
    var priorSnap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
    var prior=priorSnap&&priorSnap.ok?(priorSnap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);}):[];
    if(prior.length!==1){tip('当前地块记录无法唯一确认，请重新回传地块后再绘制总管。');return;}
    if(prior[0].merged||prior[0].grouped||prior[0].mergedInto){tip('成组地块的总管由多地块规划单独管理，请到多地块规划中编辑。');return;}
    /* 每次进入都从「新增一条」开始画：已保存的线原样留着，重画不会覆盖它。
       想改某条已有线，走三期「选中 + 拖拐点」，不是重画。 */
    trunkSaved=loadSavedTrunkFor(prior[0]);
    trunkOwnerPlotId=String(currentMapPlotId);   /* [v993] 进入绘制即锁定归属，草稿不会转存 */
    trunkPoints=[];
    trunkDraft={id:null,params:{material:'PE',dn:null,designFlow:null}};
    setTrunkMode('draw');
    tip('依次点击水源到地块内的折点：双击或回车完成，Esc 取消，按住 Shift 正交。灰线是已保存的干线，不会被改动。');
  };
  var reservoirBtn=document.getElementById('btnPlaceReservoir');
  if(reservoirBtn)reservoirBtn.onclick=function(){setReservoirPlaceMode(!reservoirPlaceMode);};
  var finishTrunkBtn=document.getElementById('btnFinishTrunk');
  if(finishTrunkBtn)finishTrunkBtn.onclick=function(){commitTrunkDraft();};
  var undoTrunkBtn=document.getElementById('btnUndoTrunk');
  if(undoTrunkBtn)undoTrunkBtn.onclick=function(){if(trunkMode!=='draw')return;trunkPoints.pop();renderTrunkDraft();};

  /* ===== [v833] 编辑层（三期）：选中 / 拖拐点 / 右键菜单 =====
     分工：算法全在 mod/trunk-edit.js（纯函数、Node 单测锁着），这里只做三件事：
       ① 把状态接上 Leaflet（命中判定、拐点手柄、选中高亮）
       ② 把右键菜单画出来（项与顺序由 RyTrunkEdit.MENU_ORDER 决定，**不要在这里重排**）
       ③ 把结果写回（一律走 commitTrunks，不另开写库分支） */
  function findSavedTrunk(id){
    if(id===null||id===undefined) return null;
    if(!trunkSaved||!Array.isArray(trunkSaved.trunks)) return null;
    for(var i=0;i<trunkSaved.trunks.length;i++){
      if(String(trunkSaved.trunks[i].id)===String(id)) return trunkSaved.trunks[i];
    }
    return null;
  }
  function trunkIndexById(id){
    if(!trunkSaved||!Array.isArray(trunkSaved.trunks)) return -1;
    for(var i=0;i<trunkSaved.trunks.length;i++){
      if(String(trunkSaved.trunks[i].id)===String(id)) return i;
    }
    return -1;
  }
  /* 两点距离（米），入参是 GCJ-02 的 {lat,lng}。
     同坐标系之间的平移偏移不影响距离，所以不必先换到显示坐标。 */
  function trunkDistM(a,b){
    if(!a||!b) return Infinity;
    return map.distance(L.latLng(a.lat,a.lng),L.latLng(b.lat,b.lng));
  }
  /* 两点距离（屏幕像素）。**拖拽手势必须按像素判**，不能按米：
     fitBounds 后常见 2.3 px/m ⇒ MERGE_M=0.3 m 只有 0.7 px，比一次像素取整还小，
     用户把点拖到邻点上，落点误差就 0.6 m 了 ⇒ 永远并不掉，手势等于死键。
     所以手势加一条 8px 的"够得着"下限；0.3 m 仍然管**数据层**的判定
     （mergeTrunks 的 jointOf、validate 之后的连线判断），那是几何事实，与缩放无关。 */
  function trunkDistPx(a,b){
    if(!a||!b) return Infinity;
    var pa=projectToContainer(a.lat,a.lng), pb=projectToContainer(b.lat,b.lng);
    var dx=pa.x-pb.x, dy=pa.y-pb.y;
    return Math.sqrt(dx*dx+dy*dy);
  }
  var MERGE_PX = 8;

  function selectTrunk(id){
    activeTrunkId=id===null?null:String(id);
    activeVertexIdx=-1;
    /* 卡里的数字属于"上一条线"，换线后就过时了（留着会让人以为新线也超标）。 */
    if(trunkWarnFor && String(trunkWarnFor)!==String(activeTrunkId)) hideTrunkWarn();
    renderTrunkDraft();
    renderTrunkEditHandles();
    /* [v920] 编辑态选线后必须重采捕捉目标（excludeTrunkId 换成新选的线）——
       否则目标表还是空的/旧的，拖白点靠近节点也不会吸（真机反馈缺口）。 */
    if(trunkMode==='edit') refreshSnapTargets();
    updateStatusbar();
    syncTrunkUI();
    syncTrunkPanel();
  }

  /* 拐点手柄：白底蓝边小圆（.ry-trunk-vtx）。拖拽用 Leaflet marker 自带的 draggable，
     鼠标/触摸都稳，不用自己算 pointer 增量。
     ★ 拖动中**只改线、不写库**：每帧写一次 localStorage 会卡死；dragend 才落一次。 */
  function renderTrunkEditHandles(){
    trunkEditLayers.forEach(function(m){ if(m && map.hasLayer(m)) map.removeLayer(m); });
    trunkEditLayers=[];
    if(trunkMode!=='edit') return;
    var entry=findSavedTrunk(activeTrunkId);
    if(!entry) return;
    var S=window.RyTrunkSchema, E=window.RyTrunkEdit;
    if(!S||!E) return;
    var raw=Array.isArray(entry.points)?entry.points:[];
    var labels=(entry.params&&entry.params.labels)||{};
    raw.forEach(function(q,idx){
      var rd=S.readPoint(q); if(!rd) return;
      var isEnd=(idx===0||idx===raw.length-1);
      var mk=L.marker(displayLatLngOf(rd.lat,rd.lng),{
        draggable:true, keyboard:false, autoPan:true, zIndexOffset:1200,
        icon:L.divIcon({className:'ry-trunk-vtx'+(isEnd?' is-end':''),iconSize:[14,14],iconAnchor:[7,7],
          html:'<span class="tv-dot"></span>'})
      }).addTo(map);
      var label=labels[String(idx)];
      if(label){
        mk.bindTooltip(String(label),{permanent:true,direction:'top',offset:[0,-10],className:'ry-trunk-vtx-tip',interactive:false});
      }
      mk.on('dragstart',function(){
        activeVertexIdx=idx;
        var el=mk.getElement(); if(el) el.classList.add('is-dragging');
      });
      mk.on('drag',function(ev){
        /* 拖动中只把线跟着挪 + 更新状态栏，不写库（每帧写一次 localStorage 会卡死），
           也不跑水力（流速只与管径/流量有关，本来就不随位置变）。 */
        var ll=ev.target.getLatLng();
        if(trunkActiveLine){
          var arr=trunkActiveLine.getLatLngs();
          if(arr && arr[idx]){ arr[idx]=ll; trunkActiveLine.setLatLngs(arr); }
        }
        var gcjDrag=fromDisplay(ll);
        var preview=raw.map(function(q,i){
          if(i===idx) return [+gcjDrag.lat,+gcjDrag.lng];
          var rd=S.readPoint(q);
          return rd?[rd.lat,rd.lng]:null;
        }).filter(function(v){return !!v;});
        trunkDragPreview={id:String(entry.id),points:preview};
        updateStatusbar();
      });
      mk.on('dragend',function(ev){
        var el=mk.getElement(); if(el) el.classList.remove('is-dragging');
        /* 先清预览再写库：否则状态栏会一直停在"拖动中的数字"上，和库里对不上。 */
        trunkDragPreview=null;
        /* [v920] 编辑拖点吸附：捕捉开启时松手落点走 nearest（与 draw 态 trunkSnapPoint
           同口径；edit 态目标表已把本线 exclude，不会自吸）。用户「拖白点到节点附近
           自动吸上去形成闭环」就是这个入口；没命中目标则原样落点。 */
        var gcjRaw=fromDisplay(ev.target.getLatLng());
        var _eS=snapOn?snapApi():null, _eHit=_eS?_eS.nearest(gcjRaw):null;
        var gcj=_eHit?{lat:+_eHit.lat,lng:+_eHit.lng}:gcjRaw;
        var target={lat:+gcj.lat,lng:+gcj.lng};
        var prev=idx>0?S.readPoint(raw[idx-1]):null;
        var next=idx<raw.length-1?S.readPoint(raw[idx+1]):null;
        var nearM=Math.min(prev?trunkDistM(prev,target):Infinity, next?trunkDistM(next,target):Infinity);
        var nearPx=Math.min(prev?trunkDistPx(prev,target):Infinity, next?trunkDistPx(next,target):Infinity);
        var res;
        if(nearM<=E.MERGE_M || nearPx<=MERGE_PX){
          /* 拖到邻点上 = 想把这个拐点并掉。removeVertex 拒绝（只剩两点）时不写库，
             applyTrunkEdit 照常重画 ⇒ 手柄弹回原位，等于整次拖拽被回滚。 */
          res=applyTrunkEdit(function(nx){
            var rr=E.removeVertex(nx,entry.id,idx);
            return rr.ok?{ok:true,trunk:rr.trunk}:{ok:false,error:rr.error};
          },{silent:true});
          if(res.ok) tip('拐点已并到相邻点上（相距不足 0.3 m）。');
          else tip(res.error||'这个拐点不能删除：这条线至少要保留两个拐点。');
        }else{
          res=applyTrunkEdit(function(nx){
            var mv=E.moveVertex(nx,entry.id,idx,target.lat,target.lng);
            return mv.ok?{ok:true,trunk:mv.trunk}:{ok:false,error:mv.error};
          },{silent:true});
          if(!res.ok) tip(res.error||'拐点未保存。');
        }
      });
      trunkEditLayers.push(mk);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     [v838] 节点标记（水源进水口 / 分水三通）+ 右侧属性面板（四期）
     ──────────────────────────────────────────────────────────────────────
     分工：计算与面板渲染全在 mod/trunk-panel.js（纯函数 + DOM，Node 单测锁着）；
     本段只负责三件事——喂数据、把面板改的字段走 commitTrunks 写回、把标记画到地图上。
     ★ 水源进水口**全方案唯一**：写 source 时必须主动清掉其它干线上的 source。
       不主动清也能"用"，但 normalize 会在读取时按顺序丢弃多余的 source ⇒
       用户会看到"我标的水源自己跑了"，而且换一次读取顺序就是另一个结果。
     ★ 标记不画在 measureGroup 里：那个组在测距/清除时会被整体清空，标记会跟着消失。
     ══════════════════════════════════════════════════════════════════════ */
  var trunkNodeLayers=[];
  var NODE_STYLE={
    source:{radius:8,color:'#1d4ed8',weight:2,fillColor:'#2563eb',fillOpacity:1},
    tee:{radius:5,color:'#9a3412',weight:1.5,fillColor:'#f97316',fillOpacity:1}
  };
  var NODE_LABEL={plain:'普通拐点',source:'水源进水口',tee:'分水三通节点'};
  var V_LABEL={low:'偏低',good:'经济',warn:'偏高',bad:'超标'};

  function renderTrunkNodes(){
    trunkNodeLayers.forEach(function(l){ if(l&&map.hasLayer(l)) trunkGroup.removeLayer(l); });
    trunkNodeLayers=[];
    var S=window.RyTrunkSchema;
    if(!S||!trunkSaved||!Array.isArray(trunkSaved.trunks)) return 0;
    var n=0;
    trunkSaved.trunks.forEach(function(entry){
      var nt=entry&&entry.params&&entry.params.nodeTypes;
      if(!nt||typeof nt!=='object') return;
      var raw=Array.isArray(entry.points)?entry.points:[];
      Object.keys(nt).forEach(function(k){
        var st=NODE_STYLE[nt[k]]; if(!st) return;
        var rd=S.readPoint(raw[Number(k)]);
        if(!rd) return;
        /* interactive:false —— 标记是纯装饰，吃掉点击就没法在它上面继续加点/选线。
           [v841] 进 trunkGroup + 同一个 pane：与折线同生共死（关「测量框」不再只剩标记）。 */
        var mk=L.circleMarker(displayLatLngOf(rd.lat,rd.lng),{
          radius:st.radius,color:st.color,weight:st.weight,
          fillColor:st.fillColor,fillOpacity:st.fillOpacity,
          pane:TRUNK_PANE,
          interactive:false,className:'ry-trunk-node'
        }).addTo(trunkGroup);
        trunkNodeLayers.push(mk); n++;
      });
    });
    return n;
  }

  /* 面板实例延迟创建：地图页首次加载时 .map-wrap 可能还没插入（ensureSharedHost 会搬 DOM），
     所以不在启动阶段建，等第一次要显示时再建。 */
  var trunkPanel=null;
  /* 「用户点过 × 的那条线」的 id：只压住**同一条线**，换一条线照常弹。
     这样既不会关了又自己回来，也不会让用户以为"这个面板坏了打不开"。 */
  var trunkPanelMutedId=null;

  function trunkPanelApi(){ return window.RyTrunkPanel||null; }

  function ensureTrunkPanel(){
    if(trunkPanel) return trunkPanel;
    var P=trunkPanelApi();
    if(!P) return null;
    var host=document.querySelector('#onlineMapSection .map-wrap')||document.querySelector('.map-wrap');
    if(!host) return null;
    trunkPanel=P.mount({
      container:host,
      getEntry:function(id){ return findSavedTrunk(id); },
      getLayout:currentPlotNetwork,
      getDesign:currentDesignNumbers,
      getOdAdvice:currentOdAdvice,
      onPatch:function(id,patch){ patchTrunkParams(id,patch); },
      onRecheck:function(id){ recheckTrunk(id); },
      onMarkNode:function(id){ openNodeDialog(id,activeVertexIdx); },
      onClose:function(){ trunkPanelMutedId=trunkPanel?trunkPanel.currentId():null; }
    });
    return trunkPanel;
  }

  /* [v842] 下游分区管网快照（联合复核用）。**必须做地块归属校验**：
     runye_network_layout 绑在「当前地块锚点」上，不一定是地图上正在编辑的这块地。
     不是同一块时返回 {mismatch:true}（而不是 null）—— 面板据此能说清
     "下游快照属于另一块地"，而不是让人以为"下游还没做"。
     另外把 front 段一并交给面板没关系：面板自己按 kind 排除，它只统计下游。 */
  /* [v843] 三级计算式的三个损失项（联合复核的合计来源）。
     ★ 为什么借 computeThreeLevel 而不是在面板里自己算：
       ① 「总管 + 主管 + 支管」这套最不利路径逻辑已经在那边实现了（含取水点分段、
         支管 Christiansen 折减、手动改径），再写一份必然漂移；
       ② 它的 frontLenUsed 已经改成**优先取在线地图总管实测长度**（inline-09 的
          tlFrontLenUse），所以这里拿到的总管长度就是要的那个数，不用再传一遍；
       ③ 面板显示的合计必须和三级页「扬程计算式」上的数是同一个，否则用户会问哪个对。
     取不到就返回 null —— 面板会退回只做对照，不会编一个 0 出来。
     包在 try 里：computeThreeLevel 读 DOM 输入，页面没初始化时会抛。 */
  function currentDesignNumbers(){
    try{
      if(typeof window.computeThreeLevel!=='function') return null;
      var r=window.computeThreeLevel();
      if(!r||typeof r!=='object') return null;
      return r;
    }catch(e){ return null; }
  }

  /* [v945] 当前地块的逐区面积（m²，分区序号 0 基）。
     来源与地图上分区标签的亩数是同一条：地块库里的 plot.partitions
     （由 runye-map-partition.js 回写，每项带 zoneIndex + area + latLng）。
     取不到返回 null —— 总管口径反推会明说「没有分区面积」，不拿 0 或均分面积瞎猜。 */
  function currentZoneAreas(){
    try{
      var snap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
      if(!snap||!snap.ok||!currentMapPlotId) return null;
      var plot=(snap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);})[0];
      if(!plot||!Array.isArray(plot.partitions)||!plot.partitions.length) return null;
      var out=[];
      plot.partitions.forEach(function(z,i){
        var zi=(z&&isFinite(z.zoneIndex))?Number(z.zoneIndex):i;
        var a=Number(z&&z.area);
        out[zi]=(isFinite(a)&&a>0)?a:null;
      });
      for(var k=0;k<out.length;k++) if(out[k]===undefined) out[k]=null;
      return out.length?out:null;
    }catch(e){ return null; }
  }

  /* [v945] 总管口径反推（供属性面板「推算管径」行）：算法在 mod/trunk-size.js，
     取数与注入在 inline-09 的 window.tlTrunkOdAdvice。这里只负责把「当前地块的分区面积」
     递进去 —— 地图端不重算面积，避免与分区标签/三级页出现两个不同的亩数。 */
  function currentOdAdvice(){
    try{
      if(typeof window.tlTrunkOdAdvice!=='function') return null;
      return window.tlTrunkOdAdvice();
    }catch(e){ return null; }
  }

  function currentPlotNetwork(){
    var store=window.RyIrrigationDataStore;
    if(!store||typeof store.readNetworkLayout!=='function') return null;
    var net=null;
    try{ net=store.readNetworkLayout(); }catch(e){ return null; }
    if(!net||!Array.isArray(net.segments)||!net.segments.length) return null;
    var pid=String(currentMapPlotId==null?'':currentMapPlotId);
    if(!pid) return {mismatch:true,plotId:net.plotId==null?null:String(net.plotId)};
    if(String(net.plotId==null?'':net.plotId)!==pid)
      return {mismatch:true,plotId:net.plotId==null?null:String(net.plotId)};
    return net;
  }

  /* 面板显隐：只在编辑态、且真的选中了一条线时才弹（规格五「选中即弹、无选中隐藏」）。
     用户点过 × 之后不再自动弹 —— 否则每改一次参数它都自己回来，等于关不掉。 */
  function syncTrunkPanel(){
    var P=ensureTrunkPanel();
    if(!P) return;
    var entry=(trunkMode==='edit')?findSavedTrunk(activeTrunkId):null;
    /* [v961] 右缘抽屉据此决定「总管参数」标签点了能不能展开：
       没选中总管时 refresh 会立刻 hide，硬弹只会闪一下（见 mod/map-right-drawer.js）。 */
    try{ if(P.el) P.el.setAttribute('data-ry-has-trunk', entry?'1':'0'); }catch(e){}
    if(!entry){ P.hide(); return; }
    if(trunkPanelMutedId!==null && String(entry.id)===trunkPanelMutedId){ P.hide(); return; }
    trunkPanelMutedId=null;
    P.show(entry);
  }

  /* 面板改字段的唯一写回口。**走 applyTrunkEdit → commitTrunks**：
     这样 revision 冲突、校验、撤销栈记账全都照常发生，面板不需要知道任何存储细节。 */
  function patchTrunkParams(id,patch,tipText){
    if(!id) return {ok:false,error:'no_id'};
    var S=window.RyTrunkSchema;
    if(!S) return {ok:false,error:'no_schema'};
    var res=applyTrunkEdit(function(nx){
      var target=null;
      for(var i=0;i<nx.trunks.length;i++){
        if(String(nx.trunks[i].id)===String(id)){ target=nx.trunks[i]; break; }
      }
      if(!target) return {ok:false,error:'找不到干线 '+id};
      var p=S.normalizeParams(target.params);
      Object.keys(patch).forEach(function(k){ p[k]=patch[k]; });
      /* 再归一一次：管径可能是字符串、nodeTypes 下标可能越界（改完后点数变了）。 */
      p=S.normalizeParams(p);
      if(p.nodeTypes){
        var nt=S.normalizeNodeTypes(p.nodeTypes,(target.points||[]).length);
        if(nt) p.nodeTypes=nt; else delete p.nodeTypes;
      }
      target.params=p;
      return {ok:true,trunk:nx};
    },{silent:true,tipText:tipText||null});
    if(trunkPanel) trunkPanel.refresh();
    /* 参数一改，卡上那个流速就是旧值了 —— 宁可让用户自己再点一次复核，也不要留个假数。 */
    if(res&&res.ok && trunkWarnFor!==null && String(trunkWarnFor)===String(id)) hideTrunkWarn();
    return res;
  }

  /* 【重新复核水力】：按当前参数重算本条干线并回话。
     ★ 现在只算**本条线**（海曾-威廉沿程 + 弯头/三通局部）。规格五要求的
       「总管 + 下游所有分区管网整套复核」还缺地图页的 AI 管网图层，
       那部分不是这里补得出来的（见 AGENT_HANDOFF §26.77 未完成项）。 */
  function recheckTrunk(id){
    var entry=findSavedTrunk(id);
    if(!entry){ tip('先选中一条干线，再复核水力。'); return false; }
    var P=trunkPanelApi();
    if(!P){ tip('属性面板模块未加载，请刷新页面后重试。'); return false; }
    var d=P.compute(entry);
    var code=(entry.params&&entry.params.code)||String(entry.id);
    if(d.v==null){
      tip('总管本线复核尚缺参数（'+code+'）：请在右侧面板填写管径与设计流量；分区流量和扬程按下游管网单独计算。');
      return false;
    }
    var msg='已复核 '+code+'：流速 '+P.fmtV(d.v)+'（'+(V_LABEL[d.vLevel]||'—')+'），沿程 '+P.fmtM(d.hf)+'，局部 '+P.fmtM(d.hj);
    if(d.vLevel==='warn'||d.vLevel==='bad') msg+='。建议加大管径或降低设计流量。';
    else msg+='。';
    tip(msg);
    /* 超标就出黄色提示卡（非阻断：它不遮罩、不抢焦点，后面的点/拖/保存照常）。 */
    maybeWarnTrunk(id);
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     [v839] 流速告警卡（规格六）
     ──────────────────────────────────────────────────────────────────────
     形态：**黄色卡片，不遮罩**。规格要求「只黄色提示，不能阻断绘制/保存/导出/复核」，
     所以没有用 modal 遮罩（遮罩会把后面所有点击吃掉，等于阻断）。
     位置：地图区顶部居中、常驻提示条（top:8）下方，z-index 1185 —— 提示条是 1190，
     两者不会互相盖；也不放右下角（那里是属性面板 + PWA 安装条）。
     屏蔽：`params.warnMuted=true`，**只对单根生效**（判定在 RyTrunkPanel.shouldWarn）。
     ══════════════════════════════════════════════════════════════════════ */
  var trunkWarnEl=null, trunkWarnFor=null;

  function mapWrapEl(){
    return document.querySelector('#onlineMapSection .map-wrap')||document.querySelector('.map-wrap');
  }

  function hideTrunkWarn(){
    if(trunkWarnEl && trunkWarnEl.parentNode) trunkWarnEl.parentNode.removeChild(trunkWarnEl);
    trunkWarnEl=null;
    trunkWarnFor=null;
  }

  function showTrunkWarn(entry, d){
    var P=trunkPanelApi();
    if(!P||!entry) return false;
    var host=mapWrapEl();
    if(!host) return false;
    var id=String(entry.id);
    /* 同一条线重复触发不重建：重建会让卡片闪一下，用户会以为点了两次。 */
    if(trunkWarnEl && trunkWarnFor===id){ trunkWarnEl.dataset.v=String(d.v); return true; }
    hideTrunkWarn();

    var code=(entry.params&&entry.params.code)||id;
    var card=document.createElement('div');
    card.className='ry-trunk-warn';
    card.id='trunkWarnCard';
    card.setAttribute('role','status');      // 非模态：只播报，不夺焦点

    var head=document.createElement('div'); head.className='tw-head';
    var ico=document.createElement('span'); ico.className='tw-ico'; ico.textContent='⚠';
    var ttl=document.createElement('span'); ttl.className='tw-title';
    ttl.textContent='水力提示 · '+code;
    var vv=document.createElement('span'); vv.className='tw-v';
    vv.textContent=P.fmtV(d.v)+(d.vLevel?'（'+(V_LABEL[d.vLevel]||'—')+'）':'');
    head.appendChild(ico); head.appendChild(ttl); head.appendChild(vv);

    var body=document.createElement('div'); body.className='tw-body';
    body.textContent=P.WARN_TEXT;

    var foot=document.createElement('div'); foot.className='tw-foot';
    var okBtn=document.createElement('button'); okBtn.type='button'; okBtn.className='tw-btn';
    okBtn.id='twAck'; okBtn.textContent='知道了';
    var muteBtn=document.createElement('button'); muteBtn.type='button'; muteBtn.className='tw-btn is-quiet';
    muteBtn.id='twMute'; muteBtn.textContent='不再对该总管提醒';
    foot.appendChild(okBtn); foot.appendChild(muteBtn);

    okBtn.onclick=function(){ hideTrunkWarn(); };
    muteBtn.onclick=function(){
      hideTrunkWarn();
      patchTrunkParams(id,{warnMuted:true},'已对 '+code+' 关闭流速提醒（只影响这一根，其它干线仍会提示）。');
    };

    card.appendChild(head); card.appendChild(body); card.appendChild(foot);
    host.appendChild(card);
    trunkWarnEl=card; trunkWarnFor=id;
    return true;
  }

  /* 唯一触发口径：算 → 判（纯函数）→ 弹。判断逻辑一个字都不在这里写。 */
  function maybeWarnTrunk(id){
    var entry=findSavedTrunk(id);
    if(!entry) return false;
    var P=trunkPanelApi();
    if(!P) return false;
    var d=P.compute(entry);
    if(!P.shouldWarn(entry,d).warn) return false;
    return showTrunkWarn(entry,d);
  }

  /* 【标记该节点为水源 / 分水三通】—— 单选窗。用 DOM 拼而不是 innerHTML：
     拐点名称是用户输入，拼字符串就必须转义，漏一次就是 XSS 面。 */
  function openNodeDialog(id,idx){
    var entry=findSavedTrunk(id);
    if(!entry){ tip('先选中一条干线，再标记拐点。'); return false; }
    var raw=Array.isArray(entry.points)?entry.points:[];
    if(!(idx>=0&&idx<raw.length)) idx=(activeVertexIdx>=0&&activeVertexIdx<raw.length)?activeVertexIdx:0;
    var prm=entry.params||{};
    var nt=(prm.nodeTypes&&typeof prm.nodeTypes==='object')?prm.nodeTypes:{};
    var cur=nt[String(idx)]||'plain';
    var labels=(prm.labels&&typeof prm.labels==='object')?prm.labels:{};
    var curLabel=labels[String(idx)]||'';
    var P=trunkPanelApi();
    var types=(P&&P.NODE_TYPES)?P.NODE_TYPES:[
      {key:'plain',label:'普通拐点'},{key:'source',label:'水源进水口'},{key:'tee',label:'分水三通节点'}
    ];

    var old=document.getElementById('ryNodeDialog');
    if(old&&old.parentNode) old.parentNode.removeChild(old);

    var mask=document.createElement('div');
    mask.id='ryNodeDialog'; mask.className='ry-node-mask';

    var box=document.createElement('div'); box.className='ry-node-box';
    var head=document.createElement('div'); head.className='ry-node-head';
    head.textContent='标记拐点（第 '+(idx+1)+' 个）';
    box.appendChild(head);

    var list=document.createElement('div'); list.className='ry-node-list';
    var picked=cur;
    types.forEach(function(t){
      var row=document.createElement('label'); row.className='ry-node-item';
      var r=document.createElement('input');
      r.type='radio'; r.name='ryNodeKind'; r.value=t.key; r.checked=(t.key===cur);
      r.onchange=function(){ picked=t.key; };
      var sp=document.createElement('span'); sp.textContent=t.label;
      row.appendChild(r); row.appendChild(sp); list.appendChild(row);
    });
    box.appendChild(list);

    var nameRow=document.createElement('div'); nameRow.className='ry-node-name';
    var inp=document.createElement('input');
    inp.type='text'; inp.maxLength=12; inp.value=curLabel;
    inp.placeholder='拐点名称（可留空）';
    inp.setAttribute('aria-label','拐点名称');
    nameRow.appendChild(inp); box.appendChild(nameRow);

    var foot=document.createElement('div'); foot.className='ry-node-foot';
    var cancel=document.createElement('button'); cancel.type='button'; cancel.className='ry-node-btn';
    cancel.textContent='取消';
    var ok=document.createElement('button'); ok.type='button'; ok.className='ry-node-btn is-primary';
    ok.textContent='确定';
    foot.appendChild(cancel); foot.appendChild(ok); box.appendChild(foot);

    function close(){ if(mask.parentNode) mask.parentNode.removeChild(mask); }
    cancel.onclick=close;
    ok.onclick=function(){
      var res=applyNodeMark(id,idx,picked,inp.value);
      close();
      if(res&&res.ok) return;
      tip((res&&res.error)||'标记未保存。');
    };
    mask.addEventListener('click',function(ev){ if(ev.target===mask) close(); });

    mask.appendChild(box);
    document.body.appendChild(mask);
    return true;
  }

  function applyNodeMark(id,idx,kind,label){
    var S=window.RyTrunkSchema;
    if(!S) return {ok:false,error:'总管数据模块未加载。'};
    return applyTrunkEdit(function(nx){
      var target=null;
      for(var i=0;i<nx.trunks.length;i++){
        if(String(nx.trunks[i].id)===String(id)){ target=nx.trunks[i]; break; }
      }
      if(!target) return {ok:false,error:'找不到干线 '+id};
      /* 水源全方案唯一：先把其它干线的 source 全部摘掉（同一份 nx 里改，一次写库）。
         ★ normalizeParams 是**浅拷贝**：p2.nodeTypes 与 t.params.nodeTypes 是同一个对象，
           所以要么事后无条件把 p2 写回 t.params，要么只改不改回 —— 后者会留下一个
           空对象 {}（视觉无感，但库里多一条脏数据，而且 normalize 每次读都要清理一遍）。 */
      if(kind==='source'){
        nx.trunks.forEach(function(t){
          if(t===target) return;
          var p2=S.normalizeParams(t.params);
          if(!p2.nodeTypes||typeof p2.nodeTypes!=='object') return;
          var dirty=false;
          Object.keys(p2.nodeTypes).forEach(function(k){
            if(p2.nodeTypes[k]==='source'){ delete p2.nodeTypes[k]; dirty=true; }
          });
          if(!dirty) return;
          if(!Object.keys(p2.nodeTypes).length) delete p2.nodeTypes;
          t.params=p2;
        });
      }
      var p=S.normalizeParams(target.params);
      var m=(p.nodeTypes&&typeof p.nodeTypes==='object')?JSON.parse(JSON.stringify(p.nodeTypes)):{};
      if(kind==='plain') delete m[String(idx)];
      else m[String(idx)]=kind;
      var nm=S.normalizeNodeTypes(m,(target.points||[]).length);
      if(nm) p.nodeTypes=nm; else delete p.nodeTypes;

      /* 拐点名称是 v833 就有的能力，标记窗口顺带保留它（同一个拐点上的两条信息）。 */
      var txt=String(label==null?'':label).trim().slice(0,12);
      var lb=(p.labels&&typeof p.labels==='object')?p.labels:{};
      if(txt) lb[String(idx)]=txt; else delete lb[String(idx)];
      if(Object.keys(lb).length) p.labels=lb; else delete p.labels;

      target.params=p;
      return {ok:true,trunk:nx};
    },{tipText:'第 '+(idx+1)+' 个拐点已标记为'+(NODE_LABEL[kind]||kind)+'。'});
  }

  /* 所有编辑动作的唯一出口：写库 → 复核 activeTrunkId 是否还存在 → 重画。
     失败也要重画：拖拽期间线是被乐观改过的，不重画就和库里不一致了。
     注意这里**不再补 tip** —— 提示由 commitTrunks 或调用方负责，两层都提示会弹两遍。 */
  function applyTrunkEdit(fn,opts){
    var res=commitTrunks(fn,opts||{});
    var has=!!(trunkSaved&&Array.isArray(trunkSaved.trunks)&&trunkSaved.trunks.length);
    if(!has && trunkMode==='edit'){
      /* 删掉最后一条 = 这块地没有总管了，编辑态没有对象可编辑 ⇒ 直接退回 idle，
         按钮也会跟着置灰。「留在一个空的编辑态里」会让用户以为还能右键。 */
      setTrunkMode('idle');
      return res;
    }
    if(!findSavedTrunk(activeTrunkId)){ activeTrunkId=null; activeVertexIdx=-1; }
    renderTrunkDraft();
    renderTrunkEditHandles();
    updateStatusbar();
    syncTrunkUI();
    /* 编辑生效后让面板重画只读量：库里的值可能和用户刚敲的不同（校验会把字符串转数/清成 null）。 */
    if(trunkPanel) trunkPanel.refresh();
    syncTrunkPanel();
    if(trunkMode==='draw') refreshSnapTargets();
    return res;
  }

  /* ===== [v834] 撤销 / 重做（四期）=====
     只回滚 plot.trunk 这一个数据域：
       · 已回传的系统分区管网（二级页 designState / tlDiagramData）—— 一根头发都不碰
       · 成组管路（W.trunk.lines / ge.trunkPipes）—— 它有自己的撤销系统，绝不接管
     快照里也只有 {trunk, activeTrunkId}，不含 polyLatLng、不含 revision（见模块文件头）。 */
  function applyHistorySnapshot(snap, verb){
    if(!snap) return false;
    var target=snap.trunk?JSON.parse(JSON.stringify(snap.trunk)):null;
    /* 照样走 commitTrunks：版本校验、validate、revision+1 一个都不跳过。
       「撤销」不是"把旧字节覆盖回去"，它也是一次正常写入。 */
    var res=applyTrunkEdit(function(){ return {ok:true,trunk:target}; },{noHistory:true});
    if(!res.ok) return false;
    /* 恢复选中态：快照里那条还在就选它，否则退回主干（打断/合并会让原 id 消失）。 */
    var want=snap.activeTrunkId;
    if(want && findSavedTrunk(want)){
      activeTrunkId=String(want);
    }else{
      var S=window.RyTrunkSchema, m=(S&&trunkSaved)?S.pickMainTrunk(trunkSaved):null;
      activeTrunkId=m?String(m.id):null;
    }
    activeVertexIdx=-1;
    renderTrunkDraft();
    renderTrunkEditHandles();
    updateStatusbar();
    syncTrunkUI();
    tip(verb+'：当前地块'+(res.trunk?('共 '+res.trunk.trunks.length+' 条干线'):'已没有总管')+'。');
    return true;
  }
  function undoTrunk(){
    if(!trunkHistory){ tip('撤销模块未加载；请刷新页面后重试。'); return false; }
    var step=trunkHistory.undo();
    if(!step.ok){ tip('没有可撤销的总管操作了。'); return false; }
    var done=applyHistorySnapshot(step.state,'已撤销');
    /* 写失败（地块库被别的页面改过）⇒ 游标退回原位，别让"栈说有、库里没有"。
       这一句漏掉的话，用户会连按两次 Ctrl+Z 才看到反应，然后发现少了一步。 */
    if(!done) trunkHistory.redo();
    return done;
  }
  function redoTrunk(){
    if(!trunkHistory){ tip('撤销模块未加载；请刷新页面后重试。'); return false; }
    var step=trunkHistory.redo();
    if(!step.ok){ tip('没有可重做的总管操作了。'); return false; }
    var done=applyHistorySnapshot(step.state,'已重做');
    if(!done) trunkHistory.undo();
    return done;
  }

  /* 点到线段的距离（屏幕像素）。做命中判定必须在像素里算：
     按米算会随纬度漂，而且 mousemove/contextmenu 每帧调 map.distance() 会掉帧。 */
  function segDistPx(p,a,b){
    var vx=b.x-a.x, vy=b.y-a.y, len2=vx*vx+vy*vy;
    if(len2<=0.000001) return Math.sqrt((p.x-a.x)*(p.x-a.x)+(p.y-a.y)*(p.y-a.y));
    var t=((p.x-a.x)*vx+(p.y-a.y)*vy)/len2;
    t=t<0?0:(t>1?1:t);
    var dx=p.x-(a.x+t*vx), dy=p.y-(a.y+t*vy);
    return Math.sqrt(dx*dx+dy*dy);
  }
  function hitTestTrunk(cp,tolPx){
    var S=window.RyTrunkSchema;
    if(!S||!trunkSaved||!Array.isArray(trunkSaved.trunks)) return null;
    var tol=isFinite(tolPx)?tolPx:8;
    var vBest=null, vBestD=11;      // 拐点优先（11px 内算命中拐点）
    var sBest=null, sBestD=tol;     // 其次算命中线身
    trunkSaved.trunks.forEach(function(entry){
      var disp=(entry.points||[]).map(function(q){
        var rd=S.readPoint(q);
        return rd?projectToContainer(rd.lat,rd.lng):null;
      });
      for(var i=0;i<disp.length;i++){
        if(!disp[i]) continue;
        var dv=Math.sqrt((cp.x-disp[i].x)*(cp.x-disp[i].x)+(cp.y-disp[i].y)*(cp.y-disp[i].y));
        if(dv<=vBestD){ vBestD=dv; vBest={id:String(entry.id),idx:i}; }
      }
      for(var j=1;j<disp.length;j++){
        if(!disp[j-1]||!disp[j]) continue;
        var d=segDistPx(cp,disp[j-1],disp[j]);
        if(d<sBestD){ sBestD=d; sBest={id:String(entry.id),idx:-1}; }
      }
    });
    return vBest||sBest;
  }

  /* 菜单壳：懒建一次，position:fixed。
     z-index 必须高过 .ry-pwa-install（2000），否则首访未安装时菜单右下角那一截点不到。 */
  function ensureTrunkMenu(){
    if(trunkCtxMenu && document.body.contains(trunkCtxMenu)) return trunkCtxMenu;
    var el=document.createElement('div');
    el.id='trunkCtxMenu';
    el.className='ry-float-card trunk-ctx-menu';
    el.setAttribute('role','menu');
    el.hidden=true;
    document.body.appendChild(el);
    /* 点空白关闭。用捕获阶段：菜单外壳自己的空白区也要关，但点按钮不算空白。 */
    document.addEventListener('mousedown',function(ev){
      if(el.hidden) return;
      if(el.contains(ev.target)) return;
      closeTrunkMenu();
    },true);
    trunkCtxMenu=el;
    return el;
  }
  function closeTrunkMenu(){ if(trunkCtxMenu) trunkCtxMenu.hidden=true; }

  function openTrunkMenu(clientX,clientY,id,idx){
    var E=window.RyTrunkEdit;
    if(!E){ tip('编辑模块未加载，无法打开菜单；请刷新页面后重试。'); return; }
    activeTrunkId=(id===null||id===undefined)?null:String(id);
    activeVertexIdx=(typeof idx==='number')?idx:-1;
    var entry=findSavedTrunk(activeTrunkId);
    var pts=entry&&Array.isArray(entry.points)?entry.points:[];
    var connected=entry?E.connectedIds(trunkSaved,entry.id,trunkDistM):[];
    var items=E.buildMenuItems({
      activeId:activeTrunkId,
      points:pts,
      vertexIndex:activeVertexIdx,
      connectedIds:connected,
      clipboardEmpty:paramsClipboard===null
    });
    var el=ensureTrunkMenu();
    el.innerHTML='';
    var head=document.createElement('div');
    head.className='tcm-head';
    head.textContent='干线 '+activeTrunkId+(connected.length?(' · 相连 '+connected.length+' 条'):'');
    el.appendChild(head);
    items.forEach(function(it,order){
      var b=document.createElement('button');
      b.type='button';
      b.className='tcm-item';
      b.setAttribute('data-act',it.key);
      b.textContent=(order+1)+'. '+it.label;
      b.disabled=!it.enabled;
      b.onclick=function(ev){ if(ev) ev.preventDefault(); runTrunkMenuAction(it.key); };
      el.appendChild(b);
    });
    el.hidden=false;
    /* 先落 0 再量：隐藏元素量不出尺寸，贴边翻转就永远不生效。 */
    el.style.left='0px'; el.style.top='0px';
    var w=el.offsetWidth, h=el.offsetHeight;
    var vw=window.innerWidth||document.documentElement.clientWidth;
    var vh=window.innerHeight||document.documentElement.clientHeight;
    var x=clientX, y=clientY;
    if(x+w>vw-8) x=Math.max(8,vw-w-8);
    if(y+h>vh-8) y=Math.max(8,vh-h-8);
    el.style.left=x+'px';
    el.style.top=y+'px';
    renderTrunkDraft();
    renderTrunkEditHandles();
    updateStatusbar();
  }

  function runTrunkMenuAction(key){
    var E=window.RyTrunkEdit, S=window.RyTrunkSchema;
    var id=activeTrunkId, idx=activeVertexIdx;
    closeTrunkMenu();
    if(!E||!S||!id) return;
    var entry=findSavedTrunk(id);
    if(!entry) return;

    if(key==='delete'){
      if(!confirm('删除干线 '+id+'？\n\n这条线的折点与参数会一并删除，本版还不能撤销。')) return;
      applyTrunkEdit(function(nx){
        var r=E.removeTrunk(nx,id);
        return r.ok?{ok:true,trunk:r.trunk}:{ok:false,error:r.error};
      },{tipText:'已删除干线 '+id+'。'});
      return;
    }

    if(key==='split'){
      var newId=null;
      applyTrunkEdit(function(nx){
        var r=E.splitTrunk(nx,id,idx,S.makeId);
        if(!r.ok) return {ok:false,error:r.error};
        newId=r.newId;
        /* 拐点标签按**下标**存，切开/合并后下标全变 ⇒ 直接丢弃，
           宁可不显示，也不能让标签串到别的拐点上（那会误导现场施工）。 */
        r.trunk.trunks.forEach(function(t){ if(t.params) delete t.params.labels; });
        return {ok:true,trunk:r.trunk};
      },{});
      if(newId) tip('已在第 '+(idx+1)+' 个拐点处打断：前段保留 '+id+'，后段是 '+newId+'（参数已复制，互不影响）。');
      return;
    }

    if(key==='merge'){
      var conn=E.connectedIds(trunkSaved,id,trunkDistM);
      if(!conn.length){ tip('没有首尾相接的干线可合并（相差需在 0.3 m 内）。'); return; }
      var target=conn[0];
      /* 编号与参数沿用**列表里在前的那条**（用户点名的语义），先算好再确认。 */
      var atSelf=trunkIndexById(id), atOther=trunkIndexById(target);
      var keepId=(atSelf>=0&&atOther>=0&&atSelf<atOther)?id:target;
      var dropId=(keepId===id)?target:id;
      if(!confirm('合并 '+keepId+' 与 '+dropId+'？\n\n将删除 '+dropId+'，编号与参数沿用 '+keepId+'（列表里在前的那条）。')) return;
      applyTrunkEdit(function(nx){
        var r=E.mergeTrunks(nx,keepId,dropId,trunkDistM);
        if(!r.ok) return {ok:false,error:r.error};
        r.trunk.trunks.forEach(function(t){ if(t.params) delete t.params.labels; });
        return {ok:true,trunk:r.trunk};
      },{});
      activeTrunkId=keepId;
      renderTrunkDraft(); renderTrunkEditHandles(); syncTrunkUI();
      return;
    }

    if(key==='copyParams'){
      var cp=JSON.parse(JSON.stringify(entry.params||{}));
      delete cp.labels;            // 拐点标签跟着拐点走，不跟着参数走
      paramsClipboard=cp;
      tip('已复制 '+id+' 的参数（'+(cp.material||'PE')+' / DN'+(cp.dn==null?'—':cp.dn)+' / '+(cp.designFlow==null?'—':cp.designFlow)+' m³/h）。');
      return;
    }

    if(key==='pasteParams'){
      if(paramsClipboard===null){ tip('剪贴板是空的：先对某条干线用「复制参数」。'); return; }
      var clip=JSON.parse(JSON.stringify(paramsClipboard));
      applyTrunkEdit(function(nx){
        for(var i=0;i<nx.trunks.length;i++){
          if(String(nx.trunks[i].id)!==String(id)) continue;
          var keepLabels=nx.trunks[i].params&&nx.trunks[i].params.labels;
          var merged=S.normalizeParams(clip);
          if(keepLabels) merged.labels=keepLabels;   // 粘贴参数不该冲掉本线的拐点标签
          nx.trunks[i].params=merged;
          return {ok:true,trunk:nx};
        }
        return {ok:false,error:'找不到干线 '+id};
      },{tipText:'参数已粘贴到 '+id+'。'});
      return;
    }

    if(key==='markVertex'){
      /* [v838] 原来是「prompt 给拐点起个名字」，规格四要的是**节点类型单选**
         （普通拐点 / 水源进水口 / 分水三通节点）。弹窗顺带保留了命名输入，
         所以旧数据里的 params.labels 不会因为这次改版变得改不回去。 */
      if(idx<0){ tip('先右键点在某一个拐点上，再选「标记当前拐点」。'); return; }
      openNodeDialog(id,idx);
      return;
    }
  }

  /* 进入编辑：必须当前地块有已保存的干线。trunkId 省略 = 选主干。 */
  function enterTrunkEdit(trunkId){
    if(!currentMapPlotId){ tip('请先在地图中选中已保存的地块，再编辑总管。'); return false; }
    var priorSnap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
    var prior=priorSnap&&priorSnap.ok?(priorSnap.plots||[]).filter(function(p){return p&&String(p.id)===String(currentMapPlotId);}):[];
    if(prior.length!==1){ tip('当前地块记录无法唯一确认，请重新回传地块后再编辑总管。'); return false; }
    var saved=loadSavedTrunkFor(prior[0]);
    if(!saved||!Array.isArray(saved.trunks)||!saved.trunks.length){
      tip('当前地块还没有保存过总管；先点「🟠 绘制」画一条。');
      return false;
    }
    trunkSaved=saved;
    trunkOwnerPlotId=String(currentMapPlotId);   /* [v993] 编辑态同样锁定归属 */
    trunkTargetPlotId=String(currentMapPlotId);
    var S=window.RyTrunkSchema, want=trunkId?String(trunkId):null;
    if(!want||!saved.trunks.some(function(t){return String(t.id)===want;})){
      var m=S?S.pickMainTrunk(saved):null;
      want=String(m?m.id:saved.trunks[0].id);
    }
    activeTrunkId=want;
    activeVertexIdx=-1;
    /* 重新进入编辑时，应允许属性面板再次自动弹出；关闭面板只对当前编辑会话生效。 */
    trunkPanelMutedId=null;
    setTrunkMode('edit');
    refreshSnapTargets();      // 画另一条线时还能吸到这条线的拐点
    tip('编辑总管：点线选中，拖白点改拐点（拖到邻点上=并掉它），右键开菜单，Esc 退出。');
    return true;
  }
  function exitTrunkEdit(){
    if(trunkMode!=='edit') return;
    setTrunkMode('idle');
    tip('已退出总管编辑；已保存的线没有被改动。');
  }

  var editTrunkBtn=document.getElementById('btnEditTrunk');
  if(editTrunkBtn)editTrunkBtn.onclick=function(){
    if(trunkMode==='edit'){
      var selected=findSavedTrunk(activeTrunkId);
      /* 编辑中关闭过信息面板，再点「编辑中」先恢复面板；再次点击才退出编辑。 */
      if(selected && trunkPanelMutedId!==null && String(selected.id)===trunkPanelMutedId){
        trunkPanelMutedId=null;
        syncTrunkPanel();
        return;
      }
      exitTrunkEdit();
      return;
    }
    enterTrunkEdit(null);
  };
  /* 启动时同步一次按钮态：没有已保存的干线时「✎ 编辑总管」必须是灰的。
     不调这一下，按钮就保持 HTML 里的初始态（可点），点进去才被告知"还没有总管"。 */
  syncTrunkUI();

  /* ===== [v831] 地图快捷键层 =====
     全站原来只有搜索框一处 keydown（本文件 :990 附近），所以这套是新建的，
     必须自己处理「输入框聚焦时不吃键」—— 否则在搜索框里打 m 会退出地图模式。 */
  function isTypingTarget(el){
    if(!el || el===document.body) return false;
    var tag=(el.tagName||'').toUpperCase();
    return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||el.isContentEditable===true;
  }
  function mapSectionVisible(){
    var sec=document.getElementById('onlineMapSection');
    if(!sec || sec.hidden) return false;
    return sec.offsetParent!==null || sec.getClientRects().length>0;
  }
  document.addEventListener('keydown', function(e){
    if(e.defaultPrevented) return;
    /* [v834] 撤销 / 重做必须先于「带修饰键就早退」那一行，否则永远进不来。
       ★ 输入框里**不接管**：那里 Ctrl+Z 是浏览器原生的文本撤销，抢过来用户就打不了字，
         而且这种"抢键"错误用户只会描述成"输入框抽风"，极难定位。 */
    var mod=e.ctrlKey||e.metaKey;
    if(mod && !e.altKey){
      var km=String(e.key||'').toLowerCase();
      if(km==='z'||km==='y'){
        if(isTypingTarget(document.activeElement)) return;
        if(!mapSectionVisible()) return;
        /* 绘制中且还有草稿点：Ctrl+Z = 撤掉最后一个**草稿**点（与「撤销点」按钮同义）。
           不这么做的话，用户画到第 5 个点时按 Ctrl+Z，会看到**上一条已保存的干线**消失 ——
           这是"撤销把别的东西改掉了"最典型的惊吓。草稿点撤完才轮到历史栈。 */
        if(km==='z' && !e.shiftKey && trunkMode==='draw' && trunkPoints.length){
          e.preventDefault();
          trunkPoints.pop();
          renderTrunkDraft();
          updateStatusbar();
          tip('已撤掉最后一个草稿点（还剩 '+trunkPoints.length+' 个）。草稿撤完后 Ctrl+Z 才会撤销已保存的历史。');
          return;
        }
        e.preventDefault();
        if(km==='y'||e.shiftKey) redoTrunk(); else undoTrunk();
        return;
      }
    }
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(isTypingTarget(document.activeElement)) return;
    if(!mapSectionVisible()) return;
    var k=String(e.key||'').toLowerCase();
    if(k==='m'){
      var b=document.getElementById('btnDrawTrunk');
      if(b && !b.disabled){ b.click(); e.preventDefault(); }
      return;
    }
    /* [v832] S 切换捕捉。任何时刻都允许切（不必先进绘制态），与按钮同源。 */
    if(k==='s'){
      var sb=document.getElementById('btnSnapToggle');
      if(sb){ setSnapOn(!snapOn); e.preventDefault(); }
      return;
    }
    /* [v833] E 进出编辑态。同样只在按钮真的可用时才响应（没干线可编辑就别切）。 */
    if(k==='e'){
      var eb=document.getElementById('btnEditTrunk');
      if(eb && !eb.disabled){ eb.click(); e.preventDefault(); }
      return;
    }
    if(trunkMode==='edit'){
      if(k==='escape'){ closeTrunkMenu(); exitTrunkEdit(); e.preventDefault(); }
      return;
    }
    if(trunkMode!=='draw') return;
    if(k==='enter'){ commitTrunkDraft(); e.preventDefault(); }
    else if(k==='escape'){ setTrunkMode('idle'); tip('已取消本次总管绘制，草稿已丢弃；已保存的线没有被改动。'); e.preventDefault(); }
  });
  /* 双击缩放已关，这里再挡一次冒泡：否则 Leaflet 仍会把这个 dblclick 传给其它 handler。 */
  map.on('dblclick', function(e){
    if(trunkMode==='draw'){ L.DomEvent.stop(e); }
  });
  map.on('mousemove', function(e){
    if(!drawing || points.length===0) return;
    if(rubber) measureGroup.removeLayer(rubber);
    var last=points[points.length-1];
    rubber=L.polyline([toDisplay(last),[e.latlng.lat,e.latlng.lng]],{color:'#ff6b00',weight:2,dashArray:'6,4',opacity:.9}).addTo(measureGroup);
  });
  map.on('mouseout', function(){ if(rubber){ measureGroup.removeLayer(rubber); rubber=null; } });
  /* ===== [v310 2026-10-08 用户要求] 绘制态右键=截止确认 =====
   * 用户报：点「✅ 完成并画下一块」后绘制态保持开启（v186 连续绘制），左键落点仍在给
   * **新块**加顶点；此时右键既开不了地块弹窗（绘制中 overlay-pane path 被 pointer-events:none
   * 禁掉，v298k 的 contextmenu 弹窗收不到事件）、也没有任何截止手段 ⇒ 表现为「右键出弹窗
   * 好像有问题」「想停停不下来」。
   * 对策（绘制态 map 级 contextmenu = 截止确认）：
   *   ① 当前草稿 ≥3 有效顶点 → 先走 saveCurrentDraftToLibrary 入库（与「完成」同一口径，不丢活）；
   *   ② clearDraft + setDrawing(false) 退出绘制态；
   *   ③ 退出后 overlay 恢复可交互：左键点选地块 / 右键开 v298k 弹窗 → 「回传」送地块分区页。
   * 非绘制态直接 return：右键语义完全留给 v298k 地块弹窗，不截胡。
   * 原生菜单：Leaflet _fireDOMEvent 对 contextmenu 仅在「有命中目标」时 preventDefault
   * （vendored pwa/vendor/leaflet.js 已核实 "contextmenu"===e&&O(t) 在 targets 非空分支内），
   * 挂上本监听后 targets=[map] 恒非空 ⇒ 绘制态右键不再弹浏览器原生菜单。 */
  map.on('contextmenu', function(e){
    /* [v833] 编辑态：右键 = 打开 6 项菜单。命中判定在**地图级**统一做，
       不给每条线各挂一个 handler —— 那些 handler 拿不到「点在线身还是拐点上」的一致口径，
       而且打断需要的是拐点下标，只能由同一套 hitTest 给出。 */
    if(trunkMode==='edit'){
      var hit=hitTestTrunk(e.containerPoint,8);
      if(hit){
        L.DomEvent.stop(e);
        var oe=e.originalEvent||{};
        var cx=isFinite(oe.clientX)?oe.clientX:0, cy=isFinite(oe.clientY)?oe.clientY:0;
        openTrunkMenu(cx,cy,hit.id,hit.idx);
      }else{
        closeTrunkMenu();
      }
      return;
    }
    if(!drawing) return;                  // 非绘制态：右键=v298k 地块弹窗，不截胡
    var hadShape = points.length>=3 && geodesicArea(points)>0;
    var savedName='';
    if(hadShape){
      var saved=saveCurrentDraftToLibrary({silent:true});
      if(saved) savedName=saved.name;
    }
    clearDraft();
    setDrawing(false);
    tip(hadShape
      ? (savedName ? '✅ 右键截止：已保存「'+savedName+'」并退出绘制 —— 左键点选地块，或右键地块开弹窗回传分区。'
                   : '右键截止：已退出绘制（入库失败，草稿已清）—— 左键点选地块，或右键地块开弹窗回传分区。')
      : '右键截止：已退出绘制（草稿不足 3 点未入库）—— 左键点选地块，或右键地块开弹窗回传分区。');
  });

  // ===== 按钮 =====
  /* [v951] 工具条图标钮（用户：「能用图例的尽量用图例，手放在上面提示功能，
     图例样式跟分区与管路页面的统一」）。
     - 图标来自 mod/ry-icons.js（18px 线性 SVG，按 BY_ID 精确挂：本组里有**两组同名**
       的「完成」和一对「撤销点 / 撤销」，标签正则必然错配，所以必须走精确表）；
     - decorate 幂等。[v952] 主装饰点是 ry-icons.js 载入时的 iconizeAll（容器带
       data-ry-iconize 就自动挂），这里只留**第二次机会**：万一图标脚本比本文件晚到、
       或容器被别处重建，这一行还能补上。文案留在 DOM 里由 CSS 隐藏（挂上图标才压字号 0，
       没挂之前显示文字 —— 慢网不许闪一排空方块），悬停说明走原生 title；
     - 之后**任何**文案变化都不许写 `btn.textContent=`（会把刚挂的 SVG 一起擦掉，
       v824 的坑：点一下图标就永久变空白方块），一律走 setBtnLabel。 */
  function setBtnLabel(b, t){
    if(!b) return;
    if(window.RyIcons && typeof window.RyIcons.setLabel === 'function') window.RyIcons.setLabel(b, t);
    else b.textContent = t;
  }
  /* [v972 用户要求：地图绘制工具栏恢复文字钮] 原此处有第二次 decorate(mapDrawTools)
     —— 已随 data-ry-iconize 一起移除，容器不再被图标化；setBtnLabel 走 RyIcons.setLabel
     时按钮没有 data-ry-icon 属性，不会补挂图标，纯文字更新，安全。 */
  var btnDraw=document.getElementById('btnDraw');
  function setDrawing(on){
    if(on&&reservoirPlaceMode)setReservoirPlaceMode(false);
    if(on && trunkMode!=='idle') setTrunkMode('idle');   // [v831] 互斥收口：一律走 setTrunkMode，别在这里手写清状态（v833 起含 edit）
    if(on && measuring) finishMeasure();
    if(!on && rubber){measureGroup.removeLayer(rubber);rubber=null;}
    if(on) setAddMode(false);            // [v153] 与「加点」互斥：一开始画框就退出加点模式
    drawing=on;
    btnDraw.classList.toggle('btn-on',drawing);
    btnDraw.setAttribute('aria-pressed',drawing?'true':'false');
    map.getContainer().classList.toggle('drawing',drawing);
    if(drawing) map.dragging.disable(); else map.dragging.enable();
    setBtnLabel(btnDraw, drawing ? '绘制中…' : '开始画框');
    document.getElementById('tip').textContent = drawing
      ? '十字光标处即落点：依次点击地块边界顶点；点「完成」即可定稿并**直接接着画下一块**（可连画多块，最后再成组；想停时**右键地图**截止）。'
      : '点击工具条上的「开始画框」后，在卫星图上依次点击地块边界顶点即可；点「完成」自动保存该块、清空画布并继续下一块。';
    /* [v831] 画框会改变「绘制」总管按钮的可用性（互斥矩阵），必须通知一次 UI；
       漏了这行就会出现"正在画框，总管按钮却还能点进去"。 */
    syncTrunkUI();
  }
  btnDraw.onclick=function(){ setDrawing(!drawing); };
  // [v153] 加点模式开关：需先有框（≥2 点）才有「边」可插点
  document.getElementById('btnAddPt').onclick=function(){
    if(!addMode && points.length<2){ tip('先点「开始画框」画出一个框（至少 2 个顶点），再用「加点」在框线上插点。'); return; }
    setAddMode(!addMode);
  };
  document.getElementById('btnFinish').onclick=function(){
    if(rubber){measureGroup.removeLayer(rubber);rubber=null;}
    refresh();
    if(addMode) setAddMode(false);  // [v153] 完成后顺手退出加点模式
    /* ===== [v186 2026-10-03] 「完成」= 本块定稿 → 清空 → 紧接着画下一块 =====
     * 用户报（截图）：点「完成」闭合成一块之后，没法再画第二块、第三块小地块，
     *   也就谈不上「把这几块拼起来」。
     * 根因：原实现只 setDrawing(false)，points/markers 仍被刚闭合的那块占着 ⇒
     *   再点「开始画框」是**往第一块上继续加点**，而不是开一块新的。
     * 对策（用户拍板：自动入库 + 清空 + 继续画）：
     *   ① 有 ≥3 个有效顶点 → 自动存入地块库（免去「还得再点一次保存」，也防手一抖
     *      点了完成却没保存、刷新就没了）；不足 3 点视为无效草稿，不存、只清。
     *   ② 清空画布（points/markers/poly + currentMapPlotId 复位），使下一块从零开始。
     *   ③ 保持绘制态（drawing 仍为 on）并给出提示 —— 用户可以**连续画**，
     *      想停就再点一次「开始画框」退出。
     * 注意：入库走 saveCurrentDraftToLibrary()，与「💾 保存地块」共用同一套字段
     *      （含 polyLatLng/center/geo），保证地图叠加与回传二级页都拿得到经纬度。
     */
    var hadShape = points.length>=3 && geodesicArea(points)>0;
    if(hadShape){
      var saved = saveCurrentDraftToLibrary({silent:true});
      clearDraft();
      if(!drawing) setDrawing(true);      // 保持可继续画：面板已清空，落点即新块
      tip(saved
        ? '✅ 已保存「'+saved.name+'」（'+saved.mu+' 亩）并清空画布 —— 可直接点击画下一块，画完继续点「完成」；不想再画右键地图截止。'
        : '已清空画布 —— 可直接点击画下一块。');
    } else {
      // 无效草稿（点太少）：只清空，不入库
      clearDraft();
      if(!drawing) setDrawing(true);
      tip(points.length===0
        ? '已清空。请点击地图依次描绘下一块的边界顶点，画完点「完成」。'
        : '顶点不足 3 个、无法成块，已清空。请重新描绘地块边界。');
    }
  };
  document.getElementById('btnUndo').onclick=function(){
    if(points.length===0) return;
    // [v153] 「撤销」优先撤掉**最近新增**的那个顶点（加点流程下才有意义）；
    //   没有插入记录时 i=markers.length-1，与旧行为（弹队尾）逐字等价。
    var i = lastAdded ? markers.indexOf(lastAdded) : -1;
    if(i<0) i = markers.length-1;
    points.splice(i,1);
    var m=markers.splice(i,1)[0];
    if(m){ measureGroup.removeLayer(m); if(m===lastAdded) lastAdded=null; }
    refresh();
    if(addMode) buildMidHandles();
  };
  document.getElementById('btnClear').onclick=function(){
    /* [v186] 改走共用的 clearDraft()：原来这里有一份和「完成」几乎重复的清空逻辑，
       两处一旦不同步（例如漏清 lastAdded）就会出现「清完还能撤销出鬼影」这类怪象。
       收成一份后，「完成」与「清除」的清空口径天然一致。 */
    clearDraft();
    tip('已清空画布，可重新开始描绘地块。');
  };

  // 底图切换
  var baseArr=['高德卫星','高德卫星+路网','OSM街道'];
  document.getElementById('btnBase').onclick=function(){
    var center=fromDisplay(map.getCenter()), zoom=map.getZoom();
    switchingBase=true;
    try{
      map.removeLayer(baseLayers[baseArr[baseIdx]]);
      baseIdx=(baseIdx+1)%baseArr.length;
      baseLayers[baseArr[baseIdx]].addTo(map);
      map.setView(toDisplay(center),zoom,{animate:false});
      markers.forEach(function(m,i){m.setLatLng(toDisplay(points[i]));});
      if(rubber){measureGroup.removeLayer(rubber);rubber=null;}
      refresh(); renderMeasure(); if(addMode) buildMidHandles();
      if(searchMark && lastPick) markSearch(lastPick);
      if(rymHandle && rymHandle.refresh) rymHandle.refresh();
      this.textContent='底图:'+baseArr[baseIdx].replace('高德','');
    }finally{switchingBase=false;saveView();}
  };

  // 定位三亚
  document.getElementById('btnLocate').onclick=function(){
    var c = RunyeGeo ? RunyeGeo.wgs2gcj(18.2528, 109.5119) : { lat:18.2528, lng:109.5119 };
    map.setView(toDisplay(c),15);
  };

  // ===== 地点搜索（2026-09-19 v60：多源兜底 + 候选点选）=====
  // 旧版只打 Nominatim 且无超时，国内常长时间无响应（表现为一直「搜索中…」）。
  // 现改为：主源 Photon（komoot，免 Key、国内可达、返回中文地名与 extent 包围盒），
  // 备源 Nominatim；单源 12s 超时逐个降级；全部失败时提示手动定位（手动定位同样可「保存地点」）。
  var searchSeq=0, lastPick=null;
  function fetchJson(url, ms){
    var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
    var t=setTimeout(function(){ if(ctl) ctl.abort(); }, ms||12000);
    var opt=ctl?{signal:ctl.signal}:{};
    return fetch(url,opt).then(function(r){
      if(!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }).then(function(j){ clearTimeout(t); return j; }, function(e){ clearTimeout(t); throw e; });
  }
  // extent 统一为 Leaflet bounds 形式 [[minLat,minLng],[maxLat,maxLng]]
  // [GCJ-02 修复 2026-09-28] Photon/Nominatim 返回真实 WGS-84；转成 GCJ-02 网格值再定位，
  //   否则搜索定位到的地方与高德影像整体偏移。extent 包围盒同样转。
  function toGcjLL(lat,lng){ if(RunyeGeo&&isFinite(lat)&&isFinite(lng)){ var g=RunyeGeo.wgs2gcj(lat,lng); return {lat:g.lat,lng:g.lng}; } return {lat:lat,lng:lng}; }
  function normPhoton(j){
    var out=[];
    ((j&&j.features)||[]).forEach(function(f){
      var p=f.properties||{}, c=f.geometry&&f.geometry.coordinates;
      if(!p.name || !c || c.length<2) return;
      var det=[];
      [p.district,p.city,p.state,p.country].forEach(function(s){
        if(s && s!==p.name && det.indexOf(s)<0) det.push(s);
      });
      var e=p.extent, bnd=null;
      if(e && e.length===4) bnd=[[e[3],e[0]],[e[1],e[2]]];
      var g=toGcjLL(+c[1], +c[0]);
      if(bnd){ bnd=[[ toGcjLL(bnd[0][0],bnd[0][1]).lat, toGcjLL(bnd[0][0],bnd[0][1]).lng ],
                   [ toGcjLL(bnd[1][0],bnd[1][1]).lat, toGcjLL(bnd[1][0],bnd[1][1]).lng ]]; }
      out.push({name:String(p.name), detail:det.join(' · '), lat:g.lat, lng:g.lng, extent:bnd});
    });
    return out.filter(function(r){ return isFinite(r.lat)&&isFinite(r.lng); });
  }
  function normNominatim(j){
    var out=[];
    (j||[]).forEach(function(r){
      var la=parseFloat(r.lat), lo=parseFloat(r.lon);
      if(!isFinite(la)||!isFinite(lo)) return;
      var nm=r.name||String(r.display_name||'').split(',')[0];
      var bb=r.boundingbox, bnd=null;
      if(bb && bb.length===4) bnd=[[+bb[0],+bb[2]],[+bb[1],+bb[3]]];
      var g=toGcjLL(la, lo);
      if(bnd){ bnd=[[ toGcjLL(+bb[0],+bb[2]).lat, toGcjLL(+bb[0],+bb[2]).lng ],
                   [ toGcjLL(+bb[1],+bb[3]).lat, toGcjLL(+bb[1],+bb[3]).lng ]]; }
      out.push({name:nm, detail:String(r.display_name||''), lat:g.lat, lng:g.lng, extent:bnd});
    });
    return out;
  }
  var resCache=[];
  function renderRes(list){
    resCache=list;
    var box=document.getElementById('searchRes');
    box.innerHTML='';
    if(!list.length){ box.hidden=true; return; }
    list.forEach(function(r,i){
      var b=document.createElement("button");
      b.type='button'; b.className='sr-item';
      b.setAttribute('data-sr-idx', String(i));
      var t=document.createElement("b"); t.textContent=r.name; b.appendChild(t);
      if(r.detail){ var d=document.createElement("i"); d.textContent=r.detail; b.appendChild(d); }
      b.title=r.name+(r.detail?' — '+r.detail:'');
      b.onclick=function(){ pick(r); };
      box.appendChild(b);
    });
    box.hidden=false;
  }
  var searchMark=null;
  // [GCJ-02 修复 2026-09-28] 所有进入地图显示的坐标统一为高德网格值(GCJ-02)：
  //   搜索候选/坐标直入是真实 WGS-84，在 norm/parse 入口处已转成 GCJ-02；
  //   保存地点存的是 map.getCenter()(已是网格值)，恢复时直接用、不再转换。
  function markSearch(r){
    if(searchMark){ map.removeLayer(searchMark); searchMark=null; }
    searchMark=L.marker(toDisplay(r),{icon:L.divIcon({
      className:'ry-pin', iconSize:[18,30], iconAnchor:[9,29],
      html:'<svg width="18" height="30" viewBox="0 0 25 41"><path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#dc2626" stroke="#fff" stroke-width="1.5"/><circle cx="12.5" cy="12.5" r="4" fill="#fff"/></svg>'
    })}).addTo(map);
    searchMark.bindTooltip(r.name,{direction:'top'});
  }
  function goTo(r){
    if(r.extent){ map.fitBounds(displayRing(r.extent),{padding:[20,20],maxZoom:16}); }
    else if(isFinite(r.zoom)){ map.setView(toDisplay(r), r.zoom); }
    else { map.setView(toDisplay(r), 16); }
    markSearch(r);
  }
  function pick(r){
    lastPick=r;
    goTo(r);
    document.getElementById('search').value=r.name;
    lsSet(K_Q,r.name);
    renderRes([]);
    tip('已定位：'+r.name+(r.detail?'（'+r.detail+'）':'')+'。点「💾 保存地点」可记住此处。');
  }
  /* ===== [v634 2026-10-20 用户要求]「根据坐标搜索位置」 =====
     旧 parseLatLng 只认「18.2528,109.5119」，且只落一个红点、不告诉你这是哪。
     现支持四类写法（全部按 **WGS-84** 理解，定位前统一转 GCJ-02，与搜索候选同口径）：
       ① 十进制度     18.2528,109.5119 ｜ 109.5119,18.2528（首值 >90 自动判为经度）
       ② 方向字母     N18.2528 E109.5119 ｜ 18.2528N,109.5119E
       ③ 度分秒       18°15'10"N, 109°30'43"E
       ④ 中文经纬     北纬18.2528 东经109.5119
     定位完成后由 reverseName() 异步反查地名（网络失败只少一个地名，不影响定位）。 */
  var COORD_AXIS={N:'lat',S:'lat',E:'lng',W:'lng','北':'lat','南':'lat','东':'lng','西':'lng'};
  function coordAxis(h){
    if(!h)return null;
    var k=String(h).toUpperCase();
    if(COORD_AXIS[k])return COORD_AXIS[k];
    return COORD_AXIS[String(h).charAt(0)]||null;
  }
  function coordSign(h){
    var k=String(h||'').toUpperCase();
    return (k==='S'||k==='W'||k==='南'||k==='西')?-1:1;
  }
  /* 单段 → 十进制：18 ｜ 18.5 ｜ 18°15′ ｜ 18°15′10.5″，可带前/后方向标记 */
  function coordPiece(seg){
    var s=String(seg).trim();
    if(!s)return null;
    var hemi=null,m;
    if((m=/^([NSEWnsew]|北纬|南纬|东经|西经|北|南|东|西)\s*(.+)$/.exec(s))){ hemi=m[1]; s=m[2]; }
    else if((m=/^(.+?)\s*([NSEWnsew]|北纬|南纬|东经|西经|北|南|东|西)$/.exec(s))){ s=m[1]; hemi=m[2]; }
    s=String(s).replace(/[°度]/g,'°').replace(/['′分]/g,'′').replace(/["″秒]/g,'″').trim();
    if(!/^-?\d/.test(s))return null;
    var d=s.split('°'),deg=parseFloat(d[0]);
    if(!isFinite(deg))return null;
    var min=0,sec=0;
    if(d[1]!=null){
      var q=d[1].split('′');
      min=parseFloat(q[0])||0;
      if(q[1]!=null)sec=parseFloat(String(q[1]).replace(/″/g,''))||0;
    }
    if(min>=60||sec>=60)return null;
    var v=Math.abs(deg)+min/60+sec/3600;
    if(/^-/.test(String(d[0]).trim()))v=-v;      /* 显式负号优先于方向字母 */
    else v=v*coordSign(hemi);
    return {v:v,axis:coordAxis(hemi)};
  }
  function parseLatLng(q){
    if(!q)return null;
    var s=String(q).trim();
    /* ① 纯数字对（最常见，保持旧行为） */
    var m=/^\s*(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
    if(m){
      var a=parseFloat(m[1]),b=parseFloat(m[2]),lat,lng;
      if(Math.abs(a)>90&&Math.abs(b)<=90){lng=a;lat=b;}else{lat=a;lng=b;}
      if(Math.abs(lat)>90||Math.abs(lng)>180)return null;
      return {lat:lat,lng:lng,raw:s};
    }
    /* ② 多格式：先把「10″ N」这类**秒/分符号与方向之间**的空格并掉（不能按「数字+空格+方向」合并，
          否则 「18.2528 E109.5119」会被粘成一段、整条判定失败），再按分隔符切 */
    var t=s.replace(/(["″秒'′分])\s+([NSEWnsew])/g,'$1$2').replace(/[，,；;/]+/g,' , ');
    var segs=t.split(/\s+/).filter(function(x){return x&&x!==',';});
    if(segs.length<2)return null;
    var lat=null,lng=null,free=[];
    segs.forEach(function(sg){
      var p=coordPiece(sg);
      if(!p)return;
      if(p.axis==='lat'){ if(lat===null)lat=p.v; }
      else if(p.axis==='lng'){ if(lng===null)lng=p.v; }
      else free.push(p.v);
    });
    if(lat===null&&lng===null){
      if(free.length<2)return null;
      if(Math.abs(free[0])>90&&Math.abs(free[1])<=90){lng=free[0];lat=free[1];}
      else{lat=free[0];lng=free[1];}
    }else if(lat===null){ if(!free.length)return null; lat=free[0]; }
    else if(lng===null){ if(!free.length)return null; lng=free[0]; }
    if(Math.abs(lat)>90||Math.abs(lng)>180)return null;
    return {lat:lat,lng:lng,raw:s};
  }
  /* 坐标 → 「这是哪」。主源 Nominatim（中文地址），备源 Photon；
     两源都失败只影响地名，定位本身已完成（不阻塞、不报错）。 */
  function reverseName(lat,lng){
    var la=(+lat).toFixed(6),lo=(+lng).toFixed(6);
    function pickNm(j){
      var a=(j&&j.address)||{};
      var nm=j.name||a.road||a.neighbourhood||a.village||a.town||a.city_district||a.city||a.county||a.state||'';
      var det=[];
      [a.state,a.city,a.county||a.city_district,a.town||a.village||a.suburb,a.road].forEach(function(x){
        if(x&&x!==nm&&det.indexOf(x)<0)det.push(x);
      });
      if(!nm&&!det.length)throw new Error('empty');
      return {name:nm||det[0],detail:det.join(' · ')};
    }
    /* [v634] 源顺序按 2026-10-20 实测调换：国内 Nominatim reverse 常在 12s 内无返回，
       而 Photon reverse 秒回且带中文地名（实测 18.2528,109.5119 → 阳光雅园·吉阳区·三亚市·海南省）。
       主源 Photon、备源 Nominatim —— 与关键词搜索的源顺序一致。 */
    function pickPhoton(j){
      var f=(j&&j.features&&j.features[0]);
      if(!f)throw new Error('empty');
      var p=f.properties||{};
      var det=[p.district,p.city,p.state].filter(Boolean);
      var nm=p.name||'';
      if(!nm&&!det.length)throw new Error('empty');
      return {name:nm||det[0],detail:det.join(' · ')};
    }
    return fetchJson('https://photon.komoot.io/reverse?limit=1&lat='+la+'&lon='+lo,8000)
      .then(pickPhoton)
      .catch(function(){
        return fetchJson('https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=zh&zoom=18&lat='+la+'&lon='+lo,8000)
          .then(pickNm);
      });
  }
  function doSearch(){
    var q=document.getElementById('search').value.trim();
    if(!q){ tip('请输入地点名称，或直接粘贴坐标（18.2528,109.5119 ｜ 18°15\'10"N 109°30\'43"E）。'); return; }
    lsSet(K_Q,q);
    var seq=++searchSeq;
    // 坐标直入优先：不触网即可定位
    var ll=parseLatLng(q);
    if(ll){
      // [GCJ-02 修复 2026-09-28] 用户输入的坐标是真实 WGS-84，转成 GCJ-02 网格值再定位
      var gl=toGcjLL(ll.lat, ll.lng);
      var cs=(+ll.lat).toFixed(6)+', '+(+ll.lng).toFixed(6);
      lastPick={name:q, detail:'坐标 '+cs, lat:gl.lat, lng:gl.lng, zoom:16};
      goTo(lastPick);
      renderRes([]);
      /* [v634] 定位先落地（不等网络），地名回来后再补提示与图钉 tooltip */
      tip('已按坐标定位：'+cs+'，正在查询该处地名…');
      reverseName(ll.lat, ll.lng).then(function(r){
        if(seq!==searchSeq) return;
        if(!r||!r.name){ tip('已按坐标定位：'+cs+'（未取到地名，可直接「💾 保存地点」）。'); return; }
        lastPick.name=r.name;
        lastPick.detail=(r.detail?r.detail+' · ':'')+'坐标 '+cs;
        if(searchMark&&searchMark.setTooltipContent)searchMark.setTooltipContent(r.name);
        tip('已按坐标定位：'+r.name+(r.detail?'（'+r.detail+'）':'')+' · '+cs+'。点「💾 保存地点」可记住此处。');
      }).catch(function(){
        if(seq!==searchSeq) return;
        tip('已按坐标定位：'+cs+'（未取到地名，可直接「💾 保存地点」）。');
      });
      return;
    }
    lastPick=null;
    renderRes([]);
    tip('搜索中…');
    /* 本地偏置：以当前地图中心为参照，重名地名优先命中本地（实测「东方市」→ 19.0979,108.6482 海南） */
    var cc=RunyeGeo.gcj2wgs(curView().lat,curView().lng);
    var bias='&lat='+(+cc.lat.toFixed(5))+'&lon='+(+cc.lng.toFixed(5))+'&zoom=8';
    var srcs=[
      {url:'https://photon.komoot.io/api/?limit=6'+bias+'&q='+encodeURIComponent(q), norm:normPhoton},
      /* 备源必须限中国：实测不限国家时「东方市」首条命中巴拉圭同名地（-25.5,-54.6） */
      {url:'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=cn&accept-language=zh&q='+encodeURIComponent(q), norm:normNominatim}
    ];
    (function next(i){
      if(seq!==searchSeq) return;
      if(i>=srcs.length){ tip('搜索服务暂不可用或未找到结果；可手动拖拽/缩放定位后点「💾 保存地点」。'); return; }
      fetchJson(srcs[i].url, 12000).then(function(j){
        if(seq!==searchSeq) return;
        var rs=srcs[i].norm(j);
        if(!rs.length) return next(i+1);
        renderRes(rs);
        tip('找到 '+rs.length+' 个候选地点，点选即定位。');
      }).catch(function(){ if(seq===searchSeq) next(i+1); });
    })(0);
  }
  document.getElementById('btnSearch').onclick=doSearch;
  document.getElementById('search').addEventListener('keydown',function(e){ if(e.key==='Enter') doSearch(); });

  // ===== 保存地点（书签）=====
  function renderPlaces(){
    var arr=lsGet(K_PLACES,[])||[];
    var box=document.getElementById('placeList');
    box.innerHTML='';
    arr.forEach(function(p){
      var row=document.createElement("div"); row.className="place-item";
      row.setAttribute('data-place-id', p.id);
      var go=document.createElement("button");
      go.type='button'; go.className='place-go'; go.setAttribute('data-place-go','1');
      go.textContent=p.name; go.title=p.name;
      go.onclick=function(){
        lastPick={name:p.name,detail:'',lat:p.lat,lng:p.lng,zoom:p.zoom};
        goTo(lastPick);
        document.getElementById('search').value=p.name;
        lsSet(K_Q,p.name);
        tip('已回到保存的地点：'+p.name+'。');
      };
      var del=document.createElement("button");
      del.type='button'; del.className='place-del'; del.setAttribute('data-place-del','1');
      del.textContent='×'; del.title='删除该地点';
      del.setAttribute('aria-label','删除地点 '+p.name);
      del.onclick=function(){
        var now=(lsGet(K_PLACES,[])||[]).filter(function(x){ return x.id!==p.id; });
        lsSet(K_PLACES, now);
        renderPlaces();
        tip('已删除地点：'+p.name+'。');
      };
      row.appendChild(go); row.appendChild(del); box.appendChild(row);
    });
    box.hidden = arr.length===0;
  }
  document.getElementById('btnSavePlace').onclick=function(){
    var v=curView();
    var nm=(lastPick && lastPick.name) || document.getElementById('search').value.trim() || '';
    var arr=lsGet(K_PLACES,[])||[];
    if(!nm) nm='地点 '+(arr.length+1);
    var hit=null;
    for(var i=0;i<arr.length;i++){ if(arr[i].name===nm){ hit=arr[i]; break; } }
    if(hit){ hit.lat=v.lat; hit.lng=v.lng; hit.zoom=v.zoom; hit.ts=Date.now(); }
    else{
      arr.push({id:'mp'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e4).toString(36),
        name:nm, lat:v.lat, lng:v.lng, zoom:v.zoom, ts:Date.now()});
      if(arr.length>20) arr=arr.slice(arr.length-20);
    }
    lsSet(K_PLACES,arr);
    saveView();
    renderPlaces();
    tip('已保存地点：'+nm+'（'+v.lat.toFixed(4)+', '+v.lng.toFixed(4)+'）——下次打开会回到这里。');
  };
  renderPlaces();

  /* ===== [v191 2026-10-03] 回传地块绘制：改成「显式指定地块」，不再只认 currentMapPlotId =====
   * ★ 真因（用户「还是不行」）：原实现里
   *     pid = currentMapPlotId || ('pm'+Date.now())
   *   而 currentMapPlotId **只在「保存地块」时赋值**、「完成」后还会被置回 null；
   *   成组地块是 RunyeMapEnhance.merge **直接写进地块库**的，从来不会设置 currentMapPlotId。
   *   ⇒ 在地图上点成组地块只是 fitBounds 飞过去，回传时 saved 拿到的是「最后画的那个子地块」，
   *     saved.merged === false ⇒ payload.subPlots **一个都不带** ⇒ 二级页收不到各子地块。
   *   ⇒ 也就是说：不是「传过去又被整合」，是**成组地块压根没被选中过**。
   *
   * 修法：回传对象 = **显式指定的地块记录**（成组与否一视同仁），与画布草稿解耦。
   *   · payload.poly      = 该地块的外框环（仅作定位/缩放/包围盒参考，**不参与面积**）
   *   · payload.sqm/mu    = 成组时为「各成员环实测面积之和」（绝不采信库里的凸包口径旧值）
   *   · payload.subPlots  = 各成员环本身（块间空隙原样保留）
   */
  function buildPlotPayload(plot, pidFallback){
    var pid=(plot && plot.id) || pidFallback || ('pm'+Date.now());
    var ring=(plot && plot.polyLatLng) || null;
    if(!ring || ring.length<3) return null;

    var sqm=Math.round(geodesicArea(ring));
    var payload={ plotId:pid, name:(plot&&plot.name)||'', mu:+(sqm/666.67).toFixed(2),
                  sqm:sqm, poly:ring, ts:Date.now(), source:'map' };

    /* 成组地块：面积改为 Σ 各成员环，并带上各成员环本身 */
    var ringSet=(plot&&plot.polyLatLngSet)||null;
    var subs=(plot&&plot.subPlots)||[];
    if(plot && plot.merged && ((ringSet&&ringSet.length)||subs.length)){
      var n=Math.max(subs.length,(ringSet&&ringSet.length)||0), out=[], sum=0;
      for(var i=0;i<n;i++){
        var s=subs[i]||{};
        var r=(ringSet&&ringSet[i])?ringSet[i]:s.polyLatLng;
        if(!r || r.length<3) continue;
        /* ★ 面积一律按环实测，不采信 s.sqm（老记录可能是凸包口径） */
        var m2=(typeof s.sqm==='number'&&isFinite(s.sqm)&&s.sqm>0)?s.sqm:Math.round(geodesicArea(r));
        sum+=m2;
        out.push({ id:s.id||(pid+'-sub'+i), name:s.name||('子地块'+(out.length+1)),
                   mu:+(m2/666.67).toFixed(2), sqm:Math.round(m2),
                   polyLatLng:r, center:s.center||null });
      }
      if(out.length){
        payload.merged=true;
        payload.grouped=true;                 // v189 语义：成组（几何不合并）
        payload.subPlots=out;
        payload.sqm=Math.round(sum);          // ★ 成员之和，不含块间空隙
        payload.mu=+(sum/666.67).toFixed(2);
      }
    }
    if(plot && plot.partitionPlan)payload.partitionPlan=JSON.parse(JSON.stringify(plot.partitionPlan));
    return payload;
  }

  /* ===== [NEW MODULE: 地形模块 v286d 2026-10-07] 「⛰️ 回传地形模块」 =====
     与「回传地块绘制」同一道理：复用 buildPlotPayload 取当前地块（显式地块→最新入库→草稿），
     写入地形模块契约 runye_terrain_incoming；主程序切换地形区，独立地图页仍打开兼容入口。
     坐标口径：payload.poly/subPlots 为 WGS-84 经纬度环，由地形模块做局部米制投影后导入；
     面积 sqm 沿用地图实测（geodesicArea），随 payload 一并带给地形模块备查。
     卸载：删除本函数 + btnCopyTerrain onclick + HTML 里 id="btnCopyTerrain" 按钮即可。 */
  function sendPlotToTerrain(plot, btnEl){
    var payload=buildPlotPayload(plot, currentMapPlotId||null);
    if(!payload){ alert('该地块没有有效的边界环，无法回传。'); return; }
    try{
      if (!window.RyTerrainBridgeStore || !window.RyTerrainBridgeStore.writeIncoming(payload))
        throw new Error('地形模块交接数据写入失败');
      if(btnEl){ var old=btnEl.textContent; btnEl.textContent='回传中…';
        setTimeout(function(){ btnEl.textContent=old; }, 1200); }
      setTimeout(function(){ if(document.getElementById('terrainSection')) window.location.hash='#terrainSection'; else window.location.href='terrain/index.html'; }, 350);
    }catch(e){ alert('写入失败：'+e.message); }
  }
  /* [v830 2026-10-31] 用户要求：本按钮已从右侧角度面板移除（同功能入口在「我的地块」行内
     「回传地形」与地图右键弹窗里）。**必须保留空守卫** —— 否则 getElementById 返回 null，
     对 null 取 .onclick 会在脚本加载阶段抛 TypeError，整段 online-map.js 从这里断开，
     下面所有绑定（btnCopy / btnSavePlot / 云端提交 / 地块库叠加）全部静默失效。 */
  var btnCopyTerrainEl=document.getElementById('btnCopyTerrain');
  if(btnCopyTerrainEl)btnCopyTerrainEl.onclick=function(){
    /* 取地块逻辑与 btnCopy 同源；不改动 btnCopy 任何原有代码 */
    try{
      var lib=lsGet('runye_plot_library',[]);
      var saved=currentMapPlotId?lib.filter(function(p){return p.id===currentMapPlotId;})[0]:null;
      if(saved){ sendPlotToTerrain(saved, this); return; }
      if(!points.length && lib.length){
        saved=lib.reduce(function(a,b){return (!a || (b.ts||0)>(a.ts||0)) ? b : a;}, null);
        if(saved){ sendPlotToTerrain(saved, this); return; }
      }
    }catch(e){}
    var mu=parseFloat((geodesicArea(points)/666.67).toFixed(2));
    if(!isFinite(mu) || mu<=0){ alert('画布为空，地块库里也没有可回传的地块——请先画框测量出有效面积'); return; }
    sendPlotToTerrain({ id:currentMapPlotId||('pm'+Date.now()), name:'', polyLatLng:latlngs() }, this);
  };
    function sendPlotToDesign(plot, btnEl){
    var id=plot && String(plot.id||'');
    var lib=lsGet('runye_plot_library',[]);
    /* 弹窗绑定的是地图渲染时的地块快照。只按 id 重新取第一条会在重复 id
       或地块库被其他页面改写后静默命中另一块地。几何指纹把“点中的环”绑定到引用。 */
    function geometryKey(p){
      function ringKey(r){
        if(!Array.isArray(r)||r.length<3)return null;
        return r.map(function(q){
          var lat=Array.isArray(q)?Number(q[0]):Number(q&&q.lat);
          var lng=Array.isArray(q)?Number(q[1]):Number(q&&q.lng);
          return isFinite(lat)&&isFinite(lng)?[+lat.toFixed(7),+lng.toFixed(7)]:null;
        });
      }
      var rings=[];
      if(p&&p.merged){
        var set=Array.isArray(p.polyLatLngSet)?p.polyLatLngSet:[];
        var subs=Array.isArray(p.subPlots)?p.subPlots:[];
        var n=Math.max(set.length,subs.length);
        for(var i=0;i<n;i++)rings.push(ringKey(set[i]||subs[i]&&subs[i].polyLatLng));
      }else rings.push(ringKey(p&&p.polyLatLng));
      if(!rings.length||rings.some(function(r){return !r;}))return null;
      return JSON.stringify(rings);
    }
    var clickedKey=geometryKey(plot);
    if(!id||!clickedKey){ alert('当前弹窗地块边界无效，请刷新地图后重新回传。'); return; }
    var matches=lib.filter(function(p){return p&&String(p.id)===id&&geometryKey(p)===clickedKey;});
    if(lib.filter(function(p){return p&&String(p.id)===id;}).length!==1){
      alert('地块库中存在重复编号，当前地块无法安全保存为唯一设计地块；请先检查重复记录。'); return;
    }
    if(matches.length!==1){
      alert(matches.length?'地块库中存在相同编号和边界的多条记录，无法安全确定回传对象。':'弹窗中的地块已与地块库不同步，请刷新地图后重新回传。');
      return;
    }
    var saved=matches[0];
    currentMapPlotId=saved.id;
    renderReservoir();
    var destinationSection=(saved.merged||saved.grouped)&&Array.isArray(saved.subPlots)&&saved.subPlots.length>=2
      ? 'grPipeSection' : 'pipePlanSection';
    var areaM2=Number(saved.areaM2)||Number(saved.sqm)||0;
    var savedAt=Number(saved.savedAt)||Number(saved.ts)||Date.now();
    if(!areaM2 || !isFinite(areaM2)){ alert('地块面积无效，无法回传。'); return; }
    try{
      /* 主链路只传稳定引用；几何由二级页按 id 从共享地块库读取，避免跨页复制两套边界。 */
      var transferStore=window.RyMeasuredAreaBridgeStore;
      var transferId=transferStore && typeof transferStore.write==='function'
        ? transferStore.write({ryPlotRef:{id:id,savedAt:savedAt,areaM2:areaM2,geometryKey:clickedKey}}) : null;
      if(!transferId)
        throw new Error((window.RyStorageGuard&&typeof window.RyStorageGuard.fullMessage==='function')
          ? window.RyStorageGuard.fullMessage()
          : '地块回传交接数据写入失败（本机存储已满或服务未加载）');
      /* 云端样本仅在这次回传的本地地块边界与刚载入的云端环完全一致时建立关联。 */
      try{
        var cloudBinding=window.RyCloudDesignBindingStore;
        if(cloudBinding && typeof cloudBinding.bindTransferredPlot==='function') cloudBinding.bindTransferredPlot(saved);
      }catch(errCloudBinding){}
      if(btnEl){ var old=btnEl.textContent; btnEl.textContent='回传中…';
        setTimeout(function(){ btnEl.textContent=old; }, 1200); }
      setTimeout(function(){
        if(document.getElementById('onlineMapSection')){
          if(typeof window.runyeApplyMapPayload!=='function') alert('地块分区接收功能尚未加载，请刷新页面后重试。');
          else {
            /* 同页接收也把载荷编号放在地址上，接收失败后刷新仍能恢复这一次交接。 */
            try{
              var transferParams=new URLSearchParams(window.location.search||'');
              transferParams.set(transferStore.urlParam||'ryPlotTransfer',transferId);
              var transferSearch=transferParams.toString();
              window.history.replaceState(window.history.state,'',window.location.pathname+(transferSearch?'?'+transferSearch:'')+window.location.hash);
            }catch(errTransferUrl){}
            if(!window.runyeApplyMapPayload(transferId)) return;
            /* 接收器已经同步切到地块分区；pushState 只更新可恢复的地址锚点，
               避免 hashchange 再由导航模块重复切一次。 */
            if(window.location.hash!=='#'+destinationSection && window.history && typeof window.history.pushState==='function'){
              try{ window.history.pushState(window.history.state,'','#'+destinationSection); }
              catch(eHash){ window.location.hash=destinationSection; }
            }else if(window.location.hash!=='#'+destinationSection) window.location.hash=destinationSection;
          }
        }
        else window.location.href='index.html?'+encodeURIComponent(transferStore.urlParam||'ryPlotTransfer')+'='+encodeURIComponent(transferId)+'#'+destinationSection;
      }, 350);
    }catch(e){ alert('写入失败：'+e.message); }
  }

  // 回传地块绘制：写入按编号隔离的载荷，并跳转到 index.html 的地块分区页
  /* [v830 2026-10-31] 「回传地块绘制」按钮已按用户要求从右侧角度面板移除
     （同功能入口：我的地块列表行「→」.place-send、地图右键弹窗、runye-map-partition 的 RyMapHost.send）。
     但**这条分支不能跟着消失** —— 它处理的是「画布上有刚画好、还没入库的草稿」这条路径：
     按 id 取库里记录取不到，必须先把画布草稿落库再回传（v475 的教训）。
     做法：提成具名函数并挂到 RyMapHost.sendDraft；DOM 按钮存在时照旧绑定，不存在则只留编程入口。 */
  function onSendCurrentDraft(btnEl){
    /* [v475]（2026-10-16 用户实测踩坑）画布上有有效边界时**永远以画布为准**：
       旧逻辑 currentMapPlotId 指着旧记录就优先传旧记录 ⇒ 用户改完边界/画了新地块
       还没（重新）保存时，卡片显示的是画布实时测量、回传却发了旧地块——
       实测案例：卡片 182.92 亩，传过去 274.62 亩（上一块）；卡片 397.29 亩，
       传过去 145.73 亩（更早的小边界）。现改为：画布环与候选记录面积差 >0.5%
       ⇒ 先把画布环落库（**另存新条目，不覆盖旧记录**）再回传；完全一致才直传记录。 */
    try{
      var lib0=lsGet('runye_plot_library',[]);
      var saved0=currentMapPlotId?lib0.filter(function(p){return p.id===currentMapPlotId;})[0]:null;
      if(points.length>=3){
        var liveSqm=Math.round(geodesicArea(points));
        var savedSqm=saved0?(Number(saved0.areaM2)||Number(saved0.sqm)||0):0;
        if(isFinite(liveSqm)&&liveSqm>0&&(!saved0||!savedSqm||Math.abs(liveSqm-savedSqm)>savedSqm*0.005)){
          var fresh=saveCurrentDraftToLibrary({silent:false,newId:true});
          if(fresh){ sendPlotToDesign(fresh, btnEl); return; }
        }
      }
      var lib=lsGet('runye_plot_library',[]);
      var saved=currentMapPlotId?lib.filter(function(p){return p.id===currentMapPlotId;})[0]:null;
      if(saved){ sendPlotToDesign(saved, btnEl); return; }
      /* [v249 2026-10-05 用户要求] 「完成并画下一块」之后画布已清空、currentMapPlotId 已复位，
         用户随时可能就此停手点回传——此时「当前地块」= 刚定稿入库的最近一块（按 ts 取最新，
         成组与否一视同仁）。画布还有草稿时不兜底：半成品仍走下方草稿路径（原行为）。 */
      if(!points.length && lib.length){
        saved=lib.reduce(function(a,b){return (!a || (b.ts||0)>(a.ts||0)) ? b : a;}, null);
        if(saved){ sendPlotToDesign(saved, btnEl); return; }
      }
    }catch(e){}
    /* 否则回退：把当前画布上的草稿作为一个新地块回传 */
    var mu=parseFloat((geodesicArea(points)/666.67).toFixed(2));
    if(!isFinite(mu) || mu<=0){ alert('画布为空，地块库里也没有可回传的地块——请先画框测量出有效面积'); return; }
    var draft=saveCurrentDraftToLibrary({silent:false});
    if(draft) sendPlotToDesign(draft, btnEl);
  }
  var btnCopyEl=document.getElementById('btnCopy');
  if(btnCopyEl)btnCopyEl.onclick=function(){ onSendCurrentDraft(this); };
  window.__rySendCurrentDraft=onSendCurrentDraft;   // 契约测试与 runye-map-partition 的编程入口

  /* ===== [v186 2026-10-03] 地块定稿 / 清空 两个原子操作 =====
   * 从原「💾 保存地块」里抽出「把当前画布上的草稿存进地块库」这一段，
   * 供两处复用：① 用户点「💾 保存地块」；② 用户点「完成」自动定稿（连续绘制）。
   * 抽出的好处是**字段构造只有一份**（polyLatLng / center / geo / crs），
   * 不会再出现「自动存的那份比手存的少字段」这种隐性不一致。
   * @returns {Object|null} 存成功返回 plot；无效草稿或写库失败返回 null
   */
  function saveCurrentDraftToLibrary(opts){
    opts=opts||{};
    var mu=parseFloat((geodesicArea(points)/666.67).toFixed(2));
    if(!isFinite(mu) || mu<=0){ if(!opts.silent) alert('请先在地图上画框测量出有效面积再保存'); return null; }
    var sqm=Math.round(geodesicArea(points));
    var plotStore=window.RyPlotLibraryStore;
    var snapshot=plotStore&&plotStore.read();
    if(!snapshot||!snapshot.ok){ if(!opts.silent) alert('地块库读取失败，未保存当前地块。'); return null; }
    var arr=snapshot.plots;
    var name='地块 '+(arr.length+1);
    // 经纬度 → 本地米坐标（与精准灌溉页 applyMapMeasuredArea 一致），便于「设为当前」回填
    var poly=latlngs(), xs=[], ys=[];
    if(poly && poly.length>=3){
      var lats=poly.map(function(p){return p[0];}), lngs=poly.map(function(p){return p[1];});
      var clat=lats.reduce(function(a,b){return a+b;},0)/lats.length;
      var R=6378137, mlat=R*Math.PI/180, cosLat=Math.cos(clat*Math.PI/180);
      poly.forEach(function(p){ xs.push((p[1]-lngs[0])*mlat*cosLat); ys.push((p[0]-clat)*mlat); });
    }
    var previous=arr.filter(function(p){return p.id===currentMapPlotId;})[0];
    /* [v475] opts.newId=true：强制另存新条目（不占用 currentMapPlotId 的旧记录）
       —— 回传以画布为准时，旧记录不能被新边界覆盖掉。 */
    if(previous && !(opts&&opts.newId)) name=previous.name;
    var plot={ id:((opts&&opts.newId)||!currentMapPlotId)?('p'+Date.now()+Math.floor(Math.random()*1000)):currentMapPlotId, name:name, mu:mu, sqm:sqm,
      poly:xs.map(function(x,i){return {x:Math.round(x*100)/100,y:Math.round(ys[i]*100)/100};}),
      source:'map', ts:Date.now(), note:'' };
    /* 调整已保存地块边界时保留地图绘制的总管，避免多边形重存静默清除总管数据。 */
    /* A forced new record represents a different boundary and must not inherit
       the selected plot's independent map route. Keep the route only when this
       operation updates that same stable plot ID. */
    if(previous&&!(opts&&opts.newId)&&previous.trunk)plot.trunk=JSON.parse(JSON.stringify(previous.trunk));
    if(previous&&!(opts&&opts.newId)&&previous.waterSource)plot.waterSource=JSON.parse(JSON.stringify(previous.waterSource));
    // [map-enhance] 写入权威经纬度坐标，供卫星图实景叠加（旧字段 poly 保留不动，主程序画布照常消费）
    var rawLL=latlngs();
    if(rawLL && rawLL.length>=1){
      var sl=rawLL.reduce(function(a,p){return a+p[0];},0)/rawLL.length;
      var sn=rawLL.reduce(function(a,p){return a+p[1];},0)/rawLL.length;
      plot.polyLatLng=rawLL;
      plot.center={lat:+sl.toFixed(6), lng:+sn.toFixed(6)};
      // geo 基准必须与 plot.poly 的米坐标原点一致：x 原点=首点经度，y 原点=平均纬度
      // （否则管网/地块用 m2ll 反投回卫星图会整体平移）
      plot.geo={refLat:+sl.toFixed(6), refLng:+rawLL[0][1].toFixed(6), proj:'mercatorLocal', ts:Date.now()};
    }
    plot.crs='GCJ-02';
    /* [v475] newId 时旧 previous 与新条目无 id 关系，走 push，不覆盖旧记录 */
    if(previous && !(opts&&opts.newId)){plot.note=previous.note;arr=arr.map(function(p){return p.id===plot.id?plot:p;});}
    else arr.push(plot);
    var saveResult=plotStore.replace(arr,snapshot.revision);
    if(!saveResult.ok){ if(!opts.silent) alert('保存失败，地块库未更改：'+saveResult.error); return null; }
    currentMapPlotId=plot.id;
    renderReservoir();
    refreshPlotLibrary();
    return plot;
  }

  /** 清空画布草稿（点/标点/多边形/橡皮筋/加点手柄），不动地块库。
   *  [v186] 抽出来是为了让「完成」与「🗑 清除」共用同一个清空口径 ——
   *  两份清空逻辑最容易出现「漏清一个数组」⇒ 下次绘制串到上一块上。 */
  function clearDraft(){
    setAddMode(false);                 // [v153] 点全没了，加点模式一并退出（⊕ 手柄随模式清除）
    if(measuring) finishMeasure();
    points=[]; markers.forEach(function(m){measureGroup.removeLayer(m);}); markers=[];
    lastAdded=null;
    if(poly){measureGroup.removeLayer(poly);poly=null;}
    if(rubber){measureGroup.removeLayer(rubber);rubber=null;}
    currentMapPlotId=null;             // 复位「正在编辑的地块」：下一块才会拿到新 id
    renderReservoir();
    refresh();
  }
  window.__ryClearDraft=clearDraft;    // 供契约测试直接驱动（不依赖 UI 点击）

  // 保存到地块库（与精准灌溉页共用 localStorage['runye_plot_library']），可累计多个地块
  var btnSavePlotEl=document.getElementById('btnSavePlot');  /* [v830] 按钮已移除；保存改由「完成」自动入库 */
  if(btnSavePlotEl)btnSavePlotEl.onclick=function(){
    var plot=saveCurrentDraftToLibrary({silent:false});
    if(!plot) return;
    alert('已保存到地块库：'+plot.name+'（'+plot.mu+' 亩）\n可在精准灌溉页「地块库」设为当前。');
  };

  /* ===== [v587] 提交到云端（地块库） =====
     目的：别人在地图上画好地块后一键提交，管理员在云端地块库能直接看到（省掉来回沟通）；
     与「保存地块」不同 —— 保存只写本机 localStorage，换设备就没了，管理员也看不到。
     做法：把当前边界（GCJ-02 经纬度）+ 亩数 + 中心点拼成 URL 参数，跳到云端提交页（应用域
     https://plot-library.app.workbuddy.host/）。提交页负责登录与写库，主站不接触任何凭据。 */
  var CLOUD_SUBMIT_URL='https://plot-library.app.workbuddy.host/';
  function submitCurrentPlotToCloud(){
    var mu=parseFloat((geodesicArea(points)/666.67).toFixed(2));
    if(!isFinite(mu)||mu<=0){ alert('请先在地图上画框测量出有效面积，再提交到云端'); return; }
    var ring=latlngs();
    if(!ring||ring.length<3){ alert('请先在地图上绘制地块边界'); return; }
    var sqm=Math.round(geodesicArea(points));
    var name='地块';
    try{
      var snap=window.RyPlotLibraryStore&&window.RyPlotLibraryStore.read();
      if(snap&&snap.ok){
        var prev=(snap.plots||[]).filter(function(p){return p.id===currentMapPlotId;})[0];
        if(prev&&prev.name) name=prev.name;
      }
    }catch(errName){}
    var sl=0, sn=0;
    ring.forEach(function(p){ sl+=p[0]; sn+=p[1]; });
    sl=+(sl/ring.length).toFixed(6); sn=+(sn/ring.length).toFixed(6);
    var url=CLOUD_SUBMIT_URL+'?name='+encodeURIComponent(name)+'&mu='+mu+'&area='+sqm
      +'&ring='+encodeURIComponent(JSON.stringify(ring))
      +'&center='+encodeURIComponent(JSON.stringify({lat:sl,lng:sn}));
    if(url.length>8000){ alert('地块顶点太多（'+ring.length+' 个），请先精简边界再提交'); return; }
    window.open(url,'_blank','noopener');
  }
  var _cloudBtn=document.getElementById('btnCloudSubmit');
  if(_cloudBtn) _cloudBtn.onclick=submitCurrentPlotToCloud;

  // [map-enhance] 把地块库叠加到卫星图（隔离模块，失败不影响测量主流程）
  var rymHandle=null;
  /* [NEW MODULE: 地形模块 v286f] onSendDesign/onSendTerrain：地块弹窗「回传」按钮 → 页面局部回传函数（跳对应页）。 */
  try{ if(window.RunyeMapEnhance) rymHandle=window.RunyeMapEnhance.attach(map, {onMeasure:setMeasureOn, toDisplay:toDisplay, autoFit:!lsGet(K_VIEW,null), onMergeMode:onMergeModeChange, mergePick:false, onMergeDone:function(){ renderMyPlots(); },
    onSendDesign:function(p){ sendPlotToDesign(p, document.getElementById('btnCopy')); },
    onSendTerrain:function(p){ sendPlotToTerrain(p, document.getElementById('btnCopyTerrain')); },
    /* [NEW MODULE: 地块删除 v352] 弹窗删除地块后刷新「我的地块」列表 */
    onPlotsChanged:function(){ renderMyPlots(); }}); }catch(e){}

  /* ===== [v185/v189 2026-10-03] 多地块成组 =====
   * 用户诉求：画几个相邻小地块 → **成组**便于一起操作；各小地块分别布管，
   *   再用总管互连；成组后把**各子地块本身**传给二级管路页面。
   * ★ 语义纠正（v189）：这是成组、不是拼接 —— 不改几何、不消除块间空隙。
   * 交互：点「🔗 地块成组」进入成组模式 → 单击地图上的地块多选（紫色高亮）
   *   → 底部操作条「成组（保留各自轮廓）」→ 生成成组地块（各成员环各自保留）。
   * 成组模式的开关同时驱动 RunyeMapEnhance 的图层面板里「🔗 地块成组」勾选框，
   *   两处状态始终一致（避免「按钮说开着、面板说关着」的分裂）。 */
  var mergeMode=false;
  function onMergeModeChange(on){ mergeMode=!!on; syncMergeUI(); }
  function syncMergeUI(){
    var b=document.getElementById('btnMerge'), x=document.getElementById('btnMergeExit'), h=document.getElementById('mergeHint');
    if(b){ b.classList.toggle('btn-on', mergeMode); b.textContent=mergeMode?'🔗 成组中…':'🔗 地块成组'; }
    if(x) x.hidden=!mergeMode;
    if(h){
      h.hidden=!mergeMode;
      h.textContent=mergeMode?'成组模式：单击地块选中（可多选），底部「成组（保留各自轮廓）」。再次点击已选地块可取消选中。各块轮廓与块间空隙都会保留。':'';
    }
  }
  function setMergeMode(on){
    on=!!on;
    mergeMode=on;
    if(rymHandle){
      // 优先走面板勾选框（会触发 apply('mergepick') → 本模块 state.mergePick 同步）
      if(!(rymHandle.setLayer && rymHandle.setLayer('mergepick', on))){
        // 面板里没有这一行（例如 opts.onMergeMode 未生效）就直接翻内部态
        try{ if(rymHandle.mergeSetPick) rymHandle.mergeSetPick(on); }catch(e){}
      }
    }
    if(on){
      // 成组模式下先退出绘制/加点/测距，避免单击既落点又选地块
      try{ if(typeof drawing!=='undefined' && drawing) setDrawing(false); }catch(e){}
      try{ if(typeof setAddMode==='function') setAddMode(false); }catch(e){}
      try{ if(typeof measuring!=='undefined' && measuring) document.getElementById('btnMeasure').click(); }catch(e){}
    }
    syncMergeUI();
  }
  document.getElementById('btnMerge').onclick=function(){ setMergeMode(!mergeMode); };
  document.getElementById('btnMergeExit').onclick=function(){ setMergeMode(false); };
  syncMergeUI();

  /* 成组完成/解散后模块内部会 refresh 重绘，但地图页左侧「我的地块」列表属于
   * 宿主页 DOM，模块管不到 ⇒ 由本页自己重列。模块的底部操作条点「成组」时
   * 模块会通过 opts.onMergeDone 回调本页（doMergeSelected 里 state.onMergeDone）。 */
  function refreshPlotLibrary(){
    if(rymHandle && rymHandle.refresh) rymHandle.refresh();
    renderMyPlots();
    if(partitionHandle)partitionHandle.refresh();
  }

  /* [v831] trunkState 给探针与并行模块读总管状态用 —— drawingTrunk 已删，别再想办法摸私有变量。
     counts 里 main/others 的划分与 renderTrunkDraft 的配色一致。
     [v832] project 把 GCJ-02 经纬度换成**相对 #map 的容器像素**：探针要精确把鼠标移到某个
     顶点上（验证吸附），而 map 实例是 IIFE 私有的，没有这个出口就只能靠猜坐标。 */
  function trunkState(){
    var t=trunkSaved;
    return {
      mode: trunkMode,
      plotId: currentMapPlotId?String(currentMapPlotId):null,
      /* [v993] 屏幕上这份总管的真实归属；与 plotId 分叉时说明「显示的是别块地的线」。 */
      ownerPlotId: trunkOwnerPlotId?String(trunkOwnerPlotId):null,
      targetPlotId: trunkTargetPlotId?String(trunkTargetPlotId):null,
      draftPoints: trunkPoints.length,
      trunkCount: t&&Array.isArray(t.trunks)?t.trunks.length:0,
      mainId: (function(){var S=window.RyTrunkSchema;if(!S||!t)return null;var m=S.pickMainTrunk(t);return m?m.id:null;})(),
      schema: t?t.schema:null,
      snapOn: snapOn,
      /* [v833] 编辑态：探针要能判「选中的是哪条、手柄有几个」，
         而这些数字全在 IIFE 私有变量里，没有出口就只能靠截图猜。 */
      activeTrunkId: activeTrunkId===null?null:String(activeTrunkId),
      vertexHandles: trunkEditLayers.length,
      menuOpen: !!(trunkCtxMenu && !trunkCtxMenu.hidden),
      clipboardEmpty: paramsClipboard===null,
      trunkIds: t&&Array.isArray(t.trunks)?t.trunks.map(function(x){return String(x.id);}):[],
      /* [v834] 撤销栈状态：探针要能判「栈里几步、游标在哪、能不能撤」，
         这些数字全在模块私有闭包里，没有出口就只能靠"按一下看看反应"猜。 */
      history: trunkHistory?trunkHistory.stats():null,
      /* [v835] 三期遗留的三类捕捉是否真接上了：sign 是自校准选出的 y 方向，
         三类计数为 0 且 extras=null 说明「这块地反算不可靠，按设计跳过」。 */
      snapExtras: snapExtras?JSON.parse(JSON.stringify(snapExtras.stats)):null
    };
  }
  function projectToContainer(lat,lng){
    var cp=map.latLngToContainerPoint(displayLatLngOf(lat,lng));
    return {x:cp.x,y:cp.y};
  }
  window.RyMapHost={payload:buildPlotPayload,send:sendPlotToDesign,sendDraft:onSendCurrentDraft,trunkState:trunkState,
    /* [v843] 当前在地图上编辑哪块地。
       为什么必须有这个口：`currentMapPlotId` 是**闭包变量**，外面读不到（探针踩过：
       `window.currentMapPlotId` 恒为 undefined）。而 v843 要让三级扬程取"在线地图上画的
       总管"，就得知道这块地的 id 去地块库里翻 plot.trunk。
       只读、不暴露整个状态 —— 需要的只是一个标量。 */
    currentPlotId:function(){return currentMapPlotId;},
    project:projectToContainer,toDisplay:toDisplay,refresh:refreshPlotLibrary,
    /* [v833] 编辑层出口：探针要能「按 id 进编辑、拿菜单项、算两点米距」。
       菜单项走 RyTrunkEdit.buildMenuItems 的同一口径，避免探针自己复制一份文案
       然后每次改文案都要同步两个地方。 */
    editTrunk:enterTrunkEdit,exitTrunkEdit:exitTrunkEdit,
    /* [v838] 选中指定干线（探针要能验"换一条线面板跟着换"）。 */
    selectTrunk:selectTrunk,
    trunkMenuItems:function(state){var E=window.RyTrunkEdit;return E?E.buildMenuItems(state||{}):[];},
    trunkDist:trunkDistM,
    /* [v834] 撤销 / 重做：探针要能绕过键盘直接调（键盘路径由 D6 单独验）。 */
    undoTrunk:undoTrunk,redoTrunk:redoTrunk,
    /* [v835] 捕捉候选重算：探针要能验「换了地块归属之后三类是否真的被踢出去」，
       否则只能靠"切地块再进绘制态"间接触发，测不出守卫本身。 */
    refreshSnapTargets:refreshSnapTargets,snapStats:function(){var S=snapApi();return S?S.stats():null;}};
  var partitionHandle=window.RyMapPartition && RyMapPartition.attach(map);
  /* ===== [v975] 三级施工节点变更 → 地图节点标记/吸附候选自动刷新。
     此前 snapExtras（含 v917 三级施工节点 → mainCouplers）只在进绘制/编辑态、
     拖白点等动作时经 refreshSnapTargets() 重建；用户在「分区与管路」删除施工
     节点（RyTlNodes.removeNode）后地图侧没有任何钩子 ⇒ v918 常显标记层残留
     已删节点，切回地图页也不更新。两路触发、共用 300ms 防抖：
     ① 订阅 RyTlNodes 通知（增删节点/改桩号/连线变化）；
     ② #onlineMapSection class/hidden 变化（切页回地图时兜底重建——
        删除动作发生在三级页、当时地图页隐藏，纯订阅会错过）。
     tl-nodes.js 先于本文件加载（index.html 2304 vs 2432），订阅时必已就绪。 */
  (function(){
    var t=null;
    function schedule(){
      if(!map) return;
      if(t) clearTimeout(t);
      t=setTimeout(function(){ t=null; if(mapSectionVisible()){ try{ refreshSnapTargets(); }catch(eRf){} } },300);
    }
    try{
      if(window.RyTlNodes&&typeof window.RyTlNodes.subscribe==='function') window.RyTlNodes.subscribe(schedule);
    }catch(eSub){}
    try{
      var sec=document.getElementById('onlineMapSection');
      if(sec&&window.MutationObserver){
        new MutationObserver(function(){ if(mapSectionVisible()) schedule(); })
          .observe(sec,{attributes:true,attributeFilter:['class','hidden','style']});
      }
    }catch(eObs){}
  })();
  // [map-enhance] 导出：把当前画框 + 地块库全部带坐标地块打包成 GeoJSON / KML
  function collectPlotsForExport(){
    var arr=[];
    if(points && points.length>=3){
      var ll=latlngs();
      arr.push({name:'当前画框', mu:parseFloat((geodesicArea(ll)/666.67).toFixed(2)), polyLatLng:ll});
    }
    try{
      var librarySnapshot=window.RyPlotLibraryStore.read();
      if(librarySnapshot.ok) librarySnapshot.plots.forEach(function(p){
        if(p && p.polyLatLng && p.polyLatLng.length>=3 && !(points.length>=3 && p.id===currentMapPlotId)) arr.push(p);
      });
    }catch(e){}
    return arr;
  }
  function doExport(fmt){
    var arr=collectPlotsForExport();
    if(!arr.length){ alert('没有可导出的地块：先在地图上画框，或先「保存地块」。'); return; }
    try{
      if(fmt==='geojson') RunyeMapEnhance.export.download('runye-plots.geojson', RunyeMapEnhance.export.geoJSON(arr), 'application/geo+json;charset=utf-8');
      else RunyeMapEnhance.export.download('runye-plots.kml', RunyeMapEnhance.export.kml(arr), 'application/vnd.google-earth.kml+xml;charset=utf-8');
    }catch(e){ alert('导出失败：'+e.message); }
  }
  document.getElementById('btnGeoJSON').onclick=function(){ doExport('geojson'); };
  document.getElementById('btnKML').onclick=function(){ doExport('kml'); };

  // [map-enhance] 导入：读取 GeoJSON/KML 文件，解析成地块存入地块库并叠加到地图
  document.getElementById('btnImport').onclick=function(){ document.getElementById('fileImport').click(); };
  function importTextAsPlots(text, isKml){
    var arr=null;
    if(isKml || /<kml[\s>]/i.test(text.slice(0,800))) arr=RunyeMapEnhance.parse.kml(text);
    else arr=RunyeMapEnhance.parse.geoJSON(text);
    if(!arr || !arr.length){ alert('未能从文件中解析出地块多边形（需要至少一个闭合多边形）。'+((arr&&arr.skipped&&arr.skipped.length)?'\\n其中跳过无效轨迹/环线：'+arr.skipped.join('、'):'')); return; }
    var plotStore=window.RyPlotLibraryStore;
    var snapshot=plotStore&&plotStore.read();
    if(!snapshot||!snapshot.ok){ alert('地块库读取失败，导入已取消，原数据未更改。'); return; }
    var lib=snapshot.plots;
    var allLL=[];
    arr.forEach(function(p){
      var ll=p.polyLatLng; if(!ll || ll.length<3) return;
      // [GCJ-02 修复 2026-09-28] 导入文件的坐标是标准 WGS-84，转成 GCJ-02 才能贴合高德影像
      var llGcj = RunyeGeo ? RunyeGeo.polyWgs2Gcj(ll) : ll;
      var mu=parseFloat((geodesicArea(llGcj)/666.67).toFixed(2));
      var sqm=Math.round(geodesicArea(llGcj));
      // 转本地米坐标（与「保存地块」同一原点：首点经度 x、平均纬度 y）
      var xs=[],ys=[];
      var lats=llGcj.map(function(q){return q[0];}), lngs=llGcj.map(function(q){return q[1];});
      var clat=lats.reduce(function(a,b){return a+b;},0)/lats.length;
      var R=6378137, mlat=R*Math.PI/180, cosLat=Math.cos(clat*Math.PI/180);
      llGcj.forEach(function(q){ xs.push((q[1]-lngs[0])*mlat*cosLat); ys.push((q[0]-clat)*mlat); });
      var sn=lngs.reduce(function(a,b){return a+b;},0)/lngs.length;
      lib.push({ id:'imp'+Date.now()+Math.floor(Math.random()*1000),
        name:p.name||('导入地'+(lib.length+1)), mu:mu, sqm:sqm,
        poly:xs.map(function(x,i){return {x:Math.round(x*100)/100,y:Math.round(ys[i]*100)/100};}),
        polyLatLng:llGcj, center:{lat:+clat.toFixed(6),lng:+sn.toFixed(6)},
        geo:{refLat:+clat.toFixed(6), refLng:+llGcj[0][1].toFixed(6), proj:'mercatorLocal'},
        source:'import', crs:'GCJ-02', ts:Date.now(), note:'' });
      allLL=allLL.concat(llGcj);
    });
    var saveResult=plotStore.replace(lib,snapshot.revision);
    if(!saveResult.ok){ alert('导入失败，地块库未更改：'+saveResult.error); return; }
    refreshPlotLibrary();
    if(allLL.length){ try{ map.fitBounds(L.latLngBounds(displayRing(allLL)),{padding:[30,30],maxZoom:17}); }catch(err){} }
    var skipMsg=(arr.skipped&&arr.skipped.length)?'\\n跳过 '+arr.skipped.length+' 条无效轨迹/环线（自相交或退化）：'+arr.skipped.join('、'):'';
    alert('已导入 '+arr.length+' 个地块到地块库，并定位到导入范围。'+skipMsg);
  }
  function extractKmlFromZip(bytes){
    var view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), eocd=-1;
    for(var p=Math.max(0,bytes.length-65557);p<=bytes.length-22;p++){
      if(view.getUint32(p,true)===0x06054b50 && p+22+view.getUint16(p+20,true)===bytes.length) eocd=p;
    }
    if(eocd<0) return Promise.reject(new Error('ZIP 目录损坏或不完整'));
    if(view.getUint16(eocd+4,true)!==0 || view.getUint16(eocd+6,true)!==0) return Promise.reject(new Error('暂不支持分卷 ZIP 文件'));
    var count=view.getUint16(eocd+10,true), cdOffset=view.getUint32(eocd+16,true), pos=cdOffset, entries=[];
    if(count===0xffff || cdOffset===0xffffffff) return Promise.reject(new Error('暂不支持 ZIP64 格式'));
    for(var i=0;i<count;i++){
      if(pos+46>bytes.length || view.getUint32(pos,true)!==0x02014b50) return Promise.reject(new Error('ZIP 中央目录损坏'));
      var flags=view.getUint16(pos+8,true), method=view.getUint16(pos+10,true);
      var compressedSize=view.getUint32(pos+20,true), nameLen=view.getUint16(pos+28,true);
      var extraLen=view.getUint16(pos+30,true), commentLen=view.getUint16(pos+32,true), localOffset=view.getUint32(pos+42,true);
      if(compressedSize===0xffffffff || localOffset===0xffffffff) return Promise.reject(new Error('暂不支持 ZIP64 格式'));
      if(pos+46+nameLen+extraLen+commentLen>bytes.length) return Promise.reject(new Error('ZIP 文件名或目录长度异常'));
      var name=new TextDecoder('utf-8').decode(bytes.subarray(pos+46,pos+46+nameLen));
      if(/\.kml$/i.test(name)) entries.push({name:name,flags:flags,method:method,compressedSize:compressedSize,localOffset:localOffset});
      pos+=46+nameLen+extraLen+commentLen;
    }
    if(!entries.length) return Promise.resolve(null);
    entries.sort(function(a,b){
      var ad=a.name.split(/[\\/]/).pop().toLowerCase()==='doc.kml', bd=b.name.split(/[\\/]/).pop().toLowerCase()==='doc.kml';
      return ad===bd?0:(ad?-1:1);
    });
    function decodeEntry(entry){
      if(entry.flags&1) return Promise.reject(new Error('KMZ 中的 KML 已加密，无法读取'));
      var off=entry.localOffset;
      if(off+30>bytes.length || view.getUint32(off,true)!==0x04034b50) return Promise.reject(new Error('KML 条目头损坏'));
      var dataStart=off+30+view.getUint16(off+26,true)+view.getUint16(off+28,true), dataEnd=dataStart+entry.compressedSize;
      if(dataStart<off || dataEnd>bytes.length) return Promise.reject(new Error('KML 条目数据不完整'));
      var packed=bytes.subarray(dataStart,dataEnd), stream;
      if(entry.method===0) return Promise.resolve(new TextDecoder('utf-8').decode(packed));
      if(entry.method!==8) return Promise.reject(new Error('KML 使用暂不支持的压缩方式（'+entry.method+'）'));
      if(typeof DecompressionStream==='undefined') return Promise.reject(new Error('当前浏览器不支持 KMZ 解压，请先解压后导入 KML'));
      try{ stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')); }
      catch(err){ return Promise.reject(new Error('当前浏览器不支持该 KMZ 压缩格式，请先解压后导入 KML')); }
      return new Response(stream).arrayBuffer().then(function(raw){return new TextDecoder('utf-8').decode(raw);});
    }
    var idx=0, lastError=null;
    function next(){
      if(idx>=entries.length) return lastError?Promise.reject(lastError):Promise.resolve(null);
      return decodeEntry(entries[idx++]).then(function(text){return text;},function(err){lastError=err;return next();});
    }
    return next();
  }
  function handleKmz(file){
    if(typeof DecompressionStream==='undefined'){
      alert('当前浏览器不支持 KMZ 解压，请先解压后导入 KML'); return;
    }
    var reader=new FileReader();
    reader.onload=function(){
      var bytes=new Uint8Array(reader.result||new ArrayBuffer(0));
      if(bytes.length<4 || bytes[0]!==0x50 || bytes[1]!==0x4b){alert('不是有效的 KMZ/ZIP 文件');return;}
      extractKmlFromZip(bytes).then(function(text){
        if(text===null){alert('KMZ 内未找到 KML 文件（doc.kml 或任意 .kml 条目）');return;}
        importTextAsPlots(text,true);
      }).catch(function(err){alert('KMZ 解压失败：'+err.message);});
    };
    reader.onerror=function(){alert('KMZ 文件读取失败，请重新选择文件。');};
    reader.readAsArrayBuffer(file);
  }
  document.getElementById('fileImport').onchange=function(e){
    var f=e.target.files && e.target.files[0];
    if(!f) return;
    if(/\.kmz$/i.test(f.name)){handleKmz(f);e.target.value='';return;}
    var reader=new FileReader();
    reader.onload=function(){
      try{
        var text=String(reader.result||'');
        importTextAsPlots(text,/\.kml$/i.test(f.name));
      }catch(err){ alert('导入失败：'+err.message); }
      e.target.value='';
    };
    reader.onerror=function(){alert('文件读取失败，请重新选择文件。');e.target.value='';};
    reader.readAsText(f,'utf-8');
  };

  // [map-enhance] 我的地块列表：读 runye_plot_library，点击飞到该地块，×删除（删后同步刷新卫星叠加）
  /* ===== [v993] 总管归属回收：地块删除后，把它名下的手绘总管从地图与缓存一起清掉 =====
   * 数据层本来就按地块存（plot.trunk 挂在 plot 记录上，删记录即删数据）；漏的是显示层：
   * trunkSaved / trunkSavedLayers / trunkNodeLayers / trunkPoints / 撤销栈都是 IIFE 私有状态，
   * 地块库变了不会自动失效 ⇒ 用户看到「地块没了，蓝线还在」，甚至还能继续编辑这条线。
   * 判据只认地块库 + trunkOwnerPlotId（真实归属），不认 currentMapPlotId：
   * 删的可能是别的地块，而屏幕上留的线属于刚被删的那块。
   * 挂在 renderMyPlots()：弹窗删除 / 左栏 × 删除 / 成组 / 解散 / 工程导入 都会重列地块，
   * 一处收口，不必在每个删除按钮里各写一份清理逻辑。
   * 库读取失败一律不动 —— 宁可暂时多留一条线，也不能误删用户刚画的总管。 */
  function trunkOwnerAlive(plots, ownerId){
    if(!ownerId) return false;
    for(var i=0;i<plots.length;i++){
      var p=plots[i];
      if(p && String(p.id)===String(ownerId))
        return !p.merged && !p.grouped && !p.mergedInto;
    }
    return false;
  }
  function gcTrunkByPlotOwner(){
    var store=window.RyPlotLibraryStore;
    var snap=store&&typeof store.read==='function'?store.read():null;
    if(!snap||!snap.ok) return;
    var plots=Array.isArray(snap.plots)?snap.plots:[];
    var owner=String(trunkOwnerPlotId||'');
    var hasVisual=!!(trunkSaved||trunkPoints.length||trunkSavedLayers.length||trunkNodeLayers.length);
    if(!owner && !hasVisual) return;                     // 本来就没有总管，无需回收
    if(owner && trunkOwnerAlive(plots,owner)) return;    // 归属地块仍可独立编辑 ⇒ 什么都不动
    /* 归属地块已删 / 已归入成组 / 压根没有归属却还画着线 ⇒ 清。 */
    trunkSaved=null;
    trunkOwnerPlotId=null;
    if(String(currentMapPlotId||'')===owner || !owner) currentMapPlotId=null;
    if(trunkHistory) trunkHistory.clear();
    try{ hideTrunkWarn(); }catch(e){}
    /* idle 分支统一清草稿/选中/线层/节点层/按钮/状态栏/参数面板，避免漏掉某一层。 */
    setTrunkMode('idle');
  }
  function renderMyPlots(){
    gcTrunkByPlotOwner();   /* [v993] 先按地块库回收无主/已删地块的总管，再重列列表 */
    var box=document.getElementById('myPlotList');
    if(!box) return;
    var store=window.RyPlotLibraryStore;
    var snapshot=store&&typeof store.read==='function'?store.read():{ok:false,error:'plot-library-store-unavailable'};
    var arr=snapshot.ok?snapshot.plots:[];
    /* [v885] 地块唯一性：auto-current 副本的本体已在库里时不进列表（与地图叠加层
       renderPlots 同判据）—— 否则「我的地块」双行 + 卫星图两层叠加（用户实测）。 */
    arr=arr.filter(function(p){
      if(!p||p.source!=='auto'||p.designPlotId==null||p.designPlotId==='')return true;
      var owner=String(p.designPlotId);
      return !snapshot.plots.some(function(o){return o&&String(o.id)===owner;});
    });
    box.innerHTML='';
    if(!snapshot.ok){box.textContent='地块库读取失败，未显示列表；请刷新后重试。';box.hidden=false;return;}
    arr.forEach(function(p){
      if(!p || !p.id) return;
      var row=document.createElement('div'); row.className='place-item'; row.setAttribute('data-plot-id',String(p.id));
      var go=document.createElement('button');
      go.type='button'; go.className='place-go'; go.setAttribute('data-plot-id',String(p.id));
      // [v185/v189] 成组地块：前缀「🔗」并在名称后显示子地块数；归档中的子地块加「⊂」前缀
      // [v810 去图标] 普通地块不再加 📍 前缀（用户：左栏图标一律取消）；🔗/⊂ 是状态标记（成组/已归档）保留。
      var prefix = p.merged ? '🔗' : (p.mergedInto ? '⊂' : '');
      var suffix = p.merged ? '（'+(p.subPlots?p.subPlots.length:0)+'块成组）' : '';
      go.textContent=(prefix?prefix+' ':'')+(p.name||'地块')+suffix+'（'+(p.mu!=null?p.mu:'?')+'亩）';
      go.title = p.merged ? ('由 '+(p.subPlots||[]).length+' 个子地块成组（轮廓与块间空隙保留）：'+(p.subPlots||[]).map(function(s){return s.name||s.id;}).join('、'))
                          : (p.name||'');
      go.onclick=function(){
        if(trunkMode==='draw'){tip('请先完成或取消当前总管绘制，再切换地块；草稿不会转存到其他地块。');return;}
        /* [v834] 换地块必须清撤销栈：快照里没有地块归属，留着它撤销会把 A 块的状态
           写到 B 块上（module 里 record 也会因 plotId 变化自愈，但这里显式清一次，
           保证「切过去就撤不动」这个行为是确定的，而不是"等到下一次编辑才自愈"）。 */
        if(trunkHistory && String(p.id)!==String(currentMapPlotId)) trunkHistory.clear();
        currentMapPlotId=p.id;
        renderReservoir();
        /* [v831] 回填改走 schema 归一：v1 单段与 v2 多干线都能读，不再手写 schema===1。
           这里只把已保存的线画出来（只读），不自动进入绘制态。 */
        trunkSaved=loadSavedTrunkFor(p);
        trunkOwnerPlotId=String(p.id);   /* [v993] 换地块 = 换归属；没有总管的地块记为该块无总管 */
        setTrunkMode('idle');
        renderTrunkDraft();
        /* [v975] 换地块即重建节点标记/吸附候选：v918 常显标记层不该等到进绘制态才出现，
           选中地块当下就该看到这块地身上的施工节点（数据源 extraSnapTargets(plot)）。 */
        try{ refreshSnapTargets(); }catch(eRfGo){}
        var ll=p.polyLatLng;
        if(ll && ll.length>=3){ try{ map.fitBounds(L.latLngBounds(displayRing(ll)),{padding:[40,40],maxZoom:17}); }catch(e){} }
        else if(p.center){ try{ map.setView(toDisplay(p.center),16); }catch(e){} }
      };
      /* [v191] 「→ 回传二级管路」：显式指定回传对象 —— 成组地块也能传了。
         没有这个入口时，成组地块只能靠 currentMapPlotId 被「顺带」选中，而它从不被赋值
         ⇒ 成组地块永远传不过去（用户「还是不行」的真因）。 */
      var sd=document.createElement('button');
      sd.type='button'; sd.className='place-send'; sd.textContent='→';
      sd.title=p.merged
        ? ('把「'+(p.name||'该成组地块')+'」回传到地块分区页：'+((p.subPlots||[]).length)+' 个子地块各自的环都会带过去，块间空隙保留')
        : ('把「'+(p.name||'该地块')+'」回传到地块分区页');
      sd.onclick=function(){
        if(p.mergedInto){ alert('这是已归入成组的子地块，请回传它所属的成组地块（🔗 那一条）。'); return; }
        sendPlotToDesign(p, this);
      };
      var del=document.createElement('button');
      del.type='button'; del.className='place-del'; del.textContent='×'; del.title='删除该地块';
      del.onclick=function(){
        var latest=store.read();
        if(!latest.ok){alert('删除失败：地块库读取失败，数据没有更改。');return;}
        var matches=latest.plots.filter(function(x){return x&&x.id===p.id;});
        if(matches.length!==1){alert('删除失败：地块已不存在或编号重复，请刷新后重试。');return;}
        var now=latest.plots.filter(function(x){return x&&x.id!==p.id;});
        var saved=store.replace(now,latest.revision);
        if(!saved.ok){alert(saved.error==='plot-library-conflict'?'删除失败：地块库已被其他操作更新，请刷新后重试。':'删除失败：地块库没有更改。');return;}
        renderMyPlots();
        if(typeof rymHandle!=='undefined' && rymHandle && rymHandle.refresh){ try{ rymHandle.refresh(); }catch(e){} }
      };
      row.appendChild(go);
      row.appendChild(sd);
      // [v185/v189] 成组地块多给一个「↩ 解散成组」按钮（拆回子地块）
      if(p.merged){
        var un=document.createElement('button');
        un.type='button'; un.className='place-del'; un.textContent='↩'; un.title='解散成组，拆回 '+(p.subPlots?p.subPlots.length:0)+' 个子地块（轮廓与块间空隙本来就没动过）';
        un.onclick=function(){
          if(!confirm('解散成组？\n将把「'+(p.name||'该地块')+'」拆回 '+((p.subPlots||[]).length)+' 个子地块。')) return;
          try{
            var r=RunyeMapEnhance.merge.unmerge(p.id);
            if(!r.ok){ alert('解散成组失败：'+r.reason); return; }
            renderMyPlots();
            if(rymHandle && rymHandle.refresh) rymHandle.refresh();
          }catch(e){ alert('解散成组失败：'+e.message); }
        };
        row.appendChild(un);
      }
      row.appendChild(del); box.appendChild(row);
    });
    box.hidden = arr.length===0;
  }
  // [map-enhance] 测距工具：逐点量距离，不入库，与地块绘制互斥；双击结束
  var measuring=false, measurePts=[], measureLayer=L.layerGroup().addTo(map);
  document.getElementById('btnMeasure').onclick=function(){
    measuring=!measuring;
    if(measuring&&reservoirPlaceMode)setReservoirPlaceMode(false);
    this.classList.toggle('btn-on',measuring);
    this.setAttribute('aria-pressed',measuring?'true':'false');
    if(measuring){
      if(trunkMode!=='idle'){setTrunkMode('idle');}
      setAddMode(false);
      if(drawing) setDrawing(false);
      map.dragging.disable();
      tip('测距模式：点击地图逐点打点，紫色虚线显示累计距离，双击结束。');
    } else finishMeasure();
  };
  function finishMeasure(){
    measuring=false;
    var bm=document.getElementById('btnMeasure'); if(bm){ bm.classList.remove('btn-on'); bm.setAttribute('aria-pressed','false'); }
    if(!drawing) map.dragging.enable();
    measureLayer.clearLayers(); measurePts=[];
    tip('测距结束。');
  }
  map.on('click', function(e){
    if(!measuring) return;
    measurePts.push(fromDisplay(e.latlng));
    renderMeasure();
  });
  map.on('dblclick', function(){ if(measuring) finishMeasure(); });
  function renderMeasure(){
    measureLayer.clearLayers();
    if(!measurePts.length) return;
    measurePts.forEach(function(p){
      L.circleMarker(toDisplay(p),{radius:4,color:'#7c3aed',fillColor:'#7c3aed',fillOpacity:1}).addTo(measureLayer);
    });
    if(measurePts.length>=2){
      L.polyline(measurePts.map(toDisplay),{color:'#7c3aed',weight:2,dashArray:'6,4'}).addTo(measureLayer);
      var total=0; for(var i=1;i<measurePts.length;i++) total+=hav(measurePts[i-1],measurePts[i]);
      tip('累计测距：'+total.toFixed(1)+' 米（'+measurePts.length+' 点，双击结束）');
    }
  }

  // [map-enhance] 工程文件导出/导入：打包地块库+管网+视图为单文件，换设备不丢数据
  document.getElementById('btnExportProj').onclick=function(){
    try{
      var librarySnapshot=window.RyPlotLibraryStore.read();
      if(!librarySnapshot.ok) throw new Error('地块库读取失败，已停止导出');
      var data={ app:'runye-irrigation', version:1, ts:Date.now(),
        plots: librarySnapshot.plots,
        network: window.RyIrrigationDataStore.readNetworkLayout(),
        view: JSON.parse(localStorage.getItem('runye_map_view')||'null') };
      var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='runye-project-'+new Date().toISOString().slice(0,10)+'.runye.json';
      document.body.appendChild(a); a.click(); setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},100);
    }catch(e){ alert('导出失败：'+e.message); }
  };
  document.getElementById('btnImportProj').onclick=function(){ document.getElementById('fileProj').click(); };
  document.getElementById('fileProj').onchange=function(e){
    var f=e.target.files&&e.target.files[0]; if(!f) return;
    var reader=new FileReader();
    reader.onload=function(){
      try{
        var d=JSON.parse(String(reader.result||''));
        if(!d || d.app!=='runye-irrigation' || d.version!==1 || !Array.isArray(d.plots)) throw new Error('不是支持的润野工程文件');
        var ids=Object.create(null);
        d.plots.forEach(function(p){
          if(!p || typeof p.id!=='string' || !p.id || ids[p.id]) throw new Error('地块 ID 缺失或重复');
          ids[p.id]=true;
          if(p.crs && p.crs!=='GCJ-02') throw new Error('工程坐标系不受支持');
          if(p.polyLatLng){
            p.polyLatLng=RunyeGeo.normalizeRing(p.polyLatLng);
            p.sqm=Math.round(geodesicArea(p.polyLatLng));p.mu=+(p.sqm/666.67).toFixed(2);
            if(p.geo){RunyeGeo.coordPair([p.geo.refLat,p.geo.refLng]);}else p.geo=RunyeGeo.baseOfFeature(p);
            p.poly=RunyeGeo.polyLL2m(p.polyLatLng,p.geo);
          }else if(!Array.isArray(p.poly) || p.poly.length<3 || !p.poly.every(function(q){return q && typeof q.x==='number' && isFinite(q.x) && typeof q.y==='number' && isFinite(q.y);}) || !(p.sqm>0)) throw new Error('地块缺少有效边界或面积');
        });
        if(d.network!=null){
          if(!Array.isArray(d.network.segments)) throw new Error('工程管网格式错误');
          d.network.segments.forEach(function(s){if(!s || !Array.isArray(s.latLng) || s.latLng.length<2) throw new Error('管段坐标不足');s.latLng.forEach(RunyeGeo.coordPair);});
          if(d.network.sourcePos) RunyeGeo.coordPair(d.network.sourcePos);
          ['valves','dripTapes'].forEach(function(key){if(d.network[key]!=null && !Array.isArray(d.network[key])) throw new Error('设备或滴灌带格式错误');});
          (d.network.valves||[]).forEach(RunyeGeo.coordPair);
          (d.network.dripTapes||[]).forEach(function(line){if(!Array.isArray(line) || line.length<2) throw new Error('滴灌带坐标不足');line.forEach(RunyeGeo.coordPair);});
        }
        if(d.view!=null){RunyeGeo.coordPair(d.view);if(typeof d.view.zoom!=='number' || !isFinite(d.view.zoom) || d.view.zoom<3 || d.view.zoom>19) throw new Error('地图缩放级别无效');}
        var plotStore=window.RyPlotLibraryStore;
        if(!plotStore || typeof plotStore.read!=='function' || typeof plotStore.replace!=='function' || typeof plotStore.restoreSnapshot!=='function')
          throw new Error('地块库安全存储接口不可用');
        var irrigationStore=window.RyIrrigationDataStore;
        if(!irrigationStore || typeof irrigationStore.readRawNetworkLayout!=='function' || typeof irrigationStore.restoreNetworkLayoutIfCurrent!=='function' ||
           typeof irrigationStore.validateNetworkPlotBinding!=='function' || typeof irrigationStore.readNetworkLayoutStateForCurrentPlot!=='function')
          throw new Error('管网快照安全存储接口不可用');
        var plotSnapshot=plotStore.read();
        if(!plotSnapshot.ok)throw new Error('地块库读取失败，未导入：'+plotSnapshot.error);
        var networkBinding=irrigationStore.validateNetworkPlotBinding(d.network,d.plots);
        if(!networkBinding || !networkBinding.ok){
          var bindingError=networkBinding && networkBinding.error;
          if(bindingError==='network-plot-not-in-project') throw new Error('工程管网绑定的地块不在本工程地块库中，已取消导入以避免串用');
          if(bindingError==='network-plot-ambiguous') throw new Error('工程管网绑定的地块编号重复，已取消导入以避免串用');
          throw new Error('工程管网与地块归属校验失败，已取消导入');
        }
        var viewKey='runye_map_view';
        var networkScopeId=d.network==null?undefined:(d.network.plotId||null);
        var oldNetworkRaw=typeof networkScopeId==='undefined'
          ? irrigationStore.readRawNetworkLayout()
          : irrigationStore.readRawNetworkLayout(networkScopeId);
        var plotWrite=null,networkWritten=false;
        try{
          plotWrite=plotStore.replace(d.plots,plotSnapshot.revision);
          if(!plotWrite.ok)throw new Error('地块库写入失败：'+plotWrite.error);
          var networkWriteResult=d.network==null
            ? irrigationStore.writeNetworkLayout(null)
            : irrigationStore.writeNetworkLayout(d.network,networkScopeId);
          if(networkWriteResult!==true)throw new Error('无法确认要清除的管网地块归属，已停止导入');
          networkWritten=true;
          if(d.view==null) localStorage.removeItem(viewKey);else localStorage.setItem(viewKey,JSON.stringify(d.view));
        }catch(writeError){
          if(plotWrite && plotWrite.ok){
            var plotRollback=plotStore.restoreSnapshot(plotSnapshot,plotWrite.revision);
            if(!plotRollback.ok)console.error('工程导入回滚失败',plotStore.key,plotRollback.error);
          }
          if(networkWritten){
            try{
              var networkRollback=typeof networkScopeId==='undefined'
                ? irrigationStore.restoreNetworkLayoutIfCurrent(d.network==null?null:JSON.stringify(d.network),oldNetworkRaw)
                : irrigationStore.restoreNetworkLayoutIfCurrent(d.network==null?null:JSON.stringify(d.network),oldNetworkRaw,networkScopeId);
              if(!networkRollback.ok)throw new Error(networkRollback.error==='network-layout-conflict'?'管网快照已被其他页面修改，拒绝覆盖':'管网快照恢复失败');
            }catch(restoreError){console.error('工程导入回滚失败',irrigationStore.keys.networkLayout,restoreError);}
          }
          throw writeError;
        }
        document.getElementById('btnClear').click();setDrawing(false);
        refreshPlotLibrary();
        if(d.view) map.setView(toDisplay(d.view),d.view.zoom,{animate:false});
        var networkStatus='、无管网';
        if(d.network){
          if(networkBinding.status==='unbound') networkStatus='、管网已导入但缺少地块绑定，为避免串用暂不显示';
          else {
            var activeOwner=irrigationStore.readNetworkLayoutStateForCurrentPlot(d.network);
            networkStatus=activeOwner && activeOwner.status==='current'
              ? '、管网已恢复'
              : '、管网已导入但与当前地块不匹配，地图暂不显示';
          }
        }
        alert('工程已导入：'+d.plots.length+' 个地块'+networkStatus);
      }catch(err){ alert('导入失败：'+err.message); }
      e.target.value='';
    };
    reader.readAsText(f,'utf-8');
  };

  renderMyPlots();

  refresh();

  /* ===== [v588] 从 URL 参数回填地块（云端地块库「载入地图」用） =====
     管理员在云端地块库点「载入地图」→ 带着 cloudring（[[lat,lng],…]）与 cloudname 回到主站；
     这里把它直接设成当前绘制，并自动切到在线地图页 + 缩放到该地块范围。
     之后「💾 保存地块」「↩ 回传地块绘制」等既有按钮照常可用（它们都读 points / latlngs()）。
     用完立刻把 URL 参数清掉，避免刷新时重复导入。 */
  function importCloudRingFromUrl(){
    try{
      var q=new URLSearchParams(location.search);
      var raw=q.get('cloudring');
      if(!raw) return;
      var cloudBinding=window.RyCloudDesignBindingStore;
      /* 新云端导入先清旧关联；即使新载荷损坏或缺少 cloudid，也不能继承上一块云端地块编号。 */
      try{ if(cloudBinding && typeof cloudBinding.clear==='function') cloudBinding.clear(); }catch(errClearCloudBinding){}
      var ring=JSON.parse(raw);
      if(!Array.isArray(ring)||ring.length<3) return;
      var name=q.get('cloudname')||'云端地块';
      var pid=q.get('cloudid');
      /* 仅暂存本标签页中的云端编号与原始边界签名，等待同一地块写入本地库并回传。 */
      if(cloudBinding && typeof cloudBinding.beginCloudImport==='function') cloudBinding.beginCloudImport(pid,ring);
      try{ history.replaceState(null,'',location.pathname+location.hash); }catch(errH){}
      var go=function(){
        try{
          points=ring.map(function(p){ return {lat:Number(p[0]), lng:Number(p[1])}; });
          if(!measureOn) setMeasureOn(true);
          refresh();
          if(map&&poly&&map.fitBounds) map.fitBounds(poly.getBounds(),{padding:[30,30]});
          var mu=(geodesicArea(points)/666.67).toFixed(2);
          try{ if(typeof window.atShowToast==='function') window.atShowToast('已载入云端地块：'+name+'（'+mu+' 亩）'); }
          catch(errT){ alert('已载入云端地块：'+name+'（'+mu+' 亩）'); }
        }catch(err){ try{ alert('云端地块载入失败：'+err.message); }catch(errA){} }
      };
      /* 主站需先切到在线地图区块，否则容器尺寸无效、fitBounds 会偏 */
      try{ if(typeof window.rySetTab==='function') window.rySetTab('onlineMapSection','map'); }catch(errTab){}
      setTimeout(go, 350);
    }catch(e){ }
  }
  importCloudRingFromUrl();
})();

/* ===== [v809 搜索提示弹窗改为右侧浮出] =====
   用户反馈：「弹窗放在右侧吧，如果放在底部，容易把下面的内容遮挡了」。
   左栏 .side 是 overflow:auto 的滚动容器，绝对定位子元素会被横向裁掉 —— 要弹到卫星图上
   必须跳出裁切，故用 position:fixed + 本例程按搜索行实时算坐标（CSS 侧只留外观）。
   触发：搜索行 mouseenter / 行内 focusin；隐藏：mouseleave / 行内失焦。
   坐标：left = 搜索行右缘 + 8px；top = 搜索行顶（与输入框齐平）；宽度自适应到
   视口右缘留 24px，夹在 220~320px。
   与 v808 关系：v808 的 #placeHint 样式段保留作外观与无 JS 兜底（display 条件含 :hover），
   本段只补坐标与 data-show 开关。撤掉本段即回退为「底部弹出」形态。 */
(function(){
  'use strict';
  var row=document.querySelector('#onlineMapSection .search-row');
  var hint=document.getElementById('placeHint');
  if(!row||!hint) return;
  var side=row.closest ? row.closest('.side') : null;
  function place(){
    try{
      var r=row.getBoundingClientRect();
      /* 基准取「左栏右缘」而不是「搜索行右缘」：行内有 10px 内边距，按行算会压掉面板边缘
         十来像素，看起来弹窗贴在栏上而不是浮在图上。 */
      var sr=side?side.getBoundingClientRect():null;
      var baseRight=Math.max(r.right,sr?sr.right:0);
      var vw=window.innerWidth||document.documentElement.clientWidth;
      hint.style.left=Math.round(baseRight+8)+'px';
      hint.style.top=Math.round(r.top)+'px';
      hint.style.maxWidth=Math.max(220,Math.min(320,vw-baseRight-24))+'px';
    }catch(e){}
  }
  function show(){ place(); hint.setAttribute('data-show','1'); }
  function hide(){ hint.removeAttribute('data-show'); }
  row.addEventListener('mouseenter',show);
  row.addEventListener('mouseleave',hide);
  row.addEventListener('focusin',show);
  row.addEventListener('focusout',function(){ setTimeout(function(){ try{ if(!row.contains(document.activeElement)) hide(); }catch(e){} },0); });
  window.addEventListener('resize',function(){ try{ if(hint.getAttribute('data-show')==='1') place(); }catch(e){} });
})();
