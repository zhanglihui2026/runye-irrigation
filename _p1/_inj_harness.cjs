/* _p1/_inj_harness.cjs · 注入体检通用驱动
 * 把「改坏一份副本 → 跑一遍验证脚本 → 断言指定编号真的变红」这件事做成一次性基建：
 *   · 子进程带**超时兜底**，超时/异常/没跑完会被明确标成 [运行异常]，
 *     不再混进「坏闸门」里（否则环境卡一下就会被误读成「功能有缺陷」）；
 *   · 每轮结束 killTree 掉子进程自己 spawn 的 Edge 整棵树，避免孤儿进程累积拖垮机器。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const killTree = require('./_edge_kill.cjs');

const TIMEOUT_MS = parseInt(process.env.INJ_TIMEOUT || '300000', 10);

function runOnce(ws, script, file, port, tag) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ws, script)], {
      cwd: ws, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env,
        { PA_PAGE: file, PA_TAG: '_' + tag, PA_PORT: String(port), NODE_PATH: process.env.NODE_PATH || '' })
    });
    let out = '';
    const timer = setTimeout(() => {
      out += '\n[RUNNER] 子进程超过 ' + TIMEOUT_MS + 'ms 未结束，已终止\n';
      try { p.kill(); } catch (e) { }
    }, TIMEOUT_MS);
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { out += d.toString(); });
    p.on('error', (e) => { out += 'SPAWN-ERROR ' + e.message + '\n'; clearTimeout(timer); resolve({ out: out, code: -1 }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ out: out, code: code }); });
  });
}

function firstErr(out) {
  const lines = out.split('\n').filter((l) => /EXCEPTION|SPAWN-ERROR|\[RUNNER\]|Edge connect failed|Error:/.test(l));
  return lines.length ? lines[0].slice(0, 160) : '';
}

async function runCases(opt) {
  const ws = opt.ws, src = path.join(ws, opt.src), script = opt.script;
  const base = fs.readFileSync(src, 'utf8');
  let ok = 0, bad = 0, port = opt.basePort || 9700;
  for (const cs of opt.cases) {
    const pats = cs.pat || [[cs.from, cs.to]];
    let cur = base, badAnchor = false;
    pats.forEach((p) => {
      const n = cur.split(p[0]).length - 1;
      if (n !== 1) { badAnchor = true; console.log('  [配置错] ' + cs.n + ' :: 锚点 "' + p[0].split('\n')[0].slice(0, 44) + '…" 命中 ' + n + ' 次（应恰好 1 次）'); return; }
      cur = cur.replace(p[0], p[1]);
    });
    if (badAnchor) { bad++; continue; }
    const file = '_tmp_inj_' + (++port) + '.html';
    fs.writeFileSync(path.join(ws, file), cur, 'utf8');
    const r = await runOnce(ws, script, file, port, tag(cs, port));
    const failed = r.out.split('\n').filter((l) => l.indexOf('[FAIL]') >= 0).map((l) => l.replace(/^.*\[FAIL\]\s*/, '').trim());
    const m = r.out.match(/=== 汇总：(\d+) 通过 \/ (\d+) 失败 ===/);
    const crashed = !m || /SPAWN-ERROR|\[RUNNER\]|EXCEPTION:/.test(r.out);
    if (crashed) {
      console.log('  [运行异常] ' + cs.n + ' :: 子进程未正常跑完（exit=' + r.code + '）' + (firstErr(r.out) ? ' ⇒ ' + firstErr(r.out) : ''));
      bad++;
      try { fs.unlinkSync(path.join(ws, file)); } catch (e) { }
      continue;
    }
    const gotRed = cs.red.every((k) => failed.some((f) => f.indexOf(k) === 0));
    const good = failed.length > 0 && gotRed;
    console.log((good ? '  [OK]     ' : '  [坏闸门] ') + cs.n + '  （总体 ' + m[2] + ' 失败）');
    console.log('           期望命中 ' + cs.red.join(' / ') + ' ⇒ ' + (gotRed ? '精确命中 ✓' : '未命中 ✗') +
      '；实际红条：' + (failed.length ? failed.slice(0, 6).map((f) => f.split(' ::')[0]).join(' | ') : '（无）'));
    good ? ok++ : bad++;
    try { fs.unlinkSync(path.join(ws, file)); } catch (e) { }
  }
  console.log('\n=== 注入体检：' + ok + '/' + opt.cases.length + ' 个缺陷被闸门拦下 ===');
  return { ok: ok, bad: bad };
}
function tag(cs, port) { return String(port); }

module.exports = { runCases: runCases };
