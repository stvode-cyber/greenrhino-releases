// TODO(#main_js_split): 当前单文件 48KB ~1200 行，建议未来按职责分拆：
//   src/main.js              — 保留：启动装配 + 入口路由（<10KB）
//   src/app/bootstrap.js     — 启动引导：版本检查、PWA 安装提示、首次启动引导
//   src/app/router.js        — view/showPage 路由表
//   src/app/importManager.js — 文件/文件夹导入、去重、并发队列
//   src/app/syncBridge.js    — 与 .NET/Kotlin 壳通信（LocalServer URL、cast、外部打开）
//   拆分时机：每次 main.js 改 3KB+ 时触发，或引入新角色时。
//   相关坑：ISS-20261017-004（vite.config.js 残留）
//   相关决策：DEC-20260909-001（拆双 App 时共享模块不物理删除）

// main.js — 应用装配与编排
window.__grModuleRan = true  // 🔶 终极诊断：如果 module 执行到这里就打标记
// 🔶 DEBUG: 打印 RhinoBridge 对象到底有哪些方法
setTimeout(() => {
  try {
    const rb = window.RhinoBridge
    if (rb) { /* RhinoBridge 已就绪，后续方法调用会自然验证 */ }
  } catch (e) { /* 忽略 */ }
}, 300)
import { h, toast, openModal, formatTime } from './ui/dom.js'
import { player } from './player.js'
import { ctx } from './app/context.js'
import { fmtQuota } from './app/format.js'
import {
  addMediaFiles, addMediaFromAndroid, updateMedia, getSettings, addImportRecord, getAllMedia, getMedia, saveSettings, on as onStore, isMediaFile,
  getFavorites, getPlaylists, getRecent, toggleFavorite, deletePlaylist
} from './store.js'
import { parseTags, guessFromFilename } from './metadata.js'
import { parseLRC } from './lrc.js'
import { fetchOnlineLyric } from './lyricFetch.js'
import { initBottomBar } from './ui/bottombar.js'
import { initCastStatusBar } from './ui/castStatusBar.js'
import { songRow } from './ui/library.js'
import { buildMusic } from './ui/music.js'
import { buildVideoPlayer } from './ui/videoPlayer.js'
import { buildFavorites } from './ui/favorites.js'
import { buildPlaylists } from './ui/playlists.js'
import { buildRecent } from './ui/recent.js'
import { buildStats } from './ui/stats.js'
import { openOnlineSearch } from './ui/onlinesearch.js'
import { buildCloud, syncAll } from './ui/cloud.js'
import { buildQueue } from './ui/queue.js'
import { openSettings } from './ui/settings.js'
import { openHelp } from './help.js'
import { initGestures } from './ui/gestures.js'
import { queueVideoThumbs } from './videoThumb.js'
import { playItem, playList, openSleepModal, wirePlayerErrorHandlers, wireVisibilityPause } from './app/playerUtils.js'

// store.js 事件总线
const app = {
  page: 'music',
  mode: 'music',
  search: '',
  currentList: [],
  activeSource: [], // 🔶 当前页面对应的播放源（library 全部 / favorites / 歌单），playItem 优先用它构建队列
  onStore,
  toast,
  refreshCurrent() { [music, video, favorites, playlists, recent, stats].forEach((p) => p?.refresh?.()); syncCurrentList() },
  playItem, playList, importFiles, importFilesDialog, importFolderDialog, relocateMedia,
  openQueue: () => queue.open(),
  openSleep: openSleepModal,
  openEQ: () => openSettings(app, 'eq'),
  openSettings: () => openSettings(app),
  openOnlineSearch: (q) => openOnlineSearch(app, q)
}

// ---------- 构建页面 ----------
// 窗口角色：C# 壳注入 window.__winRole = 'hub'|'music'|'video'；纯浏览器/无壳时按 hub（全量）处理。
const ROLE = (window.__winRole || 'hub')
const isHub = ROLE === 'hub'
const isMusic = ROLE === 'hub' || ROLE === 'music'
const isVideo = ROLE === 'hub' || ROLE === 'video'

// 顶部导航版本徽标：固定显示当前构建版本（build-web.mjs 注入 window.__appVersion），做版本对标尺
{
  const verEl = document.getElementById('app-version')
  if (verEl && window.__appVersion) verEl.textContent = window.__appVersion
}

