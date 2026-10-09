// player.js — 统一播放引擎（音频 Web Audio 图 + 视频原生）
import { getProgress, saveProgress, getSettings, recordPlayback } from './store.js'
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
  electronic: [4, 3, 0, 0, -2, 1, 0, 2, 3, 4],
  jazz:     [2, 1, 0, 1, 1, 1, 0, 1, 2, 2],
  acoustic:  [2, 1, 0, 1, 2, 2, 1, 0, -1, -1],
  hiphop:   [4, 3, 2, 0, 1, 2, 1, 0, -1, -1],
  treble:   [-2, -1, 0, 0, 1, 2, 3, 4, 5, 5],
  loudness: [3, 2, 2, 2, 2, 2, 2, 2, 3, 3]
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

// 通用原生兜底工具：把库内/拖入的 Blob 视频交给 C# 原生播放器时用到
function _extOf(item) {
  const m = /\.([a-z0-9]+)$/i.exec((item && item.name) || '')
  return m ? m[1].toLowerCase() : 'mp4'
}
function _bufToB64(buf) {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
  return btoa(binary)
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
    // 音乐/视频各自独立的播放模式：音乐默认列表循环，视频默认顺序播完即停（不自动重复）
    this.playModes = { music: 'loop', video: 'order' }
    this.playMode = this.playModes.music
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
    this._countedId = null // 当前已计入播放次数的曲目（每真实播放一次记一次）
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
    eng.el.addEventListener('play', () => this._notePlayStart(eng.item))
  }

  // 真实开始播放时（含自动/手动/续播）记录一次播放次数；同一曲目一次播放只记一次
  _notePlayStart(item) {
    const id = (item && item.id) || (this.current && this.current.id)
    if (!id) return
    if (this._countedId === id) return
    this._countedId = id
    recordPlayback(id).catch(() => {})
  }

  _urlFor(item) {
    // 在线预览（接管主播放器后的在线曲目）：直接用远程 URL，不经过 blob 对象 URL
    if (item && item._onlineUrl) return item._onlineUrl
    if (this._urlCache.has(item.id)) return this._urlCache.get(item.id)
    const url = item.uri || URL.createObjectURL(item.blob)
    console.error('[gr] _urlFor id=' + item?.id?.slice(0,10) + ' url=' + (url?.slice(0,80) || 'null') + ' isContent=' + (url?.startsWith?.('content://') || false))
    this._urlCache.set(item.id, url)
    return url
  }

  async _setEngineSource(eng, item) {
    const url = this._urlFor(item)
    eng.item = item
    // 在线预览需开启 CORS 匿名模式，MediaElementSource 才能正常馈入 Web Audio 图（否则静音）
    eng.el.crossOrigin = (item && item._online) ? 'anonymous' : ''
    eng._resumeTo = 0
    this._countedId = null // 换源后重新武装计数，让下次真实播放再记一次
    // 续播点先于换源读取：loadedmetadata 异步回调可能早于 IndexedDB 查询返回，
    // 先算好 _resumeTo 再换源，由 _onMeta 统一消费，避免错过续播。
    // 在线预览不做续播（无本地进度），也避免为在线 id 写入进度污染「最近播放」
    if (item && item._online) {
      eng.el.src = url
      eng.el.load()
      return
    }
    if (this.resumeEnabled && item.type === 'music') {
      const p = await getProgress(item.id)
      if (p && p.time > 3 && p.duration > 0 && p.time < p.duration - 3) eng._resumeTo = p.time
    }
    eng.el.src = url
    eng.el.load()
  }

  // ---------- 播放控制 ----------
  async playItem(item, { crossfade = false, autoplay = true } = {}) {
    // §12 文件已丢失：blob 和 uri 都没有才报丢失（Android MediaStore 自动导入的 item 用 uri 不用 blob）
    const hasSrc = item?.uri || item?.blob
    if (!item?._online && (!item || !hasSrc)) { this.emit('lost', item); return }
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
    this._syncPlayMode() // 视频用自己的播放模式（默认顺序，不自动重复）
    this.engines.forEach((e) => { try { e.el.pause(); e.gain.gain.value = 0 } catch {} })
    return this._playVideo(item, autoplay)
    }
    this.mode = 'music'
    this.emit('mode', 'music')
    this._syncPlayMode() // 音乐用自己的播放模式（默认列表循环）
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
    // 同一视频循环重播且已转码：直接复用转码 URL 从头播。
    // 否则会重新把 src 设回不兼容的 HEVC blob，再次触发解码失败→转码（8s 测试片每轮循环都卡顿重载）。
    if (!switching && this._transcodedUrl) {
      this.current = item
      this._videoResumeTo = 0
      this.videoEl.src = this._transcodedUrl
      this.videoEl.load()
      this.videoEl.playbackRate = this.speed
      if (autoplay) { try { await this.videoEl.play() } catch {} }
      this._kickVideoLayer()
      this.emit('trackchanged', item)
      if (autoplay) this.emit('play')
      return
    }
    this._transcodeStarted = false
    this._transcodedUrl = null
    const url = this._urlFor(item)
    this.current = item
    this._countedId = null // 新视频源：武装计数
    // 续播点先于换源读取：loadedmetadata 是异步回调，若先 set src 再查 IndexedDB，
    // 可能已错过该事件导致续播失效（独立视频窗口尤为明显）。先算好 _videoResumeTo，
    // 由 setVideoElement 的 loadedmetadata 统一消费；换源转码时该值仍保留，转码产物同样续播。
    this._videoResumeTo = 0
    if (this.resumeEnabled) {
      const p = await getProgress(item.id)
      if (p && p.time > 3 && p.duration > 0 && p.time < p.duration - 3) this._videoResumeTo = p.time
    }
    this.videoEl.src = url
    this.videoEl.load()
    this.videoEl.playbackRate = this.speed
    if (autoplay) { try { await this.videoEl.play() } catch {} }
    this._kickVideoLayer() // 修复 WebView2 黑屏有声音：重建视频合成层
    if (switching) this._chapters = []
    this.emit('trackchanged', item)
    this.emit('chapters', this._chapters)
    if (autoplay) this.emit('play')
  }

  // C# 内置 ffmpeg 把不兼容编码（HEVC/10bit）转成 H.264 后，回传一个可由 web <video> 直接播放的 URL。
  // 转码产物是 H.264，WebView2 原生可解码出图，因此直接换源播放即可，
  // 绕开「原生 MediaElement 被 WebView2 HWND 遮挡（airspace）」导致的有声无画问题。
  _playTranscodedUrl(url) {
    const v = this.videoEl
    if (!v) return
    this._transcodedUrl = url
    // _videoResumeTo 由 loadedmetadata 处理器统一消费做续播，这里只换源
    v.src = url
    v.load()
    v.playbackRate = this.speed
    // 换源后多次兜底触发播放：首次可能因加载未完成/自动播放策略被拒而静默失败
    const tryPlay = () => { if (v.paused && !v.ended) v.play().catch(() => {}) }
    v.play().catch(tryPlay)
    setTimeout(tryPlay, 300)
    setTimeout(tryPlay, 1000)
    this._kickVideoLayer() // 新源同样重建一次合成层，防 WebView2 黑屏
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
  // 在线结果接管主播放器：把【在线预览】列表设为当前队列并从指定项开始连续播放。
  // 复用主播放引擎与底栏（trackchanged 驱动界面），上一/下一/播放模式/循环全部生效。
  playOnlineList(items, currentId = null) {
    if (!items || !items.length) return
    // 若当前正有本地媒体在播，先静音清理旧引擎（playItem 非交叉淡入分支会处理另一引擎，这里兜底暂停全部）
    this.engines.forEach((e) => { try { e.el.pause(); e.gain.gain.value = 0 } catch {} })
    try { if (this.videoEl && !this.videoEl.paused) this.videoEl.pause() } catch {}
    this.queue = items
    this.index = currentId ? items.findIndex((i) => i.id === currentId) : 0
    if (this.index < 0) this.index = 0
    this.emit('queue:changed', this.queue)
    this.playItem(items[this.index], { autoplay: true })
    return this.queue
  }
  setPlayMode(m, target) {
    // target 指定作用于哪种媒体（music/video），默认作用于当前正在播放的媒体类型
    const t = (target === 'music' || target === 'video') ? target : this.mode
    this.playModes[t] = m
    if (t === this.mode) this.playMode = m
    this.emit('playmode', m)
  }
  setPlayModes(modes) { // 启动恢复：合并保存的音乐/视频各自播放模式
    if (modes && typeof modes === 'object') {
      if (modes.music) this.playModes.music = modes.music
      if (modes.video) this.playModes.video = modes.video
    }
    this.playMode = this.playModes[this.mode] || this.playMode
    this.emit('playmode', this.playMode)
  }
  _syncPlayMode() { // 切换到某类媒体时，生效该类自己保存的播放模式
    const m = this.playModes[this.mode] || (this.mode === 'video' ? 'order' : 'loop')
    if (this.playMode !== m) { this.playMode = m; this.emit('playmode', m) }
  }
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
    el.addEventListener('play', () => this._notePlayStart(this.current))
    // WebView2/Chromium 合成 bug：video 在 display:none 子树中创建、切到视频页显示后，
    // 视频帧可能不提交（黑屏有声音）。黑屏 kick 在换源（_playVideo/_playTranscodedUrl）与
    // 视频页 show() 时各做一次即可；【绝不能】在这里反复 _kickVideoLayer()——
    // display:none→显示 会打断视频再次触发 playing，形成无限 playing 风暴，视频永远卡在开头。
    el.addEventListener('playing', () => { this._startBlackWatchdog() })
    el.addEventListener('loadedmetadata', () => {
      if (this._videoResumeTo) { try { el.currentTime = this._videoResumeTo } catch {} ; this._videoResumeTo = 0 }
      this.emit('loaded', this.current); this._saveProgressThrottled()
      // HEVC/不兼容编码快速判定：metadata 已加载但视频轨解不出（videoWidth=0）。
      // 此时 audio 轨可解（有声音、currentTime 推进），Chromium 不触发 error，只能靠轮询。
      // 这里立即复查一次，省掉 2.5s 的 playing 看门狗等待——否则双击 HEVC 视频会
      // 「声音已在播、画面/页面要缓一会才出来」。
      const cur = this.current
      if (cur && cur.type === 'video' && el.videoWidth === 0 && !this._transcodedUrl && !this._transcodeStarted && !el.error) {
        setTimeout(() => {
          const v = this.videoEl
          if (!v || v !== el || !this.current || this.current.type !== 'video') return
          if (el.videoWidth === 0 && !this._transcodedUrl && !this._transcodeStarted && !el.error) {
            console.log('[gr] loadedmetadata but videoWidth=0 -> transcode (HEVC?)')
            this._startTranscode(this.current, this._videoDiag())
          }
        }, 500)
      }
    })
    el.addEventListener('error', () => {
      console.log('[gr] video error fired, code=' + (this.videoEl && this.videoEl.error ? this.videoEl.error.code : '?'))
      if (this._videoErrShown) return
      this._videoErrShown = true
      // 直接报错（如 MEDIA_ERR_SRC_NOT_SUPPORTED）多半是 HEVC/10bit 编码：交给内置转码
      this._startTranscode(this.current, this._videoDiag())
    })
    el.volume = this.volume
    el.muted = this.muted
  }

  _onVideoTime() {
    if (this._ab && this._ab.b > 0 && isFinite(this._ab.a) && this.videoEl.currentTime >= this._ab.b) { this.videoEl.currentTime = this._ab.a || 0 }
    this._saveProgressThrottled()
    this.emit('time', { time: this.videoEl.currentTime, duration: this.videoEl.duration || 0 })
  }
  // 强制重建视频合成层（修复 WebView2 黑屏有声音）。display:none→同步重排→显示，
  // 让 Chromium 重新为该 <video> 分配可显示的视频图层。
  _kickVideoLayer() {
    const v = this.videoEl
    if (!v) return
    // 同一视频源只 kick 一次：反复 display 切换会打断播放、再次触发 playing（风暴），
    // 视频永远卡在开头附近不动（症状：currentTime 恒定、paused=false）。换源后 currentSrc 变化可再 kick。
    const src = v.currentSrc || v.src || ''
    if (this._kickSrc === src) return
    this._kickSrc = src
    // 3 秒内只允许重建一次合成层，从源头掐断循环（双保险）。
    const now = Date.now()
    if (this._kickTs && now - this._kickTs < 3000) return
    this._kickTs = now
    v.style.display = 'none'
    void v.offsetWidth // 强制同步重排
    requestAnimationFrame(() => { v.style.display = '' })
    // 通知 C# 宿主强制重绘（WebView2 黑屏二次保险；纯浏览器环境无 webview 对象，静默忽略）
    try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'videoKick' })) } catch {}
  }
  // 视频黑屏根因诊断：把视频元素的关键状态一次性收集，经 webview 消息回传 C# 写日志。
  // 用于区分「overlay 未提交」（videoWidth=0 但无 error、音频推进）与「解码失败」（v.error 有值）。
  _videoDiag() {
    const v = this.videoEl
    if (!v) return null
    let canPlay = 'maybe'
    try { canPlay = (this.current && this.current.mime) ? (PROBE_V.canPlayType(this.current.mime) || 'maybe') : 'maybe' } catch {}
    return {
      readyState: v.readyState,            // 0..4（HAVE_NOTHING..HAVE_ENOUGH_DATA）
      networkState: v.networkState,        // 0..3
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      currentTime: +(v.currentTime || 0).toFixed(2),
      duration: isNaN(v.duration) ? 0 : +v.duration.toFixed(2),
      paused: v.paused,
      errorCode: v.error ? v.error.code : 0,   // 1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED
      canPlay
    }
  }
  // 第三道防线：黑屏有声音兜底。L1(视频不接 WebAudio 图) + L2(kick 重建合成层) + L3(C# 宿主微抖重绘)
  // 都没兜住时：播放 2.5s 仍确认「解码正常但画面未渲染」→ 交给 C# 原生 MediaElement 兜底播放。
  // 根因分流：
  //   1) 编码不支持（H.265/HEVC/10bit）：视频轨静默解不出 → videoWidth=0 且音频推进 → 原生同样救不了，直接提示转码。
  //   2) 解码正常但画面黑（overlay 未提交 / 软件合成异常 / 远程虚拟显示器）：videoWidth>0 但采样帧全黑 → 原生兜底。
  // 仅 reload 一次（sessionStorage 守卫），避免编码不支持导致的无限刷新循环。
  _startBlackWatchdog() {
    const v = this.videoEl
    if (!v) return
    // 同一曲目只启动一次看门狗：playing 可能因各类原因重复触发，避免无限重启定时器、
    // 无限输出日志、反复判定。换曲（item.id 变化）后再重新武装。
    const id = this.current && this.current.id
    if (this._watchItemId === id) return
    this._watchItemId = id
    clearTimeout(this._blackTimer)
    this._blackTimer = setTimeout(() => {
      console.log('[gr] watchdog check: t=' + (v ? v.currentTime : '?') + ' vw=' + (v ? v.videoWidth : '?') + ' vh=' + (v ? v.videoHeight : '?') + ' paused=' + (v ? v.paused : '?') + ' err=' + (v && v.error ? v.error.code : '0'))
      try {
        if (!v || v.paused) return
        if ((v.currentTime || 0) < 0.5) return   // 还没真正开始播放，不判定
        const item = this.current
        const diag = this._videoDiag()
        const audioPlaying = (v.currentTime || 0) > 0.5
        const noVideoSize = v.videoWidth === 0 && v.videoHeight === 0
        // 1) 编码类失败：明确 error，或「视频尺寸为 0 且音频已在推进」
        const decodeFailed = !!v.error || (noVideoSize && audioPlaying)
        if (decodeFailed) {
          console.log('[gr] decodeFailed -> transcode')
          // 编码不支持（HEVC/10bit）：交给内置转码（C# ffmpeg 转 H.264 后原生播放）
          this._startTranscode(item, diag)
          return
        }
        // 2) 解码正常但画面未渲染：采样当前帧近乎纯黑 → 判定黑屏（软件渲染/虚拟显示器下 videoWidth 往往正常）。
        //    有尺寸且帧非黑 → 画面正常，不干预。
        const sampledBlack = this._sampleVideoIsBlack(v)
        if (!noVideoSize && !sampledBlack) return
        // 已切到转码后的 H.264（web 内播放）时不走原生兜底：
        // 原生 MediaElement 会被 WebView2 HWND 遮挡（airspace），接管反而会暂停掉可见的画面。
        if (this._transcodedUrl) return
        const path = item && item.localPath
        if (path) {
          // 本地文件（双击/外部打开）：通知 C# 用原生 MediaElement 播放，绕开 WebView2 overlay
          try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'videoNoFrame', path, diag })) } catch {}
          // 给 C# 1.5s 接管；收到 nativeShown → 取消 reload；收到 noNative 或超时 → reload 一次自救
          this._nativeTaken = false
          this._blackWait = setTimeout(() => {
            if (this._nativeTaken) return
            if (!sessionStorage.getItem('__grBlackReload')) {
              sessionStorage.setItem('__grBlackReload', '1')
              location.reload()
            }
          }, 1500)
        } else {
          // 库内/拖入的 Blob 视频（无本地路径）：把字节传给 C#，由原生播放器接管
          this._startBlobFallback(item)
        }
      } catch {}
    }, 2500)
  }
  // 把当前视频帧画到离屏 canvas 采样亮度，全黑则判定画面未渲染。
  // 覆盖「解码正常(videoWidth>0)但合成层黑屏」的场景（软件渲染 / 远程虚拟显示器常见）。
  _sampleVideoIsBlack(v) {
    try {
      if (!v || v.videoWidth === 0 || v.readyState < 2) return false
      const c = document.createElement('canvas')
      c.width = 48; c.height = 27
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(v, 0, 0, 48, 27)
      const d = ctx.getImageData(0, 0, 48, 27).data
      let sum = 0, n = d.length / 4
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
      return (sum / n) < 6   // 平均 RGB 亮度和 < 6/255 视为纯黑
    } catch { return false }
  }
  // 通用原生兜底：库内/拖入的 Blob 视频没有本地路径，先把字节分片传给 C#，
  // 由其写入临时文件并用原生 MediaElement 播放，覆盖「无 localPath」的视频源。
  async _startBlobFallback(item, opts = {}) {
    if (!item || !item.blob) { this._scheduleBlackReload(15000); return }
    if (!window.chrome || !window.chrome.webview) { this._scheduleBlackReload(15000); return }
    this._nativeTaken = false
    try {
      console.log('[gr] 原生兜底：无本地路径，开始向 C# 传输视频字节')
      await this._sendBlobToNative(item)
      window.chrome.webview.postMessage(JSON.stringify({ type: 'videoBlobEnd', id: item.id, ext: _extOf(item), transcode: !!opts.transcode }))
    } catch (e) { console.error('[gr] 原生兜底传输失败', e) }
    // C# 接管后回 nativeShown → 取消 reload；超时（转码 300s / 直播 120s）仍未接管 → reload 一次自救
    this._blackWait = setTimeout(() => {
      if (this._nativeTaken) return
      if (!sessionStorage.getItem('__grBlackReload')) { sessionStorage.setItem('__grBlackReload', '1'); location.reload() }
    }, opts.transcode ? 300000 : 120000)
  }
  async _sendBlobToNative(item) {
    const blob = item.blob
    const ext = _extOf(item)
    const CHUNK = 256 * 1024
    const total = Math.max(1, Math.ceil(blob.size / CHUNK))
    for (let i = 0; i < total; i++) {
      const slice = blob.slice(i * CHUNK, (i + 1) * CHUNK)
      const buf = await slice.arrayBuffer()
      const b64 = _bufToB64(buf)
      window.chrome.webview.postMessage(JSON.stringify({ type: 'videoBlobChunk', id: item.id, ext, index: i, total, data: b64 }))
      if (i % 16 === 0) await new Promise((r) => setTimeout(r, 0)) // 让出事件循环，避免卡死 UI
    }
  }
  _scheduleBlackReload(ms) {
    if (sessionStorage.getItem('__grBlackReload')) return
    sessionStorage.setItem('__grBlackReload', '1')
    setTimeout(() => location.reload(), ms)
  }
  // 编码不支持（HEVC/10bit）自动转码：WebView2 与原生 MediaElement 都解不了该视频轨，
  // 交给 C# 用内置 ffmpeg 转成 H.264 再原生播放。本地文件直接给路径；库内 Blob 走分片传输。
  _startTranscode(item, diag) {
    if (!item || this._transcodeStarted) return
    this._transcodeStarted = true
    // 立即暂停 web 端黑屏视频：停止双声轨，也停止可能存在的 playing 事件风暴
    try { if (this.videoEl && !this.videoEl.paused) this.videoEl.pause() } catch {}
    const path = item.localPath
    const name = item.name || '该视频'
    this.emit('transcode', `检测到不兼容编码，正在转码「${name}」为 H.264，请稍候…`)
    if (path) {
      try { window.chrome?.webview?.postMessage(JSON.stringify({ type: 'videoTranscode', path, diag })) } catch {}
      this._nativeTaken = false
      this._blackWait = setTimeout(() => {
        if (this._nativeTaken) return
        if (!sessionStorage.getItem('__grBlackReload')) { sessionStorage.setItem('__grBlackReload', '1'); location.reload() }
      }, 300000)
    } else if (item.blob) {
      this._startBlobFallback(item, { transcode: true })
    } else {
      this.emit('error', `「${name}」视频轨解码失败（很可能是 H.265/HEVC 编码），且无法定位源文件转码。请改用 H.264 编码的 MP4。`, item)
    }
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
    if (!item || item._online) return // 在线预览不写进度，避免污染「最近播放」
    saveProgress(item.id, this.getTime(), this.getDuration())
  }
  async flushProgress() {
    if (this.current && !this.current._online) saveProgress(this.current.id, this.getTime(), this.getDuration())
  }
}

