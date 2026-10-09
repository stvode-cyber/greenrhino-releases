// store.js — IndexedDB 持久化 + 状态管理（事件总线）
// 媒体文件以 Blob 形式存入 IndexedDB，实现真正离线、重启可续播。

// 数据库按窗口角色隔离：拆分后 音乐/视频播放器 是独立 App，数据互不可见。
// 窗口角色由 index.html 注入的内联 script 设置（早于本模块执行），未注入时按 hub（合一）兜底。
const GR_ROLE = (typeof window !== 'undefined' && window.__winRole) || 'hub'
const DB_NAME = GR_ROLE === 'music' ? 'gr-music-v1' : GR_ROLE === 'video' ? 'gr-player-v1' : 'offline-player'
const DB_VERSION = 2
const STORES = ['media', 'progress', 'settings', 'queue', 'playlists', 'favorites', 'imports', 'thumbnails']

let _db = null

function openDB() {
  if (_db) return _db
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _db
}

async function tx(store, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const os = t.objectStore(store)
    let result
    Promise.resolve(fn(os)).then((r) => { result = r }).catch(reject)
    t.oncomplete = () => resolve(result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

// IDBRequest → Promise<request.result>
const rp = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

export const dbGet = (store, key) => tx(store, 'readonly', (os) => rp(os.get(key)))
export const dbGetAll = (store) => tx(store, 'readonly', (os) => rp(os.getAll()))
export const dbPut = (store, value, key) =>
  tx(store, 'readwrite', (os) => rp(key !== undefined ? os.put(value, key) : os.put(value)))
export const dbDelete = (store, key) => tx(store, 'readwrite', (os) => rp(os.delete(key)))
export const dbClear = (store) => tx(store, 'readwrite', (os) => rp(os.clear()))

// ---------- 工具 ----------
export function hashId(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function uid() {
  return (crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2))
}

// ---------- 事件总线 ----------
const listeners = new Map()
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set())
  listeners.get(evt).add(fn)
  return () => listeners.get(evt)?.delete(fn)
}
export function emit(evt, payload) {
  listeners.get(evt)?.forEach((fn) => {
    try { fn(payload) } catch (e) { console.error('listener error', evt, e) }
  })
}

// ---------- 媒体库 ----------
// 判定文件是否为可导入的音频/视频（须与 clients/windows/GreenRhino/MainWindow.xaml.cs 的 MediaExts 保持一致）
export function isMediaFile(file) {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi|m4v|ogv|ts|flv|wmv)$/i.test(file.name)
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|aac|ogg|oga|opus|wma|mp2|mp1|aiff|mka|ape)$/i.test(file.name)
  return isVideo || isAudio
}

export async function addMediaFiles(files, folder = '未分类', onProgress) {
  const items = []
  const total = files.length
  let done = 0
  for (const file of files) {
    // 注意：必须与 clients/windows/GreenRhino/MainWindow.xaml.cs 的 MediaExts 保持一致，
    // 否则 C# 接受双击、web 端却 continue 丢弃，表现为「双击没反应/放不了」。
    // ape 等浏览器原生不支持解码的格式也纳入导入，播放时由 player.js 的 canPlayType 预检给出明确提示。
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi|m4v|ogv|ts|flv|wmv)$/i.test(file.name)
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|flac|wav|m4a|aac|ogg|oga|opus|wma|mp2|mp1|aiff|mka|ape)$/i.test(file.name)
    if (!isVideo && !isAudio) { done++; onProgress?.(done, total, '正在导入'); continue }
    const type = isVideo ? 'video' : 'music'
    const id = hashId(file.name + file.size + (file.lastModified || 0) + type)
    const exists = await dbGet('media', id)
    if (exists) { done++; onProgress?.(done, total, '正在导入'); continue }
    const item = {
      id, name: file.name, type, mime: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
      size: file.size, addedAt: Date.now(), folder, artist: '', album: '', title: '', duration: 0,
      blob: file, favorite: false, playCount: 0, lastPlayedAt: 0
    }
    await dbPut('media', item, id)
    items.push(item)
    done++; onProgress?.(done, total, '正在导入')
  }
  if (items.length) emit('library:changed', items)
  return items
}

