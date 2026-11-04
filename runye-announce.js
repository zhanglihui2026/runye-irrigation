/* ============================================================
   runye-announce.js —— 润野灌溉 · 首页公告弹窗（每次访问展示）
   ------------------------------------------------------------
   用途：把「免费开源 / 纯公益 / 欢迎反馈 BUG / 邀 3 位好友注册解锁高级会员 / 欢迎转发」
     做成首页弹窗，每次访问都弹一次。
   [v962] 用户 2026-11-04 要求**简化**成一段话 + 站点地址：
     「免费开源灌溉设计工具｜纯公益，无收费套路，欢迎反馈 BUG，邀 3 位好友注册，解锁高级会员，
       浏览器即开即用，欢迎转发给农业灌溉同行」+ 网址。
     ⇒ 删掉原来的（副标题 + 5 条列表 + 页脚说明），卡片宽度 520→420，
       只留两个动作：复制链接 / 免费注册（已登录时改「查看会员权益」）。
  卸载：删掉 index.html 里的 <script src="runye-announce.js"> 一行即完全消失
        （样式是本脚本注入的 #ryAnnCss，不会残留在皮肤文件里）。
   约束（本项目铁律）：
     · body * { border-radius:0 !important } 会把圆角压平 —— 这里不写圆角，避免死声明；
     · runye-typography 对 p/li/button 打 13px !important —— 本文件的字号也必须带 !important；
     · 改动本文件必须抬 sw.js VERSION（文件在 CORE 清单里），并抬 index.html 里本脚本的 ?v=
       （它原来停在 621-invite-l2 这种「一次性」串上，只抬 sw 不抬它，浏览器会继续吃旧缓存）。
   ============================================================ */
