// cast.js — DLNA 投屏桥接（仅 Windows 原生客户端 WebView2 可用；纯浏览器 PWA 不可用）
// 流程：扫描设备(C# SSDP) → 把当前播放 Blob 经 localhost 上传到 LocalServer 拿局域网 URL
//       → 通知 C# 对选定设备发 SetAVTransportURI+Play（电视拉流播放）。
import { player } from './player.js'

const state = {
  host: false,
  devices: [],
  scanning: false,
  casting: false,
  deviceId: null,
  deviceName: '',
  status: ''
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
  return !!(window.chrome && window.chrome.webview && typeof window.chrome.webview.postMessage === 'function')
}

function post(msg) {
  try { window.chrome.webview.postMessage(JSON.stringify(msg)) } catch (e) { console.error('cast post', e) }
}

function initHost() {
  const wv = window.chrome && window.chrome.webview
  if (!wv || typeof wv.addEventListener !== 'function') return
  state.host = true
  wv.addEventListener('message', (e) => {
    let msg
    try {
      const d = typeof e.data === 'string' ? e.data : (e.data && e.data.data) || ''
      msg = JSON.parse(d)
    } catch { return }
    if (!msg || !msg.type) return
    if (msg.type === 'cast:devices') {
      state.devices = Array.isArray(msg.devices) ? msg.devices : []
      state.scanning = false
      emit('devices', state.devices)
    } else if (msg.type === 'cast:status') {
      state.status = msg.state
      state.deviceId = msg.deviceId || state.deviceId
      state.casting = msg.state === 'playing' || msg.state === 'paused' || msg.state === 'seeked'
      emit('status', { state: msg.state, deviceId: state.deviceId })
    }
  })
}

function scan() {
  if (!state.host) return
  state.scanning = true
  state.devices = []
  emit('devices', state.devices)
  post({ type: 'cast:scan' })
}

// 把当前播放的媒体投到指定设备：先上传 Blob 拿局域网 URL，再通知 C# 播放
async function castTo(deviceId) {
  if (!state.host) return
  const item = player.current
  if (!item || !item.blob) { emit('error', '当前没有可投屏的媒体'); return }
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
  state.deviceId = deviceId
  state.deviceName = (state.devices.find((d) => d.id === deviceId) || {}).name || '设备'
  post({ type: 'cast:play', deviceId, uri: data.url })
  emit('status', { state: 'playing', deviceId, name: state.deviceName })
}

function stop() {
  if (!state.host || !state.deviceId) return
  post({ type: 'cast:stop', deviceId: state.deviceId })
  emit('status', { state: 'stopped', deviceId: state.deviceId })
}

function pause() {
  if (!state.host || !state.deviceId) return
  post({ type: 'cast:pause', deviceId: state.deviceId })
}

export const cast = {
  state,
  isHost,
  on,
  scan,
  castTo,
  stop,
  pause
}

initHost()
