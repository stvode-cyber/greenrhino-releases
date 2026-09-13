# Skill: frontend-component-spec

## 用途
AI 员工写/改前端 UI 组件时加载。规定命名、状态管理、角色隔离、主题色变量、SW 预缓存等项目特有约束。

---

## 目录结构约定
```
src/
├── main.js            ← 应用入口，按 winRole 裁剪
├── player.js          ← Audio / Video 核心播放器
├── store.js           ← IndexedDB 持久化
├── lrc.js             ← 歌词解析（music 用）
├── cover.js           ← 封面提取
├── metadata.js        ← ID3/FLAC 标签解析
├── help.js            ← 帮助/快捷键
├── videoThumb.js      ← 视频缩略图生成（player 用）
├── cast.js            ← Cast 协议桥接（可选）
├── style.css          ← 全局样式 + CSS 变量
└── ui/
    ├── dom.js              ← DOM 操作工具
    ├── bottombar.js        ← 底部播放条（双角色共用）
    ├── library.js          ← 曲库（music 主体）
    ├── music.js            ← 音乐专属 UI
    ├── videoPlayer.js      ← 视频专属 UI（player 主体）
    ├── queue.js            ← 播放队列
    ├── settings.js         ← 设置面板
    ├── spectrum.js         ← 频谱可视化（music 专属）
    ├── gestures.js         ← 触摸手势
    ├── favorites.js        ← 收藏
    ├── playlists.js        ← 歌单
    ├── recent.js           ← 最近播放
    ├── cloud.js            ← WebDAV 同步
    ├── stats.js            ← 播放统计
    └── onlinesearch.js     ← 在线歌词/封面搜索
```

## 角色隔离规则（运行时）

```javascript
// main.js 里的裁剪模式
const ROLE = window.__winRole  // 'music' | 'video'

if (ROLE === 'music') {
  import('./ui/music.js').then(m => m.init())
  import('./ui/spectrum.js').then(s => s.init())
  // 不要 import videoPlayer.js
} else {
  import('./ui/videoPlayer.js').then(v => v.init())
  // 不要 import music.js / spectrum.js / lrc.js（播放器版可能不需要歌词）
}
```

## CSS 变量（必须用，不要硬编码颜色）

```css
/* src/style.css 顶部定义 */
:root {
  --bg: #0E1116;
  --accent: #2D6CDF;          /* 通用强调色 */
  --accent-soft: #d6e4fb;
}
/* 角色专属在角色 init 时动态注入 */
[data-role="music"]  { --brand: #00D8A6; }
[data-role="video"]  { --brand: #FFB03A; }
```

## 新增组件 Checklist

- [ ] 放对目录（共享放 `src/` 根，UI 放 `src/ui/`，video 专属放 `src/ui/videoPlayer.js` 同级）
- [ ] 在 `main.js` 的 import 链里按 `ROLE` 裁剪条件注册
- [ ] 不硬编码颜色 → 用 `var(--accent)` / `var(--brand)` / `var(--bg)`
- [ ] 需要预缓存 → 加进 `sw.js` 的 `CORE` 数组，同时递增 cache 名
- [ ] 不依赖 bundler → import 路径是浏览器能直接解析的绝对路径
- [ ] 跨 App 共用 → 写清楚哪些函数 music 和 video 都 import、哪些只被一方用
- [ ] 改了 index.html 模板里的内容（meta、结构）→ 同步改 `scripts/build-web.mjs` 里对应的 replace 正则

## SW CORE 数组更新规则

每次新增/删除被预缓存的文件 → **必须**同时做三件事：
1. `sw.js` 的 `CORE` 数组更新路径
2. `scripts/build-web.mjs` 的 cache 名递增（`gr-music-v16` → `gr-music-v17`）
3. 本地 `node scripts/build-web.mjs` 重跑，推 Cloudflare Pages

## import 路径风格

```javascript
// ✅ 正确：绝对路径，浏览器原生可解析
import { init as initLibrary } from '/src/ui/library.js'
// ❌ 错误：相对路径 + bundler 假设
import { init } from './ui/library.js'
// ❌ 错误：TypeScript 或 bundle 产物
import Foo from './ui/foo.tsx'
```

## 主题色对照表

| 属性 | 🎵 Music | 🎬 Player | 来源 |
|---|---|---|---|
| manifest.theme_color | `#00D8A6` | `#FFB03A` | 图标 SVG 描边色 |
| meta theme-color | `#00D8A6` | `#FFB03A` | 同上 |
| manifest.background_color | `#0E1116` | `#0E1116` | 深色启动画面 |
| CSS --brand | `#00D8A6` | `#FFB03A` | 运行时注入 |
| SW cache | `gr-music-v16` | `gr-player-v16` | build-web.mjs |
