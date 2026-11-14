// 1080x1440 postcard compositor.
//
// The window grid is a REAL map of what the player lit this run, not random
// dots: each room remembers how many of the three nights it was on.

import { WINDOW_IDS } from '../shared/constants.js'

const PALETTE = {
  starry_gold: { sky: ['#0b1030', '#2a2a6a', '#6a5aa0'], accent: '#ffd98a', ink: '#f4ecd8' },
  amber_score: { sky: ['#1a1230', '#5a3a5a', '#c08a5a'], accent: '#ffcf8a', ink: '#f7ecd8' },
  dawn_rose:   { sky: ['#2a2b52', '#7a5a72', '#f0b98a'], accent: '#ffd9b0', ink: '#fff3e2' },
  warm_amber:  { sky: ['#141030', '#4a3a54', '#d08a5a'], accent: '#ffc06a', ink: '#f7ecd8' },
  lilac_mist:  { sky: ['#1a1838', '#46406a', '#9a8ab8'], accent: '#e0c8ff', ink: '#f2eaff' },
  moon_blue:   { sky: ['#0b1533', '#233f74', '#6a86c4'], accent: '#cfe0ff', ink: '#eef3ff' }
}

const W = 1080
const H = 1440

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

function wrap(g, text, x, y, maxW, lh) {
  let line = ''
  let yy = y
  for (const ch of String(text || '')) {
    if (g.measureText(line + ch).width > maxW) {
      g.fillText(line, x, yy)
      line = ch
      yy += lh
    } else line += ch
  }
  if (line) g.fillText(line, x, yy)
  return yy
}

/**
 * How many nights each room was lit.
 * @param {any} run
 * @returns {Map<number, number>}
 */
function litMap(run) {
  const map = new Map()
  const nights = Array.isArray(run.nights) ? run.nights : []
  for (const n of nights) {
    for (const room of (n.litRooms || [])) map.set(Number(room), (map.get(Number(room)) || 0) + 1)
  }
  if (!map.size && Array.isArray(run.litRoomIds)) {
    for (const room of run.litRoomIds) map.set(Number(room), 1)
  }
  return map
}

/**
 * @param {{ run: any, nights: any[], records: any, ending: any }} input
 * @returns {Promise<string>} a PNG data URL
 */
