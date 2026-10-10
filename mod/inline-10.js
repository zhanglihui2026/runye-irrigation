
;(function(){
'use strict';

const atState = {
  image:null, imgScale:1, mode:'none',
  zoom:1, panX:0, panY:0,
  calibPoints:[], realDistance:0, realUnit:'m', metersPerPixel:null,
  polygon:[], polygonClosed:false,
  pickTolerance:40,
  gridSpacing:10, gridVisible:false, showGridLines:false,
  gridResult:{inside:0,total:0},
  mouseX:0, mouseY:0, isDragging:false, dragStartX:0, dragStartY:0,
  dragVertexIndex:-1, hoverVertexIndex:-1,
};

const atCanvas = document.getElementById('atCanvas');
const atCtx = atCanvas.getContext('2d');
const atCanvasWrap = document.getElementById('atCanvasWrap');

function atScreenToImage(sx,sy){return{x:(sx-atState.panX)/(atState.imgScale*atState.zoom),y:(sy-atState.panY)/(atState.imgScale*atState.zoom)};}
function atImageToScreen(ix,iy){return{x:ix*atState.imgScale*atState.zoom+atState.panX,y:iy*atState.imgScale*atState.zoom+atState.panY};}

function atResizeCanvas(){
  atCanvas.width=atCanvasWrap.clientWidth;
  atCanvas.height=atCanvasWrap.clientHeight;
  if(atState.image) atFitImage();
  atRender();
}
function atFitImage(){
  if(!atState.image)return;
  const s=Math.min(atCanvas.width/atState.image.width,atCanvas.height/atState.image.height)*0.9;
  atState.imgScale=s; atState.zoom=1;
  atState.panX=(atCanvas.width-atState.image.width*s)/2;
  atState.panY=(atCanvas.height-atState.image.height*s)/2;
}

function atRender(){
  atCtx.clearRect(0,0,atCanvas.width,atCanvas.height);
  atCtx.fillStyle='#2a2a2a';
  atCtx.fillRect(0,0,atCanvas.width,atCanvas.height);
  if(!atState.image)return;
  const s=atState.imgScale*atState.zoom;
  atCtx.drawImage(atState.image,atState.panX,atState.panY,atState.image.width*s,atState.image.height*s);
  if(atState.showGridLines) atDrawGridLines();
  if(atState.polygonClosed&&atState.polygon.length>=3) atDrawGridPoints();
  atDrawPolygon();
  atDrawCalibration();
  if(atState.mode==='draw'&&atState.polygon.length>0&&!atState.polygonClosed) atDrawMouseGuide();
}

function atDrawGridLines(){
  if(!atState.image)return;
  const s=atState.imgScale*atState.zoom;
  const w=atState.image.width*s, h=atState.image.height*s;
  const sp=atState.gridSpacing*s;
  atCtx.strokeStyle='rgba(255,255,255,0.08)'; atCtx.lineWidth=1;
  for(let x=atState.panX;x<=atState.panX+w;x+=sp){atCtx.beginPath();atCtx.moveTo(x,atState.panY);atCtx.lineTo(x,atState.panY+h);atCtx.stroke();}
  for(let y=atState.panY;y<=atState.panY+h;y+=sp){atCtx.beginPath();atCtx.moveTo(atState.panX,y);atCtx.lineTo(atState.panX+w,y);atCtx.stroke();}
}

function atDrawGridPoints(){
  if(atState.polygon.length<3)return;
  const s=atState.imgScale*atState.zoom;
  const sp=atState.gridSpacing;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of atState.polygon){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  const sx=Math.ceil(minX/sp)*sp, sy=Math.ceil(minY/sp)*sp;
  let inside=0,total=0;
  const r=Math.max(1.5,sp*s*0.15);
  for(let y=sy;y<=maxY;y+=sp){
    for(let x=sx;x<=maxX;x+=sp){
      total++;
      if(atPointInPolygon({x,y},atState.polygon)){
        inside++;
        if(atState.gridVisible){const sp2=atImageToScreen(x,y);atCtx.fillStyle='rgba(76,175,80,0.85)';atCtx.beginPath();atCtx.arc(sp2.x,sp2.y,r,0,Math.PI*2);atCtx.fill();}
      }else{
        if(atState.gridVisible){const sp2=atImageToScreen(x,y);atCtx.fillStyle='rgba(255,255,255,0.15)';atCtx.beginPath();atCtx.arc(sp2.x,sp2.y,r*0.6,0,Math.PI*2);atCtx.fill();}
      }
    }
  }
  atState.gridResult={inside,total};
}

function atDrawPolygon(){
  if(atState.polygon.length===0)return;
  const pts=atState.polygon.map(p=>atImageToScreen(p.x,p.y));
  if(atState.polygonClosed){
    atCtx.fillStyle='rgba(22,101,52,0.15)';
    atCtx.beginPath();atCtx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++)atCtx.lineTo(pts[i].x,pts[i].y);
    atCtx.closePath();atCtx.fill();
  }
  atCtx.strokeStyle=atState.polygonClosed?'var(--g-700)':'#7986cb';
  atCtx.strokeStyle=atState.polygonClosed?'#15803d':'#7986cb';
  atCtx.lineWidth=2;atCtx.lineJoin='round';
  atCtx.beginPath();atCtx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++)atCtx.lineTo(pts[i].x,pts[i].y);
  if(atState.polygonClosed)atCtx.closePath();
  atCtx.stroke();
  for(let i=0;i<pts.length;i++){
    const isHover=i===atState.hoverVertexIndex;
    const rr=isHover?7:5;
    atCtx.fillStyle='#fff';atCtx.beginPath();atCtx.arc(pts[i].x,pts[i].y,rr+2,0,Math.PI*2);atCtx.fill();
    atCtx.fillStyle=isHover?'#e53935':'#15803d';atCtx.beginPath();atCtx.arc(pts[i].x,pts[i].y,rr,0,Math.PI*2);atCtx.fill();
    if(atState.zoom*atState.imgScale>0.3){
      atCtx.fillStyle='#fff';atCtx.font='10px Microsoft YaHei';atCtx.textAlign='center';atCtx.textBaseline='middle';
      atCtx.fillText(String(i+1),pts[i].x,pts[i].y);
    }
  }
}

