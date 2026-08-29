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
    const draw = () => {
      if (!this.running) return
      this._raf = requestAnimationFrame(draw)
      const an = player.getAnalyser()
      const ctx = this.ctx
      const r = this.canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, r.width, r.height)
      if (!an) return
      const n = an.frequencyBinCount
      const data = new Uint8Array(n)
      an.getByteFrequencyData(data)
      const bars = 48
      const step = Math.floor(n / bars)
      const bw = r.width / bars
      for (let i = 0; i < bars; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) sum += data[i * step + j]
        const v = sum / step / 255
        const bh = Math.max(2, v * r.height)
        const hue = 210 + v * 30
        ctx.fillStyle = `hsl(${hue} 80% ${45 + v * 25}%)`
        ctx.fillRect(i * bw + 1, r.height - bh, bw - 2, bh)
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
