# Skill: code-review-checklist

## 用途
AI 员工执行代码审查时加载，提供可操作的 P0/P1/P2 检查条目。每条可勾选，勾选即视为已验证。

---

## 🔴 P0 — 阻断级（任何一项不通过 = Request Changes）

- [ ] **版本号同步**：`scripts/build-web.mjs` 的 `APP_VERSION` 未变，且 SW cache 名也未变 → 无问题。变了但不同步 → 阻断
- [ ] **theme_color 一致**：`manifest.theme_color` 和 `<meta theme-color>` 与角色图标颜色匹配（music `#00D8A6` / player `#FFB03A`）
- [ ] **SW cache 递增**：改动了 `sw.js` 或 CORE 数组里的文件 → cache 名必须同步递增版本号
- [ ] **assetlinks.json 匹配**：`package_name`（`com.greenrhino.{music,player}`）、Cloudflare Pages 域名、SHA256 指纹三者严格对应
- [ ] **原生 ESM 兼容**：新增/修改的 import 路径都是浏览器可直接解析的绝对路径 `/src/xxx.js`，没有 `.ts`、bundle 产物、相对路径 `../` 嵌套超过 2 层
- [ ] **密钥泄露**：`git diff` 里没有 keystore base64、密码、`-----BEGIN` 证书块、`.secrets.env` 内容
- [ ] **sw.js 源码 cache 占位符**：`sw.js` 里的 `const CACHE = 'greenrhino-v\d+'` 必须是可被 `build-web.mjs` 的正则 `replace(/'greenrhino-v\d+'/, cfg.cache)` 匹配的合法版本号。不要出现更老的遗留版本号（如 v14），也不要出现非数字占位符（会导致正则失效 → release 产物里 cache 名错误）。验证命令：`Select-String sw.js -Pattern "CACHE" | Select-Object -First 1`
- [ ] **.gitattributes LF 强制**：`.github/workflows/*.yml text eol=lf` 规则不能丢。GitHub Actions runner 在 Windows 上会把 YAML 解析成 CRLF，导致"workflow 未找到"或 matrix 静默展开为空。验证命令：`Get-Content .gitattributes | Select-String "yml.*lf"`

## 🟠 P1 — 严重（建议修）

- [ ] **运行时角色隔离**：`music` 版没有 import 视频专用 UI（`src/ui/videoPlayer.js` 等）的运行时依赖
- [ ] **流式 API**：媒体读取用了 `fs.createReadStream` / `Accept-Ranges`，没有一次性读入大文件
- [ ] **CSP / CORS**：Cloudflare Pages 和 LocalServer 两端 CORS 配置一致（本地开发不强制 CORS）
- [ ] **错误码**：API 出错返回 HTTP 4xx / 5xx，不吞异常

## 🟡 P2 — 建议

- [ ] **CSS 变量**：新增颜色/间距用了 `--accent` / `--accent-soft` / `--bg` 等既有变量
- [ ] **SW CORE 更新**：新增的 `src/*.js` 已加入 sw.js 的 CORE 数组
- [ ] **文档同步**：改动 API → 更新 `server/API.md`
- [ ] **注释风格**：中文注释说明"为什么"而非"做什么"

---

## 自动化速查命令

```bash
# 1. 扫密钥泄露
grep -r "BEGIN\|keystore\|password\|secret" --include="*.js" --include="*.json" src/ server/ scripts/
# 2. 看版本号一致性
grep -n "APP_VERSION\|cache.*v" scripts/build-web.mjs sw.js
# 3. 看两个角色的 theme_color
grep -A2 "theme_color" scripts/build-web.mjs
```
