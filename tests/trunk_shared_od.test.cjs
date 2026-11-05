'use strict';
/* tests/trunk_shared_od.test.cjs —— 总管口径「全项目一个数」（v967，用户 2026-11-05 拍板）
 *
 * 用户原话（决定性的一句）：
 *   「Ø160 和 Ø180 这两档之间，有一个『就近分界流量』：88.25 m³/h…87.48 差 0.77 没跨过去。
 *     这个显然是不对的，不符合实际情况，其他 7 个区都按照 180 选择的总管，8 区难道我还要再
 *     单独接一个吸管吗？那其他分区的 180 的管道怎么办？我扔了？这显然是不经济的，
 *     这要用一个原则来判断：**每个分区的管径都一样才行，用流量最大那个分区/联合流量最大分区
 *     确定总管管径**。」
 *
 * v964 只把台阶算清楚并写进卡片（不改数字），v967 才按这条原则改口径：
 *   总管是**一条物理管**，全项目只能有一个口径，由 `RyTrunkSize.suggest()` 按最不利组选一次；
 *   流量仍逐组（管里当时走多少水就是多少），只有管径共享。
 *   主管仍是每区一根、按本区流量选（物理上本来就各不相同，不在本次口径内）。
 *
 * 这个文件钉住四件事：
 *   ① 数值：8 个单区组 ⇒ 共享口径 Ø180（最不利组 97.2 m³/h 定的），不是第 8 区的 Ø160；
 *   ② 病根：同一批数据**逐组**看，第 8 区确实是 Ø160 —— 证明差异来源是「按组现选」，
 *      而不是取数错、面积错（谁把逐组选档改回来，② 会绿、① 会红）；
 *   ③ 接线（真执行，不是正则）：inline-09 里 `tlResolveGroups` / `tlSharedTrunkPick`
 *      的分组还原与共享口径选择；
 *   ④ 两条计算链（估算 / 逐区路径）都吃同一个共享口径，且共享口径细于下游时必须退回逐组，
 *      不许出现「总管比它供的主管还细」。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const rawInline = fs.readFileSync(path.join(ROOT, 'mod', 'inline-09.js'), 'utf8');
const rawDemo = fs.readFileSync(path.join(ROOT, 'mod', 'map-flow-demo.js'), 'utf8');
const rawSize = fs.readFileSync(path.join(ROOT, 'mod', 'trunk-size.js'), 'utf8');

const Core = require(path.join(ROOT, 'hydraulic-calc', 'design-core.js'));
const SDR = 13.6;
const OD = [50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500];
const MAIN_PIPE_MIN_OD = 90;

const T = new Function('window', rawSize + '\nreturn window.RyTrunkSize;')({});
const sel = (Q, tv, minOd, maxOd) => Core.selectPipe(Q, tv, OD, SDR, minOd, maxOd === undefined ? Infinity : maxOd);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}：得 ${a}，期望 ${b}±${tol}`);

/* ── 现场数据（与 AGENT_HANDOFF §26.169 的逐区表同一批）──────────────────────────
   滴灌参数 tapeSpacing=0.8 / emitterSpacing=0.3 / emitterFlow=1.0 L/h
   ⇒ 单位面积流量 = 1/1000/0.8/0.3 = 0.00416667 m³/h/m² ⇒ 面积 = Q × 240（正好整数）。
   1~7 区 34.1~35.1 亩 ⇒ Q 94.4~97.2；第 8 区 31.6 亩（最小）⇒ Q 87.48。 */
const AREAS = [97.2, 96.4, 95.9, 95.5, 95.0, 94.5, 94.4, 87.48].map((q) => q * 240);
const R = {
  zoneAreas: AREAS, tapeSpacing: 0.8, emitterSpacing: 0.3, emitterFlow: 1.0,
  targetV: 1.5, zoneCount: 1, mainPipe: { od: 110 }, branchPipe: { od: 75 }
};
const GROUPS = AREAS.map((_, i) => [i]);

