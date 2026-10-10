/* ============================================================
   cloud-sync.js —— 数字农业工作台 · 云端同步适配层（CloudBase Web SDK v3）
   ------------------------------------------------------------
   架构：浏览器 → CloudBase 2.0（PG 模式）
     1) 匿名登录拿 uid
     2) 通过云函数 syncDb 读写「云存储」中的 user_db/{uid}.json
        （此 CloudBase 2.0 体验版无 NoSQL 文档库入口，
          改用 云存储 + 云函数 中转，隔离由云函数按 uid 强制，
          效果与原方案一致：每用户一份数据 + 跨设备同步）
     2b) [v360] kv 四件套已改走 app.rdb() 直连 PG（ry_kv 表 + RLS）——
        云函数通道被平台环境策略一刀切封死（EXCEED_AUTHORITY），rdb 通道实测放行

   v3 SDK 加载方式：<script type="module"> 内异步 import，
   加载完成后派发 'cloudbase-ready' 事件，cloud-sync.js 监听该事件。
   设计原则：
   1) 最小侵入：业务层只调 dbSave/dbLoad，云端开关由本文件决定。
   2) 降级安全：USE_CLOUD=false / SDK 不可用 / accessKey 缺失
      → 退回 localStorage，并把真实错误码挂在 window._cloudLastError。
   3) 接口稳定：暴露 window.CloudSync 名称/方法不变，workbench.html 无需改业务逻辑。
   ============================================================ */

/* ====== CONFIG（部署前填写）====== */
var CLOUDBASE_ENV_ID     = 'runye-irrigation-d3e8xef4540bae5';  // ← CloudBase 环境 ID（注意是 bae5，非 cae5）
var CLOUDBASE_ACCESS_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjMwZGZhYzYyLWIzYTItNDZlYS1iNTkxLTc2YzEwMTMyM2NhYSJ9.eyJpc3MiOiJodHRwczovL3J1bnllLWlycmlnYXRpb24tZDNlOHhlZjQ1NDBiYWU1LmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJydW55ZS1pcnJpZ2F0aW9uLWQzZTh4ZWY0NTQwYmFlNSIsImV4cCI6NDA5MTM1NTQ3MiwiaWF0IjoxNzg3NjcyMjcyLCJub25jZSI6Ik9jaWowVk03VGNhTVd3WE1QLVB3NUEiLCJhdF9oYXNoIjoiT2NpajBWTTdUY2FNV3dYTVAtUHc1QSIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJydW55ZS1pcnJpZ2F0aW9uLWQzZTh4ZWY0NTQwYmFlNSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.FCxRopdIzWXEtm8Lu75fO571Ej-gOXiDsGDjZdtXJfQYbEDe_dzCjk42fZGYNwTyQhhvVcqjKsXLEEjoaT8WjPDK3zdz147tx_HmgvL7UvaxVD83UepiZT9KY5q-qzFZSJTUMt1GMzFmSNO4wdl-IAa0gt_R0ewLHukc8_fD13FV7FnalAdRp2PQBglSkWPNRD1E7ewlhg9joDSFA9-PhwISbjB6NCpIbYW7h6_f6Ym72jKyyoMkWojsfm4B8-FZ2TYLRYJuXQR-sJ7wZAN-cj5g3R8tZK9AzASxLprpm03wz3oHdHGnJ0scjgT3yoKxE1l62gI5L9l_5ZWhv-7h9g';  // ← Publishable Key（前端可见，anonymous 权限）
var CLOUDBASE_USE_CLOUD  = true;                                  // ← 填好 accessKey + 部署 syncDb 后置 true
var CLOUDBASE_FUNCTION_NAME = 'syncDb';                           // 云函数名（与控制台创建的同名）

/* ====== 运行时状态 ======= */
var cloudApp = null;
var cloudInitPending = null;          /* [v359b] 并发初始化共享句柄（审核修复：并发下 initCalls=2 回归） */
var cloudUid = null;
var cloudReady = false;
var cloudSyncing = false;
var cloudStatusListeners = [];
var cloudSdkLoaded = false;          // SDK ESM 是否已挂到 window.cloudbase
/* [v359] 手机号 + 短信验证码登录的状态 */
var cloudPhone = '';                                  // 已登录手机号（带区号，如 '+86 13800000000'）
var lastSmsTicket = null;             // { phone, verificationInfo } —— signInWithSms 第三步要用
/* [v363] 票据持久化（sessionStorage）：微信 iOS 切到短信 App 常杀掉 webview 重载页面，
   内存票据丢失 → 提交时报「请先获取短信验证码」。同 tab 重载后恢复，解决该类失败。 */
