// onlinesearch.js — 在线曲库：搜索在线歌曲，30 秒试听预览。
// 「🎧 加入播放」把在线结果接入主播放引擎与底栏，连续播放、上一/下一/循环全部生效。
// 仅播放合规授权的 30 秒预览片段，不下载整曲。
import { h, toast, openModal, formatTime } from './dom.js'
import { player } from '../player.js'

const ITUNES_SEARCH = 'https://itunes.apple.com/search'
const _preview = new Audio() // 单曲快速试听用的独立 Audio（不占用主播放器）
let _added = []              // 已加入主播放器的在线结果（player 队列）
let _previewUid = null

function _uid(r) { return r.previewUrl || (r.trackId + '|' + (r.artistName || '')) }

// 把 iTunes 结果转成主播放器可用的「在线曲目」（无 blob，用远程预览 URL）
function _toItem(r) {
  return {
    id: 'ol:' + _uid(r),
    type: 'music',
    mime: 'audio/mp4',
    title: r.trackName || '在线曲目',
    name: r.trackName || '在线曲目',
    artist: r.artistName || '',
    album: r.collectionName || '',
    cover: r.artworkUrl100 || '',
    duration: r.trackTimeMillis ? r.trackTimeMillis / 1000 : 0,
    _online: true,
    _onlineUrl: r.previewUrl
  }
}

function _stopPreview() {
  try { _preview.pause(); _preview.src = '' } catch {}
  _previewUid = null
}

// 单曲 30 秒快速试听（不接管主播放器）
function _playSingle(r) {
  _stopPreview()
  if (!r.previewUrl) { toast('该歌曲无预览片段', 'info'); return }
  _previewUid = _uid(r)
  _preview.src = r.previewUrl
  _preview.play().catch(() => toast('试听播放失败', 'err'))
}

