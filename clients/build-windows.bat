@echo off
setlocal
cd /d "%~dp0"
REM GreenRhino Windows build (WebView2 self-contained exe)
REM Requires: Node.js + npm, .NET 8 SDK

echo [1/5] Checking dependencies (node / dotnet)...
where node >nul 2>nul || (echo ERROR: node not found. Install Node.js first. && pause && exit /b 1)
where dotnet >nul 2>nul || (echo ERROR: dotnet not found. Install .NET 8 SDK first. && pause && exit /b 1)
dotnet --version | findstr /R "8\." >nul 2>nul || (echo WARN: .NET 8 SDK recommended; current version shown above)

echo [2/5] Installing playwright (for SVG icon rasterization)...
call npm i
if errorlevel 1 (echo npm i failed && pause && exit /b 1)

echo [3/5] Installing playwright chromium (first run only, ~150MB)...
call npx playwright install chromium
if errorlevel 1 (echo WARN: playwright install chromium failed (ignore if using system Edge, see below))

echo [4/5] Generating icons/assets + copying web app to windows/wwwroot...
node build-assets.mjs
if errorlevel 1 (echo build-assets.mjs failed && pause && exit /b 1)
node copy-web.mjs
if errorlevel 1 (echo copy-web.mjs failed && pause && exit /b 1)

echo [5/5] Publishing self-contained Windows exe (win-x64, single file)...
dotnet publish windows\GreenRhino\GreenRhino.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o windows\GreenRhino\publish
if errorlevel 1 (echo dotnet publish failed && pause && exit /b 1)

echo.
echo ===================================================
echo  DONE. exe at: windows\GreenRhino\publish\GreenRhino.exe
echo  Double-click to play offline (no .NET install needed).
echo ===================================================
echo.
echo  Note: if step 3 (chromium) failed, use system Edge instead:
echo    set PW_CHANNEL=msedge
echo  then re-run this script.
echo.
pause