// 🔶 Android MediaStore 自动导入（JSON 数组，有 uri 字段）
// 不同于 addMediaFiles 接收 File blob，这里存 content:// URI
export async function addMediaFromAndroid(jsonItems, folder = '全盘扫描') {
  if (!Array.isArray(jsonItems) || !jsonItems.length) return []
  // 🔶 双层保险：只收视频（player role 不需要音乐）+ 800MB 以上（小视频用户手动导入）
  const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi|m4v|ogv|ts|flv|wmv|3gp|rmvb)$/i
  const MIN_SIZE = 800 * 1024 * 1024  // 800MB
  const items = []
  let skippedSmall = 0
  let skippedDup = 0
  // 🔶 ISS-20261009-010：先拉全库 name+size 建 Set → 跨来源去重
  // （addMediaFiles 用 file.name+size+lastModified+type 做 hashId，
  //   addMediaFromAndroid 用 'android:'+j.id+j.uri 做 hashId → 两个不同 ID 同一文件会重复存）
  const existing = await dbGetAll('media')
  const existingKeys = new Set(existing.map(e => `${e.name}::${e.size || 0}`))
  for (const j of jsonItems) {
    if (!j || !j.name) continue
    if (!VIDEO_EXT.test(j.name)) continue
    // 🔶 ISS-20261009-002：前端兜底再过滤 800MB（Kotlin 原生层已过滤，这层是双保险）
    if (j.size && j.size < MIN_SIZE) { skippedSmall++; continue }
    // 🔶 ISS-20261009-010：跨来源去重——库里已有同名同体积的（不管来源），跳过
    const dupKey = `${j.name}::${j.size || 0}`
    if (existingKeys.has(dupKey)) { skippedDup++; continue }
    existingKeys.add(dupKey)  // 本轮内也要去重（MediaStore 可能一次扫出两条同名的）
    const id = hashId('android:' + j.id + ':' + j.uri)
    // 幂等覆盖：同来源同文件再扫一次 → hashId 相同 → dbPut 覆盖更新（不重复）
    const item = {
      id, name: j.name, type: 'video', mime: 'video/mp4',
      size: j.size || 0, addedAt: Date.now(), folder, artist: '', album: '',
      title: j.name.replace(/\.[^.]+$/, ''), duration: j.duration || 0,
      uri: j.uri,
      favorite: false, playCount: 0, lastPlayedAt: 0,
      source: 'android_mediastore'
    }
    await dbPut('media', item, id)
    items.push(item)
  }
  console.error('[gr] addMediaFromAndroid: kept=' + items.length + ' skippedSmall=' + skippedSmall + ' skippedDup=' + skippedDup + ' (MIN_SIZE=800MB)')
  if (items.length) emit('library:changed', items)
  return items
}

export async function getAllMedia() {
  const all = await dbGetAll('media')
  return all.sort((a, b) => b.addedAt - a.addedAt)
}
// 媒体库重复检测：优先按 标题+歌手+专辑 元数据匹配，缺失时退回 文件名+大小。
// 返回分组数组，每组内已按 addedAt 降序排好（[0] 为建议保留的最先后入项）。
export async function findDuplicates() {
  const all = await getAllMedia()
  const keyOf = (m) => {
    const meta = (m.title && m.artist) ? `${m.title} ${m.artist} ${m.album || ''}`.trim() : null
    return meta || `${m.name} ${m.size || 0}`
  }
  const map = new Map()
  for (const m of all) {
    const k = keyOf(m)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(m)
  }
  const groups = []
  for (const items of map.values()) {
    if (items.length > 1) {
      items.sort((a, b) => b.addedAt - a.addedAt)
      groups.push(items)
    }
  }
  return groups
}
export const getMedia = (id) => dbGet('media', id)
export async function deleteMedia(id) {
  await dbDelete('media', id)
  await dbDelete('progress', id)
  emit('library:changed', [])
}
export async function updateMedia(id, patch) {
  const cur = await dbGet('media', id)
  if (!cur) return
  const next = { ...cur, ...patch }
  await dbPut('media', next, id)
  emit('media:updated', next)
  return next
}
export async function toggleFavorite(id) {
  const cur = await dbGet('media', id)
  if (!cur) return
  const fav = !cur.favorite
  await updateMedia(id, { favorite: fav })
  await dbPut('favorites', id, id) // 仅作去重集合
  if (!fav) await dbDelete('favorites', id)
  emit('favorites:changed')
  return fav
}
export async function getFavorites() {
  const ids = await dbGetAll('favorites')
  const out = []
  for (const id of ids) { const m = await dbGet('media', id); if (m) out.push(m) }
  return out
}

// ---------- 导入记录 ----------
export async function addImportRecord(rec) {
  const id = uid()
  await dbPut('imports', { id, ...rec, at: Date.now() }, id)
  emit('imports:changed')
}
export const getImportRecords = () => dbGetAll('imports')

// ---------- 播放进度（续播） ----------
export async function saveProgress(id, time, duration) {
  if (!id) return
  await dbPut('progress', { id, time: Math.floor(time), duration: Math.floor(duration), updatedAt: Date.now() }, id)
}
export const getProgress = (id) => dbGet('progress', id)

// ---------- 播放统计（播放次数 / 最近播放时间，供智能歌单与统计页） ----------
export async function recordPlayback(id) {
  const cur = await dbGet('media', id)
  if (!cur) return
  const next = { ...cur, playCount: (cur.playCount || 0) + 1, lastPlayedAt: Date.now() }
  await dbPut('media', next, id)
  emit('stats:changed', next)
  return next
}

