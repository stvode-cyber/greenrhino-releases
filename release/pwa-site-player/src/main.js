// main.js — 应用装配与编排
import { h, toast, openModal, formatTime } from './ui/dom.js'
import { player } from './player.js'
import {
  addMediaFiles, addMediaFromAndroid, updateMedia, getSettings, addImportRecord, getAllMedia, getMedia, saveSettings, on as onStore, isMediaFile,
  getFavorites, getPlaylists, getRecent, toggleFavorite
} from './store.js'
import { parseTags, guessFromFilename } from './metadata.js'
import { parseLRC } from './lrc.js'
import { initBottomBar } from './ui/bottombar.js'
import { songRow } from './ui/library.js'
import { buildMusic } from './ui/music.js'
import { buildVideoPlayer } from './ui/videoPlayer.js'
import { buildFavorites } from './ui/favorites.js'
import { buildPlaylists } from './ui/playlists.js'
import { buildRecent } from './ui/recent.js'
import { buildStats } from './ui/stats.js'
import { openOnlineSearch } from './ui/onlinesearch.js'
import { buildCloud } from './ui/cloud.js'
import { buildQueue } from './ui/queue.js'
import { openSettings } from './ui/settings.js'
import { openHelp } from './help.js'
import { initGestures } from './ui/gestures.js'
import { queueVideoThumbs } from './videoThumb.js'

