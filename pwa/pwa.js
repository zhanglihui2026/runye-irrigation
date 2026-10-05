/* Installation is optional and independent of irrigation business state. */
(function () {
  'use strict';
  var root = new URL('../', document.currentScript.src);
  var installPrompt = null;
  var standalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var button, status;
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault(); installPrompt = event;
    if (button) button.querySelector('small').textContent = '安装独立应用 →';
  });
  window.addEventListener('appinstalled', function () {
    installPrompt = null;
    if (button) button.hidden = true;
  });
  function guide() {
    var dialog = document.createElement('dialog');
    dialog.className = 'ry-pwa-dialog';
    var heading = document.createElement('h2'); heading.textContent = '添加到主屏幕';
    var text = document.createElement('p');
    text.textContent = ios ? '用 Safari 打开本页面，点击“分享”，选择“添加到主屏幕”，再点击“添加”。如果出现“作为 Web App 打开”，请保持开启。' : '打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。电脑端可使用 Chrome / Edge 地址栏中的安装图标。微信等内置浏览器请先选择“在浏览器打开”。';
    var note = document.createElement('p'); note.className = 'ry-pwa-note';
    note.textContent = '首次联网打开后缓存基础界面与规划代码。卫星影像、地点搜索仍需联网；绘制中的地块请在关闭前按原流程保存。';
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '知道了';
    close.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('close', function () { dialog.remove(); });
    dialog.append(heading, text, note, close); document.body.appendChild(dialog);
    dialog.showModal();
  }
  function mount() {
    var host = document.querySelector('[data-content="more"]');
    button = document.createElement('button'); button.type = 'button'; button.id = 'ryPwaInstall';
    button.className = host ? 'list-action' : 'ry-pwa-install';
    var label = document.createElement('span'); label.textContent = '添加到主屏幕';
    var hint = document.createElement('small'); hint.textContent = '独立图标 / 全屏打开 →';
    button.append(label, hint); button.hidden = !!standalone;
    button.addEventListener('click', async function () {
      if (!installPrompt) { guide(); return; }
      var prompt = installPrompt; installPrompt = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch (error) { guide(); }
    });
    (host || document.body).appendChild(button);
    /* [v230 2026-10-05 用户要求] 浮动安装提示要能关闭：「不然它跳出来，影响我操作」。
       · 仅浮动形态（无 [data-content="more"] 宿主、挂在 body 上那种）给 × 关闭钮；
         嵌在「设置」面板里的那份本身随面板开合，不加。
       · 点 × 隐藏并写入 localStorage（runye_pwa_install_dismissed=1）——
         本机此后不再弹出；想再装可走浏览器菜单，或清掉该键恢复提示。 */
    if (!host) {
      var dismissed = false;
      try { dismissed = localStorage.getItem('runye_pwa_install_dismissed') === '1'; } catch (eDismiss) { }
      if (dismissed) button.hidden = true;
      if (!button.hidden) {
        var closer = document.createElement('span');
        closer.className = 'ry-pwa-close';
        closer.textContent = '×';
        closer.setAttribute('role', 'button');
        closer.setAttribute('aria-label', '关闭安装提示，不再弹出');
        closer.title = '关闭（不再弹出）';
        /* 用 span 而非 button：HTML 不允许 button 嵌 button；stopPropagation 防触发安装 */
        closer.addEventListener('click', function (eClose) {
          eClose.stopPropagation();
          button.hidden = true;
          try { localStorage.setItem('runye_pwa_install_dismissed', '1'); } catch (eStore) { }
        });
        button.appendChild(closer);
      }
    }
    status = document.createElement('p'); status.id = 'ryPwaStatus';
    status.className = host ? 'sheet-note small-note' : 'ry-pwa-status';
    status.setAttribute('role', 'status'); (host || document.body).appendChild(status);
    var ready = false;
    function updateStatus() {
      status.textContent = navigator.onLine ? (ready ? '基础离线缓存已就绪；在线底图仍需联网。' : '首次联网打开后准备基础离线缓存。') : '当前离线：可使用已缓存界面；在线底图与搜索不可用。';
      status.hidden = !host && navigator.onLine;
    }
    updateStatus(); window.addEventListener('online', updateStatus); window.addEventListener('offline', updateStatus);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register(new URL('sw.js', root).href, {scope: root.pathname, updateViaCache: 'none'})
        .then(function () { return navigator.serviceWorker.ready; })
        .then(function () { ready = true; updateStatus(); })
        .catch(function (error) { status.textContent = '离线缓存暂未就绪，请联网后重新打开。'; console.warn('Runye PWA:', error); });
    } else {
      status.textContent = '当前浏览器不支持离线缓存，联网功能可正常使用。';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
