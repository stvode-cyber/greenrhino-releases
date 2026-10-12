// playlists.js — 歌单页（智能列表 + 保存当前队列 / 详情 / 拖拽重排 / 删除）
import { h, openModal, toast } from './dom.js'
import { getPlaylists, savePlaylist, deletePlaylist, getMedia, getAllMedia, batchDeleteMedia } from '../store.js'
import { player } from '../player.js'
import { mediaCard } from './library.js'

export function buildPlaylists(app, only) {
  const el = h('div', { class: 'page' })
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
  async function refresh() {
    el.innerHTML = ''
    const pls = await getPlaylists()
    el.appendChild(h('div', { class: 'section-title' }, '歌单'))
    const bar = h('div', { style: { marginBottom: '14px' } },
      h('button', { class: 'ghost-btn', onclick: saveCurrent }, '＋ 保存当前队列为歌单'))
    el.appendChild(bar)

    // 智能列表：来自媒体库的动态聚合（弹窗角色按类型过滤）
    const all = (await getAllMedia()).filter((m) => !only || m.type === only)
    // 🔶 队列上下文：歌单页点歌 → 队列是全部音乐（因为各种智能列表混杂，没有单一上下文）
    app.activeSource = all
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
    // 🔶 初始化滚动到正在播放的
    scrollToPlaying()
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
  const offStore = app.onStore('playlists:changed', refresh)
  const offTrack = player.on('trackchanged', (item) => updatePlayingMark(item))
  el._cleanup = () => { offStore(); offTrack() }
  refresh()
  return { el, refresh, cleanup: () => { offStore(); offTrack() } }
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
    h('div', { class: 'fav', title: '删除', onclick: async (e) => { e.stopPropagation(); if (confirm('删除？')) { await deletePlaylist(pl.id); app.toast('已删除') } } }, '🗑'))
  node.addEventListener('click', () => openDetail(pl, app, only))
  return node
}

