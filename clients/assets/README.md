# ⚠️ 已废弃（2026-10-17 标注）

> `clients/assets/` 是旧版出包脚本用到的资源目录。
> 当前 `scripts/build-web.mjs` 已取代，本目录不再参与构建。
> 引用位置：`clients/build-assets.mjs`（可能还在引用，但 build-assets.mjs 本身也待清理）。

## 清理时机
下次重构 build-assets.mjs 时，一并删除本目录。
