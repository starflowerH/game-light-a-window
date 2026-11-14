import './style.css'
import { Scene } from './scene.js'
import { Game } from './game.js'
import { UI } from './ui.js'

const host = document.createElement('div'); host.id = 'scene'
const fx = document.createElement('div'); fx.id = 'fx'
const vignette = document.createElement('div'); vignette.className = 'vignette'
const grain = document.createElement('div'); grain.className = 'grain'
const app = document.getElementById('app')
app.append(host, fx, vignette, grain)

const ui = new UI(app)

// The scene needs a tap handler, but the handler needs the game. Use a
// late-bound holder so neither has to be constructed before the other.
/** @type {{ game: Game | null }} */
const holder = { game: null }

const scene = new Scene(host, {
  onWindowTap: (w, x, y) => { if (holder.game) holder.game.tap(w, x, y) }
})

const gameInstance = new Game({ scene, ui })
holder.game = gameInstance
window.__game = gameInstance
scene.applyTheme('warm_blue', true)
ui.showTitle(() => { gameInstance.start() })
