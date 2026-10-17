# Skill: competitive-intel — 竞品情报与功能吸收手册

> 市场调查员的核心操作手册。每次做竞品研究或功能吸收时加载。

---

## 一、热门功能 Backlog（按绿角犀落地优先级排序）

### 🎵 音乐版专属（Music Only）

#### M-01 🔴 LRCLIB 在线歌词搜索
| 项 | 值 |
|---|---|
| 来源 | Voxity (LRCLIB + Musixmatch) |
| 优先级 | **P0** — 用户感知最强 |
| 成本 | 2-3 天 |
| API | `https://lrclib.net/api/get?trackName={title}&artistName={artist}&albumName={album}&duration={sec}` — 完全免费、无需 key |
| 绿角犀现状 | 已有 `src/lrc.js` 解析器，但只吃本地 .lrc 文件 |
| 落地路径 | 1) 扫描完 metadata 后调 LRCLIB 拿歌词 2) 结果存 IndexedDB 3) 设置面板加开关（Strict/Lax 双模式，参考 Voxity） 4) UI 加点击跳转 |
| 负责 Agent | frontend-dev + backend-dev |

#### M-02 🔴 自动主题色（从封面提取 dominant color）
| 项 | 值 |
|---|---|
| 来源 | Voxity + Snae Player |
| 优先级 | **P0** — 视觉"哇"点 |
| 成本 | 1 天 |
| API | Canvas API `getImageData()` → 简单聚类（median cut）拿主色 → 应用到 `--brand` / `manifest.theme_color` |
| 绿角犀现状 | 硬编码 `#00D8A6`，与封面无关 |
| 落地路径 | 新增 `src/dominantColor.js`（用 median cut 算法，200 行以内）→ cover 加载后自动触发 → 设置面板加"固定/自动"开关 → 同步改 manifest.theme_color |
| 负责 Agent | frontend-dev |

#### M-03 🟡 Media Session API 集成
| 项 | 值 |
|---|---|
| 来源 | Voxity + Vibe Music |
| 优先级 | **P1** |
| 成本 | 0.5 天 |
| API | `navigator.mediaSession.metadata` + `actionHandler` |
| 绿角犀现状 | **完全没接** |
| 落地路径 | 播放事件里 set metadata（title/artist/albumArt），handler 里注册 play/pause/previoustrack/nexttrack/seekto |
| 负责 Agent | frontend-dev |

#### M-04 🟡 Levenshtein 模糊搜索
| 项 | 值 |
|---|---|
| 来源 | Voxity（CTRL+F 搜索队列） |
| 优先级 | **P1** — 大曲库必备 |
| 成本 | 1 天 |
| 绿角犀现状 | 只有精确匹配 |
| 落地路径 | 新增 `src/fuzzy.js`（20 行 levenshtein 实现 + 阈值 0.2）→ `src/library.js` 搜索时先精确后模糊 |
| 负责 Agent | frontend-dev |

#### M-05 🟡 智能 shuffle（biased Fisher-Yates）
| 项 | 值 |
|---|---|
| 来源 | Vibe Music Radio Mode |
| 优先级 | **P1** |
| 成本 | 1 天 |
| 绿角犀现状 | `Math.random()` 全随机 |
| 落地路径 | 基于 IndexedDB 里的 playCount 加权，越常听出现概率越高但保证不重复 |
| 负责 Agent | frontend-dev |

#### M-06 🟡 睡眠定时器 + Wake Lock + 系统通知
| 项 | 值 |
|---|---|
| 来源 | Voxity |
| 优先级 | **P1** |
| 成本 | 各 0.5 天 |
| API | `navigator.wakeLock.request()` / `new Notification()` |
| 落地路径 | 底部控制条加睡眠按钮（15/30/60/自定义），播放时 request wake lock，切歌发通知 |
| 负责 Agent | frontend-dev |

#### M-07 🟢 AI 音乐分析（Vibe AI 模式）
| 项 | 值 |
|---|---|
| 来源 | Vibe Music AI assistant |
| 优先级 | **P2** — 概念验证 |
| 成本 | 5-7 天 |
| 落地路径 | 前端收集曲库统计（top artists, listening patterns）→ 本地规则引擎先跑通 → 可选接入 LLM API 生成"你的听歌画像" |
| 负责 Agent | frontend-dev（前端部分）+ backend-dev（API 部分） |

#### M-08 🟢 File System Access API 免复制
| 项 | 值 |
|---|---|
| 来源 | Snae Player |
| 优先级 | **P2** |
| 成本 | 2-3 天 |
| 绿角犀现状 | LocalServer 扫描目录复制到仓库，PWA 侧用 input[type=file] |
| 落地路径 | `showDirectoryPicker()` → 获取 FileSystemDirectoryHandle → 持久访问权限 → 直接读取元数据不复制，降级用 IndexedDB |
| 负责 Agent | frontend-dev + backend-dev |

---

### 🎬 播放器版专属（Player Only）

