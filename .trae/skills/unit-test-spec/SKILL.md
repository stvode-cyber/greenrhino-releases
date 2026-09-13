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
| metadata | `src/metadata.js` | ID3v2 / FLAC / Vorbis / 非法文件 | `test-assets/valid.mp3`, `test-assets/broken.mp3` |
| lrc | `src/lrc.js` | 时间排序 / 偏移量 / 重叠行 | `test-assets/sample.lrc` |
| cover | `src/cover.js` | 内嵌 vs 外挂优先级 | `test-assets/embedded-cover.mp3` |
| store | `src/store.js` | IndexedDB CRUD / 迁移 | mock idb |
| LocalServer | `server/index.js` | range request / 错误码 | 起真实 server，用 `node:http` 测 |
| build-web | `scripts/build-web.mjs` | ROLES 输出结构 | 临时目录跑，断言 JSON |

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
