(function(root){
 'use strict';
 var MU=666.67;
 function area(poly){var s=0;poly.forEach(function(p,i){var q=poly[(i+1)%poly.length];s+=p[0]*q[1]-q[0]*p[1];});return Math.abs(s)/2;}
 function clip(poly,axis,value,above){
  var out=[];poly.forEach(function(p,i){var q=poly[(i+poly.length-1)%poly.length],a=above?p[axis]>=value:p[axis]<=value,b=above?q[axis]>=value:q[axis]<=value;
   if(a!==b){var t=(value-q[axis])/(p[axis]-q[axis]);out.push([q[0]+t*(p[0]-q[0]),q[1]+t*(p[1]-q[1])]);}if(a)out.push(p);
  });return out;
 }
 function scan(poly,axis,value){var hits=[],other=1-axis;poly.forEach(function(p,i){var q=poly[(i+1)%poly.length];if((p[axis]<=value&&q[axis]>value)||(q[axis]<=value&&p[axis]>value))hits.push(p[other]+(value-p[axis])/(q[axis]-p[axis])*(q[other]-p[other]));});hits.sort(function(a,b){return a-b;});var out=[];for(var i=0;i+1<hits.length;i+=2){var a=[],b=[];a[axis]=b[axis]=value;a[other]=hits[i];b[other]=hits[i+1];out.push([a,b]);}return out;}
 function build(points,length,mu,angle){
  if(!(length>0&&mu>0&&Number.isFinite(angle)))throw new Error('请输入有效的铺设长度、面积和角度');
  var fixed=length*2,derived=mu*MU/fixed;
  if(points.length<3)return {fixed:fixed,derived:derived,zones:[],lines:[]};
  var origin=points[0],factor=6378137*Math.PI/180,scale=factor*Math.cos(origin[0]*Math.PI/180),rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  // Rotate the working coordinates clockwise; only the grid rotates back onto the fixed boundary.
  var local=points.map(function(p){return [(p[1]-origin[1])*scale,(p[0]-origin[0])*factor];});
  var poly=local.map(function(p){return [p[0]*c+p[1]*s,-p[0]*s+p[1]*c];});
  function toLatLng(p){return [origin[0]+(p[0]*s+p[1]*c)/factor,origin[1]+(p[0]*c-p[1]*s)/scale];}
  var xs=poly.map(function(p){return p[0];}),ys=poly.map(function(p){return p[1];}),x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs),y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  // Keep the fixed edge on its original axis so turning the angle never silently swaps the sides.
  var baseX=local.map(function(p){return p[0];}),baseY=local.map(function(p){return p[1];});
  var longX=Math.max.apply(null,baseX)-Math.min.apply(null,baseX)>=Math.max.apply(null,baseY)-Math.min.apply(null,baseY),dx=longX?derived:fixed,dy=longX?fixed:derived,cols=Math.ceil((x1-x0)/dx),rows=Math.ceil((y1-y0)/dy);
  if(cols*rows>2000)throw new Error('分区数量过多，请增大面积或调整铺设长度');
  var zones=[],lines=[];
  for(var col=1;col<cols;col++)scan(poly,0,x0+col*dx).forEach(function(seg){lines.push(seg.map(toLatLng));});
  for(var row=1;row<rows;row++)scan(poly,1,y0+row*dy).forEach(function(seg){lines.push(seg.map(toLatLng));});
  for(var r=0;r<rows;r++)for(var k=0;k<cols;k++){
   var left=x0+k*dx,right=Math.min(x1,left+dx),bottom=y0+r*dy,top=Math.min(y1,bottom+dy);
   var cell=clip(clip(clip(clip(poly,0,left,true),0,right,false),1,bottom,true),1,top,false),a=area(cell);
   if(a<0.0001)continue;
   // Scan the original polygon within this cell, keeping labels and branch segments inside concave boundaries.
   var label=null,best=0;
   for(var f=1;f<10;f++)scan(poly,1,bottom+(top-bottom)*f/10).forEach(function(seg){var lo=Math.max(left,seg[0][0]),hi=Math.min(right,seg[1][0]);if(hi-lo>best){best=hi-lo;label=[(hi+lo)/2,seg[0][1]];}});
   // Desktop ppBuildAutoPipes: compare planned sides, main at 40%, parallel branch at 50%.
   // Edge cells keep the planned orientation; only endpoints are clipped to the real plot.
   var fixedH=dx>=dy,w=right-left,h=top-bottom,main=[],branch=[],subbranch=[];
   function pipe(axis,value,lo,hi,target){scan(poly,axis,value).forEach(function(seg){var a=Math.max(lo,seg[0][1-axis]),b=Math.min(hi,seg[1][1-axis]);if(b-a>1e-6){var p=[],q=[];p[axis]=q[axis]=value;p[1-axis]=a;q[1-axis]=b;target.push([p,q].map(toLatLng));}});}
   if(fixedH){
    var gapV=Math.min(Math.max(h*.06,4),14,h*.22);
    pipe(0,left+w*.4,bottom,top,main);pipe(0,left+w*.5,bottom+gapV,top-gapV,branch);
    var nV=Math.max(2,Math.floor(h/15));for(var v=1;v<=nV;v++)pipe(1,bottom+h*v/(nV+1),left+w*.15,left+w*.85,subbranch);
   }else{
    var gapH=Math.min(Math.max(w*.06,4),14,w*.22);
    pipe(1,bottom+h*.4,left,right,main);pipe(1,bottom+h*.5,left+gapH,right-gapH,branch);
    var nH=Math.max(2,Math.floor(w/15));for(var t=1;t<=nH;t++)pipe(0,left+w*t/(nH+1),bottom+h*.15,bottom+h*.85,subbranch);
   }
   zones.push({area:a,mu:a/MU,label:toLatLng(label||cell[0]),main:main,branch:branch,subbranch:subbranch,direction:fixedH?'vertical':'horizontal'});
  }
  return {fixed:fixed,derived:derived,angle:angle,zones:zones,lines:lines,main:zones.reduce(function(all,z){return all.concat(z.main);},[]),totalArea:area(poly)};
 }
 var api={build:build,area:area};if(typeof module==='object'&&module.exports)module.exports=api;else root.RyMobilePartition=api;
})(typeof window==='object'?window:globalThis);
