/* ============================================================================
   润野灌溉 index.html「保守式简化」等价性守门人
   ----------------------------------------------------------------------------
   作用：比较指定基线与当前页面的采样证据；通过不代表全站功能无误。分三层取证

     第 1 层  计算等价：逐场景把 compute() 的结果对象 window._r 全量摊平成
              「路径 -> 数值」字典，逐项比对（不仅是面积/管径这几个抽样字段）。
     第 2 层  输出等价：结果面板文字、管径表 HTML、二级/三级 SVG（长度+哈希+
              节点数）、材料清单（条数+总价+逐行）、数据对比区的哈希。
     第 3 层  视觉等价：全站所有元素的计算样式快照（30 个属性 × 每个元素 ×
              每个功能区）。另记录元素文档顺序，避免排序掩盖顺序变化。

   用法：
     node scripts/simplify-equivalence.cjs --baseline --baseline-file=候选文件.json   # 采集候选，不覆盖现有基线
     node scripts/simplify-equivalence.cjs              # 与 _p1/baseline.json 比对

   退出码：0 = 全部一致；1 = 出现不一致；2 = 运行异常

   反向验证（防止「永远绿的假闸门」）：
     node scripts/equivalence-compare.cjs _p1/equivalence-current/current.json
     在内存副本中注入差异；不改写原基线。
   ========================================================================= */
'use strict';
const { compareSnapshots } = require('./equivalence-compare.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const EDGE = process.env.EDGE_PATH || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));

const WS = path.resolve(__dirname, '..');
const IS_BASELINE = process.argv.includes('--baseline');
const OUT = path.join(WS, '_p1', 'equivalence-current');
fs.mkdirSync(OUT, { recursive: true });
const baselineArg = process.argv.find(a => a.startsWith('--baseline-file='));
const BASE = baselineArg ? path.resolve(baselineArg.slice('--baseline-file='.length)) : path.join(WS, '_p1', 'baseline.json');
if (IS_BASELINE && fs.existsSync(BASE)) throw Error('拒绝覆盖现有基线，请用 --baseline-file 指定新的候选文件');
if (!IS_BASELINE && !fs.existsSync(BASE)) throw Error('缺少基线：' + BASE);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fileUrl = p => 'file:///' + p.replace(/\\/g, '/');
const H = s => crypto.createHash('sha1').update(String(s), 'utf8').digest('hex').slice(0, 16);

/* ---------------- 注入页面：全量快照 ---------------- */
const SNAP = () => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  /* 摊平：把 window._r 全部数值叶子变成 路径->数值 */
  const flat = (o, p, acc) => {
    p = p || ''; acc = acc || {};
    if (o === null || o === undefined) { acc[p] = 'NULL'; return acc; }
    if (typeof o === 'number') { acc[p] = Number.isFinite(o) ? +o.toPrecision(10) : 'NaN'; return acc; }
    if (typeof o === 'string' || typeof o === 'boolean') { acc[p] = String(o); return acc; }
    if (Array.isArray(o)) { o.forEach((v, i) => flat(v, p + '[' + i + ']', acc)); return acc; }
    if (typeof o === 'object') { Object.keys(o).sort().forEach(k => flat(o[k], p ? p + '.' + k : k, acc)); return acc; }
    acc[p] = String(o); return acc;
  };

  const txt = id => { const e = document.getElementById(id); return e ? norm(e.innerText) : ''; };
  const html = id => { const e = document.getElementById(id); return e ? e.innerHTML : ''; };

  const svgInfo = (id) => {
    const e = document.getElementById(id);
    if (!e) return null;
    const s = e.innerHTML || '';
    const svg = e.querySelector('svg');
    return { len: s.length, hash: null, /*hash 在 node 侧算*/ text: s, nodes: e.querySelectorAll('*').length, svgs: e.querySelectorAll('svg').length, w: svg ? svg.getAttribute('width') : null, vb: svg ? svg.getAttribute('viewBox') : null };
  };

  const materials = () => {
    const card = document.querySelector('.materials-card');
    if (!card) return { rows: 0 };
    const rows = [...card.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => {
      const inp = td.querySelector('input');
      return norm(inp ? inp.value : td.textContent);
    }).join(' | '));
    const gt = document.querySelector('.materials-card .grand-total-val');
    return { rows: rows.length, total: gt ? norm(gt.textContent) : '', lines: rows };
  };

  const sys = () => {
    const f = document.getElementById('tlSysFrame');
    const m = document.getElementById('headModal');
  return {
    src: f ? (f.getAttribute('src') || '') : '',
    frameVisible: f ? getComputedStyle(f).display !== 'none' : false,
    modalDisplay: m ? getComputedStyle(m).display : 'absent',
    tlView: (document.getElementById('tlPipePlanSection') || {}).dataset
      ? document.getElementById('tlPipePlanSection').dataset.ryView : null,
    ppView: document.getElementById('pipePlanSection')
      ? document.getElementById('pipePlanSection').dataset.ryView : null,
    /* 系统图 iframe 内层文档（file:// 加 --allow-file-access-from-files 后可达） */
    frameDoc: (function () {
      try {
        var d = f && f.contentDocument;
        if (!d || !d.body) return null;
        return { len: d.body.innerHTML.length, svgs: d.querySelectorAll('svg').length, title: (d.title || '') };
      } catch (e) { return 'CROSS-ORIGIN'; }
    })()
  };
  };

  const fns = {};
  ['ppDownloadSVG', 'ppPrintDiagram', 'tlDownloadSVG', 'tlPrintDiagram', 'render', 'resetDefaults',
    'compute', 'computeThreeLevel', 'renderThreeLevel', 'tlAutoGenerate', 'ryShowSection', 'ryJumpToSection',
    'ppLoadPolygon', 'hmExportSVG', 'hmPrint'].forEach(n => { fns[n] = typeof window[n]; });

  return {
    r: window._r ? flat(window._r) : null,
    resultText: txt('resultPanel'),
    pipeTablesLen: html('pipeTablesSection').length,
    pipeTables: html('pipeTablesSection'),
    planBar: txt('ppPlanBar'),
    tlPlanBar: txt('tlPlanBar'),
    pp: svgInfo('ppDiagramContent'),
    tl: svgInfo('tlDiagramContent'),
    ppLastSvgLen: (window.ppState && window.ppState.lastSVG) ? window.ppState.lastSVG.length : -1,
    ppLastSvg: (window.ppState && window.ppState.lastSVG) ? window.ppState.lastSVG : '',
    materials: materials(),
    compare: { len: html('irrCompareSection').length, text: norm(document.getElementById('irrCompareSection') ? document.getElementById('irrCompareSection').innerText : '') },
    sys: sys(),
    fns
  };
};

