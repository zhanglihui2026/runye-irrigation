'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname).replace(/^\/runye-irrigation\//, '');
  const file = path.resolve(root, rel || 'index.html');
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const url = `http://127.0.0.1:${server.address().port}/runye-irrigation/index.html`;
    const results = [];
    for (const mode of ['http', 'file', 'fallback']) {
      const context = await browser.newContext();
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => {
        const target = route.request().url();
        if (/^https?:/.test(target) && !target.startsWith('http://127.0.0.1:')) return route.abort();
        if (mode === 'fallback' && target.includes('hydraulics-wasm.js')) return route.abort();
        return route.continue();
      });
      await page.goto(mode === 'file' ? pathToFileURL(path.join(root, 'index.html')).href : url, { waitUntil: 'load' });
      const result = await page.evaluate(async () => {
        // wasm 初始化是异步的：等 ready 后再断言 backend，避免首屏尚未切换。
        await (window.RyHydraulicNative && window.RyHydraulicNative.ready || Promise.resolve());
        const calls = { hazen: 0, head: 0, power: 0 };
        for (const name of Object.keys(calls)) {
          if (!RyHydraulicNative[name]) continue;
          const f = RyHydraulicNative[name];
          RyHydraulicNative[name] = (...args) => { calls[name]++; return f(...args); };
        }
        const r = computeThreeLevel();
        return { backend: RyHydraulicNative.backend, head: r.pumpHead, loss: r.totalPipeLoss, calls };
      });
      assert.equal(result.backend, mode === 'fallback' ? 'javascript' : 'cpp-wasm');
      if (mode !== 'fallback') for (const name of Object.keys(result.calls)) {
        assert.ok(result.calls[name] > 0, 'Host must really execute C++ ' + name);
      }
      assert.deepEqual(errors, []);
      results.push(result);
      await context.close();
    }
    for (const r of results) {
      assert.ok(Math.abs(r.head - results[0].head) < 1e-9);
      assert.ok(Math.abs(r.loss - results[0].loss) < 1e-9);
    }
    console.log('PASS: Pages-style subpath, local file, JavaScript fallback, host C++ calls and equal results');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
