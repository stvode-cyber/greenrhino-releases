# 绿角犀 PWA 部署指南（建议①）

> 目标：把 `release/pwa-site/` 部署到 https 域名，使 PWA 可安装、并可作为 Android TWA / 华为快应用 / iOS  Safari「添加到主屏」的基础。
> ✅ **已上线（2026-09-08）**：**https://greenrhino.pages.dev**（Cloudflare Pages 直接上传部署，`release/pwa-site/` 全量内容，含 `.well-known/assetlinks.json`）。`manifest / sw.js / src / icons` 已 curl 验证正确。
> 后续更新站点：Cloudflare 控制台 → Workers & Pages → Pages → `greenrhino` → Create deployment → 拖入 zip（或 `release/pwa-site/` 文件夹）→ Save and deploy；有 Node 环境也可 `wrangler pages deploy release/pwa-site --project-name greenrhino`。以下为本机/自建服务器部署参考（未备案域名走 Cloudflare Pages 即可，无需自建）。

## 0. 前置
- 域名已解析到目标服务器（lujax.fun 已注册，Aliyun 个人实名）。
- 服务器有公网 IP + 已申请/自动续期 https 证书（ACME / Aliyun 免费证书）。
- 本机有 `python3` 或 `nginx` 或任意静态托管。

## 1. 本机预览（先验证 PWA 能跑）
```bash
cd dist
python -m http.server 8080
# 浏览器开 http://127.0.0.1:8080
# 检查：能播放、歌词三来源、控制台无报错、Lighthouse PWA 项通过
```

## 2. 上传站点到服务器
把 `release/pwa-site/` 下**全部内容**（index.html / sw.js / manifest.webmanifest / src/ / icons/ / .well-known/）上传到站点根或子目录。
- 根部署：直接传 `release/pwa-site/*` → `https://lujax.fun/`
- 子目录部署：传到 `https://lujax.fun/player/`，**必须同步改** `manifest.webmanifest` 的 `start_url` / `scope` 为 `/player/`，并把 `sw.js` 里缓存前缀改为 `/player/`（否则 scope 不匹配，PWA 不安装）。
- ⚠️ 不要直接上传 `dist/`（含 500MB Windows 安装包，无需上站）。

## 3. nginx 配置示例（根部署）
```nginx
server {
    listen 443 ssl;
    server_name lujax.fun;
    ssl_certificate     /path/fullchain.pem;
    ssl_certificate_key /path/privkey.pem;

    root /var/www/lujax.fun;   # dist/ 内容放在这里
    index index.html;

    # SPA  fallback：未匹配路径回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # PWA 资源正确 mime（.webmanifest 很关键）
    location = /manifest.webmanifest { add_header Content-Type application/manifest+json; }
    location = /sw.js { add_header Service-Worker-Allowed /; }

    # 缓存策略
    location /src/ { add_header Cache-Control "public, max-age=86400"; }
    location /icons/ { add_header Cache-Control "public, max-age=86400"; }
}
```

## 4. 验证清单
- [ ] 浏览器地址栏出现「安装」图标（或菜单「安装绿角犀」）。
- [ ] 离线后（DevTools → Network → Offline）刷新仍能打开（sw.js 缓存生效）。
- [ ] Lighthouse → PWA → 全部通过（manifest 有效、service worker 注册、https）。
- [ ] 控制台无 CORS / mixed-content 报错。
- [ ] 双击本地 mp3 仍能走原生 exe（部署不影响桌面端，二者独立）。

## 5. 多端出包前置（依赖本部署）
- Android TWA：用 [bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 生成 `.aab`，Digital Asset Links 校验本域名。
- 华为 AppGallery：PWA 上架走「快应用」或「AGC AppGallery Connect PWA」。
- iOS：Safari → 添加到主屏幕（无上架，纯 PWA）；若要 App Store 上架需 Capacitor 壳（见 build-windows.yml 同级思路）。

## 6. 后续
部署稳定后，把 dist 同步流程接到 CI（见 `.github/workflows/build-windows.yml` 同级可加 `deploy-pwa.yml`：push 到 `release` 分支即 rsync dist 到服务器）。
