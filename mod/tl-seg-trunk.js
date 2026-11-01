(function(){
  'use strict';
  /* ═══════════════════════════════════════════════════════════════════════
     [v859 用户需求] 段总管（自动生成的分区主管串联干线）—— 纯几何函数，Node 单测锁。

     需求原话：在分区与管路页面中增加一个段总管，这个总管是自动生成的，垂直于
     自动生成的主管，把垂直方向的分区主管通过一根总管连接起来，两端预留驳接点；
     数据回传在线地图页，用户在地图页绘制总管后与驳接点驳接，变成完整水路。

     输入：mainPipes —— tlDiagramData.mainPipes（世界米坐标，每分区一条折线，
           各条**平行**）。不足 2 条（单区）无需串联，返回 null。
     输出：null 或 {
       axis: 'x'|'y',     段总管走向（垂直于主管主方向）
       base: number,      段总管所在直线的法向坐标（axis=x 时是 y，axis=y 时是 x）
       points: [{x,y}×2], 线段两端（含两端驳接延伸段）
       couplers:[{x,y}×2] 两端驳接点（= points 两端）
       joinPts:[{x,y}×N]  与各分区主管的串联点（主管端点上）
       stub, len, lenJoin, side
     }

     几何规则：
     · 主方向 = 多数主管的长轴；段总管走垂直方向。
     · 串联端 = 各主管「同一侧」的端点：比较 min 侧与 max 侧端点在主管长轴上
       的离散度（极差），取小者；小者超过 TOL（不共线）⇒ 返回 null 不硬生成
       （宁可没有，不猜一条错位置的总管）。
     · 驳接段 stub = max(3, 主管平均间距×0.35)，两端各延伸一段，端点即驳接点。
     ═══════════════════════════════════════════════════════════════════════ */
  var TOL = 0.35;

  function axisOf(line){
    if(!line||line.length<2) return null;
    var a=line[0], b=line[line.length-1];
    var dx=Math.abs(b.x-a.x), dy=Math.abs(b.y-a.y);
    return (dx>=dy)?'x':'y';
  }

  function build(mainPipes){
    try{
      var lines=(mainPipes||[]).filter(function(l){return l&&l.length>=2;});
      if(lines.length<2) return null;
      var nx=0;
      lines.forEach(function(l){ if(axisOf(l)==='x') nx++; });
      var mainAxis = nx*2>=lines.length ? 'x':'y';
      var vertAxis = mainAxis==='x' ? 'y':'x';
      var other = mainAxis;
      var lo=[], hi=[];
      lines.forEach(function(l){
        var a=l[0], b=l[l.length-1];
        if(a[other]>b[other]){ var t=a;a=b;b=t; }
        lo.push(a); hi.push(b);
      });
      function spread(arr){
        var vs=arr.map(function(p){return p[other];});
        return Math.max.apply(null,vs)-Math.min.apply(null,vs);
      }
      var sLo=spread(lo), sHi=spread(hi);
      var useLo = sLo<=sHi;
      var ends = useLo?lo:hi;
      if(Math.min(sLo,sHi)>TOL) return null;  /* 两侧都不共线 ⇒ 不生成 */
      var base = ends.reduce(function(s,p){return s+p[other];},0)/ends.length;
      var vs=ends.map(function(p){return p[vertAxis];});
      var vMin=Math.min.apply(null,vs), vMax=Math.max.apply(null,vs);
      if(!(vMax>vMin)) return null;           /* 端点共点（退化） */
      var sorted=vs.slice().sort(function(a,b){return a-b;});
      var gaps=0,gn=0;
      for(var i=1;i<sorted.length;i++){ gaps+=sorted[i]-sorted[i-1]; gn++; }
      var stub=Math.max(3, gn?(gaps/gn)*0.35:3);
      var p1={},p2={};
      p1[vertAxis]=vMin-stub; p1[other]=base;
      p2[vertAxis]=vMax+stub; p2[other]=base;
      p1.x=p1.x!==undefined?p1.x:base; p1.y=p1.y!==undefined?p1.y:base;
      p2.x=p2.x!==undefined?p2.x:base; p2.y=p2.y!==undefined?p2.y:base;
      /* 上面两行兜底其实总有一个分量未赋值——显式补齐： */
      p1.x = (vertAxis==='x') ? (vMin-stub) : base;
      p1.y = (vertAxis==='y') ? (vMin-stub) : base;
      p2.x = (vertAxis==='x') ? (vMax+stub) : base;
      p2.y = (vertAxis==='y') ? (vMax+stub) : base;
      return {
        axis: vertAxis, base: base,
        points:[{x:p1.x,y:p1.y},{x:p2.x,y:p2.y}],
        couplers:[{x:p1.x,y:p1.y},{x:p2.x,y:p2.y}],
        joinPts:ends.map(function(p){return {x:p.x,y:p.y};}),
        stub:stub, len:Math.hypot(p2.x-p1.x,p2.y-p1.y),
        lenJoin:Math.hypot(p2.x-p1.x,p2.y-p1.y)-2*stub,
        side:useLo?'lo':'hi'
      };
    }catch(e){ return null; }
  }

  window.RySegTrunk = { VERSION:'v859-seg-trunk', build:build, axisOf:axisOf, TOL:TOL };
})(window);
