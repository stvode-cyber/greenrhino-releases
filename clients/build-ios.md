# 绿角犀 iOS 双 App 出包步骤（需 macOS + Xcode）

iOS 端用 WKWebView 内嵌本地 `wwwroot`（离线优先，无需先部署远程站点），工程由 XcodeGen 从 `project.yml` 生成。
**本项目包含两个完全独立的 App target**：
- `GreenRhinoMusic`（绿角犀音乐，bundle id：`com.greenrhino.music`）
- `GreenRhinoPlayer`（绿角犀播放器，bundle id：`com.greenrhino.player`）

**没有 Mac 也能出包**：走下方「零 Mac 云端出包」GitHub Actions CI（推荐），一次构建可产出两个 IPA。

## 前置条件
- 一台 Mac（本沙箱/Windows 无法编译 iOS）或 GitHub 仓库（CI 用 macos runner）
- Xcode 15+（含命令行工具：`xcode-select --install`）
- XcodeGen：`brew install xcodegen`
- Apple 开发者账号（上架 App Store / TestFlight 必需；纯本地跑模拟器可免）
- Node.js（用于生成图标与复制 web）

## 步骤

### 1. 生成跨平台图标（含 iOS AppIcon）
在项目根目录执行（会把 AppIcon 同时写入 `clients/ios/Music/Assets.xcassets/` 与 `clients/ios/Player/Assets.xcassets/`）：
```bash
cd clients
npm i            # 安装 playwright（build-assets.mjs 依赖）
node build-assets.mjs
```

### 2. 复制 web 应用到两端 wwwroot
```bash
node copy-web.mjs   # 复制到 windows 双站点 + clients/ios/Music/wwwroot + clients/ios/Player/wwwroot + windows wwwroot.zip
```
确认 `clients/ios/Music/wwwroot/index.html` 与 `clients/ios/Player/wwwroot/index.html` 均已就位。

### 3. 填开发者 Team ID
编辑 `clients/ios/project.yml`，把两个 target 的 `DEVELOPMENT_TEAM: ""` 改为你的 10 位 Team ID：
```yaml
DEVELOPMENT_TEAM: "ABCDE12345"
```

### 4. 生成 Xcode 工程
```bash
cd clients/ios
xcodegen generate    # 生成 GreenRhino.xcodeproj（含 GreenRhinoMusic 与 GreenRhinoPlayer 两个 scheme）
```

### 5. 归档（Archive，两个 target 各归档一次）
```bash
xcodebuild archive -scheme GreenRhinoMusic  -archivePath build/Music.xcarchive  -configuration Release
xcodebuild archive -scheme GreenRhinoPlayer -archivePath build/Player.xcarchive -configuration Release
```

### 6. 导出 IPA（两个各自导出）
`ExportOptions.plist` 已入库（`clients/ios/ExportOptions.plist`，App Store 自动签名；把 `YOUR_TEAM_ID` 换成你的 10 位 Team ID）：
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
xcodebuild -exportArchive -archivePath build/Music.xcarchive  -exportPath build/ipa-music  -exportOptionsPlist ExportOptions.plist
xcodebuild -exportArchive -archivePath build/Player.xcarchive -exportPath build/ipa-player -exportOptionsPlist ExportOptions.plist
```

### 7. 上架
- 打开 Xcode → Organizer → 选刚归档的 `Music.xcarchive` / `Player.xcarchive` → Distribute App
- 走 App Store Connect / TestFlight 提审
- 或用 `xcrun altool` / Transporter 上传对应的 `build/ipa-music/GreenRhinoMusic.ipa`、`build/ipa-player/GreenRhinoPlayer.ipa`

## 零 Mac 云端出包（推荐 · GitHub Actions CI）

仓库已内置工作流 [`.github/workflows/build-ios.yml`](../.github/workflows/build-ios.yml)（`macos-latest` runner），推 tag `v*` 或手动 `workflow_dispatch` 自动**一次产出两个 IPA**。

1. **建仓库并推送**（仓库当前无远程）：
   ```bash
   git remote add origin <你的 GitHub 仓库 URL>
   git push -u origin main
   ```
2. **配 secrets**（仓库 → Settings → Secrets and variables → Actions）：
   | Secret | 用途 |
   |--------|------|
   | `IOS_TEAM_ID` | 10 位开发者 Team ID（自动写入 project.yml 两个 target） |
   | `IOS_CERT_P12_BASE64` | 分发证书 `.p12` 的 base64（`base64 -w0 cert.p12`，Windows 用 `certutil -encode`） |
   | `IOS_CERT_PASSWORD` | p12 密码 |
   | `IOS_PROVISIONING_BASE64` | App Store 描述文件 `.mobileprovision` 的 base64 |
3. **打 tag 触发**：
   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```
   Actions → Build iOS (.ipa) → 完成后在 Artifacts 下载 `GreenRhino-iOS`（含 `ipa-music` 与 `ipa-player` 两个 IPA）。

> 证书/描述文件在 https://developer.apple.com 的 Certificates & Profiles 生成；无证书时工作流会自动跳过签名步骤（仅能出未签名产物，不能上架）。

## 说明
- iOS 端离线播放依赖内置 `wwwroot` + `LocalServer.swift` 本地服务，不依赖远程站点；但首次安装需联网下载 App。
- 两个 target 各自持有独立的 `wwwroot`、`Info.plist`、`Assets.xcassets`，互不共享：`Music/wwwroot` 来自 `release/pwa-site-music`，`Player/wwwroot` 来自 `release/pwa-site-player`。
- 若仅本地验证，步骤 4 后在 Xcode 选模拟器直接 Run 对应 scheme 即可，无需 5–7。
- 包名：`com.greenrhino.music` / `com.greenrhino.player`（与 Windows 双 App、Android/华为一致）。