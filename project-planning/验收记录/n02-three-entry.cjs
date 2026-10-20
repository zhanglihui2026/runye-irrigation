#!/usr/bin/env node
'use strict';

/* N02 三入口回传验收。用 Playwright 驱动独立 Edge 页面，验证真实导航、鼠标
 * 右键、列表按钮和“设为当前”按钮；不连接用户浏览器档案，阻断外部网络并阻止
 * Service Worker，页面数据仅写入本次临时浏览器上下文。
 *
 * 用法：node project-planning/验收记录/n02-three-entry.cjs
 * 退出码：0 全通过；1 有断言失败或运行环境不完整。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
const APP_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?full=1&rymock=L2#onlineMapSection';
const PLOTS = [
  {
    id: 'n02-a', name: 'N02-A', sqm: 23500, mu: 35.25,
    polyLatLng: [[18.2, 109.5], [18.2, 109.502], [18.201, 109.502], [18.201, 109.5]],
  },
  {
    id: 'n02-b', name: 'N02-B', sqm: 36000, mu: 54,
    polyLatLng: [[18.21, 109.51], [18.21, 109.513], [18.2115, 109.512], [18.211, 109.51]],
  },
].map((p) => ({ ...p, areaM2: p.sqm, ts: 100, source: 'map' }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  assert.ok(EDGE, '找不到 Microsoft Edge；可通过 EDGE_PATH 指定 msedge.exe');
  const browser = await chromium.launch({
    channel: 'msedge', headless: true, executablePath: EDGE,
    args: ['--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check'],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block',
  });
  await context.route(/^https?:\/\//, (route) => route.abort());
  await context.addInitScript((plots) => {
    if (!localStorage.getItem('__n02_seed')) {
      localStorage.setItem('runye_plot_library', JSON.stringify(plots));
      localStorage.setItem('runyeLocalAdminSession', '1');
      localStorage.setItem('__n02_seed', '1');
    }
  }, PLOTS);

  const page = await context.newPage();
  const errors = [];
  const consoleErrors = [];
  const dialogs = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => consoleErrors.push(`${request.url()} :: ${request.failure()?.errorText || 'failed'}`));
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  const waitFor = async (fn, label, timeout = 30000, arg = undefined) => {
    try { await page.waitForFunction(fn, arg, { timeout }); }
    catch (e) { throw new Error(`${label} 等待超时：${e.message}`); }
  };
  const closeNotice = async () => {
    const mask = page.locator('.ry-ann-mask');
    if (!await mask.isVisible().catch(() => false)) {
      await mask.waitFor({ state: 'visible', timeout: 1800 }).catch(() => {});
    }
    const close = page.locator('[title="关闭公告"], .ry-ann-x').first();
    if (await close.isVisible().catch(() => false)) await close.click();
    else if (await page.locator('.ry-ann-mask').count()) {
      await page.evaluate(() => window.RyAnnounce?.close?.());
    }
    await page.locator('.ry-ann-mask').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  };
  const nav = async (label, sectionId) => {
    await closeNotice();
    await waitFor(() => window.RyEntitle?.ready?.() &&
      document.querySelectorAll('.fn-nav .fn-link.fn-pending').length === 0,
      '导航权益就绪');
    const link = page.locator('.fn-nav .fn-link').filter({ hasText: label }).first();
    await link.click();
    await waitFor((id) => {
      const section = document.getElementById(id);
      return !!section && (section.classList.contains('ry-active') || section.classList.contains('active'));
    }, `切换到 ${label}`, 15000, sectionId);
  };
  const readState = () => page.evaluate(() => ({
    id: window.currentPlotId,
    area: window.measuredArea,
    poly: window.measuredPolygon,
    anchor: window.RyIrrigationDataStore?.readCurrentPlotAnchor?.() || null,
    network: window.RyIrrigationDataStore?.readNetworkLayout?.() || null,
    hash: location.hash,
  }));
  const clickMapListButton = async (name, selector) => {
    const item = page.locator('#myPlotList .place-item').filter({ hasText: name }).first();
    await item.waitFor({ state: 'visible' });
    await item.locator(selector).click();
  };
  const checkEntry = async (id, entry) => {
    await waitFor((wanted) => window.currentPlotId === wanted &&
      (document.getElementById('pipePlanSection')?.classList.contains('ry-active') ||
       document.getElementById('pipePlanSection')?.classList.contains('active')),
      `${entry} 回传地块 ${id}`, 15000, id);
    const before = await readState();
    assert.equal(before.anchor?.id, id, `${entry}：当前锚点应为 ${id}`);
    assert.ok(Array.isArray(before.poly) && before.poly.length >= 3, `${entry}：边界顶点应不少于 3`);
    assert.ok(Number(before.area) > 0, `${entry}：面积应大于 0`);

    await nav('管路规划', 'tlPipePlanSection');
    await page.evaluate(() => {
      window.tlAutoGenerate?.({ scroll: false });
      window.runyeSaveProject?.(true);
    });
    await waitFor((wanted) => window.RyIrrigationDataStore?.readNetworkLayout?.()?.plotId === wanted,
      `${entry} 管网归属 ${id}`, 15000, id);
    const generated = await readState();
    assert.equal(generated.network?.plotId, id, `${entry}：生成管网归属应为 ${id}`);

    await nav('地块分区', 'pipePlanSection');
    await page.reload({ waitUntil: 'load' });
    await closeNotice();
    try { await waitFor((wanted) => window.currentPlotId === wanted, `${entry} 刷新恢复地块 ${id}`, 30000, id); }
    catch (error) {
      const diagnostic = await page.evaluate(() => ({
        id: window.currentPlotId,
        hash: location.hash,
        anchor: window.RyIrrigationDataStore?.readCurrentPlotAnchor?.() || null,
        network: window.RyIrrigationDataStore?.readNetworkLayout?.() || null,
        keys: Object.keys(localStorage).filter((key) => /runye|plot|network|anchor/i.test(key))
          .map((key) => ({ key, length: localStorage.getItem(key)?.length || 0,
            value: (localStorage.getItem(key) || '').slice(0, 180) })),
      })).catch((e) => ({ diagnosticError: e.message }));
      throw new Error(`${error.message}\n刷新恢复现场：${JSON.stringify(diagnostic)}`);
    }
    const after = await readState();
    assert.equal(after.anchor?.id, id, `${entry}：刷新后锚点应为 ${id}`);
    assert.equal(after.network?.plotId, id, `${entry}：刷新后管网仍应归属 ${id}`);
    assert.equal(after.area, before.area, `${entry}：刷新后面积应一致`);
    assert.deepEqual(after.poly, before.poly, `${entry}：刷新后边界应一致`);
    assert.equal(after.hash, '#pipePlanSection', `${entry}：刷新后应停留在地块分区`);
    console.log(`PASS: ${entry} → ${id} → 管网归属 → 刷新恢复`);
  };

  try {
    await page.goto(APP_URL, { waitUntil: 'load', timeout: 90000 });
    try { await waitFor(() => window.RyMapHost && window.RyEntitle?.ready?.(), '地图宿主和权益初始化', 20000); }
    catch (error) {
      const diag = await page.evaluate(() => ({
        url: location.href, title: document.title, ready: document.readyState,
        body: (document.body?.innerText || '').slice(0, 500),
        hosts: ['RyMapHost', 'RyEntitle', 'RyIrrigationDataStore'].map((k) => [k, typeof window[k]]),
        scripts: [...document.scripts].map((s) => s.src).filter(Boolean).slice(-20),
        seeded: localStorage.getItem('__n02_seed'),
        navPending: document.querySelectorAll('.fn-nav .fn-link.fn-pending').length,
        entitleReady: !!window.RyEntitle?.ready?.(),
      })).catch((e) => ({ diagnosticError: e.message }));
      throw new Error(`${error.message}\n页面状态：${JSON.stringify(diag)}\n运行期异常：${JSON.stringify(errors.slice(-8))}\n控制台/加载错误：${JSON.stringify(consoleErrors.slice(-12))}`);
    }
    await closeNotice();

    // 入口一：地图列表选地后，在地图地块上真实右键并点击弹窗按钮。
    await clickMapListButton('N02-A', '.place-go');
    await sleep(500);
    const shape = page.locator('#map path.leaflet-interactive[fill-opacity="0.18"]').first();
    await shape.waitFor({ state: 'visible' });
    const box = await shape.boundingBox();
    assert.ok(box, '入口一：地图地块需要有可交互区域');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    const send = page.locator('#rymSendDesign');
    await send.waitFor({ state: 'visible', timeout: 10000 });
    await send.click();
    await checkEntry('n02-a', '地图右键弹窗');

    // 入口二：地图列表箭头。
    await nav('在线地图', 'onlineMapSection');
    await clickMapListButton('N02-B', '.place-send');
    await checkEntry('n02-b', '地图列表箭头');

    // 入口三：地块绘制页的地块库“设为当前”。
    await nav('地块绘制', 'areaTool');
    const libraryItem = page.locator('#plotLibList .at-lib-item').filter({ hasText: 'N02-A' }).first();
    await libraryItem.locator('[data-act="current"]').click();
    await checkEntry('n02-a', '地块库设为当前');

    assert.deepEqual(errors, [], '页面不应出现运行期异常');
    assert.deepEqual(dialogs, [], '流程中不应出现意外原生弹窗');
    console.log('\nN02 三入口验收：全部通过。');
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('\nN02 三入口验收：失败');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
