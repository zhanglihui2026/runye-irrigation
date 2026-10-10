
(function(){
  var price=0.65, hours=1200, years=8, priceF=0, priceM=0, priceB=0, curRows=null;
  function fmtWan(v){ return (v/10000).toFixed(1)+'万'; }
  function fmtK(v){ return (v/1000).toFixed(0)+'k'; }
  function loadAssum(){ try{ return JSON.parse(localStorage.getItem('runye_tlEconAssum')||'{}')||{}; }catch(e){ return {}; } }
  /* 假设持久化：与轴测图「管径经济性对比」共用 runye_tlEconAssum 键（电价/年运行小时/折旧年限/总·主·支管材单价 同处一个对象）。
     必须「读-改-写」，否则两页互相覆盖 → 丢字段。 */
  function saveAssum(patch){ var o=loadAssum(); for(var k in patch){ if(typeof patch[k]==='number'&&isFinite(patch[k])&&patch[k]>0)o[k]=patch[k]; else delete o[k]; } try{ localStorage.setItem('runye_tlEconAssum', JSON.stringify(o)); }catch(e){} }
  var s0=loadAssum();
  if(s0.price)price=s0.price; if(s0.hours)hours=s0.hours; if(s0.years)years=s0.years;
  if(s0.pf>0)priceF=s0.pf; if(s0.pm>0)priceM=s0.pm; if(s0.pb>0)priceB=s0.pb;
  document.getElementById('optPrice').value=price;
  document.getElementById('optHours').value=hours;
  document.getElementById('optYears').value=years;
  document.getElementById('optPriceF').value=priceF||'';
  document.getElementById('optPriceM').value=priceM||'';
  document.getElementById('optPriceB').value=priceB||'';
  /* 参数变化：先落盘（两页共用假设），再自动重算 */
  ['optPrice','optHours','optYears','optPriceF','optPriceM','optPriceB'].forEach(function(id){
    document.getElementById(id).addEventListener('change', function(){
      try{ saveAssum({ price:parseFloat(document.getElementById('optPrice').value)||0,
                       hours:parseFloat(document.getElementById('optHours').value)||0,
                       years:parseFloat(document.getElementById('optYears').value)||0,
                       pf:parseFloat(document.getElementById('optPriceF').value)||0,
                       pm:parseFloat(document.getElementById('optPriceM').value)||0,
                       pb:parseFloat(document.getElementById('optPriceB').value)||0 }); }catch(e){}
      try{ document.getElementById('btnPipeOpt').click(); }catch(e){}
    });
  });

  function drawSvg(c){
    var d=window.tlDiagramData; if(!d) return '<div style="color:#dc2626">无图面数据</div>';
    var xs=[], ys=[];
    function pushPts(arr){ (arr||[]).forEach(function(seg){ if(Array.isArray(seg)) seg.forEach(function(p){ if(p&&p.x!=null){xs.push(p.x);ys.push(p.y);} }); else if(seg&&seg.x!=null){xs.push(seg.x);ys.push(seg.y);} }); }
    pushPts(d.mainPipes); pushPts(d.branchPipes); pushPts(d.dripTapes); pushPts([d.frontPipe]); pushPts(d.poly);
    if(d.sourcePos){xs.push(d.sourcePos.x);ys.push(d.sourcePos.y);}
    if(!xs.length) return '<div style="color:#dc2626">图面无坐标</div>';
    var minX=Math.min.apply(null,xs), maxX=Math.max.apply(null,xs);
    var minY=Math.min.apply(null,ys), maxY=Math.max.apply(null,ys);
    var pad=20, W=520, H=400;
    var sc=Math.min((W-pad*2)/(maxX-minX||1),(H-pad*2)/(maxY-minY||1));
    var ox=pad+(W-pad*2-(maxX-minX)*sc)/2, oy=pad+(H-pad*2-(maxY-minY)*sc)/2;
    function tx(x){return ox+(x-minX)*sc;}
    function ty(y){return oy+(y-minY)*sc;}
    function ptsToStr(seg){ return seg.map(function(p){return tx(p.x).toFixed(1)+','+ty(p.y).toFixed(1);}).join(' '); }
    var s='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">';
    if(d.poly&&d.poly.length>=3){ s+='<polygon points="'+ptsToStr(d.poly)+'" fill="#f8fafc" fill-opacity="0.6" stroke="#000" stroke-width="1" stroke-dasharray="5,3"/>'; }
    (d.dripTapes||[]).forEach(function(seg){ s+='<polyline points="'+ptsToStr(seg)+'" stroke="#e2e8f0" stroke-width="0.8" fill="none"/>'; });
    (d.branchPipes||[]).forEach(function(seg){ s+='<polyline points="'+ptsToStr(seg)+'" stroke="#16a34a" stroke-width="1.6" fill="none"/>'; });
    (d.mainPipes||[]).forEach(function(seg){ s+='<polyline points="'+ptsToStr(seg)+'" stroke="#185FA5" stroke-width="3" fill="none"/>'; });
    if(d.frontPipe){
      s+='<polyline points="'+ptsToStr(d.frontPipe)+'" stroke="#111827" stroke-width="4.5" fill="none"/>';
      var fp=d.frontPipe, fmx=tx((fp[0].x+fp[1].x)/2), fmy=ty((fp[0].y+fp[1].y)/2);
      s+='<text x="'+fmx+'" y="'+(fmy-8)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#c2410c">总管 Ø'+c.f+'</text>';
    }
    if(d.sourcePos){ s+='<circle cx="'+tx(d.sourcePos.x)+'" cy="'+ty(d.sourcePos.y)+'" r="6" fill="#ef4444"/>'; s+='<text x="'+tx(d.sourcePos.x)+'" y="'+(ty(d.sourcePos.y)-10)+'" text-anchor="middle" font-size="10" fill="#991b1b">水源</text>'; }
    if(d.mainPipes&&d.mainPipes.length){ var m=d.mainPipes[0]; s+='<text x="'+tx((m[0].x+m[1].x)/2)+'" y="'+(ty((m[0].y+m[1].y)/2)-10)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#0C447C" stroke="#fff" stroke-width="3" paint-order="stroke">主管 Ø'+c.m+'</text>'; }
    if(d.branchPipes&&d.branchPipes.length){ var b=d.branchPipes[0]; s+='<text x="'+tx((b[0].x+b[1].x)/2)+'" y="'+(ty((b[0].y+b[1].y)/2)+14)+'" text-anchor="middle" font-size="9" fill="#166534" stroke="#fff" stroke-width="3" paint-order="stroke">支管 Ø'+c.b+'</text>'; }
    s+='</svg>';
    return s;
  }

  function renderRow(i){
    if(!curRows) return;
    var r=curRows[i];
    document.getElementById('optSvgBox').innerHTML=drawSvg(r.c);
    var vc=function(v){return v>2.0?'#dc2626':(v>1.6?'#d97706':'#166534')};
    document.getElementById('optSvgInfo').innerHTML='<div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px">当前选中</div>' +
      '<table style="width:100%;font-size:11px;border-collapse:collapse">' +
      '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:2px 0;color:#64748b">总管</td><td>Ø'+r.c.f+' <span style="color:'+vc(r.c.vF)+';font-weight:600">('+r.c.vF.toFixed(2)+' m/s)</span></td></tr>' +
      '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:2px 0;color:#64748b">主管</td><td>Ø'+r.c.m+' <span style="color:'+vc(r.c.vM)+';font-weight:600">('+r.c.vM.toFixed(2)+' m/s)</span></td></tr>' +
      '<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:2px 0;color:#64748b">支管</td><td>Ø'+r.c.b+' <span style="color:'+vc(r.c.vB)+';font-weight:600">('+r.c.vB.toFixed(2)+' m/s)</span></td></tr>' +
      '</table>' +
      '<div style="font-size:11px;line-height:1.9;color:#475569;margin-top:4px">' +
      '<div>扬程: '+r.c.head.toFixed(1)+' m · 功率: '+r.c.kw.toFixed(1)+' kW</div>' +
      '<div>水泵流量: '+r.combinedFlow.toFixed(1)+' m³/h</div>' +
      '<div>管材: '+Math.round(r.c.mat).toLocaleString()+' 元 · 年电费: '+Math.round(r.elec).toLocaleString()+' 元</div>' +
      '<div>年均: <b style="color:#15803d">'+Math.round(r.annual).toLocaleString()+' 元/年</b></div></div>';
  }

  /* 拖拽调左侧工具栏宽度 */
  (function(){
    var drag=document.getElementById('optSideDrag'), side=document.getElementById('optSidebar');
    if(!drag||!side) return;
    drag.addEventListener('mousedown', function(e){
      e.preventDefault();
      var sx=e.clientX, sw=side.offsetWidth;
      function mv(ev){
        var dw=ev.clientX-sx;
        side.style.flex='none';
        side.style.width=Math.max(120, Math.min(320, sw+dw))+'px';
      }
      function up(){
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
      }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  })();
  /* 进入页面自动分析(如果已有图面数据) */
  setTimeout(function(){ try{ if(window.tlDiagramData && window.tlEconPanel) document.getElementById('btnPipeOpt').click(); }catch(e){} }, 500);
  /* 2026-09-28 用户：管材单价框要有内容 —— 首次分析按当前设计管径从单价表预填（一次性，可改可清空）；
     预填在 build() 之前，保证本次结果与框内单价一致；清空后刷新不再预填（runye_econRolePrefill 标记）。 */
  function optPrefillRoles(){
    try{
      if(localStorage.getItem('runye_econRolePrefill')) return;
      if(typeof computeThreeLevel!=='function') return;
      var r0=computeThreeLevel(); if(!r0||!r0.frontPipe||!r0.frontPipe.od) return;
      var pd={}; try{ pd=JSON.parse(localStorage.getItem('runye_tlEconPrices')||'{}')||{}; }catch(e){}
      /* v184（P6）：默认单价表收敛为单一来源 TL_PIPE_PRICE_DEF（原此处另有第 3 份字面量副本） */
      var DEF=TL_PIPE_PRICE_DEF;
      function pOf(od){ var k=Math.round(od); var v=(typeof pd[k]==='number'&&pd[k]>0)?pd[k]:DEF[k]; return (v>0?v:0); }
      var f=pOf(r0.frontPipe.od), m=pOf(r0.mainPipe.od), b=pOf(r0.branchPipe.od);
      if(!(f>0&&m>0&&b>0)) return;
      priceF=f; priceM=m; priceB=b;
      document.getElementById('optPriceF').value=f;
      document.getElementById('optPriceM').value=m;
      document.getElementById('optPriceB').value=b;
      saveAssum({pf:f,pm:m,pb:b});
      try{ localStorage.setItem('runye_econRolePrefill','1'); }catch(e){}
    }catch(e){}
  }
  document.getElementById('btnPipeOpt').addEventListener('click', function(){
    var box=document.getElementById('pipeOptResult');
    optPrefillRoles();
    try{
      price=parseFloat(document.getElementById('optPrice').value)||0.65;
      hours=parseFloat(document.getElementById('optHours').value)||2000;
      years=parseFloat(document.getElementById('optYears').value)||15;
      var D=window.tlEconPanel.build();
      if(!D){ box.innerHTML='<div style="color:#dc2626">未找到图面数据。请先在三级管路编辑页「生成管线图」。</div>'; return; }
      var rows=D.combos.map(function(c){ var elec=c.kw*hours*price; return {c:c, elec:elec, annual:c.mat/years+elec, combinedFlow:D.combinedFlow}; });
      rows.sort(function(a,b){return a.annual-b.annual;});
      curRows=rows;
      var minRow=rows[0];
      var desRow=rows.filter(function(r){return r.c.f===D.dF&&r.c.m===D.dM&&r.c.b===D.dB;})[0];
      var html='';
      html+='<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px;margin-bottom:12px">';
      html+='<div style="font-weight:700;color:#15803d;font-size:13px">★ 推荐最优组合</div>';
      html+='<div style="margin-top:4px">总管 Ø'+minRow.c.f+' · 主管 Ø'+minRow.c.m+' · 支管 Ø'+minRow.c.b+'</div>';
      html+='<div style="font-size:11.5px;color:#475569;margin-top:2px">扬程 '+minRow.c.head.toFixed(1)+' m · 功率 '+minRow.c.kw.toFixed(1)+' kW · 管材 '+Math.round(minRow.c.mat)+' 元 · 年电费 '+Math.round(minRow.elec)+' 元 · <b>年均总 '+Math.round(minRow.annual)+' 元/年</b></div>';
      if(desRow){ var save=desRow.annual-minRow.annual; html+='<div style="font-size:11.5px;color:#475569;margin-top:2px">对比当前设计(Ø'+D.dF+'/'+D.dM+'/'+D.dB+')：年均省 '+Math.round(save)+' 元/年('+(save/desRow.annual*100).toFixed(1)+'%)</div>'; }
      html+='<button id="btnApplyCombo" type="button" style="margin-top:8px;padding:6px 16px;background:#15803d;color:#fff;border:0;border-radius:5px;font-size:12px;cursor:pointer">✅ 应用此组合（全图管径切换并重算）</button>';
      html+='</div>';
      html+='<div style="display:flex;gap:16px;align-items:flex-start">';
      html+='<div id="optTableWrap" style="flex:1.3;min-width:340px;max-height:72vh;overflow-y:auto">';
      html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
      html+='<thead><tr style="background:#f1f5f9;position:sticky;top:0"><th style="padding:5px 16px 5px 4px;text-align:left">组合 总/主/支</th><th style="padding-left:20px">管材</th><th>扬程 m</th><th>功率 kW</th><th>总管流速</th><th>年电费</th><th>年均/年</th></tr></thead><tbody>';
      rows.forEach(function(r,i){
        var isMin=i===0, isDes=desRow&&r.c.f===D.dF&&r.c.m===D.dM&&r.c.b===D.dB;
        var bg=isMin?'background:#dcfce7':(isDes?'background:#fef3c7':'');
        html+='<tr data-row="'+i+'" style="border-bottom:1px solid #e2e8f0;'+bg+';cursor:pointer">';
        html+='<td style="padding:4px 6px 4px 4px;white-space:nowrap">'+(isMin?'★ ':'')+'Ø'+r.c.f+'/Ø'+r.c.m+'/Ø'+r.c.b+(isDes?' <span style="color:#92400e">(当前)':'')+'</td>';
        html+='<td style="text-align:center;padding-left:4px">'+fmtWan(r.c.mat)+'</td>';
        html+='<td style="text-align:center">'+r.c.head.toFixed(1)+'</td>';
        html+='<td style="text-align:center">'+r.c.kw.toFixed(1)+'</td>';
        var vF=r.c.vF, vColor=vF>2.0?'#dc2626':(vF>1.6?'#d97706':'#166534');
        html+='<td style="text-align:center;color:'+vColor+';font-weight:'+(vF>2.0?'700':'400')+'">'+vF.toFixed(2)+'</td>';
        html+='<td style="text-align:center">'+fmtK(r.elec)+'</td>';
        html+='<td style="text-align:center;font-weight:700">'+fmtK(r.annual)+'</td>';
        html+='</tr>';
      });
      html+='</tbody></table>';
      html+='</div>';
      html+='<div id="optDrag" style="width:1px;cursor:col-resize;background:#94a3b8;flex-shrink:0;margin:0 4px;align-self:stretch" title="拖拽调表格宽度"></div>';
      html+='<div id="optSvgWrap" style="flex:1.7;min-width:380px;position:sticky;top:0">';
      html+='<div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:6px">管平面布置（点左侧表格行切换管径）</div>';
      html+='<div id="optSvgBox" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">'+drawSvg(minRow.c)+'</div>';
      html+='</div>';
      html+='</div>';
      box.innerHTML=html;
      /* 拖拽调表格宽度 */
      var drag=document.getElementById('optDrag'), tw=document.getElementById('optTableWrap');
      if(drag&&tw){
        drag.addEventListener('mousedown', function(e){
          e.preventDefault();
          var startX=e.clientX, startW=tw.offsetWidth;
          function onMove(ev){
            var dw=ev.clientX-startX;
            tw.style.flex='none';
            tw.style.width=Math.max(280, Math.min(600, startW+dw))+'px';
          }
          function onUp(){
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      }
      document.getElementById('btnApplyCombo').addEventListener('click', function(){
        var r=rows[0];
        window.tlManualCals={front:r.c.f, main:r.c.m, branch:r.c.b};
        if(typeof tlBuildPipeOverride==='function') tlBuildPipeOverride();
        if(typeof tlUpdatePlanBar==='function') tlUpdatePlanBar();
        if(typeof window.tlSyncIsoMeta==='function') window.tlSyncIsoMeta();
        alert('已应用 总管Ø'+r.c.f+' · 主管Ø'+r.c.m+' · 支管Ø'+r.c.b+'\n扬程/功率/材料清单已按此管径重算。');
      });
      box.querySelectorAll('tr[data-row]').forEach(function(tr){
        tr.addEventListener('click', function(){
          box.querySelectorAll('tr').forEach(function(t){t.style.outline='';});
          tr.style.outline='2px solid #2563eb';
          renderRow(parseInt(tr.getAttribute('data-row')));
        });
      });
      renderRow(0);
    }catch(e){ box.innerHTML='<div style="color:#dc2626">分析失败:'+esc(e.message)+'</div>'; }
  });
})();