// 搜索并打开在线曲库面板。q 预填搜索词。
export function openOnlineSearch(app, q = '') {
  if (!navigator.onLine) { app.toast('当前离线，无法搜索在线曲库', 'info'); return }
  const input = h('input', { type: 'text', placeholder: '搜索在线歌曲…（如：周杰伦 晴天）',
    style: inputStyle(), value: q || '', onkeydown: (e) => { if (e.key === 'Enter') go() } })
  const goBtn = h('button', { class: 'cta', onclick: go, style: { padding: '8px 16px' } }, '搜索')
  const stat = h('div', { style: { color: 'var(--text-3)', fontSize: '12px', marginTop: '6px' } },
    '30 秒合规预览 · 不下载整曲 · 🎧 加入后底栏接管连续播放')
  const list = h('div', { class: 'dlist', style: { marginTop: '10px', maxHeight: '42vh', overflowY: 'auto' } })
  const bar = h('div', { style: { display: 'flex', gap: '8px' } }, input, goBtn)

  // 接管操作条：显示已加入主播放器的数量 + 清空
  const countSpan = h('span', { style: { color: 'var(--text-3)', fontSize: '12px', flex: '1' } }, '')
  const clearBtn = h('button', { class: 'qx', onclick: clearTakeover }, '清空在线队列')
  const takeoverBar = h('div', { style: { marginTop: '12px', padding: '10px', background: '#161a22', borderRadius: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
    h('span', {}, '🎧 播放器接管 '), countSpan, clearBtn)

  async function go() {
    const term = input.value.trim()
    if (!term) { toast('请输入搜索关键词', 'info'); return }
    _stopPreview()
    list.innerHTML = ''
    list.appendChild(h('div', { class: 'empty', style: { padding: '18px 0' } }, '🔍 搜索中…'))
    try {
      const res = await fetch(`${ITUNES_SEARCH}?term=${encodeURIComponent(term)}&media=music&entity=song&limit=18`)
      if (!res.ok) throw new Error('bad status')
      const j = await res.json()
      const arr = Array.isArray(j.results) ? j.results : []
      list.innerHTML = ''
      if (!arr.length) { list.appendChild(h('div', { class: 'empty' }, '没有找到相关歌曲，试试换关键词')); return }
      arr.forEach((r) => list.appendChild(resultRow(r)))
      refreshControls()
    } catch {
      list.innerHTML = ''
      list.appendChild(h('div', { class: 'empty' }, '搜索失败：无法连接在线曲库'))
    }
  }

  function resultRow(r) {
    const uid = _uid(r)
    const row = h('div', { class: 'q-item', dataset: { uid } },
      h('div', { class: 'qi' }, r.artworkUrl100
        ? (h('div', { class: 'thumb', style: { width: '34px', height: '34px', borderRadius: '6px', overflow: 'hidden' } },
            h('img', { src: r.artworkUrl100, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } })))
        : '🎵'),
      h('div', { class: 'qt' },
        h('div', { class: 'n' }, r.trackName || '未知'),
        h('div', { class: 's' }, [r.artistName, r.collectionName, r.trackTimeMillis ? formatTime(Math.round(r.trackTimeMillis / 1000)) : ''].filter(Boolean).join(' · '))),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
        h('button', { class: 'qx', title: '加入主播放器连续播放', style: { fontSize: '12px', padding: '6px 8px' }, onclick: () => addTakeover(r) }, '🎧'),
        h('button', { class: 'qx', title: '快速试听 30 秒', style: { fontSize: '12px', padding: '6px 8px' }, onclick: () => { _playSingle(r); refreshRows() } }, '▶')))
    return row
  }

  // 🎧 加入主播放器并从该首开始连续播放
  function addTakeover(r) {
    if (!r.previewUrl) { toast('该结果无预览片段，无法加入播放', 'info'); return }
    const item = _toItem(r)
    if (!_added.some((x) => x.id === item.id)) _added.push(item)
    try { player.playOnlineList([..._added], item.id); app.toast('已接管播放器，底栏开始连续播放', 'info') }
    catch (e) { app.toast('接管播放失败：' + (e && e.message), 'err') }
  }

  // 清空在线队列并退出接管（若当前正播在线曲目则暂停）
  function clearTakeover() {
    _added = []
    player.setQueue([])
    if (player.current && player.current._online) player.pause()
    refreshControls()
    app.toast('已退出在线播放', 'info')
  }

  // 同步结果行的「已加入/正在播放」态
  function refreshRows() {
    list.querySelectorAll('.q-item').forEach((row) => {
      const uid = row.dataset.uid
      const inQueue = _added.some((x) => x.id === ('ol:' + uid))
      const playing = player.current && player.current.id === ('ol:' + uid) && player.isPlaying()
      row.classList.toggle('in-queue', inQueue)
      row.classList.toggle('playing', playing)
    })
  }

  function refreshControls() {
    countSpan.textContent = `已接管主播放器 · ${_added.length} 首（底栏上一/下一/循环可用）`
    refreshRows()
  }

  // 主播放器状态变化时同步行高亮
  const unPlaying = player.on('play', refreshRows)
  const unPause = player.on('pause', refreshRows)
  const unChanged = player.on('trackchanged', refreshRows)
  const unQueue = player.on('queue:changed', refreshRows)

  const body = h('div', { class: 'mb' }, bar, stat, list, takeoverBar)
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, '🌐 在线曲库'), h('button', { class: 'icon-btn', onclick: () => { _stopPreview(); close() } }, '✕')), body)
  const close = openModal(modal, { onClose: () => { _stopPreview(); unPlaying(); unPause(); unChanged(); unQueue() } })
  refreshControls()
  setTimeout(() => input.focus(), 0)
}

function inputStyle() {
  return { flex: '1', minWidth: '0', background: '#1b212b', color: '#e6e6e6', border: '1px solid #2c3440', borderRadius: '8px', padding: '8px 10px' }
}