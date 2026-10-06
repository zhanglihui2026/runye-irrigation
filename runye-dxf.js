/* ============================================================================
   导出施工图为 CAD（DXF 2004，文本格式）
   ----------------------------------------------------------------------------
   平面图来源：window.tlDiagramSVG（App 自带的权威 SVG 字符串，导 PNG/打印同一份），
   从它解析，绝不碰 DOM 里的轴测图/系统图克隆，避免互相叠加。
   坐标反算：window.tlPlanView {s,ox,oy,minX,minY}。
   图层带颜色（AutoCAD 颜色号）：
     PLOT 地块边界(白) ZONE 分区(灰) PIPE_FRONT 总管(品红)
     PIPE_MAIN 主管(蓝) PIPE_BRANCH 支管(绿) SYMBOL 水泵阀门(红) TEXT 文字(黄)
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
    { name: 'SYMBOL',       color: 1  },
    { name: 'TEXT',         color: 2  }
  ];

  function norm(c){ return (c||'').trim().toLowerCase(); }
  /* 平面图/轴测图的管线一律带 data-tlpipe（或遮蔽分段 data-tlpipe-seg）。
     2026-10-02 修复：旧 pipeKind 按 stroke 颜色猜、非蓝绿一律兜底「总管」——
     平面图里 line 全是辅助线/尺寸标注线/斜短线，几百条被塞进 PIPE_FRONT 层铺满图纸四周，
     CAD 里看似「轴测图叠加在平面图上」。 */
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

  function sourceSvg(source){
    if(source === 'iso'){
      return document.querySelector('#tlIsoDiagramContent svg') ||
             (window.RyIsoDiagram && window.RyIsoDiagram.svgString ? parseSvgString(window.RyIsoDiagram.svgString) : null);
    }
    // 平面：优先权威字符串
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

  var SKIP_IDS = { tlFrameGroup:1, tlTitleGroup:1, tlHeaderGroup:1, tlCalcBookGroup:1, tlLegendGroup:1 };
  /* 导出密码（2026-10-02 用户要求）：DXF 导出前须在对话框输入。前端口令门，防误用而非加密。 */
  var EXPORT_PWD = '230230';

  function tablesSection(){
    var o=['0','SECTION','2','TABLES'];
    function table(name,count){o.push('0','TABLE','2',name,'5',handle(),'100','AcDbSymbolTable','70',String(count));}
    function record(type,sub){o.push('0',type,'5',handle(),'100','AcDbSymbolTableRecord','100',sub);}
    table('LTYPE',3+Object.keys(lineTypes).length);
    ['BYBLOCK','BYLAYER','CONTINUOUS'].forEach(function(n){record('LTYPE','AcDbLinetypeTableRecord');o.push('2',n,'70','0','3',n,'72','65','73','0','40','0');});
    Object.keys(lineTypes).forEach(function(n){var a=lineTypes[n].pattern;record('LTYPE','AcDbLinetypeTableRecord');o.push('2',n,'70','0','3','Imported SVG dash','72','65','73',String(a.length),'40',f(a.reduce(function(s,v){return s+Math.abs(v);},0)));a.forEach(function(v){o.push('49',f(v),'74','0');});});o.push('0','ENDTAB');
    table('STYLE',1);record('STYLE','AcDbTextStyleTableRecord');o.push('2','STANDARD','70','0','40','0','41','1','50','0','71','0','42','2.5','3','txt','4','','0','ENDTAB');
    table('LAYER',LAYERS.length);LAYERS.forEach(function(L){record('LAYER','AcDbLayerTableRecord');o.push('2',L.name,'70','0','62',String(L.color),'6','CONTINUOUS','370','-3');});o.push('0','ENDTAB','0','ENDSEC');return o.join('\n');
  }

  function buildDxf(source, opts){
    var svg = sourceSvg(source);
    if(!svg){ alert('未找到'+(source==='iso'?'轴测图':'平面布置图')+'。请先在三级页点「生成管线图」。'); return null; }
    var inv, scale;
    if(source === 'iso'){
      /* 轴测图为等轴测示意（不按比例、投影不可逆）：按 SVG 画布 1:1 导出并翻转 y，
         保持与屏幕一致的手性（2026-10-02 修复：旧版误用平面图视图参数反算，坐标完全错乱） */
      var vb=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(parseFloat);
      var sh=(vb.length===4 && isFinite(vb[3]) && vb[3]>0) ? vb[3] : 800;
      inv=function(sx,sy){ return [sx, sh-sy]; };
      scale=1;
    }else{
      var pv = window.tlPlanView;
      if(!pv){ alert('未找到图纸坐标基准，请先重新「生成管线图」。'); return null; }
      inv = makeInv(pv);
      scale = pv.s;
    }
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

    if(!ents.length){ alert('按当前勾选没有可导出的内容。'); return null; }
    var head=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1018','9','$INSUNITS','70',source==='iso'?'0':'6','9','$DWGCODEPAGE','3','ANSI_1252','0','ENDSEC'];
    /* 标准段序：HEADER → TABLES → ENTITIES → EOF（2026-10-02 修复：旧版 ENTITIES 排在 TABLES 前） */
    return head.join('\n')+'\n'
      + tablesSection()+'\n'
      + ['0','SECTION','2','ENTITIES'].concat(ents,['0','ENDSEC']).join('\n')+'\n'
      + '0\nEOF\n';
  }

  function doDownload(dxf, source){
    var blob=new Blob([dxf],{type:'application/dxf'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='润野灌溉_'+(source==='iso'?'轴测图':'平面图')+'_'+new Date().toISOString().slice(0,10)+'.dxf';
    document.body.appendChild(a); a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},100);
  }

  function showDialog(){
    var old=document.getElementById('ryDxfDlg'); if(old) old.remove();
    var hasPlan=!!(window.tlDiagramSVG && window.tlDiagramSVG.indexOf('<svg')>=0);
    var hasIso=!!document.querySelector('#tlIsoDiagramContent svg');
    var box=document.createElement('div');
    box.id='ryDxfDlg';
    box.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:99999;display:flex;align-items:center;justify-content:center';
    box.innerHTML=
      '<div style="background:#fff;border-radius:10px;padding:18px 20px;width:340px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-family:inherit">'
      +'<div style="font-size:15px;font-weight:700;margin-bottom:12px">导出 CAD (DXF)</div>'
      +'<div style="font-size:12.5px;color:#64748b;margin-bottom:6px">导出密码：</div>'
      +'<input type="password" id="ryDxfPwd" autocomplete="off" placeholder="请输入导出密码" style="width:100%;box-sizing:border-box;padding:7px 9px;font-size:13.5px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:10px">'
      +'<div style="font-size:12.5px;color:#64748b;margin-bottom:6px">导出哪张图：</div>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="radio" name="ryDxfSrc" value="plan" '+(hasPlan?'checked':'disabled')+'> 平面布置图</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="radio" name="ryDxfSrc" value="iso" '+(hasIso?'':'disabled')+'> 轴测图'+(hasIso?'':'（未生成）')+'</label>'
      +'<div style="font-size:12.5px;color:#64748b;margin:12px 0 6px">导出内容：</div>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="plot" checked> 地块边界</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="zone" checked> 分区</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="front" checked> 总管</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="main" checked> 主管</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="branch" checked> 支管</label>'
      +'<label style="display:block;font-size:13.5px;margin:3px 0"><input type="checkbox" class="ryDxfOpt" data-k="tape" checked> 滴灌带</label>'
      +'<div style="font-size:11px;color:#64748b;margin:8px 0">管线、边界导出为 PL，保留颜色与图示宽度（不是管径）；平面图单位为米。轴测图为示意图。</div>'
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
      var src=(box.querySelector('input[name=ryDxfSrc]:checked')||{}).value||'plan';
      var opts={};
      box.querySelectorAll('.ryDxfOpt').forEach(function(cb){ opts[cb.getAttribute('data-k')]=cb.checked; });
      var dxf=buildDxf(src,opts);
      if(dxf){ doDownload(dxf,src); box.remove(); }
    }
    box.querySelector('#ryDxfOk').onclick=tryExport;
    box.querySelector('#ryDxfPwd').addEventListener('keydown',function(e){ if(e.key==='Enter') tryExport(); });
  }

  global.runyeDxf = { export: showDialog, buildDxf: buildDxf };
})(window);