const view = document.getElementById('view')
// 按角色只构建本窗所需页面：Hub 全量；Music 仅音乐库+歌单+收藏；Video 用内容网格+铺满播放器。
const music = isMusic ? buildMusic(app) : null
const video = isVideo ? buildVideoPlayer(app) : null
const favorites = isMusic ? buildFavorites(app, 'music') : null
const playlists = isMusic ? buildPlaylists(app, 'music') : null
const recent = isHub ? buildRecent(app) : null
const stats = isHub ? buildStats(app) : null
const cloud = (isHub || isMusic) ? buildCloud(app) : null
let home = null
try {
  home = isHub ? buildHome(app) : (ROLE === 'music' ? buildMusicHome(app) : ROLE === 'video' ? buildVideoHome(app) : buildHome(app))
} catch (e) {
  console.error('[init] buildHome/buildMusicHome 崩了:', e?.message, e?.stack)
}
const pages = {}
for (const [k, p] of Object.entries({ home, music, video, favorites, playlists, recent, stats, cloud })) {
  if (p) { pages[k] = p; view.appendChild(p.el) }
}
// 🔶 ISS-20261010-030: mineEl 必须在 home.el 被 append 后才插进去！
// buildMusicHome 内部 el.parentElement 为 null → insertBefore 会被跳过
if (home?.mineEl && home.el?.parentElement) {
  home.el.parentElement.insertBefore(home.mineEl, home.el.nextSibling)
} else if (home?.mineEl) {
  view.appendChild(home.mineEl)
}

// 按角色精简侧栏：隐藏本窗不需要的导航项
// player 壳：首页(视频网格) + 视频库 + 设置
// music 壳：首页(音乐问候) + 音乐库 + 歌单 + 收藏 + 云盘 + 设置
const allowedViews = isHub ? new Set(['home', 'music', 'video', 'recent', 'stats', 'playlists', 'favorites', 'cloud', 'settings'])
  : ROLE === 'music' ? new Set(['home', 'music', 'playlists', 'favorites', 'cloud', 'settings'])
  : new Set(['home', 'video', 'settings'])
document.querySelectorAll('.nav-item').forEach((b) => {
  if (b.dataset.view && !allowedViews.has(b.dataset.view)) b.style.display = 'none'
})
// 弹窗不提供「导入文件夹」目录导入（Hub 专有），保留单文件添加与拖拽导入
if (!isHub) {
  const _ff = document.getElementById('import-folder'); if (_ff) _ff.style.display = 'none'
  const _ft = document.getElementById('import-folder-top'); if (_ft) _ft.style.display = 'none'
}

// 影像窗口：纯黑居中播放器，移除侧栏/顶栏/底栏，专属 video-nav（与 music role 对称）
if (ROLE === 'video') {
  document.documentElement.dataset.theme = 'dark'
  document.body.classList.add('win-video')
  var _tbv = document.getElementById('topbar'); if (_tbv) _tbv.remove()
  var _asv = document.querySelector('aside'); if (_asv) _asv.remove()
  var _bbv = document.getElementById('bottombar'); if (_bbv) _bbv.remove()
}
// 音乐窗口：浅色主题（参考图白底 + 酷狗绿点缀），挂载 win-music 供专属样式作用
if (ROLE === 'music') {
  document.documentElement.dataset.theme = 'light'
  document.body.classList.add('win-music')
  var _tb2 = document.getElementById('topbar'); if (_tb2) _tb2.remove()
  var _as2 = document.querySelector('aside'); if (_as2) _as2.remove()
  var _bb2 = document.getElementById('bottombar'); if (_bb2) _bb2.remove()
}

// 🔶 大重构：填共享上下文（供后续拆出去的子模块 import 使用）
ctx.app = app
ctx.pages = pages
ctx.ROLE = ROLE
ctx.isHub = isHub
ctx.isMusic = isMusic
ctx.isVideo = isVideo

// 打开另一角色窗口：原生壳经消息交给 C# 创建/聚焦弹窗；纯浏览器退回页内切换
function openRoleWindow(role) {
  if (window.chrome?.webview) {
    try { window.chrome.webview.postMessage(JSON.stringify({ type: 'openWindow', role })) } catch {}
  } else if (pages[role]) { showPage(role) }
}

// 主控台落地页：三段式极简暗黑 —— 居中的 Xfplay 大 Logo + 搜索框（右侧内嵌放大镜）+ 底部版本信息。
// 底部播放控制条由全局 bottombar 承载；本页只负责「大面积留白的居中视觉中心」。
function buildHome(app) {
  const logo = h('div', { class: 'hub-logo' }, 'Xfplay')
  const input = h('input', { class: 'hub-input', type: 'search', placeholder: '搜索音乐 / 视频…', autocomplete: 'off' })
  const search = h('div', { class: 'hub-search' }, h('span', { class: 'hub-sicon' }, '🔍'), input)
  const footer = h('div', { class: 'hub-foot' }, '影音先锋 5.9.6 · 本地音视频离线播放器')
  const el = h('div', { class: 'hub-home' }, h('div', { class: 'hub-hero' }, logo, search, footer))
  // 与全局搜索共用同一份 query：输入即过滤，回车切入音乐页看结果
  input.addEventListener('input', (e) => {
    app.search = e.target.value.trim(); music?.refresh?.(); video?.refresh?.()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      app.search = (e.target.value || '').trim()
      music?.refresh?.(); video?.refresh?.()
      showPage('music')
    }
  })
  return { el, show() { setTimeout(() => input.focus?.(), 60) } }
}

