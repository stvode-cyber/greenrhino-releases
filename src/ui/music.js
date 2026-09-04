// music.js — 音乐页（音乐库 + 播放器：专辑图 + 频谱 + 歌词 + EQ/睡眠）
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { Spectrum } from './spectrum.js'
import { updateMedia } from '../store.js'
import { parseLRC } from '../lrc.js'
import { mediaLibrary } from './library.js'

export function buildMusic(app) {
  // 左侧：音乐库（按类型过滤）
  const lib = mediaLibrary(app, 'music')
  const el = h('div', { class: 'music-page' })
  const albumArt = h('div', { class: 'album-art' }, '🎵')
  const spectrumCanvas = h('canvas', { id: 'spectrum' })
  const trackTitle = h('div', { class: 't' }, '未在播放')
  const trackArtist = h('div', { class: 'a' }, '选择一首歌曲开始')
  const lyricsBox = h('div', { class: 'lyrics' }, h('div', { class: 'none' }, '暂无歌词 · 点「载入歌词」导入或「搜歌词」在线匹配'))

  const eqBtn = h('button', { class: 'opt', onclick: () => app.openEQ() }, '🎚 EQ')
  const sleepBtn = h('button', { class: 'opt', onclick: () => app.openSleep() }, '🌙 睡眠')
  const lyricBtn = h('button', { class: 'opt', onclick: loadLyric }, '📜 载入歌词')
  const searchBtn = h('button', { class: 'opt', onclick: toggleSearch }, '🔍 搜歌词')

  // 当前曲目（用于搜歌词预填）+ LRC 时间偏移校准
  let currentItem = null
  let lyricOffset = 0

  // 搜歌词内联框
  const searchTitleI = h('input', { type: 'text', placeholder: '歌名', style: { flex: '1 1 120px', background: '#1b212b', color: '#e6e6e6', border: '1px solid #2c3440', borderRadius: '8px', padding: '6px 8px' } })
  const searchArtistI = h('input', { type: 'text', placeholder: '歌手（可选）', style: { flex: '1 1 120px', background: '#1b212b', color: '#e6e6e6', border: '1px solid #2c3440', borderRadius: '8px', padding: '6px 8px' } })
  const searchGo = h('button', { class: 'opt', onclick: doSearch }, '搜索')
  const searchCancel = h('button', { class: 'opt', onclick: toggleSearch }, '取消')
  const lyricSearchBox = h('div', { class: 'lyric-search', style: { display: 'none', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } }, searchTitleI, searchArtistI, searchGo, searchCancel)

  // 偏移校准控件（秒）
  const offsetVal = h('span', { style: { minWidth: '54px', textAlign: 'right', color: '#9aa7b4' } }, '0.0s')
  const offsetSlider = h('input', { type: 'range', min: -5000, max: 5000, step: 100, value: 0, style: { flex: '1 1 140px' } })
  offsetSlider.addEventListener('input', () => {
    lyricOffset = Number(offsetSlider.value) / 1000
    offsetVal.textContent = (lyricOffset >= 0 ? '+' : '') + lyricOffset.toFixed(1) + 's'
    renderLyrics()
    highlightLyric(player.currentTime)
  })
  const offsetWrap = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', padding: '0 4px' } },
    h('span', { style: { color: '#9aa7b4', whiteSpace: 'nowrap' } }, '🕐 校准'), offsetSlider, offsetVal)

  const spectrum = new Spectrum(spectrumCanvas)
  let lyrics = []
  let lyricFileInput = h('input', { type: 'file', accept: '.lrc,.txt', style: { display: 'none' } })
  lyricFileInput.addEventListener('change', async () => {
    const f = lyricFileInput.files[0]
    if (!f) return
    lyrics = parseLRC(await f.text())
    lyricOffset = 0; offsetSlider.value = 0; offsetVal.textContent = '0.0s'
    renderLyrics()
    toast('歌词已载入')
  })
  function loadLyric() { lyricFileInput.click() }

  function toggleSearch() {
    const open = lyricSearchBox.style.display === 'none'
    lyricSearchBox.style.display = open ? 'flex' : 'none'
    if (open) {
      searchTitleI.value = currentItem?.title || currentItem?.name || ''
      searchArtistI.value = currentItem?.artist || ''
      setTimeout(() => searchTitleI.focus(), 0)
    }
  }
  async function doSearch() {
    if (!currentItem) { toast('请先播放一首歌曲'); return }
    const title = searchTitleI.value.trim()
    const artist = searchArtistI.value.trim()
    if (!title) { toast('请填写歌名'); return }
    toggleSearch()
    await fetchOnlineLyric(currentItem, { title, artist })
  }

  el.append(
    lib.el,
    h('div', { class: 'music-player' },
      h('div', { class: 'album-wrap' }, albumArt, spectrumCanvas,
        h('div', { class: 'track-info' }, trackTitle, trackArtist),
        h('div', { class: 'video-opts', style: { justifyContent: 'center' } }, eqBtn, sleepBtn, lyricBtn, searchBtn),
        lyricSearchBox,
        lyricFileInput
      ),
      offsetWrap,
      lyricsBox
    )
  )

  function renderLyrics() {
    lyricsBox.innerHTML = ''
    if (!lyrics.length) { lyricsBox.appendChild(h('div', { class: 'none' }, '暂无歌词 · 点「载入歌词」导入或「搜歌词」在线匹配')); return }
    lyrics.forEach((l, i) => {
      const t = l.time + lyricOffset
      const line = h('div', { class: 'line', 'data-i': i }, l.text)
      line.addEventListener('click', () => player.seek(t))
      lyricsBox.appendChild(line)
    })
  }

  function highlightLyric(time) {
    if (!lyrics.length) return
    let idx = -1
    for (let i = 0; i < lyrics.length; i++) if ((lyrics[i].time + lyricOffset) <= time + 0.15) idx = i; else break
    const lines = lyricsBox.querySelectorAll('.line')
    lines.forEach((l, i) => l.classList.toggle('active', i === idx))
    const active = lines[idx]
    if (active && Math.abs(active.offsetTop - lyricsBox.scrollTop - lyricsBox.clientHeight / 2) > lyricsBox.clientHeight / 3) {
      active.scrollIntoView({ block: 'center' })
    }
  }

  function setCover(item) {
    albumArt.innerHTML = ''
    if (item?.cover) {
      const img = h('img', { src: item.cover, alt: '', onload: () => extractColor(img) })
      albumArt.appendChild(img)
    } else albumArt.textContent = '🎵'
    trackTitle.textContent = item?.title || item?.name || '未在播放'
    trackArtist.textContent = item?.artist || item?.album || ''
    el.style.background = ''
  }

  function extractColor(img) {
    const c = document.createElement('canvas'); c.width = c.height = 1
    try {
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      el.style.background = `radial-gradient(circle at 30% 20%, rgba(${r},${g},${b},.25), transparent 60%)`
    } catch {}
  }

  const offTime = player.on('time', ({ time }) => highlightLyric(time))
  const offTrack = player.on('trackchanged', (item) => {
    currentItem = item
    lyricOffset = 0; offsetSlider.value = 0; offsetVal.textContent = '0.0s'
    if (item.type === 'video') return
    if (item.lyric && item.lyric.trim()) {
      lyrics = parseLRC(item.lyric); renderLyrics()
    } else {
      lyrics = []; renderLyrics()
      fetchOnlineLyric(item)   // 自动匹配（用文件自身标签）
    }
    setCover(item)
  })
  // ② 在线自动歌词：优先走原生壳本地代理 /api/lyric（多源聚合 LRCLIB+歌词迷，且绕开浏览器跨域），
  //    纯 PWA 模式（无本地服务）再兜底直连 LRCLIB。命中后渲染并缓存回 IndexedDB（下次离线也有）。
  //    query 可指定自定义歌名/歌手（手动搜歌词时用）。
  async function fetchOnlineLyric(item, query) {
    if (!item || item.type === 'video') return
    const title = (query?.title ?? item.title ?? item.name ?? '').trim()
    const artist = (query?.artist ?? item.artist ?? '').trim()
    const album = (query?.album ?? item.album ?? '').trim()
    if (!title || !navigator.onLine) return
    let lrc = ''
    // ① 原生壳本地代理（exe 专属）：同源请求，无跨域问题
    try {
      const u = new URLSearchParams({ title, artist })
      const res = await fetch(`/api/lyric?${u.toString()}`)
      if (res.ok) {
        const j = await res.json().catch(() => null)
        if (j && j.lyric && j.lyric.trim()) lrc = j.lyric.trim()
      }
    } catch (e) { /* 本地服务不存在（纯 PWA）或非 200：走兜底 */ }
    // ② 直连 LRCLIB 兜底（仅当代理未命中）
    if (!lrc) {
      try { lrc = await fetchLrclib(title, artist, album) } catch (e) {}
    }
    if (!lrc) { toast('未找到匹配歌词'); return }
    const parsed = parseLRC(lrc)
    if (!parsed.length) { toast('歌词格式无法解析'); return }
    lyrics = parsed; lyricOffset = 0; offsetSlider.value = 0; offsetVal.textContent = '0.0s'; renderLyrics()
    toast('已匹配歌词')
    try { await updateMedia(item.id, { lyric: lrc }) } catch (e) {}
  }

  // LRCLIB（国际公共歌词库，免费无 Key）直连，供纯 PWA 模式兜底
  async function fetchLrclib(title, artist, album) {
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

  return {
    el,
    refresh() { lib.refresh() },
    show() { spectrum.start(); lib.refresh() },
    hide() { spectrum.stop() },
    cleanup() { offTime(); offTrack(); lib.cleanup() }
  }
}