// store.js 事件总线
const app = {
  page: 'music',
  mode: 'music',
  search: '',
  currentList: [],
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
const cloud = isHub ? buildCloud(app) : null
const home = isHub ? buildHome(app) : (ROLE === 'music' ? buildMusicHome(app) : null)
const pages = {}
for (const [k, p] of Object.entries({ home, music, video, favorites, playlists, recent, stats, cloud })) {
  if (p) { pages[k] = p; view.appendChild(p.el) }
}

// 按角色精简侧栏：隐藏本窗不需要的导航项
const allowedViews = isHub ? new Set(['home', 'music', 'video', 'recent', 'stats', 'playlists', 'favorites', 'cloud', 'settings'])
  : ROLE === 'music' ? new Set(['music', 'playlists', 'favorites'])
  : new Set(['video'])
document.querySelectorAll('.nav-item').forEach((b) => {
  if (b.dataset.view && !allowedViews.has(b.dataset.view)) b.style.display = 'none'
})
// 弹窗不提供「导入文件夹」目录导入（Hub 专有），保留单文件添加与拖拽导入
if (!isHub) { const _ff = document.getElementById('import-folder'); if (_ff) _ff.style.display = 'none' }

// 影像窗口：藏起侧栏，做成纯黑居中的三段式播放器
if (ROLE === 'video') {
  document.body.classList.add('win-video')
  document.documentElement.dataset.theme = 'dark'   // 同步设深色主题，等不起异步 getSettings
}
// 音乐窗口：浅色主题（参考图白底 + 酷狗绿点缀），挂载 win-music 供专属样式作用
if (ROLE === 'music') {
  document.documentElement.dataset.theme = 'light'
  document.body.classList.add('win-music')
}

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

// 🔶 ISS-20261009-018: Music App 专属首页（参考图风格 — 问候 + 搜索 + 大卡片 + 可折叠 section）
// 上一轮 UI 重构漏了函数体 → music role main.js init crash → SW 注册走不到（ISS-20261009-019）
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

  // 三个可折叠 section（点头部折叠）
  const plBody = h('div', { class: 'mh-section-body' })
  const rcBody = h('div', { class: 'mh-section-body' })
  const fvBody = h('div', { class: 'mh-section-body' })
  const plSec = makeSection('🎧 我创建的歌单', plBody)
  const rcSec = makeSection('🔥 最近播放', rcBody)
  const fvSec = makeSection('❤️ 收藏的单曲', fvBody)

  // 空库引导：两个入口一步到位
  const emptyBox = h('div', { class: 'mh-empty-box', hidden: true },
    h('div', { class: 'mh-empty-big' }, '🎶'),
    h('p', {}, '还没有音乐，先导入几首歌吧'),
    h('div', { class: 'mh-empty-actions' },
      h('button', {
        class: 'cta', onclick: () => {
          if (window.RhinoBridge?.requestAutoImport) window.RhinoBridge.requestAutoImport()
          else toast('当前环境不支持自动扫描')
        }
      }, '📥 自动扫描'),
      h('button', { class: 'ghost-btn', onclick: () => app.importFilesDialog() }, '📁 选择文件')))

  const el = h('div', { class: 'mh-home' },
    h('div', { class: 'mh-hello' },
      h('div', { class: 'mh-hi' }, hi + ' 👋'),
      h('div', { class: 'mh-sub' }, '今天也要开心听歌')),
    searchI,
    h('div', { class: 'mh-cards' }, cardLocal, cardFav),
    emptyBox,
    h('div', { class: 'mh-sections' }, plSec, rcSec, fvSec))

  function makeSection(title, body) {
    const count = h('span', { class: 'mh-section-count' }, '')
    const node = h('div', { class: 'mh-section' },
      h('div', { class: 'mh-section-head' },
        h('span', {}, h('span', { class: 'mh-section-title' }, title), count),
        h('span', { class: 'mh-section-arrow' }, '▼')),
      body)
    node.querySelector('.mh-section-head').addEventListener('click', () => node.classList.toggle('collapsed'))
    node._count = count
    return node
  }

  // 歌单横卡：点击整单直接播放
  function playlistChip(pl, items) {
    const chip = h('div', { class: 'mh-play' },
      h('div', { class: 'mh-play-cover' }, '📃'),
      h('div', { class: 'mh-play-name' }, pl.name))
    chip.addEventListener('click', () => {
      const real = items.filter((x) => x && !x._missing && x.type === 'music')
      if (real.length) playList(real, real[0])
      else toast('歌单里的文件都不在了')
    })
    return chip
  }

  async function refresh() {
    const [all, favs, pls, recents] = await Promise.all([
      getAllMedia(), getFavorites(), getPlaylists(), getRecent(6)
    ])
    const songs = all.filter((m) => m.type === 'music')
    localN.textContent = songs.length
    favN.textContent = favs.length
    emptyBox.hidden = songs.length > 0

    // 歌单
    plBody.innerHTML = ''
    if (!pls.length) {
      plBody.appendChild(h('div', { class: 'mh-empty' }, '还没创建歌单 · 歌单页可把当前队列存成歌单'))
      plSec._count.textContent = ''
    } else {
      const rail = h('div', { class: 'mh-plays' })
      for (const pl of pls.slice(0, 10)) {
        const items = []
        for (const id of pl.ids || []) items.push(await getMedia(id))
        rail.appendChild(playlistChip(pl, items))
      }
      plBody.appendChild(rail)
      plSec._count.textContent = `${pls.length} 个`
    }

    // 最近播放
    rcBody.innerHTML = ''
    const rcSongs = recents.filter((m) => m.type === 'music').slice(0, 5)
    if (!rcSongs.length) rcBody.appendChild(h('div', { class: 'mh-empty' }, '还没有播放记录'))
    else rcSongs.forEach((m) => rcBody.appendChild(songRow(m, app)))

    // 收藏单曲
    fvBody.innerHTML = ''
    const fvSongs = favs.filter((m) => m.type === 'music').slice(0, 5)
    if (!fvSongs.length) fvBody.appendChild(h('div', { class: 'mh-empty' }, '点 ♥ 把喜欢的歌收进来'))
    else {
      fvSongs.forEach((m) => fvBody.appendChild(songRow(m, app)))
      if (favs.length > 5) {
        fvBody.appendChild(h('div', { class: 'mh-more', onclick: () => showPage('favorites') }, `查看全部 ${favs.length} 首 ›`))
      }
    }
  }

  // 底部导航「我的」：展开全部 section 并滚到歌单区
  function showMine() {
    if (app.page !== 'home') showPage('home')
    ;[plSec, rcSec, fvSec].forEach((s) => s.classList.remove('collapsed'))
    requestAnimationFrame(() => plSec.scrollIntoView({ behavior: 'smooth' }))
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
  return { el, show: refresh, refresh, showMine }
}

// ---------- 🎵 全屏播放页（大歌词居中 + 进度条 + 控制按钮） ----------
const MODE_ORDER = ['loop', 'order', 'random', 'one']
function modeIcon(m) {
  return m === 'random' ? '🔀' : m === 'one' ? '🔂' : m === 'order' ? '▶' : '🔁'
}
function openMusicFullpage() {
  if (document.getElementById('music-fullpage')) return
  let item = player.current

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
      titleEl,
      h('button', { class: 'pfp-list', 'aria-label': '播放列表', onclick: () => app.openQueue() }, '≡')),
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
    console.error('[pfp] time=' + time.toFixed(2) + ' idx=' + idx + ' lyrics=' + lyrics.length + ' first=' + lyrics[0]?.time + ' line0class=' + linesWrap.children[0]?.className)
    const lines = linesWrap.querySelectorAll('.pfp-line')
    lines.forEach((l, i) => l.classList.toggle('active', i === idx))
    lines[idx]?.scrollIntoView({ block: 'center' })
  })
  const offTrack = player.on('trackchanged', (it) => {
    item = it
    lastIdx = -2
    titleEl.textContent = it.title || it.name || '未在播放'
    artistEl.textContent = it.artist || it.album || ''
    favBtn.textContent = it.favorite ? '❤️' : '🤍'
    lyrics = it.lyric ? parseLRC(it.lyric) : []
    lyricsEl.innerHTML = ''
    if (lyrics.length) { lyricsEl.appendChild(linesWrap); renderLines() }
    else lyricsEl.appendChild(h('div', { class: 'pfp-empty' }, '暂无歌词 · 可在音乐页点「搜歌词」在线匹配'))
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
// 各窗默认落点：Hub 主控台(首页)、Music 发现页(首页)、Video 视频
showPage(isHub ? 'home' : (ROLE === 'music' ? 'home' : ROLE))

// 底栏 + 队列 + 手势
initBottomBar(app)
const queue = buildQueue(app)
initGestures(app)

// 🔶 Android MediaStore 自动导入回调（Native 扫描完回喂 JS）
// 🔶 Android MediaStore 自动导入——分批累积再一次性落库
let __mediaBatchBuf = []
window.__mediaBatch = async (items, status) => {
  console.error('[gr] __mediaBatch called items=' + (items?.length || 0) + ' status=' + status + ' __mediaBatchBuf.length=' + __mediaBatchBuf.length)
  if (items?.length) __mediaBatchBuf.push(...items)
  if (status === 'ok') {
    const all = __mediaBatchBuf
    __mediaBatchBuf = []
    console.error('[gr] __mediaBatch final buf.length=' + all.length)
    // 🔶 ISS-20261009-007：首次扫描成功后写标记，后续启动不再自动扫
    localStorage.setItem('__grFirstScanDone', '1')
    if (!all.length) { toast('扫描完成但没发现视频', 'info'); return }
    toast(`自动扫描到 ${all.length} 个视频/音频，导入中...`, 'ok')
    const added = await addMediaFromAndroid(all)
    console.error('[gr] addMediaFromAndroid added.length=' + added.length)
    toast(`导入完成：新增 ${added.length} 个`, 'ok')
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
document.getElementById('menu-toggle').addEventListener('click', () => sidebar.classList.toggle('open'))

// ---------- 主题 + 续播恢复 ----------
getSettings().then(async (s) => {
  // 音乐窗口固定浅色（白底 + 品牌绿点缀）；其余尊重用户设置
  document.documentElement.setAttribute('data-theme', ROLE === 'music' ? 'light' : (s.theme || 'dark'))
  app.mode = s.lastMode || 'music'
  // 恢复音乐/视频各自的播放模式（旧版只存单一 playMode 时按此迁移）
  player.setPlayModes(s.playModes || { music: s.playMode || 'loop', video: 'order' })
  // 仅 Hub 的续播恢复：数据里若有上次播放的曲目，只在播放器中预载（autoplay:false），
  // 不自动跳离「首页」落地页；外部打开（双击文件）由 __hostOpen 守卫接管。
  if (isHub) {
    if (s.resumeEnabled && s.lastPlayedId && !window.__hostOpened) {
      const item = await getMedia(s.lastPlayedId)
      if (item && pages[item.type]) {
        player.setQueue([item], item.id)
        player.playItem(item, { autoplay: false })
      }
    }
  }
  // 首次启动引导（仅 Hub 一次）
  if (s.firstRun && isHub) openWelcome()
})
// 记住最后播放的曲目
player.on('trackchanged', (item) => { if (item) saveSettings({ lastPlayedId: item.id }) })
// 播放模式变更后持久化（音乐/视频各自独立保存）
player.on('playmode', () => saveSettings({ playModes: player.playModes }))

// ---------- 导入进度浮层（大量文件时给出反馈，避免误以为卡死） ----------
const importOverlay = (() => {
  const bar = h('div', { class: 'import-bar-fill' })
  const label = h('div', { class: 'import-label' }, '准备导入…')
  const count = h('div', { class: 'import-count' }, '')
  const el = h('div', { class: 'import-overlay', hidden: true },
    h('div', { class: 'import-card' },
      h('div', { class: 'import-title' }, '📥 正在导入媒体'),
      label, count,
      h('div', { class: 'import-bar' }, bar)))
  document.body.appendChild(el)
  let hideTimer = null
  return {
    progress(done, total, msg) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
      el.hidden = false
      const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100
      bar.style.width = pct + '%'
      label.textContent = msg || '正在导入…'
      count.textContent = `${done} / ${total}`
    },
    done(msg) {
      bar.style.width = '100%'
      label.textContent = msg || '导入完成'
      count.textContent = '✓ 完成'
      hideTimer = setTimeout(() => { el.hidden = true }, 1300)
    },
    hide() { el.hidden = true; if (hideTimer) clearTimeout(hideTimer) }
  }
})()

// ---------- 导入 ----------
function makeFileInput() {
  const input = document.createElement('input')
  input.type = 'file'
  input.style.display = 'none'
  document.body.appendChild(input)
  input.addEventListener('change', () => { setTimeout(() => input.remove(), 0) }, { once: true })
  return input
}
function importFilesDialog() {
  const input = makeFileInput()
  input.multiple = true
  // 🔶 ISS-20261009-012：按 role 过滤 MIME type → SAF 只显示对应分类 tab
  // player role 只要视频 tab，music role 只要音频 tab，hub 全量
  input.accept = ROLE === 'video' ? 'video/*' : ROLE === 'music' ? 'audio/*' : 'audio/*,video/*'
  input.onchange = () => doImport([...input.files], '手动添加')
  input.click()
}
function importFolderDialog() {
  const input = makeFileInput()
  input.multiple = true
  input.webkitdirectory = true
  input.onchange = () => {
    const files = [...input.files]
    const folder = files[0]?.webkitRelativePath?.split('/')[0] || '文件夹'
    doImport(files, folder)
  }
  input.click()
}
async function doImport(files, folder) {
  const added = await importFiles(files, folder, importOverlay.progress)
  if (added.length) {
    importOverlay.done(`已导入 ${added.length} 个文件`)
    // 跳到导入内容对应的页面（音乐→音乐页 / 视频→视频页）
    showPage(added[0].type)
  } else { importOverlay.hide(); toast('没有可导入的音频/视频文件', 'err') }
}
async function importFiles(files, folder = '导入', onProgress) {
  // ① 离线自动歌词：扫描选中的文件，建立「去扩展名基名 -> .lrc 文件」映射
  const lrcByName = {}
  for (const f of files) {
    if (/\.lrc$/i.test(f.name)) {
      const base = f.name.replace(/\.[^.]+$/, '')
      lrcByName[base] = f
    }
  }
  onProgress?.(0, files.length, '准备导入')
  const added = await addMediaFiles(files, folder, onProgress)
  // 元数据解析阶段：进度条继续推进，让用户知道仍在处理（大量文件时此处最易卡顿）
  const total = files.length + added.length
  let done = files.length
  for (const it of added) {
    if (it.type === 'music') {
      const base = it.name.replace(/\.[^.]+$/, '')
      // 同名 .lrc 优先写入（不依赖元数据解析，避免 CDN 卡顿时歌词也丢失）
      const lrcFile = lrcByName[base]
      let lyric = ''
      if (lrcFile) { try { lyric = (await lrcFile.text()).trim() } catch (e) {} }
      if (lyric) { const upd = await updateMedia(it.id, { lyric }); if (upd) Object.assign(it, upd) }
      // 解析元数据（本地零依赖 ID3 解析，完全离线）；无标签时从文件名推断
      const tags = await parseTags(it.blob)
      const guessed = guessFromFilename(it.name)
      const patch = {}
      patch.title = (tags && tags.title) ? tags.title : (guessed.title || it.name)
      if (tags && tags.artist) patch.artist = tags.artist
      else if (guessed.artist) patch.artist = guessed.artist
      if (tags && tags.album) patch.album = tags.album
      if (tags && tags.cover) patch.cover = tags.cover
      if (tags && tags.lyrics && !lyric) patch.lyric = tags.lyrics   // 内嵌 USLT：无同名 lrc 时才用
      if (Object.keys(patch).length) { const upd = await updateMedia(it.id, patch); if (upd) Object.assign(it, upd) }
    }
    done++; onProgress?.(done, total, '解析封面与歌词')
  }
  if (added.length) await addImportRecord({ folder, count: added.length })
  app.refreshCurrent()
  return added
}
// §12 文件已丢失 →「重新定位」：让用户重新选择一个文件替换丢失的 blob
function relocateMedia(id) {
  const input = makeFileInput()
  // 🔶 ISS-20261009-012：同 importFilesDialog，按 role 过滤
  input.accept = ROLE === 'video' ? 'video/*' : ROLE === 'music' ? 'audio/*' : 'audio/*,video/*'
  input.onchange = async () => {
    const file = input.files[0]
    if (!file) return
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi|m4v|ogv|ts|flv|wmv)$/i.test(file.name)
    const type = isVideo ? 'video' : 'music'
    const patch = { blob: file, size: file.size, name: file.name, type, mime: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg') }
    if (type === 'music') {
      const tags = await parseTags(file)
      const guessed = guessFromFilename(file.name)
      patch.title = (tags && tags.title) ? tags.title : (guessed.title || file.name)
      if (tags && tags.artist) patch.artist = tags.artist
      else if (guessed.artist) patch.artist = guessed.artist
      if (tags && tags.album) patch.album = tags.album
      if (tags && tags.cover) patch.cover = tags.cover
    }
    await updateMedia(id, patch)
    toast('已重新定位文件，可正常播放')
    app.refreshCurrent()
  }
  input.click()
}

// ---------- 播放 ----------
function playItem(item) {
  app.mode = item.type
  showPage(item.type)
  const ctx = (app.currentList || []).filter((i) => i.type === item.type)
  const queueList = ctx.length ? ctx : [item]
  player.setQueue(queueList, item.id)
  player.playItem(item, { crossfade: player.isPlaying() })
}
function playList(items, first) {
  app.mode = first.type
  showPage(first.type)
  player.setQueue(items, first.id)
  player.playItem(first, { crossfade: false })
}

// ---------- 睡眠定时 ----------
function openSleepModal() {
  const body = h('div', { class: 'mb' })
  const opts = [['关闭', 0], ['10 分钟', 10], ['20 分钟', 20], ['30 分钟', 30], ['45 分钟', 45], ['60 分钟', 60], ['90 分钟', 90], ['播完当前曲停止', 'track']]
  opts.forEach(([label, val]) => body.appendChild(h('button', {
    class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' },
    onclick: () => { player.setSleep(val); toast(val === 'track' ? '将播完当前曲后停止' : val ? `${val} 分钟后停止` : '已关闭睡眠定时'); close() }
  }, label)))
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, '睡眠定时'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
  const close = openModal(modal)
}

// ---------- 首次启动引导 ----------
function openWelcome() {
  const body = h('div', { class: 'mb' },
    h('p', { style: { color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.6 } },
      '这是一个完全离线的媒体播放器：你的音乐与视频都保存在本机，断网也能播放，数据不外传。'),
    h('ul', { class: 'wl', style: { margin: '0 0 16px', paddingLeft: '18px', color: 'var(--text-2)', lineHeight: 1.8 } },
      h('li', {}, '📥 从本机导入单个文件，或整个文件夹'),
      h('li', {}, '🎚 音乐支持 EQ 均衡与实时频谱'),
      h('li', {}, '🎬 视频支持字幕、多音轨、章节跳转'),
      h('li', {}, '📲 可「安装」到桌面/主屏，像原生 App 一样离线使用')),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { class: 'cta', onclick: () => { close(); app.importFilesDialog() } }, '导入媒体'),
      h('button', { class: 'ghost-btn', onclick: () => { close(); openHelp() } }, '使用说明')))
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, '欢迎使用绿角犀播放器'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
  const close = openModal(modal, { onClose: () => saveSettings({ firstRun: false }) })
}

// ---------- 导航 / 顶栏 ----------
// 音乐/视频切换：Hub 点导航弹独立窗口；弹窗内只有本类型的单向入口（仅 Hub 显示 music/video 项）。
document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item')
  if (!btn) return
  if (btn.dataset.action === 'help') { openHelp(); sidebar.classList.remove('open'); return }
  const v = btn.dataset.view
  if (v === 'settings') openSettings(app)
  else if (isHub && (v === 'music' || v === 'video')) openRoleWindow(v)
  else showPage(v)
  sidebar.classList.remove('open')
})

