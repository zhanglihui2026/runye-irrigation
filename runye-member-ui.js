/* ============================================================
   runye-member-ui.js —— 润野灌溉 · 会员状态胶囊 + 升级引导（工具端）
   ------------------------------------------------------------
   依赖（均为可选，缺失即降级）：
     runye-entitle.js  → 权益判定与文案
     cloud-sync.js     → 匿名登录 + 云函数调用
   卸载：删掉 <script src="runye-member-ui.js"> 一行即可；
         导航门控随之退化为「无权益层 = 全放行」（见 runye-nav.js 的 gate()）。

   对外：
     window.RyMemberUI.showUpgrade('管路拼装')  → 弹出升级引导（导航锁定项点击时调用）
     window.RyMemberUI.openPanel()              → 主动打开会员面板

   [v358 2026-10-10] 首版：L1 注册会员（限时 30 天）/ L2 高级会员 两级。
   ============================================================ */
(function () {
  'use strict';

  /* 邀请落地页（会员 H5）：v362 起指向真数据邀友页（同仓库根 invite.html） */
  var INVITE_PAGE = 'invite.html';

  function E() { return window.RyEntitle || null; }
  function invitePage() {
    var p = window.RY_INVITE_PAGE_URL ? String(window.RY_INVITE_PAGE_URL) : INVITE_PAGE;
    if (!p) return '';
    /* 绝对化：复制/分享出去的必须是完整 URL，不能是相对路径 */
    try { return new URL(p, (location && location.href) || '').toString(); } catch (e) { return p; }
  }

  /* ---------- [v361] 裂变闭环：?ref= 邀请码的消费 ----------
     之前只有「分享」没有「成团」：bindRef() 全项目零调用，好友打开
     邀请链接后没人读 ?ref= 参数，邀请人进度永远 0/3。补齐三段：
       ① 未登录：码暂存 localStorage + 底部接受条（点「立即注册」直达登录框）
       ② 注册/登录成功（doLogin）或启动就绪（boot）后：自动 bindRef
       ③ 绑定成功或本已绑定（-2）⇒ 清 URL 参数与暂存，只绑一次
     面板内另留手动填码入口作兜底（扫码打字等场景）。 */
  var REF_STORE = 'runye_ref_code';

  function refFromUrl() {
    try {
      var m = /[?&]ref=(RY[0-9A-Z]+)\b/.exec(String(location.search || ''));
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }
  function refStash(code) {
    try { localStorage.setItem(REF_STORE, String(code)); } catch (e) { }
  }
  function refTake() {
    try { return String(localStorage.getItem(REF_STORE) || ''); } catch (e) { return ''; }
  }
  function refClear(code) {
    try { localStorage.removeItem(REF_STORE); } catch (e) { }
    try {
      if (refFromUrl() === code) {
        var qs = new URLSearchParams(location.search);
        qs.delete('ref');
        var s = qs.toString();
        history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
      }
    } catch (e) { }
  }
  function loggedIn() {
    var cs = window.CloudSync;
    return !!(cs && cs.phone);
  }
  function toastBind() {
    try {
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:12001;'
        + 'background:#0f172a;color:#fff;border-radius:8px;padding:8px 14px;font-size:13px;font-family:inherit;'
        + 'box-shadow:0 8px 24px rgba(15,23,42,.25)';
      t.textContent = '已建立好友邀请关系 ✓';
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
    } catch (e) { }
  }
  /* 自动绑定：无码/未登录时返回 null，否则返回 bindRef 结果 */
  function autoBind() {
    var en = E();
    var code = refFromUrl() || refTake();
    if (!en || typeof en.bindRef !== 'function' || !code || !loggedIn()) return Promise.resolve(null);
    return Promise.resolve(en.bindRef(code, false)).then(function (r) {
      if (r && (r.ok || r.code === -2)) refClear(code);   /* 成功或本已绑定 ⇒ 消费掉 */
      if (r && r.ok) toastBind();
      return r;
    });
  }
  /* 未登录访客的底部接受条（邀请链接落地时） */
  function mountAcceptBar() {
    var code = refFromUrl() || refTake();
    if (!code || loggedIn() || document.getElementById('ryRefBar')) return;
    if (refFromUrl()) refStash(code);
    var bar = document.createElement('div');
    bar.id = 'ryRefBar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:11998;display:flex;gap:10px;'
      + 'align-items:center;justify-content:center;padding:10px 12px;background:#0f172a;color:#fff;'
      + 'font-size:13px;font-family:inherit';
    var span = document.createElement('span');
    span.textContent = '好友邀请你开通会员 · 注册即建立邀请关系';
    var b1 = document.createElement('button');
    b1.type = 'button';
    b1.style.cssText = 'border:0;background:#fff;color:#0f172a;border-radius:6px;padding:6px 12px;'
      + 'font-size:12.5px;cursor:pointer;font-family:inherit';
    b1.textContent = '立即注册';
    b1.addEventListener('click', function () {
      var anchor = pills[0] || document.body;
      openAt(anchor, '会员中心', null);
    });
    var b2 = document.createElement('button');
    b2.type = 'button';
    b2.style.cssText = 'border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:12.5px;font-family:inherit';
    b2.textContent = '暂不';
    b2.addEventListener('click', function () { if (bar.parentNode) bar.parentNode.removeChild(bar); });
    bar.appendChild(span); bar.appendChild(b1); bar.appendChild(b2);
    document.body.appendChild(bar);
  }

  /* ---------- 样式（内联注入：卸载本脚本即消失，不污染其它皮肤文件） ---------- */
  var CSS = [
    '.ry-mbr{position:relative;display:inline-flex;align-items:center;order:998;margin-left:2px}',
    '.ry-mbr-btn{border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:999px;',
    'padding:3px 10px;font-size:12px;line-height:1.5;cursor:pointer;white-space:nowrap;font-family:inherit}',
    '.ry-mbr-btn:hover{background:#eef2f7}',
    '.ry-mbr-btn.is-pro{border-color:#f59e0b;background:#fffbeb;color:#92400e}',
    '.ry-mbr-btn.is-trial{border-color:#cbd5e1;color:#64748b}',
    '.ry-mbr-btn.is-expired{border-color:#fca5a5;background:#fef2f2;color:#b91c1c}',
    '.ry-mbr-mask{position:fixed;left:0;top:0;right:0;bottom:0;z-index:11999}',
    '.ry-mbr-panel{position:fixed;z-index:12000;width:320px;max-width:calc(100vw - 24px);',
    'background:#fff;border:1px solid #e2e8f0;border-radius:10px;',
    'box-shadow:0 12px 32px rgba(15,23,42,.16);padding:14px 16px;font-size:13px;color:#1e293b}',
    '.ry-mbr-panel h4{margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a}',
    '.ry-mbr-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:#475569}',
    '.ry-mbr-row b{color:#0f172a;font-weight:600}',
    '.ry-mbr-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;letter-spacing:1px}',
    '.ry-mbr-tip{margin:8px 0 0;color:#64748b;font-size:12px;line-height:1.6}',
    '.ry-mbr-tip.warn{color:#b45309}',
    '.ry-mbr-feats{margin:8px 0 0;padding-left:18px;color:#475569;font-size:12.5px;line-height:1.7}',
    '.ry-mbr-acts{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
    '.ry-mbr-acts button{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:6px;',
    'padding:6px 12px;font-size:12.5px;cursor:pointer;font-family:inherit}',
    '.ry-mbr-acts button.primary{border-color:#0f172a;background:#0f172a;color:#fff}',
    '.ry-mbr-acts button:disabled{opacity:.55;cursor:default}',
    /* [v359] 手机号 + 短信验证码登录框 */
    '.ry-mbr-login{margin-top:10px;padding:10px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc}',
    '.ry-mbr-lrow{display:flex;gap:6px;margin-bottom:6px}',
    '.ry-mbr-input{flex:1;min-width:0;border:1px solid #cbd5e1;border-radius:6px;',
    'padding:6px 8px;font-size:13px;font-family:inherit;color:#0f172a;background:#fff}',
    '.ry-mbr-codebtn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:6px;',
    'padding:6px 10px;font-size:12.5px;cursor:pointer;white-space:nowrap;font-family:inherit}',
    '.ry-mbr-login button.primary{border-color:#0f172a;background:#0f172a;color:#fff;border-radius:6px;',
    'padding:6px 12px;font-size:12.5px;cursor:pointer;white-space:nowrap;font-family:inherit}',
    '.ry-mbr-login button:disabled{opacity:.55;cursor:default}'
  ].join('');

  function injectCss() {
    if (document.getElementById('ryMbrCss')) return;
    var s = document.createElement('style');
    s.id = 'ryMbrCss';
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- [v359] 手机号 + 短信验证码登录框 ----------
     账号体系统一为手机号（CloudBase v2 官方三步：getVerification → 用户填码 → signInWithSms）。
     手机号补区号、6 位验证码校验、60 秒节流全在 cloud-sync.js 里，UI 只负责收发与提示。 */
  function buildLoginBox() {
    var box = document.createElement('div');
    box.className = 'ry-mbr-login';

    var msg = document.createElement('p');
    msg.className = 'ry-mbr-tip';
    function setMsg(t, warn) { msg.textContent = t; msg.className = 'ry-mbr-tip' + (warn ? ' warn' : ''); }

    function mkRow(ph, btnText, primary) {
      var row = document.createElement('div');
      row.className = 'ry-mbr-lrow';
      var input = document.createElement('input');
      input.className = 'ry-mbr-input';
      input.placeholder = ph;
      var btn = document.createElement('button');
      btn.type = 'button';
      if (primary) btn.className = 'primary'; else btn.className = 'ry-mbr-codebtn';
      btn.textContent = btnText;
      row.appendChild(input); row.appendChild(btn);
      return { row: row, input: input, btn: btn };
    }

    var r1 = mkRow('11 位手机号', '获取验证码', false);
    r1.input.type = 'tel';
    r1.input.maxLength = 13;
    r1.input.setAttribute('inputmode', 'numeric');
    var r2 = mkRow('6 位验证码', '登录 / 注册', true);
    r2.input.maxLength = 6;
    r2.input.setAttribute('inputmode', 'numeric');

    box.appendChild(r1.row);
    box.appendChild(r2.row);
    box.appendChild(msg);

    var timer = null;
    function tick() {
      var CS = window.CloudSync;
      var left = (CS && typeof CS.smsCooldown === 'function') ? CS.smsCooldown() : 0;
      if (left > 0) { r1.btn.disabled = true; r1.btn.textContent = left + ' 秒后重发'; }
      else {
        r1.btn.disabled = false; r1.btn.textContent = '获取验证码';
        if (timer) { clearInterval(timer); timer = null; }
      }
    }

    r1.btn.addEventListener('click', function () {
      var CS = window.CloudSync;
      if (!CS || typeof CS.sendSmsCode !== 'function') { setMsg('云端未就绪，请稍后再试。', true); return; }
      setMsg('正在发送…');
      r1.btn.disabled = true;
      CS.sendSmsCode(r1.input.value).then(function (r) {
        if (r && r.ok) {
          setMsg('验证码已发送至 ' + r.phone + '。');
          tick();
          if (!timer) timer = setInterval(tick, 1000);
        } else {
          setMsg('发送失败：' + ((r && r.error && r.error.msg) || (r && r.message) || '未知错误'), true);
          r1.btn.disabled = false;
        }
      });
    });

    function doLogin() {
      var CS = window.CloudSync;
      if (!CS || typeof CS.signInSms !== 'function') { setMsg('云端未就绪，请稍后再试。', true); return; }
      setMsg('正在登录…');
      r2.btn.disabled = true;
      CS.signInSms(r1.input.value, r2.input.value).then(function (r) {
        r2.btn.disabled = false;
        if (r && r.ok) {
          setMsg('登录成功，正在刷新会员权益…');
          if (timer) { clearInterval(timer); timer = null; }
          /* 权益已由 cloud-sync 的 cloudEntitleAfterLogin 重新拉取；
             [v361] 若此前通过邀请链接暂存/带来了 ?ref= 码，登录即自动绑定 */
          setTimeout(function () {
            autoBind().then(function () {
              try { closePanel(); RyMemberUI.openPanel(); } catch (e) { }
            });
          }, 600);
        } else {
          setMsg('登录失败：' + ((r && r.error && r.error.msg) || (r && r.message) || '未知错误'), true);
        }
      });
    }
    r2.btn.addEventListener('click', doLogin);
    r2.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    r1.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') r2.input.focus(); });

    box.appendChild(tip('未注册的手机号将直接完成注册，并开通 30 天注册会员。'));
    return box;
  }

  /* ---------- 面板 ---------- */
  var maskEl = null, panelEl = null;

  function closePanel() {
    if (maskEl && maskEl.parentNode) maskEl.parentNode.removeChild(maskEl);
    if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
    maskEl = null; panelEl = null;
  }

  function row(label, valueText, mono) {
    var r = document.createElement('div');
    r.className = 'ry-mbr-row';
    var a = document.createElement('span');
    a.textContent = label;
    var b = document.createElement('b');
    b.textContent = valueText;
    if (mono) b.className = 'ry-mbr-code';
    r.appendChild(a); r.appendChild(b);
    return r;
  }

  function tip(text, warn) {
    var p = document.createElement('p');
    p.className = 'ry-mbr-tip' + (warn ? ' warn' : '');
    p.textContent = text;
    return p;
  }

  /* 复制（三级降级：clipboard API → execCommand → 提示手选） */
  function copyText(text, btn) {
    function done(ok) {
      if (btn) {
        btn.textContent = ok ? '已复制' : '复制失败';
        setTimeout(function () { if (btn.parentNode) btn.textContent = '复制邀请链接'; }, 1600);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        done(ok);
      } catch (e) { done(false); }
    }
  }

  function buildPanel(titleText, extraTopNode) {
    var en = E();
    var p = document.createElement('div');
    p.className = 'ry-mbr-panel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', '会员中心');

    var h = document.createElement('h4');
    h.textContent = titleText;
    p.appendChild(h);

    if (extraTopNode) p.appendChild(extraTopNode);

    if (!en) {
      p.appendChild(tip('权益层未加载，当前按「全部可用」运行。', true));
      return p;
    }

    p.appendChild(row('当前身份', en.planName()));
    p.appendChild(row('有效期至', en.expireText()));
    if (typeof en.ready !== 'function' || !en.ready()) {
      /* 与 gate() 的 fail-open 保持一致：未同步 ⇒ 功能可用，文案不能说「已到期」 */
      p.appendChild(tip('云端权益尚未同步（离线或网络较慢）。此时功能全部可用，不影响使用。', true));
    } else if (en.isTrial()) {
      p.appendChild(tip('未登录 · 试用中：四大功能可用，注册/登录后开始计时（30 天）。'));
    } else if (en.isActive()) {
      p.appendChild(row('剩余天数', en.daysLeft() + ' 天'));
    } else {
      p.appendChild(tip('会员已到期，续费后恢复高级功能。', true));
    }
    /* 登录入口统一按「权益是否激活」判定，不能用 isTrial()：
       isTrial() 依赖 state，而 state 未拉取时恒为 false —— 那会导致
       「明明没登录，界面却不给登录入口」（本轮冒烟 S6 实测踩到）。 */
    if (!en.isActive()) p.appendChild(buildLoginBox());

    /* 已解锁功能清单 */
    var ul = document.createElement('ul');
    ul.className = 'ry-mbr-feats';
    en.featureKeys().forEach(function (k) {
      var li = document.createElement('li');
      li.textContent = (en.FEATURES && en.FEATURES[k]) || k;
      ul.appendChild(li);
    });
    p.appendChild(ul);

    /* 邀请码与进度 */
    var code = en.myCode();
    if (code) {
      p.appendChild(row('我的邀请码', code, true));
      var pr = en.progress();
      /* [v367 规则改版] 注册即激活、无冷静期：注册成功即刻计入 */
      var activated = Math.min(3, pr.capped || 0);
      var remainActive = Math.max(0, 3 - activated);
      p.appendChild(row('邀请进度', activated + ' / 3' + (remainActive ? '（还差 ' + remainActive + ' 人注册）' : '')));
    } else {
      p.appendChild(tip('尚未获取到邀请码（云端未就绪），稍后重试或刷新页面。', true));
    }

    /* [v361] 手动填码兜底：仅登录后显示（匿名期走接受条自动暂存） */
    if (loggedIn() && typeof en.bindRef === 'function') {
      var bindRow = document.createElement('div');
      bindRow.className = 'ry-mbr-lrow';
      var bindInput = document.createElement('input');
      bindInput.className = 'ry-mbr-input';
      bindInput.placeholder = '有好友邀请码？在此填写';
      bindInput.maxLength = 20;
      var bindBtn = document.createElement('button');
      bindBtn.type = 'button';
      bindBtn.className = 'primary';
      bindBtn.textContent = '绑定';
      bindBtn.addEventListener('click', function () {
        var v = bindInput.value.trim();
        if (!v) return;
        bindBtn.disabled = true; bindBtn.textContent = '绑定中…';
        en.bindRef(v, false).then(function (r) {
          bindBtn.disabled = false; bindBtn.textContent = '绑定';
          if (r && r.ok) { toastBind(); closePanel(); RyMemberUI.openPanel(); }
          else { bindInput.value = ''; bindInput.placeholder = (r && r.message) || '绑定失败'; }
        });
      });
      bindRow.appendChild(bindInput); bindRow.appendChild(bindBtn);
      p.appendChild(bindRow);
    }

    var acts = document.createElement('div');
    acts.className = 'ry-mbr-acts';

    var bCopy = document.createElement('button');
    bCopy.type = 'button';
    bCopy.className = 'primary';
    bCopy.textContent = '复制邀请链接';
    bCopy.disabled = !code;
    bCopy.addEventListener('click', function () {
      /* [v365b] t=时间戳 nonce：防微信 webview 用缓存的旧 HTML（旧 HTML 引旧 JS，修复永远到不了对方手机） */
      var url = en.inviteUrl(invitePage() || (location && location.href) || '');
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
      copyText(url, bCopy);
    });
    acts.appendChild(bCopy);

    var pg = invitePage();
    if (pg) {
      var bGo = document.createElement('button');
      bGo.type = 'button';
      bGo.textContent = '打开邀请页';
      bGo.addEventListener('click', function () { window.open(pg, '_blank'); });
      acts.appendChild(bGo);
    }

    var bClose = document.createElement('button');
    bClose.type = 'button';
    bClose.textContent = '关闭';
    bClose.addEventListener('click', closePanel);
    acts.appendChild(bClose);

    p.appendChild(acts);
    p.appendChild(tip('邀请 3 位好友注册成功，即可升级高级会员（出图 / 导出清单 / 水利校验等全部功能）。注册即刻计入，无需好友再做其他操作。'));
    return p;
  }

  function place(anchor) {
    var r = anchor.getBoundingClientRect();
    var w = panelEl.offsetWidth || 320;
    var left = Math.min(Math.max(8, r.right - w), (window.innerWidth || 1024) - w - 8);
    var top = r.bottom + 6;
    var h = panelEl.offsetHeight || 320;
    if (top + h > (window.innerHeight || 768) - 8) top = Math.max(8, r.top - h - 6);
    panelEl.style.left = Math.round(left) + 'px';
    panelEl.style.top = Math.round(top) + 'px';
  }

  function openAt(anchor, titleText, extraTopNode) {
    closePanel();
    injectCss();
    maskEl = document.createElement('div');
    maskEl.className = 'ry-mbr-mask';
    maskEl.addEventListener('click', closePanel);
    panelEl = buildPanel(titleText, extraTopNode);
    document.body.appendChild(maskEl);
    document.body.appendChild(panelEl);
    place(anchor);
  }

  /* ---------- 胶囊 ---------- */
  var pills = [];

  function pillClass(en) {
    if (!en) return '';
    if (en.isTrial()) return 'is-trial';
    if (!en.isActive()) return 'is-expired';
    return en.plan() === 'L2' ? 'is-pro' : '';
  }

  function pillText(en) {
    if (!en) return '会员';
    var t = en.statusText();
    return t.length > 16 ? t.slice(0, 15) + '…' : t;
  }

  function refreshPills() {
    var en = E();
    for (var i = 0; i < pills.length; i++) {
      var b = pills[i];
      b.textContent = pillText(en);
      b.className = 'ry-mbr-btn ' + pillClass(en);
      b.title = en ? ('会员中心 · ' + en.statusText()) : '会员中心（权益层未加载）';
    }
  }

  function mountPills() {
    var hosts = document.querySelectorAll('[data-ry-fnnav]');
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].querySelector('.ry-mbr')) continue;   /* 幂等：重复调用不堆积 */
      var wrap = document.createElement('span');
      wrap.className = 'ry-mbr';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ry-mbr-btn';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        openAt(this, '会员中心', null);
      });
      wrap.appendChild(b);
      hosts[i].appendChild(wrap);
      pills.push(b);
    }
    refreshPills();
  }

  /* ---------- 对外 ---------- */
  var RyMemberUI = {
    openPanel: function () {
      var anchor = pills[0] || document.body;
      openAt(anchor, '会员中心', null);
    },
    /* 导航锁定项点击 → 升级引导（runye-nav.js 的 showUpgrade 优先调这里） */
    showUpgrade: function (label) {
      var anchor = pills[0] || document.body;
      var box = document.createElement('div');
      var p1 = document.createElement('p');
      p1.className = 'ry-mbr-tip warn';
      p1.textContent = '「' + label + '」为高级会员功能，当前身份不可用。';
      box.appendChild(p1);
      var p2 = document.createElement('p');
      p2.className = 'ry-mbr-tip';
      p2.textContent = '邀请 3 位好友注册成功，即可升级高级会员（含出图 / 导出清单 / 水利校验等全部功能）。注册即刻计入。';
      box.appendChild(p2);
      /* 未登录时把登录框直接放进引导里：用户在这里第一次意识到「要开通」，
         必须当场能注册，而不是先关弹窗再去找入口。 */
      var en = E();
      if (en && !en.isActive()) box.appendChild(buildLoginBox());
      openAt(anchor, '开通高级会员', box);
    },
    close: closePanel,
    /* [v361] 测试/外部触发：消费 ?ref= 或暂存码 */
    autoBind: autoBind,
    refFromUrl: refFromUrl
  };
  window.RyMemberUI = RyMemberUI;

  /* ---------- 引导：加载 SDK → 拉权益 ----------
     为什么在这里动态 import，而不是在页面写 <script type="module">：
       1) 页面内联 module 会被 verify_ry_tool.js 的内联脚本语法检查当作普通脚本，
          里面的 import 语句会被判为语法错误（误报 FAIL）；
       2) 动态 import() 在经典脚本里合法，且失败可静默降级。
     双重保险：若页面（如 cloud-diag.html）已经用 module 注入了 window.cloudbase，
     这里直接复用；否则自己加载。加载失败 ⇒ 权益层不就绪 ⇒ 门控保持全放行，不锁用户。 */
  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@3.8.2/+esm';

  function whenSdk(cb) {
    var done = false;
    function once() { if (done) return; done = true; cb(); }
    if (window.cloudbase) { once(); return; }
    window.addEventListener('cloudbase-ready', once, false);
    try {
      Promise.resolve(import(SDK_URL)).then(function (m) {
        window.cloudbase = (m && m.default) || m;
        try { window.dispatchEvent(new Event('cloudbase-ready')); } catch (e) { }
        once();
      }, function () { once(); });
    } catch (e) { once(); }
    setTimeout(once, 6000);   /* 6 秒兜底：超时也走一次（会失败并保持放行） */
  }

  function boot() {
    var en = E();
    if (!en) { mountPills(); return; }
    /* [v364b] 兜底：带 ?ref= 落到工具页的邀请链接（旧缓存/外部入口），一律转到 H5 注册页。
       invite.html 不加载本脚本，无循环风险。 */
    try {
      var ref0 = (typeof refFromUrl === 'function') ? refFromUrl() : '';
      if (ref0 && !/invite\.html$/.test(String(location.pathname))) {
        var pg0 = invitePage();
        if (pg0) {
          var grp = /[?&]from=group/.test(String(location.search)) ? '&from=group' : '';
          location.replace(pg0.split('#')[0].split('?')[0] + '?ref=' + encodeURIComponent(ref0) + grp);
          return;
        }
      }
    } catch (e) { /* 转跳失败则按原 v361 流程本地处理 */ }
    if (typeof en.onChange === 'function') en.onChange(refreshPills);
    mountPills();
    mountAcceptBar();   /* [v361] 邀请链接落地：未登录先出接受条并暂存码 */
    whenSdk(function () {
      var cs = window.CloudSync;
      var pre = (cs && typeof cs.ensureAnon === 'function') ? cs.ensureAnon() : Promise.resolve(false);
      Promise.resolve(pre).then(function () {
        return en.init();
      }).then(function () {
        refreshPills();
        /* [v361] 登录态访客直接带 ?ref= 打开 ⇒ 启动即自动绑定 */
        return autoBind();
      }).then(function () {
        refreshPills();
        /* 通知导航：权益已就绪，可以重渲染上锁了 */
        try { document.dispatchEvent(new Event('ryentitle-ready')); } catch (e) { }
      }, function () { /* 静默失败：门控保持放行 */ });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { injectCss(); mountPills(); boot(); });
  } else {
    injectCss(); mountPills(); boot();
  }
})();
