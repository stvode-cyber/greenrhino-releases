// recent.js — 最近播放页（复用续播进度表，按更新时间排序展示，支持一键续播）
import { h } from './dom.js'
import { getRecent } from '../store.js'
import { mediaCard } from './library.js'

export function buildRecent(app) {
  const el = h('div', { class: 'page' })

  async function refresh() {
    const items = await getRecent()
    el.innerHTML = ''
    el.appendChild(h('div', { class: 'section-title' }, h('span', {}, `最近播放 · ${items.length} 项`)))
    if (!items.length) {
      el.appendChild(h('div', { class: 'empty' },
        h('div', { class: 'big' }, '🕒'),
        h('div', {}, '暂无播放记录'),
        h('div', { style: { marginTop: '6px', color: 'var(--text-3)' } }, '播放过的媒体会显示在这里，方便随时续播')
      ))
      return
    }
    const grid = h('div', { class: 'grid' })
    for (const item of items) {
      const card = mediaCard(item, app)
      const pct = item.progress.duration
        ? Math.min(100, Math.round((item.progress.time / item.progress.duration) * 100))
        : 0
      const bar = h('div', { class: 'recent-progress' }, h('span', { style: { width: pct + '%' } }))
      const tip = h('div', { class: 'recent-tip' }, `已播 ${pct}%`)
      card.appendChild(bar)
      card.appendChild(tip)
      grid.appendChild(card)
    }
    el.appendChild(grid)
  }

  const unsub = [
    app.onStore('library:changed', refresh),
    app.onStore('media:updated', refresh),
    app.onStore('trackchanged', refresh)
  ]
  el._cleanup = () => unsub.forEach((u) => u())

  return {
    el,
    refresh,
    show() { refresh() } // 进入页面时拉取最新进度
  }
}