// 🎬 Video App 专属首页（与 buildMusicHome 对称）
function buildVideoHome(app) {
  const hourNow = new Date().getHours()
  const hi = hourNow < 5 ? '夜深了' : hourNow < 11 ? '早上好' : hourNow < 14 ? '中午好' : hourNow < 18 ? '下午好' : '晚上好'

  const searchI = h('input', { class: 'hub-input mh-search', type: 'search', placeholder: '搜索本地视频…', autocomplete: 'off' })
  const localN = h('span', { class: 'mh-card-count' }, '0')

  const cardLocal = h('div', { class: 'mh-card', onclick: () => showPage('video') },
    h('div', { class: 'mh-card-icon' }, '🎬'),
    h('div', { class: 'mh-card-label' }, '本地视频'), localN)
  const cardImport = h('div', { class: 'mh-card', onclick: () => doOpenFiles(app) },
    h('div', { class: 'mh-card-icon' }, '📁'),
    h('div', { class: 'mh-card-label' }, '导入视频'),
    h('div', { class: 'mh-card-hint' }, '从文件管理器选片'))

  // 空库引导
  const emptyBox = h('div', { class: 'mh-empty-box', hidden: true },
    h('div', { class: 'mh-empty-big' }, '🎬'),
    h('p', {}, '还没有视频，先导入几部影片吧'),
    h('div', { class: 'mh-empty-actions' },
      h('button', { class: 'cta', onclick: () => doOpenFiles(app) }, '📁 导入视频'),
      h('button', { class: 'ghost-btn', onclick: () => showPage('video') }, '📺 浏览所有')))

  const el = h('div', { class: 'mh-home' },
    h('div', { class: 'mh-hello' },
      h('div', { class: 'mh-hi' }, hi + ' 👋'),
      h('div', { class: 'mh-sub' }, '今天看点什么好呢')),
    searchI,
    h('div', { class: 'mh-cards' }, cardLocal, cardImport),
    emptyBox)

  async function refresh() {
    const all = await getAllMedia()
    const vids = all.filter((m) => m.type === 'video')
    localN.textContent = vids.length
    emptyBox.hidden = vids.length > 0
  }
  searchI.addEventListener('input', (e) => { app.search = e.target.value.trim(); video?.refresh?.() })
  searchI.addEventListener('keydown', (e) => { if (e.key === 'Enter') { app.search = e.target.value.trim(); video?.refresh?.(); showPage('video') } })
  refresh()

  return { el, refresh, show() { setTimeout(() => searchI.focus?.(), 60) } }
}

// 🔶 DEC-20261009-005: 所有导入入口直接触发，不走中间层
// 📥 扫描音乐（MediaStore 全量扫） / 📁 手动打开（SAF 文件选择器）
function doScan() {
  if (window.RhinoBridge?.requestAutoImport) {
    toast('开始扫描音乐文件...', 'info')
    window.RhinoBridge.requestAutoImport()
  } else {
    toast('当前环境不支持自动扫描', 'warn')
  }
}
function doOpenFiles(app) {
  app.importFilesDialog()
}
window.doScan = doScan
window.doOpenFiles = doOpenFiles

