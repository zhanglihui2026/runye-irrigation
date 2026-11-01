'use strict';
/* _probe_cred.mjs —— 查清「当前账号 UID」是哪一路身份（匿名会话 vs 会员登录）
 * 用法：node _probe_cred.mjs
 * 做三件事：
 *   ① 打开线上 index.html，等 CloudSync 就绪；
 *   ② 调 CloudSync.ensureAnon()（这是主程序启动时必然走的一步），打印 authSub/authToken 的 sub；
 *   ③ 把 localStorage 里所有 credentials_* 的 JWT payload 解出来（sub / is_anonymous / provider / name），
 *      并模拟「同时存在会员凭据 + 匿名凭据」时 cloudAuthSub 会挑哪一颗。
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { spawn } = require('child_process');
const http = require('http');
const WS = globalThis.WebSocket;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP = 49380 + Math.floor(Math.random() * 40);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = process.env.URL || 'https://zhanglihui2026.github.io/runye-irrigation/index.html?full=1';
const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--remote-debugging-port=' + CDP, '--user-data-dir=C:\\tmp\\cdp_cred_' + Date.now(), '--window-size=1400,800'], { stdio: 'ignore' });
const hreq = (m, p) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port: CDP, path: p, method: m }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }); q.on('error', rej); q.end(); });
for (let i = 0; i < 60; i++) { try { await hreq('GET', '/json/version'); break; } catch (e) { await sleep(300); } }
let idc = 1, ws; const pend = {};
const send = (m, p = {}) => new Promise((res, rej) => { const id = idc++; pend[id] = { res, rej }; ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (pend[id]) { delete pend[id]; rej(new Error('timeout ' + m)); } }, 90000); });
const t = JSON.parse(await hreq('PUT', '/json/new?' + encodeURIComponent(LIVE)));
ws = new WS(t.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', e => { const o = JSON.parse(e.data); if (o.id && pend[o.id]) { const { res, rej } = pend[o.id]; delete pend[o.id]; o.error ? rej(new Error(o.error.message)) : res(o.result); return; } if (o.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: idc++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); } });
await send('Runtime.enable'); await send('Page.enable');
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true, timeout: 90000 }); if (r.exceptionDetails) return { __err: String((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).slice(0, 300) }; return r.result.value; };
for (let i = 0; i < 120; i++) { if (await ev('!!(window.CloudSync && window.CloudSync.init)') === true) break; await sleep(500); }

const PEEK = `(function(){
  function dec(jwt){
    try{ var seg=jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(decodeURIComponent(escape(atob(seg+'==='.slice((seg.length+3)%4))))); }catch(e){ return null; }
  }
  var out={};
  try{ out.authSub=window.CloudSync.authSub(); }catch(e){ out.authSub='ERR '+e.message; }
  try{ var tk=window.CloudSync.authToken(); var p=tk?dec(tk):null; out.tokenSub=p&&p.sub; out.tokenIsAnon=p&&p.is_anonymous; out.tokenName=p&&p.name; }catch(e){ out.tokenSub='ERR '+e.message; }
  out.creds=[];
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i); if(k.indexOf('credentials_')!==0) continue;
    var raw=String(localStorage.getItem(k)||'');
    var m=/eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.exec(raw);
    var p=m?dec(m[0]):null;
    out.creds.push({key:k, len:raw.length, hasJwt:!!m, sub:p&&p.sub, isAnon:p&&p.is_anonymous,
                    name:p&&p.name, providers:(p&&p.meta&&p.meta.provider)||(p&&p.provider)||null,
                    isSystemAdmin:p&&p.is_system_admin});
  }
  out.lsKeys=(function(){var a=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(/token|login|member|entitle|session/i.test(k))a.push(k);}return a;})();
  return out;
})()`;

console.log('--- 匿名登录前 ---');
console.log(JSON.stringify(await ev(PEEK), null, 1));
console.log('ensureAnon:', JSON.stringify(await ev('window.CloudSync.ensureAnon()')));
await sleep(1200);
console.log('--- 匿名登录后 ---');
console.log(JSON.stringify(await ev(PEEK), null, 1));

/* 幂等性：已有匿名会话时再调一次 ensureAnon，**不能**再建一个新匿名用户（v631：先 restore） */
const sub1 = await ev('window.CloudSync.authSub()');
console.log('二次 ensureAnon:', JSON.stringify(await ev('window.CloudSync.ensureAnon()')));
await sleep(800);
const sub2 = await ev('window.CloudSync.authSub()');
console.log('会话是否被顶掉:', sub1 === sub2 ? '否（正确）' : ('是（错误）' + sub1 + ' → ' + sub2));

/* 关键实验：注入一颗「会员凭据」与一颗「匿名凭据」，看 cloudAuthSub 挑哪一颗。
   用真实匿名 JWT 的 payload 结构（sub 保留）复制一份改成 19 位数字 sub、去掉 is_anonymous。 */
const PICK = `(function(){
  function dec(jwt){ try{ var seg=jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(decodeURIComponent(escape(atob(seg+'==='.slice((seg.length+3)%4))))); }catch(e){ return null; } }
  function enc(obj){ var s=btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); return s; }
  var anonRaw=null, anonJwt=null;
  for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('credentials_')!==0)continue;
    var raw=String(localStorage.getItem(k)||'');var m=/eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.exec(raw);
    if(m){anonRaw=raw;anonJwt=m[0];break;}}
  if(!anonJwt) return {skip:'没有匿名凭据可复制'};
  var pl=dec(anonJwt);
  /* 会员凭据：sub=19 位数字、is_anonymous=false（模拟真号登录后的 token） */
  var memberPayload=JSON.parse(JSON.stringify(pl));
  memberPayload.sub='2089630534341758976';
  memberPayload.is_anonymous=false;
  memberPayload.name='member';
  var parts=anonJwt.split('.');
  var memberJwt=parts[0]+'.'+enc(memberPayload)+'.'+parts[2];
  /* 会员凭据放前面（模拟「会员先登录、之后又被匿名覆盖前」的状态） */
  localStorage.setItem('credentials_zz_member', JSON.stringify({access_token:memberJwt}));
  var before={authSub:window.CloudSync.authSub()};
  /* 再模拟「会员凭据在老 key 里、匿名凭据在新 key 里」两种排列 */
  localStorage.removeItem('credentials_zz_member');
  localStorage.setItem('credentials_aa_anon', JSON.stringify({access_token:anonJwt}));
  localStorage.setItem('credentials_zz_member2', JSON.stringify({access_token:memberJwt}));
  var after={authSub:window.CloudSync.authSub(), token:window.CloudSync.authToken()};
  var out={before:before, after:after,
    afterTokenSub:(function(){var p=dec(String(after.token||''));return p&&p.sub;})(),
    keys:(function(){var a=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('credentials_')===0)a.push(k);}return a;})()};
  localStorage.removeItem('credentials_aa_anon');
  localStorage.removeItem('credentials_zz_member2');
  return out;
})()`;
console.log('--- 凭据择取实验 ---');
console.log(JSON.stringify(await ev(PICK), null, 1));

try { ws.close(); } catch (e) { }
try { child.kill('SIGKILL'); } catch (e) { }
process.exit(0);
