// video.js — 视频播放页（画面 + 字幕 + 控制选项）
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { getSettings, saveTrackPref } from '../store.js'

export function buildVideo(app) {
  const el = h('div', { class: 'video-view' })
  const video = h('video', { playsinline: true, preload: 'metadata' })
  const stage = h('div', { class: 'video-stage' }, video,
    h('div', { class: 'empty', id: 'video-hint', style: { position: 'absolute', inset: 0, display: 'flex' } },
      h('div', {}, h('div', { class: 'big' }, '🎬'), h('div', {}, '选择视频开始播放')))
  )

  player.setVideoElement(video)
  video.addEventListener('click', () => player.toggle())

  let rotate = 0, fit = 'contain'

  const speedSel = h('select', { class: 'opt', onchange: (e) => player.setSpeed(parseFloat(e.target.value)) },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) =>
      h('option', { value: String(s), selected: s === 1 }, s + 'x')))

  const subInput = h('input', { type: 'file', accept: '.srt,.vtt,.txt', style: { display: 'none' } })
  subInput.addEventListener('change', async () => {
    const f = subInput.files[0]; if (!f) return
    await player.loadSubtitle(f); toast('字幕已载入')
    setTimeout(refreshTrackSelects, 400)
  })

  // §10 音轨 / 字幕轨选择
  const audSel = h('select', { class: 'opt', 'data-role': 'aud-track', title: '音轨切换', style: { display: 'none' },
    onchange: (e) => {
      const i = +e.target.value
      const at = video.audioTracks
      if (at) for (let k = 0; k < at.length; k++) at[k].enabled = (k === i)
      saveTrackPref(player.current?.id, 'audio', i)
    } })
  const subSel = h('select', { class: 'opt', 'data-role': 'sub-track', title: '字幕轨切换', style: { display: 'none' },
    onchange: (e) => {
      const idx = +e.target.value
      const tt = video.textTracks
      for (let k = 0; k < tt.length; k++) tt[k].mode = (idx < 0 ? 'disabled' : (k === idx ? 'showing' : 'disabled'))
      saveTrackPref(player.current?.id, 'subtitle', idx)
    } })

  const chapInput = h('input', { type: 'file', accept: '.txt,.lrc,.csv', style: { display: 'none' } })
  chapInput.addEventListener('change', async () => {
    const f = chapInput.files[0]; if (!f) return
    await player.loadChapters(f)
    const cs = player.getChapters()
    toast(cs.length ? `已载入 ${cs.length} 个章节` : '未解析到章节节点')
  })

  function refreshTrackSelects() {
    // 音轨
    const at = video.audioTracks
    audSel.innerHTML = ''
    if (at && at.length > 1) {
      audSel.style.display = ''
      for (let k = 0; k < at.length; k++) audSel.appendChild(h('option', { value: String(k), selected: at[k].enabled }, at[k].label || at[k].language || `音轨 ${k + 1}`))
    } else audSel.style.display = 'none'
    // 字幕轨（仅 subtitles / captions）
    const tt = video.textTracks
    subSel.innerHTML = ''
    subSel.appendChild(h('option', { value: '-1' }, '关闭字幕'))
    const subs = []
    for (let k = 0; k < tt.length; k++) if (tt[k].kind === 'subtitles' || tt[k].kind === 'captions') subs.push({ t: tt[k], idx: k })
    if (subs.length) {
      subSel.style.display = ''
      subs.forEach(({ t, idx }) => subSel.appendChild(h('option', { value: String(idx), selected: t.mode === 'showing' }, t.label || t.language || `字幕 ${idx + 1}`)))
    } else subSel.style.display = 'none'
    applyTrackPrefs()
  }

  // §10 增强：记忆上次的音轨/字幕轨选择，下次打开同一视频自动套用
  async function applyTrackPrefs() {
    const item = player.current
    if (!item || item.type !== 'video') return
    const s = await getSettings()
    const pref = s.trackPrefs?.[item.id]
    if (!pref) return
    const at = video.audioTracks
    if (pref.audio != null && at && at[pref.audio]) {
      for (let k = 0; k < at.length; k++) at[k].enabled = (k === pref.audio)
      audSel.value = String(pref.audio)
    }
    const tt = video.textTracks
    if (pref.subtitle != null && tt && tt.length) {
      for (let k = 0; k < tt.length; k++) tt[k].mode = (pref.subtitle < 0 ? 'disabled' : (k === pref.subtitle ? 'showing' : 'disabled'))
      subSel.value = String(pref.subtitle)
    }
  }

  const opts = h('div', { class: 'video-opts' },
    h('span', { class: 'opt', style: { pointerEvents: 'none', opacity: .7 } }, '⏩'), speedSel,
    audSel,
    subSel,
    h('button', { class: 'opt', onclick: () => subInput.click() }, '📝 载入字幕'),
    h('button', { class: 'opt', onclick: () => chapInput.click() }, '📑 章节'),
    h('button', { class: 'opt', onclick: () => player.togglePiP() }, '🖼 画中画'),
    h('button', { class: 'opt', onclick: () => { rotate = (rotate + 1) % 4; video.style.transform = `rotate(${rotate * 90}deg)` } }, '🔄 旋转'),
    h('button', { class: 'opt', onclick: () => { fit = fit === 'contain' ? 'cover' : 'contain'; video.style.objectFit = fit } }, '📐 比例'),
    h('button', { class: 'opt', onclick: screenshot }, '📸 截图'),
    h('button', { class: 'opt', onclick: () => { player._ab = player._ab || {}; player._ab.a = player.getTime(); toast('已设 A 点') } }, 'ⓐ 设 A'),
    h('button', { class: 'opt', onclick: () => { player._ab = player._ab || {}; player._ab.b = player.getTime(); toast('已设 B 点') } }, 'ⓑ 设 B'),
    h('button', { class: 'opt', onclick: () => { player.clearAB(); toast('已清除 AB 循环') } }, '✕ 清除AB')
  )

  el.append(stage, opts)

  function screenshot() {
    if (!video.videoWidth) { toast('视频尚未加载', 'err'); return }
    const c = document.createElement('canvas')
    c.width = video.videoWidth; c.height = video.videoHeight
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
    c.toBlob((blob) => {
      const a = h('a', { href: URL.createObjectURL(blob), download: `截图-${Date.now()}.png` })
      document.body.appendChild(a); a.click(); a.remove()
      toast('截图已保存')
    })
  }

  const offTrack = player.on('trackchanged', (item) => {
    document.getElementById('video-hint')?.style.setProperty('display', item?.type === 'video' ? 'none' : 'flex')
    if (item?.type === 'video') setTimeout(refreshTrackSelects, 60)
  })
  player.on('loaded', (item) => { if (item?.type === 'video') setTimeout(refreshTrackSelects, 60) })
  if (video.textTracks) {
    video.textTracks.onaddtrack = () => refreshTrackSelects()
    video.textTracks.onremovetrack = () => refreshTrackSelects()
  }

  return {
    el,
    show() {},
    hide() { try { video.pause() } catch {} },
    cleanup() { offTrack() }
  }
}
