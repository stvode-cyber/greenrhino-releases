# Skill: ledger-health-check

## 用途
新 AI 进门、大任务开工前、版本升级后，执行全项目设定/台账/SKILL 体检。确保零漂移、零悬空动作、零过时记录。

**触发条件**：用户说「摸家底」「先看设定」「台账检查」「设定升级」「项目体检」，或任何涉及"先扫一遍状态再干活"的指令。

---

## 流程（11 步，每步必须 ✅ 再进下一步）

### A0 基线验证（开工前必做，1 分钟）
```powershell
node scripts/preflight.mjs        # 必须 18/18 绿
node --test test/build-sw-cache.test.js  # 必须 6/6 绿
node scripts/build-web.mjs        # 双站点必须 BUILD SUCCESSFUL
```
> 任何失败 → 先修再往下走，别带着已知漂移开工

### A1 漂移修复（台账四文件对账）

| 文件 | 查什么 | 实际漂移案例 |
|---|---|---|
| `issues.md` | 活跃坑状态是否与实际一致；编号是否唯一（**不能两个坑用同一个编号**） | ISS-20261017-008 被 Gradle 超时 + allowedViews 裁剪不全同时占用 |
| `index.md` | 所有「待挖/待加/待修」标记是否已过时；活跃坑列表是否与 issues.md 对齐 | ISS-009/010 已关单但 index 还写「待挖」 |
| `AGENTS.md` | 铁律数量标题 = 实际铁律数；preflight 项数 = 实际；是否有重复段落 | 铁律标题写 10 实际 11、preflight 写 14 实际 18、底部重复安全基线 |
| `decisions.md` | 编号是否按日期递增；20261017 的 5 条决策编号 001→005 是否排对 | 之前乱序 001→002→005→004→003 |

**关键**：编号冲突 → 用当天未占用的最大编号（如 ISS-017）修正所有引用（issues/index/daily/archive 四个文件全改）

### A2 台账闭环清理

- `daily.md`：所有 `⏳` 标记 → 要么改成 `✅`（如果已完成）要么删掉（如果是废弃计划）
- `.session-memory.md`：重置为空白模板
- **检查 daily.md 有没有悬空动作**：T-01/T-02 等老任务的 ⏳ 不能留

### A3 SKILL 全量审查（7 个活跃 SKILL 必扫）

> 🔗 **交叉引用**：查 security-secrets-index（审计敏感索引）时要同步跑 security-audit-guide，反之亦然

| SKILL | v16 必查项 | 实际过时案例 |
|---|---|---|
| `code-review-checklist` | SW cache 占位符正则是否 `__SW_CACHE__` | 曾用 `greenrhino-v\d+` 旧正则 |
| `frontend-component-spec` | 目录结构是否含 src/app/ + src/player/ + src/css/ | B 层拆分后需同步 |
| `unit-test-spec` | 测试框架是 Node 原生不是 Vitest；后端是 cloud_api.py（Python）不是 server/index.js；端口是 8787 不是 4173 | 之前全过时 |
| `docker-deploy-guide` | 场景一是 cloud_api.py（Python 8787）不是 LocalServer（Node 4173） | 之前用错框架 |
| `security-audit-guide` | 三后端路径遍历扫描（Python/\.NET/Android）不是只扫 Node | 之前只有一个后端 |

**速查表**（端口/框架/路径不许错）：
```
Python cloud_api.py = 8787
.NET LocalServer.cs = 8800
Android MediaHttpServer.kt = 40363
构建脚本 build-web.mjs / preflight.mjs / bump-version.mjs
零构建铁律 = 禁 bundler
测试框架 = Node 原生 node:test（不是 Vitest/Jest）
后端 cloud_api.py = Python（不是 Node/Flask/FastAPI）
```

### A4 根目录瘦身（看 index.md 标记的残留状态）

```powershell
# 检查是否真的不存在（index.md 可能过时标记"待删"但早已删除）
Test-Path vite.config.js, ui.xml, ui2.xml, .push.log, install.log
```
- 不存在 → index.md 改成 ✅ 已清理
- 存在 → 确认无引用后删

### A5 用户行为偏好检查（AGENTS.md）

**核心三句话**（变了要同步）：
1. 我只说「同意/否决/改这里」，其他全自动
2. 需要我动手的直接说大白话（插 USB / 点 UI / 登录）
3. 质量优先不计成本