function atDrawCalibration(){
  if(atState.calibPoints.length===0)return;
  const pts=atState.calibPoints.map(p=>atImageToScreen(p.x,p.y));
  atCtx.strokeStyle='#ff9800';atCtx.lineWidth=3;atCtx.setLineDash([8,4]);
  atCtx.beginPath();
  if(pts.length>=1)atCtx.moveTo(pts[0].x,pts[0].y);
  if(pts.length>=2)atCtx.lineTo(pts[1].x,pts[1].y);
  atCtx.stroke();atCtx.setLineDash([]);
  for(const p of pts){
    atCtx.fillStyle='#fff';atCtx.beginPath();atCtx.arc(p.x,p.y,8,0,Math.PI*2);atCtx.fill();
    atCtx.fillStyle='#ff9800';atCtx.beginPath();atCtx.arc(p.x,p.y,6,0,Math.PI*2);atCtx.fill();
  }
  if(pts.length===2&&atState.metersPerPixel){
    const mx=(pts[0].x+pts[1].x)/2, my=(pts[0].y+pts[1].y)/2;
    const dx=pts[1].x-pts[0].x, dy=pts[1].y-pts[0].y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const realDist=dist/(atState.imgScale*atState.zoom)*atState.metersPerPixel;
    const label=realDist.toFixed(2)+' '+atState.realUnit;
    atCtx.font='bold 13px Microsoft YaHei';
    const tw=atCtx.measureText(label).width;
    atCtx.fillStyle='rgba(255,152,0,0.9)';
    atCtx.beginPath();atCtx.roundRect(mx-tw/2-8,my-22,tw+16,20,4);atCtx.fill();
    atCtx.fillStyle='#fff';atCtx.textAlign='center';atCtx.textBaseline='middle';
    atCtx.fillText(label,mx,my-12);
  }
}

function atDrawMouseGuide(){
  const last=atState.polygon[atState.polygon.length-1];
  const ls=atImageToScreen(last.x,last.y);
  atCtx.strokeStyle='rgba(121,134,203,0.5)';atCtx.lineWidth=1.5;atCtx.setLineDash([5,5]);
  atCtx.beginPath();atCtx.moveTo(ls.x,ls.y);atCtx.lineTo(atState.mouseX,atState.mouseY);atCtx.stroke();
  atCtx.setLineDash([]);
  if(atState.polygon.length>=3){
    const first=atState.polygon[0];
    const fs=atImageToScreen(first.x,first.y);
    const dx=atState.mouseX-fs.x, dy=atState.mouseY-fs.y;
    if(Math.sqrt(dx*dx+dy*dy)<15){
      atCtx.strokeStyle='#4caf50';atCtx.lineWidth=3;
      atCtx.beginPath();atCtx.arc(fs.x,fs.y,12,0,Math.PI*2);atCtx.stroke();
    }
  }
}

