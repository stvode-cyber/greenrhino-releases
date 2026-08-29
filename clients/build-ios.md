# 绿角犀播放器 iOS 客户端出包步骤（需 macOS + Xcode）

iOS 端用 WKWebView 内嵌本地 `wwwroot`（离线优先，无需先部署远程站点），工程由 XcodeGen 从 `project.yml` 生成。

## 前置条件
- 一台 Mac（本沙箱/Windows 无法编译 iOS）
- Xcode 15+（含命令行工具：`xcode-select --install`）
- XcodeGen：`brew install xcodegen`
- Apple 开发者账号（上架 App Store / TestFlight 必需；纯本地跑模拟器可免）
- Node.js（用于生成图标与复制 web）

## 步骤

### 1. 生成跨平台图标（含 iOS AppIcon）
在项目根目录执行（会写入 `clients/ios/GreenRhino/Assets.xcassets/AppIcon.appiconset/`）：
```bash
cd clients
npm i            # 安装 playwright（build-assets.mjs 依赖）
node build-assets.mjs
```

### 2. 复制 web 应用到 iOS wwwroot
```bash
node copy-web.mjs   # 复制到 clients/ios/GreenRhino/wwwroot
```
确认 `clients/ios/GreenRhino/wwwroot/index.html` 等已就位。

### 3. 填开发者 Team ID
编辑 `clients/ios/project.yml`，把 `DEVELOPMENT_TEAM: ""` 改为你的 10 位 Team ID：
```yaml
DEVELOPMENT_TEAM: "ABCDE12345"
```

### 4. 生成 Xcode 工程
```bash
cd clients/ios
xcodegen generate    # 生成 GreenRhino.xcodeproj
```

### 5. 归档（Archive）
```bash
xcodebuild archive \
  -project GreenRhino.xcodeproj \
  -scheme GreenRhino \
  -archivePath build/GreenRhino.xcarchive \
  -configuration Release
```

### 6. 导出 IPA
先准备 `ExportOptions.plist`（选 App Store 或 ad-hoc / enterprise）：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>ABCDE12345</string>
</dict>
```
导出：
```bash
xcodebuild -exportArchive \
  -archivePath build/GreenRhino.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

### 7. 上架
- 打开 Xcode → Organizer → 选刚归档的 `GreenRhino.xcarchive` → Distribute App
- 走 App Store Connect / TestFlight 提审
- 或用 `xcrun altool` / Transporter 上传 `build/ipa/GreenRhino.ipa`

## 说明
- iOS 端离线播放依赖内置 `wwwroot` + `LocalServer.swift` 本地服务，不依赖远程站点；但首次安装需联网下载 App。
- 若仅本地验证，步骤 4 后在 Xcode 选模拟器直接 Run 即可，无需 5–7。
- 包名：`com.greenrhino.player`（与 Android/华为一致）。
