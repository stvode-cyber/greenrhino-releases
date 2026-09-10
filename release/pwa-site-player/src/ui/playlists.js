// playlists.js — 歌单页（智能列表 + 保存当前队列 / 详情 / 拖拽重排 / 删除）
import { h, openModal, toast } from './dom.js'
import { getPlaylists, savePlaylist, deletePlaylist, getMedia, getAllMedia } from '../store.js'
import { player } from '../player.js'
import { mediaCard } from './library.js'

export function buildPlaylists(app, only) {
  const el = h('div', { class: 'page' })
  async function refresh() {
    el.innerHTML = ''
    const pls = await getPlaylists()
    el.appendChild(h('div', { class: 'section-title' }, '歌单'))
    const bar = h('div', { style: { marginBottom: '14px' } },
      h('button', { class: 'ghost-btn', onclick: saveCurrent }, '＋ 保存当前队列为歌单'))
    el.appendChild(bar)

    // 智能列表：来自媒体库的动态聚合（弹窗角色按类型过滤）
    const all = (await getAllMedia()).filter((m) => !only || m.type === only)
    const recent = [...all].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 12)
    const top = all.filter((m) => (m.playCount || 0) > 0).sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 12)
    const fresh = all.filter((m) => m.lastPlayedAt).sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)).slice(0, 12)
    el.appendChild(smartSection('🆕 最近添加', recent, all))
    el.appendChild(smartSection('🔥 播放最多', top, all, (m) => `${m.playCount || 0} 次`))
    el.appendChild(smartSection('⏱ 刚播过', fresh, all))
    // 补充智能歌单：收藏精选 / 许久未听 / 随机精选
    const favs = all.filter((m) => m.favorite).slice(0, 24)
    if (favs.length) el.appendChild(smartSection('⭐ 收藏精选', favs, all))
    const stale = all.filter((m) => (m.playCount || 0) > 0 && m.lastPlayedAt && (Date.now() - m.lastPlayedAt) > 30 * 864e5)
      .sort((a, b) => (a.lastPlayedAt || 0) - (b.lastPlayedAt || 0)).slice(0, 12)
    if (stale.length) el.appendChild(smartSection('⏳ 许久未听', stale, all, (m) => (m.lastPlayedAt ? timeAgo(m.lastPlayedAt) : '')))
    const pool = all.filter((m) => m.duration || m.addedAt)
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
    if (pool.length) el.appendChild(smartSection('🎲 随机精选', pool.slice(0, 12), all))

    el.appendChild(h('div', { class: 'section-title', style: { marginTop: '18px' } }, `我的歌单 · ${pls.length} 个`))
    if (!pls.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '📃'), h('div', {}, '把当前播放列表存成歌单，随时回放')))
      return
    }
    const grid = h('div', { class: 'grid' })
    pls.forEach((pl) => grid.appendChild(playlistCard(pl, app, only)))
    el.appendChild(grid)
  }

  function smartSection(title, items, all, sub) {
    const wrap = h('div', { style: { marginBottom: '10px' } })
    wrap.appendChild(h('div', { class: 'section-title' }, `${title} · ${items.length}`))
    if (!items.length) return wrap
    const grid = h('div', { class: 'grid' })
    items.forEach((m) => {
      const card = mediaCard(m, app)
      if (sub) card.appendChild(h('div', { class: 'recent-tip', style: { top: 'auto', bottom: '4px' } }, sub(m)))
      grid.appendChild(card)
    })
    wrap.appendChild(grid)
    return wrap
  }

  async function saveCurrent() {
    const name = prompt('歌单名称：', '我的歌单 ' + (new Date().toLocaleDateString()))
    if (!name) return
    const ids = player.queue.map((i) => i.id)
    await savePlaylist({ id: 'pl-' + Date.now(), name, ids, at: Date.now() })
    toast('歌单已保存'); refresh()
  }
  const off = app.onStore('playlists:changed', refresh)
  el._cleanup = off
  refresh()
  return { el, refresh }
}

