(function(){
  'use strict';
  /* ═══════════════════════════════════════════════════════════════════════
     [v859→v862→v868 用户需求] 段总管（自动生成的分区主管串联干线）—— 纯几何函数，Node 单测锁。

     需求原话：在分区与管路页面中增加一个段总管，这个总管是自动生成的，垂直于
     自动生成的主管，把垂直方向的分区主管通过一根总管连接起来，两端预留驳接点；
     数据回传在线地图页，用户在地图页绘制总管后与驳接点驳接，变成完整水路。
     [v868 定版]（用户看图拍板「方案B」）：「垂直于主管的方向布置，起点是上/左分区
     终点是下/右分区」——起止就在**首末主管**上（两端不再外延驳接段），并定死方向
     语义：起点=最上/最左分区主管，终点=最下/最右分区主管。

     输入：mainPipes —— tlDiagramData.mainPipes（世界米坐标，每分区一条折线）。
           不足 2 条（单区）无需串联，返回 null。
     输出：null 或 {
       axis: 'x'|'y',     段总管走向（垂直于主管主方向）
       base: number,      段总管所在直线的法向坐标（axis=x 时是 y，axis=y 时是 x）
       points: [{x,y}×2], [0]=起点（上/左=vMin 端）、[1]=终点（下/右=vMax 端）
       couplers:[{x,y}×2] 两端驳接点（= points 两端 = 首末主管串联处）
       joinPts:[{x,y}×N]  与各分区主管的串联点（主管与干线的交点）
       stub, len, lenJoin, side
     }

     几何规则（v862 重写判定 —— v859 的「同一侧端点共线」对多行/多列网格永不成立：
     自动主管按行/列排布，同一侧端点分布在每行/列的边界上，坐标天然参差，导致
     线上实测恒返 null、用户看不到段总管。新判定回归几何本质）：
     · 主方向 = 多数主管的长轴；段总管走垂直方向。
     · 各主管须轴对齐（两端在干线延伸轴上的坐标差 ≤ EPS）—— 斜主管不出。
     · 干线位置 base = 各主管走向范围 [min,max] 交集的中点；交集为空（主管沿
       走向轴完全错开，垂直干线无法同时穿过）⇒ 返回 null 不硬生成。
     · [v868] 起止 = 首末主管：vMin 端=起点（上/左）、vMax 端=终点（下/右）。
       方向依据：简图世界系**北=−y**（ts() 世界→屏幕不翻 y，世界 +y = 屏幕向下
       = 南；+x 恒为东）⇒ 「上」与「左」都是 vMin 端、「下」与「右」都是 vMax 端，
       两轴同式，无需按 axis 分叉。
     · stub 恒 0（无外延段）；len = 全长；lenJoin = len − 2×stub = len。
     ═══════════════════════════════════════════════════════════════════════ */
  var AXIS_EPS = 0.05;

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
      var mainAxis = nx*2>=lines.length ? 'x':'y';   /* 主管走向 */
      var vertAxis = mainAxis==='x' ? 'y':'x';       /* 干线延伸轴（垂直于主管） */
      /* 逐主管：轴对齐校验 + 走向范围收集 */
      var los=[], his=[], cs=[];
      for(var i=0;i<lines.length;i++){
        var a=lines[i][0], b=lines[i][lines[i].length-1];
        if(Math.abs(a[vertAxis]-b[vertAxis])>AXIS_EPS) return null;  /* 斜主管 ⇒ 不猜 */
        los.push(Math.min(a[mainAxis],b[mainAxis]));
        his.push(Math.max(a[mainAxis],b[mainAxis]));
        cs.push(a[vertAxis]);
      }
      /* 干线位置 = 走向范围交集的中点；空交集 ⇒ 错开 ⇒ 不出 */
      var L=Math.max.apply(null,los), H=Math.min.apply(null,his);
      if(L>H) return null;
      var base=(L+H)/2;
      var vMin=Math.min.apply(null,cs), vMax=Math.max.apply(null,cs);
      if(!(vMax>vMin)) return null;           /* 横向共点（退化） */
      /* [v868] 起点=上/左分区主管（vMin 端）→ 终点=下/右分区主管（vMax 端）；
         驳接点=首末主管串联处。stub 恒 0：不再有外延驳接段。 */
      var p1x,p1y,p2x,p2y;
      if(vertAxis==='x'){ p1x=vMin; p1y=base; p2x=vMax; p2y=base; }
      else              { p1x=base; p1y=vMin; p2x=base; p2y=vMax; }
      var len=Math.hypot(p2x-p1x,p2y-p1y);
      return {
        axis: vertAxis, base: base,
        points:[{x:p1x,y:p1y},{x:p2x,y:p2y}],
        couplers:[{x:p1x,y:p1y},{x:p2x,y:p2y}],
        joinPts:cs.map(function(c){
          return (vertAxis==='x') ? {x:c,y:base} : {x:base,y:c};
        }),
        stub:0, len:len, lenJoin:len,
        side:'ends'
      };
    }catch(e){ return null; }
  }

  window.RySegTrunk = { VERSION:'v868-seg-ends', build:build, axisOf:axisOf, AXIS_EPS:AXIS_EPS };
})(window);
