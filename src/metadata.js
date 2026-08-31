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

// 无 ID3 标签时，从文件名推断「歌名 / 歌手」，提升离线条目显示与联网匹配命中率。
// 中文惯例多为「歌手 - 歌名」（如「周杰伦 - 晴天.mp3」）；也兼容「歌名 - 歌手」反查失败场景（仍按惯例取首段为歌手）。
// 自动去掉前缀曲目号（01 / 01. / 01 -）与扩展名。
export function guessFromFilename(name) {
  if (!name) return {}
  let base = name.replace(/\.[^.]+$/, '').trim()
  base = base.replace(/^\d+[\s.\-_]+/, '')          // 去前缀曲目号
  const segs = base.split(/\s+[–—-]\s+/)             // 优先「空格-空格」分隔
  if (segs.length >= 2) {
    const artist = segs[0].trim()
    const title = segs.slice(1).join(' ').trim()
    if (artist && title) return { artist, title }
  }
  return base ? { title: base } : {}
}
