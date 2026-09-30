// videoPlayer.js — 影像（视频）窗口的播放器。
// 空态：用视频内容网格填满整个主区域（不再是一块留白黑屏）。
// 播放态：画面铺满整屏（object-fit:cover，不留黑边），画面下方是增强控制条：
//   倍速 / 音轨 / 字幕轨 / 载入字幕 / 章节 / 画中画 / 旋转 / 比例 / 截图 / AB 循环 / 生成片段。
import { h, toast } from './dom.js'
import { player } from '../player.js'
import { getSettings, saveTrackPref } from '../store.js'
import { mediaLibrary } from './library.js'

export function buildVideoPlayer(app) {
  const lib = mediaLibrary(app, 'video')   // 空态内容：视频库网格，铺满

  const video = h('video', { playsinline: true, preload: 'metadata' })
  const stage = h('div', { class: 'vp-stage' }, video)

  // HEVC/10bit 等不兼容编码的实时转码进度（C# ffmpeg 回传百分比）
  const transcodeBox = h('div', { class: 'transcode-progress', hidden: true },
    h('div', { class: 'tc-row' },
      h('span', { class: 'tc-text' }, '正在转码为 H.264…'),
      h('span', { class: 'tc-pct' }, '0%')),
    h('div', { class: 'tc-bar' }, h('div', { class: 'tc-fill', style: { width: '0%' } })))
  stage.appendChild(transcodeBox)
  function showTc(pct) {
    transcodeBox.hidden = false
    const f = transcodeBox.querySelector('.tc-fill'), p = transcodeBox.querySelector('.tc-pct')
    if (f) f.style.width = pct + '%'
    if (p) p.textContent = pct + '%'
  }
  const hideTc = () => { transcodeBox.hidden = true }
  player.on('transcode', () => showTc(0))
  player.on('transcodeProgress', (e) => showTc((e && e.pct) || 0))
  player.on('transcodeDone', hideTc)

  // ---------- 增强控制条（倍速 / 音轨 / 字幕 / 章节 / 画中画 / 旋转 / 比例 / 截图 / AB 循环 / 片段） ----------
  let rotate = 0, fit = 'cover'

  const speedSel = h('select', { class: 'opt', onchange: (e) => player.setSpeed(parseFloat(e.target.value)) },
    ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) =>
      h('option', { value: String(s), selected: s === 1 }, s + 'x')))

  const subInput = h('input', { type: 'file', accept: '.srt,.vtt,.txt', style: { display: 'none' } })
  subInput.addEventListener('change', async () => {
    const f = subInput.files[0]; if (!f) return
    await player.loadSubtitle(f); toast('字幕已载入')
    setTimeout(refreshTrackSelects, 400)
  })

  const audSel = h('select', { class: 'opt', title: '音轨切换', style: { display: 'none' },
    onchange: (e) => {
      const i = +e.target.value
      const at = video.audioTracks
      if (at) for (let k = 0; k < at.length; k++) at[k].enabled = (k === i)
      saveTrackPref(player.current?.id, 'audio', i)
    } })
  const subSel = h('select', { class: 'opt', title: '字幕轨切换', style: { display: 'none' },
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

  // AB 循环与片段剪辑
  const abA = h('span', { class: 'opt ab-label' }, 'A:--')
  const abB = h('span', { class: 'opt ab-label' }, 'B:--')
  const fmtT = (s) => { if (s == null) return '--'; const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}` }
  const updAB = () => {
    const ab = player._ab || {}
    abA.textContent = 'A:' + fmtT(ab.a)
    abB.textContent = 'B:' + fmtT(ab.b)
  }
  player.on('time', () => updAB())

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

  function generateClip() {
    const item = player.current
    const ab = player._ab || {}
    if (ab.a == null || ab.b == null || ab.b <= ab.a) { toast('请先设置有效的 A/B 点', 'err'); return }
    const path = item && item.localPath
    if (!path) { toast('仅支持本地文件生成片段（双击/外部打开的视频可用）', 'info'); return }
    const dur = player.getDuration() || ab.b
    const a = Math.max(0, ab.a), b = Math.min(dur, ab.b)
    toast(`正在生成片段 ${fmtT(a)}~${fmtT(b)} …`)
    try {
      window.chrome?.webview?.postMessage(JSON.stringify({ type: 'clip', path, start: a, end: b }))
    } catch (e) { toast('当前环境不支持片段生成', 'err') }
  }
  player.on('clipResult', (m) => {
    if (m && m.ok) toast('片段已保存：' + (m.path || ''))
    else toast(m && m.msg ? m.msg : '片段生成失败', 'err')
  })

  const opts = h('div', { class: 'vp-opts' },
    h('span', { class: 'opt', style: { pointerEvents: 'none', opacity: .7 } }, '⏩'), speedSel,
    audSel, subSel,
    h('button', { class: 'opt', title: '载入字幕(.srt/.vtt)', onclick: () => subInput.click() }, '📝 字幕'),
    h('button', { class: 'opt', title: '载入章节', onclick: () => chapInput.click() }, '📑 章节'),
    h('button', { class: 'opt', title: '画中画', onclick: () => player.togglePiP() }, '🖼 画中画'),
    h('button', { class: 'opt', title: '旋转', onclick: () => { rotate = (rotate + 1) % 4; video.style.transform = `rotate(${rotate * 90}deg)` } }, '🔄'),
    h('button', { class: 'opt', title: '画面比例(铺满/原始)', onclick: () => { fit = fit === 'contain' ? 'cover' : 'contain'; video.style.objectFit = fit } }, '📐'),
    h('button', { class: 'opt', title: '截图', onclick: screenshot }, '📸'),
    h('button', { class: 'opt', title: '设 A 点(循环起点)', onclick: () => { player.setAB(player.getTime(), (player._ab || {}).b); updAB(); toast('已设 A 点 ' + fmtT(player.getTime())) } }, 'ⓐ'),
    h('button', { class: 'opt', title: '设 B 点(循环终点)', onclick: () => { player.setAB((player._ab || {}).a, player.getTime()); updAB(); toast('已设 B 点 ' + fmtT(player.getTime())) } }, 'ⓑ'),
    h('button', { class: 'opt', title: '清除 AB 循环', onclick: () => { player.clearAB(); updAB(); toast('已清除 AB 循环') } }, '✕AB'),
    h('button', { class: 'opt', title: '生成片段(保存到视频/影音先锋剪辑)', onclick: generateClip }, '✂ 生成片段'),
    abA, abB)
  stage.appendChild(opts)

  function refreshTrackSelects() {
    const at = video.audioTracks
    audSel.innerHTML = ''
    if (at && at.length > 1) {
      audSel.style.display = ''
      for (let k = 0; k < at.length; k++) audSel.appendChild(h('option', { value: String(k), selected: at[k].enabled }, at[k].label || at[k].language || `音轨 ${k + 1}`))
    } else audSel.style.display = 'none'
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

  // 记忆上次的音轨/字幕轨选择，下次打开同一视频自动套用
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

  const el = h('div', { class: 'vp-page' }, lib.el, stage)

  player.setVideoElement(video)
  video.addEventListener('click', () => player.toggle())
  video.addEventListener('dblclick', postFS)   // 双击画面：全屏/退出全屏
  function postFS() {
    try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'fullscreen' })) } catch {}
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') postFS() })

  // 空态显示内容网格；播放时画面铺满覆盖
  function showGrid() { stage.style.display = 'none'; lib.el.style.display = '' }
  function showStage() { stage.style.display = 'flex'; lib.el.style.display = 'none' }
  player.on('trackchanged', (it) => {
    const playing = !!(it && it.type === 'video')
    if (playing) { showStage(); setTimeout(refreshTrackSelects, 60) } else showGrid()
    hideTc()
  })
  player.on('loaded', (item) => { if (item?.type === 'video') setTimeout(refreshTrackSelects, 60) })
  if (video.textTracks) {
    video.textTracks.onaddtrack = () => refreshTrackSelects()
    video.textTracks.onremovetrack = () => refreshTrackSelects()
  }
  showGrid()

  return {
    el,
    _video: video,
    refresh() { lib.refresh() },
    show() {
      // 重建合成层，规避 WebView2 display:none 黑屏
      video.style.display = 'none'; void video.offsetWidth
      requestAnimationFrame(() => { video.style.display = '' })
      try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'videoKick' })) } catch {}
      lib.refresh()
    },
    hide() { try { video.pause() } catch {} },
    cleanup() { lib.cleanup() }
  }
}