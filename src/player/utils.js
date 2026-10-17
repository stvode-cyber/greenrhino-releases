// src/player/utils.js — 播放引擎纯工具函数 + 常量
// 从 player.js 抽离，player.js 原 line 16-81

/** 解析章节文件：支持 mm:ss / hh:mm:ss / mm:ss.ss / [mm:ss] 等格式 */
export function parseChapters(text) {
  const out = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^\[?(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?\.?(\d{1,3})?\]?\s*(.*)$/)
    if (!m) continue
    const a = +m[1], b = m[2] ? +m[2] : 0, c = m[3] ? +m[3] : 0, ms = m[4] ? +m[4].padEnd(3, '0') : 0
    const tsPart = line.split(/\s+/)[0].replace(/^\[?/, '').replace(/\]?$/, '').replace(/\.\d+$/, '')
    const colons = (tsPart.match(/:/g) || []).length
    const time = colons >= 2 ? a * 3600 + b * 60 + c + ms / 1000 : a * 60 + b + c + ms / 1000
    const title = m[5].trim()
    if (title) out.push({ time, title })
  }
  out.sort((x, y) => x.time - y.time)
  return out
}

/** EQ 均衡器频率刻度（Hz） */
export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

/** EQ 预设曲线（10 段 dB） */
export const EQ_PRESETS = {
  flat:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop:      [-1, 0, 1, 2, 3, 2, 0, -1, -1, -2],
  rock:     [3, 2, 1, 0, -1, -1, 0, 2, 3, 3],
  classical: [0, 0, 0, 0, 0, 0, -1, -1, 0, 1],
  bass:     [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal:    [-2, -1, 0, 2, 3, 3, 2, 0, -1, -2],
  electronic: [4, 3, 0, 0, -2, 1, 0, 2, 3, 4],
  jazz:     [2, 1, 0, 1, 1, 1, 0, 1, 2, 2],
  acoustic:  [2, 1, 0, 1, 2, 2, 1, 0, -1, -1],
  hiphop:   [4, 3, 2, 0, 1, 2, 1, 0, -1, -1],
  treble:   [-2, -1, 0, 0, 1, 2, 3, 4, 5, 5],
  loudness: [3, 2, 2, 2, 2, 2, 2, 2, 3, 3]
}

/** 扩展名 → MIME 映射 */
export const MIME_BY_EXT = {
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wma: 'audio/x-ms-wma',
  mp2: 'audio/mpeg', mp1: 'audio/mpeg', aiff: 'audio/aiff', mka: 'audio/x-matroska',
  ape: 'audio/x-ape', tak: 'audio/x-tak', dsf: 'audio/x-dsf',
  mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', m4v: 'video/mp4', ogv: 'video/ogg', ts: 'video/mp2t',
  flv: 'video/x-flv', wmv: 'video/x-ms-wmv'
}

/** 从文件名猜 MIME type */
export function guessMime(name, type) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  const ext = m ? m[1].toLowerCase() : ''
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext]
  return type === 'video' ? 'video/mp4' : 'audio/mpeg'
}

/** 取文件扩展名（小写） */
export function _extOf(item) {
  const m = /\.([a-z0-9]+)$/i.exec((item && item.name) || '')
  return m ? m[1].toLowerCase() : 'mp4'
}

/** ArrayBuffer → base64（给 C# 原生播放器传 blob 视频用） */
export function _bufToB64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
  return btoa(binary)
}