/* ---------------- 注入页面：计算样式快照 ---------------- */
const STYLES = () => {
  const PROPS = ['display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-color', 'border-top-style', 'background-color', 'background-image',
    'color', 'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing',
    'text-align', 'opacity', 'visibility', 'transform', 'box-shadow', 'border-radius',
    'flex-direction', 'grid-template-columns', 'gap', 'overflow', 'z-index',
    'min-height', 'min-width', 'max-width', 'align-items', 'justify-content', 'white-space'];
  if (!window.__cidReady2) {
    let i = 0;
    document.querySelectorAll('body *').forEach(el => el.setAttribute('data-__sid', String(i++)));
    window.__cidReady2 = 1;
  }
  /* [v635] 元素键从「文档序号」改成「稳定签名 + 排序」。
     原因（实测）：原实现给 body * 按文档顺序编号，只要插件注册顺序抖一次
     （ry-plugin-root 里的插件面板创建时机不同 → 导航项「项目档案/案例推荐」与
     fn-more 位置互换），后面**所有**元素序号跟着平移，整段 hash 全变 ——
     208 个元素"样式不同"其实一个属性都没变，纯粹是错位。
     证据：重建基线后间隔 2 分钟立即重跑，同样 208 个差异；diff 显示
     base 的 40 号=80px 项、now 的 40 号=63.53px 的 fn-more，且 base 43=now 40。
     ⇒ 签名口径：tag#id.class 排序后比较。吸收顺序抖动，但元素增删仍会暴露
       （行数变或某签名行消失），比较的属性集合一个没少。 */
  const sig = (el) => {
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || ''))
      .trim().replace(/\s+/g, '.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const v = PROPS.map(p => cs.getPropertyValue(p)).join('~');
    out.push(sig(el) + '=' + v);
  }
  const order = [...document.querySelectorAll('body *')].map(sig).join('\n');
  out.sort();
  return { count: out.length, data: out.join('\n'), order };
};

/* ---------------- 场景定义 ---------------- */
/* 步骤类型： ['set', id, value] / ['click', selector] / ['clickText', selector, text]
             ['eval', code]      / ['section', id]     / ['wait', ms] / ['reset'] */