function atPointInPolygon(point,polygon){
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const xi=polygon[i].x,yi=polygon[i].y,xj=polygon[j].x,yj=polygon[j].y;
    if(((yi>point.y)!==(yj>point.y))&&(point.x<(xj-xi)*(point.y-yi)/(yj-yi)+xi))inside=!inside;
  }
  return inside;
}

function atCalculateArea(){
  const gc=document.getElementById('atGridCount'),ga=document.getElementById('atGridArea'),
        ht=document.getElementById('atResultHint');
  if(!atState.metersPerPixel){gc.textContent='— / —';ga.textContent='— m²';ht.textContent='⚠️ 请先标定比例尺';return;}
  if(atState.polygon.length<3||!atState.polygonClosed){gc.textContent='— / —';ga.textContent='— m²';ht.textContent='⚠️ 请描绘并闭合边界';return;}
  const mpp=atState.metersPerPixel;
  const pixelArea=polyAreaM2(atState.polygon);
  const shoelaceVal=pixelArea*mpp*mpp;
  gc.textContent=atState.polygon.length+' 个';
  ga.textContent=atFormatArea(shoelaceVal,atState.realUnit);
  let hints=[];
  hints.push('面积算法: 鞋带公式（多边形顶点法）');
  if(atState.realUnit==='m'){
    hints.push('≈ '+(shoelaceVal/666.67).toFixed(2)+' 亩');
    if(shoelaceVal>10000)hints.push('≈ '+(shoelaceVal/10000).toFixed(2)+' 公顷');
  }
  ht.innerHTML=hints.join('<br>');
  // expose measured area for plan section (shoelace)
  window.measuredArea = (atState.realUnit==='m') ? shoelaceVal : 0;
  window.measuredPolygon = atState.polygon.map(function(p){return{x:p.x*mpp,y:p.y*mpp};});
  window.__runyeMapFramePoly = null;   /* [map-enhance 2026-09-29] 图片测量 ≠ 地图口径：清掉基准，避免混坐标系 */
  window.measuredPolygonSource='area';
  window.__runyeGeoBase=null;
  window.currentPlotId=null;
  /* v161：图片测量已切换地块口径 → 清跨页恢复锚点（避免下次加载把地图地块恢复回来） */
  try{ if(window.runyeSetCurrentPlot) window.runyeSetCurrentPlot(null); }catch(e){}
  if(typeof updatePlan==='function') updatePlan();
  if(typeof window.ppLoadPolygon==='function') window.ppLoadPolygon();
}

function atFormatArea(val,unit){
  if(unit==='m'){
    var mu=val/666.67;
    if(val>=10000)return (val/10000).toFixed(2)+' 公顷 · '+mu.toFixed(2)+' 亩 ('+val.toFixed(1)+' m²)';
    return mu.toFixed(2)+' 亩 ('+val.toFixed(1)+' m²)';
  }
  if(unit==='cm')return val.toFixed(2)+' cm²';
  if(unit==='mm')return val.toFixed(2)+' mm²';
  return val.toFixed(6)+' km²';
}

function atSetMode(mode){
  atState.mode=mode;
  document.getElementById('atBtnCalibrate').classList.toggle('active',mode==='calibrate');
  document.getElementById('atBtnDraw').classList.toggle('active',mode==='draw');
  document.getElementById('atBtnPickLine').classList.toggle('active',mode==='pickline');
  const badge=document.getElementById('atModeBadge'),hint=document.getElementById('atStatusHint');
  atCanvasWrap.classList.remove('calibrate','draw','pickline');
  // 底部状态栏（#atModeBadge / #atStatusHint）已按要求取消 → 空值守卫，恢复该栏即自动生效
  if(badge&&hint){
    if(mode==='calibrate'){badge.className='mode-badge calibrate';badge.textContent='比例尺模式';hint.textContent='点击图片上两个已知距离的点，然后输入实际距离';}
    else if(mode==='pickline'){badge.className='mode-badge draw';badge.textContent='拾取框线';hint.textContent='点击图片中的框线颜色，自动识别同色连通路径并生成边界';}
    else if(mode==='draw'){badge.className='mode-badge draw';badge.textContent='描绘模式';hint.textContent='点击添加边界顶点，双击或点击起点闭合多边形';}
    else{badge.className='mode-badge none';badge.textContent='浏览模式';hint.textContent='滚轮缩放，按住空格+拖拽平移，或选择上方工具开始操作';}
  }
  if(mode==='calibrate')atCanvasWrap.classList.add('calibrate');
  else if(mode==='pickline')atCanvasWrap.classList.add('pickline');
  else if(mode==='draw')atCanvasWrap.classList.add('draw');
  atRender();
}