// 🎵 音乐 App 底部三栏导航：发现（首页）/ 中间大按钮（全屏播放页）/ 我的
const musicNav = document.getElementById('music-nav')
musicNav?.addEventListener('click', (e) => {
  const b = e.target.closest('.mn-item')
  if (!b) return
  const k = b.dataset.mn
  if (k === 'discover') showPage('home')
  else if (k === 'nowplaying') openMusicFullpage()
  else if (k === 'mine') home?.showMine?.()
  musicNav.querySelectorAll('.mn-item').forEach((x) => x.classList.toggle('active', x === b && k !== 'nowplaying'))
})
document.getElementById('search').addEventListener('input', (e) => {
  app.search = e.target.value.trim()
  music?.refresh()
  video?.refresh()
})
document.getElementById('import-files').addEventListener('click', importFilesDialog)
document.getElementById('import-folder').addEventListener('click', importFolderDialog)
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

// ---------- Media Session（锁屏/通知控制） ----------
if ('mediaSession' in navigator) {
  player.on('trackchanged', (item) => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || item.name,
      artist: item.artist || '',
      album: item.album || '',
      artwork: item.cover ? [{ src: item.cover }] : []
    })
  })
  navigator.mediaSession.setActionHandler('play', () => player.play())
  navigator.mediaSession.setActionHandler('pause', () => player.pause())
  navigator.mediaSession.setActionHandler('previoustrack', () => player.prev())
  navigator.mediaSession.setActionHandler('nexttrack', () => player.next(true))
  player.on('play', () => { navigator.mediaSession.playbackState = 'playing' })
  player.on('pause', () => { navigator.mediaSession.playbackState = 'paused' })
}

