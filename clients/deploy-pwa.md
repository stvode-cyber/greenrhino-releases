# 绿角犀播放器 · PWA 部署指南（clients/deploy-pwa.md）

> P3 出包前置：Android TWA 与华为 AppGallery 上架都要求 PWA 先部署到公网 https。
> 本文给出三种上线方式 + 数字资产链接（assetlinks）准备 + 部署后验证清单。

---

## 部署源说明（重要）

本项目是**零构建 PWA**，直接由静态服务器托管。部署源 = **项目根目录**：

```
index.html  manifest.webmanifest  sw.js  favicon.svg  icons/  src/
```

- 这些文件 index.html 实引用，已通过沙箱浏览器实测（Playwright + Edge：零 JS 报错、SW 注册成功、IndexedDB 可写）。
- `public/` 是历史遗留目录（其中 `public/sw.js` 是过时简化版 v1），**不要部署 public/**，它不含 index.html / src/，部署必缺核心。

---

## 方案 A：根域部署（推荐，零路径改动）

适用：你有根域（如已注册并实名的 `lujax.fun`）、或任意把 PWA 放到 https 根的场景。

1. 把项目根目录的 `index.html / manifest.webmanifest / sw.js / favicon.svg / icons/ / src/` 全部上传到 https 根（如 `https://lujax.fun/`）。
2. 根目录文件已是绝对路径（`start_url:"/"`、`scope:"/"`），根域天然正确，**无需改路径**。
3. 验证：`https://你的域/` 能打开、浏览器地址栏出现"安装"图标、断网后仍可打开（SW 缓存）。

> TWA / 华为要求 manifest 的 `start_url` / `scope` 与上线 https 域精确匹配，根域方案最契合，优先选 A。

---

## 方案 B：子路径托管（GitHub Pages / Netlify / Vercel 拖放）

适用：GitHub Pages 项目页（`https://user.github.io/repo/`，带子路径）、或把 PWA 放到子目录。

根目录文件用绝对路径，子路径下会 404。需先生成**相对路径版产物**：

```
双击 clients/deploy-pwa.bat
# 或：在项目根执行  node clients/deploy-pwa.mjs
```

产物输出到 `dist/`（index.html / manifest.webmanifest / sw.js 已改写为 `./` 相对路径，icons/ / src/ / favicon.svg 原样复制）。

- **GitHub Pages**：把 `dist/` 内容推到仓库 `gh-pages` 分支，仓库 Settings → Pages → Source 选 `gh-pages` / root。
- **Netlify / Vercel**：直接拖放 `dist/` 目录，或连仓库选 `dist` 为发布目录。
- 验证：子路径下能打开、能安装、断网可用。

---

## 数字资产链接（TWA / 华为必需）

Android TWA 与华为 AppGallery 要求在站点根放 `/.well-known/assetlinks.json`，证明你拥有该域名。

1. 复制模板并填指纹：
   ```
   cp clients/assetlinks-template.json .well-known/assetlinks.json
   ```
2. 用签名 keystore 的 SHA256 替换占位（与 `build-android.bat` 生成的 `upload-keystore.jks` 同一把）：
   ```
   keytool -list -v -keystore upload-keystore.jks -alias greenrhino
   # 取 "SHA256:" 后的指纹，去掉冒号，填到 sha256_cert_fingerprints
   ```
3. 部署后访问 `https://你的域/.well-known/assetlinks.json` 应返回该 JSON（HTTP 200，Content-Type application/json）。

---

## 部署后验证清单

- [ ] 公网 https 打开首页，UI 正常
- [ ] 浏览器可"安装"为应用（manifest 有效、SW 已注册）
- [ ] 断网刷新仍可打开（SW 离线缓存生效）
- [ ] Lighthouse → PWA 类目无报错（可选）
- [ ] `/.well-known/assetlinks.json` 返回 200（TWA / 华为前必做）
- [ ] 导入一个媒体文件，播放、暂停、续播均正常

---

## 衔接出包

- Android TWA：部署 + assetlinks 就绪后，双击 `clients/build-android.bat` 出 `app-release.aab`
- 华为：部署 + assetlinks 就绪后，跑 `clients/build-huawei.bat` 备资产 → AppGallery 控制台提交
- iOS：不依赖远程，按 `clients/build-ios.md` 在 macOS 本机出 `ipa`
- 四端统一 CI：仓库推 GitHub + 配 Secrets + 打 `v*` tag，见 `出包总览.md` §CI 自动出包
