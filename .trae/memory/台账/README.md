# 台账使用说明 · 绿角犀

> 新 AI 进门：读 [context.md](./context.md) TL;DR → 30 秒上手 → 开始干活
> 改代码前：扫 [issues.md](./issues.md) 关联文件 → 命中提醒用户
> 干完活：归档到 decisions.md / issues.md / daily.md → 清空 .session-memory.md

---

## 文件职责

| 文件 | 管什么 | 何时写 |
|---|---|---|
| [context.md](./context.md) | 项目驾驶舱：版本/进度/阻塞/最近 5 条 | 每次任务后 |
| [decisions.md](./decisions.md) | 关键决策（选啥/为啥/备选） | 做了关键决策立刻 |
| [issues.md](./issues.md) | 踩坑（现象/根因/预防/标签） | 踩坑立刻 |
| [index.md](./index.md) | 模块索引（按目录查坑） | 新条目立刻同步 |
| [daily.md](./daily.md) | 每日流水（改了啥跑了啥） | 每次任务后 |
| [archive/](./archive/) | 已沉淀归档（同标签 ≥3 + 预防已落地） | 自动迁移 |

---

## 编号规则

- 决策：`DEC-YYYYMMDD-NNN`（如 DEC-20261017-001）
- 坑：`ISS-YYYYMMDD-NNN`（如 ISS-20261017-001）

## 归类标签（成长型）

同类坑 ≥2 条 → 自动归「🔶 问题群」
同类坑 ≥3 条 + 预防已沉淀进 Skill → 整个问题群移 archive/

常用标签：
- `#relative-path` `#absolute-path` — 路径相关
- `#version-sync` — 版本号一致性
- `#sw-cache` — Service Worker 缓存
- `#android-webview` — Android 壳相关
- `#windows-webview2` — Windows 壳相关
- `#build-cache` — 构建缓存
- `#moto-device` — Moto 真机专属
- `#gpu` `#video-codec` — 渲染/编码
- `#cleanup` `#dead-code` — 清理类
- `#documentation` `#path-drift` — 文档漂移
- `#governance` — 治理/流程

---

## 五步闭环（强制）

1. **启动先看**：读 context.md → 读 index.md → 读 issues.md
2. **改前扫坑**：匹配目标文件 → 提醒用户
3. **动作即记**：踩坑/决策立刻写（不要等结束）
4. **完成总汇**：口头汇总 + 归档
5. **索引同步**：index.md 跟着动

详见根目录 [AGENTS.md](../../../AGENTS.md)。