function timeAgo(t) {
  if (!t) return ''
  const sec = Math.floor((Date.now() - t) / 1000)
  if (sec < 60) return '刚刚'
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  const d = Math.floor(sec / 86400)
  return d < 60 ? `${d} 天前` : `${Math.floor(d / 30)} 个月前`
}

function playlistCard(pl, app, only) {
  const node = h('div', { class: 'card' },
    h('div', { class: 'thumb' }, '📃'),
    h('div', { class: 'meta' },
      h('div', { class: 'name' }, pl.name),
      h('div', { class: 'sub' }, `${pl.ids.length} 首`)),
    h('div', { class: 'fav', title: '删除', onclick: async (e) => { e.stopPropagation(); if (confirm('删除该歌单？')) { await deletePlaylist(pl.id); app.toast('已删除') } } }, '🗑'))
  node.addEventListener('click', () => openDetail(pl, app, only))
  return node
}

async function openDetail(pl, app, only) {
  let ids = [...pl.ids]
  const items = []
  for (const id of ids) { const m = await getMedia(id); items.push(m || { id, type: 'music', _missing: true }) }
  let dragId = null

  const list = h('div', { class: 'dlist' })
  function render() {
    list.innerHTML = ''
    if (!ids.length) { list.appendChild(h('div', { class: 'empty' }, '歌单为空')); return }
    ids.forEach((id) => {
      const m = items.find((x) => x.id === id) || { id, type: 'music', _missing: true }
      // 弹窗角色（音乐窗）里其他类型的项灰显、不可播放（避免跨类型顶到别的窗口页面）
      const match = !only || m._missing || m.type === only
      const row = h('div', {
        class: 'q-item pl-row' + (m._missing ? ' missing' : '') + (match ? '' : ' pl-dim'),
        draggable: 'true',
        ondragstart: (e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging') },
        ondragend: (e) => { dragId = null; e.currentTarget.classList.remove('dragging') },
        ondragover: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('dragover') },
        ondragleave: (e) => { e.currentTarget.classList.remove('dragover') },
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); reorder(id) }
      },
        h('div', { class: 'qi' }, m._missing ? '📄' : (m.type === 'video' ? '🎬' : '🎵')),
        h('div', { class: 'qt' },
          h('div', { class: 'n' }, m.title || m.name || '未知文件'),
          h('div', { class: 's' }, m._missing ? '文件已丢失' : (m.artist || m.album || ''))),
        h('div', { class: 'qx', title: '从歌单移除', onclick: async (e) => {
          e.stopPropagation()
          ids = ids.filter((x) => x !== id)
          await persist(); render(); refreshHeader()
        } }, '✕'))
      if (!m._missing && match) row.addEventListener('click', () => { const real = items.filter((x) => !x._missing && (!only || x.type === only)); app.playList(real, m) })
      list.appendChild(row)
    })
  }
  function reorder(toId) {
    if (dragId == null || dragId === toId) return
    const fi = ids.indexOf(dragId)
    const ti = ids.indexOf(toId)
    if (fi < 0 || ti < 0) return
    const [m] = ids.splice(fi, 1)
    ids.splice(ti, 0, m)
    persist().then(render)
  }
  async function persist() {
    await savePlaylist({ id: pl.id, name: pl.name, ids, at: pl.at })
  }

  function playAll() {
    const real = items.filter((x) => !x._missing && (!only || x.type === only))
    if (!real.length) { app.toast(only ? `歌单里没有${only === 'video' ? '视频' : '音乐'}可播` : '歌单为空或文件已丢失', 'err'); return }
    app.playList(real, real[0])
  }
  function refreshHeader() { titleEl.textContent = `${pl.name} · ${ids.length} 首` }

  render()
  const titleEl = h('span', {}, `${pl.name} · ${ids.length} 首`)
  const body = h('div', { class: 'mb' },
    h('div', { class: 'row', style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' } },
      h('button', { class: 'ghost-btn', onclick: playAll }, '▶ 播放全部'),
      h('div', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '12px' } }, '拖拽 ≡ 可重排顺序')),
    list)
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, titleEl), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')),
    body)
  const close = openModal(modal)
}
