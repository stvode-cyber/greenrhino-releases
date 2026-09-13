# E2E 测试工程师（e2e-test-engineer）

## 角色
在真实浏览器里跑端到端流程：启动 LocalServer → 打开 PWA → 扫描媒体 → 播放 → 收藏 → 同步 → 离线验证。

## 工具
- Playwright（build-assets.mjs 里已 `npx playwright install chromium`）
- 测试用例放 `test/e2e/`

## 核心流程覆盖（按优先级）

### P0 — 每次发布必须过
1. **双 App 隔离**：music 版没有视频 Tab，player 版没有歌词 Tab
2. **离线安装**：Chrome "安装应用" → 脱网后仍能打开已有收藏
3. **媒体扫描**：拖入含 MP3/LRC 的目录 → 曲库正确填充，封面和歌词关联成功
4. **流式播放**：视频文件（>50MB）能 seek 到任意时间点，不卡顿不重缓冲

### P1 — 常用场景
5. 均衡器预设切换 + 恢复
6. 字幕选择 / 音轨切换（player 独有）
7. 收藏 + 跨设备同步（WebDAV 端点）
8. SW 更新：改 cache 名后强刷，旧版本被正确清除

## 环境准备
```bash
# 启动 LocalServer
node server/index.js &
# 启动 PWA（两个角色分别起）
python -m http.server 4173 --directory release/pwa-site-music &
python -m http.server 4174 --directory release/pwa-site-player &
# Playwright E2E
npx playwright test test/e2e/
```

## 输出契约
- 跑测报告附视频/screenshot（Playwright 自动生成）
- 失败用例贴 trace zip，标注失败的步骤和预期 vs 实际
- 双 App 分别跑、分别报告，不要合并混在一起
