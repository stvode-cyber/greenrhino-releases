// player.js — 统一播放引擎（音频 Web Audio 图 + 视频原生）
import { getProgress, saveProgress, getSettings } from './store.js'
import { srtToVtt } from './lrc.js'

// 解析章节文件（§10 章节跳转）：支持 mm:ss / hh:mm:ss / mm:ss.ss / [mm:ss] 等格式
// 每行：`时间 标题`，例如 `00:30 开场`、`1:23.5 高潮`、`[00:01:30] 片尾`
function parseChapters(text) {
  const out = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^\[?(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?\.?(\d{1,3})?\]?\s*(.*)$/)
    if (!m) continue
    const a = +m[1], b = m[2] ? +m[2] : 0, c = m[3] ? +m[3] : 0, ms = m[4] ? +m[4].padEnd(3, '0') : 0
    const tsPart = line.split(/\s+/)[0].replace(/^\[?/, '').replace(/\]?$/, '').replace(/\.\d+$/, '')
    const colons = (tsPart.match(/:/g) || []).length
    const time = colons >= 2 ? a * 3600 + b * 60 + c + ms / 1000 : a * 60 + b + c + ms / 1000
    const title = m[5].trim()
    if (title) out.push({ time, title })
  }
  out.sort((x, y) => x.time - y.time)
  return out
}

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const EQ_PRESETS = {
  flat:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop:      [-1, 0, 1, 2, 3, 2, 0, -1, -1, -2],
  rock:     [3, 2, 1, 0, -1, -1, 0, 2, 3, 3],
  classical: [0, 0, 0, 0, 0, 0, -1, -1, 0, 1],
  bass:     [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  vocal:    [-2, -1, 0, 2, 3, 3, 2, 0, -1, -2],
  electronic: [4, 3, 0, 0, -2, 1, 0, 2, 3, 4]
}

// 编解码能力预检：浏览器原生不支持的格式（如 APE）提前给出明确提示，而非静默无反应
const PROBE_A = document.createElement('audio')
const PROBE_V = document.createElement('video')
const MIME_BY_EXT = {
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wma: 'audio/x-ms-wma',
  mp2: 'audio/mpeg', mp1: 'audio/mpeg', aiff: 'audio/aiff', mka: 'audio/x-matroska',
  ape: 'audio/x-ape', tak: 'audio/x-tak', dsf: 'audio/x-dsf',
  mp4: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', m4v: 'video/mp4', ogv: 'video/ogg', ts: 'video/mp2t',
  flv: 'video/x-flv', wmv: 'video/x-ms-wmv'
}
function guessMime(name, type) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  const ext = m ? m[1].toLowerCase() : ''
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext]
  return type === 'video' ? 'video/mp4' : 'audio/mpeg'
}

class AudioEngine {
  constructor() {
    this.el = new Audio()
    this.el.preload = 'auto'
    this.el.volume = 1
    this.src = null
    this.gain = null
    this.item = null
    this._resumeTo = 0
  }
}

class PlayerEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.analyser = null
    this.eqFilters = []
    this.engines = [new AudioEngine(), new AudioEngine()]
    this.activeIndex = 0
    this.videoEl = null
    this.queue = []
    this.index = -1
    this.current = null
    this.mode = 'music'
    this.playMode = 'loop' // order | loop | random | one
    this.volume = 0.8
    this.muted = false
    this.speed = 1
    this.crossfade = 0
    this.eqBands = [...EQ_PRESETS.flat]
    this.eqPreset = 'flat'
    this.resumeEnabled = true
    this._urlCache = new Map()
    this._crossfading = false
    this._lastSaved = 0
    this._ab = null
    this._chapters = []
    this._sleepTimer = null
    this._listeners = new Map()
    this._wireEngine(this.engines[0])
    this._wireEngine(this.engines[1])
  }

  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set())
    this._listeners.get(evt).add(fn)
    return () => this._listeners.get(evt)?.delete(fn)
  }
  emit(evt, ...args) {
    this._listeners.get(evt)?.forEach((fn) => { try { fn(...args) } catch (e) { console.error(e) } })
  }

  // ---------- Web Audio 初始化 ----------
  async ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : this.volume
    this.master.connect(this.ctx.destination)

    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.analyser.connect(this.master)

    let prev = this.analyser
    for (const f of EQ_FREQS) {
      const biq = this.ctx.createBiquadFilter()
      biq.type = 'peaking'
      biq.frequency.value = f
      biq.Q.value = 1.0
      biq.gain.value = this.eqBands[EQ_FREQS.indexOf(f)] || 0
      biq.connect(prev)
      prev = biq
      this.eqFilters.push(biq)
    }
    this.eqInput = prev // 信号入口

    for (const eng of this.engines) {
      eng.src = this.ctx.createMediaElementSource(eng.el)
      eng.gain = this.ctx.createGain()
      eng.gain.gain.value = 0
      eng.src.connect(eng.gain)
      eng.gain.connect(this.eqInput)
    }
    // 注意：视频元素【不】接入 Web Audio 图。
    // WebView2 下若将 <video> 经 createMediaElementSource 捕获，视频帧会脱离正常合成管线，
    // 表现为「有声音、无画面」（黑屏）。视频音频直接由元素输出即可，频谱/均衡仅作用于音乐引擎。
  }

  _wireEngine(eng) {
    eng.el.addEventListener('timeupdate', () => this._onTime(eng))
    eng.el.addEventListener('ended', () => this._onEnded(eng))
    eng.el.addEventListener('loadedmetadata', () => this._onMeta(eng))
    eng.el.addEventListener('error', () => this._onErr(eng))
  }

  _urlFor(item) {
    if (this._urlCache.has(item.id)) return this._urlCache.get(item.id)
    const url = URL.createObjectURL(item.blob)
    this._urlCache.set(item.id, url)
    return url
  }

  async _setEngineSource(eng, item) {
    const url = this._urlFor(item)
    eng.item = item
    eng.el.src = url
    eng.el.load()
    eng._resumeTo = 0
    if (this.resumeEnabled && item.type === 'music') {
      const p = await getProgress(item.id)
      if (p && p.time > 3 && p.duration > 0 && p.time < p.duration - 3) eng._resumeTo = p.time
    }
  }

  // ---------- 播放控制 ----------
  async playItem(item, { crossfade = false, autoplay = true } = {}) {
    // §12 文件已丢失：blob 缺失或为空，不尝试加载（避免 URL.createObjectURL(null) 崩溃），直接上报
    if (!item || !item.blob || item.blob.size === 0) { this.emit('lost', item); return }
    // 编解码能力预检：浏览器原生不支持的格式（如 APE、部分特殊编码）提前明确提示，避免静默无反应
    const _mime = item.mime || guessMime(item.name, item.type)
    const _isVid = item.type === 'video' || /\.(mp4|mkv|webm|mov|avi|m4v|ogv|ts|flv|wmv)$/i.test(item.name || '')
    const _probe = _isVid ? PROBE_V : PROBE_A
    const _sup = _mime ? _probe.canPlayType(_mime) : 'maybe'
    if (_sup === '') {
      this.emit('error', `「${item.name || '该文件'}」所用格式浏览器无法解码（如 APE 或特殊编码）。请转码为 MP3 或 FLAC 后再用绿角犀播放。`, item)
      return
    }
    await this.ensureCtx()
    if (item.type === 'video') {
    this.mode = 'video'
    this.emit('mode', 'video')
    this.engines.forEach((e) => { try { e.el.pause(); e.gain.gain.value = 0 } catch {} })
    return this._playVideo(item, autoplay)
    }
    this.mode = 'music'
    this.emit('mode', 'music')
    if (this.videoEl && !this.videoEl.paused) { try { this.videoEl.pause() } catch {} }

    let targetIdx, useCross = false
    if (autoplay && crossfade && this.crossfade > 0 && this.current && this._isPlaying(this.engines[this.activeIndex])) {
      useCross = true
      targetIdx = 1 - this.activeIndex
    } else {
      targetIdx = this.activeIndex
    }
    const eng = this.engines[targetIdx]
    await this._setEngineSource(eng, item)
    eng.el.playbackRate = this.speed
    if (autoplay) { try { await eng.el.play() } catch (e) { /* 自动播放策略 */ } }

    if (useCross) {
      const other = this.engines[this.activeIndex]
      this._crossfading = true
      const dur = Math.max(0.5, this.crossfade)
      const now = this.ctx.currentTime
      other.gain.gain.cancelScheduledValues(now)
      other.gain.gain.setValueAtTime(other.gain.gain.value, now)
      other.gain.gain.linearRampToValueAtTime(0, now + dur)
      eng.gain.gain.cancelScheduledValues(now)
      eng.gain.gain.setValueAtTime(eng.gain.gain.value, now)
      eng.gain.gain.linearRampToValueAtTime(1, now + dur)
      setTimeout(() => {
        try { other.el.pause(); other.gain.gain.value = 0 } catch {}
        this._crossfading = false
      }, dur * 1000 + 250)
      this.activeIndex = targetIdx
    } else {
      const other = this.engines[1 - this.activeIndex]
      try { other.el.pause(); other.gain.gain.value = 0 } catch {}
      eng.gain.gain.value = autoplay ? 1 : 0
    }
    const switching = !this.current || item.id !== this.current.id
    this.current = item
    if (switching) this._chapters = []
    this.emit('trackchanged', item)
    this.emit('chapters', this._chapters)
    if (autoplay) this.emit('play')
  }

  async _playVideo(item, autoplay = true) {
    if (!this.videoEl) { this.emit('error', '视频播放器未就绪'); return }
    this._videoErrShown = false
    const switching = !this.current || item.id !== this.current.id
    const url = this._urlFor(item)
    this.current = item
    this.videoEl.src = url
    this.videoEl.load()
    this.videoEl.playbackRate = this.speed
    this._videoResumeTo = 0
    if (this.resumeEnabled) {
      const p = await getProgress(item.id)
      if (p && p.time > 3 && p.duration > 0 && p.time < p.duration - 3) this._videoResumeTo = p.time
    }
    if (autoplay) { try { await this.videoEl.play() } catch {} }
    this._kickVideoLayer() // 修复 WebView2 黑屏有声音：重建视频合成层
    if (switching) this._chapters = []
    this.emit('trackchanged', item)
    this.emit('chapters', this._chapters)
    if (autoplay) this.emit('play')
  }

  play() {
    if (!this.current) return
    if (this.mode === 'video' && this.videoEl) { this.videoEl.play().catch(() => {}); this.emit('play'); return }
    const eng = this.engines[this.activeIndex]
    if (this._isPlaying(eng)) return
    eng.el.play().catch(() => {})
    eng.gain.gain.value = 1
    this.emit('play')
  }
  pause() {
    if (this.mode === 'video' && this.videoEl) { this.videoEl.pause(); this.emit('pause'); return }
    const eng = this.engines[this.activeIndex]
    eng.el.pause()
    this.emit('pause')
  }
  toggle() { this.isPlaying() ? this.pause() : this.play() }

  _isPlaying(eng) {
    return eng && eng.el && !eng.el.paused && !eng.el.ended && eng.el.currentTime > 0
  }
  isPlaying() {
    return this.mode === 'video'
      ? (this.videoEl && !this.videoEl.paused)
      : this._isPlaying(this.engines[this.activeIndex])
  }

  seek(t) {
    if (this.mode === 'video' && this.videoEl) { this.videoEl.currentTime = t; return }
    this.engines[this.activeIndex].el.currentTime = t
  }
  getTime() {
    if (this.mode === 'video' && this.videoEl) return this.videoEl.currentTime
    return this.engines[this.activeIndex].el.currentTime || 0
  }
  getDuration() {
    if (this.mode === 'video' && this.videoEl) return this.videoEl.duration || 0
    return this.engines[this.activeIndex].el.duration || 0
  }
  getAnalyser() { return this.analyser }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v))
    this.muted = false
    if (this.master) this.master.gain.value = this.volume
    if (this.videoEl) { this.videoEl.volume = this.volume; this.videoEl.muted = false }
    this.emit('volume', this.volume)
  }
  setMute(b) {
    this.muted = b
    if (this.master) this.master.gain.value = b ? 0 : this.volume
    if (this.videoEl) this.videoEl.muted = b
    this.emit('mute', b)
  }
  setSpeed(s) {
    this.speed = s
    this.engines[this.activeIndex].el.playbackRate = s
    if (this.videoEl) this.videoEl.playbackRate = s
    this.emit('speed', s)
  }
  setCrossfade(sec) { this.crossfade = sec }
  setEQ(bands) {
    this.eqBands = [...bands]
    this.eqFilters.forEach((f, i) => { f.gain.value = bands[i] || 0 })
    this.emit('eq', bands)
  }
  applyEQPreset(name) {
    const bands = EQ_PRESETS[name] || EQ_PRESETS.flat
    this.eqPreset = name
    this.setEQ(bands)
    return bands
  }

  // ---------- 队列 / 模式 ----------
  setQueue(items, currentId = null) {
    this.queue = items
    this.index = currentId ? items.findIndex((i) => i.id === currentId) : (items.length ? 0 : -1)
    this.emit('queue:changed', this.queue)
  }
  setPlayMode(m) { this.playMode = m; this.emit('playmode', m) }
  _nextIndex(userTriggered) {
    const len = this.queue.length
    if (!len) return null
    if (this.playMode === 'random') return Math.floor(Math.random() * len)
    if (this.playMode === 'one' && !userTriggered) return this.index
    let i = this.index + 1
    if (i >= len) {
      if (this.playMode === 'loop') i = 0
      else return null
    }
    return i
  }
  next(userTriggered = false) {
    const ni = this._nextIndex(userTriggered)
    if (ni == null) { this.pause(); return }
    this.index = ni
    this.playItem(this.queue[ni], { crossfade: this.isPlaying() })
  }
  prev() {
    if (this.getTime() > 3) { this.seek(0); return }
    let i = this.index - 1
    if (i < 0) i = this.queue.length - 1
    this.index = i
    if (this.queue[i]) this.playItem(this.queue[i], { crossfade: false })
  }
  _advance(auto) {
    if (!this.queue.length) return
    if (this._sleepAfterTrack && auto) { this._sleepAfterTrack = false; this.pause(); this.emit('ended'); return }
    if (this.playMode === 'one' && auto) { this.seek(0); this.play(); return }
    const ni = this._nextIndex(auto)
    if (ni == null) { this.pause(); this.emit('ended'); return }
    this.index = ni
    this.playItem(this.queue[ni], { crossfade: auto })
  }

  // ---------- 视频专用 ----------
  setVideoElement(el) {
    this.videoEl = el
    // 监听必须无条件挂载：初始化时 ctx 为 null（ensureCtx 是异步的，这里不能靠它同步拿到 ctx），
    // 否则视频进度条不动 / 不续播 / 解码失败无提示 全部失效
    el.addEventListener('timeupdate', () => this._onVideoTime())
    el.addEventListener('ended', () => this._onVideoEnded())
    // WebView2/Chromium 合成 bug：video 在 display:none 子树中创建、切到视频页显示后，
    // 视频帧可能不提交（黑屏有声音）。播放真正开始时强制「隐藏→重排→显示」重建合成层。
    el.addEventListener('playing', () => this._kickVideoLayer())
    el.addEventListener('loadedmetadata', () => {
      if (this._videoResumeTo) { try { el.currentTime = this._videoResumeTo } catch {} ; this._videoResumeTo = 0 }
      this.emit('loaded', this.current); this._saveProgressThrottled()
    })
    el.addEventListener('error', () => {
      if (this._videoErrShown) return
      this._videoErrShown = true
      const it = this.current
      this.emit('error', `「${it?.name || '该视频'}」解码失败：很可能是 H.265/HEVC 等浏览器不支持的编码（MP4 容器但非 H.264）。请用 HandBrake / 格式工厂转码为 H.264 的 MP4，或等待绿角犀内置转码。`, it)
    })
    el.volume = this.volume
    el.muted = this.muted
  }

  _onVideoTime() {
    if (this._ab && this._ab.b > 0 && this.videoEl.currentTime >= this._ab.b) this.videoEl.currentTime = this._ab.a
    this._saveProgressThrottled()
    this.emit('time', { time: this.videoEl.currentTime, duration: this.videoEl.duration || 0 })
  }
  // 强制重建视频合成层（修复 WebView2 黑屏有声音）。display:none→同步重排→显示，
  // 让 Chromium 重新为该 <video> 分配可显示的视频图层。
  _kickVideoLayer() {
    const v = this.videoEl
    if (!v) return
    v.style.display = 'none'
    void v.offsetWidth // 强制同步重排
    requestAnimationFrame(() => { v.style.display = '' })
    // 通知 C# 宿主强制重绘（WebView2 黑屏二次保险；纯浏览器环境无 webview 对象，静默忽略）
    try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'videoKick' })) } catch {}
  }
  _onVideoEnded() { this._advance(true) }
  setAB(a, b) { this._ab = { a, b } }
  clearAB() { this._ab = null }
  async loadSubtitle(file) {
    if (!this.videoEl) return
    const text = await file.text()
    const vtt = /\.vtt$/i.test(file.name) ? text : srtToVtt(text)
    const blob = new Blob([vtt], { type: 'text/vtt' })
    const url = URL.createObjectURL(blob)
    // 清除旧外挂轨
    for (const tr of this.videoEl.textTracks) if (tr.label === 'external') tr.mode = 'disabled'
    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.label = file.name ? file.name.replace(/\.[^.]+$/, '') : '外挂字幕'
    track.srclang = 'zh'
    track.src = url
    track.default = true
    this.videoEl.appendChild(track)
    // 等待加载后显示
    track.addEventListener('load', () => { track.mode = 'showing' })
    setTimeout(() => { try { track.mode = 'showing' } catch {} }, 300)
  }
  togglePiP() {
    if (!this.videoEl) return
    if (document.pictureInPictureElement) document.exitPictureInPicture()
    else if (document.pictureInPictureEnabled) this.videoEl.requestPictureInPicture().catch(() => {})
  }

  // ---------- 章节（§10 章节跳转） ----------
  setChapters(list) {
    this._chapters = Array.isArray(list) ? list.slice() : []
    this.emit('chapters', this._chapters)
  }
  getChapters() { return this._chapters }
  async loadChapters(file) {
    if (!file) return
    const text = await file.text()
    const list = parseChapters(text)
    if (!list.length) { this.emit('error', '章节文件未解析到有效节点'); return }
    this.setChapters(list)
  }

  // ---------- 睡眠定时 ----------
  setSleep(minutes) {
    if (this._sleepTimer) { clearTimeout(this._sleepTimer); this._sleepTimer = null }
    if (!minutes) { this._sleepAfterTrack = false; return }
    if (minutes === 'track') { this._sleepAfterTrack = true; return }
    this._sleepAfterTrack = false
    const ms = minutes * 60 * 1000
    this._sleepTimer = setTimeout(() => this._sleepFade(), ms)
  }
  _sleepFade() {
    if (this.master) {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.linearRampToValueAtTime(0.0001, now + 3)
    }
    setTimeout(() => { this.pause(); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume }, 3200)
  }

  // ---------- 事件处理 ----------
  _onTime(eng) {
    if (eng !== this.engines[this.activeIndex]) return // 仅活动引擎驱动 UI
    this._saveProgressThrottled()
    const dur = eng.el.duration || 0
    const rem = dur - eng.el.currentTime
    if (this.crossfade > 0 && !this._crossfading && this._nextIndex(true) != null && rem > 0 && rem <= this.crossfade) {
      this._advance(true)
    }
    this.emit('time', { time: eng.el.currentTime, duration: dur })
  }
  _onEnded(eng) {
    if (eng !== this.engines[this.activeIndex]) return
    this._advance(true)
  }
  _onMeta(eng) {
    if (eng.item && eng._resumeTo) { eng.el.currentTime = eng._resumeTo; eng._resumeTo = 0 }
    this.emit('loaded', eng.item)
    this._saveProgressThrottled()
  }
  _onErr(eng) {
    this.emit('error', '音频解码失败，该格式可能不被支持', eng && eng.item)
  }
  _saveProgressThrottled() {
    const now = Date.now()
    if (now - this._lastSaved < 4000) return
    this._lastSaved = now
    const item = this.current
    if (item) saveProgress(item.id, this.getTime(), this.getDuration())
  }
  async flushProgress() {
    if (this.current) saveProgress(this.current.id, this.getTime(), this.getDuration())
  }
}

export const player = new PlayerEngine()
// 同步设置
getSettings().then((s) => {
  player.volume = s.defaultVolume
  player.resumeEnabled = s.resumeEnabled
  player.crossfade = s.crossfade
  player.eqBands = s.eqBands
  player.eqPreset = s.eqPreset
  if (player.master) player.master.gain.value = player.muted ? 0 : player.volume
  if (player.eqFilters.length) player.setEQ(s.eqBands)
})