// 🔶 ISS-20261009-018: Music App 专属首页（参考图风格 — 问候 + 搜索 + 大卡片 + 可折叠 section）
// 上一轮 UI 重构漏了函数体 → music role main.js init crash → SW 注册走不到（ISS-20261009-019）
// 🔶 用户要求：首页只留问候+搜索+两张大卡片，去掉歌单/最近播放/收藏单曲三个 section
// 详情/列表直接点卡片 → showPage('music') 或 showPage('favorites') 看完整列表
function buildMusicHome(app) {
  const hourNow = new Date().getHours()
  const hi = hourNow < 5 ? '夜深了' : hourNow < 11 ? '早上好' : hourNow < 14 ? '中午好' : hourNow < 18 ? '下午好' : '晚上好'

  const searchI = h('input', { class: 'hub-input mh-search', type: 'search', placeholder: '搜索本地音乐…', autocomplete: 'off' })
  const localN = h('span', { class: 'mh-card-count' }, '0')
  const favN = h('span', { class: 'mh-card-count' }, '0')

  const cardLocal = h('div', { class: 'mh-card', onclick: () => showPage('music') },
    h('div', { class: 'mh-card-icon' }, '🎵'),
    h('div', { class: 'mh-card-label' }, '本地音乐'), localN)
  const cardFav = h('div', { class: 'mh-card', onclick: () => showPage('favorites') },
    h('div', { class: 'mh-card-icon' }, '⭐'),
    h('div', { class: 'mh-card-label' }, '我的收藏'), favN)
  const cardImport = h('div', { class: 'mh-card', onclick: () => doOpenFiles(app) },
    h('div', { class: 'mh-card-icon' }, '📁'),
    h('div', { class: 'mh-card-label' }, '打开手机文件'),
    h('div', { class: 'mh-card-hint' }, '从文件管理器选歌'))

  // 空库引导：两直触按钮
  const emptyBox = h('div', { class: 'mh-empty-box', hidden: true },
    h('div', { class: 'mh-empty-big' }, '🎶'),
    h('p', {}, '还没有音乐，先导入几首歌吧'),
    h('div', { class: 'mh-empty-actions' },
      h('button', { class: 'cta', onclick: () => doScan() }, '📥 扫描音乐'),
      h('button', { class: 'ghost-btn', onclick: () => doOpenFiles(app) }, '📁 打开手机文件')))

  const el = h('div', { class: 'mh-home' },
    h('div', { class: 'mh-hello' },
      h('div', { class: 'mh-hi' }, hi + ' 👋'),
      h('div', { class: 'mh-sub' }, '今天也要开心听歌')),
    searchI,
    h('div', { class: 'mh-cards' }, cardLocal, cardFav, cardImport),
    emptyBox)

  async function refresh() {
    const [all, favs] = await Promise.all([getAllMedia(), getFavorites()])
    const songs = all.filter((m) => m.type === 'music')
    localN.textContent = songs.length
    favN.textContent = favs.length
    emptyBox.hidden = songs.length > 0
  }

  // 搜索：输入即过滤音乐页，回车跳过去看结果
  searchI.addEventListener('input', (e) => { app.search = e.target.value.trim(); music?.refresh?.() })
  searchI.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      app.search = searchI.value.trim()
      music?.refresh()
      showPage('music')
    }
  })

  refresh()

  // "我的"页 — 微信「我」风格：顶部头像区 + 图标+文字简洁列表行
  const mineEl = h('div', { class: 'mh-mine', hidden: true })
  async function showMine() {
    try {
      mineEl.innerHTML = ''
      mineEl.hidden = false
      el.hidden = true

      // ① 顶部：头像 + 账号信息（读 localStorage.gr_cloud_session，未登录引导登录）
      const cloudSess = (() => { try { return JSON.parse(localStorage.getItem('gr_cloud_session') || 'null') } catch { return null } })()
      const quotaHint = h('div', { class: 'wm-quota' })
      const nameEl = h('div', { class: 'wm-name' })
      const subEl = h('div', { class: 'wm-sub' })
      if (cloudSess?.token) {
        nameEl.textContent = '👤 ' + (cloudSess.username || '用户')
        subEl.textContent = '加载中...'
        quotaHint.textContent = `配额 ${fmtQuota(cloudSess.used || 0)} / ${fmtQuota(cloudSess.quota || 0)}`
      } else {
        nameEl.textContent = '绿角犀用户'
        subEl.textContent = '登录后可在音乐和视频 App 间同步'
        quotaHint.textContent = '点击登录 · 注册送 5GB'
      }
      const header = h('div', { class: 'wm-header' },
        h('div', { class: 'wm-avatar' }, cloudSess?.token ? '👤' : '🎵'),
        h('div', { class: 'wm-user-info' }, nameEl, subEl, quotaHint))
      if (cloudSess?.token) {
        header.style.cursor = 'pointer'
        header.addEventListener('click', () => { hideMine(); showPage('cloud') })
      } else {
        header.style.cursor = 'pointer'
        header.addEventListener('click', () => { hideMine(); showPage('cloud') })
      }

      mineEl.appendChild(header)

      // ② 微信风格列表行（先同步构好，等数据回来更新 count）
      function wmRow(icon, label, hint, onClick) {
        return h('div', { class: 'wm-row', onclick },
          h('div', { class: 'wm-row-icon' }, icon),
          h('div', { class: 'wm-row-label' }, label),
          hint ? h('div', { class: 'wm-row-hint' }, hint) : null,
          h('div', { class: 'wm-row-arrow' }, '›'))
      }

      const hintFav = h('span', { class: 'wm-row-hint' }, '...')
      const hintPls = h('span', { class: 'wm-row-hint' }, '...')
      const hintRecent = h('span', { class: 'wm-row-hint' }, '...')

      const list = h('div', { class: 'wm-list' },
        wmRow('☁️', '个人空间', cloudSess?.token ? `${fmtQuota(cloudSess.used||0)} / ${fmtQuota(cloudSess.quota||5*1024**3)}` : '5GB', () => { hideMine(); showPage('cloud') }),
        // 🔶 云同步按钮：登录后显示「立即同步」，音乐和视频两 App 打通桥梁
        cloudSess?.token ? wmRow('🔄', '立即同步', '音乐↔视频歌单/收藏', async () => {
          try { toast('同步中...', 'info'); const r = await syncAll(); toast(`同步完成：更新 ${r.push.ok ? 'OK' : '冲突'}`, 'ok'); showMine() }
          catch (e) { toast('同步失败：' + e.message, 'err') }
        }) : null,
        wmRow('⭐', '我的收藏', hintFav, () => { hideMine(); showPage('favorites') }),
        wmRow('📃', '我的歌单', hintPls, () => { hideMine(); showPage('playlists') }),
        wmRow('🕐', '最近播放', hintRecent, () => { toast('最近播放功能开发中…', 'info') }),
        h('div', { class: 'wm-sep' }),
        wmRow('🌙', '主题外观', document.documentElement.getAttribute('data-theme') === 'dark' ? '深色' : '浅色', () => {
          const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
          const next = cur === 'dark' ? 'light' : 'dark'
          saveSettings({ theme: next })
          document.documentElement.setAttribute('data-theme', next)
          player.emit('theme', next)
          toast('已切换' + (next === 'dark' ? '深色' : '浅色') + '主题', 'ok')
          showMine()
        }),
        wmRow('⚙️', '设置', '', () => openSettings(app)),
        wmRow('ℹ️', '关于', 'v16', () => toast('绿角犀音乐 v16 · 离线优先播放器', 'ok')))

      mineEl.appendChild(list)

      // ③ 异步拉数据更新副标题和 count
      try {
        const [favs, pls, recent, all] = await Promise.all([getFavorites(), getPlaylists(), getRecent(30), getAllMedia()])
        const songs = all.filter((m) => m.type === 'music')
        header.querySelector('.wm-sub').textContent = `${songs.length} 首本地音乐 · ${favs.length} 收藏 · ${pls.length} 歌单`
        hintFav.textContent = favs.length + ' 首'
        hintPls.textContent = pls.length + ' 个'
        hintRecent.textContent = recent.length + ' 首'
      } catch (e) {
        header.querySelector('.wm-sub').textContent = '加载失败：' + (e?.message || e)
      }
    } catch (e) {
      // 兜底：任何异常都不应该让页面空白
      console.error('[mine] showMine 崩溃:', e?.message, 'stack:', e?.stack)
      toast('我的页面加载失败：' + (e?.message || e), 'err')
      el.hidden = false
      mineEl.hidden = true
    }
  }
  function hideMine() { mineEl.hidden = true; el.hidden = false }

  // 把 mineEl 加到 view（和 home.el 同级）
  // ⚠️ ISSUE: 这里 buildMusicHome 还没返回，home.el 也还没被 append 到 view
  // 所以 el.parentElement 是 null！必须延后到 pages 循环 append 之后！
  // 现在 buildMusicHome 内部把 mineEl 挂到 home 对象上供外部使用

  return { el, show: refresh, refresh, showMine, hideMine, mineEl }
}

