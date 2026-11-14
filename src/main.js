import './style.css'
import { Scene, PALETTES } from './scene.js'
import { Game } from './game.js'
import { UI } from './ui.js'

const host = document.createElement('div'); host.id = 'scene'
const fx = document.createElement('div'); fx.id = 'fx'
const vignette = document.createElement('div'); vignette.className = 'vignette'
const grain = document.createElement('div'); grain.className = 'grain'
const app = document.getElementById('app')
app.append(host, fx, vignette, grain)

const ui = new UI(app)
const scene = new Scene(host, { onWindowTap: (w, x, y) => game.tap(w, x, y) })
const game = new Game({ scene, ui })
window.__game = game
scene.applyTheme('warm_blue', true)
ui.showTitle(() => game.start())
