// lyricFetch.js — 在线搜歌词（LRCLIB 多源 + 自动缓存回 IndexedDB）
// 两个入口：fetchOnlineLyric（完整流程，存库）、fetchLrclib（纯 API 查询）
import { updateMedia } from './store.js'
import { parseLRC } from './lrc.js'

// ② 在线自动歌词：三级优先级（从上往下命中就停）
//    1. window.RhinoBridge.getLyric()  — Android 原生桥，双源聚合 LRCLIB+歌词迷，绕开 WebView 跨域
//    2. /api/lyric  — Windows LocalServer 同源代理
//    3. 直连 LRCLIB  — 纯 PWA 兜底（跨域友好的公共库）
// 命中后返回 LRC 文本 + 缓存回 IndexedDB。query 可指定自定义歌名/歌手。
export async function fetchOnlineLyric(item, query) {
  if (!item || item.type === 'video') return null
  const title = (query?.title ?? item.title ?? item.name ?? '').trim()
  const artist = (query?.artist ?? item.artist ?? '').trim()
  const album = (query?.album ?? item.album ?? '').trim()
  if (!title || !navigator.onLine) return null
  let lrc = ''

  // ① Android 原生桥（RhinoBridge）— 最快，Java 端 LRCLIB+歌词迷双源
  try {
    if (window.RhinoBridge && typeof window.RhinoBridge.getLyric === 'function') {
      lrc = window.RhinoBridge.getLyric(title, artist) || ''
      if (lrc) console.log('[lyricFetch] ✅ RhinoBridge hit:', title)
    }
  } catch (e) { /* 桥不可用：忽略，走下一级 */ }

  // ② Windows LocalServer /api/lyric 同源代理
  if (!lrc) {
    try {
      const u = new URLSearchParams({ title, artist })
      const res = await fetch(`/api/lyric?${u.toString()}`)
      if (res.ok) {
        const j = await res.json().catch(() => null)
        if (j && j.lyric && j.lyric.trim()) { lrc = j.lyric.trim(); console.log('[lyricFetch] ✅ /api/lyric hit') }
      }
    } catch (e) { /* 本地服务不存在：忽略 */ }
  }

  // ③ 直连 LRCLIB 兜底
  if (!lrc) {
    try { lrc = await fetchLrclib(title, artist, album) } catch (e) {}
    if (lrc) console.log('[lyricFetch] ✅ LRCLIB direct hit')
  }

  if (!lrc) return null
  const parsed = parseLRC(lrc)
  if (!parsed.length) return null
  try { await updateMedia(item.id, { lyric: lrc }) } catch (e) {}
  return parsed
}

// LRCLIB（国际公共歌词库，免费无 Key）直连，供纯 PWA 模式兜底
export async function fetchLrclib(title, artist, album) {
  const q = new URLSearchParams()
  q.set('track_name', title)
  if (artist) q.set('artist_name', artist)
  if (album) q.set('album_name', album)
  const res = await fetch(`https://lrclib.net/api/search?${q.toString()}`, {
    headers: { 'X-User-Agent': 'GreenRhino/1.0 (offline media player)' }
  })
  if (!res.ok) return ''
  const arr = await res.json()
  if (!Array.isArray(arr) || !arr.length) return ''
  const pick = (a) => (a && (a.syncedLyrics || a.plainLyrics)) ? (a.syncedLyrics || a.plainLyrics) : ''
  let lrc = pick(arr[0])
  if (artist) {
    const exact = arr.find((a) => a.artistName && a.artistName.toLowerCase().includes(artist.toLowerCase()) && (a.syncedLyrics || a.plainLyrics))
    if (exact) lrc = pick(exact)
  }
  return (lrc || '').trim()
}