// ---------- 🎵 全屏播放页（大歌词居中 + 进度条 + 控制按钮） ----------
const MODE_ORDER = ['loop', 'order', 'random', 'one']
function modeIcon(m) {
  return m === 'random' ? '🔀' : m === 'one' ? '🔂' : m === 'order' ? '▶' : '🔁'
}
function openMusicFullpage() {
  if (document.getElementById('music-fullpage')) return
  let item = player.current

  // 🔶 ISS-20261010-025: 进入全屏播放页时自动填充队列（如果还空着）
  // 用户可能没先点歌就进了全屏 → queue=0 → 点列表抽屉也是空的
  if (!player.queue.length) {
    getAllMedia().then((all) => {
      const songs = all.filter((m) => m.type === 'music')
      if (songs.length) {
        player.setQueue(songs, item?.id || songs[0].id)
        // 如果还没在播放，预载第一首（不自动响）
        // trackchanged 事件会自动更新 titleEl/artistEl/歌词等（见下方 offTrack）
        if (!item) player.playItem(songs[0], { autoplay: false })
      }
    })
  }

  const titleEl = h('div', { class: 'pfp-title' }, item?.title || item?.name || '未在播放')
  const artistEl = h('div', { class: 'pfp-artist' }, item?.artist || item?.album || '')
  const linesWrap = h('div', { class: 'pfp-lines' })
  const lyricsEl = h('div', { class: 'pfp-lyrics' }, linesWrap)
  if (!item?.lyric) {
    lyricsEl.appendChild(h('div', { class: 'pfp-empty' }, item ? '暂无歌词 · 可在音乐页点「搜歌词」在线匹配' : '🎵 先选一首歌开始吧'))
  }

  const seek = h('input', { class: 'pfp-seek', type: 'range', min: 0, max: 1000, value: 0 })
  const curT = h('span', {}, '0:00')
  const durT = h('span', {}, formatTime(item ? player.getDuration() || 0 : 0))
  const playBtn = h('button', {
    class: 'pfp-play',
    onclick: () => { if (!item) toast('先选一首歌'); else player.toggle() }
  }, player.isPlaying() ? '⏸' : '▶')
  const favBtn = h('button', {
    title: '收藏',
    onclick: async () => {
      if (!item) return
      const f = await toggleFavorite(item.id)
      favBtn.textContent = f ? '❤️' : '🤍'
    }
  }, item?.favorite ? '❤️' : '🤍')
  const modeBtn = h('button', {
    title: '播放模式',
    onclick: () => {
      const cur = player.playModes[player.mode] || 'loop'
      const next = MODE_ORDER[(MODE_ORDER.indexOf(cur) + 1) % MODE_ORDER.length]
      player.setPlayMode(next, player.mode)
      modeBtn.textContent = modeIcon(next)
    }
  }, modeIcon(player.playModes[player.mode] || 'loop'))

  const fp = h('div', { id: 'music-fullpage', class: 'player-fullpage' },
    h('div', { class: 'pfp-top' },
      h('button', { class: 'pfp-back', 'aria-label': '返回', onclick: close }, '‹'),
      h('div', { class: 'pfp-title-wrap' }, titleEl, artistEl),
      h('button', { class: 'pfp-list', 'aria-label': '播放列表', onclick: () => app.openQueue() }, '📋 列表')),
    lyricsEl,
    h('div', { class: 'pfp-bottom' },
      seek,
      h('div', { class: 'pfp-times' }, curT, durT),
      h('div', { class: 'pfp-ctrl' },
        modeBtn,
        h('button', { title: '上一首', onclick: () => player.prev() }, '⏮'),
        playBtn,
        h('button', { title: '下一首', onclick: () => player.next(true) }, '⏭'),
        favBtn)))
  document.body.appendChild(fp)

  let lyrics = item?.lyric ? parseLRC(item.lyric) : []
  let lastIdx = -2
  function renderLines() {
    linesWrap.innerHTML = ''
    lyrics.forEach((l) => {
      const line = h('div', { class: 'pfp-line' }, l.text || '♪')
      line.addEventListener('click', () => player.seek(l.time))
      linesWrap.appendChild(line)
    })
  }
  renderLines()

  const offTime = player.on('time', ({ time }) => {
    const dur = player.getDuration() || 0
    if (document.activeElement !== seek) seek.value = dur ? Math.round((time / dur) * 1000) : 0
    curT.textContent = formatTime(time)
    if (!lyrics.length) return
    let idx = -1
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= time + 0.2) idx = i
      else break
    }
    if (idx === lastIdx) return
    lastIdx = idx
    const lines = linesWrap.querySelectorAll('.pfp-line')
    lines.forEach((l, i) => l.classList.toggle('active', i === idx))
    lines[idx]?.scrollIntoView({ block: 'center' })
  })
  const offTrack = player.on('trackchanged', async (it) => {
    item = it
    lastIdx = -2
    titleEl.textContent = it.title || it.name || '未在播放'
    artistEl.textContent = it.artist || it.album || ''
    favBtn.textContent = it.favorite ? '❤️' : '🤍'
    lyrics = it.lyric ? parseLRC(it.lyric) : []
    lyricsEl.innerHTML = ''
    if (lyrics.length) { lyricsEl.appendChild(linesWrap); renderLines() }
    else {
      // 🔶 ISS-20261010-027: 没内嵌歌词 → 自动在线搜 LRCLIB
      const emptyBox = h('div', { class: 'pfp-empty' }, '🔍 正在联网匹配歌词...')
      lyricsEl.appendChild(emptyBox)
      const online = await fetchOnlineLyric(it)
      if (online && online.length) {
        lyrics = online
        lyricsEl.innerHTML = ''
        lyricsEl.appendChild(linesWrap)
        renderLines()
        toast('已匹配在线歌词', 'ok')
      } else {
        emptyBox.textContent = navigator.onLine ? '😅 未匹配到歌词' : '📡 离线状态无法联网匹配'
      }
    }
    durT.textContent = formatTime(player.getDuration() || 0)
  })
  const offPlay = player.on('play', () => { playBtn.textContent = '⏸' })
  const offPause = player.on('pause', () => { playBtn.textContent = '▶' })

  // 拖进度条：实时跳转
  seek.addEventListener('input', () => {
    const dur = player.getDuration() || 0
    if (dur) { const t = dur * seek.value / 1000; player.seek(t); curT.textContent = formatTime(t) }
  })

  function close() {
    offTime(); offTrack(); offPlay(); offPause()
    fp.remove()
  }
}

