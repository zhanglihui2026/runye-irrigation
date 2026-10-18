# 旧 iframe 导航壳归档

本目录保留早期页面级 iframe 导航壳的源码，便于确有需要时查阅和恢复。该模块当前不属于主程序运行链。

## 归档范围

- `source/mod/inline-31.js`：旧 `RyFrameShell` 实现，负责查找 `#ryFrameShell`、懒加载 `iframe[data-fr-page]`、页面切换和旧页面的会员门控。
- `manifest.json`：归档源码的原始路径、SHA-256 和字节数。

## 当前边界

当前 `index.html` 不包含 `#ryFrameShell` 或 `iframe[data-fr-page]`，也没有加载本模块；`sw.js` 的核心缓存清单不包含该文件。地形和水力相关页面已走主页面集成链。该归档只保存旧实现，不为主程序提供入口或依赖。

## 恢复原则

只有明确重新采用独立 iframe 页面架构时才恢复。恢复前需重新设计入口、路由和会员门控，并同步检查页面生命周期、Service Worker 缓存及导航行为；不要只把脚本标签加回主页面。

`sw.js` 中关于历史版本的注释保留为变更记录，不会加载或执行旧壳。
