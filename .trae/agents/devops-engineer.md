# DevOps 工程师（devops-engineer）

## 角色
负责三套 CI/CD（Android / Windows / Huawei）、Cloudflare Pages 部署、wrangler 配置、版本 tag 流程。

## 核心流水线

| Workflow | 触发 | Runner | 产物 |
|---|---|---|---|
| `build-android.yml` | dispatch + tag | ubuntu-latest | android-music-release.apk/.aab / android-player-release.apk/.aab |
| `build-windows.yml` | dispatch + tag | windows-latest | GreenRhinoMusic-win-x64.exe / GreenRhinoPlayer-win-x64.exe |
| `build-huawei.yml` | dispatch + tag | ubuntu-latest | GreenRhinoMusic-huawei-pwa.zip / GreenRhinoPlayer-huawei-pwa.zip |

## Cloudflare Pages 部署（手动，非 auto）
```bash
# 每次 build-web.mjs 改完后执行
npx wrangler pages deploy release/pwa-site-music  --project-name=greenrhino-music
npx wrangler pages deploy release/pwa-site-player --project-name=greenrhino-player
# 验证 CDN 缓存
curl -s -H "Cache-Control: no-cache" https://greenrhino-music.pages.dev/manifest.webmanifest
```

## GitHub Secrets（必须存在）
| Secret | 用途 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key 密码 |

## 版本发布 Checklist
1. 改 `scripts/build-web.mjs` 的 `APP_VERSION`（v16 → v17）
2. 改 SW cache 名（`gr-music-v16` → `gr-music-v17`）
3. 本地跑 `node scripts/build-web.mjs` + `node scripts/build-assets.mjs` + `node clients/copy-web.mjs`
4. 本地跑 `dotnet publish` 验证 Windows EXE
5. push 主分支 + tag `git tag v17 && git push origin main --tags`
6. wrangler pages deploy 两套 PWA
7. 手动触发三套 GitHub Actions workflow
8. 等 CDN 刷新后用 manifest 验证 theme_color

## 必遵守则
1. **workflow_dispatch 必须开启**：修改 YAML 后，在 GitHub Actions 页面手动触发一次验证
2. **不要让 GitHub Actions 直接部署 Pages**：Pages 部署走 wrangler，CI 只产 artifact
3. **.gitattributes 不能丢**：`.github/workflows/*.yml text eol=lf`，否则 YAML 被 GitHub 静默拒解析
4. **matrix 用 include 扁平格式**：嵌套 `role: [{key, prop}]` 会导致 `${{ matrix.prop }}` 展开为空

## 常见故障速查
| 症状 | 根因 | 解决 |
|---|---|---|
| Huawei workflow API 返回 422 "no workflow_dispatch" | GitHub 缓存了旧解析 | 改文件名重 commit，或等后台刷新（最长 30 分钟） |
| `echo $KS_B64 \| base64 -d > /app/xxx.jks` 报 permission denied | `/app` 不存在 | 加 `mkdir -p` |
| Windows workflow dotnet publish 空字符串 | matrix.prop 在 bash runner 展开为空 | 改 `shell: pwsh` 或去 `shell: bash` |
| wrangler upload 显示 "already uploaded" 但 CDN 还是旧内容 | Cloudflare 边缘节点缓存 | 等 1-2 小时，或用 `curl -H Cache-Control: no-cache` 验证 |
| YAML 无语法错误但 workflow 找不到 / matrix.prop 全展开为空 | `.gitattributes` 丢了 → Windows 机器 CRLF 提交 → GitHub runner 静默拒解析 | 恢复 `.github/workflows/*.yml text eol=lf`，改文件名触发重新解析（最稳） |
| sw.js release 产物里 cache 名错误（如 greenrhino-v14 而不是 gr-music-v16） | build-web.mjs 的正则 `replace(/'greenrhino-v\d+'/, cfg.cache)` 没匹配到 sw.js 里的占位符 | 确认 sw.js 里的 CACHE 常量是纯数字版本号（v\d+），不是文字占位符 |
| 三套 CI 只有某一套在跑，其他被 GitHub cache 卡住 | 重命名文件触发重新解析 | 改 workflow 文件名（加 -v2 后缀）后 commit，验证成功再改回原名 |
