(function(){
  'use strict';
  /* ═══════════════════════════════════════════════════════════════════════
     [v859→v862→v868→v869 用户需求] 段总管（自动生成的分区主管串联干线）——纯几何函数，Node 单测锁。

     需求原话：在分区与管路页面中增加一个段总管，这个总管是自动生成的，垂直于
     自动生成的主管，把垂直方向的分区主管通过一根总管连接起来，两端预留驳接点；
     数据回传在线地图页，用户在地图页绘制总管后与驳接点驳接，变成完整水路。
     [v868] 起止就在**首末主管**上（两端不外延），方向语义：起点=最上/最左分区主管、
     终点=最下/最右分区主管。
     [v869] 干线不再放交集正中，改贴主管同侧端点（读不到水源 ⇒ 默认 lo=左/上侧）——
     但用户实测 v869 后仍「没看到」：主管端点延伸到地块外接总管/压在边界上，贴端点
     = 干线画在边界线上被盖住。
     [v870 定版]（用户拍板「方案甲」）：干线位置 = 主管中心向**水源侧**偏移
     「走向跨度 × 1/4」——落在地块内 1/4 分位，比例自适应、任何地块都清晰可见；
     数学上恒在交集 [L,H] 内（C±(H-L)/4 ⊂ [L,H]），必穿过每根主管。

     输入：mainPipes —— tlDiagramData.mainPipes（局部格系米坐标，每分区一条折线）。
           opts.src —— 水源/总管起点（同局部格系；inline-09 传 tlSrcDesign ||
           frontPipe[0]）。可省略。
           主管不足 2 条（单区）无需串联，返回 null。
     输出：null 或 {
       axis: 'x'|'y',     段总管走向（垂直于主管主方向）
       base: number,      段总管所在直线的法向坐标（axis=x 时是 y，axis=y 时是 x）
                          [v870] = 主管走向中心 C 向水源侧偏移 (H-L)×0.25
                          （H/L=交集两端；比例自适应，恒在 [L,H] 内）
       points: [{x,y}×2], [0]=起点（上/左=vMin 端）、[1]=终点（下/右=vMax 端）
       couplers:[{x,y}×2] 两端驳接点（= points 两端 = 首末主管串联处）
       joinPts:[{x,y}×N]  与各分区主管的串联点（主管与干线的交点）
       stub, len, lenJoin, side   side:'lo'(左/上)|'hi'(右/下) = 实际贴的一侧
     }

     几何规则（v862 判定沿用）：
     · 主方向 = 多数主管的长轴；段总管走垂直方向。
     · 各主管须轴对齐（两端在干线延伸轴上的坐标差 ≤ EPS）—— 斜主管不出。
     · 干线必须落在各主管走向范围 [min,max] 的交集内（保证穿过每一根主管）；
       交集为空 ⇒ 返回 null 不硬生成。
     · [v870] base = C 向水源侧偏移 (H-L)×0.25（C=(L+H)/2；偏移恒 < 半跨度 ⇒
       数学上必在交集内，仍做防御性 clamp）。水源在交集哪一半 ⇒ 向哪侧偏；
       无水源/坐标非法 ⇒ 默认向 lo（左/上）侧偏。
     · [v868] 起止 = 首末主管：vMin 端=起点（上/左）、vMax 端=终点（下/右）。
       方向依据：简图世界系**北=−y**（ts() 世界→屏幕不翻 y，世界 +y = 屏幕向下
       = 南；+x 恒为东）⇒ 「上」与「左」都是 vMin 端、「下」与「右」都是 vMax 端，
       两轴同式，无需按 axis 分叉。
     · stub 恒 0（无外延段）；len = 全长；lenJoin = len − 2×stub = len。
     ═══════════════════════════════════════════════════════════════════════ */
  var AXIS_EPS = 0.05;
  /* [v873] 最近一次 build 失败的原因（成功时置 null）。只读诊断：
     inline-09 落库 segTrunkSource、简图画淡字提示，用户/远程排障都能看到为什么没出干线。 */
  var lastError = null;
  function failWhy(reason){ lastError = reason; return null; }

  function axisOf(line){
    if(!line||line.length<2) return null;
    var a=line[0], b=line[line.length-1];
    var dx=Math.abs(b.x-a.x), dy=Math.abs(b.y-a.y);
    return (dx>=dy)?'x':'y';
  }

  function build(mainPipes, opts){
    try{
      lastError = null;
      var lines=(mainPipes||[]).filter(function(l){return l&&l.length>=2;});
      if(lines.length<2) return failWhy('主管少于2条(n='+(mainPipes||[]).length+')，无需串联');
      var nx=0;
      lines.forEach(function(l){ if(axisOf(l)==='x') nx++; });
      var mainAxis = nx*2>=lines.length ? 'x':'y';   /* 主管走向 */
      var vertAxis = mainAxis==='x' ? 'y':'x';       /* 干线延伸轴（垂直于主管） */
      /* 逐主管：轴对齐校验 + 走向范围收集 */
      var groups=[],los=[],his=[],cs=[];
      for(var i=0;i<lines.length;i++){
        var a=lines[i][0], b=lines[i][lines[i].length-1];
        if(Math.abs(a[vertAxis]-b[vertAxis])>AXIS_EPS) return failWhy('主管'+(i+1)+'斜出容差(偏差'+(Math.abs(a[vertAxis]-b[vertAxis])).toFixed(2)+'m>'+AXIS_EPS+'m)');
        var c=a[vertAxis], lo=Math.min(a[mainAxis],b[mainAxis]), hi=Math.max(a[mainAxis],b[mainAxis]);
        los.push(lo);his.push(hi);cs.push(c);
        var group=groups.find(function(g){return Math.abs(g.c-c)<=AXIS_EPS;});
        if(group){group.lo=Math.min(group.lo,lo);group.hi=Math.max(group.hi,hi);}
        else groups.push({c:c,lo:lo,hi:hi});
      }
      /* A physical main is split into one segment per partition cell. Combine
         collinear segments before finding the common crossing range. */
      var originalL=Math.max.apply(null,los),originalH=Math.min.apply(null,his);
      if(originalL>originalH){
        if(groups.length<2) return failWhy('各主管首尾错开且合并后仅剩1条共线主管，干线无法垂直穿过全部');
        los=groups.map(function(g){return g.lo;});
        his=groups.map(function(g){return g.hi;});
        cs=groups.map(function(g){return g.c;});
      }
      /* 走向交集；空 ⇒ 错开 ⇒ 不出 */
      var L=Math.max.apply(null,los), H=Math.min.apply(null,his);
      if(L>H) return failWhy('各主管走向范围无公共交集(跨度错开)');
      var vMin=Math.min.apply(null,cs), vMax=Math.max.apply(null,cs);
      if(!(vMax>vMin)) return failWhy('各分区主管共点(无串联跨度)');           /* 横向共点（退化） */
      /* [v870] 干线位置：主管中心 C 向水源侧偏移 跨度×1/4（用户方案甲）。
         水源在交集哪一半 ⇒ 向哪侧偏；无水源/坐标非法 ⇒ 默认 lo（左/上）。
         偏移量 (H-L)/4 < 半跨度 ⇒ base 恒在 [L,H] 内，clamp 仅防御。 */
      var sidePos='lo';
      var src=opts&&opts.src;
      if(src&&isFinite(src[mainAxis])) sidePos=(src[mainAxis]<((L+H)/2))?'lo':'hi';
      var off=(H-L)*0.25;
      var base=((L+H)/2)+(sidePos==='lo'?-off:off);
      if(base<L) base=L; if(base>H) base=H;
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
        side:sidePos
      };
    }catch(e){ lastError='exception:'+(e&&e.message||e); return null; }
  }

  window.RySegTrunk = { VERSION:'v873-seg-why', build:build, axisOf:axisOf, AXIS_EPS:AXIS_EPS,
    /* [v873] 最近一次 build 的失败原因（null=最近一次成功或未跑过）。 */
    get lastError(){ return lastError; } };
})(window);
