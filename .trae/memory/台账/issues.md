# 踩坑台账 · 绿角犀

> 问题 / 解决 / 根因 / 预防 / 严重度 / 归类标签
> 编号规则：`ISS-YYYYMMDD-NNN`
> 严重度：P0(阻断) / P1(高) / P2(中) / P3(低)
> 同标签 ≥2 条 → 归「🔶 问题群」；≥3 条 + 已沉淀预防 → 移 `archive/issues-closed-*.md`
> **关单规则**：根因级修复 + 预防机制生效 → ✅ 归档
> 最后更新：2026-10-17（瘦身至 2 条活跃）

---

## 活跃坑

### ISS-20260904-001 wwwroot.zip 不重生成导致内嵌旧前端

- **严重度**：P0
- **现象**：改了 web 源码但 exe 跑的还是旧前端
- **根因**：`wwwroot.zip` 是 csproj 内嵌资源，必须手动重生成
- **解决**：`node clients/copy-web.mjs` 同步 + 重压 zip
- **关联文件**：`clients/copy-web.mjs`、`clients/windows/GreenRhino/wwwroot.zip`
- **预防**：⏳ 待自动化 — copy-web.mjs 已自动重压；但仍依赖人工记得跑
- **归类标签**：`#build-cache` `#dotnet-publish`

### ISS-20261017-008 Gradle 8.11.1 下载超时（网络依赖）

- **严重度**：P3
- **现象**：gradlew 自动下载卡死（130MB 只下了 100MB）
- **根因**：services.gradle.org 从本环境下载慢
- **解决**：手动 `curl.exe -L -o gradle-8.11.1-bin.zip` 放 `~/.gradle/wrapper/dists/gradle-8.11.1-bin/<hash>/`
- **关联文件**：gradle-wrapper.properties
- **预防**：⏳ 可把 gradle zip 作为项目资产预打包
- **归类标签**：`#network` `#gradle`

---

## 最近关单（2026-10-17，详见 archive/issues-closed-20261017.md）

| 编号 | 标题 | 严重度 | 归哪了 |
|---|---|---|---|
| ✅ ISS-20260914-002 | webkitdirectory WebView 不支持 | P1 | `#android-webview` |
| ✅ ISS-20261017-002 | Moto logcat -c 屏蔽日志 | P0 | `#android-webview` → 铁律 #8 |
| ✅ ISS-20261017-013 | library.js refresh 3秒7次 | P3 | `#performance` → debounce |
| ✅ ISS-20261017-012 | playwright SW ready 超时 | P2 | `#e2e-testing` → 测试时机 |
| ✅ ISS-20261017-016 | IndexedDB getter 缺兜底 | P2 | `#indexeddb` → 统一 \|\| [] |
| ✅ ISS-20261017-008 | main.js allowedViews 裁剪不全 | P0 | `#role-isolation` → 铁律 #11 |
| ✅ ISS-20261017-009 | player.js EQ_FREQS 未 re-export | P0 | `#role-isolation` → 铁律 #11 |
| ✅ ISS-20261017-010 | CSS @import file:// 风险 | P1 | `#role-isolation` → 铁律 #11 |
| ✅ ISS-20260910-001 | 版本号五落点不同步 | P1 | bump-version + preflight 18 项 |
| ✅ ISS-20260908-001 | SW CORE 漏 cast.js/id3.js | P1 | sw.js CORE 补齐 |

**共归档 20+ 条 → 新 AI 只扫活跃 2 条即可**

---

## 模板（新坑复制此块）

```markdown
### ISS-YYYYMMDD-NNN 标题

- **严重度**：P0/P1/P2/P3
- **现象**：
- **根因**：
- **解决**：
- **关联文件**：
- **预防**：
- **归类标签**：
```
