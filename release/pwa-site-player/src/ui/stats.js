// stats.js — 播放统计页（总播放/时长/排行/音乐视频分布）
import { h } from './dom.js'
import { getAllMedia } from '../store.js'
import { mediaCard } from './library.js'

function fmtCounts(list) {
  const sec = list.reduce((a, m) => a + ((m.playCount || 0) * (m.duration || 0)), 0)
  const fmtDur = (s) => {
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60)
    return hh > 0 ? `${hh} 小时 ${mm} 分` : `${mm} 分钟`
  }
  return {
    totalPlays: list.reduce((a, m) => a + (m.playCount || 0), 0),
    playedTime: fmtDur(sec),
    music: list.filter((m) => m.type === 'music').length,
    video: list.filter((m) => m.type === 'video').length
  }
}

export function buildStats(app) {
  const el = h('div', { class: 'page' })

  async function refresh() {
    const all = await getAllMedia()
    el.innerHTML = ''
    const s = fmtCounts(all)
    // 概览卡
    const overview = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', marginBottom: '16px' } })
    const statCard = (label, val, sub) => h('div', { class: 'card', style: { padding: '14px', textAlign: 'center' } },
      h('div', { style: { fontSize: '22px', fontWeight: '700' } }, val),
      h('div', { style: { color: 'var(--text-3)', fontSize: '12px', marginTop: '4px' } }, label),
      sub ? h('div', { style: { color: 'var(--text-3)', fontSize: '11px', marginTop: '2px' } }, sub) : null)
    overview.append(
      statCard('累计播放', String(s.totalPlays), '次'),
      statCard('播放时长', s.playedTime),
      statCard('音乐', String(s.music), '首'),
      statCard('视频', String(s.video), '个'))
    el.appendChild(overview)

    // 排行：播放次数 top
    const byPlays = all.filter((m) => (m.playCount || 0) > 0).sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    const byRecent = all.filter((m) => m.lastPlayedAt).sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    el.appendChild(section('🔥 播放最多', byPlays, (m) => `${m.playCount || 0} 次`, all))
    el.appendChild(section('🕒 最近播放', byRecent.slice(0, 12), (m) => timeAgo(m.lastPlayedAt), all))
  }

  function section(title, items, sub, all) {
    const wrap = h('div', { style: { marginBottom: '8px' } })
    wrap.appendChild(h('div', { class: 'section-title' }, `${title} · ${items.length}`))
    if (!items.length) {
      wrap.appendChild(h('div', { class: 'empty', style: { padding: '16px' } }, '还没有数据，先播几首歌吧'))
      return wrap
    }
    const grid = h('div', { class: 'grid' })
    items.slice(0, 12).forEach((m) => {
      const card = mediaCard(m, app)
      const badge = h('div', { class: 'recent-tip', style: { top: 'auto', bottom: '4px' } }, sub(m))
      card.appendChild(badge)
      grid.appendChild(card)
    })
    wrap.appendChild(grid)
    return wrap
  }

  function timeAgo(t) {
    if (!t) return ''
    const sec = Math.floor((Date.now() - t) / 1000)
    if (sec < 60) return '刚刚'
    if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
    if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
    return `${Math.floor(sec / 86400)} 天前`
  }

  const unsub = [
    app.onStore('library:changed', refresh),
    app.onStore('stats:changed', refresh)
  ]
  el._cleanup = () => unsub.forEach((u) => u())

  refresh()
  return { el, refresh }
}