function showPage(name) {
  if (!pages[name]) return // 弹窗角色下该视图未构建，直接忽略（避免操作无关媒体崩溃）
  app.page = name
  // 音乐 / 视频属于「模式」页：切换时同步全局模式并记住
  if (name === 'music' || name === 'video') {
    app.mode = name
    saveLastMode(name)
  }
  for (const [k, p] of Object.entries(pages)) {
    const active = k === name
    p.el.style.display = active ? '' : 'none'
    if (active) p.show?.()
    else p.hide?.()
  }
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name))
  // 底栏播放模式徽章跟随当前界面（音乐/视频各自独立）
  app.refreshModeBadge?.()
}
ctx.showPage = showPage  // 🔶 大重构：让 importManager 等子模块能用 showPage

// 各窗默认落点：Hub 主控台(首页)、Music 进问候首页、Video 视频
showPage(isHub ? 'home' : (ROLE === 'music' ? 'home' : ROLE))

// 底栏 + 队列 + 手势
initBottomBar(app)
initCastStatusBar()
const queue = buildQueue(app)
initGestures(app)

// 🔶 Android MediaStore 自动导入回调（Native 扫描完回喂 JS）
// 🔶 Android MediaStore 自动导入——分批累积再一次性落库
let __mediaBatchBuf = []
window.__mediaBatch = async (items, status) => {
  if (items?.length) __mediaBatchBuf.push(...items)
  if (status === 'ok') {
    const all = __mediaBatchBuf
    __mediaBatchBuf = []
    localStorage.setItem('__grFirstScanDone', '1')
    if (!all.length) { toast('扫描完成但没发现视频', 'info'); return }
    toast(`自动扫描到 ${all.length} 个视频/音频，导入中...`, 'ok')
    const added = await addMediaFromAndroid(all)
    toast(`导入完成：新增 ${added.length} 个`, 'ok')
    // 🔶 ISS-20261010-026: Android MediaStore 导入后补解析内嵌 ID3 标签
    // addMediaFromAndroid 只存基础字段，跳过了 parseTags；
    // 但 JS fetch(content://uri) 已由 Kotlin shouldInterceptRequest 代理 → 可 fetch 文件读内嵌 USLT 歌词 + 封面
    const musicAdded = added.filter(i => i.type === 'music')
    if (musicAdded.length) {
      toast(`正在解析 ${musicAdded.length} 个音频的内嵌歌词...`, 'info')
      let lyricCount = 0, coverCount = 0
      for (const it of musicAdded) {
        try {
          const res = await fetch(it.uri)
          if (!res.ok) continue
          const blob = await res.blob()
          const tags = await parseTags(blob)
          const patch = {}
          if (tags.lyrics) { patch.lyric = tags.lyrics; lyricCount++ }
          if (tags.cover) { patch.cover = tags.cover; coverCount++ }
          // title/artist/album 如果 MediaStore 给的和文件名猜的一样（MediaStore 可能没带），用 ID3 真正的
          if (tags.title && tags.title !== it.name.replace(/\.[^.]+$/, '')) patch.title = tags.title
          if (tags.artist && !it.artist) patch.artist = tags.artist
          if (tags.album && !it.album) patch.album = tags.album
          if (Object.keys(patch).length) await updateMedia(it.id, patch)
        } catch (e) { console.error('[gr] parseTags FAIL for ' + it.name + ': ' + e.message) }
      }
      if (lyricCount) toast(`解析到 ${lyricCount} 首内嵌歌词，${coverCount} 张封面`, 'ok')
      else toast('部分音频无内嵌歌词，可点「搜歌词」在线匹配', 'info')
    }
    // 🔶 ISS-20261008-006：给新导入的视频排队抽帧生成封面
    const newVideos = added.filter(i => i.type === 'video')
    if (newVideos.length) queueVideoThumbs(newVideos)
  }
}
// 兼容旧单批入口
window.__mediaImported = (items, status) => window.__mediaBatch(items, status)

