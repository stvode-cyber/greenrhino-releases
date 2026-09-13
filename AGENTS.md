# AGENTS.md — 绿角犀项目全局规则

> 本文件对所有 AI 员工注入，是跨角色的行为基线。修改代码前必须通读。

## 项目定位

绿角犀（GreenRhino）是一个 **离线优先的 PWA 媒体播放器**，拆成两个完全独立的应用：

| App | 主题色 | 包名 | Cloudflare Pages URL | Android TWA |
|---|---|---|---|---|
| 🎵 音乐（green） | `#00D8A6` | `com.greenrhino.music` | `greenrhino-music.pages.dev` | ✅ |
| 🎬 播放器（amber） | `#FFB03A` | `com.greenrhino.player` | `greenrhino-player.pages.dev` | ✅ |

共享同一套源码，由 `scripts/build-web.mjs` 按角色裁剪输出到 `release/pwa-site-{music,player}/`。

## 技术栈

- **前端**：原生 ES Module（零构建，无 framework），`src/` 直接浏览器加载
- **后端**：Node.js（LocalServer，负责媒体扫描/流式传输）
- **构建工具**：仅 `scripts/build-web.mjs` + `scripts/build-assets.mjs`（自定义 Node 脚本）
- **PWA**：手写 `sw.js`，Manifest v3
- **Windows EXE**：.NET 8 WebView2，clients/windows/GreenRhino{Music,Player}
- **Android**：TWA（Trusted Web Activity），clients/android-{music,player}
- **部署**：Cloudflare Pages（wrangler） + GitHub Actions（三套 workflow）

## 关键目录

```
src/                     # 前端源码（两个 App 共享，运行时按 winRole 裁剪 UI）
scripts/                 # build-web.mjs / build-assets.mjs / copy-web.mjs
server/                  # Node LocalServer（媒体扫描、流式传输）
clients/                 # 各平台壳工程（android-music, windows, huawei-music 等）
release/pwa-site-*/      # build-web.mjs 输出（Cloudflare Pages 部署目录）
.github/workflows/       # CI：build-android.yml / build-windows.yml / build-huawei.yml
.wrangler/               # Cloudflare Pages 部署缓存
icons/                   icon-music.svg / icon-player.svg（角色专属图标）
```

## 不可变约束（Breaking These = 高优先级 Bug）

1. **version 一致**：`scripts/build-web.mjs` 的 `APP_VERSION = 'v16'` 是所有产物的版本基线。改版本时必须同步更新 cache 名（`gr-music-v16`、`gr-player-v16`）
2. **androidPackage 唯一**：两个 App 的 `package_name`（`com.greenrhino.music` / `com.greenrhino.player`）和 `assetlinks.json` 的包名/指纹必须严格对应
3. **siteUrl 唯一**：`assetlinks.json` 的 `target` 域名必须与 Cloudflare Pages 域名匹配
4. **manifest 主题色绑定**：`manifest.theme_color` 和 `<meta theme-color>` 必须与角色图标颜色一致（音乐绿 `#00D8A6` / 播放器琥珀 `#FFB03A`）
5. **SW cache 桶隔离**：两个 App 用不同 cache 名（`gr-music-v16` vs `gr-player-v16`），避免跨应用缓存污染。
   - **源码占位符**：`sw.js` 里 `const CACHE = '__SW_CACHE__'` 是显式占位符，**禁止改成硬编码版本号**（如 `'greenrhino-v14'`）
   - **替换逻辑**：`scripts/build-web.mjs` 用精确正则 `replace(/'__SW_CACHE__'/, cfg.cache)` 替换，不再依赖隐式的 `greenrhino-v\d+` 格式
   - **测试覆盖**：改 sw.js 或 build-web.mjs 后必须跑 `npm run test:all`（单元 6 条 + E2E 4 条，全绿才安全）
6. **源码零构建**：`src/` 目录在运行时由浏览器原生 ES Module 加载。不要引入 bundler 除非明确批准

## 安全基线

- Android keystore / 证书密码存 GitHub Secrets，**绝不要**出现在源码或日志里
- `.secrets.env` 在 `.gitignore` 中，本地临时用，禁止提交
- `assetlinks.json` 的 SHA256 指纹必须从真实 keystore 生成，**不要手写**

## 发布检查清单

每次推主版本 tag 前：

- [ ] `scripts/build-web.mjs` APP_VERSION 已递增
- [ ] **`npm run test:all` 全绿**（单元 6/6 + E2E 4/4，SW cache 占位符 + 浏览器行为双保险）
- [ ] SW cache 名已对应更新
- [ ] Windows dotnet publish 本地跑过（`dotnet publish` 无警告）
- [ ] `wrangler pages deploy release/pwa-site-music --project-name=greenrhino-music` 已执行
- [ ] `wrangler pages deploy release/pwa-site-player --project-name=greenrhino-player` 已执行
- [ ] Cloudflare Pages CDN 缓存已刷新（`curl -H Cache-Control: no-cache` 验证 manifest）
- [ ] GitHub Actions 三套 workflow 已手动触发且 SUCCESS
