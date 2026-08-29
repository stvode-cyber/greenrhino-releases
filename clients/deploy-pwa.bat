@echo off
REM deploy-pwa.bat — 生成可上线的 PWA 静态产物（相对路径版）
REM 用法：双击本文件（需已安装 Node.js）
cd /d "%~dp0\.."
IF NOT EXIST node (
  echo [检查] 需要 Node.js，请先安装 https://nodejs.org （LTS）
  pause
  exit /b 1
)
node clients/deploy-pwa.mjs
echo.
echo [完成] 产物在 dist/ 目录
echo   方案A 根域部署（推荐，如 lujax.fun）：直接传项目根目录原文件到 https 根
echo   方案B 子路径托管（GitHub Pages / Netlify / Vercel）：上传 dist/ 目录
echo   详细步骤见 clients/deploy-pwa.md
pause
