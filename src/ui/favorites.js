// favorites.js — 收藏页（复用 library.js selMode：长按进入多选 + 全选/批量取消收藏/删除/加入歌单）
import { h, openModal, toast } from './dom.js'
import { getFavorites, batchDeleteMedia, toggleFavorite, getPlaylists, savePlaylist } from '../store.js'
import { songRow } from './library.js'
import { player } from '../player.js'

export function buildFavorites(app, only) {
  const el = h('div', { class: 'page' })
  let selMode = false
  const selected = new Set()

  function scrollToPlaying() {
    const curId = player.current?.id
    if (!curId) return
    const row = el.querySelector(`[data-id="${curId}"]`)
    if (row) requestAnimationFrame(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }
  function updatePlayingMark(item) {
    el.querySelectorAll('.playing').forEach(n => n.classList.remove('playing'))
    if (item) {
      const row = el.querySelector(`[data-id="${item.id}"]`)
      if (row) { row.classList.add('playing'); scrollToPlaying() }
    }
  }

  // ---------- 多选 / 批量操作 ----------
  const selbar = h('div', { class: 'selbar', style: { display: 'none' } },
    h('button', { class: 'ghost-btn', onclick: () => toggleAll() }, '全选'),
    h('span', { class: 'selcount' }, '已选 0'),
    h('button', { class: 'ghost-btn', onclick: () => batchUnfav() }, '💔 取消收藏'),
    h('button', { class: 'ghost-btn', onclick: () => openAddToPlaylist() }, '＋ 加入歌单'),
    h('button', { class: 'ghost-btn danger', onclick: () => batchDelete() }, '🗑 删除'),
    h('button', { class: 'ghost-btn', onclick: () => exitSelect() }, '取消')
  )

  function enterSelectMode(firstItem) {
    selMode = true
    selected.clear()
    if (firstItem) selected.add(firstItem.id)
    el.classList.add('selecting')
    refresh()
  }
  function exitSelect() {
    selMode = false
    selected.clear()
    el.classList.remove('selecting')
    refresh()
  }
  function updateSelBar() {
    const n = selected.size
    selbar.style.display = selMode ? 'flex' : 'none'
    selbar.querySelector('.selcount').textContent = `已选 ${n}`
    const topCount = el.querySelector('.lib-sel-count')
    if (topCount) topCount.textContent = `已选择 ${n} 项`
    const btns = selbar.querySelectorAll('button')
    btns[2].disabled = n === 0  // 取消收藏
    btns[3].disabled = n === 0  // 加入歌单
    btns[4].disabled = n === 0  // 删除
    for (let i = 2; i <= 4; i++) btns[i].style.opacity = n === 0 ? '0.4' : '1'
    const total = el.querySelectorAll('.sr-list .sr-row').length
    btns[0].textContent = (total && n >= total) ? '取消全选' : '全选'
  }
  function toggleAll() {
    const rows = [...el.querySelectorAll('.sr-list .sr-row')]
    const total = rows.length
    if (selected.size >= total) { selected.clear(); rows.forEach(r => r.classList.remove('sel')) }
    else { for (const r of rows) { const id = r.dataset.id; if (id) selected.add(id); r.classList.add('sel') } }
    updateSelBar()
  }
  async function batchUnfav() {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`取消 ${ids.length} 项收藏？`)) return
    for (const id of ids) await toggleFavorite(id)
    toast(`已取消 ${ids.length} 项收藏`)
    exitSelect()
  }
  async function openAddToPlaylist() {
    const ids = [...selected]
    if (!ids.length) return
    const pls = await getPlaylists()
    const body = h('div', { class: 'mb' })
    body.appendChild(h('button', { class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' }, onclick: async () => {
      const name = prompt('新歌单名称：', '歌单 ' + new Date().toLocaleDateString())
      if (!name) return
      await savePlaylist({ id: 'pl-' + Date.now(), name, ids: [...ids], at: Date.now() })
      app.toast('已新建歌单并加入')
      close(); exitSelect()
    } }, '＋ 新建歌单'))
    pls.forEach(pl => body.appendChild(h('button', { class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' }, onclick: async () => {
      const merged = [...new Set([...pl.ids, ...ids])]
      await savePlaylist({ ...pl, ids: merged })
      app.toast(`已加入「${pl.name}」`)
      close(); exitSelect()
    } }, `${pl.name}（${pl.ids.length}）`)))
    const modal = h('div', { class: 'modal' },
      h('div', { class: 'mh' }, h('h3', {}, '加入歌单'), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')), body)
    const close = openModal(modal)
  }
  async function batchDelete() {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`从媒体库彻底移除 ${ids.length} 个文件？（会同时取消收藏）`)) return
    await batchDeleteMedia(ids)
    toast(`已移除 ${ids.length} 个文件`, 'ok')
    exitSelect()
  }

  async function refresh() {
    el.innerHTML = ''
    const list = (await getFavorites()).filter((m) => !only || m.type === only)
    app.activeSource = list

    // 顶部：selMode →「取消 + 已选择 N 项」；正常 → Tab + 工具条
    if (selMode) {
      el.appendChild(h('div', { class: 'lib-toolbar lib-toolbar-sel' },
        h('button', { class: 'ghost-btn', style: { padding: '6px 14px' }, onclick: () => exitSelect() }, '取消'),
        h('span', { class: 'lib-sel-count' }, `已选择 ${selected.size} 项`)
      ))
    } else {
      el.appendChild(h('div', { class: 'sr-page-header' },
        h('div', { class: 'sr-tabs' },
          h('span', { class: 'sr-tab active' }, '单曲'),
          h('span', { class: 'sr-tab' }, '歌手'),
          h('span', { class: 'sr-tab' }, '专辑'),
          h('span', { class: 'sr-tab' }, '视频')),
        h('div', { class: 'sr-toolbar' },
          h('span', { class: 'sr-tool-play' }, '▶'),
          h('span', { class: 'sr-tool-count' }, `${list.length} 首歌曲`),
          h('span', { class: 'sr-tool-sep' }, ''),
          h('span', { class: 'sr-tool-ico', title: '搜索' }, '🔍'),
          h('span', { class: 'sr-tool-ico', title: '排序' }, '⇅'),
          h('span', { class: 'sr-tool-ico', title: '多选（长按歌曲也行）', style: { cursor: 'pointer' }, onclick: () => { if (list.length) enterSelectMode(null) } }, '☑'))))
    }

    if (!list.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '⭐'), h('div', {}, '还没有收藏，点击歌曲行上的 ♥ 收藏')))
      el.appendChild(selbar)
      return
    }

    const listBox = h('div', { class: 'sr-list' + (selMode ? ' selecting' : '') })
    list.forEach((item) => {
      if (selMode) {
        listBox.appendChild(songRow(item, app, {
          selectable: true,
          selected: selected.has(item.id),
          onToggle: (it, node) => {
            if (selected.has(it.id)) { selected.delete(it.id); node.classList.remove('sel') }
            else { selected.add(it.id); node.classList.add('sel') }
            updateSelBar()
          }
        }))
      } else {
        listBox.appendChild(songRow(item, app, {
          onLongPress: (it) => { enterSelectMode(it) }
        }))
      }
    })
    el.appendChild(listBox)
    el.appendChild(selbar)
    updateSelBar()
    scrollToPlaying()
  }

  const offStore = app.onStore('favorites:changed', refresh)
  const offTrack = player.on('trackchanged', (item) => updatePlayingMark(item))
  el._cleanup = () => { offStore(); offTrack() }
  refresh()
  return { el, refresh, cleanup: () => { offStore(); offTrack() } }
}
