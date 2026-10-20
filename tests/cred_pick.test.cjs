'use strict';
/* cred_pick.test.cjs —— 「身份凭据择取」契约（v631，2026-10-20）
 *
 * 真实故障：用户打开后台看到
 *   「服务已连接 · 当前账号没有管理权限，当前账号 UID：ROg2duHzXTK-5LmGCdsww」
 * 那个 UID 是 CloudBase **匿名会话**的 uid（本机实测形如 wbZ7_O-4FTzLdBQL920TVQ），
 * 而管理员白名单 RY_PLUGIN_ADMIN_UIDS 里登记的是会员（手机号登录）的 19 位数字 sub。
 *
 * 两处代码缺陷（本文件锁住修法）：
 *   ① cloudAuthSub() 只按 localStorage 顺序取「第一颗 sub !== 'anon'」的凭据，
 *      不看 payload.is_anonymous ⇒ 匿名/会员凭据并存时可能挑到匿名那颗，
 *      ⇒ 后台无权限，连 /entitle 的写操作都会被记到匿名 uid 名下；
 *   ② cloudEnsureAnon() 不看有没有已持久化的会话，直接 signInAnonymously()，
 *      而主程序每次启动都先走这一步 ⇒ 会员会话会被匿名登录顶掉。
 *
 * 这里做的是**行为级**测试：把 cloud-sync.js 里的 cloudPickCred / cloudAuthSub /
 * cloudAuthToken / cloudAuthInfo 抠出来，喂一颗假 localStorage 跑真实分支。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');

/* ---------- 从源文件里摘出需要的函数（不加载整个 SDK 依赖的文件） ---------- */
function grab(name) {
  const i = js.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'cloud-sync.js 里找不到 function ' + name);
  let depth = 0, started = false;
  for (let k = i; k < js.length; k++) {
    const ch = js[k];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return js.slice(i, k + 1); }
  }
  throw new Error('函数体没闭合: ' + name);
}
const src = ['cloudDecodeJwt', 'cloudReadCreds', 'cloudPickCred', 'cloudAuthSub', 'cloudAuthToken', 'cloudAuthInfo']
  .map(grab).join('\n');

/* 造一颗假 JWT：header.payload.sig（payload 只要能被 atob 解出 JSON） */
function fakeJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'eyJhbGciOiJSUzI1NiJ9.' + b64(payload) + '.sig';
}
const MEMBER = fakeJwt({ sub: '2089630534341758976', is_anonymous: false, name: 'member' });
const ANON = fakeJwt({ sub: 'wbZ7_O-4FTzLdBQL920TVQ', is_anonymous: true, name: 'Anonymous' });

function sandbox(entries) {
  /* entries: [[key, jwt], ...] —— 顺序即 localStorage 遍历顺序 */
  const store = new Map();
  entries.forEach(([k, jwt]) => store.set(k, JSON.stringify({ access_token: jwt })));
  const localStorage = {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const ctx = { localStorage, atob, JSON, String, decodeURIComponent, escape, console };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.__api={cloudPickCred,cloudAuthSub,cloudAuthToken,cloudAuthInfo};', ctx);
  return ctx.__api;
}

/* ---------- 1. 匿名在前、会员在后：必须挑会员（旧实现在这里会挑错） ---------- */
const a = sandbox([['credentials_env', ANON], ['credentials_env_member', MEMBER]]);
assert.equal(a.cloudAuthSub(), '2089630534341758976',
  '匿名凭据排在前面时，authSub 仍必须返回会员 sub —— 旧实现只看「第一颗」就会返回匿名 uid，' +
  '导致后台没有管理权限、/entitle 写操作也记到匿名 uid 名下');
assert.equal(a.cloudPickCred().anon, false, '选中的必须是会员凭据（is_anonymous !== true）');

/* ---------- 2. authToken 与 authSub 必须出自同一颗凭据 ---------- */
const token = a.cloudAuthToken();
const tokSub = (function () {
  const seg = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(seg, 'base64').toString('utf8')).sub;
})();
assert.equal(tokSub, a.cloudAuthSub(),
  'authToken 的 sub 必须与 authSub 相同（v631 起共用 cloudPickCred；旧 v371b 靠 sub 回找，' +
  'authSub 一旦挑错就整组错，服务端拿到的 Bearer 与前端显示的身份会不一致）');

/* ---------- 3. 只有匿名凭据时：退回匿名（不能返回 null，否则连匿名读都断） ---------- */
const b = sandbox([['credentials_env', ANON]]);
assert.equal(b.cloudAuthSub(), 'wbZ7_O-4FTzLdBQL920TVQ', '只有匿名凭据时应退回匿名 sub');
assert.equal(b.cloudAuthInfo().anon, true, 'authInfo().anon 必须为 true —— 后台据此提示「请先用手机号登录」');

/* ---------- 4. 会员/匿名并存时，authInfo 把两条信息都报出来（诊断用） ---------- */
const info = a.cloudAuthInfo();
assert.equal(info.anon, false, 'authInfo().anon 应为 false（当前用的是会员身份）');
assert.equal(info.creds, 2, 'authInfo().creds 应报出凭据条数（本例 2）');
assert.equal(info.members, 1, 'authInfo().members 应报出会员凭据条数');

