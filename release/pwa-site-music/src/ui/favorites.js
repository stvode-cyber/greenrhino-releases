// favorites.js — 收藏页
import { h } from './dom.js'
import { getFavorites } from '../store.js'
import { mediaCard } from './library.js'

export function buildFavorites(app, only) {
  const el = h('div', { class: 'page' })
  async function refresh() {
    el.innerHTML = ''
    // 弹窗角色（音乐窗）只展示本类型收藏；Hub 展示全部
    const list = (await getFavorites()).filter((m) => !only || m.type === only)
    el.appendChild(h('div', { class: 'section-title' }, `收藏 · ${list.length} 项`))
    if (!list.length) {
      el.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '⭐'), h('div', {}, '还没有收藏，点击卡片上的 ☆ 收藏')))
      return
    }
    const grid = h('div', { class: 'grid' })
    list.forEach((item) => grid.appendChild(mediaCard(item, app)))
    el.appendChild(grid)
  }
  const off = app.onStore('favorites:changed', refresh)
  el._cleanup = off
  refresh()
  return { el, refresh }
}
