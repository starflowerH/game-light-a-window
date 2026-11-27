import './style.css'
import { Scene } from './scene.js'
import { Game } from './game.js'
import { UI } from './ui.js'
import { AudioEngine } from './audio-engine.js'
import { RibbonTrail } from './ribbon-trail.js'
import { reportClientError } from './records.js'

const app = document.getElementById('app')
if (!app) throw new Error('missing #app')

const stage = document.createElement('div')
stage.id = 'scene'
const fx = document.createElement('div')
fx.id = 'fx'
const trailHost = document.createElement('div')
trailHost.id = 'trail'
const vignette = document.createElement('div')
vignette.className = 'vignette'
const grain = document.createElement('div')
grain.className = 'grain'
app.append(stage, fx, trailHost, vignette, grain)

const ui = new UI(app)
const audio = new AudioEngine()

// The scene fires input; the game owns the rules. Late-binding avoids a
// circular constructor dependency.
/** @type {{ game: Game | null }} */
const holder = { game: null }

const scene = new Scene(stage, {
  onWindowTap: (w, x, y) => { if (holder.game) holder.game.tap(w, x, y) },
  onPointerDown: (x, y) => { if (holder.game) holder.game.onPointerDown(x, y) },
  onPointerMove: (x, y, dragging) => { if (holder.game) holder.game.onPointerMove(x, y, dragging) },
  onPointerUp: (x, y) => { if (holder.game) holder.game.onPointerUp(x, y) }
})

const ribbon = new RibbonTrail(trailHost, { maxWidth: 22 })
const game = new Game({ scene, ui, audio, ribbon })
holder.game = game
window.__game = game

// The ribbon advances on its own frame clock and pauses when the tab is hidden.
let ribbonRaf = 0
const ribbonLoop = () => {
  ribbonRaf = 0
  if (document.hidden) return
  ribbon.tick()
  ribbonRaf = requestAnimationFrame(ribbonLoop)
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (ribbonRaf) { cancelAnimationFrame(ribbonRaf); ribbonRaf = 0 }
  } else if (!ribbonRaf) {
    ribbonRaf = requestAnimationFrame(ribbonLoop)
  }
})
ribbonRaf = requestAnimationFrame(ribbonLoop)

scene.applyTheme('warm_blue', true)
ui.showLoading('正在把楼里的灯接上电')

game.boot().catch(err => {
  reportClientError(String(err && err.message ? err.message : err), { where: 'boot' })
  ui.showLoading('灯没接上，刷新一下试试')
})

export { game, scene, ui, audio, ribbon }
