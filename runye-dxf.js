/* ============================================================================
   导出施工图为 CAD（DXF R12，文本格式）
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
    if (!p) return null;
    if (p === 'front' || p.indexOf('front-') === 0) return 'PIPE_FRONT';
    if (p.indexOf('main') === 0) return 'PIPE_MAIN';
    if (p.indexOf('branch') === 0) return 'PIPE_BRANCH';
    return null;
  }
  function optKey(layer){ return layer==='PIPE_FRONT'?'front':(layer==='PIPE_MAIN'?'main':'branch'); }

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
  function parsePathD(d){
    var cmds=d.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g)||[];
    var pts=[],cx=0,cy=0;
    cmds.forEach(function(c){
      var t=c.trim(),op=t[0],nums=t.slice(1).trim().split(/[\s,]+/).map(parseFloat),i=0;
      while(i<nums.length){
        var x=nums[i],y=nums[i+1];
        if(op==='M'||op==='m'){ cx=(op==='m'?cx:0)+x; cy=(op==='m'?cy:0)+(y||0); pts.push([cx,cy]); i+=2; op=(op==='m'?'l':'L'); }
        else if(op==='L'||op==='l'){ cx=(op==='l'?cx:0)+x; cy=(op==='l'?cy:0)+y; pts.push([cx,cy]); i+=2; }
        else if(op==='H'||op==='h'){ cx=(op==='h'?cx:0)+x; pts.push([cx,cy]); i+=1; }
        else if(op==='V'||op==='v'){ cy=(op==='v'?cy:0)+x; pts.push([cx,cy]); i+=1; }
        else { break; }
      }
    });
    return pts;
  }
  function f(n){ return (Math.round(n*100)/100).toString(); }
  function entLine(a,b,layer){ return ['0','LINE','8',layer,'10',f(a[0]),'20',f(a[1]),'11',f(b[0]),'21',f(b[1])].join('\n'); }
  /* R12(AC1009) 没有 LWPOLYLINE（R13+ 实体）——多段线必须用 POLYLINE+VERTEX+SEQEND。
     （2026-10-02 修复：旧版全部多段线是 LWPOLYLINE，AutoCAD 按 R12 打开时地块/分区丢失或报无效实体） */
  function entPoly(pts,layer,closed){
    var o=['0','POLYLINE','8',layer,'66','1','70',closed?'1':'0'];
    pts.forEach(function(p){ o.push('0','VERTEX','8',layer,'10',f(p[0]),'20',f(p[1])); });
    o.push('0','SEQEND','8',layer);
    return o.join('\n');
  }
  function entCircle(c,rad,layer){ return ['0','CIRCLE','8',layer,'10',f(c[0]),'20',f(c[1]),'40',f(rad)].join('\n'); }
  /* R12 DXF 是纯 ASCII 格式：中文/Ø/· 等非 ASCII 字符用 \U+XXXX 转义
     （AutoCAD 2000+/中望/浩辰通用支持；2026-10-02 修复——旧版直接写 UTF-8 字节，
      CAD 按 ANSI 读取显示乱码，ezdxf 校验报 4 个解码错误） */
  function escText(s){
    var o='';
    for(var i=0;i<s.length;i++){
      var c=s.charCodeAt(i);
      o += (c<128) ? s.charAt(i) : '\\U+'+('0000'+c.toString(16).toUpperCase()).slice(-4);
    }
    return o;
  }
  function entText(p,h,str,layer){ return ['0','TEXT','8',layer,'10',f(p[0]),'20',f(p[1]),'40',f(h),'1',escText(str)].join('\n'); }

  var SKIP_IDS = { tlFrameGroup:1, tlTitleGroup:1, tlHeaderGroup:1, tlCalcBookGroup:1, tlLegendGroup:1 };
  /* 导出密码（2026-10-02 用户要求）：DXF 导出前须在对话框输入。前端口令门，防误用而非加密。 */
  var EXPORT_PWD = '230230';

  /* R12 最小表组：LTYPE(CONTINUOUS) + STYLE(STANDARD，TEXT 实体必需) + LAYER。
     （2026-10-02 修复：旧版只有 LAYER 表，且整个 TABLES 段排在 ENTITIES 之后） */
  function tablesSection(){
    var o=['0','SECTION','2','TABLES',
      '0','TABLE','2','LTYPE','70','1',
      '0','LTYPE','2','CONTINUOUS','70','0','3','Solid line','72','65','73','0','40','0.0',
      '0','ENDTAB',
      '0','TABLE','2','STYLE','70','1',
      '0','STYLE','2','STANDARD','70','0','40','0.0','41','1.0','50','0.0','71','0','42','2.5','3','txt','4','',
      '0','ENDTAB',
      '0','TABLE','2','LAYER','70',String(LAYERS.length)];
    LAYERS.forEach(function(L){
      o.push('0','LAYER','2',L.name,'70','0','62',String(L.color),'6','CONTINUOUS');
    });
    o.push('0','ENDTAB','0','ENDSEC');
    return o.join('\n');
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
    var ents = [];

    svg.querySelectorAll('*').forEach(function(el){
      var p=el.parentElement, inSkip=false;
      while(p && p!==svg){ if(p.id && SKIP_IDS[p.id]){ inSkip=true; break; } p=p.parentElement; }
      if(inSkip) return;
      var tag=el.tagName.toLowerCase();
      if(tag==='path'){
        if(el.getAttribute('data-tlworst')) return;          // 最不利路径高亮线，非实体管线
        var d=el.getAttribute('d'); if(!d) return;
        var pts=parsePathD(d).map(function(q){return inv(q[0],q[1]);});
        if(pts.length<2) return;
        var pl=tlPipeLayer(el);
        if(pl){                                              // 管线（含遮蔽分段）
          if(!opts[optKey(pl)]) return;
          ents.push(entPoly(pts,pl,/z\s*$/i.test(d.trim())));
          return;
        }
        if(!opts.plot) return;                               // 其余 path = 地块边界/手工管线
        if(norm(el.getAttribute('stroke'))==='none') return; // 只填充不描边的地块底纹，跳过
        ents.push(entPoly(pts,'PLOT',/z\s*$/i.test(d.trim())));
      } else if(tag==='line'){
        return;                                              // 平面图 line 全是辅助线/尺寸线/斜短线/图例线，一律不导
      } else if(tag==='rect'){
        if(!opts.zone) return;
        var x=parseFloat(el.getAttribute('x')),y=parseFloat(el.getAttribute('y'));
        var w=parseFloat(el.getAttribute('width')),h=parseFloat(el.getAttribute('height'));
        if(!isFinite(w)||w<=0||!isFinite(h)||h<=0) return;
        var r=[inv(x,y),inv(x+w,y),inv(x+w,y+h),inv(x,y+h)];
        ents.push(entPoly(r,'ZONE',true));
      } else if(tag==='circle'){
        if(!opts.symbol) return;
        var c=inv(parseFloat(el.getAttribute('cx')),parseFloat(el.getAttribute('cy')));
        ents.push(entCircle(c,parseFloat(el.getAttribute('r'))/scale,'SYMBOL'));
      } else if(tag==='text'){
        if(!opts.text) return;
        var s2=inv(parseFloat(el.getAttribute('x')),parseFloat(el.getAttribute('y')));
        var fs=parseFloat(el.getAttribute('font-size'))||12;
        ents.push(entText(s2,fs/scale,(el.textContent||'').trim(),'TEXT'));
      }
    });

    if(!ents.length){ alert('按当前勾选没有可导出的内容。'); return null; }
    var head=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1009','0','ENDSEC'];
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
