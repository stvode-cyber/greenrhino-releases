// 解析 LRC 歌词，返回按时间排序的 [{time, text}]
export function parseLRC(text) {
  if (!text) return []
  const lines = text.split(/\r?\n/)
  const out = []
  let offset = 0
  const tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  for (const line of lines) {
    const off = line.match(/^\[(offset):(-?\d+)\]/i)
    if (off) { offset = parseInt(off[2], 10); continue }
    const matches = [...line.matchAll(tagRe)]
    if (!matches.length) continue
    const content = line.replace(tagRe, '').trim()
    if (!content) continue
    for (const m of matches) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      let ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0
      const time = min * 60 + sec + ms / 1000 + offset / 1000
      out.push({ time, text: content })
    }
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

// 简易 SRT → VTT 转换，用于外挂字幕
export function srtToVtt(text) {
  let vtt = 'WEBVTT\n\n'
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/)
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean)
    if (lines.length < 2) continue
    const idx = lines[0].match(/^\d+$/) ? 1 : 0
    const tc = lines[idx].replace(',', '.')
    const m = tc.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/)
    if (!m) continue
    vtt += `${m[1]} --> ${m[2]}\n${lines.slice(idx + 1).join('\n')}\n\n`
  }
  return vtt
}
