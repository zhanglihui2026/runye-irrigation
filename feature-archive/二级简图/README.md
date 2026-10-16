# 二级简图（暂停入口，保留实现）

## 当前状态

二级简图不会通过界面或正常程序流程打开。原绘图、样式、数据与导出实现仍在主程序原文件中，没有删除或复制成一份容易过期的副本。

此次修复的触发原因是：生成施工图流程曾先将 `pipePlanSection` 切到 `draw`，再跳到三级工作区。虽然最终页面进入三级，二级区块的视图状态仍被留在 `draw`；某些返回路径没有把它复位到 `edit`。

## 代码位置

- `index.html`：`#pipePlanSection` 中的 `.ry-pane-draw` 是二级简图页面内容；底部 `#ppTabs` 留作隐藏的兼容容器。
- `mod/inline-09.js`：`rySetTab()` 对 `pipePlanSection/draw` 的入口保护；`ppShowConstructDiagram()` 是保留的旧入口函数。
- `mod/plot-editor.js`：`ppGenerateDiagram()` 生成二级施工图 SVG、下载和打印；生成流程不再切换到二级简图。
- `mod/style-01.css`：二级简图的布局样式仍保留；`#ryStatusBar #ppTabs` 规则仅隐藏入口容器。

## 恢复入口

需要重新开放二级简图时：

1. 在 `index.html` 的 `#ppTabs` 中恢复 `<button type="button" data-ry-view="draw">二级简图</button>`。
2. 在 `mod/inline-09.js` 的 `rySetTab()` 中移除 `pipePlanSection/draw` 保护。
3. 在 `mod/style-01.css` 中移除 `#ryStatusBar #ppTabs{display:none}`。
4. 若希望点击“生成施工图”后自动打开二级简图，在 `mod/plot-editor.js` 的 `#ppGenerate` 处理流程里调用 `ppShowConstructDiagram()`；否则只恢复手动入口。
5. 更新页面状态提示与对应验证脚本，再在浏览器中核对编辑、生成、导航返回和简图视图。

绘图实现与编辑页面共用状态、SVG 数据和主页面脚本，现阶段保持原位并用入口保护停用，避免拆成第二份代码后发生版本漂移。
