// music.js — 音乐播放页（专辑图 + 频谱 + 歌词 + EQ/睡眠）
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { Spectrum } from './spectrum.js'
import { updateMedia } from '../store.js'
import { parseLRC } from '../lrc.js'

export function buildMusic(app) {
  const el = h('div', { class: 'music-view' })
  const albumArt = h('div', { class: 'album-art' }, '🎵')
  const spectrumCanvas = h('canvas', { id: 'spectrum' })
  const trackTitle = h('div', { class: 't' }, '未在播放')
  const trackArtist = h('div', { class: 'a' }, '选择一首歌曲开始')
  const lyricsBox = h('div', { class: 'lyrics' }, h('div', { class: 'none' }, '暂无歌词 · 点击「载入歌词」导入 LRC'))

  const eqBtn = h('button', { class: 'opt', onclick: () => app.openEQ() }, '🎚 EQ')
  const sleepBtn = h('button', { class: 'opt', onclick: () => app.openSleep() }, '🌙 睡眠')
  const lyricBtn = h('button', { class: 'opt', onclick: loadLyric }, '📜 载入歌词')

  const spectrum = new Spectrum(spectrumCanvas)
  let lyrics = []
  let lyricFileInput = h('input', { type: 'file', accept: '.lrc,.txt', style: { display: 'none' } })
  lyricFileInput.addEventListener('change', async () => {
    const f = lyricFileInput.files[0]
    if (!f) return
    lyrics = parseLRC(await f.text())
    renderLyrics()
    toast('歌词已载入')
  })
  function loadLyric() { lyricFileInput.click() }

  el.append(
    h('div', { class: 'album-wrap' }, albumArt, spectrumCanvas,
      h('div', { class: 'track-info' }, trackTitle, trackArtist),
      h('div', { class: 'video-opts', style: { justifyContent: 'center' } }, eqBtn, sleepBtn, lyricBtn),
      lyricFileInput
    ),
    lyricsBox
  )

  function renderLyrics() {
    lyricsBox.innerHTML = ''
    if (!lyrics.length) { lyricsBox.appendChild(h('div', { class: 'none' }, '暂无歌词 · 点击「载入歌词」导入 LRC')); return }
    lyrics.forEach((l, i) => {
      const line = h('div', { class: 'line', 'data-i': i }, l.text)
      line.addEventListener('click', () => player.seek(l.time))
      lyricsBox.appendChild(line)
    })
  }

  function highlightLyric(time) {
    if (!lyrics.length) return
    let idx = -1
    for (let i = 0; i < lyrics.length; i++) if (lyrics[i].time <= time + 0.15) idx = i; else break
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
    if (item.type === 'video') return
    if (item.lyric && item.lyric.trim()) {
      lyrics = parseLRC(item.lyric); renderLyrics()
    } else {
      lyrics = []; renderLyrics()
      fetchOnlineLyric(item)   // ② 在线自动匹配
    }
    setCover(item)
  })
  // ② 在线自动歌词：按歌名+歌手请求公开 LRCLIB API，命中则渲染并缓存回 IndexedDB（下次离线也有）
  async function fetchOnlineLyric(item) {
    if (!item || item.type === 'video') return
    const title = (item.title || item.name || '').trim()
    const artist = (item.artist || '').trim()
    if (!title || !navigator.onLine) return
    try {
      // LRCLIB 现行接口参数：track_name / artist_name / album_name（旧参数 track/artist 会 0 命中）
      const q = new URLSearchParams()
      q.set('track_name', title)
      if (artist) q.set('artist_name', artist)
      if (item.album) q.set('album_name', item.album)
      const res = await fetch(`https://lrclib.net/api/search?${q.toString()}`, {
        headers: { 'X-User-Agent': 'GreenRhino/1.0 (offline media player)' }
      })
      if (!res.ok) return
      const arr = await res.json()
      if (!Array.isArray(arr) || !arr.length) return
      const pick = (a) => (a && (a.syncedLyrics || a.plainLyrics)) ? (a.syncedLyrics || a.plainLyrics) : ''
      let lrc = pick(arr[0])
      if (artist) {
        const exact = arr.find((a) => a.artistName && a.artistName.toLowerCase().includes(artist.toLowerCase()) && (a.syncedLyrics || a.plainLyrics))
        if (exact) lrc = pick(exact)
      }
      if (!lrc || !lrc.trim()) return
      const parsed = parseLRC(lrc)
      if (!parsed.length) return
      lyrics = parsed; renderLyrics()
      toast('已从网络匹配歌词')
      try { await updateMedia(item.id, { lyric: lrc }) } catch (e) {}
    } catch (e) { /* 离线或接口异常：静默，不影响播放 */ }
  }

  return {
    el,
    show() { spectrum.start() },
    hide() { spectrum.stop() },
    cleanup() { offTime(); offTrack() }
  }
}
