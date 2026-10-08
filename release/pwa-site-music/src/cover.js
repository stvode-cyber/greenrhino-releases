// cover.js — 在线封面抓取：无封面的音乐用 iTunes Search 匹配专辑图，下载缓存为 dataURL 永久离线可用
// iTunes 搜索结果自带合规授权可用的封面图，无需 key，且返回头带 CORS *（浏览器可直接请求）。
import { updateMedia } from './store.js'

const ITUNES = 'https://itunes.apple.com/search'
// 去重：同一曲目只请求一次，避免反复命中同一网络失败或无结果
const _busy = new Set()

// 把远程图片下载为 dataURL（缩小到最大边，控制 IndexedDB 体积）
async function _fetchToDataUrl(url, max = 300) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('cover fetch fail')
  const blob = await res.blob()
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('img load fail'))
    i.src = URL.createObjectURL(blob)
  })
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * scale))
  c.height = Math.max(1, Math.round(img.naturalHeight * scale))
  c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

// 为某曲目抓取封面；成功写入 media.cover 并返回 dataURL，失败/无结果返回 null。
// query 可覆盖搜索用歌名/歌手（默认为曲目自身标签）。
export async function ensureCover(item, query) {
  if (!item || item.type !== 'music') return null
  if (item.cover) return item.cover
  if (_busy.has(item.id)) return null
  if (!navigator.onLine) { _busy.add(item.id); return null }
  const title = (query?.title ?? item.title ?? item.name ?? '').trim()
  if (!title) return null
  _busy.add(item.id)
  try {
    const term = encodeURIComponent(title + (query?.artist || item.artist ? ' ' + (query?.artist || item.artist) : ''))
    const res = await fetch(`${ITUNES}?term=${term}&media=music&entity=song&limit=6`)
    if (!res.ok) return null
    const j = await res.json()
    const arr = Array.isArray(j.results) ? j.results : []
    if (!arr.length) return null
    const artist = (query?.artist || item.artist || '').toLowerCase()
    const pick = artist
      ? (arr.find((r) => r.artistName && r.artistName.toLowerCase().includes(artist)) || arr[0])
      : arr[0]
    const art = pick && pick.artworkUrl100
    if (!art) return null
    // iTunes 返回 100x100 缩略图地址，替换尺寸规格请求 300x300
    const dataUrl = await _fetchToDataUrl(art.replace('100x100bb', '300x300bb'))
    try { const upd = await updateMedia(item.id, { cover: dataUrl }); if (upd) item.cover = dataUrl } catch {}
    return dataUrl
  } catch {
    return null
  } finally {
    _busy.add(item.id) // 失败也记一次，避免每条都反复联网
  }
}