const SCEN = [
  { id: '01', name: '默认参数', steps: [['reset']] },
  { id: '02', name: '单区面积 45 亩', steps: [['reset'], ['set', 'fld_zoneMu', 45]] },
  { id: '03', name: '固定边长 180 m', steps: [['reset'], ['set', 'fld_zoneFixedSide', 180]] },
  { id: '04', name: '滴灌带长度 80 m', steps: [['reset'], ['set', 'fld_tapeLen', 80]] },
  { id: '05', name: '灌水器间距 0.4 m', steps: [['reset'], ['set', 'fld_emitterSpacing', 0.4]] },
  { id: '06', name: '灌水器流量 1.6 L/h', steps: [['reset'], ['set', 'fld_emitterFlow', 1.6]] },
  { id: '07', name: '水源扬程 25 m', steps: [['reset'], ['set', 'fld_lift', 25]] },
  { id: '08', name: '水泵效率 75 %', steps: [['reset'], ['set', 'fld_efficiency', 75]] },
  { id: '09a', name: '支管数量 2 根', steps: [['reset'], ['click', '#branchGroup button[data-n="2"]']] },
  { id: '09b', name: '支管数量 3 根', steps: [['reset'], ['click', '#branchGroup button[data-n="3"]']] },
  { id: '09c', name: '支管数量 4 根', steps: [['reset'], ['click', '#branchGroup button[data-n="4"]']] },
  { id: '10a', name: '单边布置', steps: [['reset'], ['click', '#layoutGroup button[data-sides="1"]']] },
  { id: '10b', name: '双边布置', steps: [['reset'], ['click', '#layoutGroup button[data-sides="2"]']] },
  {
    id: '11', name: '面积测量 → 生成二级 + 三级', steps: [
      ['reset'],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:120,y:0},{x:120,y:80},{x:0,y:80}];window.measuredPolygonSource="verify";'],
      ['eval', 'if(typeof window.ppLoadPolygon==="function")window.ppLoadPolygon();'],
      ['section', 'pipePlanSection'], ['wait', 400],
      ['click', '#ppGenerate'], ['wait', 1200]
    ]
  },
  {
    id: '12', name: '二级管路施工图', steps: [
      ['reset'], ['section', 'pipePlanSection'], ['wait', 300],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:120,y:0},{x:120,y:80},{x:0,y:80}];if(typeof window.ppLoadPolygon==="function")window.ppLoadPolygon();'],
      ['click', '#ppGenerate'], ['wait', 1200]
    ]
  },
  {
    id: '13', name: '三级管线简图', steps: [
      ['reset'], ['section', 'tlPipePlanSection'], ['wait', 300],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:150,y:0},{x:150,y:100},{x:0,y:100}];window.measuredPolygonSource="verify";'],
      ['click', '#tlAutoPipe'], ['wait', 1600]
    ]
  },
  {
    id: '14', name: '三级供水首部系统图', steps: [
      ['reset'], ['section', 'tlPipePlanSection'], ['wait', 300],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:150,y:0},{x:150,y:100},{x:0,y:100}];window.measuredPolygonSource="verify";'],
      ['click', '#tlAutoPipe'], ['wait', 1200],
      ['eval', 'if(typeof window.tlShowSysDiagram==="function")window.tlShowSysDiagram();'],
      ['wait', 2500]
    ]
  },
  {
    id: '15', name: '材料清单', steps: [
      ['reset'], ['section', 'pipePlanSection'], ['wait', 300],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:120,y:0},{x:120,y:80},{x:0,y:80}];if(typeof window.ppLoadPolygon==="function")window.ppLoadPolygon();'],
      ['click', '#ppGenerate'], ['wait', 1200],
      ['section', 'detailsSection'], ['wait', 500]
    ]
  },
  {
    id: '16', name: '数据对比', steps: [
      ['reset'], ['section', 'irrCompareSection'], ['wait', 400],
      ['eval', 'var s=document.getElementById("irrCompareSection");if(s)s.style.display="";if(typeof refreshRunyeCompare==="function")refreshRunyeCompare();'],
      ['wait', 500]
    ]
  },
  {
    id: '17', name: '下载 / 打印 入口', steps: [
      ['reset'], ['section', 'pipePlanSection'], ['wait', 300],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:120,y:0},{x:120,y:80},{x:0,y:80}];if(typeof window.ppLoadPolygon==="function")window.ppLoadPolygon();'],
      ['click', '#ppGenerate'], ['wait', 1200],
      ['section', 'tlPipePlanSection'], ['wait', 300],
      ['eval', 'window.measuredPolygon=[{x:0,y:0},{x:150,y:0},{x:150,y:100},{x:0,y:100}];'],
      ['click', '#tlAutoPipe'], ['wait', 1200],
      ['eval', '["ppDownload","ppPrint","tlDownload","tlPrint"].forEach(function(id){var e=document.getElementById(id);if(e){window["__vis_"+id]=getComputedStyle(e).display;}});'],
      ['wait', 200]
    ]
  }
];

