/* _p1/_inj_v207_ctxmenu.cjs · [v207] 注入体检（证明上面的断言**不是恒绿**）
 * 纪律（用户长期记忆）：「打印了红字」≠「拦得住」；新写的契约必须靠
 *   「注入缺陷 → 对应断言真的变红」来证明，而不是靠「改完全绿」。
 * 本脚本逐个把 v207 的实现**改坏**一份副本，跑同一套验证脚本，断言：
 *   ① 该副本确实有失败；② **指定的那几条**断言真的变红（而不是别处顺带失败）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const SRC = path.join(WS, '管路接驳拼装.html');
const NODE_PATH = process.env.NODE_PATH || '';
const base = fs.readFileSync(SRC, 'utf8');

/* Windows 下 spawnSync 偶发 EBUSY ⇒ 异步 spawn，串行跑 */
function runOnce(file, port) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(WS, '_p1', '_shot_v207_pa_ctxmenu.cjs')], {
      cwd: WS, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env,
        { PA_PAGE: file, PA_TAG: '_' + port, PA_PORT: String(port), NODE_PATH: NODE_PATH })
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { out += d.toString(); });
    p.on('error', (e) => { out += 'SPAWN-ERROR ' + e.message + '\n'; resolve(out); });
    p.on('close', () => resolve(out));
  });
}

const CASES = [
  {
    n: 'J1 改径不扩散（只改自己，配件不跟随）',
    from: '    var n=propagateDn(c.id);',
    to: '    var n=0; /* INJ */',
    red: ['②b', '②c', '②e']
  },
  {
    n: 'J2 变径不再作为扩散边界（把有意保留的大小头拉平）',
    from: "      case 'reducer': return [];",
    to: "      case 'reducer': return LIB[c.kind].ports.filter(function(s){ return s!==entrySide; }); /* INJ */",
    red: ['③b', '③c']
  },
  {
    n: 'J3 自动吸附时不把配件口径改成管道的（退回异径不吸附）',
    from: '      if(!skip) applyDnToPort(mc, side, portDn(nc,near.side));',
    to: '      if(false) applyDnToPort(mc, side, portDn(nc,near.side)); /* INJ */',
    red: ['⑥a', '⑥c']
  },
  {
    /* ★ 复现 v207 开发中真实踩到的那个坑：手柄当时是挂在组件自己的 <g> 里（等价于「先画」），
       管尾正好接着下游管件 ⇒ 手柄被后画的下游盖住，pointerdown 命中的是下游件。 */
    n: 'J4 手柄画在组件之前（被下游管件抢走命中 —— 开发中真实踩到的坑）',
    pat: [
      ['    // 3) 组件本体\n    S.components.forEach(function(c){ drawComp(c); });',
        '    /* INJ: 手柄先画 ⇒ 被后画的组件盖住 */\n'
        + '    var _ll=el("g",{id:"paLenLayer0"}); vp.appendChild(_ll);\n'
        + '    S.components.forEach(function(c){ if(c.kind!=="straight") return;\n'
        + '      var _q=P(c.x+c.len*SCALE+LH_OFF,c.y); lenHandle(_ll,c.id,_q.x,_q.y); });\n'
        + '    // 3) 组件本体\n    S.components.forEach(function(c){ drawComp(c); });'],
      ['    /* 6) [v207] 直管长度手柄 —— 顶层图层，保证在下游管件之上仍可命中 */\n'
        + '    var lenLayer=el(\'g\',{id:\'paLenLayer\'});\n'
        + '    vp.appendChild(lenLayer);\n'
        + '    S.components.forEach(function(c){\n'
        + '      if(c.kind!==\'straight\') return;\n'
        + '      var q=P(c.x+c.len*SCALE+LH_OFF, c.y);\n'
        + '      lenHandle(lenLayer,c.id,q.x,q.y);\n'
        + '    });',
        '    /* INJ: 顶层图层那一份不再画 */']
    ],
    red: ['⑨b', '⑨c', '⑨d']
  },
  {
    n: 'J5 改管长不让下游跟着走（接口被拉开成缝）',
    from: "      collectBranch(c.id,'L').forEach(function(id){ var b=findComp(id); if(b) b.x+=dpx; });",
    to: '      void dpx; /* INJ */',
    red: ['⑨c', '⑨d']
  },
  {
    n: 'J6 换选型不重建连接',
    from: '      if(tryConnect(nc.id,newPorts[i],lk.oId,lk.oSide).ok) made++; else dropped++;',
    to: '      dropped++; /* INJ */',
    red: ['④d', '④e']
  },
  {
    n: 'J7 换选型后不做整链重排（几何错位）',
    from: '    cascadeAlign(nc.id);',
    to: '    /* INJ: 不做重排 */',
    red: ['⑤']
  },
  {
    n: 'J8 右键不弹菜单',
    from: "    selectComp(c.id);              /* 顺带选中，右栏属性同步显示这一件 */\n    openMenu(e.clientX,e.clientY,c);",
    to: '    selectComp(c.id);              /* INJ: 不弹菜单 */',
    red: ['①a', '①b', '①c']
  }
];

(async () => {
  let ok = 0, bad = 0, port = 9600;
  for (const cs of CASES) {
    const pats = cs.pat || [[cs.from, cs.to]];
    let srcNow = base, anchorBad = false, changed = 0;
    pats.forEach((p) => {
      const n = srcNow.split(p[0]).length - 1;
      if (n !== 1) { anchorBad = true; console.log('  [配置错] ' + cs.n + ' :: 锚点 "' + p[0].split('\n')[0].slice(0, 40) + '…" 命中 ' + n + ' 次（应恰好 1 次）'); return; }
      srcNow = srcNow.replace(p[0], p[1]); changed++;
    });
    if (anchorBad || changed !== pats.length) { bad++; continue; }
    const file = '_tmp_inj207_' + (++port) + '.html';
    fs.writeFileSync(path.join(WS, file), srcNow, 'utf8');
    const out = await runOnce(file, port);
    const failed = out.split('\n').filter((l) => l.indexOf('[FAIL]') >= 0).map((l) => l.replace(/^.*\[FAIL\]\s*/, '').trim());
    const m = out.match(/=== 汇总：(\d+) 通过 \/ (\d+) 失败 ===/);
    const gotRed = cs.red.every((k) => failed.some((f) => f.indexOf(k) === 0));
    const good = failed.length > 0 && gotRed;
    console.log((good ? '  [OK]     ' : '  [坏闸门] ') + cs.n + '  （总体 ' + (m ? m[2] : '?') + ' 失败）');
    console.log('           期望命中 ' + cs.red.join(' / ') + ' ⇒ ' + (gotRed ? '精确命中 ✓' : '未命中 ✗') +
      '；实际红条：' + (failed.length ? failed.slice(0, 7).map((f) => f.split(' ::')[0]).join(' | ') : '（无）'));
    good ? ok++ : bad++;
    try { fs.unlinkSync(path.join(WS, file)); } catch (e) { }
  }
  console.log('\n=== 注入体检：' + ok + '/' + CASES.length + ' 个缺陷被闸门拦下 ===');
  process.exit(bad ? 1 : 0);
})();
