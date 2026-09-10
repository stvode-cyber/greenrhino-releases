# 华为客户端（AppGallery 上架 PWA）

华为设备无 Google 移动服务（GMS），Trusted Web Activity 不可用。
因此华为端采用**在华为应用市场（AppGallery）以 PWA 形式上架**的方案：
复用现有 Web 应用，零额外原生代码，最快落地。

## 上架步骤

1. **部署 PWA 到公网 HTTPS**
   把 `index.html` / `src` / `sw.js` / `manifest.webmanifest` / `public` / `icons` / `favicon.svg`
   部署到一个 https 域名（如 `https://greenrhino.example.com`）。
   可用任意静态托管（对象存储 + CDN、CloudStudio、GitHub Pages 等）。

2. **放置数字资产校验文件**
   在站点根部署 `https://greenrhino.example.com/.well-known/assetlinks.json`
   （本目录已提供 `assetlinks.json` 模板）。部署后把其中的
   `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT` 替换为你的**应用签名证书 SHA256 指纹**
   （Huawei AppGallery 后台「应用签名」处可获取）。
   该文件用于证明站点与 AppGallery 应用同属你方，建立「可信 PWA」关系。

3. **填写上架资料**
   - 应用名称：绿角犀播放器
   - 一句话简介：离线优先的本地视频播放器
   - 起始 URL：`https://greenrhino-player.pages.dev`
   - 详细描述：`listing/description-zh.txt`
   - 隐私政策：`listing/privacy.txt`（或粘贴到 AppGallery 隐私栏）
   - 特性图：`listing/feature-graphic-1024x500.png`（已生成，1024×500）
   - 截图：从 `audit-*.png` 中选 3–5 张（手机竖屏 + 平板横屏各至少 1 张）

4. **AppGallery 控制台**
   - 新建应用 → 选择「PWA / 快应用」类目（或在「应用」中填 PWA 起始 URL）。
   - 起始 URL 填第 1 步的 https 地址。
   - 上传图标（见 `listing/icon-512.png`，播放器琥珀 ▶）、截图、特性图。
   - 提交审核，审核通过后即上架。

## 说明
- 该方案下华为端运行的是站点 PWA（WebView 内全屏），与 Android TWA 体验一致。
- 若后续需要**真鸿蒙（HarmonyOS NEXT）原生应用**，可基于 `clients/ios` 的 WebView 思路，
  改用 DevEco 的 `Web` 组件包裹同一套 `wwwroot`，工作量很小，本目录暂不提供。
