/* _p1/_inj_v208_snap.cjs · [v208] 注入体检（驱动见 _p1/_inj_harness.cjs） */
'use strict';
const path = require('path');
const harness = require('./_inj_harness.cjs');
const WS = 'C:\\Users\\AHS\\runye-irrigation';

const CASES = [
  {
    n: 'K1 去掉拖动中的实时磁吸（退回「只在松手那一刻判定」—— 用户反馈的旧症状）',
    from: '      drag.snapHint=null;\n'
      + '      var hit=snapCandidate(drag.id, snapRadiusPx());\n'
      + '      if(hit){\n'
      + '        var hc=findComp(hit.id), hp=portPos(hc,hit.side), hl=portLocal(c,hit.selfSide);\n'
      + '        moveWithBranch(c, hp.x-hl.x, hp.y-hl.y);\n'
      + '        drag.snapHint={x:hp.x,y:hp.y};\n'
      + '      }',
    to: '      drag.snapHint=null; /* INJ: 无实时磁吸 */',
    red: ['V4a', 'V4b']
  },
  {
    n: 'K2 吸附半径退回旧值 34 屏幕px',
    from: 'function snapRadiusPx(){ return Math.max(10*S.zoom, Math.min(45*S.zoom, SNAP_PX)); }',
    to: 'function snapRadiusPx(){ return 34; /* INJ */ }',
    red: ['V2']
  },
  {
    n: 'K3 nearestPort 漏乘 S.zoom（度量单位错 ⇒ 缩放一变半径失真，此处会变得过粘）',
    from: '        var d=Math.hypot(pq.x-ref.x,pq.y-ref.y)*S.zoom;   /* viewport → 屏幕 */',
    to: '        var d=Math.hypot(pq.x-ref.x,pq.y-ref.y); /* INJ: 忘记 ×zoom */',
    red: ['V3']
  },
  {
    n: 'K4 拖动只移动自身、不带整串（会把已接通的接口拉出缝）',
    from: '      moveWithBranch(c, p.x-drag.dx, p.y-drag.dy);\n      /* [v208]',
    to: '      c.x=p.x-drag.dx; c.y=p.y-drag.dy;   /* INJ: 不带整串 */\n      /* [v208]',
    red: ['V6a', 'V6b']
  },
  {
    n: 'K5 吸附时不把配件口径改成管道的（DN110 的配件又吸不上 DN90 的管子）',
    from: '      if(!skip) applyDnToPort(mc, side, portDn(nc,near.side));',
    to: '      if(false) applyDnToPort(mc, side, portDn(nc,near.side)); /* INJ */',
    red: ['V1', 'V2', 'V5', 'V7']
  }
];

(async () => {
  const r = await harness.runCases({ ws: WS, src: '管路接驳拼装.html', script: '_p1/_shot_v208_snap.cjs', cases: CASES, basePort: 9700 });
  process.exit(r.bad ? 1 : 0);
})();