/* ---------- 5. 空/坏数据不能抛，返回 null ---------- */
const c = sandbox([]);
assert.equal(c.cloudAuthSub(), null, '没有凭据时 authSub 返回 null');
const d = sandbox([['credentials_env', 'not-a-jwt']]);
assert.equal(d.cloudAuthSub(), null, '凭据里没有 JWT 时返回 null（不能抛异常把整段启动流程打断）');

/* ---------- 6. ensureAnon 必须先 restore：有会话就不匿名登录 ---------- */
const iAnon = js.indexOf('function cloudEnsureAnon(');
const iAnonEnd = js.indexOf('/* ===== [v359 2026-10-10]', iAnon);
assert.ok(iAnon > 0 && iAnonEnd > iAnon, '找不到 cloudEnsureAnon');
const anonBodyRaw = js.slice(iAnon, iAnonEnd);
/* 先剥注释再比顺序：这段函数里带「直接 signInAnonymously()」这类说明文字，
   按裸字符串找会把注释当成调用点（本测试第一版就踩了）。 */
const anonBody = anonBodyRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const iRestore = anonBody.indexOf('cloudRestore()');
const iSignAnon = anonBody.indexOf('signInAnonymously');
assert.ok(iRestore >= 0, 'cloudEnsureAnon 必须先调用 cloudRestore()：有持久化会话就复用');
assert.ok(iSignAnon > iRestore,
  'signInAnonymously 必须排在 cloudRestore() **之后**（有会话时那条分支不该执行到）——' +
  '否则主程序每次启动都会用匿名登录把手机号登录的会员会话顶掉，后台就永远是匿名身份');
assert.ok(/if\s*\(\s*restored\s*\)\s*return true/.test(anonBody),
  'restore 成功必须直接 return true，不能再往下走匿名登录');

/* ---------- 7. 后台：匿名态必须给出可操作提示（而不是只说「没有管理权限」） ---------- */
const admin = fs.readFileSync(path.join(root, 'plugin-admin.html'), 'utf8');
assert.ok(/authInfo/.test(admin) && /function applyAdminState\(/.test(admin),
  'plugin-admin.html 必须走 CloudSync.authInfo() + applyAdminState() 把身份状态摊开');
assert.ok(/当前是匿名身份/.test(admin), '匿名态必须明说「当前是匿名身份」');
assert.ok(/RY_PLUGIN_ADMIN_UIDS[\s\S]{0,80}也不会生效/.test(admin),
  '必须写明「把匿名 UID 加进 RY_PLUGIN_ADMIN_UIDS 也不会生效」，否则用户会继续去加白名单');
assert.ok(/href="index\.html[^"]*"[^>]*>[^<]*(去主程序用手机号登录|主程序)/.test(admin),
  '匿名态要给「回主程序登录」的入口（v632 起是带 ?login=1&back= 的深链按钮）');
assert.ok(/identTag\(\)/.test(admin), '账号行要标出（会员账号 / 匿名会话）');

console.log('cred_pick：身份择取契约 17 项通过');

/* ---------- 8. 深链闭环（v632）：后台点一下 → 主程序弹登录框 → 登录成功自动跳回 ----------
   起因：匿名态提示「回主程序用手机号登录」，但登录框藏在右上角会员胶囊的弹层里，
   用户找不到入口就放弃了。深链把这一步接上。 */
const memberUi = fs.readFileSync(path.join(root, 'runye-member-ui.js'), 'utf8');
assert.ok(/function qsVal\(name\)/.test(memberUi) && /function backTarget\(\)/.test(memberUi),
  'runye-member-ui.js 需要 qsVal/backTarget 支撑 ?login=1 与 ?back= 深链');
assert.ok(/if \(qsVal\('login'\) === '1'\)[\s\S]{0,120}RyMemberUI\.openPanel\(\)/.test(memberUi),
  '?login=1 必须直接弹会员中心（登录框在里面），否则用户还是找不到登录入口');
assert.ok(/var back = backTarget\(\);[\s\S]{0,160}location\.replace\(back\)/.test(memberUi),
  '登录成功后必须按 ?back= 跳回（后台闭环），否则用户要自己再找一遍后台入口');

/* backTarget 必须只放行站内相对 .html —— 否则 ?back=//evil.com 就是开放重定向 */
const btStart = memberUi.indexOf('function backTarget()');
const btEnd = memberUi.indexOf('/* ---------- 胶囊 ---------- */', btStart);
const bt = memberUi.slice(btStart, btEnd);
assert.ok(/\^\[A-Za-z0-9\._\\-\\\/\]\+\\\.html/.test(bt) || /\.html\(/.test(bt),
  'backTarget 必须用白名单正则限定为「站内相对 .html」，挡住 //evil.com 之类开放重定向');
assert.ok(bt.indexOf("indexOf('//') < 0") >= 0, 'backTarget 必须显式排除 //host 形式');

/* 后台的匿名态要给出这条深链，而不是只写「回主程序」 */
assert.ok(/index\.html\?login=1&amp;back=plugin-admin\.html/.test(admin),
  'plugin-admin.html 的匿名提示必须给「登录并自动回到后台」的深链');
assert.ok(/去主程序用手机号登录/.test(admin), '深链要有明确按钮文案（不能只是一行小字链接）');

console.log('cred_pick：深链闭环契约 7 项通过');
