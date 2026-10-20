/* ============================================================
   runye-announce.js —— 润野灌溉 · 首页公告弹窗（每次访问展示）
   ------------------------------------------------------------
   用途（用户 2026-10-19 要求）：
     把「免费开源 / 纯公益 / 欢迎反馈 / 免费代绘 / 邀请 3 人升高级会员」这段公告
     做成首页弹窗，每次访问都弹一次，同时提醒注册使用。
   卸载：删掉 index.html 里的 <script src="runye-announce.js"> 一行即完全消失
        （样式是本脚本注入的 #ryAnnCss，不会残留在皮肤文件里）。
   约束（本项目铁律）：
     · body * { border-radius:0 !important } 会把圆角压平 —— 这里不写圆角，避免死声明；
     · runye-typography 对 p/li/button 打 13px !important —— 本文件的字号也必须带 !important；
     · 改动本文件必须抬 sw.js VERSION（文件在 CORE 清单里）。
   ============================================================ */
(function () {
  'use strict';

  var SITE = 'https://zhanglihui2026.github.io/runye-irrigation/';
  var SHOWN = false;

  var CSS = [
    '.ry-ann-mask{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(15,23,42,.34);z-index:11990}',
    '.ry-ann-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:11991;',
    'width:520px;max-width:calc(100vw - 28px);max-height:calc(100vh - 40px);overflow:auto;',
    'background:#fff;border:1px solid #cbd5e1;box-shadow:0 18px 48px rgba(15,23,42,.22);',
    'padding:20px 22px 18px;font-family:inherit;color:#1e293b}',
    '.ry-ann-x{position:absolute;right:8px;top:6px;width:26px;height:26px;border:0;background:transparent;',
    'color:#94a3b8;cursor:pointer;font-size:16px !important;line-height:1;padding:0}',
    '.ry-ann-x:hover{color:#334155}',
    '.ry-ann-h{margin:0 0 4px;font-size:17px !important;font-weight:700 !important;color:#173e32;line-height:1.35}',
    '.ry-ann-sub{margin:0 0 12px;font-size:12.5px !important;color:#64748b;line-height:1.6}',
    '.ry-ann-list{margin:0;padding:0;list-style:none}',
    '.ry-ann-list li{font-size:12.5px !important;line-height:1.7;color:#334155;margin:0 0 7px;padding-left:2px}',
    '.ry-ann-list li b{color:#173e32;font-weight:600}',
    '.ry-ann-url{margin:12px 0 0;padding:7px 9px;background:#f4f8f6;border:1px solid #dde8e1;',
    'font-size:12px !important;color:#2c4a3d;word-break:break-all;line-height:1.5}',
    '.ry-ann-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
    '.ry-ann-btn{flex:0 0 auto;border:1px solid #cbd5e1;background:#fff;color:#2c4a3d;cursor:pointer;',
    'padding:7px 14px;font-size:12.5px !important;font-family:inherit;font-weight:400}',
    '.ry-ann-btn:hover{background:#eaf3ed}',
    '.ry-ann-btn:active{background:#d8e9df}',
    '.ry-ann-btn.is-primary{border-color:#173e32;color:#173e32;font-weight:600}',
    '.ry-ann-btn[disabled]{opacity:.6;cursor:default}',
    '.ry-ann-note{margin:10px 0 0;font-size:11.5px !important;color:#94a3b8;line-height:1.5}'
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

    cardEl.appendChild(el('h3', 'ry-ann-h', '🔥 免费开源灌溉设计工具，欢迎体验'));
    cardEl.appendChild(el('p', 'ry-ann-sub', '电脑浏览器直接打开就能用 · 无需安装 · 无需付费'));

    var ul = el('ul', 'ry-ann-list');
    var items = [
      ['💡 ', '纯公益项目', '，目前没有任何盈利计划、无收费套路，放心使用。'],
      ['🌱 ', '初衷', '是让更多种植朋友用上简易的灌溉规划工具；靠大家实际使用发现 BUG、收集建议，不断打磨完善。'],
      ['📢 ', '遇到问题或有改进想法', '，欢迎随时反馈；不会操作也可以把地块发给我们，免费帮你绘图。'],
      ['🎁 ', '会员小规则', '：邀请 3 位朋友注册即升级高级会员，并赠送 30 天。'],
      ['📣 ', '恳请多多转发', '朋友圈、分享给做农业、搞灌溉的同行，点赞、收藏、转发支持！']
    ];
    for (var i = 0; i < items.length; i++) {
      var li = document.createElement('li');
      li.appendChild(document.createTextNode(items[i][0]));
      var b = el('b', null, items[i][1]);
      li.appendChild(b);
      li.appendChild(document.createTextNode(items[i][2]));
      ul.appendChild(li);
    }
    cardEl.appendChild(ul);

    cardEl.appendChild(el('div', 'ry-ann-url', SITE));

    var acts = el('div', 'ry-ann-acts');
    var bReg = el('button', 'ry-ann-btn is-primary', '免费注册 / 登录');
    bReg.type = 'button';
    bReg.addEventListener('click', function () { openPanel(bReg); });

    var bGo = el('button', 'ry-ann-btn', '开始使用');
    bGo.type = 'button';
    bGo.addEventListener('click', close);

    var bCopy = el('button', 'ry-ann-btn', '复制链接');
    bCopy.type = 'button';
    bCopy.addEventListener('click', function () { copyUrl(bCopy); });

    acts.appendChild(bReg); acts.appendChild(bGo); acts.appendChild(bCopy);
    cardEl.appendChild(acts);

    /* 已登录用户不必再看「注册」引导：按钮改成「查看会员权益」，语义不撒谎 */
    try {
      var en = window.RyEntitle;
      if (en && typeof en.isActive === 'function' && en.isActive()) {
        bReg.textContent = '查看会员权益';
      }
    } catch (e) { }

    cardEl.appendChild(el('p', 'ry-ann-note', '本公告每次打开工具时展示一次；会员权益与邀请进度可在顶部会员入口查看。'));

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
