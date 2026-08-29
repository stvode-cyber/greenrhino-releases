@echo off
REM deploy-pwa.bat - generate production PWA static output (relative paths)
REM Usage: double-click (requires Node.js installed)
cd /d "%~dp0\.."
IF NOT EXIST node (
  echo [check] Node.js required. Install https://nodejs.org (LTS)
  pause
  exit /b 1
)
node clients/deploy-pwa.mjs
echo.
echo [done] output in dist/
echo   Option A root-domain deploy (recommended, e.g. lujax.fun): upload project root files to https root
echo   Option B subpath host (GitHub Pages / Netlify / Vercel): upload dist/ directory
echo   See clients/deploy-pwa.md for details
pause
