@echo off
REM ============================================================
REM  GreenRhino - Enable CI auto-build (Windows one-key helper)
REM  This script ONLY prints commands. It does NOT fill tokens.
REM  Run it on your Windows PC after you have created an EMPTY
REM  GitHub repo. Copy the printed lines and run them, or just
REM  follow the on-screen steps.
REM ============================================================
echo.
echo ============================================================
echo  STEP 1/4  Create an EMPTY GitHub repo (no README/license)
echo            then paste its URL below:
echo ============================================================
echo.
echo    git remote add origin https://github.com/YOURNAME/greenrhino.git
echo    git branch -M main
echo    git push -u origin main
echo.
echo ============================================================
echo  STEP 2/4  Add these Secrets in
echo            Repo Settings > Secrets and variables > Actions
echo ============================================================
echo.
echo    ANDROID_PWA_URL            = https://your-domain.com
echo    ANDROID_KEYSTORE_BASE64    = (base64 of upload-keystore.jks)
echo    ANDROID_KEYSTORE_PASSWORD  = android
echo    ANDROID_KEY_ALIAS          = upload
echo    ANDROID_KEY_PASSWORD       = android
echo.
echo    IOS_TEAM_ID               = your Apple Team ID (10 chars)
echo    IOS_CERT_P12_BASE64       = base64 of Distribution cert.p12
echo    IOS_CERT_PASSWORD         = cert p12 password
echo    IOS_PROVISIONING_BASE64   = base64 of .mobileprovision
echo.
echo    (Windows / Huawei builds need NO secrets)
echo.
echo  To make ANDROID_KEYSTORE_BASE64 on Windows:
echo    certutil -encode upload-keystore.jks ks.b64
echo    then open ks.b64 and copy the base64 body
echo.
echo ============================================================
echo  STEP 3/4  Tag a release -> CI builds all 4 platforms
echo ============================================================
echo.
echo    git tag v1.0.0
echo    git push origin v1.0.0
echo.
echo ============================================================
echo  STEP 4/4  Download artifacts
echo            GitHub > Actions > latest run > Artifacts
echo              GreenRhino-Windows  (.exe)
echo              GreenRhino-Android  (.aab)
echo              GreenRhino-iOS      (.ipa)
echo              GreenRhino-Huawei   (static PWA zip)
echo ============================================================
echo.
echo  NOTE: Android/Huawei need PWA on public https with
echo        /.well-known/assetlinks.json deployed first.
echo.
pause
