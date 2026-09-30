// id3.js — 零依赖 ID3 标签解析（离线提取 标题/歌手/专辑/封面/歌词）
// 支持 ID3v2.3 / ID3v2.4 的常用帧；无 ID3v2 时回退 ID3v1（仅标题/歌手/专辑）。
// 不依赖任何网络与第三方库，契合本播放器「离线优先」定位。

function synchsafe(bytes, off) {
  return ((bytes[off] & 0x7f) << 21) | ((bytes[off + 1] & 0x7f) << 14) |
         ((bytes[off + 2] & 0x7f) << 7) | (bytes[off + 3] & 0x7f)
}

// 按编码把字节解码为字符串，并去掉开头 BOM 与结尾空字符
function decodeText(bytes, enc) {
  if (!bytes || !bytes.length) return ''
  let str
  try {
    if (enc === 1) {
      // UTF-16 带 BOM
      const bom = (bytes[0] === 0xff && bytes[1] === 0xfe) ? 'utf-16le'
        : (bytes[0] === 0xfe && bytes[1] === 0xff) ? 'utf-16be' : 'utf-16le'
      str = new TextDecoder(bom).decode(bytes)
    } else if (enc === 2) {
      str = new TextDecoder('utf-16be').decode(bytes)
    } else if (enc === 3) {
      str = new TextDecoder('utf-8').decode(bytes)
    } else {
      str = new TextDecoder('iso-8859-1').decode(bytes)
    }
  } catch {
    str = new TextDecoder('iso-8859-1').decode(bytes)
  }
  if (str.charCodeAt(0) === 0xfeff) str = str.slice(1)
  return str.replace(/\u0000+$/, '')
}

// 找到空终止符并返回其后的偏移。enc 0/3 为单字节 0x00；enc 1/2 为双字节 0x0000
function skipTerm(bytes, start, enc) {
  if (enc === 1 || enc === 2) {
    for (let i = start; i + 1 < bytes.length; i += 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) return i + 2
    }
    return bytes.length
  }
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] === 0) return i + 1
  }
  return bytes.length
}

function bytesToBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// 去掉 0xFF 后紧跟的 0x00（ID3 unsynchronisation）
function deUnsync(bytes) {
  const out = new Uint8Array(bytes.length)
  let j = 0
  for (let i = 0; i < bytes.length; i++) {
    out[j++] = bytes[i]
    if (bytes[i] === 0xff && i + 1 < bytes.length && bytes[i + 1] === 0x00) i++
  }
  return out.subarray(0, j)
}

function handleFrame(id, data, out) {
  if (data.length < 1) return
  const enc = data[0]

  if (id === 'USLT') {
    if (out.lyrics) return
    let p = 1 + 3 // 跳过编码字节 + 3 字节语言
    if (p >= data.length) return
    p = skipTerm(data, p, enc) // 跳过内容描述符
    const text = decodeText(data.subarray(p), enc)
    if (text && text.trim()) out.lyrics = text.trim()
    return
  }

  if (id === 'APIC') {
    if (out.cover) return
    let p = 1
    let mimeEnd = p
    while (mimeEnd < data.length && data[mimeEnd] !== 0) mimeEnd++
    const mime = String.fromCharCode.apply(null, data.subarray(p, mimeEnd)) || 'image/jpeg'
    p = mimeEnd + 1
    if (p >= data.length) return
    p += 1 // 跳过图片类型字节
    p = skipTerm(data, p, enc) // 跳过描述符
    const img = data.subarray(p)
    if (img.length > 0) {
      try { out.cover = `data:${mime};base64,${bytesToBase64(img)}` } catch {}
    }
    return
  }

  if (id[0] === 'T' && id !== 'TXXX') {
    const text = decodeText(data.subarray(1), enc)
    if (!text) return
    if (id === 'TIT2') out.title = text
    else if (id === 'TPE1' || id === 'TPE2') out.artist = out.artist || text
    else if (id === 'TALB') out.album = text
    return
  }
  // 其余帧（COMM / TXXX / PRIV / WXXX / 二进制 等）忽略
}

function parseV2(bytes) {
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null // "ID3"
  const major = bytes[3]
  const flags = bytes[5]
  const size = synchsafe(bytes, 6)
  const offset = 10
  const region = (major <= 4 && (flags & 0x80))
    ? deUnsync(bytes.subarray(offset, offset + size))
    : bytes.subarray(offset, offset + size)

  const out = { title: '', artist: '', album: '', cover: '', lyrics: '' }
  const isV4 = major === 4
  let p = 0
  while (p + 10 <= region.length) {
    const id = String.fromCharCode(region[p], region[p + 1], region[p + 2], region[p + 3])
    if (id[0] === '\u0000') break
    let frameSize
    if (isV4) frameSize = synchsafe(region, p + 4)
    else frameSize = (region[p + 4] << 24) | (region[p + 5] << 16) | (region[p + 6] << 8) | region[p + 7]
    const frameFlags = (region[p + 8] << 8) | region[p + 9]
    p += 10
    if (frameSize <= 0) break
    if (p + frameSize > region.length) break
    if (!isV4 && (frameFlags & 0x00c0)) { p += frameSize; continue } // 压缩/加密帧无法解码，跳过
    if (out.title && out.artist && out.album && out.cover && out.lyrics) break
    const data = region.subarray(p, p + frameSize)
    p += frameSize
    handleFrame(id, data, out)
  }
  return out
}

function parseV1(bytes) {
  const n = bytes.length
  if (n < 128) return null
  const tail = bytes.subarray(n - 128)
  if (tail[0] !== 0x54 || tail[1] !== 0x41 || tail[2] !== 0x47) return null // "TAG"
  const dec = (s) => {
    let str = ''
    for (const b of s) str += String.fromCharCode(b)
    return str.replace(/\u0000+$/, '').trim()
  }
  return {
    title: dec(tail.subarray(3, 33)),
    artist: dec(tail.subarray(33, 63)),
    album: dec(tail.subarray(63, 93))
  }
}

export function parseID3(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  let v2 = null
  try { v2 = parseV2(bytes) } catch { v2 = null }
  const out = v2 || { title: '', artist: '', album: '', cover: '', lyrics: '' }
  // ID3v1 兜底补充标题/歌手/专辑（v1 无封面与歌词）
  if (!out.title || !out.artist || !out.album) {
    let v1 = null
    try { v1 = parseV1(bytes) } catch { v1 = null }
    if (v1) {
      if (!out.title && v1.title) out.title = v1.title
      if (!out.artist && v1.artist) out.artist = v1.artist
      if (!out.album && v1.album) out.album = v1.album
    }
  }
  return {
    title: out.title || '',
    artist: out.artist || '',
    album: out.album || '',
    cover: out.cover || '',
    lyrics: out.lyrics || ''
  }
}
