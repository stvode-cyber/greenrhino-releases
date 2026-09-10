@echo off
setlocal
cd /d "%~dp0"
REM ============================================================
REM GreenRhino Windows v16 build (dual independent apps)
REM   GreenRhinoMusic  (Kugou green, ~164 MB)
REM   GreenRhinoPlayer (amber orange, ~262 MB, bundles ffmpeg)
REM
REM Prereq:
REM   Node.js 20+   (build-assets.mjs SVG rasterization)
REM   .NET 8 SDK    (dotnet publish)
REM   JDK 17, Android SDK  -- optional, not needed here
REM
REM NOTE: Old merged shell clients/windows/GreenRhino/ is deprecated
REM       and NO LONGER PUBLISHED. Manually delete if not needed.
REM ============================================================

echo [1/5] Checking dependencies ...
where node >nul 2>nul || (echo ERROR: node not found && pause && exit /b 1)
where dotnet >nul 2>nul || (echo ERROR: dotnet not found && pause && exit /b 1)
dotnet --version | findstr /R "8\." >nul 2>nul || (echo WARN: .NET 8 SDK recommended)

echo [2/5] Installing playwright ...
call npm i
if errorlevel 1 (echo npm i failed && pause && exit /b 1)

echo [3/5] Generating icons/assets + copying web to wwwroot ...
node build-assets.mjs
if errorlevel 1 (echo build-assets.mjs failed && pause && exit /b 1)
node copy-web.mjs
if errorlevel 1 (echo copy-web.mjs failed && pause && exit /b 1)
REM copy-web.mjs already handles:
REM   release/pwa-site-music  -> windows\GreenRhinoMusic\wwwroot (+wwwroot.zip)
REM   release/pwa-site-player -> windows\GreenRhinoPlayer\wwwroot (+wwwroot.zip)

echo [4/5] Publishing self-contained exes (win-x64, single file) ...
dotnet publish windows\GreenRhinoMusic\GreenRhinoMusic.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o windows\GreenRhinoMusic\publish
if errorlevel 1 (echo GreenRhinoMusic publish FAILED && pause && exit /b 1)

dotnet publish windows\GreenRhinoPlayer\GreenRhinoPlayer.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o windows\GreenRhinoPlayer\publish
if errorlevel 1 (echo GreenRhinoPlayer publish FAILED && pause && exit /b 1)

echo.
echo =======================================================
echo  DONE. Single-file self-contained exes:
echo    windows\GreenRhinoMusic\publish\GreenRhinoMusic.exe
echo    windows\GreenRhinoPlayer\publish\GreenRhinoPlayer.exe
echo.
echo  Optional: Inno Setup installers
echo    Install Inno Setup 6, then run:
echo      ISCC windows\GreenRhinoMusic\installer-music.iss
echo      ISCC windows\GreenRhinoPlayer\installer-player.iss
echo =======================================================

pause