/* 把 inline-09 里那两个真函数原样切出来执行（不是重新实现一遍，也不是只做正则匹配） */
const sharedSrc = (() => {
  const i = rawInline.indexOf('function tlResolveGroups(');
  assert.ok(i >= 0, 'inline-09.js 里必须还有 tlResolveGroups（v967 新增）');
  const j = rawInline.indexOf('\n/* [v950] 没有「逐分区路径」', i);
  assert.ok(j > i, '找不到 tlSharedTrunkPick 之后的注释边界（切片会吃掉别的函数）');
  const body = rawInline.slice(i, j);
  assert.ok(body.indexOf('function tlSharedTrunkPick(') > 0, '两个函数必须挨在一起（v967）');
  return body;
})();
const M = new Function('window', 'MAIN_PIPE_MIN_OD', 'selectPipe',
  sharedSrc + '\nreturn { tlResolveGroups: tlResolveGroups, tlSharedTrunkPick: tlSharedTrunkPick };');
const mkWin = (withSize) => (withSize ? { RyTrunkSize: T } : {});
const mkMod = (win) => M(win, MAIN_PIPE_MIN_OD, sel);

/* ① 共享口径：全项目一个数，由最不利组定 */
test('① 8 个单区组 ⇒ 共享口径 Ø180（最不利组 97.2 m³/h 定），不是第 8 区的 Ø160', () => {
  const mod = mkMod(mkWin(true));
  const pick = mod.tlSharedTrunkPick(AREAS, GROUPS, R);
  assert.ok(pick && pick.ok === true, '应给出共享口径');
  assert.equal(pick.od, 180, '共享总管必须是 Ø180（流量最大的那个单区组定的）');
  assert.equal(pick.groupIndex, 0, '定口径的组 = 流量最大的组（第 1 区 97.2 m³/h）');
  near(pick.flow, 97.2, 1e-6, '定口径用的流量');
  near(pick.velocity, 97.2 / 3600 / (Math.PI * Math.pow(Core.inner(180, SDR) / 1000, 2) / 4), 1e-6,
    '口径处的流速按最不利组流量算');
  /* 关键：共享值对每个组都是同一个数 —— 这正是用户要的「每个分区管径都一样」 */
  const perGroup = GROUPS.map((_, i) => mod.tlSharedTrunkPick(AREAS, GROUPS, R).od);
  assert.deepEqual([...new Set(perGroup)], [180], '不管当前演示哪一组，总管口径都必须还是 Ø180');
});

/* ② 病根对照：逐组选档就会分出 160/180 两种口径 */
test('② 病根：逐组选档时第 8 区确实被钉在 Ø160（差异来源=按组现选，不是取数错）', () => {
  const per = GROUPS.map((g, i) => T.suggest({
    zoneAreas: AREAS, groups: GROUPS, groupIndex: i,
    tapeSpacing: R.tapeSpacing, emitterSpacing: R.emitterSpacing, emitterFlow: R.emitterFlow,
    targetV: R.targetV, mainOd: R.mainPipe.od, branchOd: R.branchPipe.od,
    minOd: MAIN_PIPE_MIN_OD, selectPipe: sel
  }));
  assert.deepEqual(per.slice(0, 7).map((p) => p.od), [180, 180, 180, 180, 180, 180, 180], '1~7 区按本组流量都是 Ø180');
  assert.equal(per[7].od, 160, '第 8 区（31.6 亩 / 87.48 m³/h）按本组流量就是 Ø160');
  assert.equal(per[7].groupIndex, 7);
  /* 一带而过的那 0.77 m³/h：分界 88.2488，第 8 区 87.48 */
  near(per[7].velocity, 1.6613, 0.001, 'Ø160 下流速 1.66 m/s（目标 1.5）');
  assert.ok(per[7].flow < 88.2488 && 88.2488 - per[7].flow < 0.8, '与分界的距离不到 0.8 m³/h');
});