// ---------- 异常态：解码失败 / 文件丢失（设计文档 §12） ----------
// 解码失败与文件丢失共用一套「队列内自动跳过」保护，避免 error/lost 重复触发导致多次 next 或死循环
let _skipGuard = false
let _skipStreak = 0
player.on('loaded', () => { _skipStreak = 0; _skipGuard = false }) // 成功加载则重置连续失败计数
function trySkipInQueue(badItem, label) {
  if (_skipGuard) return
  // 以出错的曲目定位索引（error/lost 可能早于 playItem 写入 current，故优先用事件携带的 item）
  const bad = badItem || player.current
  if (bad) { const i = player.queue.findIndex(q => q && q.id === bad.id); if (i >= 0) player.index = i }
  if (player.queue.length > 1 && player.playMode !== 'one') {
    _skipStreak++
    if (_skipStreak > player.queue.length) { toast(`连续多曲无法播放（${label}），已停止`, 'err'); player.pause(); _skipGuard = false; _skipStreak = 0; return }
    _skipGuard = true
    setTimeout(() => { player.next(true); _skipGuard = false }, 1000)
  }
}
// 🔶 ISS-20261009-004：player role 下 video error/lost 由 videoPlayer.js 全权处理（删库+toast）
// 避免 3 个 handler 叠 toast 污染画面
player.on('error', (msg, item) => {
  if (item?.type === 'video' && window.__winRole === 'video') { trySkipInQueue(item, '格式不支持'); return }
  toast(msg || '该格式暂不支持播放', 'err')
  trySkipInQueue(item, '格式不支持')
})
player.on('lost', (item) => {
  if (item?.type === 'video' && window.__winRole === 'video') return
  toast(`「${item?.title || item?.name || '该文件'}」文件已丢失`, 'err')
  app.refreshCurrent() // 让媒体库标灰显示
  trySkipInQueue(item, '文件已丢失')
})

// ---------- 进度落盘 ----------
window.addEventListener('beforeunload', () => player.flushProgress())
document.addEventListener('visibilitychange', () => { if (document.hidden) player.flushProgress() })

// 暴露调试入口
window.__player = player

// 注册 Service Worker（http/https 下启用，实现离线缓存与可安装）
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// ---------- PWA 安装入口（设计文档：可安装离线应用） ----------
const installBtn = document.getElementById('install-btn')
let deferredPrompt = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // 阻止浏览器默认迷你条，改用我们自己的按钮
  deferredPrompt = e
  if (installBtn) installBtn.hidden = false
})
window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.hidden = true
  deferredPrompt = null
  toast('绿角犀播放器已安装，感谢使用 🎉')
})
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt || typeof deferredPrompt.prompt !== 'function') {
    toast('浏览器未提供安装入口，可在菜单选择「安装绿角犀播放器 / 添加到主屏幕」', 'info')
    return
  }
  deferredPrompt.prompt()
  try {
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') toast('已开始安装，感谢使用绿角犀播放器')
  } catch {}
  deferredPrompt = null
  installBtn.hidden = true
})

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