var SMS_TICKET_KEY = 'cloudSmsTicket_' + (typeof ENV_ID !== 'undefined' ? ENV_ID : 'env');
function smsTicketSave(t) { try { sessionStorage.setItem(SMS_TICKET_KEY, JSON.stringify(t)); } catch (e) {} }
function smsTicketLoad() { try { var s = sessionStorage.getItem(SMS_TICKET_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function smsTicketClear() { try { sessionStorage.removeItem(SMS_TICKET_KEY); } catch (e) {} }
if (!lastSmsTicket) lastSmsTicket = smsTicketLoad();
/* [v363] 云端错误归一化：SDK 把业务错误抛成裸字符串（如 'invalid_argument'），
   UI 层拿不到 .msg 只会显示「未知错误」。翻译常见码为人话。 */
function normCloudErr(e) {
  if (e && typeof e === 'object') {
    if (e.msg) return e;
    /* [v365] 服务端 gRPC/网关错误对象：{error_code, message, requestId} —— 原始码必须透传到 UI */
    var ec = e.error_code || e.errorCode || e.code;
    var m = e.message || e.errMsg || e.errmsg || e.desc;
    /* [v369] 对象形态也映射频率/额度类错误码（截图案例：{error_code:'resource_exhausted'}） */
    var ECMAP = {
      resource_exhausted: '发送太频繁或额度已达上限：同一号码 30 秒仅 1 条、每日有发送上限。请 1 分钟后再试；若反复出现，可能是当日/当月短信额度用完',
      RESOURCE_EXHAUSTED: '发送太频繁或额度已达上限，请 1 分钟后再试',
      not_found: '该手机号尚未注册，请返回用「注册」方式获取验证码',
      invalid_argument: '验证码不正确或已失效，请重新获取短信验证码'
    };
    if (m) return { msg: String(m) + (ec && ECMAP[ec] ? '' : (ec ? '（' + ec + '）' : '')), code: ec, requestId: e.requestId || e.request_id || '', hint: ECMAP[ec] || '' };
    if (ec) return { msg: ECMAP[ec] || ('操作失败（' + ec + '）'), code: ec, requestId: e.requestId || e.request_id || '' };
    if (e.code) return { msg: String(e.code) };
    return e;
  }
  if (typeof e === 'string') {
    var MAP = {
      invalid_argument: '验证码不正确或已失效，请重新获取短信验证码',
      INVALID_PARAM: '验证码不正确或已失效，请重新获取短信验证码',
      ParamError: '验证码不正确或已失效，请重新获取短信验证码',
      OperationDenied: '操作被拒绝，请稍后再试',
      InternalError: '服务繁忙，请稍后再试',
      /* [v369] 发送频率/额度类：同号 30 秒 1 条、每日有上限、套餐月额度 */
      resource_exhausted: '发送太频繁或额度已达上限：同一号码 30 秒仅 1 条、每日有发送上限。请 1 分钟后再试；若反复出现，可能是当日/当月短信额度用完',
      RESOURCE_EXHAUSTED: '发送太频繁或额度已达上限，请 1 分钟后再试'
    };
    return { msg: MAP[e] || ('操作失败（' + e + '）') };
  }
  return { msg: '操作失败，请稍后再试' };
}
var lastSmsAt = 0;                    // 上次发码时间（前端节流用）
/* [v369] 冷却时间持久化：微信杀 webview / 刷新后 lastSmsAt 丢失，
   用户立刻再点发送 → 服务端 resource_exhausted。与票据同享 sessionStorage。 */
var SMS_AT_KEY = 'cloudSmsAt_' + (typeof ENV_ID !== 'undefined' ? ENV_ID : 'env');
function smsAtSave(t) { try { sessionStorage.setItem(SMS_AT_KEY, String(t)); } catch (e) {} }
function smsAtLoad() { try { var v = parseInt(sessionStorage.getItem(SMS_AT_KEY), 10); return isFinite(v) ? v : 0; } catch (e) { return 0; } }
if (!lastSmsAt) lastSmsAt = smsAtLoad();

/* 监听 ESM 加载完成事件（head 里的 <script type="module"> 派发） */
window.addEventListener('cloudbase-ready', function(){
  cloudSdkLoaded = true;
}, false);
// 兜底：ESM 加载挂掉时仍然能跑（本地模式），3 秒后最多给一次错
setTimeout(function(){
  if(!cloudSdkLoaded && typeof cloudbase === 'undefined'){
    /* 仍允许本地模式 */
  }
}, 3000);

function cloudAvailable(){
  return !!(
    CLOUDBASE_USE_CLOUD &&
    typeof cloudbase !== 'undefined' &&
    CLOUDBASE_ENV_ID &&
    CLOUDBASE_ACCESS_KEY
  );
}
function cloudReasonUnavailable(){
  if(!CLOUDBASE_USE_CLOUD) return 'USE_CLOUD=false（本地模式）';
  if(typeof cloudbase === 'undefined') return 'SDK 未加载';
  if(!CLOUDBASE_ENV_ID) return 'ENV_ID 为空';
  if(!CLOUDBASE_ACCESS_KEY) return 'ACCESS_KEY 为空（在 云开发平台/API Key 配置 生成 Publishable Key 并填入 cloud-sync.js 顶部）';
  return '可用';
}

/* 初始化（幂等 + 并发安全；不进行匿名登录，账号登录由 UI 触发）
   [v359] SDK 就绪等待：bundle 走普通 <script> 同步加载时立即可用，未就绪最多等 10 秒。
   [v359b 审核修复] ① 并发共享同一 pending Promise —— 修复「并发调用 initCalls=2、
          cloudApp 被第二次 init 覆盖」的回归（真实 SDK 每次 init 返回不同实例）；
          ② 就绪等待改用墙钟 deadline（原 40 次 setTimeout 计数在后台节流下会远超 10 秒）；
          ③ 成功后只清除属于初始化阶段的旧错误（sdk_not_loaded / init_failed），避免诊断误报，
             其他业务错误一律不动。 */
function cloudInit(){
  if(!CLOUDBASE_USE_CLOUD) return Promise.resolve(false);
  if(!CLOUDBASE_ACCESS_KEY){
    window._cloudLastError = {code:'no_access_key', msg:'CLOUDBASE_ACCESS_KEY 为空。请到「云开发平台/API Key 配置」生成 Publishable Key 并填入 cloud-sync.js。'};
    return Promise.resolve(false);
  }
  if(cloudApp) return Promise.resolve(true);
  if(cloudInitPending) return cloudInitPending;   /* 并发去重：同时到达的调用共享同一次初始化 */
  var wait;
  if(typeof cloudbase !== 'undefined'){
    wait = Promise.resolve(true);
  }else{
    wait = new Promise(function(resolve){
      var deadline = Date.now() + 10000;          /* 墙钟 10 秒：后台节流也能准时到期 */
      (function poll(){
        if(typeof cloudbase !== 'undefined'){ resolve(true); return; }
        if(Date.now() >= deadline){ resolve(false); return; }
        setTimeout(poll, 250);
      })();
    });
  }
  cloudInitPending = wait.then(function(sdkOk){
    if(!sdkOk){
      window._cloudLastError = {code:'sdk_not_loaded', msg:'CloudBase SDK 未加载（已等 10 秒）。请检查 pwa/vendor/cloudbase-js-sdk-3.8.2.bundle.js 是否存在/可达。'};
      return false;
    }
    if(cloudApp) return true;                     /* 双重检查：等待期间别处已完成初始化 */
    try{
      cloudApp = cloudbase.init({
        env: CLOUDBASE_ENV_ID,
        region: 'ap-shanghai',                    // ← 显式指定地域（env 在上海）
        accessKey: CLOUDBASE_ACCESS_KEY
      });
    }catch(e){
      window._cloudLastError = {code: (e && e.code) || 'init_failed', msg: (e && (e.message||e.errMsg)) || String(e), raw: e};
      return false;
    }
    try{                                          /* 只清初始化阶段自己的旧错误，其他业务错误不动 */
      var le = window._cloudLastError;
      if(le && (le.code === 'sdk_not_loaded' || le.code === 'init_failed')) window._cloudLastError = null;
    }catch(e){}
    cloudEmitStatus();
    return true;
  }).then(function(ok){
    cloudInitPending = null;                      /* 结束即释放：失败允许下次重试，成功由 cloudApp 短路 */
    return ok;
  });
  return cloudInitPending;
}

/* 兼容 v3 SDK 两种 auth 暴露形式：app.auth()（函数）或 app.auth（属性） */
function cloudAuth(){
  return (typeof cloudApp.auth === 'function') ? cloudApp.auth() : cloudApp.auth;
}

/* 登录/转正成功后刷新会员权益（若权益层已加载）。
   匿名转正 UID 不变、云端数据继承，但前端缓存的权益快照仍是匿名态，
   必须重新向服务端 init 一次，否则界面会一直显示「未开通」。 */
function cloudEntitleAfterLogin(){
  try{
    if(window.RyEntitle && typeof window.RyEntitle.onLogin === 'function'){
      window.RyEntitle.onLogin();
    }
  }catch(e){ /* 权益层异常不影响登录流程 */ }
}

/* [v358 2026-10-10] 匿名登录引导（工具端默认身份，全程无感）。
   为什么必须有它：cloudCallFn 要求 cloudReady=true，而 cloudReady 原先只在
   「显式登录 / 本地恢复」后才为真；工具端（index.html 等）只凭 Publishable Key
   初始化 ⇒ 永远未就绪 ⇒ 权益层拿不到服务端真相 ⇒ 门控只能 fail-open 全放行
   （付费墙形同虚设）。故补这个入口：init -> signInAnonymously -> cloudReady=true。
   匿名转正（手机号/邮箱注册）时 UID 不变、云端数据继承（CloudBase 官方口径），
   所以「先匿名用、后注册」不会清零权益 —— 这正是选 trial 策略的前提。 */
function cloudEnsureAnon(){
  if(!CLOUDBASE_USE_CLOUD) return Promise.resolve(false);
  if(cloudReady) return Promise.resolve(true);
  return cloudInit().then(function(ok){
    if(!ok) return false;
    var a = cloudAuth();
    if(!a) return false;
    var p = (typeof a.signInAnonymously === 'function') ? a.signInAnonymously()
          : (typeof a.signIn === 'function') ? a.signIn({ type: 'anonymous' })
          : null;
    if(!p) return false;
    return Promise.resolve(p).then(function(res){
      var u = res && res.data && res.data.user;
      cloudUid = (u && (u.id || u.uid || u._id)) || cloudUid;
      if(!cloudUid) return false;
      cloudReady = true; cloudEmitStatus();
      return true;
    }).catch(function(e){
      window._cloudLastError = { code:(e && e.code) || 'anon_signin_failed',
        msg:(e && (e.message || e.errMsg)) || String(e), raw:e };
      return false;
    });
  });
}
/* ===== [v359 2026-10-10] 账号体系统一为「手机号 + 短信验证码」 =====
   依据官方文档 docs.cloudbase.net/authentication-v2/method/sms-login（2026-10-10 核对）：
     第一步 auth.getVerification({ phone_number: '+86 13800000000' }) → verificationInfo
     第二步 用户填入 6 位验证码
     第三步 auth.signInWithSms({ verificationInfo, verificationCode, phoneNum })
   四个硬约束（踩到就整个流程废掉，别凭记忆写）：
     1. 手机号必须带区号，形如 '+86 13800000000'；传裸 11 位会被服务端拒绝；
     2. 短信验证码登录仅支持 ap-shanghai 地域（cloudInit 已显式指定 region: 'ap-shanghai'）；
     3. 控制台须先开启「身份认证 / 登录方式 / 短信验证码登录」并配置短信通道；
     4. 频率限制：单号码 30 秒 1 条、默认 30 条/天 ⇒ 前端按 60 秒节流，避免刷短信产生费用。
   注册与登录合一：未注册的手机号走完第三步即完成注册，无需单独 signUp。 */
var SMS_RESEND_SEC = 60;

/* 归一化：'13800000000' / '+8613800000000' / '86 138 0000 0000' → '+86 13800000000'；非法返回 '' */
function normPhone(p){
  var s = String((p === null || p === undefined) ? '' : p).replace(/[\s\-()]/g, '');
  if(/^\+?86\d{11}$/.test(s)) s = s.replace(/^\+?86/, '');
  return /^1[3-9]\d{9}$/.test(s) ? ('+86 ' + s) : '';
}
/* 剩余冷却秒数（供 UI 显示倒计时） */
function cloudSmsCooldown(){
  var left = Math.ceil((SMS_RESEND_SEC * 1000 - (Date.now() - lastSmsAt)) / 1000);
  return left > 0 ? left : 0;
}
/* 第一步：发送短信验证码 */
function cloudSendSmsCode(phone){
  var pn = normPhone(phone);
  if(!pn) return Promise.resolve({ok:false, error:{msg:'手机号格式不正确（需中国大陆 11 位手机号）'}});
  var wait = cloudSmsCooldown();
  if(wait > 0) return Promise.resolve({ok:false, error:{msg:'请 ' + wait + ' 秒后再获取'}, cooldown:wait});
  if(!cloudApp) return Promise.resolve({ok:false, error:{msg:'云端未初始化'}});
  var a = cloudAuth();
  if(!a || typeof a.getVerification !== 'function')
    return Promise.resolve({ok:false, error:{msg:'SDK 不支持短信验证码登录（getVerification 缺失）'}});
  return Promise.resolve(a.getVerification({ phone_number: pn })).then(function(res){
    if(res && res.error){ smsDiag('getVerification', res.error); return {ok:false, error:normCloudErr(res.error)}; }
    var info = (res && res.data) || res || null;
    smsDiag('getVerification_ok', { verification_id: !!(info && (info.verification_id || info.verificationId)), is_user: !!(info && info.is_user) });
    lastSmsTicket = { phone: pn, verificationInfo: info };
    smsTicketSave(lastSmsTicket);
    lastSmsAt = Date.now();
    smsAtSave(lastSmsAt);
    return {ok:true, phone:pn, cooldown:SMS_RESEND_SEC};
  }).catch(function(e){ smsDiag('getVerification_throw', e); return {ok:false, error:normCloudErr((e && e.error) || e)}; });
}
/* [v364 2026-10-10] 短信原始错误诊断池：任何一环的裸错误都存这里，供远程排障 */
function smsDiag(stage, raw){
  try{
    window.__rySmsDiag = window.__rySmsDiag || [];
    window.__rySmsDiag.push({ t: Date.now(), stage: stage, raw: (typeof raw === 'string' ? raw : JSON.parse(JSON.stringify(raw))) });
    if(window.__rySmsDiag.length > 20) window.__rySmsDiag.shift();
    try{ sessionStorage.setItem('rySmsDiag', JSON.stringify(window.__rySmsDiag.slice(-5))); }catch(e2){}
  }catch(e){}
  return raw;
}
/* 第三步：校验验证码并登录（未注册手机号即完成注册）。
   [v364] 改走官方推荐的 auth.verifyOtp({token, messageId, phone})：
   messageId = getVerification 返回的 verification_id（官方文档明确此组合）。
   verifyOtp 内部强制 is_user:true → 走 /v1/signin 服务端「智能注册并登录」端点，
   用户不存在时由服务端自动建户 —— 修复新号注册报 invalid_argument 的问题。
   （旧 signInWithSms 三步式对新号走客户端 /v1/signup 端点，被 PG 环境服务端拒绝。）
   verifyOtp 失败时兜底重试旧 signInWithSms 一次（老号老通道已验证可行）。 */
function cloudSignInSms(phone, code){
  var pn = normPhone(phone);
  if(!pn) return Promise.resolve({ok:false, error:{msg:'手机号格式不正确'}});
  if(!/^\d{6}$/.test(String(code === null || code === undefined ? '' : code).trim()))
    return Promise.resolve({ok:false, error:{msg:'验证码为 6 位数字'}});
  if(!lastSmsTicket) lastSmsTicket = smsTicketLoad();
  if(!lastSmsTicket || lastSmsTicket.phone !== pn)
    return Promise.resolve({ok:false, error:{msg:'验证码已失效或与手机号不匹配，请重新获取短信验证码'}});
  if(!cloudApp) return Promise.resolve({ok:false, error:{msg:'云端未初始化'}});
  var a = cloudAuth();
  var info = lastSmsTicket.verificationInfo || {};
  var vid = info.verification_id || info.verificationId || (info.data && info.data.verification_id) || '';
  var codeStr = String(code).trim();
  function extractUser(d){
    var u = d && d.user;
    if(!u && d && d.session) u = d.session.user;
    return u ? (u.id || u.uid || u._id) : null;
  }
  function finish(d){
    var uid = extractUser(d);
    if(!uid){
      /* verifyOtp 的 data 可能只带 session；兜底从 SDK 会话取 */
      return Promise.resolve(a.getSession ? a.getSession() : null).then(function(gs){
        var gu = gs && gs.data && gs.data.user;
        var g = gu ? (gu.id || gu.uid || gu._id) : null;
        if(!g) return {ok:false, error:{msg:'登录成功但未拿到 uid'}};
        return done(g);
      }).catch(function(){ return {ok:false, error:{msg:'登录成功但未拿到 uid'}}; });
    }
    return Promise.resolve(done(uid));
  }
  function done(uid){
    cloudUid = uid;
    cloudPhone = pn;
    lastSmsTicket = null;
    smsTicketClear();
    cloudReady = true; cloudEmitStatus();
    cloudEntitleAfterLogin();     /* 转正后必须重拉权益，否则界面假清零 */
    return {ok:true, uid:cloudUid, phone:cloudPhone};
  }
  var mainP;
  /* [v368] 统一路由：自己先 verify 一次拿 verification_token（验证码只消费一次），再按 is_user 选端点。
     实测教训：getVerification 返回的 is_user 字段**可能缺失**（undefined）——
     v365 的 `is_user === false` 判定把缺字段的全新号误判成老号 → 走登录 → USER_NOT_FOUND。
     新判定：is_user !== true 一律先走注册（signUp 智能注册并登录）；
     双向兜底：撞上 USER_NOT_FOUND / ALREADY_EXISTS 时用同一 verification_token 补走对面端点。 */
  var api = (a && a.oauthInstance && a.oauthInstance.authApi) || null;
  if(vid && api && typeof api.verify === 'function' && typeof api.signUp === 'function'){
    mainP = Promise.resolve(api.verify({ verification_id: vid, verification_code: codeStr })).then(function(v){
      if(v && v.error_code){ smsDiag('verify', v); throw v; }
      var vt = v && v.verification_token;
      if(!vt){ smsDiag('verify_notoken', v); throw { error_code: 'verify_no_token' }; }
      smsDiag('verify_ok', { is_user: info.is_user });
      var isAlready = function(e){
        return /ALREADY_EXISTS|already_exists/i.test(JSON.stringify(e || {}));
      };
      var isNotFound = function(e){
        return /USER_NOT_FOUND|not_found|User not exist/i.test(JSON.stringify(e || {}));
      };
      var trySignIn = function(){
        if(typeof api.signIn !== 'function') return Promise.reject({ error_code: 'no_signin_api' });
        return Promise.resolve(api.signIn({ username: pn, verification_token: vt })).then(function(sr){
          if(sr && sr.error_code){ smsDiag('signin', sr); throw sr; }
          return sr;
        });
      };
      var trySignUp = function(){
        return Promise.resolve(api.signUp({
          phone_number: pn,
          verification_token: vt,
          verification_code: codeStr
        })).then(function(sr){
          if(sr && sr.error_code){ smsDiag('signup', sr); throw sr; }
          return sr;
        });
      };
      var first = (info.is_user === true) ? trySignIn : trySignUp;
      return first().catch(function(e1){
        smsDiag('first_path_fail', e1);
        if(isNotFound(e1) || isAlready(e1)){
          smsDiag('cross_fallback', { to: (info.is_user === true) ? 'signUp' : 'signIn' });
          return (info.is_user === true) ? trySignUp().catch(function(e2){
            /* 已存在但 signUp 仍拒 ⇒ 退回 signIn（老号兜底闭环） */
            if(isAlready(e2) || isNotFound(e2)) return trySignIn();
            throw e2;
          }) : trySignIn();
        }
        throw e1;
      }).then(function(){
        return Promise.resolve(a.getSession ? a.getSession() : null).then(function(gs){ return (gs && gs.data) || {}; });
      });
    }).then(finish);
  } else if(a && typeof a.signInWithSms === 'function'){
    mainP = Promise.resolve(a.signInWithSms({
      verificationInfo: info,
      verificationCode: codeStr,
      phoneNum: pn
    })).then(function(res){
      if(res && res.error){ smsDiag('signInWithSms', res.error); throw res.error; }
      return finish(res && res.data);
    });
  } else {
    return Promise.resolve({ok:false, error:{msg:'SDK 不支持短信验证码登录（verify/signInWithSms 均缺失）'}});
  }
  /* [v365] 不再做盲重试：验证码是一次性的，重试只会把真实错误污染成「验证码失效」。
     失败原样上抛，错误对象带 rawErr 供界面/诊断展示。 */
  return mainP.catch(function(e){
    smsDiag('final_err', e);
    var rawErr; try { rawErr = JSON.parse(JSON.stringify(e)); } catch(_e){ rawErr = String(e); }
    var err = normCloudErr((e && e.error) || e);
    err.raw = rawErr;
    return {ok:false, error:err, rawErr:rawErr};
  });
}

/* ===== [v370] 密码登录：注册成功后引导设密码，之后手机号+密码登录，绕开短信频率限制 =====
   官方能力（bundle 实证）：a.setPassword({new_password})（PATCH /v1/user/password，首次设密无需旧密）；
   a.signInWithPassword({phone, password})；用户信息 hasPassword 标志（或 password==='SET'）。
   密码规则沿用官方：8-32 位，须含字母和数字。 */
function validatePassword(pw){
  pw = String(pw === null || pw === undefined ? '' : pw);
  if(pw.length < 8 || pw.length > 32) return '';
  return /[A-Za-z]/.test(pw) && /\d/.test(pw) ? pw : '';
}
function cloudHasPassword(){
  if(!cloudApp) return Promise.resolve(false);
  var a = cloudAuth();
  if(!a || typeof a.getSession !== 'function') return Promise.resolve(false);
  return Promise.resolve(a.getSession()).then(function(gs){
    var u = gs && gs.data && gs.data.user;
    return !!(u && (u.has_password || u.hasPassword || u.password === 'SET'));
  }).catch(function(){ return false; });
}
function cloudSetPassword(pw){
  pw = validatePassword(pw);
  if(!pw) return Promise.resolve({ok:false, error:{msg:'密码需 8-32 位，且同时包含字母和数字'}});
  if(!cloudApp) return Promise.resolve({ok:false, error:{msg:'云端未初始化'}});
  var a = cloudAuth();
  if(!a || typeof a.setPassword !== 'function')
    return Promise.resolve({ok:false, error:{msg:'SDK 不支持设置密码'}});
  return Promise.resolve(a.setPassword({ new_password: pw })).then(function(res){
    if(res && res.error) return {ok:false, error:normCloudErr(res.error)};
    if(res && res.error_code) return {ok:false, error:normCloudErr(res)};
    smsDiag('set_password_ok', {});
    return {ok:true};
  }).catch(function(e){ smsDiag('set_password_throw', e); return {ok:false, error:normCloudErr((e && e.error) || e), rawErr: String(e)}; });
}
function cloudSignInPassword(phone, pw){
  var pn = normPhone(phone);
  if(!pn) return Promise.resolve({ok:false, error:{msg:'手机号格式不正确'}});
  pw = String(pw === null || pw === undefined ? '' : pw);
  if(!pw) return Promise.resolve({ok:false, error:{msg:'请输入密码'}});
  if(!cloudApp) return Promise.resolve({ok:false, error:{msg:'云端未初始化'}});
  var a = cloudAuth();
  if(!a || typeof a.signInWithPassword !== 'function')
    return Promise.resolve({ok:false, error:{msg:'SDK 不支持密码登录'}});
  return Promise.resolve(a.signInWithPassword({ phone: pn, password: pw })).then(function(res){
    if(res && res.error){ smsDiag('pwd_signin', res.error); throw res.error; }
    return Promise.resolve(a.getSession ? a.getSession() : null).then(function(gs){
      var d = (gs && gs.data) || {};
      var u = d.user || (d.session && d.session.user) || null;
      var uid = u ? (u.id || u.uid || u._id) : null;
      if(!uid) return {ok:false, error:{msg:'登录成功但未拿到 uid'}};
      cloudUid = uid; cloudPhone = pn;
      cloudReady = true; cloudEmitStatus();
      cloudEntitleAfterLogin();
      return {ok:true, uid:cloudUid, phone:cloudPhone};
    });
  }).catch(function(e){
    smsDiag('pwd_signin_throw', e);
    var rawErr; try { rawErr = JSON.parse(JSON.stringify(e)); } catch(_e){ rawErr = String(e); }
    var err = normCloudErr((e && e.error) || e);
    err.raw = rawErr;
    return {ok:false, error:err, rawErr:rawErr};
  });
}

/* 云端加载：通过云函数读取 user_db/{uid}.json */
function cloudLoad(){
  if(!cloudReady || !cloudApp){
    if(typeof cloudApp === 'undefined' || typeof cloudApp.callFunction !== 'function'){
      window._cloudLastError = {code:'not_ready', msg:'云端未就绪，请先登录云端'};
    }
    return Promise.resolve(null);
  }
  return Promise.resolve(cloudApp.callFunction({
    name: CLOUDBASE_FUNCTION_NAME,
    data: { action: 'get' }
  })).then(function(res){
    var r = (res && res.result) || {};
    if(r.code === 0){
      // 兼容：旧版 payload 直接是工作台 DB；新版为 { wb, kv }
      var d = r.data;
      if(d && typeof d === 'object' && d.wb !== undefined) return d.wb;
      return d;
    }
    window._cloudLastError = {code: r.code || 'fn_failed', msg: r.message || 'syncDb 返回非零', raw: res};
    return null;
  }).catch(function(e){
    window._cloudLastError = {code: (e && e.code) || 'fn_throw', msg: (e && (e.message||e.errMsg)) || String(e), raw: e};
    return null;
  });
}

/* 云端保存：通过云函数把整个 DB JSON 写入 user_db/{uid}.json */
function cloudSave(dbObj){
  if(!cloudReady || !cloudApp) return Promise.resolve(false);
  cloudSyncing = true; cloudEmitStatus();
  return Promise.resolve(cloudApp.callFunction({
    name: CLOUDBASE_FUNCTION_NAME,
    data: { action: 'set', data: dbObj }
  })).then(function(res){
    cloudSyncing = false; cloudEmitStatus();
    var okSave = !!(res && res.result && res.result.code === 0);
    // 可选钩子：保存成功即视为「正在使用工具」，供会员激活判定使用（无副作用）
    try { if(okSave && window.RyEntitle && typeof window.RyEntitle.onSaved === 'function') window.RyEntitle.onSaved(); } catch(e){}
    return okSave;
  }).catch(function(e){
    cloudSyncing = false; cloudEmitStatus();
    window._cloudLastError = {code: (e && e.code) || 'save_throw', msg: (e && (e.message||e.errMsg)) || String(e), raw: e};
    return false;
  });
}

/* 恢复会话：SDK 默认持久化登录态，刷新页面后无需重复登录 */
function cloudRestore(){
  if(!cloudApp) return Promise.resolve(false);
  return Promise.resolve(cloudAuth().getLoginState()).then(function(st){
    var u=null;
    if(st && st.user) u = st.user.id || st.user.uid || st.user._id;
    if(!u){ return false; }
    cloudUid = u;
    cloudPhone = (st.user && (st.user.phone_number || st.user.phone || st.user.phoneNumber)) || cloudPhone;
    cloudReady = true; cloudEmitStatus();
    cloudEntitleAfterLogin();     /* 恢复登录态 = 已实名：权益必须重拉，否则刷新后显示未同步 */
    return true;
  }).catch(function(){ return false; });
}

/* 云端计算：调用 calcStage 云函数（前端只发 plant_date/crop，只收结果） */
function cloudCalcStage(payload){
  if(!cloudReady || !cloudApp) return Promise.resolve(null);
  return Promise.resolve(cloudApp.callFunction({ name:'calcStage', data: payload || {} })).then(function(res){
    var r = res && res.result;
    if(!r || r.code !== 0) return null;
    return r.data;
  }).catch(function(){ return null; });
}
/* 获取内置作物方案列表（前端只用于「方案库 / 导出」，算法与数据均来自云端） */
function cloudGetPlans(){
  if(!cloudReady || !cloudApp) return Promise.resolve(null);
  return Promise.resolve(cloudApp.callFunction({ name:'calcStage', data:{ action:'plans' } })).then(function(res){
    var r = res && res.result;
    if(!r || r.code !== 0) return null;
    return r.data;
  }).catch(function(){ return null; });
}

function cloudLogout(){
  try{ if(cloudApp && cloudAuth() && cloudAuth().signOut) cloudAuth().signOut(); }catch(e){}
  cloudUid = null; cloudPhone = ''; cloudReady = false; cloudSyncing = false;
  lastSmsTicket = null; smsTicketClear(); lastSmsAt = 0; cloudEmitStatus();
}

/* ===== [v360 2026-10-10] KV 接口迁移：callFunction(syncDb) → app.rdb() 直连 PG（路线C） =====
   背景：本环境（CloudBase 2.0 / PG 型）把所有浏览器直连云函数一刀切拦死
   （匿名/无凭证/登录用户全部 EXCEED_AUTHORITY，平台默认策略冻结不可改）；
   而 rdb 数据通道不受该闸拦（探针实证：不存在的表返回 DATABASE_PGRST205 业务错误）。
   表结构（sql/route_c_migration_v1.sql，RLS 全开，auth.uid() 锁「只能读写自己的行」）：
     ry_kv(_id text pk, uid text, k text, v jsonb, updated_at timestamptz)
   纪律：SDK rdb 返回 {data, error} —— 必须显式检查 error，严禁当「无错即成功」
   （v359c 教训：SDK 部分路径把 403 错误体当返回值 resolve，曾被误判为调通）。 */
var CLOUD_KV_TABLE = 'ry_kv';

/* rdb 句柄（SDK 未暴露 rdb 时返回 null，调用方降级） */
function cloudRdb(){
  if(!cloudReady || !cloudApp) return null;
  try{ return (typeof cloudApp.rdb === 'function') ? cloudApp.rdb() : null; }
  catch(e){ return null; }
}
function kvId(key){ return cloudUid + ':' + key; }
function kvErr(tag, e){
  window._cloudLastError = {code:(e && (e.code || e.error_code)) || (tag + '_failed'),
    msg:(e && (e.message || e.error_description || e.details)) || String(e || 'unknown'), raw:e};
}

function cloudKvSet(key, value){
  var db = cloudRdb();
  if(!db || !cloudUid) return Promise.resolve(false);
  var id = kvId(key);
  return db.from(CLOUD_KV_TABLE).select('_id').eq('_id', id).then(function(r){
    if(r && r.error){ kvErr('kvset', r.error); return false; }
    var exists = !!(r && r.data && r.data.length);
    /* [v360b] uid 列不传值，交给数据库默认 auth.uid() 自动填 ——
       实测教训：登录态下 JWT sub(数字串) ≠ SDK uid(kzcRk 串)，前端传 uid 会触发
       WITH CHECK (uid = auth.uid()) 违例 → DATABASE_42501。DB 默认值永远写对。 */
    var q = exists
      ? db.from(CLOUD_KV_TABLE).update({ v: value, updated_at: new Date().toISOString() }).eq('_id', id)
      : db.from(CLOUD_KV_TABLE).insert({ _id: id, k: String(key), v: value });
    return q.then(function(r2){
      if(r2 && r2.error){ kvErr('kvset', r2.error); return false; }
      return true;
    });
  }).catch(function(e){ kvErr('kvset_throw', e); return false; });
}
function cloudKvGet(key){
  var db = cloudRdb();
  if(!db || !cloudUid) return Promise.resolve(null);
  return db.from(CLOUD_KV_TABLE).select('v').eq('_id', kvId(key)).then(function(r){
    if(r && r.error){ kvErr('kvget', r.error); return null; }
    var row = r && r.data && r.data[0];
    return row ? (row.v === undefined ? null : row.v) : null;
  }).catch(function(e){ kvErr('kvget_throw', e); return null; });
}
function cloudKvRemove(key){
  var db = cloudRdb();
  if(!db || !cloudUid) return Promise.resolve(false);
  return db.from(CLOUD_KV_TABLE).delete().eq('_id', kvId(key)).then(function(r){
    if(r && r.error){ kvErr('kvremove', r.error); return false; }
    return true;                                  /* 删不存在的 key 也算成功（幂等） */
  }).catch(function(e){ kvErr('kvremove_throw', e); return false; });
}
function cloudKvList(prefix){
  var db = cloudRdb();
  if(!db || !cloudUid) return Promise.resolve([]);
  var p = String(prefix || '');
  /* [v360b] 不按 uid 过滤 —— RLS USING 已把可见行限定为 auth.uid() 自己的；
     前端只按 _id 前缀（cloudUid 命名空间）过滤 k 前缀。 */
  return db.from(CLOUD_KV_TABLE).select('_id,k,v').then(function(r){
    if(r && r.error){ kvErr('kvlist', r.error); return []; }
    var rows = (r && r.data) || [];
    var pre = cloudUid + ':';
    rows = rows.filter(function(x){ return String(x._id || '').indexOf(pre) === 0; });
    if(p) rows = rows.filter(function(x){ return String(x.k || '').indexOf(p) === 0; });
    return rows.map(function(x){ return { key: x.k, value: x.v }; });
  }).catch(function(e){ kvErr('kvlist_throw', e); return []; });
}

/* ===== [v360c] DB 身份助手：JWT sub（= DB 侧 auth.uid()）=====
   42501 实测教训：登录后 auth.uid() 是 JWT 的 sub（数字串），与 SDK uid（kzcRk 串）不同。
   凡要落库的 _id / 归属判定一律用 sub；SDK uid 仅作展示与 _id 前缀命名空间。 */
function cloudAuthSub(){
  try{
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf('credentials_') === 0){
        var v = localStorage.getItem(k);
        var m = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(String(v || ''));
        if(!m) continue;
        var seg = m[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        var payload = JSON.parse(decodeURIComponent(escape(atob(seg + '==='.slice((seg.length + 3) % 4)))));
        if(payload && payload.sub && payload.sub !== 'anon') return String(payload.sub);
      }
    }
  }catch(e){}
  return null;
}

function cloudOnStatus(fn){ if(typeof fn === 'function') cloudStatusListeners.push(fn); }
function cloudEmitStatus(){
  var s = cloudReady ? (cloudSyncing ? 'syncing' : 'online') : 'offline';
  cloudStatusListeners.forEach(function(f){ try{ f(s, cloudUid); }catch(e){} });
}

/* 通用云函数调用入口（新增，供 runye-entitle.js 等模块复用登录态）
   用法：CloudSync.callFn('ryEntitle', { action:'get' }) → Promise<{code,data,message}> */
function cloudCallFn(name, data){
  if(!cloudReady || !cloudApp) return Promise.resolve(null);
  return Promise.resolve(cloudApp.callFunction({ name: name, data: data || {} })).then(function(res){
    return (res && res.result) || null;
  }).catch(function(e){
    window._cloudLastError = {code:(e && e.code) || 'fn_throw', msg:(e && (e.message||e.errMsg)) || String(e), raw:e};
    return null;
  });
}

/* 暴露为全局 */
window.CloudSync = {
  available: cloudAvailable,
  reasonUnavailable: cloudReasonUnavailable,
  init: cloudInit,
  ensureAnon: cloudEnsureAnon,
  callFn: cloudCallFn,
  rdb: cloudRdb,                 /* [v360c] rdb 句柄（未登录/SDK 不支持时 null） */
  authSub: cloudAuthSub,         /* [v360c] DB 侧身份 = JWT sub（登录后可能与 uid 不同） */
  load: cloudLoad,
  save: cloudSave,
  /* [v359] 账号体系统一为手机号：邮箱三件套与 loginAndPull 已移除（全项目无调用点） */
  sendSmsCode: cloudSendSmsCode,
  signInSms: cloudSignInSms,
  smsCooldown: cloudSmsCooldown,
  /* [v370] 密码登录三件套 */
  hasPassword: cloudHasPassword,
  setPassword: cloudSetPassword,
  signInPassword: cloudSignInPassword,
  restore: cloudRestore,
  calcStage: cloudCalcStage,
  getPlans: cloudGetPlans,
  logout: cloudLogout,
  kvSet: cloudKvSet,
  kvGet: cloudKvGet,
  kvRemove: cloudKvRemove,
  kvList: cloudKvList,
  onStatus: cloudOnStatus,
  get uid(){ return cloudUid; },
  get ready(){ return cloudReady; },
  get syncing(){ return cloudSyncing; },
  get phone(){ return cloudPhone; }
};
