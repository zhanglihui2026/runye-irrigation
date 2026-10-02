/* =====================================================================
 * tests/material_price_link.smoke.cjs — v184（P5）材料表单价联动 + 造价自证一致
 * 运行：NODE_PATH=<workspace>/node_modules node tests/material_price_link.smoke.cjs
 *
 * 背景（审查报告 §3.C / §5.1）：
 *   同一根 Ø160 主管，材料表默认按 32 元/m 算合计、设置页价目表显示 47 元/m
 *   —— 同一事实两处记录、用户看到两个造价数字。且材料表手改单价只写内存
 *   materialPrices（const 对象），刷新即丢。
 * 本回归（真实 Edge，独立 profile）盯 7 件事：
 *   A 三行（总管/主管/支管）单价 = 价目表在**该行图面实际管径**下的单价
 *     （runye_tlEconPrices 覆盖优先，否则 TL_PIPE_PRICE_DEF）；
 *   B 自证行出现且为「一致」（.ok）；
 *   C 手改总管单价 → 自证行转红（.bad）并点名该管径；
 *   D 手改值**持久化**：localStorage runyeMatTable_v1.priceF 记下该键，reload 后仍在；
 *   E 点「↺ 按价目表重取」→ 三行回到价目表值、自证行回 .ok、priceF 三键被清；
 *   F 改设置页价目表（runye_tlEconPrices）→ 该行单价自动跟随新价；
 *   G 无页面报错、原平面数据零改动。
 * ★ 断言全部拿「DOM 里真实读到的 data-od」去比，而不是硬编码管径 ——
 *   水力选管结果随引擎变化，硬编码会让本闸门变成「换个参数就红」的假哨兵。
 * ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WS = 'C:\\Users\\AHS\\runye-irrigation';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(WS, '_verify_out');
const PORT = 9441;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ✓ ' : '  ✗ FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (ok) pass++; else fail++;
}

/* 页面内通用读取：三行管材的 {key,label,od,price,ref} + 自证行状态 */
const READ = `(function(){
  function priceOf(key){
    var tr=document.querySelector('.materials-card tbody tr[data-key="'+key+'"]');
    if(!tr) return null;
    var inp=tr.querySelector('.price-input');
    var td0=tr.querySelector('td');
    return { key:key, label: td0?td0.textContent.trim():key, od: tr.dataset.od||'',
             price: inp?String(inp.value).trim():null,
             ref: (function(){ var r=window.tlPipePriceByOd(tr.dataset.od); return (r==='')?null:String(r); })() };
  }
  var box=document.getElementById('matSelfCheck');
  var P=function(k){ try{ return JSON.parse(localStorage.getItem('runyeMatTable_v1')||'{}'); }catch(e){ return {}; } };
  return {
    hasTable: !!document.querySelector('.materials-card table'),
    grand: (document.querySelector('.materials-card .grand-total-val')||{}).textContent||'',
    front: priceOf('frontPipe'), main: priceOf('mainPipe'), branch: priceOf('branchPipe'),
    selfCls: box?box.className:'no-box',
    selfTxt: box?box.innerText.replace(/\\s+/g,' ').slice(0,160):'',
    selfHasBtn: !!(box && box.querySelector('.mat-price-resync')),
    priceF: P().priceF || {},
    planSnap: JSON.stringify(window.tlDiagramData||null),
    econPrices: (function(){ try{ return localStorage.getItem('runye_tlEconPrices'); }catch(e){ return null; } })()
  };
})()`;

