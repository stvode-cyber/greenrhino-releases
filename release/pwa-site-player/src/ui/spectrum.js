// spectrum.js — 实时频谱绘制
import { player } from '../player.js'

export class Spectrum {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.running = false
    this._raf = null
    this._resize()
    window.addEventListener('resize', () => this._resize())
  }
  _resize() {
    const dpr = window.devicePixelRatio || 1
    const r = this.canvas.getBoundingClientRect()
    this.canvas.width = Math.max(1, r.width * dpr)
    this.canvas.height = Math.max(1, r.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  start() {
    if (this.running) return
    this.running = true
    this._resize()
    const bars = 48
    const peaks = new Array(bars).fill(0)   // 峰值保持（缓慢衰减，频谱更生动）
    const draw = () => {
      if (!this.running) return
      this._raf = requestAnimationFrame(draw)
      const an = player.getAnalyser()
      const ctx = this.ctx
      const r = this.canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, r.width, r.height)
      if (!an) { for (let i = 0; i < bars; i++) peaks[i] = 0; return }
      const n = an.frequencyBinCount
      const data = new Uint8Array(n)
      an.getByteFrequencyData(data)
      const step = Math.floor(n / bars)
      const bw = r.width / bars
      // 音乐绿渐变（与酷狗主题一致）
      for (let i = 0; i < bars; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) sum += data[i * step + j]
        const v = sum / step / 255
        peaks[i] = Math.max(v, peaks[i] - 0.035)
        const bh = Math.max(3, peaks[i] * r.height)
        const x = i * bw + 1, y = r.height - bh
        const g = ctx.createLinearGradient(0, r.height, 0, y)
        g.addColorStop(0, 'rgba(0,216,166,.9)')
        g.addColorStop(0.55, 'rgba(0,190,146,.55)')
        g.addColorStop(1, 'rgba(4,35,26,.25)')
        ctx.fillStyle = g
        if (ctx.roundRect) ctx.beginPath(), ctx.roundRect(x, y, bw - 2, bh - 1, [3, 3, 0, 0]), ctx.fill()
        else ctx.fillRect(x, y, bw - 2, bh - 1)
      }
    }
    draw()
  }
  stop() {
    this.running = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }
}
