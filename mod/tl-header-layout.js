/* 三级管线简图：左上角文字区域动态重排（按宽度自动换行） */
function tlRewrapHeader(maxW){
  var segs=window._tlHeaderSegs;
  if(!segs||!segs.length)return 0;
  var x0=window._tlHeaderX0||34;
  var y0=window._tlHeaderY0||70;
  var ctn=document.getElementById('tlDiagramContent');
  var g=ctn?ctn.querySelector('#tlHeaderGroup'):null;
  if(!g)return 0;
  var lines=[],cur='';
  for(var i=0;i<segs.length;i++){
    var trial=cur?cur+'  |  '+segs[i]:segs[i];
    if(cur&&tlMeasureText(trial)>maxW){lines.push(cur);cur=segs[i];}
    else{cur=trial;}
  }
  if(cur)lines.push(cur);
  if(lines.length>4){var rest=lines.slice(1).join('  |  ');lines=[lines[0],rest];}
  /* Remove old text elements */
  var oldTexts=g.querySelectorAll('.tl-hdr-text');
  oldTexts.forEach(function(t){t.remove();});
  /* Add new text elements (insert before bg rect so bg stays behind) */
  var bg=g.querySelector('#tlHeaderBg');
  for(var j=0;j<lines.length;j++){
    var t=document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x',x0);
    t.setAttribute('y',y0+j*18);
    t.setAttribute('text-anchor','start');
    t.setAttribute('font-size','12');
    t.setAttribute('font-weight','700');
    t.setAttribute('fill','#334155');
    t.setAttribute('class','tl-hdr-text');
    t.textContent=lines[j];
    g.insertBefore(t,bg);
  }
  /* Update bg rect */
  if(bg){
    bg.setAttribute('width',maxW+16);
    bg.setAttribute('height',lines.length*18+8);
  }
  /* Update handle position */
  var handle=g.querySelector('#tlHeaderHandle');
  if(handle){
    var hx=x0-8+maxW+16-8;
    var hy=y0-14+lines.length*18+8-8;
    handle.setAttribute('x',hx);
    handle.setAttribute('y',hy);
  }
  return lines.length;
}

/* 三级管线简图：左上角文字区域可拖动 + 宽度可调（参考系统图 zb-block 设计逻辑） */
function tlInitHeaderDrag(){
  var ctn=document.getElementById('tlDiagramContent');
  if(!ctn)return;
  var svgEl=ctn.querySelector('svg');
  if(!svgEl)return;
  var hdrG=svgEl.querySelector('#tlHeaderGroup');
  if(!hdrG)return;
  var handle=svgEl.querySelector('#tlHeaderHandle');
  if(!handle)return;
  /* Clean up old listeners */
  if(window._tlHdrMove)document.removeEventListener('mousemove',window._tlHdrMove);
  if(window._tlHdrUp)document.removeEventListener('mouseup',window._tlHdrUp);
  /* A3 frame bounds */
  var svgW=1190,svgH=900,frameX=8,frameY=8,frameW=svgW-16,frameH=svgH-16;
  /* Read saved state */
  var pos={x:0,y:0};
  var hdrW=window._tlHeaderDefW||960;
  try{
    var saved=JSON.parse(localStorage.getItem('tl-header-pos'));
    if(saved&&typeof saved.x==='number')pos=saved;
    var savedW=parseFloat(localStorage.getItem('tl-header-w'));
    if(savedW>0)hdrW=savedW;
  }catch(e){}
  function applyPos(){
    hdrG.setAttribute('transform','translate('+pos.x.toFixed(1)+','+pos.y.toFixed(1)+')');
  }
  function getScale(){
    var rect=svgEl.getBoundingClientRect();
    return rect.width>0?svgW/rect.width:1;
  }
  /* Initial apply: re-wrap to saved width then position */
  tlRewrapHeader(hdrW);
  applyPos();
  /* Dragging (mousedown on header group, excluding handle) */
  var dragStart=null;
  hdrG.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    if(e.target===handle||(e.target.closest&&e.target.closest('#tlHeaderHandle')))return;
    e.preventDefault();
    var scale=getScale();
    dragStart={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,scale:scale};
    document.body.style.userSelect='none';
  });
  /* Resize (mousedown on handle) */
  var resizeStart=null;
  handle.addEventListener('mousedown',function(e){
    if(e.button!==0)return;
    e.preventDefault();
    e.stopPropagation();
    var scale=getScale();
    resizeStart={x:e.clientX,y:e.clientY,ow:hdrW,scale:scale};
    document.body.style.userSelect='none';
  });
  /* Combined move handler */
  window._tlHdrMove=function(ev){
    if(dragStart){
      var s=dragStart.scale;
      pos.x=dragStart.ox+(ev.clientX-dragStart.x)*s;
      pos.y=dragStart.oy+(ev.clientY-dragStart.y)*s;
      /* Clamp within A3 frame (rough bounds) */
      pos.x=Math.max(-20,Math.min(frameW-100,pos.x));
      pos.y=Math.max(-50,Math.min(frameH-30,pos.y));
      applyPos();
    }
    if(resizeStart){
      var s2=resizeStart.scale;
      var dx=(ev.clientX-resizeStart.x)*s2;
      hdrW=Math.max(200,Math.min(svgW-60,resizeStart.ow+dx));
      tlRewrapHeader(hdrW);
    }
  };
  window._tlHdrUp=function(){
    if(dragStart){dragStart=null;document.body.style.userSelect='';}
    if(resizeStart){resizeStart=null;document.body.style.userSelect='';}
    localStorage.setItem('tl-header-pos',JSON.stringify(pos));
    localStorage.setItem('tl-header-w',hdrW.toString());
  };
  document.addEventListener('mousemove',window._tlHdrMove);
  document.addEventListener('mouseup',window._tlHdrUp);
  /* Double-click resets position + width */
  hdrG.addEventListener('dblclick',function(e){
    e.stopPropagation();
    e.preventDefault();
    pos={x:0,y:0};
    hdrW=window._tlHeaderDefW||960;
    tlRewrapHeader(hdrW);
    applyPos();
    localStorage.setItem('tl-header-pos',JSON.stringify(pos));
    localStorage.setItem('tl-header-w',hdrW.toString());
  });
}