// ---------- 最近播放（复用续播进度表，按更新时间排序） ----------
export async function getRecent(limit = 60) {
  const progs = await dbGetAll('progress')
  progs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const out = []
  for (const p of progs) {
    const m = await getMedia(p.id)
    if (m) out.push({ ...m, progress: p })
    if (out.length >= limit) break
  }
  return out
}

// ---------- 视频轨偏好（字幕/音轨记忆） ----------
export async function saveTrackPref(mediaId, kind, val) {
  const s = await getSettings()
  const tp = { ...(s.trackPrefs || {}) }
  tp[mediaId] = { ...(tp[mediaId] || {}), [kind]: val }
  return saveSettings({ trackPrefs: tp })
}

// ---------- 播放队列 ----------
export async function getQueue() {
  return (await dbGet('queue', 'main')) || { order: [], currentId: null, mode: 'music' }
}
export async function saveQueue(q) { await dbPut('queue', q, 'main'); emit('queue:changed', q) }

// ---------- 歌单 ----------
export async function getPlaylists() { return (await dbGetAll('playlists')) || [] }
export async function savePlaylist(p) {
  await dbPut('playlists', p, p.id)
  emit('playlists:changed')
}
export async function deletePlaylist(id) { await dbDelete('playlists', id); emit('playlists:changed') }

// ---------- 设置 ----------
const DEFAULT_SETTINGS = {
  theme: 'dark',
  defaultVolume: 0.8,
  resumeEnabled: true,
  crossfade: 0,          // 0 = 关闭
  playModes: { music: 'loop', video: 'order' }, // 音乐/视频各自独立的播放模式
  eqPreset: 'flat',
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 10 段
  sleepTimer: 0,
  lastMode: 'music',
  firstRun: true         // 首次启动引导标记
}
let _settingsCache = null
export async function getSettings() {
  if (!_settingsCache) {
    const s = await dbGet('settings', 'main')
    _settingsCache = { ...DEFAULT_SETTINGS, ...(s || {}) }
  }
  return { ..._settingsCache }
}
export async function saveSettings(patch) {
  if (!_settingsCache) await getSettings()
  _settingsCache = { ..._settingsCache, ...patch } // 同步合并，避免并发读-改-写竞态
  const next = { ..._settingsCache }
  await dbPut('settings', next, 'main')
  emit('settings:changed', next)
  return next
}

// ---------- 多端同步（零成本手动同步：导出/导入 JSON）----------
// 范围：仅进度 + 歌单 + 收藏 + 偏好；不同步媒体文件本身（媒体以 Blob 存本地，体积大、且含隐私）。
// 收藏按 id 集合同步：同一文件在另一设备导入（同名+同体积+同修改时间 → 同 hash id）后自动点亮收藏。
export async function exportSyncData() {
  const progress = await dbGetAll('progress')
  const playlists = await dbGetAll('playlists')
  const favorites = await dbGetAll('favorites')
  const s = await getSettings()
  const settings = {
    theme: s.theme, defaultVolume: s.defaultVolume, resumeEnabled: s.resumeEnabled,
    crossfade: s.crossfade, playModes: s.playModes, eqPreset: s.eqPreset, eqBands: s.eqBands,
    lastMode: s.lastMode
  }
  return {
    app: 'GreenRhino', schema: 1, exportedAt: Date.now(),
    device: (s.deviceName || '未知设备'),
    progress, playlists, favorites, settings
  }
}

export async function importSyncData(json) {
  if (!json || json.app !== 'GreenRhino' || json.schema !== 1)
    throw new Error('不是有效的绿角犀同步文件')
  let count = 0
  // 进度：按 updatedAt 取较新者，避免旧进度覆盖新进度
  if (Array.isArray(json.progress) && json.progress.length) {
    const local = {}
    for (const p of (await dbGetAll('progress'))) local[p.id] = p
    for (const p of json.progress) {
      const cur = local[p.id]
      if (!cur || (p.updatedAt || 0) >= (cur.updatedAt || 0)) await dbPut('progress', p, p.id)
    }
    count += json.progress.length
  }
  // 歌单：按 id 覆盖（含名称与条目）
  if (Array.isArray(json.playlists) && json.playlists.length) {
    for (const p of json.playlists) await dbPut('playlists', p, p.id)
    count += json.playlists.length
  }
  // 收藏：合并 id 集合（另一设备导入相同文件后自动生效）
  if (Array.isArray(json.favorites) && json.favorites.length) {
    for (const id of json.favorites) await dbPut('favorites', id, id)
    count += json.favorites.length
  }
  // 偏好：合并同步相关键（设备专属状态不覆盖）
  if (json.settings && typeof json.settings === 'object') await saveSettings(json.settings)
  emit('library:changed', [])
  emit('playlists:changed')
  emit('favorites:changed')
  return count
}
