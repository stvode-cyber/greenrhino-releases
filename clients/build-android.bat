@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
REM ============================================================
REM GreenRhino Android (TWA) one-click build
REM Prereq: JDK 17, Android SDK (build-tools + platform 34)
REM Run from clients/ directory (double-click works).
REM ============================================================
echo [1/6] Checking JDK ...
java -version >nul 2>&1 || (echo ERROR: JDK not found. Install JDK 17 and set JAVA_HOME. & pause & exit /b 1)
echo [2/6] Checking Android SDK ...
if not defined ANDROID_HOME (
  if exist "%LOCALAPPDATA%\Android\Sdk" (set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk") else (echo ERROR: ANDROID_HOME not set and default SDK not found. & echo Install Android Studio / cmdline-tools. & pause & exit /b 1)
)
echo [3/6] Set deployed PWA URL (TWA launches this https site) ...
set "PWA_URL=https://greenrhino.example.com"
set /p "CH=Keep default? Enter your URL or press Enter: "
if not "!CH!"=="" set "PWA_URL=!CH!"
for /f "tokens=3 delims=/" %%a in ("!PWA_URL!") do set "PWA_HOST=%%a"
echo   host = !PWA_HOST!
powershell -NoProfile -Command "(Get-Content 'android\app\src\main\res\values\strings.xml') -replace 'greenrhino.example.com', '!PWA_HOST!' | Set-Content 'android\app\src\main\res\values\strings.xml'"
echo [4/6] Generate upload keystore (password: android) ...
if not exist "android\app\upload-keystore.jks" (
  keytool -genkeypair -v -keystore android\app\upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=GreenRhino,OU=Dev,O=GreenRhino,L=Guangzhou,ST=Guangdong,C=CN"
) else (echo   keystore exists, skip)
echo [5/6] Write local.properties (signing) ...
(
  echo storeFile=upload-keystore.jks
  echo storePassword=android
  echo keyAlias=upload
  echo keyPassword=android
) > android\local.properties
echo [6/6] Build release bundle ...
cd android
if exist gradlew.bat (
  call gradlew.bat assembleRelease
) else (
  echo gradlew.bat not found. Open this folder in Android Studio: Build ^> Generate Signed Bundle/APK.
  cd .. & pause & exit /b 1
)
cd ..
echo.
echo Output: android\app\build\outputs\bundle\release\app-release.aab
echo Next: replace SHA256 in android\.well-known\assetlinks.json with your signing fingerprint,
echo       deploy it to !PWA_HOST!/.well-known/assetlinks.json, then upload aab to Play Console.
pause
