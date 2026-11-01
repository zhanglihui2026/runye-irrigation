/* _probe_admin_detail.mjs —— 复现「后台管理按钮点了没反应」
 * 手法：Edge headless + CDP（见 skill edge-cdp-verify），用 addScriptToEvaluateOnNewDocument
 *       在页面脚本之前注入：① 假 CloudSync（跳过真实登录）② 假 fetch（喂 30 行会员数据）。
 * 断言：点「管理」后 #mDetailCard 是否可见、滚动位置是否真的动了、有无 JS 异常。
 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const PAGE = 'file:///C:/Users/AHS/runye-irrigation/plugin-admin.html';
const OUT = 'C:\\Users\\AHS\\runye-irrigation\\_probe_admin_detail.out.txt';
const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

function httpGet(u) {
  return new Promise((res, rej) => {
    http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d)); }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdp(url) {
  const pending = new Map(); const ev = []; let id = 0;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('error', (e) => reject(e.error || new Error('ws')));
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data.toString());
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      } else if (msg.method) ev.push(msg);
    });
    ws.addEventListener('open', () => {
      const send = (method, params = {}) => {
        const myid = ++id;
        const pr = new Promise((res, rej) => pending.set(myid, { resolve: res, reject: rej }));
        ws.send(JSON.stringify({ id: myid, method, params })); return pr;
      };
      resolve({ events: ev, send, close: () => ws.close() });
    });
  });
}

const INJECT = `
(function(){
  var FAKE = {
    ready:true, uid:'10001', phone:'13800138000',
    authSub:function(){return '10001'}, authToken:function(){return 'fake-token'},
    init:function(){return Promise.resolve(true)}, restore:function(){return Promise.resolve(true)},
    rdb:function(){return null}, on:function(){}, emitStatus:function(){}
  };
  Object.defineProperty(window,'CloudSync',{configurable:true,get:function(){return FAKE}});

  var members = [];
  for(var i=0;i<30;i++){
    /* 刻意不带 history：真实 adminMemberStats 返回的就是这种瘦对象（历史 bug 的触发条件） */
    members.push({uid:'210892373772'+(1016320+i),phone:i%3===0?'—':'199****'+(1200+i),
      plan:'L1',expires_at:'2026-11-09T15:59:59.000Z',created_at:null,last_seen_at:null,
      activated_at:null,member_days:30,invited:i%2});
  }
  var DATA = {
    pluginsGet:{code:0,data:{enabled:{},admin:true}},
    configGet:{code:0,data:{config:{trialDays:30,plans:{L1:{name:'注册会员',days:30,features:['zone-split','ai-plan','pipe-layout','online-map']},L2:{name:'高级会员',days:365,features:['zone-split','ai-plan','pipe-layout','online-map']}}},updatedAt:null,admin:true,fn:'v2c-5-phone-backfill'}},
    adminMemberStats:{code:0,data:{totals:{total:39,today:0,last7:0,active7:0,l1:34,l2:5,expired:0,links:7,inviters:3},
      daily:[],page:1,size:30,matched:30,truncated:false,members:members}},
    /* 懒加载历史走的是已部署的 adminMembers（按 uid 搜） */
    adminMembers:{code:0,data:{members:[{uid:'2108923737721016320',plan:'L1',phone:'199****1200',
      history:[{at:Date.now(),src:'register',days:30,plan:'L1',planName:'注册会员'},{at:Date.now(),src:'admin',days:90,plan:'L2',planName:'高级会员',note:'客服补偿'}]}]}},
    adminMemberBind:{code:0,data:{code:'RYAAAA',invited:2,progress:{capped:2},links:[]}},
    ping:{code:0,data:{ok:true}}
  };
  var origFetch = window.fetch;
  window.fetch = function(input, init){
    var url = (typeof input==='string')?input:(input&&input.url)||'';
    if(url.indexOf('plugins.json')>=0){
      return Promise.resolve(new Response(JSON.stringify({plugins:[]}),{status:200,headers:{'Content-Type':'application/json'}}));
    }
    if(url.indexOf('/entitle')>=0){
      var body = {}; try{ body = JSON.parse((init&&init.body)||'{}'); }catch(e){}
      var d = DATA[body.action] || {code:0,data:{ok:true}};
      return Promise.resolve(new Response(JSON.stringify(d),{status:200,headers:{'Content-Type':'application/json'}}));
    }
    return origFetch ? origFetch(input,init) : Promise.reject(new Error('no fetch'));
  };
})();
`;

(async () => {
  const UD = 'C:\\tmp\\cdp_admin_' + Date.now();
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=' + PORT, '--user-data-dir=' + UD], { stdio: 'ignore' });
  const kill = () => { try { child.kill('SIGKILL'); } catch (e) {} };
  const watchdog = setTimeout(() => { log('!! 看门狗超时'); fs.writeFileSync(OUT, lines.join('\n'), 'utf8'); kill(); process.exit(2); }, 60000);
  try {
    for (let i = 0; i < 60; i++) { try { await httpGet('http://127.0.0.1:' + PORT + '/json/version'); break; } catch (e) { await sleep(200); } }
    const list = JSON.parse(await httpGet('http://127.0.0.1:' + PORT + '/json'));
    const target = list.find((t) => t.type === 'page');
    const c = await cdp(target.webSocketDebuggerUrl);
    await c.send('Runtime.enable'); await c.send('Page.enable');
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
    await c.send('Page.navigate', { url: PAGE });

    const evalV = async (expr) => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

    // 等内联脚本跑完（页签 onclick 已绑定）再点，否则点到的是没绑事件的按钮
    let bound = false;
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      if (await evalV("typeof document.querySelector('.tab').onclick === 'function'")) { bound = true; break; }
    }
    log('页签事件已绑定: ' + bound);

    // 先切到「会员管理」页签（默认停在插件开关，不切的话区块是 hidden、所有 rect 都是 0）
    await evalV("document.querySelector('[data-tab=\"members\"]').click()");
    await sleep(500);
    log('页签切换后 sec-members hidden=' + await evalV("document.getElementById('sec-members').hidden"));

    // 轮询就绪：表格出现
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(300);
      const r = await c.send('Runtime.evaluate', { expression: "!!document.querySelector('#mList table tbody tr')", returnByValue: true });
      if (r.result && r.result.value) { ready = true; break; }
    }
    log('表格渲染: ' + (ready ? 'OK' : 'FAIL'));

    log('点击前 hidden=' + await evalV("document.getElementById('mDetailCard').hidden"));
    log('点击前 rect=' + JSON.stringify(await evalV("(function(){var r=document.getElementById('mDetailCard').getBoundingClientRect();return {top:Math.round(r.top),h:Math.round(r.height)}})()")));
    log('点击前 scrollY=' + await evalV('Math.round(scrollY)') + ' docH=' + await evalV('Math.round(document.documentElement.scrollHeight)'));

    // 点第一行「管理」
    await evalV("document.querySelector('#mList table tbody tr td:last-child button').click()");
    await sleep(600);

    const after = await evalV(`(function(){
      var c=document.getElementById('mDetailCard'), r=c.getBoundingClientRect();
      return {hidden:c.hidden, top:Math.round(r.top), h:Math.round(r.height),
              scrollY:Math.round(scrollY), docH:Math.round(document.documentElement.scrollHeight),
              infoLen:(document.getElementById('mInfo').textContent||'').length,
              inViewport: r.top < innerHeight && r.bottom > 0};
    })()`);
    log('点击后 ' + JSON.stringify(after));

    const ex = c.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    log('JS 异常: ' + (ex.length ? JSON.stringify(ex.map((e) => (e.params.exceptionDetails.exception || {}).description || e.params.exceptionDetails.text)) : '无'));

    // 第二段：手动滚到卡片，确认内容是否真的填了
    await evalV("document.getElementById('mDetailCard').scrollIntoView({block:'center'})");
    await sleep(1200);
    log('滚到卡片后 scrollY=' + await evalV('Math.round(scrollY)'));
    log('mHist 文本=' + JSON.stringify(await evalV("(document.getElementById('mHist').textContent||'').replace(/\\s+/g,' ').trim().slice(0,60)")));
    log('mHist 表格行数=' + await evalV("document.querySelectorAll('#mHist table tbody tr').length"));
    log('mBind 文本=' + JSON.stringify(await evalV("(document.getElementById('mBind').textContent||'').trim().slice(0,30)")));
    c.close();
  } catch (e) {
    log('脚本异常: ' + (e && e.stack || e));
  } finally {
    clearTimeout(watchdog); kill();
    fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
    process.exit(0);
  }
})();
