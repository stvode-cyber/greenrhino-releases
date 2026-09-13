# Skill: security-audit-guide

## 用途
AI 员工执行安全审计时加载，提供 Critical / High / Low 三层检查清单 + 自动化扫描命令。

---

## 🔴 Critical — 立即修

### 1. 密钥硬编码
```bash
# 扫源码里的敏感模式
rg -n "(password|secret|keystore|BEGIN PRIVATE|BEGIN CERT|api_key|auth_token)\s*[=:]\s*['\"][^'\"]{6,}" src/ server/ scripts/
# 扫 base64 大字符串（可能是 keystore）
rg -n "[A-Za-z0-9+/]{80,}={0,2}" src/ server/ clients/
# 看 .secrets.env 是否被提交
git ls-files | grep secrets
```
**判断标准**：任何命中都算 Critical，除非能明确解释（如 `node_modules/` 里的依赖代码注释）。

### 2. assetlinks.json 伪造
```bash
# 两个包名必须各属于各自的 Cloudflare Pages 域名
for f in release/pwa-site-*/.well-known/assetlinks.json; do echo "=== $f ==="; cat "$f"; done
```
**判断标准**：music 版的 `package_name` 必须是 `com.greenrhino.music` 且 `siteUrl` 是 `greenrhino-music.pages.dev`，player 反之。

### 3. LocalServer 路径遍历
```bash
# 手工审 server/index.js 里的文件读取
rg -n "fs\.(readFile|createReadStream|readdir|stat|access)" server/ -B2 -A2
```
**判断标准**：所有路径拼接必须有 `path.resolve(root, userInput)` + `result.startsWith(root + path.sep)` 防护。

### 4. CSP 缺失
```bash
rg -n "Content-Security-Policy|content-security-policy" src/ index.html
```
**判断标准**：至少要有 `default-src 'self'`。

---

## 🟠 High — 下版本修

### 5. CORS 宽开
```bash
rg -n "Access-Control-Allow-Origin" server/
```
**判断标准**：不能出现 `*` 且同时返回 credentials。

### 6. SW 版本攻击
```bash
# 手工审 sw.js 的 fetch handler
cat sw.js | sed -n "/self.addEventListener.*fetch/,/^self.clients.claim/p"
```
**判断标准**：旧版本 SW 响应被新版本 cache 覆盖的窗口不能超过 1 小时。

### 7. innerHTML XSS
```bash
rg -n "innerHTML|outerHTML|document\.write" src/ -C1
```
**判断标准**：对 media metadata 字符串必须做 escape。

### 8. Android keystore 有效期
```bash
# 本地有 keystore 时跑
keytool -list -keystore upload-keystore.jks
```
**判断标准**：过期时间 < 90 天 → 轮换。

---

## 🟡 Low — 记录

### 9. 依赖漏洞
```bash
npm audit --json | jq '.vulnerabilities | group_by(.severity) | map({key: .[0].severity, value: length})'
```

### 10. HTTP 降级
LocalServer 只在 localhost 跑，风险低。但如果开放到公网必须强制 HTTPS。

---

## 输出模板

```
## 🔒 Security Audit — YYYY-MM-DD
🔴 Critical (N) — fix before release
  - [file:line] 类型 → 风险 → 建议修法
🟠 High (N) — fix next version
🟡 Low (N) — logged
✅ 总结：Pass / Risky / Blocked
```

**禁止**：报告里粘贴真实密钥值。
