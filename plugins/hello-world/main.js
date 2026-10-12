/* hello-world —— 插件协议最小样板（30 行内跑通完整闭环）。
   学写插件请看 PLUGIN_DEV.md。 */
var unnav = null, host = null;

export function activate(ctx) {
  host = document.createElement('div');
  host.className = 'helloworld-panel';
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9998;background:#fff;border:1px solid #d8dee6;border-radius:8px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.12);font:13px/1.6 system-ui;display:none';
  host.innerHTML = '<b>插件协议自检</b><br>id=<code>' + ctx.id + '</code><br>这是插件自己的容器，主程序未受影响。';
  ctx.ui.mountPoint.appendChild(host);

  if (ctx.ui.registerNav) {
    unnav = ctx.ui.registerNav({
      label: ctx.manifest.ui && ctx.manifest.ui.nav ? ctx.manifest.ui.nav.label : '协议自检',
      /* [v401 用户指令] 协议自检折叠进导航「更多 ▾」面板 */
      container: '.fn-more-panel',
      onClick: function () { host.style.display = host.style.display === 'none' ? '' : 'none'; }
    });
  }
  ctx.runtime.log('boot', 'hello-world 已激活');
}

export function deactivate() {
  if (unnav) { try { unnav(); } catch (e) { } unnav = null; }
  if (host && host.parentNode) host.parentNode.removeChild(host);
  host = null;
}