function atLoadImage(file){
  const reader=new FileReader();
  reader.onload=function(e){
    const img=new Image();
    img.onload=function(){
      atState.image=img;
      atState.polygon=[];atState.polygonClosed=false;
      atState.calibPoints=[];atState.metersPerPixel=null;
      document.getElementById('atScaleInfo').style.display='none';
      document.getElementById('atEmptyState').style.display='none';
      atFitImage();atRender();atCalculateArea();
      atShowToast('图片加载成功');
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

function atGetMousePos(e){
  const rect=atCanvas.getBoundingClientRect();
  return{x:e.clientX-rect.left,y:e.clientY-rect.top};
}

function atFindVertexAt(sx,sy){
  for(let i=0;i<atState.polygon.length;i++){
    const sp=atImageToScreen(atState.polygon[i].x,atState.polygon[i].y);
    if(Math.sqrt((sx-sp.x)**2+(sy-sp.y)**2)<10)return i;
  }
  return -1;
}

function atColorDistanceSq(a,b){
  const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2];
  return dr*dr+dg*dg+db*db;
}

function atExtractColorBoundary(seed){
  if(!atState.image)return false;
  const w=atState.image.width,h=atState.image.height;
  const sx=Math.round(seed.x),sy=Math.round(seed.y);
  if(sx<0||sy<0||sx>=w||sy>=h)return false;
  const off=document.createElement('canvas');
  off.width=w;off.height=h;
  const octx=off.getContext('2d',{willReadFrequently:true});
  octx.drawImage(atState.image,0,0);
  const img=octx.getImageData(0,0,w,h);
  const data=img.data;
  const idx=(sy*w+sx)*4;
  const target=[data[idx],data[idx+1],data[idx+2]];
  const tol=atState.pickTolerance;
  const tolSq=tol*tol;
  const matchPixel=function(x,y){
    const k=(y*w+x)*4;
    if(data[k+3]<20)return false;
    return atColorDistanceSq(target,[data[k],data[k+1],data[k+2]])<=tolSq;
  };
  const qx=[],qy=[];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      if(!matchPixel(x,y))continue;
      qx.push(x);qy.push(y);
    }
  }
  if(qx.length<12){atShowToast('未识别到同色框线，请点在线条上或调大容差');return false;}
  if(qx.length>w*h*0.42){atShowToast('拾取区域过大，请调小容差后再试');return false;}

  const mask=new Uint8Array(w*h);
  for(let i=0;i<qx.length;i++)mask[qy[i]*w+qx[i]]=1;
  const edge=[];
  for(let i=0;i<qx.length;i++){
    const x=qx[i],y=qy[i];
    if(x===0||y===0||x===w-1||y===h-1||!mask[y*w+x-1]||!mask[y*w+x+1]||!mask[(y-1)*w+x]||!mask[(y+1)*w+x]){
      edge.push({x,y});
    }
  }
  if(edge.length<8){atShowToast('框线边界太少，请调大容差后再试');return false;}

  const cx=edge.reduce((s,p)=>s+p.x,0)/edge.length;
  const cy=edge.reduce((s,p)=>s+p.y,0)/edge.length;
  edge.sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));

  const targetPoints=Math.max(18,Math.min(80,Math.round(edge.length/28)));
  const sampled=[];
  for(let i=0;i<targetPoints;i++){
    const start=Math.floor(i*edge.length/targetPoints);
    const end=Math.max(start+1,Math.floor((i+1)*edge.length/targetPoints));
    let ax=0,ay=0,n=0;
    for(let j=start;j<end;j++){ax+=edge[j].x;ay+=edge[j].y;n++;}
    sampled.push({x:ax/n,y:ay/n});
  }

  const simplified=[];
  for(let i=0;i<sampled.length;i++){
    const prev=sampled[(i-1+sampled.length)%sampled.length];
    const cur=sampled[i];
    if(!simplified.length||Math.hypot(cur.x-prev.x,cur.y-prev.y)>3)simplified.push(cur);
  }
  if(simplified.length<3){atShowToast('自动边界点不足，请调大容差后再试');return false;}
  atState.polygon=simplified;
  atState.polygonClosed=true;
  atSetMode('none');
  atRender();
  atCalculateArea();
  atShowToast('已自动拾取框线，可拖动节点微调');
  return true;
}

