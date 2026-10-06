(function(root){
 'use strict';
 function pipeKey(k){return /^(frontPipe|mainPipe|branchPipe)(?:-od-[\d.]+)?$/.test(k);}
 function length(a){var s=0;for(var i=1;i<(a||[]).length;i++)s+=Math.hypot(a[i].x-a[i-1].x,a[i].y-a[i-1].y);return s;}
 function buckets(d,r,A,hidden,ratio,manual){
  var out={front:[],main:[],branch:[]},c=A&&A.calibersMap?A.calibersMap():{},defaults={front:r.frontPipe.od,main:r.mainPipe.od,branch:r.branchPipe.od};
  function add(k,od,len){if(!(len>0))return;od=Number(od)||defaults[k];var b=out[k].find(function(q){return q.od===od;});if(!b){b={od:od,len:0};out[k].push(b);}b.len+=len;}
  ['front','main','branch'].forEach(function(k){var arr=k==='front'?[d.frontPipe]:(d[k+'Pipes']||[]);arr.forEach(function(p,i){var id=k==='front'?'front':k+'-'+i;if(hidden(id))return;var q=A&&A.effPts?A.effPts(id,d):p;if(!q)return;add(k,c[id]||defaults[k],length(q)*(k==='front'&&ratio!=null?ratio:1));});});
  (manual||[]).forEach(function(p){if(p.kind==='main'||p.kind==='branch')add(p.kind,p.od||defaults[p.kind],length(p.pts));});
  return out;
 }
 function refs(expr){expr=expr.toUpperCase();var out=[];expr.replace(/SUM\(\s*([A-Z]+)(\d+)\s*:\s*([A-Z]+)(\d+)\s*\)/g,function(_,a,r,b,s){function col(x){var n=0;for(var i=0;i<x.length;i++)n=n*26+x.charCodeAt(i)-64;return n;}function name(n){var x='';while(n){var k=(n-1)%26;x=String.fromCharCode(65+k)+x;n=Math.floor((n-1)/26);}return x;}for(var c=Math.min(col(a),col(b));c<=Math.max(col(a),col(b))&&out.length<10000;c++)for(var i=Math.min(+r,+s);i<=Math.max(+r,+s)&&out.length<10000;i++)out.push(name(c)+i);return '';});(expr.match(/[A-Z]+\d+/g)||[]).forEach(function(k){if(out.indexOf(k)<0)out.push(k);});return out;}
 function nodeHidden(nd){
  if(!nd||!nd.pid)return false;if(root.tlIsPipeHidden&&root.tlIsPipeHidden(nd.pid))return true;
  var A=root.RyTlAutoEdits,d=root.tlDiagramData,p=A&&d&&A.effPts(nd.pid,d);if(!p||p.length<2)return true;
  if(nd.pid!=='front')return false;
  var cuts=root.RyTlPathMeasure&&root.RyTlPathMeasure.frontRatios();if(!cuts||cuts.length<2)return false;
  var ratio=length(p)>0?Math.max(0,Math.min(1,nd.atM/length(p))):0,seen=false;
  for(var i=0;i<cuts.length-1;i++)if(ratio>=cuts[i]-1e-8&&ratio<=cuts[i+1]+1e-8){seen=true;if(!root.tlIsPipeSegHidden('front-'+i))return false;}
  return seen;
 }
 function autoFittings(d,r,A){
  var out={zoneTee:[],zoneValve:[],teeJoint:[],frontValve:[]},c=A&&A.calibersMap?A.calibersMap():{},lines={},front=A&&A.effPts?A.effPts('front',d):d.frontPipe;
  function od(pid,k){return Number(c[pid])||r[k+'Pipe'].od;}
  function add(key,spec){var b=out[key].find(q=>q.spec===spec);if(!b){b={spec:spec,qty:0};out[key].push(b);}b.qty++;}
  function nearest(p){var best={dist:Infinity,atM:0},sum=0;for(var j=1;j<(front||[]).length;j++){var a=front[j-1],b=front[j],dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),t=L?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(L*L))):0,v=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(v<best.dist)best={dist:v,atM:sum+t*L};sum+=L;}return best;}
  (d.mainPipes||[]).forEach(function(raw,i){var id='main-'+i;if(root.tlIsPipeHidden(id))return;var l=A&&A.effPts?A.effPts(id,d):raw;if(!l||l.length<2)return;
    var mo=od(id,'main');
    var a=l[0],b=l[l.length-1],dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y),key=dy<=dx*0.25?'H'+Math.round((a.y+b.y)*2)/2:dx<=dy*0.25?'V'+Math.round((a.x+b.x)*2)/2:'S'+a.x.toFixed(1)+','+a.y.toFixed(1),na=nearest(a),nb=nearest(b),near=na.dist<nb.dist?na:nb;
    if(!lines[key]||near.dist<lines[key].near.dist)lines[key]={mo:mo,near:near};
  });
  (d.branchPipes||[]).forEach(function(raw,i){
    var id='branch-'+i;if(root.tlIsPipeHidden(id))return;var bp=A&&A.effPts?A.effPts(id,d):raw;if(!bp||bp.length<2)return;
    var v=(d.valves||[])[i],q=v&&Number.isFinite(v.ax)&&Number.isFinite(v.ay)?{x:v.ax,y:v.ay}:bp[Math.floor(bp.length/2)],best=Infinity,mi=-1;
    (d.mainPipes||[]).forEach(function(l,j){l=A&&A.effPts?A.effPts('main-'+j,d):l;for(var t=1;t<(l||[]).length;t++){var a=l[t-1],b=l[t],dx=b.x-a.x,dy=b.y-a.y,D=dx*dx+dy*dy,k=D?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/D)):0,L=Math.hypot(q.x-a.x-k*dx,q.y-a.y-k*dy);if(L<best){best=L;mi=j;}}});
    if(mi<0||root.tlIsPipeHidden('main-'+mi))return;var mo=od('main-'+mi,'main'),bo=od(id,'branch');add('zoneTee','Ø '+mo+' × Ø '+bo+' mm');add('zoneValve','Ø '+bo+' mm · 电动');
  });
  Object.keys(lines).forEach(function(k){var l=lines[k];if(nodeHidden({pid:'front',atM:l.near.atM}))return;add('teeJoint','Ø '+od('front','front')+' × Ø '+l.mo+' mm');add('frontValve','Ø '+l.mo+' mm');});return out;
 }
 root.RyMaterialAudit={pipeKey:pipeKey,buckets:buckets,refs:refs,nodeHidden:nodeHidden,autoFittings:autoFittings};
})(typeof window==='undefined'?globalThis:window);