export function drawPostcard({ run, nights, records, ending }) {
  return new Promise(resolve => {
    const key = (ending && ending.palette) || 'moon_blue'
    const pal = PALETTE[key] || PALETTE.moon_blue
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d')

    // --- warm paper base -------------------------------------------------
    const bg = g.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#f8f0de')
    bg.addColorStop(0.52, '#f2e6cd')
    bg.addColorStop(1, '#e6d3b2')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)

    // --- watercolour blooms ---------------------------------------------
    /** @type {Array<[string, number, number, number]>} */
    const blooms = [
      ['rgba(255,196,122,0.30)', 190, 250, 340],
      ['rgba(160,190,240,0.26)', 890, 360, 400],
      ['rgba(255,150,120,0.20)', 300, 1090, 320],
      ['rgba(140,220,190,0.18)', 820, 1200, 320]
    ]
    for (const [col, x, y, r] of blooms) {
      const rg = g.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, col)
      rg.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = rg
      g.fillRect(0, 0, W, H)
    }

    // --- sky band --------------------------------------------------------
    const skyTop = 168
    const skyH = 470
    const sg = g.createLinearGradient(0, skyTop, 0, skyTop + skyH)
    sg.addColorStop(0, pal.sky[0])
    sg.addColorStop(0.55, pal.sky[1])
    sg.addColorStop(1, pal.sky[2])
    roundRect(g, 84, skyTop, W - 168, skyH, 28)
    g.fillStyle = sg
    g.fill()

    // stars
    for (let i = 0; i < 120; i++) {
      const a = 0.12 + ((i * 37) % 70) / 100
      g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'
      g.fillRect(100 + ((i * 131) % (W - 200)), skyTop + 12 + ((i * 71) % (skyH - 60)), 2, 2)
    }

    // moon (drift ending gets a crescent)
    const mx = W - 232
    const my = skyTop + 108
    if (key === 'moon_blue') {
      g.fillStyle = '#fdf6dd'
      g.beginPath()
      g.arc(mx, my, 40, 0, 7)
      g.fill()
      g.fillStyle = pal.sky[0]
      g.beginPath()
      g.arc(mx + 18, my - 8, 36, 0, 7)
      g.fill()
    } else {
      const mg = g.createRadialGradient(mx, my, 6, mx, my, 96)
      mg.addColorStop(0, 'rgba(255,248,222,0.95)')
      mg.addColorStop(0.45, 'rgba(255,238,200,0.45)')
      mg.addColorStop(1, 'rgba(255,238,200,0)')
      g.fillStyle = mg
      g.beginPath()
      g.arc(mx, my, 96, 0, 7)
      g.fill()
      g.fillStyle = '#fdf6dd'
      g.beginPath()
      g.arc(mx, my, 34, 0, 7)
      g.fill()
    }

    // --- the building ----------------------------------------------------
    const map = litMap(run)
    const cols = 6
    const rows = 4
    const gridW = W - 300
    const gapX = gridW / cols
    const gapY = (skyH - 150) / rows
    const bx = 150
    const by = skyTop + 118
    // body
    g.fillStyle = 'rgba(16,22,44,0.55)'
    roundRect(g, bx - 18, by - 18, gridW + 36, gapY * rows + 20, 12)
    g.fill()

    // a warm ground reflection under the building
    const refl = g.createLinearGradient(0, by + gapY * rows, 0, by + gapY * rows + 150)
    refl.addColorStop(0, 'rgba(255,190,110,0.28)')
    refl.addColorStop(1, 'rgba(255,190,110,0)')
    g.fillStyle = refl
    g.fillRect(84, by + gapY * rows, W - 168, 150)

    for (const win of WINDOW_IDS) {
      const x = bx + win.col * gapX
      const y = by + (rows - 1 - win.row) * gapY
      const hits = map.get(win.roomId) || 0
      if (hits > 0) {
        const strength = 0.45 + 0.55 * Math.min(1, hits / 3)
        const lg = g.createRadialGradient(x + 17, y + 17, 2, x + 17, y + 17, 44)
        lg.addColorStop(0, 'rgba(255,247,214,' + strength + ')')
        lg.addColorStop(0.45, 'rgba(255,190,110,' + (strength * 0.7).toFixed(2) + ')')
        lg.addColorStop(1, 'rgba(255,190,110,0)')
        g.fillStyle = lg
        g.fillRect(x - 26, y - 26, 90, 90)
        g.fillStyle = pal.accent
        g.globalAlpha = strength
        roundRect(g, x, y, 34, 34, 5)
        g.fill()
        g.globalAlpha = 1
      } else {
        g.fillStyle = 'rgba(18,26,50,0.86)'
        roundRect(g, x, y, 34, 34, 5)
        g.fill()
        g.strokeStyle = 'rgba(150,180,230,0.22)'
        g.lineWidth = 1.2
        g.stroke()
      }
    }

    // --- header ----------------------------------------------------------
    g.textAlign = 'left'
    g.fillStyle = '#8a5a25'
    g.font = '600 21px "PingFang SC","Noto Sans SC",sans-serif'
    g.fillText('LIGHT A WINDOW · 今晚的明信片', 88, 104)

    g.fillStyle = '#2e2216'
    g.font = '900 58px "Songti SC","Noto Serif SC",serif'
    g.fillText('今晚，亮一盏灯', 84, 700)

    if (ending) {
      g.fillStyle = '#8a5a25'
      g.font = '600 26px "PingFang SC","Noto Sans SC",sans-serif'
      g.fillText(ending.badge + '  ' + ending.name, 88, 748)
    }

    // --- stat row --------------------------------------------------------
    const stats = [
      ['温暖值', run.totalWarmth || 0],
      ['最高连击', run.maxCombo || 0],
      ['点亮窗', run.litTotal || 0],
      ['火漆章', run.stampsEarned || 0]
    ]
    stats.forEach(([k, v], i) => {
      const x = 96 + i * 232
      g.fillStyle = '#b07a3a'
      g.font = '600 20px "PingFang SC",sans-serif'
      g.fillText(k, x, 812)
      g.fillStyle = '#2e2216'
      g.font = '900 54px "Songti SC",serif'
      g.fillText(String(v), x, 868)
    })

    // --- the letter ------------------------------------------------------
    const letter = run.letter
    if (letter) {
      g.strokeStyle = 'rgba(150,110,60,0.35)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(88, 906)
      g.lineTo(W - 88, 906)
      g.stroke()

      g.fillStyle = '#8a5a25'
      g.font = '700 22px "PingFang SC",sans-serif'
      g.fillText(letter.fromRoom || '', 88, 948)

      g.fillStyle = '#4a3a2a'
      g.font = '500 25px "Songti SC",serif'
      g.fillText(letter.salutation || '', 88, 990)
      g.font = '400 24px "Songti SC",serif'
      g.fillStyle = '#5a4632'
      const yy = wrap(g, letter.body || '', 88, 1032, W - 176, 40)
      g.fillStyle = '#8a5a25'
      g.font = '500 22px "Songti SC",serif'
      g.textAlign = 'right'
      g.fillText(letter.sign || '', W - 90, Math.min(H - 250, yy + 44))
      g.textAlign = 'left'
    }

    // --- the three nights ------------------------------------------------
    const lines = (nights || []).map((n, i) => '第 ' + (i + 1) + ' 晚 · ' + (n.postcard || '')).filter(Boolean)
    g.fillStyle = '#6a5540'
    g.font = '500 21px "PingFang SC",sans-serif'
    let ty = H - 210
    for (const ln of lines) {
      g.fillText(ln.slice(0, 34), 88, ty)
      ty += 32
    }

    // --- collected items -------------------------------------------------
    if (run.items && run.items.length) {
      g.fillStyle = '#8a5a25'
      g.font = '700 20px "PingFang SC",sans-serif'
      g.fillText('今晚收进的小物件', 88, H - 150)
      let ix = 88
      const iy = H - 118
      for (const item of run.items.slice(0, 8)) {
        g.fillStyle = 'rgba(255,252,240,0.85)'
        roundRect(g, ix, iy, 104, 34, 17)
        g.fill()
        g.strokeStyle = 'rgba(160,120,70,0.45)'
        g.lineWidth = 1.2
        g.stroke()
        g.fillStyle = '#7a5a35'
        g.font = '500 17px "PingFang SC",sans-serif'
        g.fillText(String(item).slice(0, 5), ix + 12, iy + 23)
        ix += 116
      }
    }

    // --- footer ----------------------------------------------------------
    g.strokeStyle = 'rgba(150,110,60,0.45)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(88, H - 78)
    g.lineTo(W - 88, H - 78)
    g.stroke()

    g.fillStyle = '#8a5a25'
    g.font = '600 24px "Songti SC",serif'
    g.fillText('今晚，也有人在等你亮灯', 88, H - 40)

    if (records) {
      g.textAlign = 'right'
      g.fillStyle = '#9a7a52'
      g.font = '500 19px "PingFang SC",sans-serif'
      g.fillText('历史最佳 ' + (records.bestWarmth || 0) + ' · 已亮过 ' + (records.totalWindows || 0) + ' 扇窗', W - 88, H - 40)
      g.textAlign = 'left'
    }

    // a hand-drawn paper grain pass
    g.globalAlpha = 0.05
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = i % 2 ? '#5a3a1a' : '#ffffff'
      g.fillRect((i * 197) % W, (i * 389) % H, 1, 1)
    }
    g.globalAlpha = 1

    resolve(c.toDataURL('image/png'))
  })
}