> 版本检查：是否还有"10 条"的老引用？用户偏好要浓缩，别写 10 条细则

### A6 联网学习借鉴（三个固定方向）

| 方向 | 搜什么 | 决策标准 |
|---|---|---|
| 投屏新方案 | `2026 universal TV casting WebRTC hardware decode` | 三方案（DLNA+MJPEG+Miracast）是否已最优？有没有加 QR 码入口的可能 |
| PWA 缓存 | `PWA service worker caching best practice 2026` | 手写 sw.js vs Workbox？零构建铁律下必须手写 |
| SKILL 实践 | `Trae AI skills best practice secrets management` | secrets-keys.md 能不能升成 SKILL |

> 搜到的方案 vs 我们现有方案 → 选最强的，不保守但也不为新而新

### A7 前端交互审计（30 个 src/ 文件）

**grep 快速验覆盖**：
```powershell
# toast 提示（操作反馈）
Select-String src/**/*.js -Pattern "toast|showToast" -SimpleMatch | Measure-Object
# 空态提示（无数据时的引导）
Select-String src/**/*.js -Pattern "empty|无数据|暂无" -SimpleMatch | Measure-Object
# 错误处理
Select-String src/**/*.js -Pattern "\.catch\(|catch\s*\(" | Measure-Object
# 加载态
Select-String src/**/*.js -Pattern "loading|加载" -SimpleMatch | Measure-Object
```
**最低标准**：4 类交互至少各覆盖 10+ 文件，投屏面板必须有扫描 loading + 空态排查建议 + 每个状态变化 toast

### A8 后端精简审计（三后端）

| 后端 | 查什么 | 判断标准 |
|---|---|---|
| `server/cloud_api.py` (383行) | 有没有死代码/未使用函数 | 全是路由+业务，零依赖纯 stdlib = 干净 |
| `Android MediaHttpServer.kt` | 有没有空路由/死路径 | 6 条路由全有用 = 干净 |
| `Windows LocalServer.cs` | 有没有可删的老逻辑 | 有 ffmpeg 转码 + Range request = 干净 |

> **原则**：后端代码先想「是不是一定要写」，再写。能删则删。

### A9 全量回归（A0 再跑一遍）

```powershell
node scripts/preflight.mjs          # 必须 18/18 绿
node --test test/build-sw-cache.test.js   # 必须 6/6 绿
node scripts/build-web.mjs          # 双站点必须 BUILD SUCCESSFUL
```

### A10 归档 + 闭环

1. `daily.md` 当天任务区块（A0~A10 每个打 ✅）
2. `context.md` 日期更新 + 最近 5 条动作 + 活跃坑数量
3. `decisions.md` 有新决策就加条目
4. `issues.md` 有新坑就加
5. `.session-memory.md` 重置为空白
6. **commit + push**（两步：commit 本地 → push origin main）

---

## 项目特定速查表

### 台账文件速查
```
.trae/memory/台账/
  context.md      ← 驾驶舱（新 AI 进门第一读）
  issues.md       ← 活跃坑（理想 0 条）
  decisions.md    ← 关键决策（编号递增）
  index.md        ← 模块索引（改某模块前扫对应坑）
  daily.md        ← 每日流水（倒序，带任务编号+动作清单）
  .session-memory.md ← 本次会话临时区（结束前清空）
  archive/        ← 已沉淀归档
```

### 活跃 SKILL 7 个
```
.trae/skills/
  ledger-health-check/       ← 本 SKILL
  security-secrets-index/    ← 敏感信息索引（触发审计时要同步跑 security-audit-guide）
  frontend-component-spec/   ← 目录结构+角色隔离+主题色
  code-review-checklist/     ← P0/P1/P2 审查
  unit-test-spec/            ← 测试框架+覆盖矩阵+SW cache
  docker-deploy-guide/       ← cloud_api.py 容器化
  security-audit-guide/      ← 三后端安全扫描（触发时要同步跑 security-secrets-index）
```

### 活跃坑理想状态：0 条
> 所有坑要么关单（根因级修复+预防落地）要么固化到铁律（有规避方案不算活跃）

### 版本号五落点（preflight 自动验）
1. `scripts/build-web.mjs` APP_VERSION
2. `sw.js` cache 桶（gr-music-v16 / gr-player-v16）
3. `.iss` OutputBaseFilename
4. `android-music/build.gradle` versionName + versionCode
5. `android-player/build.gradle` versionName + versionCode
