# 润野灌溉设计工具（整合在线地图版）

基于耐特菲姆（Netafim）数据的灌溉系统设计工具，包含在线地图面积测量功能。

## 站点结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 润野灌溉设计工具主程序（精准灌溉 / 实际方案 / 面积测量 / 管路规划 / 材料清单） |
| `runye-landing.html` | 导航门户页 |
| `runye-map-measure.html` | 在线地图面积测量（Leaflet + 高德卫星瓦片，支持在卫星图上画框实测亩数并回传设计工具） |
| `runye-irrigation-illustrated-manual.html` | 使用说明 |
| `二级系统图.html` | 二级管路系统图（接收主程序计算结果） |
| `三级系统图.html` | 三级管路系统图（接收主程序计算结果） |
| `耐特菲姆滴灌带长度查询器.html` | 滴灌带最大铺设长度查询（入口压力 × 坡度） |
| `hero-driptape.jpg` | 门户页 Hero 底图 |

## 入口

打开 `index.html` 或 `runye-landing.html` 即可使用。所有页面顶部导航栏可互相跳转，"返回主页"按钮回到门户页。

## 发布说明

本仓库用于 GitHub Pages 静态托管。根目录即站点根，仓库名 `runye-irrigation`。

> 注意：`runye-map-measure.html` 与 `index.html` 的"地图回传"功能依赖联网加载高德卫星瓦片与 Leaflet CDN，并通过 localStorage 跨页传参，发布后照常可用。
