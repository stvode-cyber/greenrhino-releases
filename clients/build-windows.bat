@echo off
REM 绿角犀播放器 - Windows 一键出包 (WebView2 自包含 .exe)
REM 本机需预装：Node.js + npm、.NET 8 SDK
REM 双击运行即可；失败会暂停并提示。
setlocal
cd /d "%~dp0"

echo [1/5] 检查依赖 (node / dotnet)...
where node >nul 2>nul || (echo ERROR: 未找到 node，请先安装 Node.js && pause && exit /b 1)
where dotnet >nul 2>nul || (echo ERROR: 未找到 dotnet，请先安装 .NET 8 SDK && pause && exit /b 1)
dotnet --version | findstr /R "8\." >nul 2>nul || (echo WARN: 建议 .NET 8 SDK；当前版本见上行)

echo [2/5] 安装 playwright (用于 SVG 光栅化生成图标)...
call npm i
if errorlevel 1 (echo npm i 失败 && pause && exit /b 1)

echo [3/5] 安装 playwright chromium 浏览器 (仅首次，约 150MB)...
call npx playwright install chromium
if errorlevel 1 (echo playwright install chromium 失败（可忽略，若已用系统 Edge 见下方说明）)

echo [4/5] 生成图标/资源 + 复制 web 应用到 windows/wwwroot...
node build-assets.mjs
if errorlevel 1 (echo build-assets.mjs 失败 && pause && exit /b 1)
node copy-web.mjs
if errorlevel 1 (echo copy-web.mjs 失败 && pause && exit /b 1)

echo [5/5] 发布 Windows 自包含 .exe (win-x64, 单文件)...
dotnet publish windows\GreenRhino\GreenRhino.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o windows\GreenRhino\publish
if errorlevel 1 (echo dotnet publish 失败 && pause && exit /b 1)

echo.
echo ===================================================
echo  DONE. exe 位于：windows\GreenRhino\publish\GreenRhino.exe
echo  双击运行即可离线播放（无需安装 .NET）。
echo ===================================================
echo.
echo  说明：若第 3 步 chromium 装不上，可用系统 Edge 替代——
echo  重跑前执行：set PW_CHANNEL=msedge
echo  或在第 4 步前加一行：set PW_CHANNEL=msedge
echo.
pause
