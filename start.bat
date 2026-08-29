@echo off
setlocal
cd /d "%~dp0"
REM GreenRhino offline player - one-click local launch (Web PWA, no installer)
REM This is a local dev/preview launcher. For native client, use clients/build-windows.bat.
set PORT=4173
where python >nul 2>nul
if %errorlevel%==0 (
  echo [GreenRhino] Starting local server with Python: http://127.0.0.1:%PORT%
  start "" http://127.0.0.1:%PORT%
  python -m http.server %PORT%
  goto :eof
)
where node >nul 2>nul
if %errorlevel%==0 (
  echo [GreenRhino] Python not found, using Node: http://127.0.0.1:%PORT%
  start "" http://127.0.0.1:%PORT%
  node -e "const h=require('http'),f=require('fs'),p=require('path');const s=h.createServer((q,r)=>{let fp=p.join(process.cwd(),decodeURIComponent(q.url.split('?')[0]));if(fp.endsWith('/'))fp+='index.html';f.readFile(fp,(e,d)=>{if(e){r.writeHead(404);r.end('404');return}const t=fp.endsWith('.js')?'text/javascript':fp.endsWith('.css')?'text/css':fp.endsWith('.json')?'application/json':'text/html';r.writeHead(200,{'Content-Type':t});r.end(d)});});s.listen(%PORT%,()=>console.log('serving on '+%PORT%));"
  goto :eof
)
echo [GreenRhino] Python or Node not found. Install one:
echo   Python: https://www.python.org  (check "Add to PATH")
echo   or Node: https://nodejs.org
pause
