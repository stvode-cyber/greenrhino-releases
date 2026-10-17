# 踩坑台账 · 绿角犀

> 问题 / 解决 / 根因 / 预防 / 严重度 / 归类标签
> 编号规则：`ISS-YYYYMMDD-NNN`
> 严重度：P0(阻断) / P1(高) / P2(中) / P3(低)
> 同标签 ≥2 条 → 归「🔶 问题群」；≥3 条 + 已沉淀预防 → 移 `archive/issues-closed-*.md`
> **关单规则**：根因级修复 + 预防机制生效 → ✅ 归档
> 最后更新：2026-10-18（活跃坑清零 ✅）

---

## 活跃坑

**✅ 0 条活跃，全部关单（2026-10-18 验证）**

---

## 最近关单（2026-10-18，详见 archive/issues-closed-20261017.md）

**2026-10-18 清零的最后 2 条**：

| 编号 | 标题 | 严重度 | 归哪了 |
|---|---|---|---|
| ✅ ISS-20260904-001 | wwwroot.zip 不重生成 | P0 | copy-web.mjs 第 77-85 行已自动重压（预防落地） |
| ✅ ISS-20261017-017 | Gradle 8.11.1 下载超时 | P3 | AGENTS.md 铁律 #9 已固化规避（纯 ASCII 路径 + 手动放置 zip） |

**2026-10-17 归档的 10 条**（见 archive）：

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

**总计 12 条活跃坑全部关单 → 0 条活跃 ✅**

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
