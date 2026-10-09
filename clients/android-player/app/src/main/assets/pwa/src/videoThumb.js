// videoThumb.js — 视频封面/缩略图自动生成：无封面的视频后台抽帧，缓存进 thumbnails store。
// 与音乐封面不同，视频封面从本地视频画面抽帧生成（无需联网），生成成功后网格即时刷新。
import { dbGet, dbPut, dbGetAll, emit } from './store.js'

const _queue = []
let _busy = false

// 读取全部已生成缩略图，返回 Map<mediaId, dataUrl>（供刷新时合并到卡片）
export async function getThumbsMap() {
  const all = await dbGetAll('thumbnails')
  const map = new Map()
  for (const t of all || []) if (t && t.id && t.dataUrl) map.set(t.id, t.dataUrl)
  return map
}

// 把缺缩略图的视频加入后台队列，逐条抽帧，避免一次全量抽帧卡 UI
export function queueVideoThumbs(items) {
  let added = 0, skipped = 0
  for (const it of items || []) {
    if (!it || it.type !== 'video') { skipped++; continue }
    if (it.thumb || it.thumbFailed) { skipped++; continue }
    // 🔶 ISS-20261008-006：有 uri（Android MediaStore）或有 blob（桌面导入）都能入队
    const hasSource = it.uri || (it.blob && it.blob.size > 0)
    if (hasSource && !_queue.some((q) => q.id === it.id)) { _queue.push(it); added++ }
    else skipped++
  }
  console.error('[gr-thumb] queueVideoThumbs: added=' + added + ' skipped=' + skipped + ' queue.total=' + _queue.length)
  pump()
}

async function pump() {
  if (_busy || !_queue.length) return
  _busy = true
  const it = _queue.shift()
  console.error('[gr-thumb] pump: generating for id=' + it.id + ' uri=' + !!it.uri + ' blob=' + !!it.blob)
  try { await generate(it) } catch (e) { console.error('[gr-thumb] generate error: ' + e?.message) }
  _busy = false
  if (_queue.length) pump()
}

async function generate(item) {
  console.error('[gr-thumb] generate START id=' + item.id + ' hasUri=' + !!item.uri + ' hasBlob=' + !!item.blob)
  const cached = await dbGet('thumbnails', item.id)
  if (cached && cached.failed) { item.thumbFailed = true; console.error('[gr-thumb] SKIP id=' + item.id + ' (previously failed)'); return }
  if (cached && cached.dataUrl) { item.thumb = cached.dataUrl; emit('thumb:updated', item.id); console.error('[gr-thumb] SKIP id=' + item.id + ' (cached)'); return }

  const v = document.createElement('video')
  v.preload = 'metadata'
  v.muted = true
  v.playsInline = true
  // 🔶 ISS-20261008-006：Android MediaStore 进来的视频只有 uri（content://），没有 blob
  // 直接把 uri 设给 v.src，WebView 的 shouldInterceptRequest 会拦截并返回媒体流
  let blobUrl = null
  if (item.uri) {
    v.src = item.uri
  } else if (item.blob) {
    blobUrl = URL.createObjectURL(item.blob)
    v.src = blobUrl
  } else {
    await markFailed(item); return  // 啥都没有怎么抽
  }
  try {
    // 等元数据加载后 seek 到前段，取一帧画到小画布（失败如 HEVC 无法解码则静默跳过）
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout 3s')), 3000)
      v.onloadedmetadata = () => {
        console.error('[gr-thumb] metadata OK id=' + item.id + ' w=' + v.videoWidth + ' h=' + v.videoHeight + ' dur=' + v.duration)
        const seekTo = Math.min(5, (v.duration || 5) * 0.1)
        try { v.currentTime = seekTo } catch (e) { clearTimeout(to); reject(e); return }
        v.onseeked = () => { clearTimeout(to); resolve() }
        v.onerror = () => { clearTimeout(to); reject(new Error('video error ' + (v.error?.code || 0))) }
      }
      v.onerror = () => { clearTimeout(to); reject(new Error('video error ' + (v.error?.code || 0))) }
    })
    const w = v.videoWidth || 0, h = v.videoHeight || 0
    if (!w || !h) { await markFailed(item, 'no dimensions'); return }
    const scale = Math.min(1, 320 / Math.max(w, h))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * scale))
    c.height = Math.max(1, Math.round(h * scale))
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
    const dataUrl = c.toDataURL('image/jpeg', 0.8)
    item.thumb = dataUrl
    await dbPut('thumbnails', { id: item.id, dataUrl, at: Date.now() }, item.id)
    emit('thumb:updated', item.id)
    console.error('[gr-thumb] ✅ SUCCESS id=' + item.id + ' thumbLen=' + dataUrl.length + ' w=' + c.width + ' h=' + c.height)
  } catch(e) {
    console.error('[gr-thumb] ❌ FAIL id=' + item.id + ' reason=' + (e?.message || 'unknown'))
    await markFailed(item, e?.message || 'unknown')
  } finally {
    try { v.removeAttribute('src'); v.load() } catch {}
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }
}

async function markFailed(item, reason = '') {
  item.thumbFailed = true
  console.error('[gr-thumb] markFailed id=' + item.id + ' reason=' + reason)
  try { await dbPut('thumbnails', { id: item.id, failed: true, at: Date.now(), reason }, item.id) } catch {}
}