(function () {
  'use strict';

  var SITE = 'https://zhanglihui2026.github.io/runye-irrigation/';
  var SHOWN = false;

  var CSS = [
    '.ry-ann-mask{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(15,23,42,.34);z-index:11990}',
    '.ry-ann-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:11991;',
    'width:420px;max-width:calc(100vw - 28px);max-height:calc(100vh - 40px);overflow:auto;',
    'background:#fff;border:1px solid #cbd5e1;box-shadow:0 18px 48px rgba(15,23,42,.22);',
    'padding:16px 18px 14px;font-family:inherit;color:#1e293b}',
    '.ry-ann-x{position:absolute;right:8px;top:6px;width:26px;height:26px;border:0;background:transparent;',
    'color:#94a3b8;cursor:pointer;font-size:16px !important;line-height:1;padding:0}',
    '.ry-ann-x:hover{color:#334155}',
    '.ry-ann-h{margin:0 0 8px;font-size:16px !important;font-weight:700 !important;color:#173e32;line-height:1.35}',
    '.ry-ann-main{margin:0 0 12px;font-size:12.5px !important;line-height:1.75;color:#334155}',
    '.ry-ann-main b{color:#173e32;font-weight:600}',
    '.ry-ann-url{display:block;margin:0;padding:7px 9px;background:#f4f8f6;border:1px solid #dde8e1;',
    'font-size:12px !important;color:#2c4a3d;word-break:break-all;line-height:1.5;text-decoration:none}',
    '.ry-ann-url:hover{background:#eaf3ed;text-decoration:underline}',
    '.ry-ann-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
    '.ry-ann-btn{flex:0 0 auto;border:1px solid #cbd5e1;background:#fff;color:#2c4a3d;cursor:pointer;',
    'padding:7px 14px;font-size:12.5px !important;font-family:inherit;font-weight:400}',
    '.ry-ann-btn:hover{background:#eaf3ed}',
    '.ry-ann-btn:active{background:#d8e9df}',
    '.ry-ann-btn.is-primary{border-color:#173e32;color:#173e32;font-weight:600}'
  ].join('');

  function injectCss() {
    if (document.getElementById('ryAnnCss')) return;
    var s = document.createElement('style');
    s.id = 'ryAnnCss';
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function copyUrl(btn) {
    var done = function (ok) {
      var old = btn.textContent;
      btn.textContent = ok ? '已复制 ✓' : '复制失败，请长按选择';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(SITE).then(function () { done(true); }, function () { fallback(); });
        return;
      }
    } catch (e) { }
    fallback();
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = SITE;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        done(!!ok);
      } catch (e2) { done(false); }
    }
  }

  function openPanel(btn) {
    var UI = window.RyMemberUI;
    if (UI && typeof UI.openPanel === 'function') {
      close();
      try { UI.openPanel(); } catch (e) { }
      return;
    }
    /* 会员模块未就绪（脚本被裁掉 / 离线）：不假装能注册，直接说明并复制链接 */
    btn.textContent = '会员模块未加载，可先复制链接';
    setTimeout(function () { btn.textContent = '免费注册 / 登录'; }, 2000);
  }

  var maskEl = null, cardEl = null;
  function close() {
    if (maskEl && maskEl.parentNode) maskEl.parentNode.removeChild(maskEl);
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    maskEl = cardEl = null;
    document.removeEventListener('keydown', onKey, false);
  }
  function onKey(e) { if (e && e.key === 'Escape') close(); }

  function build() {
    injectCss();
    maskEl = el('div', 'ry-ann-mask');
    maskEl.addEventListener('click', close);

    cardEl = el('div', 'ry-ann-card');
    cardEl.setAttribute('role', 'dialog');
    cardEl.setAttribute('aria-modal', 'true');
    cardEl.setAttribute('aria-label', '润野灌溉工具公告');

    var x = el('button', 'ry-ann-x', '\u00d7');
    x.type = 'button';
    x.title = '关闭公告';
    x.addEventListener('click', close);
    cardEl.appendChild(x);

    /* [v962 简化] 标题 + 一段话 + 站点地址，就这三块。
       拆句来源（用户 2026-11-04 给的原文）：
       「免费开源灌溉设计工具｜纯公益，无收费套路，欢迎反馈 BUG，邀 3 位好友注册，
         解锁高级会员，浏览器即开即用，欢迎转发给农业灌溉同行」
       竖线前的「免费开源灌溉设计工具」作标题，其余作正文；两个关键卖点加粗，
       其余保持常规字重 —— 一段话读下来比 5 条列表快得多。 */
    cardEl.appendChild(el('h3', 'ry-ann-h', '免费开源灌溉设计工具'));

    var main = el('p', 'ry-ann-main');
    main.appendChild(el('b', null, '纯公益，无收费套路'));
    main.appendChild(document.createTextNode('，欢迎反馈 BUG，'));
    main.appendChild(el('b', null, '邀 3 位好友注册，解锁高级会员'));
    main.appendChild(document.createTextNode('，浏览器即开即用，欢迎转发给农业灌溉同行'));
    cardEl.appendChild(main);

    /* 地址做成可点链接（原先是不可点的 div）：这段公告的核心动作之一就是「转发」，
       能直接点开/右键复制，比让人手抄一行 URL 强。 */
    var url = el('a', 'ry-ann-url', SITE);
    url.href = SITE;
    url.target = '_blank';
    url.rel = 'noopener';
    url.title = '打开工具首页';
    cardEl.appendChild(url);

    var acts = el('div', 'ry-ann-acts');
    var bReg = el('button', 'ry-ann-btn is-primary', '免费注册 / 登录');
    bReg.type = 'button';
    bReg.addEventListener('click', function () { openPanel(bReg); });

    var bCopy = el('button', 'ry-ann-btn', '复制链接');
    bCopy.type = 'button';
    bCopy.addEventListener('click', function () { copyUrl(bCopy); });

    acts.appendChild(bReg); acts.appendChild(bCopy);
    cardEl.appendChild(acts);

    /* 已登录用户不必再看「注册」引导：按钮改成「查看会员权益」，语义不撒谎 */
    try {
      var en = window.RyEntitle;
      if (en && typeof en.isActive === 'function' && en.isActive()) {
        bReg.textContent = '查看会员权益';
      }
    } catch (e) { }

    document.body.appendChild(maskEl);
    document.body.appendChild(cardEl);
    document.addEventListener('keydown', onKey, false);
  }

  function show() {
    if (SHOWN) return;
    if (!document.body) return;
    SHOWN = true;
    /* 首屏渲染完再弹：不让公告抢在地块/图形测量之前占住布局 */
    setTimeout(function () {
      try { build(); } catch (e) { }
    }, 600);
  }

  window.RyAnnounce = { show: function () { SHOWN = false; show(); }, close: close, url: SITE };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show, false);
  } else {
    show();
  }
})();
