@echo off
REM ============================================================
REM  GreenRhino - Enable CI auto-build (push to GitHub + tag)
REM  Run from project root (double-click works; cd to script dir)
REM  Prereq: Git installed; create an EMPTY GitHub repo first.
REM ============================================================
cd /d "%~dp0"

echo [1/6] Checking git status (working tree must be clean)...
git status --porcelain > _gitstatus.tmp 2>nul
for %%i in (_gitstatus.tmp) do if %%~zi gtr 0 (
  echo   WORKING TREE NOT CLEAN:
  type _gitstatus.tmp
  del _gitstatus.tmp
  pause & exit /b 1
)
del _gitstatus.tmp
echo   clean.

echo [2/6] Enter your GitHub repo URL (https or git@github.com:...):
set /p REPO_URL="Repo URL> "
if "%REPO_URL%"=="" (
  echo   empty URL. Abort.
  pause & exit /b 1
)

echo [3/6] Add remote origin (skip if already exists)...
git remote get-url origin >nul 2>&1
if "%ERRORLEVEL%"=="0" (
  echo   remote origin already exists:
  git remote get-url origin
) else (
  git remote add origin %REPO_URL%
  echo   remote added.
)

echo [4/6] Push main branch...
git push -u origin main
if not "%ERRORLEVEL%"=="0" (
  echo   PUSH FAILED. Make sure the GitHub repo is EMPTY (no README/LICENSE)
  echo   and your URL/SSH key has write access.
  pause & exit /b 1
)

echo [5/6] Create and push release tag v1.0.0 (triggers CI)...
git tag v1.0.0 2>nul
git push origin v1.0.0
if not "%ERRORLEVEL%"=="0" (
  echo   TAG PUSH FAILED.
  pause & exit /b 1
)

echo [6/6] DONE. CI is building 4 packages in GitHub Actions.
echo ============================================================
echo  Next: configure Secrets in GitHub repo
echo    Settings - Secrets and variables - Actions - New repository secret
echo.
echo  (Android TWA)
echo    ANDROID_PWA_URL           e.g. https://lujax.fun
echo    ANDROID_KEYSTORE_BASE64   base64 of clients/android-music/app/upload-keystore.jks
echo                              (same keystore also used by android-player)
echo    ANDROID_KEYSTORE_PASSWORD
echo    ANDROID_KEY_ALIAS         (e.g. upload)
echo    ANDROID_KEY_PASSWORD
echo  (iOS - needs Apple Developer account)
echo    IOS_TEAM_ID
echo    IOS_CERT_P12_BASE64       base64 of cert.p12
echo    IOS_CERT_PASSWORD
echo    IOS_PROVISIONING_BASE64   base64 of .mobileprovision
echo  (Windows / Huawei: no secrets required)
echo.
echo  Then open the Actions tab, find the v1.0.0 run, download Artifacts.
echo ============================================================
pause