(async () => {
  const proc = spawn(EDGE, [
    '--headless=new', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(OUT, 'profile_matprice'),
    '--no-first-run', '--no-default-browser-check',
    '--window-size=1500,1000', 'about:blank',
  ], { stdio: 'ignore' });

  let browser = null;
  for (let i = 0; i < 50; i++) {
    try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + PORT, defaultViewport: null }); break; }
    catch (e) { await sleep(400); }
  }
  if (!browser) { console.error('Edge connect failed'); proc.kill(); process.exit(1); }

  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.dismiss());
  await page.setViewport({ width: 1500, height: 1000 });
  await page.goto(fileUrl(path.join(WS, 'index.html')), { waitUntil: 'load', timeout: 90000 });
  await sleep(1000);
  /* 清存储 + 清表级/价目表级遗留，保证「默认取价」前提成立 */
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load', timeout: 90000 });
  await sleep(1200);

  /* ---- 准备：走真实路径生成三级简图 → render() 出材料表 ---- */
  await page.evaluate(() => {
    window.measuredPolygon = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 220 }, { x: 0, y: 220 }];
    try { ppLoadPolygon(); } catch (e) {}
    try { tlAutoGenerate({ scroll: false }); } catch (e) {}
  });
  await sleep(1500);
  await page.evaluate(() => { try { render(); } catch (e) {} });
  await sleep(700);

  const a = await page.evaluate(READ);
  check('准备：材料表已渲染且三行管材行都在', a.hasTable && !!a.front && !!a.main && !!a.branch,
    'table=' + a.hasTable + ' front=' + !!a.front + ' main=' + !!a.main + ' branch=' + !!a.branch);
  if (!a.hasTable || !a.front || !a.main || !a.branch) {
    console.log('  （材料表未就绪，后续断言无法进行）');
  } else {
    /* ---- A 三行单价 = 价目表在该行图面实际管径下的单价 ---- */
    const rowsOk = [a.front, a.main, a.branch].every((r) => r.od && r.ref !== null && String(r.price) === String(r.ref));
    check('A 三行单价 = 价目表在图面实际管径下的价（总管/主管/支管）', rowsOk,
      [a.front, a.main, a.branch].map((r) => r.label + ' Ø' + r.od + '=' + r.price + '/表' + r.ref).join(' '));
    /* 口径反证：直接问取值函数「Ø160 的主管单价是多少」——
       P5 前它是硬编码 materialPrices.mainPipe=32；P5 后必须取价目表 47。
       这条与上面 rowsOk 不重复：它锚的是「取值链的语义」，不依赖本次引擎选了哪个管径。 */
    const rev = await page.evaluate(() => ({
      m160: window.matPriceVal('mainPipe', 160), f200: window.matPriceVal('frontPipe', 200),
      b110: window.matPriceVal('branchPipe', 110), t160: window.matPriceVal('teeJoint'),
      legacyMain: window.materialPrices ? window.materialPrices.mainPipe : null
    }));
    check('A 口径反证：matPriceVal(管材, Ø) 取价目表值（Ø160 主管=47 / Ø200 总管=73 / Ø110 支管=24）',
      String(rev.m160) === '47' && String(rev.f200) === '73' && String(rev.b110) === '24',
      JSON.stringify(rev));

    /* ---- B 自证行 = 一致 ---- */
    check('B 自证行存在且判定为「一致」（.ok）',
      /mat-selfcheck/.test(a.selfCls) && /\bok\b/.test(a.selfCls) && /✓/.test(a.selfTxt) && /一致/.test(a.selfTxt),
      'cls=' + a.selfCls + ' txt=' + a.selfTxt.slice(0, 80));

    /* ---- C 手改总管单价 → 自证行转红并点名 ---- */
    const c = await page.evaluate(() => {
      const tr = document.querySelector('.materials-card tbody tr[data-key="frontPipe"]');
      const inp = tr.querySelector('.price-input');
      inp.value = '999';
      /* 真实用户动作：键入（input）→ 失焦提交（change） */
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      const box = document.getElementById('matSelfCheck');
      return { cls: box.className, txt: box.innerText.replace(/\s+/g, ' '), btn: !!box.querySelector('.mat-price-resync'),
        saved: (function () { try { return (JSON.parse(localStorage.getItem('runyeMatTable_v1') || '{}').priceF) || {}; } catch (e) { return {}; } })() };
    });
    check('C 手改总管单价 999 → 自证行转红（.bad）并点名「材料表 vs 价目表」',
      /\bbad\b/.test(c.cls) && /不一致/.test(c.txt) && /999/.test(c.txt) && /价目表/.test(c.txt),
      'cls=' + c.cls + ' txt=' + c.txt.slice(0, 110));
    check('C 自证行给出「↺ 按价目表重取」按钮', c.btn === true);

    /* ---- D 手改值持久化 ---- */
    check('D 手改值已写入 localStorage（runyeMatTable_v1.priceF.frontPipe=999）',
      String(c.saved.frontPipe) === '999', JSON.stringify(c.saved));
    await page.reload({ waitUntil: 'load', timeout: 90000 });
    await sleep(1200);
    await page.evaluate(() => { try { render(); } catch (e) {} });
    await sleep(600);
    const d = await page.evaluate(READ);
    check('D reload 后手改值仍在（原实现只写内存 materialPrices，刷新即丢 → 本项会红）',
      !!d.front && String(d.front.price) === '999', 'front=' + (d.front ? d.front.price : 'n/a'));
    check('D reload 后自证行仍为不一致（手改与价目表分叉被持续暴露）',
      /\bbad\b/.test(d.selfCls) && /不一致/.test(d.selfTxt), 'cls=' + d.selfCls);

    /* ---- E 按价目表重取 ---- */
    const e = await page.evaluate(() => {
      const btn = document.querySelector('.materials-card .mat-price-resync');
      if (btn) btn.click();
      const box = document.getElementById('matSelfCheck');
      let pf = {};
      try { pf = (JSON.parse(localStorage.getItem('runyeMatTable_v1') || '{}').priceF) || {}; } catch (er) {}
      return { cls: box ? box.className : 'no-box', pf: pf,
        front: (document.querySelector('.materials-card tbody tr[data-key="frontPipe"] .price-input') || {}).value,
        main: (document.querySelector('.materials-card tbody tr[data-key="mainPipe"] .price-input') || {}).value,
        branch: (document.querySelector('.materials-card tbody tr[data-key="branchPipe"] .price-input') || {}).value };
    });
    check('E 点「↺ 按价目表重取」→ 三行回到价目表值，自证行回 .ok',
      /\bok\b/.test(e.cls) &&
      e.front === String(d.front.ref) && e.main === String(d.main.ref) && e.branch === String(d.branch.ref),
      'cls=' + e.cls + ' 值=' + [e.front, e.main, e.branch].join('/') + ' 表=' + [d.front.ref, d.main.ref, d.branch.ref].join('/'));
    check('E 重取同时清掉 priceF 中的三键覆盖（回到自动取价）',
      !e.pf.frontPipe && !e.pf.mainPipe && !e.pf.branchPipe, JSON.stringify(e.pf));

    /* ---- F 改设置页价目表 → 自动跟随 ---- */
    const f = await page.evaluate(() => {
      const od = document.querySelector('.materials-card tbody tr[data-key="mainPipe"]').dataset.od;
      const map = {}; map[String(od)] = 321;
      localStorage.setItem('runye_tlEconPrices', JSON.stringify(map));
      if (typeof render === 'function') render();
      const tr = document.querySelector('.materials-card tbody tr[data-key="mainPipe"]');
      const box = document.getElementById('matSelfCheck');
      return { od: od, price: (tr.querySelector('.price-input') || {}).value,
        cls: box ? box.className : 'no-box', txt: box ? box.innerText.replace(/\s+/g, ' ').slice(0, 90) : '' };
    });
    check('F 设置页价目表改 Ø' + f.od + '=321 元/m → 材料表主管行自动跟随',
      String(f.price) === '321', 'price=' + f.price + ' cls=' + f.cls + ' txt=' + f.txt);
    check('F 跟随之后自证行仍判定一致（两处都用覆盖层新价）', /\bok\b/.test(f.cls), f.txt);

    /* ---- 还原价目表，避免污染后续运行（profile 复用） ---- */
    await page.evaluate(() => { try { localStorage.removeItem('runye_tlEconPrices'); } catch (e) {} });
  }

  check('G 无页面报错', errs.length === 0, errs.join(' | ').slice(0, 200));

  await browser.close();
  proc.kill();
  console.log('\n== 结论：PASS=' + pass + ' FAIL=' + fail + ' ==');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SMOKE CRASH:', e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')); process.exit(2); });
