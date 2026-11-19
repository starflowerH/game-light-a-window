import { setupMockApiRoutes } from './mock-api.js'

/**
 * GameHarness: High-fidelity Page Object and Action Simulation Helper for
 * Night Window v5.0 E2E automated test suites.
 */
export class GameHarness {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page
  }

  /**
   * Bootstraps the game environment with 0ms mocked APIs and ready-state synchronization.
   * @param {Object} [options]
   * @param {boolean} [options.clearStorage=true]
   * @param {boolean} [options.mockApi=true]
   * @param {Record<string, string>} [options.storageData={}]
   */
  async setup({ clearStorage = true, mockApi = true, storageData = {} } = {}) {
    if (mockApi) {
      await setupMockApiRoutes(this.page)
    }

    await this.page.addInitScript(() => {
      const style = document.createElement('style')
      style.id = '__e2e_motion_kill'
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-delay: 0ms !important;
          transition-duration: 0.001ms !important;
          transition-delay: 0ms !important;
        }
      `
      document.head?.appendChild(style) || document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
    })

    await this.page.addInitScript(
      ({ clear, storage }) => {
        if (clear) {
          try {
            window.localStorage.clear()
          } catch {}
        }
        if (storage && typeof storage === 'object') {
          for (const [k, v] of Object.entries(storage)) {
            try {
              window.localStorage.setItem(k, v)
            } catch {}
          }
        }
      },
      { clear: clearStorage, storage: storageData }
    )

    await this.page.goto('/')
    await this.page.waitForSelector('#app canvas', { timeout: 15000 })
    await this.page.waitForFunction(
      () => Boolean(window.__game && window.__game.state === 'title'),
      { timeout: 15000 }
    )
  }

  /**
   * Directly navigates from Title screen into Story Night through Prologue and Chapter Opener.
   * Immune to DOM element detachment and CSS animation timing races.
   * @param {string} [mood='lamp']
   */
  async startStoryNight(mood = 'lamp') {
    // 0. Idempotency check: if already in night, return immediately
    const currentState = await this.page.evaluate(() => window.__game?.state)
    if (currentState === 'night') {
      await this.page.waitForSelector('#hud', { timeout: 5000 })
      return
    }

    // 1. Title -> Prologue
    if (currentState === 'title' || await this.page.locator('button[data-act="start"]').count() > 0) {
      const startBtn = this.page.locator('button[data-act="start"]').first()
      await startBtn.waitFor({ state: 'visible', timeout: 8000 })
      // dispatchEvent('click') avoids Playwright's detachment retry loop on hideAll()
      await startBtn.dispatchEvent('click')
      // Await state machine transition to prologue
      await this.page.waitForFunction(
        () => Boolean(window.__game && (window.__game.state === 'prologue' || document.querySelector('.mood-card'))),
        { timeout: 8000 }
      )
    }

    // 2. Prologue -> Chapter Opener (bridges through Loading screen and /api/agent/plan)
    const moodSelector = `.mood-card[data-mood="${mood}"], .mood-card`
    const moodCard = this.page.locator(moodSelector).first()
    await moodCard.waitFor({ state: 'visible', timeout: 8000 })
    await moodCard.dispatchEvent('click')

    // Explicit state barrier: wait until plan fulfills and chapter opener is rendered
    await this.page.waitForFunction(
      () => Boolean(
        window.__game &&
        window.__game.state === 'chapter' &&
        document.querySelector('button[data-act="go"]')
      ),
      { timeout: 10000 }
    )

    // 3. Chapter Opener -> Night
    const goBtn = this.page.locator('button[data-act="go"]').first()
    await goBtn.waitFor({ state: 'visible', timeout: 8000 })
    await goBtn.dispatchEvent('click')

    // 4. Strict final state barrier: Night state active and HUD mounted
    await this.page.waitForFunction(
      () => Boolean(window.__game && window.__game.state === 'night'),
      { timeout: 10000 }
    )
    await this.page.waitForSelector('#hud', { timeout: 8000 })
  }

  /**
   * Query 2D screen coordinates of window idx via Three.js camera projection.
   * @param {number} idx - Window index (0..23)
   * @returns {Promise<{ x: number, y: number } | null>}
   */
  async getWindowPos(idx) {
    return await this.page.evaluate(i => {
      const g = window.__game
      if (!g || !g.scene || !g.scene.windows || !g.scene.windows[i]) return null
      const w = g.scene.windows[i]
      return g.scene.windowScreenPos(w)
    }, idx)
  }

  /**
   * Query 2D screen bounding rect of window idx via Three.js camera projection.
   * @param {number} idx
   * @returns {Promise<{ x: number, y: number, w: number, h: number } | null>}
   */
  async getWindowRect(idx) {
    return await this.page.evaluate(i => {
      const g = window.__game
      if (!g || !g.scene || !g.scene.windows || !g.scene.windows[i]) return null
      const w = g.scene.windows[i]
      return g.scene.windowScreenRect(w)
    }, idx)
  }

  /**
   * Tap window idx with native browser pointer click at projected coordinates.
   * @param {number} idx
   */
  async tapWindow(idx) {
    const pos = await this.getWindowPos(idx)
    if (!pos) throw new Error(`Window ${idx} position could not be projected`)
    await this.page.mouse.click(pos.x, pos.y)
  }

  /**
   * Drag pointer smoothly through a sequence of window indices.
   * @param {number[]} indices
   * @param {number} [steps=5]
   */
  async dragWindowChain(indices, steps = 5) {
    const coords = []
    for (const idx of indices) {
      const pos = await this.getWindowPos(idx)
      if (pos) coords.push(pos)
    }
    if (coords.length < 2) {
      throw new Error(`Need at least 2 projected windows for drag chain, got ${coords.length}`)
    }

    await this.page.mouse.move(coords[0].x, coords[0].y)
    await this.page.mouse.down()
    for (let i = 1; i < coords.length; i++) {
      await this.page.mouse.move(coords[i].x, coords[i].y, { steps: Math.max(steps, 8) })
      // Brief micro-pause to let pointermove events process
      await this.page.waitForTimeout(25)
    }
    await this.page.mouse.up()
  }

  /**
   * Fast-forward the remaining night countdown timer.
   * @param {number} seconds
   */
  async setRemainingSeconds(seconds) {
    await this.page.evaluate(sec => {
      const g = window.__game
      if (g && g.night) {
        g.night.endsAt = performance.now() + sec * 1000
        g.night.timeLeft = sec
      }
    }, seconds)
  }

  /**
   * Query HUD DOM state and metrics.
   */
  async readHud() {
    return await this.page.evaluate(() => {
      const qs = s => document.querySelector(s)?.textContent?.trim()
      const hud = document.getElementById('hud')
      if (!hud) return null

      return {
        warmth: parseInt(qs('#hud b[data-warm]') || '0', 10),
        combo: parseInt(qs('#hud b[data-combo]') || '0', 10),
        lit: parseInt(qs('#hud b[data-lit]') || '0', 10),
        time: parseInt(qs('#hud b[data-time]') || '0', 10),
        orbitLocked: document.querySelector('#hud button[data-act="orbit"]')?.classList.contains('locked') || false,
        passed: Boolean(document.querySelector('#ledger .kicker.passed')),
        hasAdvanceBtn: Boolean(document.querySelector('#ledger button[data-act="next-night"]')),
        flowBarVisible: Boolean(document.querySelector('.flow-bar-indicator, [data-flow-bar]'))
      }
    })
  }

  /**
   * Query ledger task items in the HUD bottom dock.
   */
  async readLedger() {
    return await this.page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#ledger .ledger-item'))
      return items.map(el => ({
        cid: el.getAttribute('data-cid'),
        cidx: el.getAttribute('data-cidx'),
        label: el.querySelector('.ledger-label')?.textContent?.trim() || '',
        count: el.querySelector('.ledger-count')?.textContent?.trim() || '',
        done: el.classList.contains('done') || el.classList.contains('passed')
      }))
    })
  }

  /**
   * Query smart capsule tags currently rendered in `#tags`.
   */
  async readTags() {
    return await this.page.evaluate(() => {
      const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
      return tags.map(el => {
        const h = /** @type {HTMLElement} */ (el)
        return {
          text: h.textContent?.trim() || '',
          className: h.className,
          style: { left: h.style.left, top: h.style.top }
        }
      })
    })
  }

  /**
   * Query coach onboarding guide element `#coach`.
   */
  async readCoach() {
    return await this.page.evaluate(() => {
      const coach = document.getElementById('coach')
      if (!coach) return null
      return {
        text: coach.querySelector('.ct')?.textContent?.trim() || '',
        hasRing: Boolean(coach.querySelector('.ring')),
        visible: window.getComputedStyle(coach).display !== 'none' && window.getComputedStyle(coach).opacity !== '0'
      }
    })
  }

  /**
   * Query popping sequence badges `.seq-badge` on screen.
   */
  async readSeqBadges() {
    return await this.page.evaluate(() => {
      const badges = Array.from(document.querySelectorAll('.seq-badge'))
      return badges.map(el => {
        const h = /** @type {HTMLElement} */ (el)
        return {
          text: h.textContent?.trim() || '',
          style: { left: h.style.left, top: h.style.top }
        }
      })
    })
  }

  /**
   * Read internal game state snapshot.
   */
  async readGameState() {
    return await this.page.evaluate(() => {
      const g = window.__game
      if (!g) return null
      return {
        state: g.state,
        nightIndex: g.nightIndex,
        orbitLocked: g.scene?.orbitLocked || false,
        night: g.night ? {
          warmth: g.night.warmth,
          combo: g.night.combo,
          maxCombo: g.night.maxCombo,
          litCount: g.night.litCount,
          timeLeft: g.night.timeLeft,
          minPassed: g.night.minPassed,
          allDone: g.night.allDone,
          chainActive: g.night.chain?.active || false,
          chainCount: g.night.chain?.count || 0
        } : null,
        dormId: g.dormId,
        weather: g.weather,
        season: g.season
      }
    })
  }

  /**
   * Read Three.js scene window states.
   */
  async readSceneWindowStates() {
    return await this.page.evaluate(() => {
      const g = window.__game
      if (!g || !g.scene || !Array.isArray(g.scene.windows)) return []
      return g.scene.windows.map(w => ({
        idx: w.idx,
        roomId: w.roomId,
        r: w.r,
        c: w.c,
        state: w.state,
        halo: w.cur?.halo || 0,
        warmth: w.cur?.warmth || 0
      }))
    })
  }

  /**
   * Read visual rendering subsystem state.
   */
  async readVisualState() {
    return await this.page.evaluate(() => {
      const g = window.__game
      if (!g || !g.scene) return null

      const scene = g.scene
      const floorSigns = scene._floorSigns ? Array.from(scene._floorSigns.entries()).map(([f, s]) => ({
        floor: f,
        active: s.active,
        visible: s.sprite?.visible ?? true
      })) : []

      const pingsCount = scene._pings ? scene._pings.length : 0

      return {
        hasRenderer: Boolean(scene.renderer),
        pixelRatio: scene.renderer?.getPixelRatio() || 1,
        hasPainterly: Boolean(scene.painterly),
        hasVfx: Boolean(scene.vfx),
        hasRibbon: Boolean(g.ribbon),
        floorSignsCount: floorSigns.length,
        floorSigns,
        pingsCount,
        windowsCount: scene.windows?.length || 0
      }
    })
  }

  /**
   * Read Web Audio engine state.
   */
  async readAudioState() {
    return await this.page.evaluate(() => {
      const g = window.__game
      if (!g || !g.audio) return null
      return {
        ready: g.audio.ready,
        muted: g.audio._muted || g.audio.muted,
        ctxState: g.audio.ctx ? g.audio.ctx.state : 'uninitialized',
        bgmState: g.getBgmState ? g.getBgmState() : null
      }
    })
  }

  /**
   * Trigger building facade floor sign highlight.
   * @param {number} floor
   * @param {boolean} active
   */
  async highlightFloorSign(floor, active = true) {
    await this.page.evaluate(
      ({ f, a }) => {
        if (window.__game && window.__game.scene) {
          window.__game.scene.highlightFloorSign(f, a)
        }
      },
      { f: floor, a: active }
    )
  }

  /**
   * Trigger 2s radar ping on target room.
   * @param {number} roomId
   */
  async pingRoom(roomId) {
    await this.page.evaluate(r => {
      if (window.__game && window.__game.scene) {
        window.__game.scene.pingRoom(r)
      }
    }, roomId)
  }

  /**
   * Trigger 2s radar ping on floor.
   * @param {number} floor
   */
  async pingFloor(floor) {
    await this.page.evaluate(f => {
      if (window.__game && window.__game.scene) {
        window.__game.scene.pingFloor(f)
      }
    }, floor)
  }
}
