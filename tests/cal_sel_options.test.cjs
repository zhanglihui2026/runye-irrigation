/* tests/cal_sel_options.test.cjs —— v970「管径选择全档位 + 流速提示」纯函数锁
   ═══════════════════════════════════════════════════════════════════════════
   背景：水力结果面板 总管/主管/支管「改径重算」下拉原为设计值 ±3 档，支管
   设计 Ø140 时最小只能选 Ø90，用户要求能选更小（流速偏高可接受）。
   v970 把 tlRefreshCalSels 的选项生成抽成纯函数 tlCalSelOptions：
   选项 = PE_OD_SERIES 全档位，设计值标注「设计」，其余按当前流量标注实际流速。

   本锁（vm 提取，模式同 tests/partition_query.test.cjs）：
     A. 全档位 18 项、OD 升序、value 与 PE_OD_SERIES 一致
     B. 设计值档标注「设计」且不带流速后缀；唯一
     C. 有流量时非设计档带「· v m/s」后缀，数值与 peInnerDiam 手算一致
     D. 无流量/非法流量时非设计档不带流速后缀
     E. flow=0、flow=Infinity、NaN 不产生「NaN」「Infinity」字样
   用法：node tests/cal_sel_options.test.cjs   exit 0=全过 / 1=有失败
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.join(__dirname, '..', 'mod', 'inline-09.js'), 'utf8');
function extract(s, name) {
  const start = s.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' 缺失');
  const begin = s.indexOf('{', start);
  let depth = 1, i = begin + 1;
  while (depth && i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i++; i < s.length; i++) {
        if (s[i] === '\\') i++;
        else if (s[i] === quote) { i++; break; }
      }
    } else if (s.slice(i, i + 2) === '/*') i = s.indexOf('*/', i + 2) + 2;
    else if (s.slice(i, i + 2) === '//') i = s.indexOf('\n', i + 2) + 1;
    else { if (c === '{') depth++; if (c === '}') depth--; i++; }
  }
  assert.equal(depth, 0, name + ' 函数提取失败');
  return s.slice(start, i);
}

const RyDesignCore = require('../hydraulic-calc/design-core.js');
const ctx = {
  PE_OD_SERIES: [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500],
  SDR: 13.6,
  RyDesignCore: RyDesignCore
};
vm.createContext(ctx);
vm.runInContext(extract(src, 'peInnerDiam') + '\n' + extract(src, 'tlCalSelOptions'), ctx);

const results = [];
function check(name, fn) {
  try { fn(); results.push(true); console.log('[PASS] ' + name); }
  catch (e) { results.push(false); console.log('[FAIL] ' + name + '  :: ' + e.message); }
}
const vOf = (flow, od) => flow / 3600 / (Math.PI * Math.pow(RyDesignCore.inner(od, 13.6) / 1000, 2) / 4);

check('A1 全档位 18 项、OD 升序、value 一致', () => {
  const o = ctx.tlCalSelOptions(140, null, 9);
  assert.equal(o.length, 18);
  assert.deepEqual(o.map(x => x.od), ctx.PE_OD_SERIES);
});
check('B1 设计值档唯一且标注「设计」、不带流速', () => {
  const o = ctx.tlCalSelOptions(140, null, 9);
  const d = o.filter(x => /设计/.test(x.label));
  assert.equal(d.length, 1);
  assert.equal(d[0].od, 140);
  assert.ok(!/m\/s/.test(d[0].label), '设计档不混流速：' + d[0].label);
});
check('C1 非设计档带流速后缀且数值正确（支管 9 m³/h @ Ø63）', () => {
  const o = ctx.tlCalSelOptions(140, null, 9);
  const x = o.find(x => x.od === 63);
  assert.match(x.label, / · /);
  assert.ok(x.label.includes(vOf(9, 63).toFixed(2) + ' m/s'), x.label);
});
check('C2 Ø50 档同样带流速（用户可一路选到最小档）', () => {
  const o = ctx.tlCalSelOptions(140, null, 9);
  const x = o.find(x => x.od === 50);
  assert.ok(x.label.includes(vOf(9, 50).toFixed(2) + ' m/s'), x.label);
});
check('D1 无流量：非设计档不带流速后缀', () => {
  const o = ctx.tlCalSelOptions(140, null, null);
  o.filter(x => x.od !== 140).forEach(x => assert.ok(!/m\/s/.test(x.label), x.label));
});
check('E1 flow=0/Infinity/NaN 不产生 NaN/Infinity 字样', () => {
  [0, Infinity, NaN].forEach(f => {
    ctx.tlCalSelOptions(140, null, f).forEach(x => {
      assert.ok(!/NaN|Infinity/.test(x.label), 'flow=' + f + ' -> ' + x.label);
    });
  });
});

/* ── [v972] maxOd 上限：支管档位必须比主管细 ── */
check('F1 maxOd=200：≥200 的档全部不出现，最大档 180', () => {
  const o = ctx.tlCalSelOptions(140, null, 9, 200);
  assert.ok(o.every(x => x.od < 200), '出现 ≥200 档：' + o.map(x => x.od).join(','));
  assert.equal(o[o.length - 1].od, 180);
  assert.equal(o.length, 9); // 50..180 共 9 档（桩序列含 125）
});
check('F2 maxOd=200：设计档 Ø140 仍在列且唯一标注「设计」', () => {
  const o = ctx.tlCalSelOptions(140, null, 9, 200);
  const d = o.filter(x => /设计/.test(x.label));
  assert.equal(d.length, 1);
  assert.equal(d[0].od, 140);
});
check('F3 设计档 ≥ maxOd 时例外保留（防下拉无选中值）', () => {
  const o = ctx.tlCalSelOptions(250, null, null, 200);
  assert.ok(o.some(x => x.od === 250 && /设计/.test(x.label)), '设计档 250 被过滤掉了');
  assert.ok(o.every(x => x.od < 200 || x.od === 250), o.map(x => x.od).join(','));
});
check('F4 maxOd 极小：退化为仅设计档，不返回空数组', () => {
  const o = ctx.tlCalSelOptions(50, null, null, 40);
  assert.deepEqual(o.map(x => x.od), [50]);
});
check('F5 不传 maxOd：行为与 v970 全档位完全一致', () => {
  const o = ctx.tlCalSelOptions(140, null, 9, undefined);
  assert.equal(o.length, 18);
  assert.deepEqual(o.map(x => x.od), ctx.PE_OD_SERIES);
});

const ok = results.length > 0 && results.every(Boolean);
console.log('\n' + (ok ? '== 全部通过 ==' : '== 存在失败项 =='));
process.exit(ok ? 0 : 1);