let atSpacePressed=false;

atCanvas.addEventListener('mousedown',function(e){
  const pos=atGetMousePos(e);
  atState.mouseX=pos.x;atState.mouseY=pos.y;
  if(e.button===1||(atSpacePressed&&e.button===0)){
    atState.isDragging=true;atState.dragStartX=pos.x-atState.panX;atState.dragStartY=pos.y-atState.panY;
    atCanvasWrap.classList.add('dragging');e.preventDefault();return;
  }
  if(e.button===2){
    if(atState.mode==='draw'&&atState.polygon.length>0){
      if(atState.polygonClosed)atState.polygonClosed=false;
      else atState.polygon.pop();
      atRender();atCalculateArea();
    }
    e.preventDefault();return;
  }
  if(e.button!==0)return;
  const imgPos=atScreenToImage(pos.x,pos.y);
  if(atState.mode==='calibrate'){
    if(atState.calibPoints.length<2)atState.calibPoints.push(imgPos);
    else atState.calibPoints=[imgPos];
    atRender();
    if(atState.calibPoints.length===2)atShowToast('已选取两个点，请输入实际距离并确认');
  }else if(atState.mode==='pickline'){
    atExtractColorBoundary(imgPos);
  }else if(atState.mode==='draw'){
    const vi=atFindVertexAt(pos.x,pos.y);
    if(vi>=0){
      if(vi===0&&atState.polygon.length>=3&&!atState.polygonClosed){
        atState.polygonClosed=true;atSetMode('none');atRender();atCalculateArea();atShowToast('多边形已闭合');
      }else{atState.dragVertexIndex=vi;}
      return;
    }
    if(atState.polygonClosed)return;
    if(atState.polygon.length>=3){
      const first=atState.polygon[0];
      const fs=atImageToScreen(first.x,first.y);
      if(Math.sqrt((pos.x-fs.x)**2+(pos.y-fs.y)**2)<15){
        atState.polygonClosed=true;atSetMode('none');atRender();atCalculateArea();atShowToast('多边形已闭合');
        return;
      }
    }
    atState.polygon.push(imgPos);atRender();atCalculateArea();
  }
});

atCanvas.addEventListener('mousemove',function(e){
  const pos=atGetMousePos(e);
  atState.mouseX=pos.x;atState.mouseY=pos.y;
  if(atState.image){
    const imgPos=atScreenToImage(pos.x,pos.y);
    let ct='X: '+imgPos.x.toFixed(1)+', Y: '+imgPos.y.toFixed(1);
    if(atState.metersPerPixel)ct+=' ('+(imgPos.x*atState.metersPerPixel).toFixed(2)+atState.realUnit+', '+(imgPos.y*atState.metersPerPixel).toFixed(2)+atState.realUnit+')';
    // 状态栏已取消 → 空值守卫（元素不存在时静默跳过）
    const atCoordEl=document.getElementById('atCoordDisplay');
    if(atCoordEl)atCoordEl.textContent=ct;
  }
  if(atState.isDragging){atState.panX=pos.x-atState.dragStartX;atState.panY=pos.y-atState.dragStartY;atRender();return;}
  if(atState.dragVertexIndex>=0){
    const imgPos=atScreenToImage(pos.x,pos.y);
    atState.polygon[atState.dragVertexIndex]=imgPos;
    atRender();atCalculateArea();return;
  }
  if(atState.polygon.length>0){
    const vi=atFindVertexAt(pos.x,pos.y);
    if(vi!==atState.hoverVertexIndex){atState.hoverVertexIndex=vi;atRender();}
  }
  if(atState.mode==='draw'&&atState.polygon.length>0&&!atState.polygonClosed)atRender();
});

atCanvas.addEventListener('mouseup',function(){atState.isDragging=false;atState.dragVertexIndex=-1;atCanvasWrap.classList.remove('dragging');});

