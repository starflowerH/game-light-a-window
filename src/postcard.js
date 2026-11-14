// Renders a warm watercolor-style postcard PNG for the finished run.
export function drawPostcard({ run, nights, records }) {
  return new Promise(resolve => {
    const W = 1080, H = 1440
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d')
    // paper texture background
    const bg = g.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#f7efdd'); bg.addColorStop(0.55, '#f3e7cf'); bg.addColorStop(1, '#e9d8b8')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
    // soft watercolor blobs
    const blobs = [['rgba(255,196,122,.35)', 180, 260, 320], ['rgba(160,190,240,.30)', 880, 380, 380], ['rgba(255,150,120,.22)', 300, 1080, 300], ['rgba(140,220,190,.20)', 820, 1180, 300]]
    for (const [col, x, y, r] of blobs) { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H) }
    // night sky band with 24 windows
    const skyTop = 150, skyH = 300
    const sg = g.createLinearGradient(0, skyTop, 0, skyTop + skyH)
    sg.addColorStop(0, '#1b2a52'); sg.addColorStop(1, '#3a4d7e')
    roundRect(g, 90, skyTop, W - 180, skyH, 26); g.fillStyle = sg; g.fill()
    // stars
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`; g.fillRect(100 + Math.random() * (W - 200), skyTop + 10 + Math.random() * (skyH - 40), 2, 2) }
    // moon
    const mg = g.createRadialGradient(W - 220, skyTop + 90, 10, W - 220, skyTop + 90, 90); mg.addColorStop(0, 'rgba(255,245,210,.9)'); mg.addColorStop(0.4, 'rgba(255,240,200,.5)'); mg.addColorStop(1, 'rgba(255,240,200,0)')
    g.fillStyle = mg; g.beginPath(); g.arc(W - 220, skyTop + 90, 90, 0, 7); g.fill()
    g.fillStyle = '#fdf6dd'; g.beginPath(); g.arc(W - 220, skyTop + 90, 34, 0, 7); g.fill()
    // 24 windows in building grid
    const cols = 6, rows = 4, gapX = (W - 260) / cols, gapY = (skyH - 90) / rows
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
      const lit = Math.random() < 0.82
      const x = 130 + i * gapX, y = skyTop + 70 + r * gapY
      if (lit) { const lg = g.createRadialGradient(x + 16, y + 16, 1, x + 16, y + 16, 30); lg.addColorStop(0, '#fff7d6'); lg.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = lg; g.fillRect(x - 14, y - 14, 60, 60); g.fillStyle = '#ffd98a'; roundRect(g, x, y, 32, 32, 5); g.fill() }
      else { g.fillStyle = 'rgba(20,30,55,.9)'; roundRect(g, x, y, 32, 32, 5); g.fill() }
    }
    // headline
    g.fillStyle = '#8a5a25'; g.font = '600 22px "PingFang SC",sans-serif'; g.textAlign = 'left'
    g.fillText('LIGHT A WINDOW · 今晚的明信片', 90, 100)
    g.fillStyle = '#2e2216'; g.font = '900 62px "Songti SC","Noto Serif SC",serif'
    g.fillText('今晚，亮了一盏灯', 86, 560)
    // stats row
    const stats = [['温暖值', run.totalWarmth], ['最高连击', run.maxCombo], ['点亮窗', run.litTotal]]
    stats.forEach(([k, v], i) => { const x = 100 + i * 300; g.fillStyle = '#b07a3a'; g.font = '600 22px "PingFang SC",sans-serif'; g.fillText(k, x, 640); g.fillStyle = '#2e2216'; g.font = '900 64px "Songti SC",serif'; g.fillText(String(v), x, 710) })
    // postcard text from AI nights
    const lines = (nights || []).map((n, i) => `第 ${i + 1} 晚 · ${n.postcard || ''}`)
    g.fillStyle = '#5a4632'; g.font = '500 24px "PingFang SC",sans-serif'
    let ty = 800
    for (const ln of lines) { wrapText(g, ln, 90, ty, W - 180, 38); ty += 38 * Math.max(1, Math.ceil(g.measureText(ln).width / (W - 180))) + 16 }
    // items collected
    if (run.items?.length) {
      g.fillStyle = '#8a5a25'; g.font = '700 22px "PingFang SC",sans-serif'
      g.fillText('今晚收集到的小物件', 90, ty + 20)
      g.font = '500 22px "PingFang SC",sans-serif'; g.fillStyle = '#5a4632'
      wrapText(g, run.items.join(' · '), 90, ty + 60, W - 180, 34)
    }
    // footer signature
    g.strokeStyle = 'rgba(150,110,60,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(90, H - 150); g.lineTo(W - 90, H - 150); g.stroke()
    g.fillStyle = '#8a5a25'; g.font = '600 26px "Songti SC",serif'; g.textAlign = 'right'
    g.fillText('今晚，也有人在等你亮灯', W - 90, H - 100)
    if (records) { g.textAlign = 'left'; g.font = '500 20px "PingFang SC",sans-serif'; g.fillStyle = '#9a7a52'; g.fillText(`历史最佳 ${records.bestWarmth} · 已亮过 ${records.totalWindows} 扇窗`, 90, H - 100) }
    resolve(c.toDataURL('image/png'))
  })
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath() }
function wrapText(g, text, x, y, maxW, lh) { let line = '', yy = y; for (const ch of text) { if (g.measureText(line + ch).width > maxW) { g.fillText(line, x, yy); line = ch; yy += lh } else line += ch } if (line) g.fillText(line, x, yy) }
