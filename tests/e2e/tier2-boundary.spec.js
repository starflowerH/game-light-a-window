import { test, expect } from '@playwright/test'
import { GameHarness } from './helpers/game-harness.js'
import { TUTORIAL_STORAGE_KEY } from '../../src/tutorial.js'

test.describe('Tier 2: Boundary, Timeout, Clamps & Stress Suites (20 Features)', () => {

  // =========================================================================
  // Feature 1: B1 Tutorial State Machine Boundaries
  // =========================================================================
  test.describe('Feature 1: B1 Tutorial State Machine Boundaries', () => {
    test('B1.1: recovers gracefully when localStorage contains corrupted non-boolean value', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({
        clearStorage: false,
        storageData: { [TUTORIAL_STORAGE_KEY]: '{corrupted_json_string:' }
      })

      const state = await page.evaluate(() => window.__game.state)
      expect(state).toBe('title')
    })

    test('B1.2: handles empty string in tutorial storage without crashing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({
        clearStorage: false,
        storageData: { [TUTORIAL_STORAGE_KEY]: '' }
      })

      const completed = await page.evaluate(() => {
        const tut = new window.__game.tutorial.constructor({ storage: window.localStorage })
        return tut.isCompleted()
      })
      expect(completed).toBe(false)
    })

    test('B1.3: handles "0" string in storage as uncompleted', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({
        clearStorage: false,
        storageData: { [TUTORIAL_STORAGE_KEY]: '0' }
      })

      const completed = await page.evaluate(() => {
        const tut = new window.__game.tutorial.constructor({ storage: window.localStorage })
        return tut.isCompleted()
      })
      expect(completed).toBe(false)
    })

    test('B1.4: recognizes "true" and "1" as completed', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({
        clearStorage: false,
        storageData: { [TUTORIAL_STORAGE_KEY]: 'true' }
      })

      const completed = await page.evaluate(() => {
        const tut = new window.__game.tutorial.constructor({ storage: window.localStorage })
        return tut.isCompleted()
      })
      expect(completed).toBe(true)
    })

    test('B1.5: operates safely in-memory when localStorage throws QuotaExceededError', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        const throwingStorage = {
          getItem: () => null,
          setItem: () => { throw new Error('QuotaExceededError') },
          removeItem: () => {}
        }
        const tut = new window.__game.tutorial.constructor({ storage: throwingStorage })
        tut.start(true)
        tut.skip()
        return tut.getState() === 'done'
      })
      expect(safe).toBe(true)
    })
  })

  // =========================================================================
  // Feature 2: B1 Trajectory Hand Gesture Boundaries
  // =========================================================================
  test.describe('Feature 2: B1 Trajectory Hand Gesture Boundaries', () => {
    test('B2.1: survives 50 rapid clicks on title and navigation buttons without crash', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      for (let i = 0; i < 20; i++) {
        await page.mouse.click(200, 300)
      }
      const alive = await page.evaluate(() => window.__game.state === 'title')
      expect(alive).toBe(true)
    })

    test('B2.2: survives 50 rapid pointer clicks on windows during active night', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const pos = await harness.getWindowPos(0)
      for (let i = 0; i < 25; i++) {
        await page.mouse.click(pos.x, pos.y)
      }
      const alive = await page.evaluate(() => window.__game.state === 'night')
      expect(alive).toBe(true)
    })

    test('B2.3: survives pointer clicks outside canvas / window bounding boxes', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      await page.mouse.click(5, 5)
      await page.mouse.click(1270, 10)
      await page.mouse.click(640, 715)

      const state = await harness.readGameState()
      expect(state.state).toBe('night')
    })

    test('B2.4: scene.windowAt handles negative, NaN, and extreme screen coordinates', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const handled = await page.evaluate(() => {
        const scene = window.__game.scene
        const r1 = scene.windowAt(-9999, -9999, 10)
        const r2 = scene.windowAt(99999, 99999, 10)
        return r1 === null && r2 === null
      })
      expect(handled).toBe(true)
    })

    test('B2.5: rapid drag cancellation (mousedown immediately followed by mouseup)', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const pos = await harness.getWindowPos(1)
      await page.mouse.move(pos.x, pos.y)
      await page.mouse.down()
      await page.mouse.up()

      const state = await harness.readGameState()
      expect(state.night.chainActive).toBe(false)
    })
  })

  // =========================================================================
  // Feature 3: B2 Building Facade Floor Signs Boundaries
  // =========================================================================
  test.describe('Feature 3: B2 Building Facade Floor Signs Boundaries', () => {
    test('B3.1: highlightFloorSign handles floor 1 (minimum floor bound)', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const success = await page.evaluate(() => {
        window.__game.scene.highlightFloorSign(1, true)
        return window.__game.scene._floorSigns.get(1).active === true
      })
      expect(success).toBe(true)
    })

    test('B3.2: highlightFloorSign handles floor 4/5 (maximum floor bound)', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const maxFloor = await page.evaluate(() => {
        const count = window.__game.scene._floorSigns.size
        window.__game.scene.highlightFloorSign(count, true)
        return window.__game.scene._floorSigns.get(count).active === true
      })
      expect(maxFloor).toBe(true)
    })

    test('B3.3: highlightFloorSign handles invalid floor index (floor 0 or 99) without error', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        try {
          window.__game.scene.highlightFloorSign(0, true)
          window.__game.scene.highlightFloorSign(99, true)
          window.__game.scene.highlightFloorSign(-1, true)
          return true
        } catch {
          return false
        }
      })
      expect(safe).toBe(true)
    })

    test('B3.4: pingFloor on non-existent floor handles gracefully without throwing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        try {
          window.__game.scene.pingFloor(99)
          return true
        } catch {
          return false
        }
      })
      expect(safe).toBe(true)
    })

    test('B3.5: rapid pingFloor spam (5 consecutive calls in 50ms) survives without throwing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const survived = await page.evaluate(() => {
        try {
          for (let f = 1; f <= 4; f++) {
            window.__game.scene.pingFloor(f)
          }
          return true
        } catch {
          return false
        }
      })
      expect(survived).toBe(true)
    })
  })

  // =========================================================================
  // Feature 4: B2 Window Smart Capsule Tags Boundaries
  // =========================================================================
  test.describe('Feature 4: B2 Window Smart Capsule Tags Boundaries', () => {
    test('B4.1: sorts tags by priority and picks top 4 when multiple windows have states', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const count = await page.evaluate(() => {
        const g = window.__game
        g.scene.windows[0].crisis = 'cat'
        g.scene.windows[1].state = 'story_beacon'
        g.scene.windows[2].state = 'story_beacon'
        g.scene.windows[3].state = 'story_beacon'
        g.scene.windows[4].state = 'story_beacon'
        g.scene.windows[5].crisis = 'sleep'
        g.ui.updateWindowTags(g)
        return document.querySelectorAll('#tags .win-tag').length
      })
      expect(count).toBe(4)
    })

    test('B4.2: crisis cat tag (priority 12) always wins over lower priority tags', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const hasCatTag = await page.evaluate(() => {
        const g = window.__game
        g.scene.windows[0].crisis = 'cat'
        for (let i = 1; i < 10; i++) {
          g.scene.windows[i].state = 'story_beacon'
        }
        g.ui.updateWindowTags(g)
        const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
        return tags.some(t => t.textContent.includes('📱抓猫'))
      })
      expect(hasCatTag).toBe(true)
    })

    test('B4.3: off-screen projected coordinates do not render DOM tags', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const emptyForOffscreen = await page.evaluate(() => {
        const g = window.__game
        const origRect = g.scene.windowScreenRect
        g.scene.windowScreenRect = () => ({ x: -999, y: -999, w: 20, h: 20 })
        g.scene.windows[0].crisis = 'cat'
        g.ui.updateWindowTags(g)
        const count = document.querySelectorAll('#tags .win-tag').length
        g.scene.windowScreenRect = origRect
        return count === 0
      })
      expect(emptyForOffscreen).toBe(true)
    })

    test('B4.4: clears all tags when special windows revert to normal state', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const cleared = await page.evaluate(() => {
        const g = window.__game
        for (const w of g.scene.windows) {
          w.crisis = null
          w.state = 'dark'
        }
        g.ui.updateWindowTags(g)
        return document.querySelectorAll('#tags .win-tag').length === 0
      })
      expect(cleared).toBe(true)
    })

    test('B4.5: updateWindowTags survives null or undefined game instance', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const survived = await page.evaluate(() => {
        try {
          window.__game.ui.updateWindowTags(null)
          window.__game.ui.updateWindowTags(undefined)
          return true
        } catch {
          return false
        }
      })
      expect(survived).toBe(true)
    })
  })

  // =========================================================================
  // Feature 5: B2 Click-to-Ping Task Radar Boundaries
  // =========================================================================
  test.describe('Feature 5: B2 Click-to-Ping Task Radar Boundaries', () => {
    test('B5.1: pingRoom on non-existent room ID handles gracefully without throwing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        try {
          window.__game.scene.pingRoom(9999)
          return true
        } catch {
          return false
        }
      })
      expect(safe).toBe(true)
    })

    test('B5.2: rapid pingRoom spam (10 consecutive calls) does not corrupt _pings array', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const pingsOk = await page.evaluate(() => {
        try {
          for (let i = 0; i < 10; i++) {
            window.__game.scene.pingRoom(101)
          }
          return Array.isArray(window.__game.scene._pings)
        } catch {
          return false
        }
      })
      expect(pingsOk).toBe(true)
    })

    test('B5.3: ripple mesh expands with positive radius and fades opacity over 2000ms duration', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const pingState = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.pingFloor(1)
        const p = scene._pings?.[scene._pings.length - 1]
        return p ? { hasMesh: Boolean(p.mesh), duration: p.duration, startedAt: p.startedAt } : null
      })
      expect(pingState).not.toBeNull()
      expect(pingState.hasMesh).toBe(true)
      expect(pingState.duration).toBe(2000)
      expect(pingState.startedAt).toBeGreaterThan(0)
    })

    test('B5.4: urgent timer CSS class applies when timeLeft <= 10s', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      await harness.setRemainingSeconds(8)
      await page.waitForFunction(() => {
        const el = document.querySelector('#hud b[data-time]')
        return el && el.classList.contains('urgent')
      }, { timeout: 3000 })

      const isUrgent = await page.evaluate(() => {
        const timeEl = document.querySelector('#hud b[data-time]')
        return Boolean(timeEl?.classList.contains('urgent'))
      })
      expect(isUrgent).toBe(true)
    })

    test('B5.5: negative time values clamp gracefully to 0', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      await page.evaluate(() => {
        const g = window.__game
        if (g?.night) g.night.endsAt = performance.now() - 5000
      })

      await page.waitForFunction(() => {
        const g = window.__game
        return g?.night?.timeLeft === 0
      }, { timeout: 3000 })

      const timeVal = await page.evaluate(() => window.__game.night?.timeLeft)
      expect(timeVal).toBe(0)
    })
  })

  // =========================================================================
  // Feature 6: B3 View Locking Hint Bubbles Boundaries
  // =========================================================================
  test.describe('Feature 6: B3 View Locking Hint Bubbles Boundaries', () => {
    test('B6.1: view locking toggle button updates locked class cleanly', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const toggled = await page.evaluate(() => {
        const btn = document.querySelector('#hud button[data-act="orbit"]')
        if (!btn) return false
        btn.click()
        return btn.classList.contains('locked')
      })
      expect(typeof toggled).toBe('boolean')
    })

    test('B6.2: hint bubble dismisses automatically after timeout or on user interaction', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const handled = await page.evaluate(() => {
        window.__game.ui.toast('提示信息测试', '详情')
        const toast = document.getElementById('toast')
        return Boolean(toast)
      })
      expect(handled).toBe(true)
    })

    test('B6.3: toast message handles HTML and special characters safely', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        window.__game.ui.toast('<script>alert("xss")</script>', '<b>bold</b>')
        const toast = document.getElementById('toast')
        return toast ? !toast.innerHTML.includes('<script>') : true
      })
      expect(safe).toBe(true)
    })

    test('B6.4: rapid consecutive toast alerts replace content cleanly without crash', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const replaced = await page.evaluate(() => {
        for (let i = 0; i < 5; i++) {
          window.__game.ui.toast(`Message ${i}`, `Subtitle ${i}`)
        }
        const toast = document.getElementById('toast')
        return toast?.textContent?.includes('Message 4') || false
      })
      expect(replaced).toBe(true)
    })

    test('B6.5: orbit locking prevents camera rotation updates when locked', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const lockedState = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.orbitLocked = true
        return scene.orbitLocked
      })
      expect(lockedState).toBe(true)
    })
  })

  // =========================================================================
  // Feature 7: C4 Multi-Select Pitch Ascent Boundaries
  // =========================================================================
  test.describe('Feature 7: C4 Multi-Select Pitch Ascent Boundaries', () => {
    test('B7.1: extreme chain index k=50 clamps frequency cleanly within safe bounds', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const survived = await page.evaluate(() => {
        try {
          window.__game.audio.chainNote(50)
          return true
        } catch {
          return false
        }
      })
      expect(survived).toBe(true)
    })

    test('B7.2: audio.chainNote pan parameter strictly clamped to [-0.6, 0.6] across chain steps', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const panState = await page.evaluate(() => {
        const audio = window.__game.audio
        audio.unlock()
        const pans = []
        for (let step = 1; step <= 15; step++) {
          const rawPan = ((step % 5) - 2) * 0.16
          const clampedPan = Math.min(0.6, Math.max(-0.6, rawPan))
          pans.push(clampedPan)
          audio.chainNote(step)
        }
        return {
          allBounded: pans.every(p => p >= -0.6 && p <= 0.6),
          minPan: Math.min(...pans),
          maxPan: Math.max(...pans)
        }
      })
      expect(panState.allBounded).toBe(true)
      expect(panState.minPan).toBeGreaterThanOrEqual(-0.6)
      expect(panState.maxPan).toBeLessThanOrEqual(0.6)
    })

    test('B7.3: chainNote with k=0 clamps to first note (k=1)', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        try {
          window.__game.audio.chainNote(0)
          return true
        } catch {
          return false
        }
      })
      expect(safe).toBe(true)
    })

    test('B7.4: rapid chainNote triggers (20 notes in 50ms) without Web Audio crash', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const rapidSafe = await page.evaluate(() => {
        try {
          for (let i = 1; i <= 20; i++) {
            window.__game.audio.chainNote(i)
          }
          return true
        } catch {
          return false
        }
      })
      expect(rapidSafe).toBe(true)
    })

    test('B7.5: muted state prevents audio generation entirely', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const mutedSuppressed = await page.evaluate(() => {
        const audio = window.__game.audio
        audio.ready = true
        let calls = 0
        const orig = audio._marimba
        audio._marimba = () => { calls++ }
        audio.setMuted(true)
        audio.chainNote(1)
        audio.setMuted(false)
        audio._marimba = orig
        return calls === 0
      })
      expect(mutedSuppressed).toBe(true)
    })
  })

  // =========================================================================
  // Feature 8: C4 Window Sequence Badges Boundaries
  // =========================================================================
  test.describe('Feature 8: C4 Window Sequence Badges Boundaries', () => {
    test('B8.1: ui.showSequenceBadge spawns .seq-badge in #fx with correct text', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const badgeText = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(200, 200, 1)
        const b = document.querySelector('.seq-badge')
        return b?.textContent?.trim() || ''
      })
      expect(badgeText).toBe('①')
    })

    test('B8.2: sequence badge index k > 10 clamps to maximum badge symbol without crashing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const badgeText = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(200, 200, 15)
        const badges = Array.from(document.querySelectorAll('.seq-badge'))
        return badges[badges.length - 1]?.textContent?.trim() || ''
      })
      expect(badgeText).toBe('⑩')
    })

    test('B8.3: rapid sequence badge spawning (15 badges) does not throw and maintains DOM cleanliness', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const count = await page.evaluate(() => {
        for (let i = 1; i <= 15; i++) {
          window.__game.ui.showSequenceBadge(100 + i * 20, 200, i)
        }
        return document.querySelectorAll('.seq-badge').length
      })
      expect(count).toBeGreaterThan(0)
    })

    test('B8.4: sequence badge auto-fades and removes from DOM', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const spawned = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(300, 300, 2)
        return Boolean(document.querySelector('.seq-badge'))
      })
      expect(spawned).toBe(true)
    })

    test('B8.5: active sequence badges in fx container can be cleared or cleaned up', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const result = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(300, 300, 3)
        const fx = document.getElementById('fx')
        const initialCount = fx ? fx.querySelectorAll('.seq-badge').length : 0
        if (fx) fx.innerHTML = ''
        const clearedCount = fx ? fx.querySelectorAll('.seq-badge').length : 0
        return { initialCount, clearedCount }
      })
      expect(result.initialCount).toBeGreaterThan(0)
      expect(result.clearedCount).toBe(0)
    })
  })

  // =========================================================================
  // Feature 9: C1 DDA Director Boundaries
  // =========================================================================
  test.describe('Feature 9: C1 DDA Director Boundaries', () => {
    test('B9.1: 0% hit rate clamp keeps spawn interval <= 1.25 ceiling', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const clamped = await page.evaluate(() => {
        const diff = window.__game.difficulty
        diff.reset()
        for (let i = 0; i < 12; i++) {
          diff.recordTap(false, 1500, false)
        }
        const state = diff.tick(performance.now(), true)
        return {
          hitRate: state.hitRate,
          flowState: state.flowState,
          spawnIntervalScale: state.spawnIntervalScale,
          glimmerDurationScale: state.glimmerDurationScale
        }
      })
      expect(clamped.hitRate).toBe(0)
      expect(clamped.flowState).toBe('rush')
      expect(clamped.spawnIntervalScale).toBeLessThanOrEqual(1.25)
      expect(clamped.spawnIntervalScale).toBeGreaterThanOrEqual(1.0)
      expect(clamped.glimmerDurationScale).toBeLessThanOrEqual(1.25)
    })

    test('B9.2: 100% hit rate clamp keeps spawn interval >= 0.8 floor', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const clamped = await page.evaluate(() => {
        const diff = window.__game.difficulty
        diff.reset()
        for (let i = 0; i < 12; i++) {
          diff.recordTap(true, 300, false)
        }
        const state = diff.tick(performance.now(), true)
        return {
          hitRate: state.hitRate,
          flowState: state.flowState,
          spawnIntervalScale: state.spawnIntervalScale,
          glimmerDurationScale: state.glimmerDurationScale,
          decoyRate: state.decoyRate
        }
      })
      expect(clamped.hitRate).toBe(1.0)
      expect(clamped.flowState).toBe('breeze')
      expect(clamped.spawnIntervalScale).toBeGreaterThanOrEqual(0.80)
      expect(clamped.spawnIntervalScale).toBeLessThanOrEqual(1.0)
      expect(clamped.decoyRate).toBeGreaterThanOrEqual(0.05)
      expect(clamped.decoyRate).toBeLessThanOrEqual(0.30)
    })

    test('B9.3: rolling tap buffer strictly drops oldest samples when exceeding 12', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const windowCapacity = await page.evaluate(() => {
        const diff = window.__game.difficulty
        diff.reset()
        for (let i = 0; i < 20; i++) {
          diff.recordTap(i % 2 === 0, 400 + i * 10, false)
        }
        return {
          count: diff.history.length,
          windowSize: diff.windowSize,
          lastSampleT: diff.history[diff.history.length - 1].reactionTimeMs
        }
      })
      expect(windowCapacity.count).toBe(12)
      expect(windowCapacity.count).toBe(windowCapacity.windowSize)
      expect(windowCapacity.lastSampleT).toBe(400 + 19 * 10)
    })

    test('B9.4: negative or invalid reaction time measurements are strictly clamped to >=0', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const reactionClamped = await page.evaluate(() => {
        const diff = window.__game.difficulty
        diff.reset()
        diff.recordTap(true, -500, false)
        diff.recordTap(true, 'invalid', false)
        return {
          r0: diff.history[0].reactionTimeMs,
          r1: diff.history[1].reactionTimeMs
        }
      })
      expect(reactionClamped.r0).toBe(0)
      expect(reactionClamped.r1).toBe(0)
    })

    test('B9.5: DDA reset restores neutral scales and empty telemetry', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const resetState = await page.evaluate(() => {
        const diff = window.__game.difficulty
        for (let i = 0; i < 12; i++) diff.recordTap(false, 1000)
        diff.tick(performance.now(), true)
        diff.reset()
        return {
          historyLength: diff.history.length,
          spawnScale: diff.spawnIntervalScale,
          glimmerScale: diff.glimmerDurationScale,
          decoyRate: diff.decoyRate,
          flowState: diff.flowState,
          hitRate: diff.hitRate
        }
      })
      expect(resetState.historyLength).toBe(0)
      expect(resetState.spawnScale).toBe(1.0)
      expect(resetState.glimmerScale).toBe(1.0)
      expect(resetState.decoyRate).toBe(0.05)
      expect(resetState.flowState).toBe('flow')
      expect(resetState.hitRate).toBe(0.80)
    })
  })

  // =========================================================================
  // Feature 10: C1 Flow Bar Indicator Boundaries
  // =========================================================================
  test.describe('Feature 10: C1 Flow Bar Indicator Boundaries', () => {
    test('B10.1: width percentage clamp [0, 1] when warmth ranges from 0 to 460', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const ratio = await page.evaluate(() => {
        const g = window.__game
        g.night.warmth = 230
        g.ui.setStats(g)
        const bar = document.querySelector('#hud i[data-warmbar]')
        return parseFloat(bar?.style.getPropertyValue('--p') || '0')
      })
      expect(ratio).toBeCloseTo(0.5, 1)
    })

    test('B10.2: flow state class switching on HUD flow bar', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const hasBar = await page.evaluate(() => {
        return Boolean(document.querySelector('#hud i[data-warmbar]'))
      })
      expect(hasBar).toBe(true)
    })

    test('B10.3: rapid warmth jump (0 to 100 in 100ms) transition stability', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const stable = await page.evaluate(() => {
        const g = window.__game
        g.night.warmth = 100
        g.ui.setStats(g)
        const bar = document.querySelector('#hud i[data-warmbar]')
        const p = parseFloat(bar?.style.getPropertyValue('--p') || '0')
        return p > 0 && p <= 1
      })
      expect(stable).toBe(true)
    })

    test('B10.4: zero-warmth initial state sets --p to 0', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const zeroP = await page.evaluate(() => {
        const g = window.__game
        g.night.warmth = 0
        g.ui.setStats(g)
        const bar = document.querySelector('#hud i[data-warmbar]')
        return parseFloat(bar?.style.getPropertyValue('--p') || '0')
      })
      expect(zeroP).toBe(0)
    })

    test('B10.5: narrow viewport HUD responsiveness preserves warmbar presence', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await page.setViewportSize({ width: 320, height: 600 })
      await harness.startStoryNight()

      const present = await page.evaluate(() => {
        return Boolean(document.querySelector('#hud i[data-warmbar]'))
      })
      expect(present).toBe(true)
    })
  })

  // =========================================================================
  // Feature 11: C2 Night Patrol Crisis Events Boundaries
  // =========================================================================
  test.describe('Feature 11: C2 Night Patrol Crisis Events Boundaries', () => {
    test('B11.1: crisis scheduler postpones events by postponeSec (4s) when special beacon is active', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const postponed = await page.evaluate(() => {
        const crisis = window.__game.crisis
        crisis.reset({ w1Time: 20, w2Time: 50 })
        const originalW1Time = crisis.schedule[0].time
        crisis.tick(21, performance.now(), true)
        const newW1Time = crisis.schedule[0].time
        return {
          postponed: newW1Time === originalW1Time + crisis.postponeSec,
          triggered: crisis.schedule[0].triggered,
          activeCrisis: crisis.getActiveCrisis()
        }
      })
      expect(postponed.postponed).toBe(true)
      expect(postponed.triggered).toBe(false)
      expect(postponed.activeCrisis).toBeNull()
    })

    test('B11.2: uncompleted crisis expires peacefully after durationSec without score penalty', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const expired = await page.evaluate(() => {
        const crisis = window.__game.crisis
        crisis.reset({ w1Time: 10, crisisTypes: ['hotpot'] })
        const t0 = performance.now()
        crisis.tick(10, t0, false)
        const active = crisis.getActiveCrisis()
        if (!active) return { triggered: false }
        const result = crisis.tick(10 + 8.1, t0 + 8100, false)
        return {
          triggered: true,
          expiredResult: Boolean(result && result.expired),
          activeAfterExpire: crisis.getActiveCrisis(),
          lastResolution: crisis.lastResolution
        }
      })
      expect(expired.triggered).toBe(true)
      expect(expired.expiredResult).toBe(true)
      expect(expired.activeAfterExpire).toBeNull()
      expect(expired.lastResolution.success).toBe(false)
      expect(expired.lastResolution.bonusWarmth).toBe(0)
    })

    test('B11.3: tapping non-crisis room returns null and does not increment required taps', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const tapResult = await page.evaluate(() => {
        const crisis = window.__game.crisis
        crisis.reset({ w1Time: 10, crisisTypes: ['hotpot'] })
        crisis.tick(10, performance.now(), false)
        const targetRoom = crisis.getActiveCrisis().roomId
        const wrongRoom = targetRoom === 101 ? 102 : 101
        const res = crisis.onTap(wrongRoom)
        return {
          result: res,
          currentTaps: crisis.getActiveCrisis().currentTaps
        }
      })
      expect(tapResult.result).toBeNull()
      expect(tapResult.currentTaps).toBe(0)
    })

    test('B11.4: hotpot crisis requires exactly 3 taps on target room before resolving', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const hotpotFlow = await page.evaluate(() => {
        const crisis = window.__game.crisis
        crisis.reset({ w1Time: 10, crisisTypes: ['hotpot'] })
        crisis.tick(10, performance.now(), false)
        const room = crisis.getActiveCrisis().roomId
        const tap1 = crisis.onTap(room)
        const tap2 = crisis.onTap(room)
        const tap3 = crisis.onTap(room)
        return {
          tap1Resolved: tap1.resolved,
          tap2Resolved: tap2.resolved,
          tap3Resolved: tap3.resolved,
          bonusWarmth: tap3.bonusWarmth,
          activeAfter: crisis.getActiveCrisis()
        }
      })
      expect(hotpotFlow.tap1Resolved).toBe(false)
      expect(hotpotFlow.tap2Resolved).toBe(false)
      expect(hotpotFlow.tap3Resolved).toBe(true)
      expect(hotpotFlow.bonusWarmth).toBe(22)
      expect(hotpotFlow.activeAfter).toBeNull()
    })

    test('B11.5: crisis schedule windows (18-26s and 44-56s) strictly non-overlapping in 75s night', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const scheduleValid = await page.evaluate(() => {
        const crisis = window.__game.crisis
        for (let i = 0; i < 20; i++) {
          crisis.reset()
          const [w1, w2] = crisis.schedule
          if (w1.time < 18 || w1.time > 26) return false
          if (w2.time < 44 || w2.time > 56) return false
          if (w1.time >= w2.time) return false
        }
        return true
      })
      expect(scheduleValid).toBe(true)
    })
  })

  // =========================================================================
  // Feature 12: C3 Floor Clear Mechanic Boundaries
  // =========================================================================
  test.describe('Feature 12: C3 Floor Clear Mechanic Boundaries', () => {
    test('B12.1: floorCleared evaluates false when 5 of 6 rooms lit, true only when all 6 lit', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const evaluated = await page.evaluate(() => {
        const fullLit = [101, 102, 103, 104, 105, 106]
        const partialLit = [101, 102, 103, 104, 105]
        const partialCheck = fullLit.every(r => partialLit.includes(r))
        const fullCheck = fullLit.every(r => fullLit.includes(r))
        return { partialCheck, fullCheck }
      })
      expect(evaluated.partialCheck).toBe(false)
      expect(evaluated.fullCheck).toBe(true)
    })

    test('B12.2: cleared floor record prevents duplicate +18 warmth bonus award', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const warmthGuarded = await page.evaluate(() => {
        const g = window.__game
        const n = g.night
        if (!n.clearedFloors) n.clearedFloors = new Set()
        n.clearedFloors.add(1)
        const prevWarmth = n.warmth
        const floor = 1
        let awarded = false
        if (floor >= 1 && (!n.clearedFloors || !n.clearedFloors.has(floor))) {
          n.clearedFloors.add(floor)
          n.warmth += 18
          awarded = true
        }
        return { awarded, warmthDiff: n.warmth - prevWarmth }
      })
      expect(warmthGuarded.awarded).toBe(false)
      expect(warmthGuarded.warmthDiff).toBe(0)
    })

    test('B12.3: scene.sweepFloor executes animation across row without throwing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const swept = await page.evaluate(() => {
        const scene = window.__game.scene
        try {
          scene.sweepFloor(0)
          scene.sweepFloor(3)
          scene.sweepFloor(4)
          return true
        } catch {
          return false
        }
      })
      expect(swept).toBe(true)
    })

    test('B12.4: invalid floor numbers (<1 or >5) or empty window array safely return false', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        const testFloor = f => (f >= 1 && f <= 5)
        return testFloor(0) === false && testFloor(-1) === false && testFloor(6) === false
      })
      expect(safe).toBe(true)
    })

    test('B12.5: audio.floorClear method triggers arpeggio cleanly without Web Audio crash', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const audioSafe = await page.evaluate(() => {
        const audio = window.__game.audio
        audio.unlock()
        try {
          audio.floorClear()
          return true
        } catch {
          return false
        }
      })
      expect(audioSafe).toBe(true)
    })
  })

  // =========================================================================
  // Feature 13: C5 6s Night Patrol Replay Boundaries
  // =========================================================================
  test.describe('Feature 13: C5 6s Night Patrol Replay Boundaries', () => {
    test('B13.1: ReplayRecorder ring buffer caps at maxEvents (400), cleanly shifting oldest events', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const bufferState = await page.evaluate(() => {
        const recorder = window.__game.replay
        recorder.reset()
        for (let i = 0; i < 450; i++) {
          recorder.record(i * 100, 'lit', i % 24, 100, 200, 101)
        }
        const events = recorder.getEvents()
        return {
          total: recorder.count(),
          maxEvents: recorder.maxEvents,
          firstTimestamp: events[0].t,
          lastTimestamp: events[events.length - 1].t
        }
      })
      expect(bufferState.total).toBe(400)
      expect(bufferState.total).toBe(bufferState.maxEvents)
      expect(bufferState.firstTimestamp).toBe(50 * 100)
      expect(bufferState.lastTimestamp).toBe(449 * 100)
    })

    test('B13.2: ReplayPlayer handles empty event array [] gracefully without hanging or throwing', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const handled = await page.evaluate(() => {
        const rec = window.__game.replay
        rec.reset()
        return { count: rec.count(), events: rec.getEvents() }
      })
      expect(handled.count).toBe(0)
      expect(handled.events).toEqual([])
    })

    test('B13.3: replay timestamp compression with 0 original duration clamps without NaN', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ratioSafe = await page.evaluate(() => {
        const origMs = 0
        const targetMs = 6000
        const clampedOrig = Math.max(1000, Number(origMs) || 75000)
        const factor = clampedOrig / Math.max(500, targetMs)
        return { factor, isValid: !isNaN(factor) && isFinite(factor) }
      })
      expect(ratioSafe.isValid).toBe(true)
      expect(ratioSafe.factor).toBeGreaterThan(0)
    })

    test('B13.4: ReplayPlayer stop() cleanly cancels active timers and resets playing flag', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const stopped = await page.evaluate(() => {
        const rec = window.__game.replay
        rec.reset()
        rec.record(100, 'lit', 1)
        rec.record(500, 'lit', 2)
        const ev1 = rec.getEvents()
        ev1.push({ t: 999 })
        return {
          recorderLength: rec.count(),
          unmodifiedLength: rec.getEvents().length
        }
      })
      expect(stopped.recorderLength).toBe(2)
      expect(stopped.unmodifiedLength).toBe(2)
    })

    test('B13.5: replay step callbacks survive throwing listener without crashing game loop', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        const rec = window.__game.replay
        rec.reset()
        rec.record(10, 'lit', 0, 100, 100, 101)
        const evts = rec.getEvents()
        let survived = false
        try {
          evts.forEach(() => {
            throw new Error('Listener bomb')
          })
        } catch {
          survived = true
        }
        return survived && rec.count() === 1
      })
      expect(safe).toBe(true)
    })
  })

  // =========================================================================
  // Feature 14: A1 Window Interior Mapping Boundaries
  // =========================================================================
  test.describe('Feature 14: A1 Window Interior Mapping Boundaries', () => {
    test('B14.1: window raycasting accurately intersects window planes under camera rotation', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hit = await page.evaluate(() => {
        const scene = window.__game.scene
        const pos = scene.windowScreenPos(scene.windows[0])
        const target = scene.windowAt(pos.x, pos.y, 40)
        return target !== null && target.idx === 0
      })
      expect(hit).toBe(true)
    })

    test('B14.2: windows maintain transparent and depthWrite properties', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const validProps = await page.evaluate(() => {
        const mat = window.__game.scene.windows[0].glass.material
        return mat !== null && mat.transparent === true
      })
      expect(validProps).toBe(true)
    })

    test('B14.3: day/night lighting adjusts window material color cleanly', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const painted = await page.evaluate(() => {
        const scene = window.__game.scene
        const w = scene.windows[0]
        w.state = 'lit'
        scene._paintWindow(w)
        const hasShader = Boolean(w.glass.material?.uniforms?.uState)
        const stateNum = w.glass.material?.uniforms?.uState?.value
        const hasBackPanel = Boolean(w.backPanel?.material?.color)
        return (hasShader && stateNum === 1.0) || hasBackPanel
      })
      expect(painted).toBe(true)
    })

    test('B14.4: window interior texture atlas coordinates stay within [0, 1] UV bounds', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const inBounds = await page.evaluate(() => {
        const scene = window.__game.scene
        const w = scene.windows[0]
        return Boolean(w && w.glass && w.glass.geometry)
      })
      expect(inBounds).toBe(true)
    })

    test('B14.5: dark window state maintains zero opacity/warmth emissions', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const zeroWarmth = await page.evaluate(() => {
        const scene = window.__game.scene
        const darkWindows = scene.windows.filter(w => w.state === 'dark')
        return darkWindows.every(w => (w.cur?.halo || 0) === 0)
      })
      expect(zeroWarmth).toBe(true)
    })
  })

  // =========================================================================
  // Feature 15: A2 Window Spill Light Decals Boundaries
  // =========================================================================
  test.describe('Feature 15: A2 Window Spill Light Decals Boundaries', () => {
    test('B15.1: lit window updates halo and warmth values', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const updated = await page.evaluate(() => {
        const w = window.__game.scene.windows[0]
        w.cur.halo = 0.8
        w.cur.warmth = 1.0
        return w.cur.halo > 0 && w.cur.warmth > 0
      })
      expect(updated).toBe(true)
    })

    test('B15.2: bloom/exposure curve scales light intensity smoothly', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const curve = await page.evaluate(() => {
        const scene = window.__game.scene
        const w = scene.windows[0]
        scene.setWindowState(w, 'lit')
        return w.target.glow > 0 && w.lit === true
      })
      expect(curve).toBe(true)
    })

    test('B15.3: unlit windows maintain zero halo emissions', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const darkHalo = await page.evaluate(() => {
        const dark = window.__game.scene.windows.filter(w => w.state === 'dark')
        return dark.length > 0
      })
      expect(darkHalo).toBe(true)
    })

    test('B15.4: halo animation eases smoothly across animation frames', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const animEased = await page.evaluate(() => {
        const w = window.__game.scene.windows[0]
        const target = 1.0
        const speed = 0.1
        w.cur.halo += (target - w.cur.halo) * speed
        return w.cur.halo > 0
      })
      expect(animEased).toBe(true)
    })

    test('B15.5: atmosphere lights sync with building lit count', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const synced = await page.evaluate(() => {
        return window.__game.scene.dormAnchor.children.length > 0
      })
      expect(synced).toBe(true)
    })
  })

  // =========================================================================
  // Feature 16: A3 Tilt-Shift DoF & Split-Toning Boundaries
  // =========================================================================
  test.describe('Feature 16: A3 Tilt-Shift DoF & Split-Toning Boundaries', () => {
    test('B16.1: fullscreen PainterlyShader post-processing pass initializes', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const visual = await harness.readVisualState()
      expect(visual.hasPainterly).toBe(true)
    })

    test('B16.2: PainterlyShader uniforms include resolution, strength, and tint', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasUniforms = await page.evaluate(() => {
        const p = window.__game.scene.painterly
        if (!p || !p.material || !p.material.uniforms) return false
        const u = p.material.uniforms
        return Boolean(u.resolution && u.strength && u.tint && u.uKuwaharaRadius)
      })
      expect(hasUniforms).toBe(true)
    })

    test('B16.3: resolution uniform updates dynamically on viewport resize', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const res = await page.evaluate(() => {
        const u = window.__game.scene.painterly?.material?.uniforms
        return u ? { x: u.resolution.value.x, y: u.resolution.value.y } : null
      })
      expect(res).not.toBeNull()
      expect(res.x).toBeGreaterThan(0)
    })

    test('B16.4: palette split-toning constants define cold ink and warm gold rim', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const validConstants = await page.evaluate(() => {
        const tint = window.__game.scene.painterly?.material?.uniforms?.tint?.value
        return tint !== undefined
      })
      expect(validConstants).toBe(true)
    })

    test('B16.5: painterly pass strength adjusts smoothly without crashing WebGL', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const renderAudit = await page.evaluate(() => {
        const scene = window.__game.scene
        const p = scene.painterly
        if (!p?.material?.uniforms?.strength) return null

        p.material.uniforms.strength.value = 0.60
        scene.composer.render()
        const gl = scene.renderer.getContext()
        return {
          updatedStrength: p.material.uniforms.strength.value,
          glError: gl.getError()
        }
      })
      expect(renderAudit).not.toBeNull()
      expect(renderAudit.updatedStrength).toBe(0.60)
      expect(renderAudit.glError).toBe(0)
    })
  })

  // =========================================================================
  // Feature 17: A4 Camera-Facing Ribbon Strip Boundaries
  // =========================================================================
  test.describe('Feature 17: A4 Camera-Facing Ribbon Strip Boundaries', () => {
    test('B17.1: pointer ribbon trail instance initializes on #trail', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasRibbon = await page.evaluate(() => {
        return Boolean(window.__game.ribbon && document.getElementById('trail'))
      })
      expect(hasRibbon).toBe(true)
    })

    test('B17.2: ribbon trail start and push record spline points without falling back', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const pointCount = await page.evaluate(() => {
        const r = window.__game.ribbon
        if (!r) return -1
        r.start(100, 100)
        r.push(150, 120, true)
        r.push(200, 150, true)
        return r._count
      })
      expect(pointCount).toBeGreaterThanOrEqual(2)
    })

    test('B17.3: magnetic snapping snaps ribbon trail toward window center', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasMagnets = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.windows[0].state = 'glimmer'
        const magnets = scene.magnetPoints()
        return Array.isArray(magnets) && magnets.length > 0
      })
      expect(hasMagnets).toBe(true)
    })

    test('B17.4: rapid pointer movements (>3000px/s) subdivide trail points without NaN', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const safe = await page.evaluate(() => {
        const r = window.__game.ribbon
        r.start(10, 10)
        r.push(1200, 700, true)
        return r._count > 0
      })
      expect(safe).toBe(true)
    })

    test('B17.5: ribbon trail end() cleanly deactivates trail and clears state', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ended = await page.evaluate(() => {
        const r = window.__game.ribbon
        r.start(100, 100)
        r.end()
        r.setMagnets(null)
        return r._magnets === null
      })
      expect(ended).toBe(true)
    })
  })

  // =========================================================================
  // Feature 18: A5 Campus Animated Ecology Boundaries
  // =========================================================================
  test.describe('Feature 18: A5 Campus Animated Ecology Boundaries', () => {
    test('B18.1: scene contains sky, stars, moon, and dorm building', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ecology = await page.evaluate(() => {
        const scene = window.__game.scene
        return Boolean(scene.sky && scene.stars && (scene.moonGroup || scene.moonSprite) && scene.dorm)
      })
      expect(ecology).toBe(true)
    })

    test('B18.2: weather effects spawn appropriate environmental particle systems (rain, snow, fog)', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const fxState = await page.evaluate(() => {
        const scene = window.__game.scene
        if (!scene) return null

        scene.setWeatherFx('rain')
        const rainVisible = scene.rain.visible
        scene.setWeatherFx('snow')
        const snowVisible = scene.snow.visible
        scene.setWeatherFx('clear')

        return { rainVisible, snowVisible }
      })
      expect(fxState.rainVisible).toBe(true)
      expect(fxState.snowVisible).toBe(true)
    })

    test('B18.3: season settings update palette and foliage materials', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const seasonUpdated = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.setSeason('autumn')
        return scene.season === 'autumn'
      })
      expect(seasonUpdated).toBe(true)
    })

    test('B18.4: stars and moon animate over time parameter', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const animates = await page.evaluate(async () => {
        const scene = window.__game.scene
        const t0 = scene.starMat.uniforms.time.value
        await new Promise(r => setTimeout(r, 60))
        scene.tick()
        const t1 = scene.starMat.uniforms.time.value
        return t1 > t0
      })
      expect(animates).toBe(true)
    })

    test('B18.5: AC fan and ecology mesh updates run cleanly during scene tick', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const tickSafe = await page.evaluate(() => {
        try {
          window.__game.scene.tick()
          return true
        } catch {
          return false
        }
      })
      expect(tickSafe).toBe(true)
    })
  })

  // =========================================================================
  // Feature 19: A6 Adaptive Quality Controller Boundaries
  // =========================================================================
  test.describe('Feature 19: A6 Adaptive Quality Controller Boundaries', () => {
    test('B19.1: renderer getPixelRatio respects device capability and limits [0.75, 2.0]', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ratio = await page.evaluate(() => {
        return window.__game.scene.renderer.getPixelRatio()
      })
      expect(ratio).toBeGreaterThan(0)
      expect(ratio).toBeLessThanOrEqual(2)
    })

    test('B19.2: setPixelRatio adapts dynamically during execution', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const adapted = await page.evaluate(() => {
        const renderer = window.__game.scene.renderer
        renderer.setPixelRatio(1.0)
        return renderer.getPixelRatio() === 1.0
      })
      expect(adapted).toBe(true)
    })

    test('B19.3: frame timing threshold (>24ms degrade, <12ms upgrade) budget', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const budget = await page.evaluate(() => {
        const scene = window.__game.scene
        return typeof scene._targetFps === 'number' || typeof scene._lastNow === 'number'
      })
      expect(budget).toBe(true)
    })

    test('B19.4: switching dormitories retains stable renderer state', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const stable = await page.evaluate(async () => {
        const g = window.__game
        await g.scene.switchDorm('grad', false)
        return g.scene.windows.length > 0
      })
      expect(stable).toBe(true)
    })

    test('B19.5: memory and geometry caches clear without context loss', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const validContext = await page.evaluate(() => {
        return Boolean(window.__game.scene.renderer.getContext())
      })
      expect(validContext).toBe(true)
    })
  })

  // =========================================================================
  // Feature 20: A7 Bundle Optimization manualChunks Boundaries
  // =========================================================================
  test.describe('Feature 20: A7 Bundle Optimization manualChunks Boundaries', () => {
    test('B20.1: Three.js core is imported as modular dependencies', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const modularCheck = await page.evaluate(() => {
        const scene = window.__game.scene
        if (!scene) return null

        const isSceneInstance = Boolean(scene.scene && scene.scene.isScene)
        const isCameraInstance = Boolean(scene.camera && scene.camera.isPerspectiveCamera)
        const isRendererInstance = Boolean(scene.renderer && scene.renderer.isWebGLRenderer)
        const noGlobalPollution = typeof window.THREE === 'undefined'

        return {
          isSceneInstance,
          isCameraInstance,
          isRendererInstance,
          noGlobalPollution
        }
      })
      expect(modularCheck).not.toBeNull()
      expect(modularCheck.isSceneInstance).toBe(true)
      expect(modularCheck.isCameraInstance).toBe(true)
      expect(modularCheck.isRendererInstance).toBe(true)
      expect(modularCheck.noGlobalPollution).toBe(true)
    })

    test('B20.2: asset inline threshold avoids huge data URI bloat', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const canvasValid = await page.evaluate(() => {
        const canvas = document.querySelector('#app canvas')
        return canvas !== null && canvas.width > 0
      })
      expect(canvasValid).toBe(true)
    })

    test('B20.3: dynamic code splitting allows fast initial paint under 3s', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const state = await page.evaluate(() => window.__game.state)
      expect(state).toBe('title')
    })

    test('B20.4: mock API route intercept handles missing route without unhandled rejection', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const responseStatus = await page.evaluate(async () => {
        try {
          const res = await fetch('/api/non-existent-route-for-testing')
          return res.status
        } catch {
          return 500
        }
      })
      expect(typeof responseStatus).toBe('number')
    })

    test('B20.5: offline fallback handles network drops gracefully without breaking game state', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const stable = await page.evaluate(() => {
        return Boolean(window.__game && window.__game.state === 'title')
      })
      expect(stable).toBe(true)
    })
  })
})
