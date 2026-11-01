/* ============================================================================
   导出施工图为 CAD（DXF 2004，文本格式）
   ----------------------------------------------------------------------------
   平面图来源：window.tlDiagramSVG（App 自带的权威 SVG 字符串，导 PNG/打印同一份），
   从它解析，不依赖重复生成的图面DOM，避免图层互相叠加。
   坐标反算：window.tlPlanView {s,ox,oy,minX,minY}。
   图层带颜色（AutoCAD 颜色号）：
     PLOT 地块边界(白) ZONE 分区(灰) PIPE_FRONT 总管(品红)
     PIPE_MAIN 主管(蓝) PIPE_BRANCH 支管(绿) ZG_TRUNK 地图总管(深蓝)
     SYMBOL 水泵阀门(红) TEXT 文字(黄)
   ============================================================================ */
(function (global) {
  'use strict';

  var LAYERS = [
    { name: 'PLOT',         color: 7  },
    { name: 'ZONE',         color: 8  },
    { name: 'PIPE_FRONT',   color: 6  },
    { name: 'PIPE_MAIN',    color: 5  },
    { name: 'PIPE_BRANCH',  color: 3  },
    { name: 'PIPE_TAPE', color: 4 },
    { name: 'PIPE_LINK', color: 6 },
    { name: 'ZG_TRUNK',     color: 5  },
    { name: 'SYMBOL',       color: 1  },
    { name: 'TEXT',         color: 2  }
  ];

  function norm(c){ return (c||'').trim().toLowerCase(); }
  /* 平面管线一律带 data-tlpipe（或遮蔽分段 data-tlpipe-seg）。
     2026-10-02 修复：旧 pipeKind 按 stroke 颜色猜、非蓝绿一律兜底「总管」——
     平面图里 line 全是辅助线/尺寸标注线/斜短线，几百条被塞进 PIPE_FRONT 层铺满图纸四周，
     CAD 中以叠加视图呈现。 */
  function tlPipeLayer(el){
    var p = el.getAttribute('data-tlpipe') || el.getAttribute('data-tlpipe-seg') || '';
    if(el.hasAttribute('data-tltape'))return 'PIPE_TAPE';
    if(el.hasAttribute('data-tlnodelink'))return 'PIPE_LINK';
    if(el.hasAttribute('data-tlstub')||el.hasAttribute('data-connector'))return 'PIPE_MAIN';
    var manual=el.closest('[data-manpipe]');
    if(manual){var id=manual.getAttribute('data-manpipe'),list=global.RyTlEditPipes&&global.RyTlEditPipes.list?global.RyTlEditPipes.list():[],m=list.find(function(q){return q.id===id;});return m&&m.kind==='main'?'PIPE_MAIN':'PIPE_BRANCH';}
    if (!p) return null;
    if (p === 'front' || p.indexOf('front-') === 0) return 'PIPE_FRONT';
    if (p.indexOf('main') === 0) return 'PIPE_MAIN';
    if (p.indexOf('branch') === 0) return 'PIPE_BRANCH';
    return null;
  }
  function optKey(layer){ if(layer==='PIPE_TAPE')return 'tape';if(layer==='PIPE_LINK')return 'front';return layer==='PIPE_FRONT'?'front':(layer==='PIPE_MAIN'?'main':'branch'); }

  // 解析一段 SVG 字符串为 SVG 元素；失败回退 DOM 查询
  function parseSvgString(str){
    if(!str || str.indexOf('<svg')<0) return null;
    try{
      var doc = new DOMParser().parseFromString(str, 'image/svg+xml');
      var svg = doc.querySelector('svg');
      if(svg && !doc.querySelector('parsererror')) return svg;
    }catch(e){}
    return null;
  }

  function sourceSvg(){
    // 平面图：优先权威字符串
    return parseSvgString(window.tlDiagramSVG) ||
           document.querySelector('#tlDiagramContent svg');
  }

  function makeInv(pv){
    var s=pv.s, ox=pv.ox, oy=pv.oy, minX=pv.minX, minY=pv.minY;
    /* SVG y 向下、CAD y 向上：y 取负（2026-10-02 修复——旧版整幅图上下镜像） */
    return function(sx,sy){ return [(sx-ox)/s+minX, -((sy-oy)/s+minY)]; };
  }
  // Separate M subpaths: disconnected pipe runs must never gain a joining segment.
  function parsePathD(d){
    if(/[AaCcQqSsTt]/.test(d))return [];
    var t=d.match(/[MmLlHhVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[],out=[],pts=[],cx=0,cy=0,op='',i=0;
    function flush(closed){if(pts.length>1)out.push({pts:pts,closed:closed});pts=[];}
    while(i<t.length){
      if(/^[a-z]$/i.test(t[i])){op=t[i++];if(op==='Z'||op==='z'){if(pts.length){cx=pts[0][0];cy=pts[0][1];}flush(true);continue;}if(op==='M'||op==='m')flush(false);}
      var rel=op===op.toLowerCase(),u=op.toUpperCase(),a=Number(t[i++]);if(!isFinite(a))return [];
      if(u==='H')cx=rel?cx+a:a;else if(u==='V')cy=rel?cy+a:a;
      else if(u==='M'||u==='L'){var b=Number(t[i++]);if(!isFinite(b))return [];cx=(rel?cx:0)+a;cy=(rel?cy:0)+b;if(u==='M')op=rel?'l':'L';}else return [];
      pts.push([cx,cy]);
    }flush(false);return out;
  }
  function f(n){ return (Math.round(n*1000000)/1000000).toString(); }
  var nextHandle=256, lineTypes={};
  function handle(){return (nextHandle++).toString(16).toUpperCase();}
  function attr(el,name){for(var p=el;p&&p.tagName;p=p.parentElement){var v=p.style&&p.style.getPropertyValue(name);if(v)return v;v=p.getAttribute(name);if(v!==null)return v;}return null;}
  function rgb(c){
    c=norm(c);if(/^#[0-9a-f]{3}$/.test(c))c='#'+c.slice(1).split('').map(function(x){return x+x;}).join('');
    if(/^#[0-9a-f]{6}$/.test(c))return parseInt(c.slice(1),16);
    var m=c.match(/^rgba?\(([^)]+)\)$/);if(m){var a=m[1].split(/[ ,/]+/).slice(0,3).map(function(x){return x.indexOf('%')>=0?Math.round(parseFloat(x)*2.55):Math.round(Number(x));});if(a.length===3&&a.every(function(v){return isFinite(v)&&v>=0&&v<=255;}))return (a[0]<<16)+(a[1]<<8)+a[2];}
    var named={black:0,white:16777215,red:16711680,blue:255,green:32768,yellow:16776960,gray:8421504,grey:8421504};return named[c];
  }
  function matrix(el){var m=new DOMMatrix(),chain=[];for(var p=el;p&&p.tagName;p=p.parentElement)chain.unshift(p);chain.forEach(function(p){var v=p.getAttribute('transform');if(v){var list=p.transform&&p.transform.baseVal,tm=list&&list.consolidate();if(tm)m=m.multiply(tm.matrix);}});return m;}
  function styleFor(el,scale,m){
    var stroke=attr(el,'stroke'),color=rgb(stroke||attr(el,'fill')),sw=parseFloat(attr(el,'stroke-width'));
    var width=(isFinite(sw)&&sw>0?sw:1)*Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))/scale;
    var dash=attr(el,'stroke-dasharray'),type='BYLAYER';
    if(dash&&dash!=='none'){var a=dash.split(/[ ,]+/).map(Number).filter(function(v){return isFinite(v)&&v>=0;});if(a.length&&a.some(function(v){return v>0;})){if(a.length%2)a=a.concat(a);a=a.map(function(v,i){return (i%2?-1:1)*v/scale;});var key=a.map(f).join(',');type=Object.keys(lineTypes).find(function(k){return lineTypes[k].key===key;});if(!type){type='RY_DASH_'+(Object.keys(lineTypes).length+1);lineTypes[type]={key:key,pattern:a};}}}
    return {color:color,width:width,type:type};
  }
  function baseEntity(type,layer,sty){var o=['0',type,'5',handle(),'100','AcDbEntity','8',layer,'6',sty.type||'BYLAYER'];if(sty.color!==undefined)o.push('420',String(sty.color));return o;}
  // AutoCAD 2004 supports true RGB colors and lightweight editable PL entities.
  function entPoly(pts,layer,closed,sty){
    var o=baseEntity('LWPOLYLINE',layer,sty);o.push('100','AcDbPolyline','90',String(pts.length),'70',closed?'1':'0','43',f(sty.width));
    pts.forEach(function(p){o.push('10',f(p[0]),'20',f(p[1]));});return o.join('\n');
  }
  function entCircle(c,rad,layer,sty){return baseEntity('CIRCLE',layer,sty).concat(['100','AcDbCircle','10',f(c[0]),'20',f(c[1]),'30','0','40',f(rad)]).join('\n');}
  function escText(s){
    var o='';
    for(var i=0;i<s.length;i++){
      var c=s.charCodeAt(i);
      o += (c<128) ? s.charAt(i) : '\\U+'+('0000'+c.toString(16).toUpperCase()).slice(-4);
    }
    return o;
  }
  function entText(p,h,str,layer,sty){ return baseEntity('TEXT',layer,sty).concat(['100','AcDbText','10',f(p[0]),'20',f(p[1]),'30','0','40',f(h),'1',escText(str),'7','STANDARD','100','AcDbText']).join('\n'); }

  /* tlNorthGroup = 指北针（2026-10-20 加）：图框装饰，与图框/标题/图例同属「出图页眉页脚」，
     DXF 里没有对应实体（且北方位对 DXF 使用方无意义）⇒ 整组跳过。 */
  var SKIP_IDS = { tlFrameGroup:1, tlTitleGroup:1, tlHeaderGroup:1, tlCalcBookGroup:1, tlLegendGroup:1, tlNorthGroup:1 };
  /* 导出密码（2026-10-02 用户要求）：DXF 导出前须在对话框输入。前端口令门，防误用而非加密。 */
  var EXPORT_PWD = '230230';

  function canExportDrawing() {
    var ent = global.RyEntitle;
    if (!ent || typeof ent.can !== 'function') return false;
    if (typeof ent.ready === 'function' && !ent.ready()) return false;
    return ent.can('drawing-export');
  }
  function requireDrawingExport() {
    if (canExportDrawing()) return true;
    var ent = global.RyEntitle;
    if (ent && typeof ent.access === 'function' && ent.access('drawing-export') === 'pending') {
      var d = document.createElement('div');
      d.className = 'ry-nav-toast'; d.setAttribute('role', 'status');
      d.textContent = '正在同步会员权益，请稍后重试。';
      document.body.appendChild(d);
      setTimeout(function () { d.classList.add('show'); }, 10);
      setTimeout(function () { d.classList.remove('show'); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 300); }, 2400);
      return false;
    }
    var ui = global.RyMemberUI;
    if (ui && typeof ui.showUpgrade === 'function') ui.showUpgrade('CAD 图纸');
    else alert('CAD 图纸导出为高级会员功能，请先开通高级会员。');
    return false;
  }

  /* ===== 地图总管层（规格五「ZG_总管层」） =====
   *
   * 图纸 SVG 里**没有**这根线：施工图画的是由总管推出来的设计 frontPipe（被网格化/截取过），
   * 地图页那份真折线只住在 plot.trunk 里。所以这一层不走 SVG 遍历，而是
   * 「地块库拿经纬度 → 反算回图面米坐标 → 按 makeInv 同口径转 CAD」。
   *
   * ★ 为什么层名是 ASCII（规格书写的是「ZG_总管层」）：
   *   本导出器写 $ACADVER=AC1018(2004) + $DWGCODEPAGE=ANSI_1252，字符串按 1252 解码。
   *   文字实体可以靠 \U+XXXX 转义绕开（escText），**层名不行** —— 直接写 UTF-8 中文
   *   在 AutoCAD 里会变成一串乱码字母。要真中文层名必须把 $ACADVER 抬到 AC1021(2007+)
   *   整体改 UTF-8，那会动到所有既有图层与实体的编码，风险远大于收益。
   *   ⇒ 层名 ASCII（ZG_TRUNK，ZG 即"总管"），中文名只出现在对话框标签与文档里。
   *     要真中文层名，先把 $ACADVER 抬到 AC1021 全量改 UTF-8，再单独议。
   *
   * ★ 跨地块必须拒绝（与「宁可少吸一个点」同一条纪律）：
   *   tlDiagramData.poly 属于**当前这张施工图**，plot.trunk 属于**库里那块地**。
   *   两者不是同一块时（用户换了地块但没重新生成图 / 打开的是别的地的图），
   *   反算出来的总管会整体错位几百米，而且看上去"图上有根线"，最难发现。
   *   判据不用 id（库里没有 plotId 字段可比），用几何：autoSign 拿地块环当标尺，
   *   ±y 两个候选都算不出 <0.5m 就说明这张图压根不是从这块地长出来的 ⇒ 不导出。
   */
  var TRUNK_LAYER = 'ZG_TRUNK';
  var TRUNK_RGB = 0x1e3a8a;        // 深蓝（规格：总管粗深蓝）；图层色 5 = 蓝
  var TRUNK_WIDTH = 0.5;           // 图示宽度（米），不是管径 —— 与其它管线同一量级
  var NODE_SOURCE_R = 1.2;         // 水源进水口半径（米）
  var NODE_TEE_R = 0.8;            // 分水三通半径（米）
  var NODE_RGB = { source: 0x2563eb, tee: 0xf97316 };   // 与地图上的圆点同色

  function currentPlotRow() {
    var store = global.RyPlotLibraryStore;
    var pid = String(global.currentPlotId == null ? '' : global.currentPlotId);
    if (!store || typeof store.read !== 'function' || !pid) return null;
    var snap = null;
    try { snap = store.read(); } catch (e) { return null; }
    if (!snap || !snap.ok || !Array.isArray(snap.plots)) return null;
    for (var i = 0; i < snap.plots.length; i++) {
      var p = snap.plots[i];
      if (p && String(p.id) === pid) return p;
    }
    return null;
  }

  /* 本次能不能导总管：返回 {ok, reason, trunks, toCad}。
     ok=false 时 reason 是**给人看的一句话**（对话框直接显示，不弹窗打断）。 */
  function trunkPlan() {
    var out = { ok: false, reason: '', trunks: [], toCad: null };
    var G = global.RyTrunkGeo, S = global.RyTrunkSchema;
    if (!G || !S) { out.reason = '总管模块未加载'; return out; }
    var plot = currentPlotRow();
    if (!plot) { out.reason = '当前地块不在地块库里'; return out; }
    if (!S.hasUsableTrunk(plot)) {
      out.reason = (plot.merged || plot.grouped || plot.mergedInto)
        ? '成组/合并地块暂不支持导出总管'
        : '当前地块还没有地图总管';
      return out;
    }
    var t = S.normalize(plot.trunk);
    if (!t || !t.trunks.length) { out.reason = '总管数据无法识别'; return out; }
    if (t.coordinateSystem !== 'GCJ-02') { out.reason = '总管坐标系不是 GCJ-02'; return out; }
    var dd = global.tlDiagramData;
    if (!dd || dd.world !== 'meter' || !Array.isArray(dd.poly) || dd.poly.length < 3) {
      out.reason = '缺少图纸几何快照，请重新生成管线图'; return out;
    }
    var base = (plot.geo && typeof plot.geo === 'object') ? plot.geo : global.__runyeGeoBase;
    var cal = G.autoSign(dd.poly, plot.polyLatLng, base);
    if (!cal.ok) {
      out.reason = '这张施工图与当前地块对不上（不是同一块地），不导出总管';
      return out;
    }
    out.ok = true;
    out.trunks = t.trunks;
    out.toCad = function (pts) { return G.trunkToCad(pts, base, cal.sign); };
    return out;
  }

  /* 把总管写进 ents[]。geometry 全在 tp.toCad 里（纯函数、Node 单测覆盖），
     这里只负责"发几个实体"。 */
  function pushTrunkEntities(ents, tp, opts, scale) {
    tp.trunks.forEach(function (trunk) {
      var pts = tp.toCad(trunk.points);
      if (!pts || pts.length < 2) return;
      ents.push(entPoly(pts, TRUNK_LAYER, false, { color: TRUNK_RGB, width: TRUNK_WIDTH, type: 'BYLAYER' }));

      /* 干线编号（规格五⑤ params.code，缺省退回 id）：挂在中点，与图面文字同高 */
      if (opts.text) {
        var mid = pts[Math.floor((pts.length - 1) / 2)];
        var label = String((trunk.params && trunk.params.code) || trunk.id || '').trim();
        if (label) {
          var th = 12 / scale;
          ents.push(entText([mid[0], mid[1] + th * 1.4], th, label, 'TEXT', { color: TRUNK_RGB, type: 'BYLAYER' }));
        }
      }

      /* 水源 / 分水三通（规格四）：**是拐点属性，不是叠加物** —— 一个下标只有一个类型，
         所以这里按下标取点，同一点不会被画成两个圆。 */
      var nt = trunk.params && trunk.params.nodeTypes;
      if (opts.symbol && nt && typeof nt === 'object') {
        Object.keys(nt).forEach(function (k) {
          var idx = Number(k), pt = pts[idx], kind = nt[k];
          if (!pt || !isFinite(idx) || (kind !== 'source' && kind !== 'tee')) return;
          ents.push(entCircle(pt, kind === 'source' ? NODE_SOURCE_R : NODE_TEE_R, 'SYMBOL',
            { color: NODE_RGB[kind], type: 'BYLAYER' }));
        });
      }
    });
  }

  function tablesSection(){
    var o=['0','SECTION','2','TABLES'];
    function table(name,count){o.push('0','TABLE','2',name,'5',handle(),'100','AcDbSymbolTable','70',String(count));}
    function record(type,sub){o.push('0',type,'5',handle(),'100','AcDbSymbolTableRecord','100',sub);}
    table('LTYPE',3+Object.keys(lineTypes).length);
    ['BYBLOCK','BYLAYER','CONTINUOUS'].forEach(function(n){record('LTYPE','AcDbLinetypeTableRecord');o.push('2',n,'70','0','3',n,'72','65','73','0','40','0');});
    Object.keys(lineTypes).forEach(function(n){var a=lineTypes[n].pattern;record('LTYPE','AcDbLinetypeTableRecord');o.push('2',n,'70','0','3','Imported SVG dash','72','65','73',String(a.length),'40',f(a.reduce(function(s,v){return s+Math.abs(v);},0)));a.forEach(function(v){o.push('49',f(v),'74','0');});});o.push('0','ENDTAB');
    table('STYLE',1);record('STYLE','AcDbTextStyleTableRecord');o.push('2','STANDARD','70','0','40','0','41','1','50','0','71','0','42','2.5','3','txt','4','','0','ENDTAB');
    table('LAYER',LAYERS.length);
    /* 999 = 注释组码（读取方一律忽略）。层名只能是 ASCII —— 见文件头「为什么层名是 ASCII」，
       中文说明放注释里，不占层名字节。 */
    o.push('999','ZG_TRUNK = map trunk line (layer name kept ASCII: AC1018 DXF decodes names as ANSI_1252)');
    LAYERS.forEach(function(L){record('LAYER','AcDbLayerTableRecord');o.push('2',L.name,'70','0','62',String(L.color),'6','CONTINUOUS','370','-3');});o.push('0','ENDTAB','0','ENDSEC');return o.join('\n');
  }

  function buildDxf(opts){
    if (!requireDrawingExport()) return null;
    var svg = sourceSvg();
    if(!svg){ alert('未找到平面布置图。请先在三级页点「生成管线图」。'); return null; }
    var pv = window.tlPlanView;
    if(!pv){ alert('未找到图纸坐标基准，请先重新「生成管线图」。'); return null; }
    var inv = makeInv(pv);
    var scale = pv.s;
    if(!isFinite(scale)||scale<=0){alert('图纸比例无效，请重新生成管线图。');return null;}
    nextHandle=256;lineTypes={};var ents=[];
    svg.querySelectorAll('*').forEach(function(el){
      var p=el,inSkip=false;while(p&&p!==svg){var tn=p.tagName.toLowerCase();if(SKIP_IDS[p.id]||tn==='defs'||tn==='clippath'||tn==='marker'||tn==='symbol'||p.style.display==='none'||p.getAttribute('display')==='none'){inSkip=true;break;}p=p.parentElement;}if(inSkip)return;
      if(el.hasAttribute('data-tlpipe-ref')||el.hasAttribute('data-tlworst')||el.classList.contains('tl-worst-flow')||el.classList.contains('tl-demo-flow'))return;
      var tag=el.tagName.toLowerCase();if(!/^(path|polygon|polyline|line|rect|circle|text)$/.test(tag))return;
      var stroke=norm(attr(el,'stroke'));if(tag!=='text'&&(!stroke||stroke==='none'||stroke==='transparent'))return;
      var m=matrix(el),sty=styleFor(el,scale,m);
      function xy(x,y){return inv(m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f);}
      function poly(a,layer,closed){if(a.length>=2&&a.every(function(q){return q.every(Number.isFinite);}))ents.push(entPoly(a.map(function(q){return xy(q[0],q[1]);}),layer,closed,sty));}
      var pl=tlPipeLayer(el);
      if(tag==='path'||tag==='polygon'||tag==='polyline'||tag==='line'){
        if(pl&&!opts[optKey(pl)])return;
        if(!pl){if(tag==='line')return;if(!opts.plot)return;pl='PLOT';}
        if(tag==='path')parsePathD(el.getAttribute('d')||'').forEach(function(run){poly(run.pts,pl,run.closed);});
        else if(tag==='line')poly([[+el.getAttribute('x1'),+el.getAttribute('y1')],[+el.getAttribute('x2'),+el.getAttribute('y2')]],pl,false);
        else {var n=(el.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number),a=[];for(var i=0;i+1<n.length;i+=2)a.push([n[i],n[i+1]]);poly(a,pl,tag==='polygon');}
      }else if(tag==='rect'){
        if(!opts.zone||el.closest('[data-manpipe]'))return;
        var x=+(el.getAttribute('x')||0),y=+(el.getAttribute('y')||0),w=+el.getAttribute('width'),h=+el.getAttribute('height');if(w>0&&h>0)poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],'ZONE',true);
      }else if(tag==='circle'){
        if(!opts.symbol)return;var rad=+el.getAttribute('r');if(rad>0)ents.push(entCircle(xy(+(el.getAttribute('cx')||0),+(el.getAttribute('cy')||0)),rad*Math.sqrt(Math.abs(m.a*m.d-m.b*m.c))/scale,'SYMBOL',sty));
      }else if(tag==='text'){
        if(!opts.text)return;sty.color=rgb(attr(el,'fill'));var x=parseFloat(el.getAttribute('x')||0),y=parseFloat(el.getAttribute('y')||0),h=parseFloat(attr(el,'font-size'))||12;if(isFinite(x)&&isFinite(y))ents.push(entText(xy(x,y),h/scale,(el.textContent||'').trim(),'TEXT',sty));
      }
    });

    /* 地图总管（规格五）：图纸 SVG 里没有这根线，单独反算一段。
       勾了但条件不满足时**静默跳过** —— 对话框里已经写明原因并禁用了勾选框，
       这里再弹一次窗只会在下载前打断用户。 */
    if (opts.trunk) {
      var tp = trunkPlan();
      if (tp.ok) pushTrunkEntities(ents, tp, opts, scale);
    }

    if(!ents.length){ alert('按当前勾选没有可导出的内容。'); return null; }
    var head=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1018','9','$INSUNITS','70','6','9','$DWGCODEPAGE','3','ANSI_1252','0','ENDSEC'];
    /* 标准段序：HEADER → TABLES → ENTITIES → EOF（2026-10-02 修复：旧版 ENTITIES 排在 TABLES 前） */
    return head.join('\n')+'\n'
      + tablesSection()+'\n'
      + ['0','SECTION','2','ENTITIES'].concat(ents,['0','ENDSEC']).join('\n')+'\n'
      + '0\nEOF\n';
  }

  function doDownload(dxf){
    var blob=new Blob([dxf],{type:'application/dxf'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='润野灌溉_平面图_'+new Date().toISOString().slice(0,10)+'.dxf';
    document.body.appendChild(a); a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},100);
  }

  function showDialog(){
    if (!requireDrawingExport()) return;
    var old=document.getElementById('ryDxfDlg'); if(old) old.remove();
    var hasPlan=!!(window.tlDiagramSVG && window.tlDiagramSVG.indexOf('<svg')>=0);
    /* 总管能不能导，在**打开对话框时**就算一次并写清楚原因：
       让用户在勾之前就知道"这次没有"，而不是点了导出才发现少一层。 */
    var tp = hasPlan ? trunkPlan() : { ok: false, reason: '还没生成施工图', trunks: [], toCad: null };
    var box=document.createElement('div');
    box.id='ryDxfDlg';
    box.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:99999;display:flex;align-items:center;justify-content:center';
    box.innerHTML=
      '<div style="background:#fff;border-radius:10px;padding:18px 20px;width:340px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:inherit">'
      +'<div style="font-size:15px;font-weight:700;margin-bottom:12px">导出 CAD (DXF)</div>'
      +'<div style="font-size:12.5px;color:#64748b;margin-bottom:6px">导出密码：</div>'
      +'<input type="password" id="ryDxfPwd" autocomplete="off" placeholder="请输入导出密码" style="width:100%;box-sizing:border-box;padding:7px 9px;font-size:13.5px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:10px">'
      +'<div style="font-size:12.5px;color:#64748b;margin-bottom:6px">导出当前平面布置图：</div>'
      +'<div style="font-size:12.5px;color:#64748b;margin:12px 0 6px">导出内容：</div>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="plot" checked> 地块边界</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="zone" checked> 分区</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="front" checked> 总管</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="trunk"'
        +(tp.ok?' checked':' disabled')+'> 地图总管（'+TRUNK_LAYER+' 层）</label>'
      +'<div id="ryDxfTrunkHint" style="font-size:11px;line-height:1.5;margin:2px 0 8px 20px;color:'+(tp.ok?'#64748b':'#b45309')+'">'
        +(tp.ok ? ('共 '+tp.trunks.length+' 条干线，按当前地块经纬度反算到图面坐标；水源/三通圆点随「水泵/阀门符号」一起导')
                : ('不导出：'+tp.reason))
      +'</div>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="main" checked> 主管</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="branch" checked> 支管</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="tape" checked> 滴灌带</label>'
      +'<div style="font-size:11px;color:#64748b;margin:8px 0">管线、边界导出为 PL，保留颜色与图示宽度（不是管径）；单位为米。</div>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="symbol" checked> 水泵/阀门符号</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="text" checked> 文字/标注</label>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
      +'<button id="ryDxfCancel" style="padding:6px 16px;font-size:13px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">取消</button>'
      +'<button id="ryDxfOk" style="padding:6px 16px;font-size:13px;border:none;background:#16a34a;color:#fff;border-radius:6px;cursor:pointer">导出</button>'
      +'</div></div>';
    document.body.appendChild(box);
    box.querySelector('#ryDxfCancel').onclick=function(){box.remove();};
    box.onclick=function(e){ if(e.target===box) box.remove(); };
    function tryExport(){
      if(box.querySelector('#ryDxfPwd').value !== EXPORT_PWD){ alert('导出密码错误，请输入正确的导出密码。'); return; }
      var opts={};
      box.querySelectorAll('.ryDxfOpt').forEach(function(cb){ opts[cb.getAttribute('data-k')]=cb.checked; });
      var dxf=buildDxf(opts);
      if(dxf){ doDownload(dxf); box.remove(); }
    }
    box.querySelector('#ryDxfOk').onclick=tryExport;
    box.querySelector('#ryDxfPwd').addEventListener('keydown',function(e){ if(e.key==='Enter') tryExport(); });
  }

  global.runyeDxf = { export: showDialog, buildDxf: buildDxf };
  if (global.RyEntitle && typeof global.RyEntitle.bindControl === 'function') {
    global.RyEntitle.bindControl(document.getElementById('tlDxfExport'), 'drawing-export', 'CAD 图纸导出');
  }
})(window);
