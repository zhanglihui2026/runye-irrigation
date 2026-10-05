# 润野灌溉 PWA

GitHub Pages 地址：https://zhanglihui2026.github.io/runye-irrigation/

## 安装

- 安卓：Chrome / Edge 打开网站，手机“更多 → 添加到主屏幕”，或浏览器菜单“安装应用 / 添加到主屏幕”。浏览器决定是否显示原生安装提示。
- 苹果手机：Safari 打开网站，“分享 → 添加到主屏幕 → 添加”；如显示“作为 Web App 打开”，保持开启。
- 电脑：Chrome / Edge 打开网站，点击地址栏安装图标。手机以全屏模式打开；不支持 fullscreen 的浏览器回退到 standalone，iOS 可能保留系统状态栏。
- 微信内置浏览器请先转到系统浏览器。首次联网打开完成缓存后，再进行离线使用。

## 缓存范围

`sw.js` 缓存四个主要入口及其静态 JS/CSS、安装图标、Leaflet 1.9.4。Leaflet 保留原 CDN 引用，Service Worker 用相同版本的本地副本提供离线响应，没有改动地图业务代码。

手机基础界面、参数设置、地块几何划分代码可离线加载；卫星/街道底图、在线地点搜索、云端服务仍需网络。未缓存的其他页面显示离线说明。缓存不等于项目自动保存，也不会改变现有地块保存流程。浏览器可能清理缓存；再次联网打开会重新建立。

四个已有 HTML 只增加 manifest、图标、Apple 元信息、独立 PWA 样式和脚本引用。原业务 JS/CSS 与 localStorage 设置均保持不变。新文件都使用相对路径，支持 GitHub Pages `/runye-irrigation/` 子目录和本地 localhost。

## 发布与更新

提交这些静态文件到 GitHub Pages 的 master 发布分支，无需后端和构建服务器。HTTPS 为 Pages 自带。

每次修改离线核心资源清单或缓存策略，递增 `sw.js` 中的 VERSION。清单内的所有文件必须存在；任何一个下载失败都不会激活新 Worker。在线请求优先使用服务器；无网络才回退缓存。新 Worker 在旧应用窗口全部关闭后激活，不会强制刷新正在绘制的地块。只清理本应用路径的旧版本缓存，不清除项目数据。

运行 `node --check sw.js`、`node --check pwa/pwa.js`；浏览器 Application 面板检查 manifest 和 Service Worker，再断网刷新手机地图验证离线加载。缓存不包含远程地图瓦片，运行时最多缓存 80 个、每个不超过 2 MB 的同源静态文件。