// 🔶 ISS-20261009-007：所有扫描一律用户手动触发（工具栏「📥 自动扫描」），
// 启动时绝不自动请求权限/扫描。之前 JS 端 setTimeout 首次自动扫的残留已删除。

// 🔶 ISS-20261008-006：启动时对已存在的视频也排队抽帧（兜底，防止之前导入的没封面）
setTimeout(async () => {
  try {
    const all = await getAllMedia()
    const videos = all.filter(i => i.type === 'video')
    if (videos.length) queueVideoThumbs(videos)
  } catch {}
}, 3000);
const sidebar = document.getElementById('sidebar')
document.getElementById('menu-toggle')?.addEventListener('click', () => sidebar?.classList.toggle('open'))

// ---------- bootstrap（已抽到 app/bootstrap.js） ----------
import { initBootstrap, wirePlayerPersistence, wireMediaSession, wirePWA } from './app/bootstrap.js'
initBootstrap().catch((e) => console.error('[init] bootstrap 失败:', e?.message))
wirePlayerPersistence()
wireMediaSession()
wirePWA()

// ---------- 导入（已抽到 app/importManager.js） ----------
import { importOverlay, makeFileInput, importFilesDialog, importFolderDialog, importFiles, relocateMedia } from './app/importManager.js'
ctx.importOverlay = importOverlay
// doImport 内部引用 ctx.showPage，importManager 内部已实现，main.js 不再单独定义

// ---------- 播放（已抽到 app/playerUtils.js → playItem / playList / openSleepModal） ----------

// ---------- 首次启动引导（已抽到 app/bootstrap.js → openWelcome） ----------

// ---------- 导航 / 顶栏 ----------
// 音乐/视频切换：Hub 点导航弹独立窗口；弹窗内只有本类型的单向入口（仅 Hub 显示 music/video 项）。
document.getElementById('nav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item')
  if (!btn) return
  if (btn.dataset.action === 'help') { openHelp(); sidebar?.classList.remove('open'); return }
  const v = btn.dataset.view
  if (v === 'settings') openSettings(app)
  else if (isHub && (v === 'music' || v === 'video')) openRoleWindow(v)
  else showPage(v)
  sidebar?.classList.remove('open')
})

