@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  [七彩花生方案] 推送到 GitHub Pages（仅推送已提交内容，不附带其他未提交改动）
echo.
git push origin master
if errorlevel 1 (
  echo.
  echo  推送失败：请确认 GitHub Desktop 已打开并已登录，或直接在 GitHub Desktop 中选中本仓库点 Push 按钮。
) else (
  echo.
  echo  推送成功！约 1~2 分钟后生效，访问：
  echo    https://zhanglihui2026.github.io/runye-irrigation/qicai-huasheng/
)
echo.
pause
