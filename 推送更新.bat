@echo off
setlocal
chcp 65001 >nul
REM ===========================================================
REM  润野灌溉发布脚本：只提交已暂存且人工确认的文件
REM  不自动执行 git add，也不包含未暂存或未跟踪文件。
REM ===========================================================
cd /d "%~dp0"
if errorlevel 1 goto :end

echo.
echo  ================================
echo   润野灌溉 安全发布 (GitHub Pages)
echo  ================================
echo.

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 origin remote，请先检查仓库配置。
  goto :end
)

set "BRANCH="
for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if not "%BRANCH%"=="master" (
  echo [已停止] 当前分支是 "%BRANCH%"，发布脚本只允许推送 master。
  echo 请先确认分支和发布目标，不会自动切换分支。
  goto :end
)

echo [远端基线] 正在读取 origin/master...
git fetch --quiet origin +refs/heads/master:refs/remotes/origin/master
if errorlevel 1 (
  echo [错误] 无法刷新 origin/master；没有提交或推送。
  goto :end
)
set "PUBLISH_BASE="
set "START_HEAD="
for /f "delims=" %%H in ('git rev-parse refs/remotes/origin/master 2^>nul') do set "PUBLISH_BASE=%%H"
for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "START_HEAD=%%H"
if "%PUBLISH_BASE%"=="" (
  echo [错误] 找不到 origin/master；没有提交或推送。
  goto :end
)
if not "%START_HEAD%"=="%PUBLISH_BASE%" (
  echo [已停止] 本地 master 与 origin/master 不一致。
  echo 为避免顺带推送之前的本地提交，请先在 GitHub Desktop 同步并重新检查改动。
  goto :end
)

echo [工作区状态] 所有改动：
git status --short
if errorlevel 1 (
  echo [错误] 无法读取工作区状态；停止发布。
  goto :end
)
echo.
git diff --cached --quiet
if errorlevel 2 (
  echo [错误] 无法读取 Git 暂存区；停止发布。
  goto :end
)
if not errorlevel 1 (
  echo [已停止] 没有已暂存的文件。
  echo 请在 GitHub Desktop 中只暂存本次确认要发布的文件，再运行此脚本。
  echo 脚本不会自动暂存未跟踪文件或其他工作区改动。
  goto :end
)

echo [本次将提交的已暂存文件]
git diff --cached --name-status
if errorlevel 1 (
  echo [错误] 无法列出暂存文件；停止发布。
  goto :end
)
echo.
git diff --cached --stat
if errorlevel 1 (
  echo [错误] 无法统计暂存文件；停止发布。
  goto :end
)
echo.
set /p "CONFIRM=确认只提交上面列出的已暂存文件？输入 COMMIT 继续："
if /I not "%CONFIRM%"=="COMMIT" (
  echo [已取消] 没有提交或推送。
  goto :end
)

set "MSG="
set /p "MSG=请输入本次提交说明（留空使用默认说明）："
if not defined MSG set "MSG=更新润野灌溉"
REM Reject CMD metacharacters before expanding the user-provided message into a command.
powershell -NoProfile -Command "$m=[Environment]::GetEnvironmentVariable('MSG'); if (($m -match '[&|<>^()!]') -or $m.Contains([char]37) -or $m.Contains([char]34)) { exit 1 }"
if errorlevel 1 (
  echo [已停止] 提交说明包含命令行特殊字符，请删去 ^& ^| ^< ^> ^( ^) ^! %% 和双引号后重试。
  goto :end
)

echo.
echo [提交] %MSG%
set "APPROVED_TREE="
for /f "delims=" %%T in ('git write-tree 2^>nul') do set "APPROVED_TREE=%%T"
if "%APPROVED_TREE%"=="" (
  echo [错误] 无法读取已确认的暂存快照；没有提交或推送。
  goto :end
)
git commit -m "%MSG%"
if errorlevel 1 (
  echo [失败] 本地提交失败；没有执行推送。
  goto :end
)
set "COMMIT_SHA="
set "COMMIT_TREE="
for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "COMMIT_SHA=%%H"
for /f "delims=" %%T in ('git rev-parse HEAD^{tree} 2^>nul') do set "COMMIT_TREE=%%T"
if "%COMMIT_SHA%"=="" (
  echo [错误] 无法读取新提交编号；没有执行推送。
  goto :end
)
if not "%COMMIT_TREE%"=="%APPROVED_TREE%" (
  echo [已停止] 提交内容与确认时的暂存快照不同；本地提交保留，未推送。
  goto :end
)

echo.
echo [待推送提交]
git show --stat --oneline --decorate --no-renames "%COMMIT_SHA%"
set /p "PUSH_CONFIRM=确认将该提交推送到 origin/master？输入 PUSH 继续："
if /I not "%PUSH_CONFIRM%"=="PUSH" (
  echo [已停止] 提交保留在本地，未推送。
  goto :end
)

echo.
echo [复核远端] 确认远端未前进，且待推送历史只包含本次提交...
git fetch --quiet origin +refs/heads/master:refs/remotes/origin/master
if errorlevel 1 (
  echo [错误] 无法重新读取 origin/master；本地提交保留，未推送。
  goto :end
)
set "PUSH_REMOTE="
set "PUSH_HEAD="
set "PUSH_PARENT="
for /f "delims=" %%H in ('git rev-parse refs/remotes/origin/master 2^>nul') do set "PUSH_REMOTE=%%H"
for /f "delims=" %%H in ('git rev-parse HEAD 2^>nul') do set "PUSH_HEAD=%%H"
for /f "delims=" %%H in ('git rev-parse HEAD~1 2^>nul') do set "PUSH_PARENT=%%H"
if not "%PUSH_REMOTE%"=="%PUBLISH_BASE%" (
  echo [已停止] 远端 master 在确认期间发生变化；本地提交保留，未推送。
  goto :end
)
if not "%PUSH_HEAD%"=="%COMMIT_SHA%" (
  echo [已停止] 本地 HEAD 在确认期间发生变化；本地提交保留，未推送。
  goto :end
)
if not "%PUSH_PARENT%"=="%PUBLISH_BASE%" (
  echo [已停止] 新提交并非直接基于已确认的 origin/master；未推送。
  goto :end
)

echo [推送] 仅推送本次确认的提交到 origin/master
git push origin "%COMMIT_SHA%:refs/heads/master"
if errorlevel 1 (
  echo.
  echo [失败] 推送失败；本地提交仍保留，可检查远程状态后在 GitHub Desktop 重试。
) else (
  echo.
  echo [成功] 已推送！GitHub Pages 部署完成后访问：
  echo   https://zhanglihui2026.github.io/runye-irrigation/
)

:end
echo.
pause
endlocal