/* ③ 分组还原：手动组优先，否则 floor(zi / zoneCount)（与 map-flow-demo 的 groupOf 同口径） */
test('③ tlResolveGroups：手动组优先 / 否则按 zoneCount 均分', () => {
  const mod = mkMod(mkWin(true));
  const auto1 = mod.tlResolveGroups(AREAS, { zoneCount: 1 });
  assert.deepEqual(auto1, [[0], [1], [2], [3], [4], [5], [6], [7]], 'zoneCount=1 ⇒ 8 个单区组');
  const auto4 = mod.tlResolveGroups(AREAS, { zoneCount: 4 });
  assert.deepEqual(auto4, [[0, 1, 2, 3], [4, 5, 6, 7]], 'zoneCount=4 ⇒ 2 组，每组 4 区');
  /* 手动组优先：即使 zoneCount 是 1，也照手动组来 */
  const win2 = { RyTrunkSize: T, tlManualGroups: [[0, 1], [2, 3, 4, 5], [6, 7]] };
  const manual = mkMod(win2).tlResolveGroups(AREAS, { zoneCount: 1 });
  assert.deepEqual(manual, [[0, 1], [2, 3, 4, 5], [6, 7]], '手动组必须优先于均分');
  /* 空组要被滤掉（否则 suggest 会按空组算出一个 0 流量的「组」） */
  const win3 = { RyTrunkSize: T, tlManualGroups: [[0, 1], [], [2]] };
  assert.deepEqual(mkMod(win3).tlResolveGroups(AREAS, { zoneCount: 1 }), [[0, 1], [2]], '空组必须滤掉');
});

/* ④ 取不到就明说取不到：不猜、不补 0（补 0 会把总管选细，看起来算出其实算错） */
test('④ 缺模块 / 缺面积 / 缺滴灌参数 ⇒ null，不返回一个猜出来的口径', () => {
  const noSize = mkMod(mkWin(false));
  assert.equal(noSize.tlSharedTrunkPick(AREAS, GROUPS, R), null, 'RyTrunkSize 未加载 ⇒ null');
  const mod = mkMod(mkWin(true));
  assert.equal(mod.tlSharedTrunkPick([], GROUPS, R), null, '没有逐区面积 ⇒ null');
  assert.equal(mod.tlSharedTrunkPick(AREAS, [], R), null, '没有分组 ⇒ null');
  const noDrip = Object.assign({}, R, { tapeSpacing: 0 });
  assert.equal(mod.tlSharedTrunkPick(AREAS, GROUPS, noDrip), null, '缺滴灌参数 ⇒ null');
  const allZero = mod.tlSharedTrunkPick(AREAS.map(() => 0), GROUPS, R);
  assert.equal(allZero, null, '面积全为 0 ⇒ 合流算不出，必须 null 而不是 Ø90');
});

/* ⑤ 接线：两条计算链都吃同一个共享口径 */
test('⑤ 估算链与路径链都用共享口径（不是各自拿本组流量现选）', () => {
  const est = (() => {
    const i = rawInline.indexOf('function tlEstimateGroupHead(');
    const j = rawInline.indexOf('\nwindow.tlMapGroupHydraulicsOf', i);
    return rawInline.slice(i, j);
  })();
  assert.ok(/function tlEstimateGroupHead\(r, zoneIndexes, areaOverride, sharedPick\)/.test(est),
    '估算链必须接 sharedPick 入参（否则地图卡片又算出第二个总管口径）');
  assert.ok(/selectPipe\(qGroup, r\.targetV, sharedOd, sharedOd\)/.test(est),
    '共享模式下必须只取该档（min=max=sharedOd），流速按本组流量算');
  assert.ok(/if \(sharedOd && sharedOd < downstreamMinOd\) sharedOd = 0;/.test(est),
    '共享口径细于本组下游管时必须退回逐组选档（不许缩颈）');
  assert.ok(/if \(!trunkPick\) sharedOd = 0;/.test(est),
    '取不到该档时要退回逐组，不能留一个没有 od/id 的「共享总管」');
  assert.ok(/var frontStep = sharedOd \? null : stepOf\(qGroup, frontLen, trunkPick\);/.test(est),
    '共享口径下总管不会「被钉在细档」，不许再报总管台阶（报出来只会误导）');
  assert.ok(/shared: !!sharedOd/.test(est) && /sharedFlow:/.test(est), 'trunkAdvice 必须回传 shared/sharedFlow');
  assert.ok(/segments:/.test(est), 'tierNote 必须带 segments，卡片才能分段说人话');

  const map = (() => {
    const i = rawInline.indexOf('window.tlMapGroupHydraulicsOf');
    return rawInline.slice(i, rawInline.indexOf('\nfunction ', i + 40) > 0 ? rawInline.indexOf('\nfunction ', i + 40) : i + 8000);
  })();
  assert.ok(/var sharedPick = tlSharedTrunkPick\(areaList, allGroups, r\);/.test(map),
    '路径链必须也调 tlSharedTrunkPick');
  assert.ok(/groups: \[members\]/.test(map) && /frontOd: trunkPick \? trunkPick\.od : \(sharedOd \|\| r\.frontPipe\.od\)/.test(map),
    '路径链的 frontOd 必须走共享口径');
  assert.ok(/opts && Array\.isArray\(opts\.groups\)/.test(map), 'opts.groups 优先（地图端自己的分组才是权威）');
});

