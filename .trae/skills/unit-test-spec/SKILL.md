# Skill: unit-test-spec

## 用途
AI 员工写单元测试时加载，规定测试风格、覆盖矩阵、fixture 规范。

---

## 测试框架选择

| 场景 | 框架 | 理由 |
|---|---|---|
| 前端纯逻辑（metadata / lrc / cover） | **Vitest** | devDependencies 已有 `vite`，Vitest 同生态 |
| 后端 API | **Node 原生 `node:test`** | 零依赖 |
| 构建脚本 | **Node 原生** | 纯 I/O，不需要复杂 mock |

## 覆盖矩阵

| 模块 | 路径 | 重点 | fixture |
|---|---|---|---|
| **SW cache 占位符** | `sw.js` + `scripts/build-web.mjs` | 源码有占位符 + build 替换正确 + 双 App 隔离 | 跑 build-web.mjs 后断言 release/sw.js 文本 |
| metadata | `src/metadata.js` | ID3v2 / FLAC / Vorbis / 非法文件 | `test-assets/valid.mp3`, `test-assets/broken.mp3` |
| lrc | `src/lrc.js` | 时间排序 / 偏移量 / 重叠行 | `test-assets/sample.lrc` |
| cover | `src/cover.js` | 内嵌 vs 外挂优先级 | `test-assets/embedded-cover.mp3` |
| store | `src/store.js` | IndexedDB CRUD / 迁移 | mock idb |
| LocalServer | `server/index.js` | range request / 错误码 | 起真实 server，用 `node:http` 测 |
| build-web | `scripts/build-web.mjs` | ROLES 输出结构 | 临时目录跑，断言 JSON |

## SW cache 测试矩阵（2026-09-13 修复后固化）

这是绿角犀独有的 **双层防护**——同一行为用两种测试框架交叉验证。

### 单元测试（`test/build-sw-cache.test.js`，Node 原生 `node:test`，200ms）

| # | 断言 | 防什么回归 |
|---|---|---|
| 1 | `sw.js` 源码有精确占位符 `'__SW_CACHE__'` | 有人改坏占位符 |
| 2 | `sw.js` 源码**没有** `greenrhino-v\d+` 硬编码版本号 | 遗留版本号残留 |
| 3 | music release → CACHE 以 `gr-music-v` 开头 | 替换逻辑对 music 正确 |
| 4 | player release → CACHE 以 `gr-player-v` 开头 | 替换逻辑对 player 正确 |
| 5 | music cache ≠ player cache | 双 App 隔离（最关键） |
| 6 | cache 版本号与 `APP_VERSION` 同步 | 改版本漏改 cache |

### E2E 测试（`test/e2e/sw-cache.spec.js`，Playwright + Edge，2.5s）

| # | 断言 | 防什么回归 |
|---|---|---|
| 1 | music SW 注册成功 + `caches API` 里 cache 名正确 | 真实浏览器 SW 行为不对 |
| 2 | music SW 预缓存 CORE 资源（index.html / manifest / main.js） | SW install 阶段漏缓存 |
| 3 | player SW 注册成功 + cache 名正确 | player 独立 SW 行为 |
| 4 | 双 App 同时打开 → 各自 cache 隔离（不同 context） | 跨 origin cache 污染 |

### 反模式（2026-09-13 踩坑记录）

**旧方案（已废弃）**：
```javascript
// ❌ sw.js 源码硬编码遗留版本号
const CACHE = 'greenrhino-v14'
// ❌ build-web.mjs 两条隐式正则
sw.replace(/'greenrhino-v14'/, cfg.cache)  // 只匹配 v14
sw.replace(/'greenrhino-v\d+'/, cfg.cache) // 兜底，但如果有人改成 'gr-v14' 就失效
```
问题：隐式正则依赖源码格式，如果有人把 cache 名改成 `'gr-v14'` 或 `'TEMPLATE'`，替换静默失效 → release 产物 cache 名直接变成 `'greenrhino-v14'`。

**新方案（推荐）**：
```javascript
// ✅ sw.js 源码显式占位符
const CACHE = '__SW_CACHE__'
// ✅ build-web.mjs 精确匹配
sw.replace(/'__SW_CACHE__'/, cfg.cache)
```

### 反向验证（必须能防回归）

故意改坏占位符（`'__SW_CACHE__'` → `'greenrhino-v99'`）→ 两条测试**全部 fail** → 恢复 → **全部 pass**。这个能力在 PR review 时可以当证据用。

## 测试文件位置
```
test/
├── unit/
│   ├── metadata.test.js
│   ├── lrc.test.js
│   ├── cover.test.js
│   └── store.test.js
├── server/
│   └── api.test.js
├── e2e/          ← e2e-test-engineer 管
└── fixtures/
    ├── valid.mp3        # 必须有 ID3 + 内嵌封面
    ├── broken.mp3       # 头损坏，应返回 412
    ├── sample.lrc       # 带偏移量的歌词
    └── embedded-cover.flac
```

## 风格规范

```javascript
// ✅ 好：命名 + 双 App 覆盖 + 边界 case
describe('metadata.js', () => {
  describe('music role', () => {
    it('提取 ID3v2 标题和封面', async () => { /* ... */ })
    it('损坏文件返回 error 而不是 throw', async () => { /* ... */ })
  })
  describe('player role', () => {
    // 虽然同模块，但覆盖 video 专属路径
  })
})
```

```javascript
// ❌ 坏：不要测 DOM / 不要碰 release / 不要假设 fixture 在仓库外
// ❌ 坏：不要 mock 整个 fs 然后断言实现细节（应该端到端）
```

## 运行命令

```bash
# 前端（Vitest）
npx vitest run test/unit/
# 后端（Node 原生）
node --test test/server/
# 构建脚本
node scripts/build-web.mjs --role=music && echo "✅ 构建成功"
```

## 覆盖率目标
- 核心逻辑（metadata / lrc / store / LocalServer API）：**≥ 80%**
- UI 模块：不测（留给 E2E）
- 构建脚本：不测覆盖率（手动 + E2E 覆盖）

## 双 App 覆盖原则
涉及 `winRole` 或 `androidPackage` 等角色差异的模块，music 和 video 都要有独立的 describe block。不要合并。
