@echo off
chcp 65001 >nul
REM ===========================================================
REM  润野灌溉设计工具 - 一键推送更新脚本
REM  用法：改完 C:\Users\AHS\runye-irrigation 里的文件后，双击本脚本
REM ===========================================================
cd /d "%~dp0"

echo.
echo  ================================
echo   润野灌溉 一键推送 (GitHub Pages)
echo  ================================
echo.

REM 检查 remote 是否设置
git remote -v | findstr /C:"origin" >nul
if errorlevel 1 (
  echo [错误] 未检测到 remote，请先按发布流程连好 GitHub 仓库。
  goto :end
)

REM 显示将要提交的改变
echo [1/3] 检查改动：
git status --short
echo.

REM 若有改动则提交
git diff --quiet && git diff --cached --quiet
if errorlevel 1 (
  set /p MSG=请输入本次更新说明（回车用默认）： 
  if "%MSG%"=="" set MSG=更新网页内容 %date% %time%
  echo [2/3] 提交改动：%MSG%
  git add -A
  git commit -m "%MSG%"
) else (
  echo 没有检测到文件改动，仍会执行推送以同步远程。
)

echo [3/3] 推送到 GitHub（自动触发 Pages 重新部署）...
git push origin main

if errorlevel 1 (
  echo.
  echo [失败] 推送被拒绝，可能原因：
  echo   1) 远程有别人/别的途径改过（先 git pull 再推）
  echo   2) 登录凭据失效（用 GitHub Desktop 重新登录一次）
  echo   3) 网络问题
  echo 解决后再次双击本脚本即可。
) else (
  echo.
  echo [成功] 已推送！约 30秒~2分钟后刷新网址生效：
  echo   https://zhanglihui2026.github.io/runye-irrigation/
)

:end
echo.
pause
