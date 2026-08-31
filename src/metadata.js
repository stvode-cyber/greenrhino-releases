// 解析音频 ID3 / 元数据标签，返回 {title, artist, album, cover(dataURL), lyrics}
// 采用本地零依赖 ID3 解析（src/id3.js），完全离线可用，不依赖任何 CDN/网络。
import { parseID3 } from './id3.js'

export async function parseTags(blob) {
  try {
    const buf = await blob.arrayBuffer()
    const tags = parseID3(buf)
    if (!tags) return {}
    const out = {}
    if (tags.title) out.title = tags.title
    if (tags.artist) out.artist = tags.artist
    if (tags.album) out.album = tags.album
    if (tags.cover) out.cover = tags.cover
    if (tags.lyrics && tags.lyrics.trim()) out.lyrics = tags.lyrics.trim()
    return out
  } catch (e) {
    return {}
  }
}
