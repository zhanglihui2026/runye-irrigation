/* _p1/_inj_v222_axisrot.cjs · [v222] 注入体检：证明三轴旋转的断言「非恒绿」
 *
 * 闸门三要素：存在 + 判定 + 判据松紧 —— 本脚本回答「改坏了能不能拦住」：
 *   I1  rotAxis3 被改成空操作（不写 rx/ry，直接 return true）
 *       ⇒ 段2（④ z=+40 / ⑤ 级联 z=40）必须变红；且 ③朝向行/②UI 仍然绿（精确命中）
 *   I2  cascadeAlign 被改成空操作（旋转后不重排下游）
 *       ⇒ 段2 的 ⑤（下游直管 z=40 / maxGap3）必须变红；④（自身端口 z）仍绿（精确命中）
 *
 * ★ v217 事故纪律：临时注入文件由本脚本自己命名、放在 _verify_out/ 下、
 *   开头断言路径前缀属于本目录才允许删除 —— 永不删除外部传入路径。
 * 用法：node _p1/_inj_v222_axisrot.cjs   （内部自行驱动 _shot_v222_axisrot.cjs）
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const SRC = path.join(WS, '管路接驳拼装.html');
/* ⚠ 副本必须放**项目根目录**（与原页面同目录）—— 放 _verify_out/ 会因相对资源
   （js/css 同目录引用）403/404 而污染「无 JS 报错」断言（实测 3 条 ERR_FILE_NOT_FOUND） */
const INJ = path.join(WS, '_inj_v222_axisrot.html');

/* spawnSync 在本环境（沙箱目录 + Edge 残留锁）会偶发 EBUSY ⇒ 用异步 spawn + 重试 3 次 */
function runNode(args, env, attempt) {
  attempt = attempt || 0;
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', (e) => {
      if (e.code === 'EBUSY' && attempt < 3) return setTimeout(() => runNode(args, env, attempt + 1).then(resolve, reject), 1200);
      reject(e);
    });
    p.on('close', (code) => resolve({ code, out }));
  });
}

const cases = [
  {
    key: 'I1', desc: 'rotAxis3 空操作（不写 rx）',
    only: '2', expect: 2,
    from: "if(axis!=='x'&&axis!=='y') return rotateComp(id,delta);",
    to: "if(true) return true; /* INJ I1 */ if(axis!=='x'&&axis!=='y') return rotateComp(id,delta);"
  },
  {
    key: 'I2', desc: 'cascadeAlign 空操作（不级联）',
    only: '2', expect: 1,
    /* ⚠ 无条件 return，不许用「门控变量」—— 第一版写 if(window.__INJ2) return 而
       __INJ2 从未置真 ⇒ 注入退化成恒等、照样全绿（教训 5 变体：先验注入有效性） */
    from: 'function cascadeAlign(rootId){\n    var visited={};',
    to: 'function cascadeAlign(rootId){\n    return; /* INJ I2 */ var visited={};'
  }
];

let allOk = true;
(async () => {
for (const c of cases) {
  let src = fs.readFileSync(SRC, 'utf8');
  if (src.indexOf(c.from) < 0) { console.error('[' + c.key + '] 注入锚点未找到，拒绝继续'); process.exit(2); }
  src = src.replace(c.from, c.to);
  fs.writeFileSync(INJ, src);
  console.log('\n===== ' + c.key + ' ' + c.desc + ' （PA_ONLY=' + c.only + '）=====');
  const r = await runNode([path.join(WS, '_p1', '_shot_v222_axisrot.cjs')],
    Object.assign({}, process.env, { PA_PAGE: '_inj_v222_axisrot.html', PA_ONLY: c.only, PA_PORT: '9557', PA_TAG: '_' + c.key }));
  const out = r.out;
  console.log(out.trim().split('\n').filter(l => l.indexOf('[FAIL]') >= 0 || l.indexOf('汇总') >= 0 || l.indexOf('PASS') >= 0).join('\n'));
  const m = out.match(/断言 (\d+)\/(\d+) PASS/);
  const failed = m ? (+m[2] - +m[1]) : -1;
  const hit = failed >= c.expect;
  console.log('[' + c.key + '] 注入后红条数=' + failed + '（期望 ≥' + c.expect + '）→ ' + (hit ? '命中 ✓' : '未命中 ✗（闸门被自己写哑！）'));
  if (!hit) allOk = false;
}
/* 临时文件：本脚本自己命名 + 位于本仓库根目录 ⇒ 允许删（v217 纪律：外来路径永不删） */
try { if (path.dirname(INJ) === WS && path.basename(INJ) === '_inj_v222_axisrot.html') fs.unlinkSync(INJ); } catch (e) { }
console.log('\n== 注入体检 ==\n' + (allOk ? '全部命中，闸门有效' : '存在未命中，闸门无效！'));
process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(2); });