atCanvas.addEventListener('dblclick',function(){
  if(atState.mode==='draw'&&atState.polygon.length>=3&&!atState.polygonClosed){
    atState.polygonClosed=true;atSetMode('none');atRender();atCalculateArea();atShowToast('多边形已闭合');
  }
});

atCanvas.addEventListener('contextmenu',function(e){e.preventDefault();});

atCanvas.addEventListener('wheel',function(e){
  e.preventDefault();
  const pos=atGetMousePos(e);
  const delta=e.deltaY>0?0.9:1.1;
  const nz=Math.max(0.1,Math.min(20,atState.zoom*delta));
  const ib=atScreenToImage(pos.x,pos.y);
  atState.zoom=nz;
  const sa=atImageToScreen(ib.x,ib.y);
  atState.panX+=pos.x-sa.x;atState.panY+=pos.y-sa.y;
  // 状态栏已取消 → 空值守卫
  const atZoomEl=document.getElementById('atZoomDisplay');
  if(atZoomEl)atZoomEl.textContent='缩放: '+(atState.zoom*100).toFixed(0)+'%';
  atRender();atCalculateArea();
},{passive:false});

// 键盘（仅在面积工具区域内聚焦时生效）
const atKeyHandler=function(e){
  if(e.code==='Space'&&!atSpacePressed){atSpacePressed=true;atCanvas.style.cursor='grab';e.preventDefault();}
  if(e.code==='Escape')atSetMode('none');
  if(e.ctrlKey&&e.code==='KeyZ'){
    if(atState.polygon.length>0){
      if(atState.polygonClosed)atState.polygonClosed=false;
      else atState.polygon.pop();
      atRender();atCalculateArea();
    }
  }
};
const atKeyUpHandler=function(e){if(e.code==='Space'){atSpacePressed=false;atCanvas.style.cursor='';}};
document.addEventListener('keydown',atKeyHandler);
document.addEventListener('keyup',atKeyUpHandler);

// 拖放上传
atCanvasWrap.addEventListener('dragover',function(e){e.preventDefault();atCanvasWrap.classList.add('dragover');});
atCanvasWrap.addEventListener('dragleave',function(){atCanvasWrap.classList.remove('dragover');});
atCanvasWrap.addEventListener('drop',function(e){
  e.preventDefault();atCanvasWrap.classList.remove('dragover');
  const file=e.dataTransfer.files[0];
  if(file&&file.type.startsWith('image/'))atLoadImage(file);
});

document.getElementById('atFileInput').addEventListener('change',function(e){
  const file=e.target.files[0];
  if(file)atLoadImage(file);
});

document.getElementById('atBtnCalibrate').addEventListener('click',function(){
  if(!atState.image){atShowToast('请先上传图片');return;}
  atSetMode(atState.mode==='calibrate'?'none':'calibrate');
});

document.getElementById('atBtnDraw').addEventListener('click',function(){
  if(!atState.image){atShowToast('请先上传图片');return;}
  atSetMode(atState.mode==='draw'?'none':'draw');
});

document.getElementById('atBtnPickLine').addEventListener('click',function(){
  if(!atState.image){atShowToast('请先上传图片');return;}
  atSetMode(atState.mode==='pickline'?'none':'pickline');
});

/* 「拾取容差」控件已按要求取消（用户 2026-09-12），容差固定为默认值 40。
   atState.pickTolerance 仍是「拾取框线」算法的关键参数（见 atPickLine 内的 tol 用法），
   故保留本函数，并对已移除的滑块/数字框做空值守卫 —— 不抛错；将来把 UI 补回即自动恢复联动。 */
function atSetPickTolerance(value){
  const slider=document.getElementById('atPickTolerance');
  const input=document.getElementById('atPickToleranceNum');
  const min=slider?(parseInt(slider.min,10)||5):5;
  const max=slider?(parseInt(slider.max,10)||150):150;
  const v=Math.max(min,Math.min(max,parseInt(value,10)||40));
  atState.pickTolerance=v;
  if(slider) slider.value=String(v);
  if(input) input.value=String(v);
}
/* 原 4 个容差控件的事件绑定已随 UI 一并删除（缺了绑定，若元素不存在会在加载期抛 TypeError 中断整段脚本）：
     #atPickTolerance(input) / #atPickToleranceNum(input) / #atPickTolMinus(click) / #atPickTolPlus(click)。
   容差现在的唯一来源是状态默认值 40；若日后恢复上面的 HTML 注释块，请把这 4 行绑定一并补回。 */

