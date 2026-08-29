// 解析音频 ID3 / 元数据标签，返回 {title, artist, album, cover(dataURL)}
// jsmediatags 通过 CDN 懒加载，网络不可用时优雅降级（不影响离线播放）
export async function parseTags(blob) {
  try {
    const mod = await import('https://esm.sh/jsmediatags@3.9.7')
    const jsmediatags = mod.default || mod
    return await new Promise((resolve) => {
      jsmediatags.read(blob, {
        onSuccess: (tag) => {
          const t = tag.tags || {}
          let cover = null
          if (t.picture) {
            const { data, format } = t.picture
            let base64 = ''
            for (let i = 0; i < data.length; i++) base64 += String.fromCharCode(data[i])
            cover = `data:${format};base64,${base64}`
          }
          resolve({ title: t.title || '', artist: t.artist || '', album: t.album || '', cover })
        },
        onError: () => resolve({})
      })
    })
  } catch (e) {
    return {}
  }
}
