// playlists.js — 歌单页（保存当前队列 / 详情 / 拖拽重排 / 删除）
import { h, openModal, toast } from './dom.js'
import { getPlaylists, savePlaylist, deletePlaylist, getMedia } from '../store.js'
import { player } from '../player.js'

export function buildPlaylists(app) {
  const el = h('div', { class: 'page' })
  async function refresh() {
    el.innerHTML = ''
    const pls = await getPlaylists()
    el.appendChild(h('div', { class: 'section-title' }, `歌单 · ${pls.length} 个`))
    const bar = h('div', { style: { marginBottom: '14px' } },
      h('button', { class: 'ghost-btn', onclick: saveCurrent }, '＋ 保存当前队列为歌单'))
    el.appendChild(bar)
    if (!pls.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '📃'), h('div', {}, '把当前播放列表存成歌单，随时回放')))
      return
    }
    const grid = h('div', { class: 'grid' })
    pls.forEach((pl) => grid.appendChild(playlistCard(pl, app)))
    el.appendChild(grid)
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

function playlistCard(pl, app) {
  const node = h('div', { class: 'card' },
    h('div', { class: 'thumb' }, '📃'),
    h('div', { class: 'meta' },
      h('div', { class: 'name' }, pl.name),
      h('div', { class: 'sub' }, `${pl.ids.length} 首`)),
    h('div', { class: 'fav', title: '删除', onclick: async (e) => { e.stopPropagation(); if (confirm('删除该歌单？')) { await deletePlaylist(pl.id); app.toast('已删除') } } }, '🗑'))
  node.addEventListener('click', () => openDetail(pl, app))
  return node
}

async function openDetail(pl, app) {
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
      const row = h('div', {
        class: 'q-item pl-row' + (m._missing ? ' missing' : ''),
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
      if (!m._missing) row.addEventListener('click', () => { const real = items.filter((x) => !x._missing); app.playList(real, m) })
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
    const real = items.filter((x) => !x._missing)
    if (!real.length) { app.toast('歌单为空或文件已丢失', 'err'); return }
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