// 🎵 音乐 App 底部三栏导航：发现（首页）/ 中间大按钮（全屏播放页）/ 我的
const musicNav = document.getElementById('music-nav')
musicNav?.addEventListener('click', (e) => {
  const b = e.target.closest('.mn-item')
  if (!b) return
  const k = b.dataset.mn
  if (k === 'discover') { home?.hideMine?.(); showPage('home') }
  else if (k === 'nowplaying') openMusicFullpage()
  else if (k === 'mine') home?.showMine?.()
  musicNav.querySelectorAll('.mn-item').forEach((x) => x.classList.toggle('active', x === b && k !== 'nowplaying'))
})
// 🎬 播放器 App 底部三栏导航：首页（视频库）/ 中间大按钮（视频播放器）/ 设置
const videoNav = document.getElementById('video-nav')
videoNav?.addEventListener('click', (e) => {
  const b = e.target.closest('.vn-item')
  if (!b) return
  const k = b.dataset.vn
  if (k === 'home') showPage('home')
  else if (k === 'player') showPage('video')
  else if (k === 'settings') openSettings(app)
  videoNav.querySelectorAll('.vn-item').forEach((x) => x.classList.toggle('active', x === b && k !== 'player'))
})
document.getElementById('search')?.addEventListener('input', (e) => {
  app.search = e.target.value.trim()
  music?.refresh()
  video?.refresh()
})
document.getElementById('import-files')?.addEventListener('click', importFilesDialog)
document.getElementById('import-folder')?.addEventListener('click', importFolderDialog)
const _ift = document.getElementById('import-folder-top'); if (_ift) _ift.addEventListener('click', importFolderDialog)

// 维护 currentList 供队列上下文使用（音乐/视频各自页内库刷新后同步）
async function syncCurrentList() { app.currentList = await getAllMedia() }
syncCurrentList()

function saveLastMode(mode) { saveSettings({ lastMode: mode }) }

// ---------- 键盘快捷键 ----------
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (document.querySelector('.modal-mask')) return
  switch (e.key) {
    case ' ': e.preventDefault(); player.toggle(); break
    case 'ArrowLeft': player.seek(Math.max(0, player.getTime() - 5)); break
    case 'ArrowRight': player.seek(player.getTime() + 5); break
    case 'ArrowUp': e.preventDefault(); player.setVolume(player.volume + 0.05); break
    case 'ArrowDown': e.preventDefault(); player.setVolume(player.volume - 0.05); break
    case 'm': case 'M': player.setMute(!player.muted); break
    case 'n': case 'N': player.next(true); break
    case 'p': case 'P': player.prev(); break
    case 'f': case 'F':
      if (app.mode === 'video') { const v = document.querySelector('video'); if (document.fullscreenElement) document.exitFullscreen(); else v?.requestFullscreen?.() }
      break
  }
})

// ---------- Media Session（已抽到 app/bootstrap.js → wireMediaSession） ----------

// ---------- 异常态 / 后台暂停（已抽到 app/playerUtils.js → wirePlayerErrorHandlers / wireVisibilityPause） ----------
wirePlayerErrorHandlers()
wireVisibilityPause()

// ---------- SW / PWA 安装（已抽到 app/bootstrap.js → wirePWA） ----------

  console.log('绿角犀播放器 · 离线媒体播放器已就绪')

// ---------- 外部打开（双击文件 / 系统默认关联） ----------
// C# 壳把双击传入的本地文件登记进 LocalServer 白名单，页面加载完成后通过
// ExecuteScriptAsync 调用本函数：逐文件经 /api/external?t= 取回字节 -> File -> 导入并播放
window.__hostOpen = async (list) => {
  try {
    // 外部打开（双击文件）：先立标志，让下方 getSettings 的「恢复上次播放」跳过——
    // 否则恢复逻辑若在导入播放之后才完成，会用上次的旧曲目顶掉双击的这个文件，
    // 表现为「双击 MP4 却停在媒体库/播的不是这个视频」。
    window.__hostOpened = true
    if (!Array.isArray(list) || !list.length) return
    // 立即切到播放页：大文件读取/入库期间不再长时间停在媒体库
    app.mode = list[0].type
    showPage(list[0].type)
    const files = []
    for (const it of list) {
      const r = await fetch('/api/external?t=' + encodeURIComponent(it.token))
      if (!r.ok) continue
      const blob = await r.blob()
      files.push(new File([blob], it.name, { type: it.type || '' }))
    }
    if (!files.length) return
    const added = await importFiles(files, '外部打开', importOverlay.progress)
    if (added.length) {
      // 把外部文件的本地绝对路径记到媒体项，供视频黑屏时 C# 原生兜底播放
      added.forEach((it, i) => { if (list[i]) it.localPath = list[i].path })
      // 立即收起导入遮罩（不再残留 1.3s 挡住刚切好的播放页），随后马上开始播放
      importOverlay.hide()
      playList(added, added[0])
    } else { importOverlay.hide(); toast('没有可播放的媒体文件', 'err') }
  } catch (e) { console.error('__hostOpen error', e) }
}