document.getElementById('atBtnSetScale').addEventListener('click',function(){
  if(atState.calibPoints.length!==2){atShowToast('请先在图片上点击两个点');return;}
  const dist=parseFloat(document.getElementById('atRealDistance').value);
  const unit=document.getElementById('atRealUnit').value;
  if(!dist||dist<=0){atShowToast('请输入有效的实际距离');return;}
  const p1=atState.calibPoints[0],p2=atState.calibPoints[1];
  const pd=Math.sqrt((p2.x-p1.x)**2+(p2.y-p1.y)**2);
  atState.metersPerPixel=dist/pd;
  atState.realDistance=dist;atState.realUnit=unit;
  document.getElementById('atScaleInfo').style.display='block';
  document.getElementById('atScaleRatio').textContent='1像素 = '+atState.metersPerPixel.toFixed(4)+unit+' ('+pd.toFixed(1)+'px = '+dist+unit+')';
  atShowToast('比例尺设置成功');atSetMode('none');atRender();atCalculateArea();
});

document.getElementById('atBtnUndo').addEventListener('click',function(){
  if(atState.polygon.length>0){
    if(atState.polygonClosed)atState.polygonClosed=false;
    else atState.polygon.pop();
    atRender();atCalculateArea();
  }
});

document.getElementById('atBtnClose').addEventListener('click',function(){
  if(atState.polygon.length>=3&&!atState.polygonClosed){
    atState.polygonClosed=true;atSetMode('none');atRender();atCalculateArea();atShowToast('多边形已闭合');
  }
});

document.getElementById('atShowGridLines').addEventListener('change',function(e){atState.showGridLines=e.target.checked;atRender();});
document.getElementById('atGridSpacing').addEventListener('input',function(e){
  atState.gridSpacing=parseInt(e.target.value);
  document.getElementById('atGridSpacingVal').textContent=atState.gridSpacing+' px';
  atRender();atCalculateArea();
});

document.getElementById('atBtnClearPoly').addEventListener('click',function(){
  atState.polygon=[];atState.polygonClosed=false;atRender();atCalculateArea();atShowToast('边界已清除');
});

document.getElementById('atBtnClearAll').addEventListener('click',function(){
  atState.polygon=[];atState.polygonClosed=false;
  atState.calibPoints=[];atState.metersPerPixel=null;
  atState.pickTolerance=40;
  document.getElementById('atScaleInfo').style.display='none';
  document.getElementById('atRealDistance').value='';
  atSetPickTolerance(40);
  atSetMode('none');atRender();atCalculateArea();atShowToast('已清除全部');
});

// 「导出截图」按钮已在 03 版面精简中移除（原在顶部绿条右侧）。
// 逻辑保留 + 空值守卫：既不会因元素缺失抛错中断本段脚本，将来把按钮补回即自动生效。
const atBtnDownloadEl=document.getElementById('atBtnDownload');
if(atBtnDownloadEl){
  atBtnDownloadEl.addEventListener('click',function(){
    if(!atState.image){atShowToast('请先上传图片');return;}
    const link=document.createElement('a');
    link.download='area_measurement_'+Date.now()+'.png';
    link.href=atCanvas.toDataURL('image/png');
    link.click();atShowToast('截图已保存');
  });
}

let atToastTimer=null;
function atShowToast(msg){
  const toast=document.getElementById('atToast');
  toast.textContent=msg;toast.classList.add('show');
  clearTimeout(atToastTimer);
  atToastTimer=setTimeout(function(){toast.classList.remove('show');},2500);
}

if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    this.beginPath();this.moveTo(x+r,y);this.lineTo(x+w-r,y);
    this.quadraticCurveTo(x+w,y,x+w,y+r);this.lineTo(x+w,y+h-r);
    this.quadraticCurveTo(x+w,y+h,x+w-r,y+h);this.lineTo(x+r,y+h);
    this.quadraticCurveTo(x,y+h,x,y+h-r);this.lineTo(x,y+r);
    this.quadraticCurveTo(x,y,x+r,y);this.closePath();return this;
  };
}

window.addEventListener('resize',atResizeCanvas);
atResizeCanvas();
atSetMode('none');

// Export utilities for use outside this IIFE
window.atPointInPolygon = atPointInPolygon;
window.atShoelaceArea = polyAreaM2;

})();
