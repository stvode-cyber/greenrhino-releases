// favorites.js — 收藏页
import { h } from './dom.js'
import { getFavorites } from '../store.js'
import { songRow } from './library.js'
import { player } from '../player.js'

export function buildFavorites(app, only) {
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
    // 弹窗角色（音乐窗）只展示本类型收藏；Hub 展示全部
    const list = (await getFavorites()).filter((m) => !only || m.type === only)
    // 🔶 队列上下文：收藏页点歌 → 队列就是收藏列表
    app.activeSource = list
    // 顶部 Tab + 工具条（参考图：单曲 / 歌手 / 专辑 / 视频 + 播放图标 + 总数 + 搜索 + 排序 + 多选）
    const header = h('div', { class: 'sr-page-header' },
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
        h('span', { class: 'sr-tool-ico', title: '多选' }, '☑')))
    el.appendChild(header)
    if (!list.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '⭐'), h('div', {}, '还没有收藏，点击歌曲行上的 ♥ 收藏')))
      return
    }
    const listBox = h('div', { class: 'sr-list' })
    list.forEach((item) => listBox.appendChild(songRow(item, app)))
    el.appendChild(listBox)
    // 🔶 初始化滚动到正在播放的
    scrollToPlaying()
  }
  const offStore = app.onStore('favorites:changed', refresh)
  const offTrack = player.on('trackchanged', (item) => updatePlayingMark(item))
  el._cleanup = () => { offStore(); offTrack() }
  refresh()
  return { el, refresh, cleanup: () => { offStore(); offTrack() } }
}