/* ---------------- 执行 ---------------- */
async function runStep(page, st) {
  const [kind, a, b] = st;
  if (kind === 'reset') {
    await page.evaluate(() => {
      if (typeof window.resetDefaults === 'function') window.resetDefaults();
      if (typeof window.render === 'function') window.render();
    });
    await sleep(250);
  } else if (kind === 'set') {
    await page.evaluate((id, v) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('no input ' + id);
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, a, b);
    await sleep(320);
  } else if (kind === 'click') {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('no element ' + sel);
      el.click();
    }, a);
    await sleep(320);
  } else if (kind === 'clickText') {
    await page.evaluate((sel, t) => {
      const list = [...document.querySelectorAll(sel)];
      const el = list.find(e => (e.textContent || '').indexOf(t) >= 0) || list[list.length - 1];
      if (!el) throw new Error('no tab ' + sel + ' / ' + t);
      el.click();
    }, a, b);
    await sleep(320);
  } else if (kind === 'eval') {
    await page.evaluate(new Function(a));
    await sleep(120);
  } else if (kind === 'section') {
    await page.evaluate((id) => {
      if (typeof window.ryJumpToSection === 'function') window.ryJumpToSection(id);
      else if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById(id), null);
    }, a);
    await sleep(320);
  } else if (kind === 'wait') {
    await sleep(a);
  }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
    defaultViewport: { width: 1600, height: 1000 } });
  try {
  const errs = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text().slice(0, 200)); });
  await page.goto(fileUrl(path.join(WS, 'index.html')), { waitUntil: 'networkidle0' });
  await sleep(1500);

  const scenes = {};
  for (const s of SCEN) {
    const e0 = errs.length;
    try {
      for (const st of s.steps) await runStep(page, st);
      const snap = await page.evaluate(SNAP);
      // 把 SVG 全文换成哈希，减小体积
      const pack = (o) => { if (!o) return null; const t = o.text || ''; return { len: o.len, hash: H(t), nodes: o.nodes, svgs: o.svgs, w: o.w, vb: o.vb }; };
      scenes[s.id] = {
        name: s.name,
        r: snap.r,
        resultText: snap.resultText,
        pipeTablesLen: snap.pipeTablesLen, pipeTablesHash: H(snap.pipeTables),
        planBar: snap.planBar, tlPlanBar: snap.tlPlanBar,
        pp: pack(snap.pp), tl: pack(snap.tl),
        ppLastSvgLen: snap.ppLastSvgLen, ppLastSvgHash: H(snap.ppLastSvg),
        materials: snap.materials,
        compare: { len: snap.compare.len, hash: H(snap.compare.text) },
        sys: snap.sys,
        fns: snap.fns,
        vis: await page.evaluate(() => ({ ppDownload: window.__vis_ppDownload || null, ppPrint: window.__vis_ppPrint || null, tlDownload: window.__vis_tlDownload || null, tlPrint: window.__vis_tlPrint || null })),
        newErrors: errs.slice(e0)
      };
      console.log('  · ' + s.id + ' ' + s.name + '  ok');
    } catch (e) {
      scenes[s.id] = { name: s.name, ERROR: String(e.message) };
      console.log('  · ' + s.id + ' ' + s.name + '  ✗ ' + e.message);
    }
  }

  /* [v635] 「会话态徽标」归一化（下面对每个功能区各做一次）。
     实测：只剩 2 个元素不同 —— span#ryUndoBadge 宽 76.17px vs 0px，以及
     span.ry-st-spacer 1203.11px vs 1279.28px（正好差 76px，同一个原因：spacer 是
     flex 占位，徽标有字就窄 76px、没字就宽 76px）。徽标文字取决于撤销栈深度
     （场景跑到哪一步栈里有几条记录），属会话态，不是布局回归；基线与复跑的栈深度
     不可能保证一致（window.RyUndo 也没有清空接口）。
     ⇒ 统一设成固定文本（**不置空**：保留非零宽度，徽标自身的 padding/字号被改
       仍然量得出来）。 */
  /* ---- 计算样式快照（逐功能区） ---- */
  const secIds = await page.evaluate(() =>
    [...document.querySelectorAll('main > .ry-sec, section[id$="Section"]')].map(e => e.id).filter(Boolean));
  const styles = {};
  for (const id of secIds) {
    await page.evaluate((sid) => {
      if (typeof window.ryJumpToSection === 'function') window.ryJumpToSection(sid);
      else if (typeof window.ryShowSection === 'function') window.ryShowSection(document.getElementById(sid), null);
    }, id);
    await sleep(600);
    /* [v635] 每次切区后都要重新归一化 —— 切区会重渲染状态栏，徽标文字被刷回去，
       只在循环外做一次不够（实测 4 个功能区各剩 2 个差异，都是这对元素）。 */
    await page.evaluate(() => {
      const b = document.getElementById('ryUndoBadge');
      if (b) { b.textContent = '撤销'; void document.body.offsetHeight; }
    });
    const st = await page.evaluate(STYLES);
    styles[id] = { count: st.count, hash: H(st.data), orderHash: H(st.order) };
    fs.writeFileSync(path.join(OUT, 'styles_' + id + (IS_BASELINE ? '_base' : '_now') + '.txt'), st.data, 'utf8');
    /* EQ_MAP=1 时额外落一份「sid → 元素身份」映射（只写文件、不进 data/hash，故不影响基线口径）。
       用途：样式快照里只有「第 N 个元素」的样式元组，定位不到是哪个元素；有了这份映射才能
       把差异行对上具体元素（2026-09-19 v63 判「宽度差异」性质时加的）。 */
    if (process.env.EQ_MAP) {
      const map = await page.evaluate(() => [...document.querySelectorAll('body *')].map((el, i) =>
        i + '|' + el.tagName.toLowerCase() + '|' + (el.id || '') + '|'
        + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : (el.className || '')).slice(0, 48) + '|'
        + Math.round(el.getBoundingClientRect().width * 100) / 100 + '|' + el.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)));
      fs.writeFileSync(path.join(OUT, 'sidmap_' + id + '.txt'), map.join('\n'), 'utf8');
    }
  }

  const payload = { schemaVersion: 2, when: new Date().toISOString(), workspace: WS, errs, scenes, styles };
  fs.writeFileSync(path.join(OUT, 'current.json'), JSON.stringify(payload, null, 1), 'utf8');

  if (IS_BASELINE) {
    const invalid = compareSnapshots(payload, payload, SCEN.map(s => s.id));
    if (invalid.length) throw Error('基线采集无效：' + invalid.join('; '));
    fs.writeFileSync(BASE, JSON.stringify(payload, null, 1), { encoding: 'utf8', flag: 'wx' });
    console.log('\n基线已写入：' + BASE);
    console.log('场景 ' + Object.keys(scenes).length + ' 个 / 功能区 ' + secIds.length + ' 个');
    console.log('页面错误：' + (errs.length ? errs.join(' | ') : '无'));
    return;
  }

  /* ---- 比对 ---- */

  const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));

  const diffs = compareSnapshots(base, payload, SCEN.map(s => s.id));

  const out = [];
  out.push('================= 简化等价性比对 =================');
  out.push('目标：' + WS);
  out.push('基线时间：' + base.when);
  out.push('场景数：' + Object.keys(base.scenes).length + ' / 功能区：' + Object.keys(base.styles).length);
  out.push('');
  if (!diffs.length) {
    out.push('全部一致：计算对象、结果文字、管径表、二级/三级 SVG、材料清单、数据对比、系统图、全局函数、计算样式、页面错误 —— 0 处差异。');
  } else {
    out.push('发现 ' + diffs.length + ' 处差异：');
    diffs.forEach(d => out.push('  ✗ ' + d));
  }
  // 每个功能区的样式文件差异（给出可读的前几条）
  for (const id of Object.keys(base.styles)) {
    const pa = path.join(OUT, 'styles_' + id + '_base.txt'), pb = path.join(OUT, 'styles_' + id + '_now.txt');
    if (!fs.existsSync(pa) || !fs.existsSync(pb)) continue;
    const la = fs.readFileSync(pa, 'utf8').split('\n'), lb = fs.readFileSync(pb, 'utf8').split('\n');
    let n = 0;
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) { n++; if (n <= 5) out.push('  [样式差异] ' + id + ' 第' + i + '个元素\n     旧: ' + String(la[i]).slice(0, 120) + '\n     新: ' + String(lb[i]).slice(0, 120)); }
    }
    if (n) out.push('  → ' + id + ' 共 ' + n + ' 个元素计算样式不同');
  }
  out.push('');
  out.push(diffs.length ? '== 结论：存在不一致 ==' : '== 结论：完全一致 ==');
  const txt = out.join('\n');
  fs.writeFileSync(path.join(OUT, 'equivalence_report.txt'), txt, 'utf8');
  console.log(txt);

  process.exitCode = diffs.length ? 1 : 0;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 2; });
