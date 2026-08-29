// store.js — IndexedDB 持久化 + 状态管理（事件总线）
// 媒体文件以 Blob 形式存入 IndexedDB，实现真正离线、重启可续播。

const DB_NAME = 'offline-player'
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
export async function addMediaFiles(files, folder = '未分类') {
  const items = []
  for (const file of files) {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mkv|webm|mov|avi|m4v|ogv)$/i.test(file.name)
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac|opus|wma)$/i.test(file.name)
    if (!isVideo && !isAudio) continue
    const type = isVideo ? 'video' : 'music'
    const id = hashId(file.name + file.size + (file.lastModified || 0) + type)
    const exists = await dbGet('media', id)
    if (exists) continue
    const item = {
      id, name: file.name, type, mime: file.type || (type === 'video' ? 'video/mp4' : 'audio/mpeg'),
      size: file.size, addedAt: Date.now(), folder, artist: '', album: '', title: '', duration: 0,
      blob: file, favorite: false
    }
    await dbPut('media', item, id)
    items.push(item)
  }
  if (items.length) emit('library:changed', items)
  return items
}

export async function getAllMedia() {
  const all = await dbGetAll('media')
  return all.sort((a, b) => b.addedAt - a.addedAt)
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
  playMode: 'loop',      // order | loop | random | one
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