export const player = new PlayerEngine()

// 原生视频兜底桥接：接收 C# 回传（WebView2 视频黑屏时由 C# 用 MediaElement 直接播放本地文件）
if (window.chrome && window.chrome.webview && typeof window.chrome.webview.addEventListener === 'function') {
  window.chrome.webview.addEventListener('message', (e) => {
    let msg
    try { const d = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || ''; msg = JSON.parse(d) } catch { return }
    if (!msg || !msg.type) return
    if (msg.type === 'nativeShown') { player._nativeTaken = true; clearTimeout(player._blackWait) }
    else if (msg.type === 'noNative') {
      player._nativeTaken = true; clearTimeout(player._blackWait)
      if (!sessionStorage.getItem('__grBlackReload')) { sessionStorage.setItem('__grBlackReload', '1'); location.reload() }
    } else if (msg.type === 'nativePauseWeb') { try { player.pause() } catch {} }
    else if (msg.type === 'transcodeProgress') { player.emit('transcodeProgress', { pct: msg.pct || 0 }) }
    else if (msg.type === 'transcodeReady') {
      // C# ffmpeg 转码过程中、首段已产出即回传 URL（边转边播）。
      // 立刻换源播放已转好的分片，让大文件不必等全量 100%；进度提示由
      // videoPlayer.js 的 transcode 面板展示，直至收到 transcodeDone 才收起。
      player._nativeTaken = true; clearTimeout(player._blackWait)
      if (msg.url) player._playTranscodedUrl(msg.url)
    }
    else if (msg.type === 'transcodeDone') {
      // 转码真正完成（100%），收起「正在转码」进度提示
      player.emit('transcodeDone', { ok: !msg || msg.ok !== false })
    }
    else if (msg.type === 'transcodeFailed') {
      player._nativeTaken = true; clearTimeout(player._blackWait)
      player.emit('transcodeDone', { ok: false })
      player.emit('error', msg.reason || '视频转码失败，请改用 H.264 编码的 MP4。')
    }
    else if (msg.type === 'clipResult') { player.emit('clipResult', msg) }
  })
}

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
