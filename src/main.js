// main.js — 应用装配与编排
import { h, toast, openModal } from './ui/dom.js'
import { player } from './player.js'
import {
  addMediaFiles, updateMedia, getSettings, addImportRecord, getAllMedia, getMedia, saveSettings, on as onStore, isMediaFile
} from './store.js'
import { parseTags, guessFromFilename } from './metadata.js'
import { initBottomBar } from './ui/bottombar.js'
import { buildMusic } from './ui/music.js'
import { buildVideo } from './ui/video.js'
import { buildFavorites } from './ui/favorites.js'
import { buildPlaylists } from './ui/playlists.js'
import { buildRecent } from './ui/recent.js'
import { buildCloud } from './ui/cloud.js'
import { buildQueue } from './ui/queue.js'
import { openSettings } from './ui/settings.js'
import { openHelp } from './help.js'
import { initGestures } from './ui/gestures.js'

// store.js 事件总线
const app = {
  page: 'music',
  mode: 'music',
  search: '',
  currentList: [],
  onStore,
  toast,
  refreshCurrent() { [music, video, favorites, playlists, recent].forEach((p) => p?.refresh?.()); syncCurrentList() },
  playItem, playList, importFiles, importFilesDialog, importFolderDialog, relocateMedia,
  openQueue: () => queue.open(),
  openSleep: openSleepModal,
  openEQ: () => openSettings(app, 'eq'),
  openSettings: () => openSettings(app)
}

// ---------- 构建页面 ----------
const view = document.getElementById('view')
const music = buildMusic(app)
const video = buildVideo(app)
const favorites = buildFavorites(app)
const playlists = buildPlaylists(app)
const recent = buildRecent(app)
const cloud = buildCloud(app)
const pages = { music, video, favorites, playlists, recent, cloud }
for (const p of Object.values(pages)) view.appendChild(p.el)

function showPage(name) {
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
showPage('music')

// 底栏 + 队列 + 手势
initBottomBar(app)
const queue = buildQueue(app)
initGestures(app)

// 移动端侧栏开关
const sidebar = document.getElementById('sidebar')
document.getElementById('menu-toggle').addEventListener('click', () => sidebar.classList.toggle('open'))

// ---------- 主题 + 续播恢复 ----------
getSettings().then(async (s) => {
  document.documentElement.setAttribute('data-theme', s.theme || 'dark')
  app.mode = s.lastMode || 'music'
  // 恢复音乐/视频各自的播放模式（旧版只存单一 playMode 时按此迁移）
  player.setPlayModes(s.playModes || { music: s.playMode || 'loop', video: 'order' })
  // 打开到上次停留的音乐/视频页；外部打开（双击文件）时保持 __hostOpen 切好的页面
  if (!window.__hostOpened && pages[app.mode]) showPage(app.mode)
  // 再次打开时恢复上次播放的曲目（暂停态，点击播放即续播），并切到该媒体所属页面。
  // 外部打开（双击文件）已由 __hostOpen 接管时跳过恢复，避免旧曲目顶掉用户刚双击的文件。
  if (s.resumeEnabled && s.lastPlayedId && !window.__hostOpened) {
    const item = await getMedia(s.lastPlayedId)
    if (item) {
      player.setQueue([item], item.id)
      player.playItem(item, { autoplay: false })
      app.mode = item.type
      if (pages[item.type]) showPage(item.type)
    }
  }
  // 首次启动引导
  if (s.firstRun) openWelcome()
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
  input.accept = 'audio/*,video/*'
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
  input.accept = 'audio/*,video/*'
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
  const opts = [['关闭', 0], ['15 分钟', 15], ['30 分钟', 30], ['60 分钟', 60], ['播完当前曲停止', 'track']]
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
document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item')
  if (!btn) return
  if (btn.dataset.action === 'help') { openHelp(); sidebar.classList.remove('open'); return }
  const v = btn.dataset.view
  if (v === 'settings') openSettings(app)
  else showPage(v)
  sidebar.classList.remove('open')
})
// 音乐/视频切换由左侧导航的 data-view 完成，顶栏不再保留独立模式开关
document.getElementById('search').addEventListener('input', (e) => {
  app.search = e.target.value.trim()
  music.refresh()
  video.refresh()
})
document.getElementById('import-files').addEventListener('click', importFilesDialog)
document.getElementById('import-folder').addEventListener('click', importFolderDialog)

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
player.on('error', (msg, item) => {
  toast(msg || '该格式暂不支持播放', 'err')
  trySkipInQueue(item, '格式不支持')
})
player.on('lost', (item) => {
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
