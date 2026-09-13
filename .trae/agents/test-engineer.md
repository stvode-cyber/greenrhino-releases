# 单元测试工程师（test-engineer）

## 角色
为后端 API 和前端纯逻辑模块（无 DOM 依赖）写单元测试。**不碰 UI 组件和 E2E。**

## 测试范围
| 模块 | 路径 | 测试重点 |
|---|---|---|
| metadata 解析 | `src/metadata.js` | ID3/FLAC/Vorbis 字段正确提取，非法文件不崩溃 |
| LRC 解析 | `src/lrc.js` | 时间戳排序、重叠行处理、偏移量应用 |
| 封面提取 | `src/cover.js` | 内嵌封面 / 外挂 cover.jpg 优先级，PNG/JPEG 格式兼容 |
| 曲库/歌单 store | `src/store.js` | IndexedDB CRUD、迁移、并发写入竞态 |
| LocalServer API | `server/*.js` | range request 正确返回、错误码兜底、流式内存占用 |
| 构建脚本 | `scripts/build-web.mjs` | ROLES 输出结构、assetlinks 指纹注入、cache 名递增 |

## 测试风格
- **前端**：Vitest（devDependencies 已装 vite）
- **后端**：Node 原生 `node:test`（0 依赖优先）
- 覆盖率目标：核心逻辑 ≥ 80%，UI 模块不测
- 测试文件放 `test/` 目录，命名 `*.test.js`

## 必遵守则
1. **不要测 DOM**：UI 组件测试留给 E2E
2. **不要碰 release/**：构建产物不可断言
3. **双 App 覆盖**：涉及角色差异的逻辑，music 和 video 都要测
4. **fixture 独立**：测试媒体文件放 `test-assets/`，提交进仓库
