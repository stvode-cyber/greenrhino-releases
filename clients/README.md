# 绿角犀播放器 · 跨平台原生客户端

把同一套离线媒体播放器 Web 应用（PWA）封装为四个平台的**纯原生壳**：

| 平台 | 封装方式 | 工程目录 | 离线能力 |
|------|----------|----------|----------|
| Windows | WebView2 (C# / .NET 8) 内嵌本地服务 | `windows/` | ✅ 内嵌 HTTP 服务保留 Service Worker |
| Android | Trusted Web Activity (TWA) | `android/` | ✅ 站点 PWA（需部署 https） |
| iOS | WKWebView 内嵌本地服务 | `ios/` | ✅ 内嵌 HTTP 服务保留 Service Worker |
| 华为 | AppGallery 上架 PWA（无 GMS，TWA 不可用） | `huawei/` | ✅ 站点 PWA |

> 沙箱内无法编译原生包；以下工程在你本机 / CI 编译即可。
> 所有平台共用 `clients/assets/` 下的图标（由 `build-assets.mjs` 生成）。

---

## 0. 前置：生成图标 + 复制 web 应用

```bash
cd clients
npm i                 # 安装 playwright（用于 SVG 光栅化）
node build-assets.mjs # 生成 Android mipmap / iOS appiconset / Windows ico / maskable / assetlinks.json
node copy-web.mjs     # 把 web 应用复制到 windows/wwwroot 与 ios/wwwroot
```

---

## 1. Windows（WebView2 原生客户端 → .exe / MSIX）

工程：`windows/GreenRhino.sln` + `windows/GreenRhino/`

**一键发布**（需 .NET 8 SDK）：
```powershell
# 在 clients/windows 目录
powershell -ExecutionPolicy Bypass -File GreenRhino\publish.ps1
# 产出：clients/windows/GreenRhino/publish/GreenRhino.exe（自包含，用户无需装 .NET）
```
**手动**：
```bash
dotnet publish clients/windows/GreenRhino/GreenRhino.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o clients/windows/GreenRhino/publish
```
- 内嵌 `LocalServer.cs`（基于 TcpListener，无需管理员提权）在 `http://127.0.0.1:8890/` 托管 `wwwroot`，
  因此 WebView2 内可启用 Service Worker / 离线缓存（file:// 不支持 SW）。
- 若要 MSIX 安装包：用 Visual Studio「Windows 应用程序打包项目」引用 GreenRhino 工程，把 `publish` 作为内容。

---

## 2. Android（Trusted Web Activity → .aab / .apk）

工程：`android/`（Android Studio / Gradle）

**步骤**：
1. 把 web 应用部署到公网 https（如 `https://greenrhino.example.com`），并在其根放置
   `/.well-known/assetlinks.json`（模板见 `android/.well-known/assetlinks.json`）。
2. 把 `app/src/main/res/values/strings.xml` 中的 `app_url` / `app_host` 改成你的域名。
3. 生成签名后，把签名证书的 **SHA256 指纹**填入 `assetlinks.json`。
4. 用 Android Studio 打开 `android/`，`Build → Generate Signed Bundle / APK`。

> TWA 要求站点与 App 通过 assetlinks.json 建立「可信」关系才能全屏运行。

---

## 3. iOS（WKWebView 原生客户端 → .ipa）

工程：`ios/`（XcodeGen 生成 .xcodeproj）

**步骤**：
```bash
brew install xcodegen
cd clients/ios
xcodegen generate        # 生成 GreenRhino.xcodeproj
open GreenRhino.xcodeproj  # Xcode 中设置 Team / Bundle Id，真机或归档
```
- `LocalServer.swift`（Network 框架）在 `http://127.0.0.1:8900+` 托管 `wwwroot`，
  WKWebView 加载该地址，离线 PWA 能力完整。
- Info.plist 已允许本地网络（`NSAllowsLocalNetworking`）+ 后台音频。
- 图标由 `build-assets.mjs` 写入 `GreenRhino/Assets.xcassets/AppIcon.appiconset/`。

---

## 4. 华为（AppGallery 上架 PWA → 应用市场）

资料目录：`huawei/`。详见 `huawei/README.md`。

要点：华为无 GMS，TWA 不可用，故以 PWA 形式上架 AppGallery：
部署 https 站点 → 放置 `assetlinks.json` → 填 `listing/` 中的描述/隐私/截图/特性图 → 提交审核。

---

## 目录结构

```
clients/
├── build-assets.mjs        # 图标 / assetlinks 一键生成
├── copy-web.mjs            # 复制 web 应用到 windows/wwwroot、ios/wwwroot
├── package.json
├── assets/                 # 生成产物：maskable-512 / icon-512 / browserconfig.xml
├── windows/                # WebView2 工程（.sln/.csproj/App.xaml/MainWindow.xaml/LocalServer.cs/publish.ps1）
├── android/                # TWA 工程（含 .well-known/assetlinks.json）
├── ios/                    # WKWebView 工程（project.yml + Swift 源码 + Assets）
└── huawei/                 # AppGallery PWA 上架资料
```