async function openDetail(pl, app, only) {
  let ids = [...pl.ids]
  const items = []
  for (const id of ids) { const m = await getMedia(id); items.push(m || { id, type: 'music', _missing: true }) }
  let dragId = null
  let selMode = false
  const selected = new Set()

  const list = h('div', { class: 'dlist' })
  const selbar = h('div', { class: 'selbar', style: { display: 'none' } },
    h('button', { class: 'ghost-btn', onclick: () => toggleAll() }, '全选'),
    h('span', { class: 'selcount' }, '已选 0'),
    h('button', { class: 'ghost-btn', onclick: () => batchRemoveFromPl() }, '从歌单移除'),
    h('button', { class: 'ghost-btn', onclick: () => openAddToOtherPlaylist() }, '＋ 加入其他歌单'),
    h('button', { class: 'ghost-btn danger', onclick: () => batchDelete() }, '🗑 删除'),
    h('button', { class: 'ghost-btn', onclick: () => exitSelect() }, '取消')
  )

  function enterSelectMode(firstId) {
    selMode = true
    selected.clear()
    if (firstId) selected.add(firstId)
    render()
    refreshTopBar()
    updateSelBar()
  }
  function exitSelect() {
    selMode = false
    selected.clear()
    render()
    refreshTopBar()
    updateSelBar()
  }
  function updateSelBar() {
    const n = selected.size
    selbar.style.display = selMode ? 'flex' : 'none'
    selbar.querySelector('.selcount').textContent = `已选 ${n}`
    const topCount = body.querySelector('.lib-sel-count')
    if (topCount) topCount.textContent = `已选择 ${n} 项`
    const btns = selbar.querySelectorAll('button')
    for (let i = 2; i <= 4; i++) { btns[i].disabled = n === 0; btns[i].style.opacity = n === 0 ? '0.4' : '1' }
    const total = list.querySelectorAll('.pl-row').length
    btns[0].textContent = (total && n >= total) ? '取消全选' : '全选'
  }
  function toggleAll() {
    const rows = [...list.querySelectorAll('.pl-row')]
    const total = rows.length
    if (selected.size >= total) { selected.clear(); rows.forEach(r => r.classList.remove('sel')) }
    else { for (const r of rows) { const id = r.dataset.id; if (id) selected.add(id); r.classList.add('sel') } }
    updateSelBar()
  }
  async function batchRemoveFromPl() {
    const removeIds = [...selected]
    if (!removeIds.length) return
    if (!confirm(`从歌单「${pl.name}」中移除 ${removeIds.length} 项？（文件仍保留在媒体库）`)) return
    ids = ids.filter((x) => !removeIds.includes(x))
    await persist(); render(); refreshHeader(); exitSelect()
    toast(`已从歌单移除 ${removeIds.length} 项`)
  }
  async function openAddToOtherPlaylist() {
    const addIds = [...selected]
    if (!addIds.length) return
    const pls = await getPlaylists()
    const body2 = h('div', { class: 'mb' })
    body2.appendChild(h('button', { class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' }, onclick: async () => {
      const name = prompt('新歌单名称：', '歌单 ' + new Date().toLocaleDateString())
      if (!name) return
      await savePlaylist({ id: 'pl-' + Date.now(), name, ids: [...addIds], at: Date.now() })
      app.toast('已新建歌单并加入'); close2()
    } }, '＋ 新建歌单'))
    pls.filter(x => x.id !== pl.id).forEach(op => body2.appendChild(h('button', { class: 'ghost-btn', style: { width: '100%', marginBottom: '8px' }, onclick: async () => {
      const merged = [...new Set([...op.ids, ...addIds])]
      await savePlaylist({ ...op, ids: merged })
      app.toast(`已加入「${op.name}」`); close2()
    } }, `${op.name}（${op.ids.length}）`)))
    const modal2 = h('div', { class: 'modal' },
      h('div', { class: 'mh' }, h('h3', {}, '加入其他歌单'), h('button', { class: 'icon-btn', onclick: () => close2() }, '✕')), body2)
    const close2 = openModal(modal2)
  }
  async function batchDelete() {
    const ids2 = [...selected]
    if (!ids2.length) return
    if (!confirm(`从媒体库彻底删除 ${ids2.length} 个文件？（会同时从歌单移除）`)) return
    await batchDeleteMedia(ids2)
    ids = ids.filter((x) => !ids2.includes(x))
    await persist(); render(); refreshHeader(); exitSelect()
    toast(`已删除 ${ids2.length} 个文件`, 'ok')
  }

  function render() {
    list.innerHTML = ''
    if (!ids.length) { list.appendChild(h('div', { class: 'empty' }, '歌单为空')); return }
    ids.forEach((id) => {
      const m = items.find((x) => x.id === id) || { id, type: 'music', _missing: true }
      const match = !only || m._missing || m.type === only
      // selMode 下禁用拖拽、加勾选框、点选 toggle
      const rowChildren = []
      if (selMode) {
        rowChildren.push(h('div', { class: 'sr-chk' }, '✓'))
      }
      rowChildren.push(
        h('div', { class: 'qi' }, m._missing ? '📄' : (m.type === 'video' ? '🎬' : '🎵')),
        h('div', { class: 'qt' },
          h('div', { class: 'n' }, m.title || m.name || '未知文件'),
          h('div', { class: 's' }, m._missing ? '文件已丢失' : (m.artist || m.album || '')))
      )
      if (!selMode) {
        rowChildren.push(h('div', { class: 'qx', title: '从歌单移除', onclick: async (e) => {
          e.stopPropagation()
          ids = ids.filter((x) => x !== id)
          await persist(); render(); refreshHeader()
        } }, '✕'))
      }
      const row = h('div', {
        class: 'q-item pl-row' + (m._missing ? ' missing' : '') + (match ? '' : ' pl-dim') + (selected.has(id) ? ' sel' : ''),
        'data-id': id,
        // selMode 下禁用拖拽
        draggable: selMode ? 'false' : 'true',
        ondragstart: selMode ? undefined : (e) => { dragId = id; e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging') },
        ondragend: selMode ? undefined : () => { dragId = null; e.currentTarget.classList.remove('dragging') },
        ondragover: selMode ? undefined : (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('dragover') },
        ondragleave: selMode ? undefined : (e) => { e.currentTarget.classList.remove('dragover') },
        ondrop: selMode ? undefined : (e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); reorder(id) }
      }, ...rowChildren)

      if (selMode) {
        row.addEventListener('click', () => {
          if (selected.has(id)) { selected.delete(id); row.classList.remove('sel') }
          else { selected.add(id); row.classList.add('sel') }
          updateSelBar()
        })
      } else {
        // 长按 600ms 进入多选（和 library.js / favorites.js 统一）
        let holdTimer = null, sx = 0, sy = 0, triggered = false
        row.addEventListener('touchstart', (e) => {
          const t = e.touches[0]; sx = t.clientX; sy = t.clientY; triggered = false
          holdTimer = setTimeout(() => { triggered = true; enterSelectMode(id) }, 600)
        }, { passive: true })
        const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null } }
        row.addEventListener('touchmove', (e) => {
          if (!holdTimer) return
          const t = e.touches[0]
          if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancelHold()
        }, { passive: true })
        row.addEventListener('touchend', () => cancelHold(), { passive: true })
        row.addEventListener('touchcancel', () => cancelHold(), { passive: true })
        row.addEventListener('click', () => {
          if (triggered) { triggered = false; return }
          if (!m._missing && match) {
            const real = items.filter((x) => !x._missing && (!only || x.type === only))
            app.playList(real, m)
          }
        })
      }
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
  // 顶部工具栏：selMode → 取消 + 已选择 N 项；正常 → ▶ 播放全部 + 拖拽提示
  const topBar = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' } })
  function refreshTopBar() {
    topBar.innerHTML = ''
    if (selMode) {
      topBar.appendChild(h('button', { class: 'ghost-btn', onclick: () => exitSelect() }, '取消'))
      topBar.appendChild(h('span', { class: 'lib-sel-count', style: { color: 'var(--kg,#00D8A6)', fontWeight: 600 } }, `已选择 ${selected.size} 项`))
      topBar.style.justifyContent = 'space-between'
    } else {
      topBar.appendChild(h('button', { class: 'ghost-btn', onclick: playAll }, '▶ 播放全部'))
      topBar.appendChild(h('div', { class: 'hint', style: { color: 'var(--text-3)', fontSize: '12px', flex: 1 } }, '拖拽 ≡ 可重排 · 长按歌曲进入多选'))
      topBar.style.justifyContent = 'flex-start'
    }
  }
  refreshTopBar()
  const body = h('div', { class: 'mb' }, topBar, list, selbar)
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'mh' }, h('h3', {}, titleEl), h('button', { class: 'icon-btn', onclick: () => close() }, '✕')),
    body)
  const close = openModal(modal)
}

