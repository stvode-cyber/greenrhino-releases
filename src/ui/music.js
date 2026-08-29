// music.js — 音乐播放页（专辑图 + 频谱 + 歌词 + EQ/睡眠）
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { Spectrum } from './spectrum.js'
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
    lyrics = []; renderLyrics(); setCover(item)
  })

  return {
    el,
    show() { spectrum.start() },
    hide() { spectrum.stop() },
    cleanup() { offTime(); offTrack() }
  }
}
