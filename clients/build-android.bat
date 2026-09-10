@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
REM ============================================================
REM 绿角犀 Android (TWA) 一键构建脚本（双独立 App 版本）
REM   android-music  → 绿角犀音乐 TWA（包 com.greenrhino.music）
REM   android-player → 绿角犀播放器 TWA（包 com.greenrhino.player）
REM 前置：JDK 17 + Android SDK（platforms;android-34 + build-tools;34.0.0）
REM 本地直接双击运行即可；CI 用 GitHub Actions build-android.yml
REM ============================================================

echo [1/4] Checking JDK ...
java -version >nul 2>&1 || (echo ERROR: JDK 17 not found. Set JAVA_HOME or install JDK 17. & pause & exit /b 1)
echo [2/4] Checking Android SDK ...
if not defined ANDROID_HOME (
  if exist "%LOCALAPPDATA%\Android\Sdk" (set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk") else (echo ERROR: ANDROID_HOME not found. Install Android SDK. & pause & exit /b 1)
)
echo        ANDROID_HOME=%ANDROID_HOME%
echo [3/4] Setting ANDROID_HOME in local.properties ...
for %%d in (android-music android-player) do (
  if not exist "%%d\local.properties" (
    echo sdk.dir=%ANDROID_HOME:\=/%> %%d\local.properties
    echo storeFile=upload-keystore.jks>> %%d\local.properties
    echo storePassword=android>> %%d\local.properties
    echo keyAlias=upload>> %%d\local.properties
    echo keyPassword=android>> %%d\local.properties
  )
)
echo [4/4] Building both roles ...
for %%d in (android-music android-player) do (
  echo.
  echo ============================================================
  echo   Building %%d
  echo ============================================================
  cd %%d
  if exist gradlew.bat (
    call gradlew.bat --no-daemon assembleRelease bundleRelease
  ) else (
    echo ERROR: gradlew.bat missing in %%d. Regenerate with: gradle wrapper --gradle-version 8.11.1
    cd .. & pause & exit /b 1
  )
  cd ..
)
echo.
echo ============================================================
echo   DONE. Outputs:
echo     android-music\app\build\outputs\apk\release\app-release.apk
echo     android-music\app\build\outputs\bundle\release\app-release.aab
echo     android-player\app\build\outputs\apk\release\app-release.apk
echo     android-player\app\build\outputs\bundle\release\app-release.aab
echo ============================================================
pause