#### V-01 🔴 OpenSubtitles 在线字幕搜索 + 自动加载
| 项 | 值 |
|---|---|
| 来源 | Elmedia Video Player + VLC VLSub |
| 优先级 | **P0** |
| 成本 | 3-4 天 |
| API | `https://api.opensubtitles.com/api/v1/subtitles` — 需要免费注册拿 API key |
| 绿角犀现状 | 支持本地拖放字幕，但没有在线搜索 |
| 落地路径 | 1) 设置面板加 OpenSubtitles key 输入 2) 视频播放时用 hash + duration 搜索 3) 下载 SRT 转 VTT（浏览器只认 VTT）4) 内嵌 `<track>` 元素 |
| 负责 Agent | frontend-dev + backend-dev |

#### V-02 🔴 多音轨切换 + 音轨延迟修正
| 项 | 值 |
|---|---|
| 来源 | MX Player + Elmedia |
| 优先级 | **P0** |
| 成本 | 1-2 天 |
| 绿角犀现状 | HTML5 `<video>` 自动选第一音轨，无 UI |
| 落地路径 | `<video>.audioTracks` API → UI 弹层列出所有音轨 → 点击切换 → 音轨延迟在 ms 级别调整 |
| 负责 Agent | frontend-dev |

#### V-03 🟡 字幕偏移调节（毫秒级）+ 字幕样式配置
| 项 | 值 |
|---|---|
| 来源 | Voxity（歌词）+ MX Player（字幕手势） |
| 优先级 | **P1** |
| 成本 | 1 天 |
| API | VTTCue `startTime` / `endTime` 动态修改 |
| 落地路径 | 设置面板加 "字幕偏移 ± 500ms" 滑杆 → 字幕面板加字号/颜色 |
| 负责 Agent | frontend-dev |

#### V-04 🟡 Chromecast / DLNA 投屏
| 项 | 值 |
|---|---|
| 来源 | Elmedia + Cast Player |
| 优先级 | **P1** |
| 成本 | 3-4 天 |
| API | Chrome Cast Web Receiver SDK / WebRTC |
| 绿角犀现状 | `src/cast.js` 存在但只是协议桥接 |
| 落地路径 | PWA 侧用 `<cast-media-player>` + 发现设备 → LocalServer 侧做转码代理（WebDAV / UPnP）→ Android TWA 里调用原生 Cast SDK |
| 负责 Agent | frontend-dev + backend-dev + devops-engineer |

#### V-05 🟡 缩略图预览 Seek
| 项 | 值 |
|---|---|
| 来源 | Elmedia |
| 优先级 | **P1** |
| 成本 | 2-3 天 |
| 落地路径 | 用 Canvas 定时截帧 → 存 IndexedDB → 拖动进度条时滑出缩略图预览 |
| 负责 Agent | frontend-dev |

#### V-06 🟢 AI 字幕生成（本地 Whisper / WebAssembly）
| 项 | 值 |
|---|---|
| 来源 | VLC 4.0 CES 2025 demo + LLPlayer |
| 优先级 | **P2** — 等成熟 |
| 成本 | 1-2 周 |
| API | `whisper.cpp` 已有 WebAssembly 移植 |
| 绿角犀现状 | 没有 AI 能力 |
| 落地路径 | 引入 whisper.wasm (~80MB) → WebWorker 里跑 → 输出 VTT → 可选择是否提交 IndexedDB 缓存 |
| 负责 Agent | frontend-dev + backend-dev |

---

### 🔵 双 App 共用（Both）

#### B-01 🔴 File System Access API 目录扫描（免复制）
| 项 | 值 |
|---|---|
| 来源 | Snae Player |
| 优先级 | **P0** |
| 成本 | 2-3 天 |
| API | `window.showDirectoryPicker()` + `FileSystemHandle.requestPermission()` |
| 落地路径 | music/player 都需要 → 替代 input[type=file] → 持久访问权限后下次不用重新授权 → Chromium-only，降级用 IndexedDB 复制 |
| 负责 Agent | frontend-dev |

#### B-02 🟡 智能缓存管理
| 项 | 值 |
|---|---|
| 来源 | BlazorMusic + Xibo |
| 优先级 | **P1** |
| 成本 | 2 天 |
| 绿角犀现状 | SW Cache API 只管静态资源，媒体文件走流式不进缓存 |
| 落地路径 | 新增"离线收藏"功能 → 收藏的媒体主动存 IndexedDB Blob → 设置面板显示已用存储 + 一键清理 → 超过 500MB 警告 |
| 负责 Agent | frontend-dev + backend-dev |

#### B-03 🟡 Cloudflare WebDAV / 远程媒体同步
| 项 | 值 |
|---|---|
| 来源 | 现有 `cloud.js` + LocalServer WebDAV 代理 |
| 优先级 | **P1** |
| 成本 | 3 天 |
| 落地路径 | 把 `cloud.js` 从可选补全 → 做完整同步协议（播放进度 + 收藏 + 歌单）→ 支持自建 WebDAV / Nextcloud / 坚果云 |
| 负责 Agent | backend-dev |