/* ⑥ 卡片：口径文案不能再出现「每区各算一个总管」，也不能再建议「为该区换总管」 */
test('⑥ 地图卡片：声明统一口径、传全部组、不再按 groupIndex 算总管', () => {
  assert.ok(/tlMapGroupHydraulicsOf\(memberIndexes,\{zoneAreas:_za,groups:gsAll\}\)/.test(rawDemo),
    'updateGroupInfo 必须把地图端全部轮灌组递进去');
  assert.ok(/groups:gsAll/.test(rawDemo) && !/groupIndex:g\b/.test(rawDemo),
    '反推兜底不许再传 groupIndex（那是「每区各算一个总管」的做法）');
  assert.ok(/项目统一总管：/.test(rawDemo), '卡片要明说这是全项目统一口径');
  assert.ok(/口径按<b>最不利组<\/b>/.test(rawDemo), '卡片要写清口径是按最不利组定的');
  /* [v976] 主管也改为共享段复核取大（用户 2026-11-05 拍板：「6、7区共用的管道应该
     取大的计算值，以此类推，后台自动复核、无开关」），卡片文案同步。 */
  assert.ok(/总管为全项目共享口径；主管按共享段最大流量后台复核取大/.test(rawDemo),
    '「估算口径」行要说明主管按共享段最大流量后台复核取大（v976）');
  assert.ok(/支管按本区流量选档/.test(rawDemo),
    '「估算口径」行要说明支管仍按本区流量选档');
  assert.ok(/var shEst=\(loss\.trunkAdvice&&loss\.trunkAdvice\.shared\)===true;/.test(rawDemo),
    '「估算口径」行必须按 shared 分支措辞（共享时只说明主管/支管逐区选档）');
  assert.equal(/该区按 Ø.\{0,20\}施工则扬程约/.test(rawDemo), false,
    '不许再建议「该区按 Ø… 施工」（总管一根管，为一区换整根管正是被否掉的做法）');
  assert.ok(/var seg=tn\.segments\|\|'main';/.test(rawDemo), '卡片要按 segments 分段措辞');
  assert.ok(/总管只此一根、不随单区放大/.test(rawDemo), '涉及总管时必须说清「不随单区放大」');
});

/* ⑦ 反向锁：tierNote 只是说明，不许顶掉估算出来的 head / totalLoss */
test('⑦ tierNote 不顶掉 head/totalLoss（估算口径仍是那一套三段公式）', () => {
  const est = (() => {
    const i = rawInline.indexOf('function tlEstimateGroupHead(');
    const j = rawInline.indexOf('\nwindow.tlMapGroupHydraulicsOf', i);
    return rawInline.slice(i, j);
  })();
  assert.ok(/head: worst\.head/.test(est), '总扬程必须仍是 worst.head（最不利区）');
  assert.ok(/totalLoss: worst\.totalLoss/.test(est), '总损失必须仍是 worst.totalLoss');
  assert.ok(/tierNote: tierNote/.test(est) && /head: altHead/.test(est),
    'altHead 只许出现在 tierNote 里当说明');
  assert.ok(/MARGIN_HEAD/.test(est) && /SAFETY_FACTOR/.test(est),
    '富余水头与安全系数仍在合计之后另加');
});
