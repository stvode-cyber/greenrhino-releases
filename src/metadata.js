// 解析音频 ID3 / 元数据标签，返回 {title, artist, album, cover(dataURL), lyrics}
// jsmediatags 通过 CDN 懒加载，网络不可用时优雅降级（不影响离线播放）
const CDN = 'https://esm.sh/jsmediatags@3.9.7'
const TIMEOUT = 5000
export async function parseTags(blob) {
  let mod = null
  try {
    // 给 CDN 动态导入加超时：网络挂起/被墙时 5s 后放弃，绝不卡住导入流程
    mod = await Promise.race([
      import(CDN),
      new Promise((_, rej) => setTimeout(() => rej(new Error('cdn-timeout')), TIMEOUT))
    ])
  } catch (e) { return {} }
  if (!mod) return {}
  const jsmediatags = mod.default || mod
  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({}), TIMEOUT)
    try {
      jsmediatags.read(blob, {
        onSuccess: (tag) => {
          clearTimeout(timer)
          const t = tag.tags || {}
          let cover = null
          if (t.picture) {
            const { data, format } = t.picture
            let base64 = ''
            for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i])
            cover = `data:${format};base64,${base64}`
          }
          const rawLyrics = t.lyrics
          const lyrics = (typeof rawLyrics === 'string' && rawLyrics.trim()) ? rawLyrics.trim() : ''
          resolve({ title: t.title || '', artist: t.artist || '', album: t.album || '', cover, lyrics })
        },
        onError: () => { clearTimeout(timer); resolve({}) }
      })
    } catch (e) { clearTimeout(timer); resolve({}) }
  })
}
