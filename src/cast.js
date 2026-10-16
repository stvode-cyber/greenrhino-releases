// cast.js — DLNA 投屏桥接（Windows WebView2 + Android RhinoBridge 双宿主）
// 流程：扫描设备 → 把当前播放媒体变成局域网可访问的 http(s):// URL
//       → 通知原生层对选定设备发 SetAVTransportURI+Play（电视拉流播放）。
import { player } from './player.js'

const state = {
  host: false,          // 'windows' | 'android' | false
  devices: [],
  scanning: false,
  casting: false,
  deviceId: null,
  deviceName: '',
  status: '',           // playing / paused / stopped / UNKNOWN
  position: '',         // HH:MM:SS  当前位置
  duration: ''          // HH:MM:SS  总时长
}

const listeners = new Map()
function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set())
  listeners.get(evt).add(fn)
  return () => listeners.get(evt)?.delete(fn)
}
function emit(evt, payload) {
  listeners.get(evt)?.forEach((fn) => { try { fn(payload) } catch (e) { console.error(e) } })
}

function isHost() {
  // Windows WebView2
  if (window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function') {
    return 'windows'
  }
  // Android RhinoBridge（必须 castScan 存在才算就绪，不是单纯 RhinoBridge 存在）
  if (window.RhinoBridge && typeof window.RhinoBridge.castScan === 'function') {
    return 'android'
  }
  return false
}

function post(msg) {
  try { window.chrome.webview.postMessage(JSON.stringify(msg)) } catch (e) { console.error('cast post', e) }
}

function initHost() {
  const host = isHost()
  if (!host) return
  state.host = host
  console.log('📺 cast.js initHost:', host)

  if (host === 'windows') {
    // Windows WebView2：监听 chrome.webview.message
    const wv = window.chrome.webview
    wv.addEventListener('message', (e) => {
      let msg
      try {
        const d = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || ''
        msg = JSON.parse(d)
      } catch { return }
      handleMsg(msg)
    })
  } else if (host === 'android') {
    // Android：RhinoBridge 用 evaluateJavascript 把结果推到 window.__castCb
    window.__castCb = (msg) => handleMsg(msg)
  }
}

function handleMsg(msg) {
  if (!msg || !msg.type) return
  if (msg.type === 'cast:devices') {
    state.devices = Array.isArray(msg.devices) ? msg.devices : []
    state.scanning = false
    emit('devices', state.devices)
  } else if (msg.type === 'cast:mirror') {
    emit('mirror', msg.ok === false ? (msg.msg || '唤起系统无线显示失败') : '')
  } else if (msg.type === 'cast:status') {
    // TV 推送的真实 AVTransport 状态 + 进度
    state.status = msg.state
    state.deviceId = msg.deviceId || state.deviceId
    state.casting = ['PLAYING', 'PAUSED_PLAYBACK', 'TRANSITIONING', 'RECORDING'].includes(msg.state) ||
                    ['playing', 'paused', 'seeked'].includes(msg.state)
    state.position = msg.position || state.position || ''
    state.duration = msg.duration || state.duration || ''
    emit('status', { state: msg.state, deviceId: state.deviceId, position: state.position, duration: state.duration })
  }
}

function scan() {
  if (!state.host) return
  state.scanning = true
  state.devices = []
  emit('devices', state.devices)
  if (state.host === 'windows') {
    post({ type: 'cast:scan' })
  } else if (state.host === 'android') {
    try { window.RhinoBridge.castScan() } catch (e) { console.error('android castScan', e) }
  }
}

// 把当前播放的媒体投到指定设备。
// Windows: Blob → POST LocalServer /api/cast-upload → 返回本机局域网 URL → 投电视
// Android: content:// 由 Kotlin 端 MediaHttpServer 自动代理成 http://（DLNA 电视可访问）
async function castTo(deviceId) {
  if (!state.host) return
  const item = player.current
  if (!item) { emit('error', '当前没有可投屏的媒体'); return }

  let httpUri
  if (state.host === 'windows') {
    // Windows：走 LocalServer 上传 Blob
    if (!item.blob) { emit('error', 'Windows 投屏需要 Blob，当前媒体不可用'); return }
    const name = item.name || 'media'
    emit('status', { state: 'uploading' })
    let data
    try {
      const resp = await fetch('/api/cast-upload?name=' + encodeURIComponent(name), { method: 'POST', body: item.blob })
      if (!resp.ok) throw new Error('upload ' + resp.status)
      data = await resp.json()
    } catch (e) {
      emit('error', '投屏上传失败：' + e.message)
      return
    }
    if (!data || !data.url) { emit('error', '投屏上传未返回可用地址'); return }
    httpUri = data.url
  } else if (state.host === 'android') {
    // Android：直接传 item.uri（content:// 或 http:// 都行，Kotlin 内部 MediaHttpServer 自动转）
    const uri = item.uri || ''
    if (!uri) { emit('error', 'Android 媒体无可用 URI'); return }
    httpUri = uri
  }

  state.deviceId = deviceId
  state.deviceName = (state.devices.find((d) => d.id === deviceId) || {}).name || '设备'

  if (state.host === 'windows') {
    post({ type: 'cast:play', deviceId, uri: httpUri })
  } else if (state.host === 'android') {
    try { window.RhinoBridge.castPlay(deviceId, httpUri) } catch (e) { emit('error', 'castPlay failed: ' + e.message); return }
  }
  emit('status', { state: 'playing', deviceId, name: state.deviceName })
}

function stop() {
  if (!state.host || !state.deviceId) return
  if (state.host === 'windows') {
    post({ type: 'cast:stop', deviceId: state.deviceId })
  } else if (state.host === 'android') {
    try { window.RhinoBridge.castStop(state.deviceId) } catch (e) {}
  }
  emit('status', { state: 'stopped', deviceId: state.deviceId })
}

function pause() {
  if (!state.host || !state.deviceId) return
  if (state.host === 'windows') {
    post({ type: 'cast:pause', deviceId: state.deviceId })
  } else if (state.host === 'android') {
    try { window.RhinoBridge.castPause(state.deviceId) } catch (e) {}
  }
}

// 唤起系统无线显示（Miracast）：整屏镜像到电视
// Windows: Win+K 连接面板（Chrome.webview.postMessage cast:mirror）
// Android: 反射调 Settings.ACTION_WIFI_DISPLAY_SETTINGS 唤起系统面板
function mirror() {
  if (!state.host) return
  if (state.host === 'windows') {
    post({ type: 'cast:mirror' })
  } else if (state.host === 'android') {
    try { window.RhinoBridge.castMirror() } catch (e) { emit('error', 'castMirror failed: ' + e.message) }
  }
}

export const cast = {
  state,
  isHost,
  on,
  scan,
  castTo,
  stop,
  pause,
  mirror
}

initHost()