#### B-04 🟢 AI Metadata 自动补全（MusicBrainz）
| 项 | 值 |
|---|---|
| 来源 | Vibe Music |
| 优先级 | **P2** |
| 成本 | 3-4 天 |
| API | `https://musicbrainz.org/ws/2/recording/?query=...` + CoverArtArchive `https://coverartarchive.org/` |
| 落地路径 | 扫描完后对 metadata 缺失的条目调 MusicBrainz → 用户确认后写回 IndexedDB + 可选写回文件（ID3 tag） |
| 负责 Agent | frontend-dev + backend-dev |

---

## 二、竞品雷达清单（每周必须扫）

### 本周重点（2026-09-13 起）
```bash
# 打开以下页面检查是否有更新日志 / changelog / release notes

# 1. Voxity（功能最像，每周扫）
https://voxity.dev/i/release_notes?standalone
https://github.com/exerinity/voxity/commits/main

# 2. Vibe Music（HN 2026 新作，看进展）
https://github.com/vibe-music/vibe-music-web
https://news.ycombinator.com/item?id=47016321

# 3. Snae Player（File System Access API 参考）
https://github.com/minht11/local-music-pwa

# 4. OnlinePlayer（视频字幕/Cast 参考）
https://onlineplayer.app/en/player

# 5. AudioLab by DSK（音频编辑参考）
https://www.dskmusic.com/?wp_ct=1100227

# 6. VLC 4.0 发布状态（AI 字幕）
https://www.videolan.org/vlc/
```

### GitHub trending 监控命令
```bash
# 在终端每周跑一次
gh search repos "pwa media player" --sort stars --limit 20
gh search repos "offline music player" --sort stars --limit 15
gh search repos "local video player" --sort stars --limit 15
```

### HN / Reddit 监控
```bash
# 最近一周 HN 上 "pwa media" 相关
curl -s "https://hn.algolia.com/api/v1/search?query=pwa+media+player&tags=story&numericFilters=created_at_i%3E$(date -v-7d +%s)" | jq '.hits[].title'

# Reddit r/webdev
curl -s "https://www.reddit.com/r/webdev/search.json?q=pwa+player+offline&sort=new&t=week" | jq '.data.children[].data.title'
```

---

## 三、功能吸收评估框架（给 AI 员工用）

每当市场调查员发现新功能，交给对应 Agent 时必须附这个评估：

```markdown
## 功能吸收评估

### 功能名：{XXX}
### 竞品来源：{XXX}（URL / commit hash）
### 描述：{一句话能干嘛}

### 评估维度

| 维度 | 得分 | 说明 |
|---|---|---|
| 用户价值 | 🟢/🟡/🔴 | 解决真实痛点还是锦上添花 |
| 实现成本 | Xd | 0.5d / 2d / 1w / 2w+ |
| 风险 | 🟢/🟡/🔴 | 引入闭源依赖？Android TWA 限制？ |
| 双 App 兼容 | music / player / both | 哪个版本需要 |
| 复用现有代码 | 是/否 | 绿角犀已有类似模块可扩 |

### 落地路径（3 步）
1. 
2. 
3. 

### 后续观测
- [ ] 两周后再查原竞品是否有迭代
- [ ] 看用户反馈（issue / email）
```

---

## 四、已有功能 vs 竞品 差距表

| 功能 | 绿角犀现状 | 竞品标杆 | 差距 |
|---|---|---|---|
| 🎵 歌词 | 仅本地 LRC | Voxity LRCLIB 在线搜索 + 点击跳转 | 🔴 无在线搜索 |
| 🎵 主题色 | 硬编码 #00D8A6 | Voxity 从封面自动提取 | 🔴 无动态 |
| 🎵 搜索 | 精确匹配 | Voxity Levenshtein 模糊 | 🟡 无容错 |
| 🎵 随机 | Math.random() | Vibe Music biased shuffle | 🟡 无偏好 |
| 🎵 媒体控件 | 无 | Voxity Media Session API | 🔴 完全没接 |
| 🎬 字幕 | 本地拖放 | Elmedia OpenSubtitles 在线搜索 | 🔴 无在线搜索 |
| 🎬 音轨 | 自动选第一轨 | MX Player 手动切换 + 延迟 | 🔴 无 UI |
| 🎬 Cast | 协议桥接未接 | Elmedia Cast + DLNA + AirPlay | 🟡 半成品 |
| 🎬 缩略图 Seek | 无 | Elmedia 拖动预览 | 🔴 完全没有 |
| 🎵+🎬 文件访问 | LocalServer 扫描 + input[type=file] | Snae File System Access API 免复制 | 🟡 多一次复制 |
| 🎵+🎬 缓存 | SW 静态资源 | BlazorMusic 媒体文件 IndexedDB | 🟡 无媒体缓存 |
| 🎵+🎬 AI | 无 | Vibe Music AI + VLC Whisper 字幕 | 🔴 无 AI 能力 |
