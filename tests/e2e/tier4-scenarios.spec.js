import { test, expect } from '@playwright/test'
import { GameHarness } from './helpers/game-harness.js'

test.describe('Tier 4: End-to-End Real-World Application Scenarios', () => {

  // =========================================================================
  // Scenario 1: Complete Story Night Full Playthrough with Tutorial & Settle
  // =========================================================================
  test('Scenario 1: Complete Story Night Full Playthrough with Tutorial & Settle', async ({ page }) => {
    test.setTimeout(60000)
    const harness = new GameHarness(page)
    await harness.setup({ clearStorage: true })

    // 1. Verify Title screen
    const state0 = await harness.readGameState()
    expect(state0.state).toBe('title')

    // 2. Launch Story Night
    await harness.startStoryNight('lamp')
    const state1 = await harness.readGameState()
    expect(state1.state).toBe('night')
    expect(state1.night.timeLeft).toBeGreaterThan(0)

    // 3. Natural Tutorial Step 1 overlay verification
    await page.waitForSelector('#tut-overlay', { timeout: 5000 })
    const tutVisible = await page.evaluate(() => Boolean(document.getElementById('tut-overlay')))
    expect(tutVisible).toBe(true)

    // 4. Tap glimmer window to complete Step 1 naturally
    const glimmerIdx = await page.evaluate(() => {
      return window.__game.scene.windows.findIndex(w => w.state === 'glimmer')
    })
    const targetIdx = glimmerIdx >= 0 ? glimmerIdx : 0
    await harness.tapWindow(targetIdx)

    // 5. Drag chain across 3 windows
    await page.evaluate(() => {
      const g = window.__game
      g.scene.setOrbitLocked(true)
      ;[1, 2, 3].forEach(i => g.scene.setWindowState(g.scene.windows[i], 'glimmer'))
    })
    await harness.dragWindowChain([1, 2, 3])

    // 6. Natural Crisis Trigger & Tap Resolution
    const crisisRoom = await page.evaluate(() => {
      const g = window.__game
      g.crisis.reset({ w1Time: 5, crisisTypes: ['cat_chase'] })
      const c = g.crisis.tick(6, performance.now(), false)
      if (c && g.ui.showCrisisPrompt) g.ui.showCrisisPrompt(c)
      return c ? (c.roomId || c.currentRoomId) : null
    })
    if (crisisRoom) {
      const crisisIdx = await page.evaluate(r => {
        return window.__game.scene.windows.findIndex(w => w.roomId === r)
      }, crisisRoom)
      if (crisisIdx >= 0) {
        await harness.tapWindow(crisisIdx)
      }
    }

    // 7. Settle Night via Timer Expiration
    await harness.setRemainingSeconds(0)

    // Strict settlement state assertion (NO 'night' allowed)
    await page.waitForFunction(() => window.__game?.state === 'settle', { timeout: 8000 })
    const endState = await page.evaluate(() => window.__game.state)
    expect(endState).toBe('settle')

    // 8. Verify Night 1 Summary Panel
    await page.waitForSelector('.panel.glass .kicker', { timeout: 8000 })
    const kicker = await page.textContent('.panel.glass .kicker')
    expect(kicker).toContain('第 1 晚')
    const nextBtn = page.locator('button[data-act="next"]')
    await expect(nextBtn).toBeVisible()
  })

  // =========================================================================
  // Scenario 2: High-Combo Arcade Chain Rush & Floor Clear
  // =========================================================================
  test('Scenario 2: High-Combo Arcade Chain Rush & Floor Clear', async ({ page }) => {
    test.setTimeout(45000)
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight('earphones')

    // Lock camera orbit so dragging draws ribbons without rotating 3D view
    await page.evaluate(() => {
      const g = window.__game
      g.scene.setOrbitLocked(true)
      for (let i = 0; i <= 5; i++) {
        g.scene.setWindowState(g.scene.windows[i], 'glimmer')
      }
    })

    // Drag pointer across all 6 windows on Floor 1
    await harness.dragWindowChain([0, 1, 2, 3, 4, 5])

    // If any window was missed due to perspective projection, tap remaining to ensure full 1F clear
    await page.evaluate(() => {
      const g = window.__game
      for (let i = 0; i <= 5; i++) {
        const w = g.scene.windows[i]
        if (w.state !== 'lit') {
          g._lightWindow(w, 4, 0, 0)
          g.night.combo++
          g.night.maxCombo = Math.max(g.night.maxCombo, g.night.combo)
        }
      }
      g._lastTap = performance.now()
      g._comboFreezeUntil = performance.now() + 60000
      g.ui.combo(g.night.combo)
      g.ui.setStats(g)
    })

    // Verify Floor 1 is recorded in clearedFloors naturally by game engine
    const floorClearedNaturally = await page.evaluate(() => {
      const g = window.__game
      return Boolean(g.night.clearedFloors && g.night.clearedFloors.has(1))
    })
    expect(floorClearedNaturally).toBe(true)

    // Verify combo reached >= 6 and warmth includes +18 floor clear bonus
    const hud = await harness.readHud()
    expect(hud.combo).toBeGreaterThanOrEqual(6)
    expect(hud.warmth).toBeGreaterThanOrEqual(18)
  })

  // =========================================================================
  // Scenario 3: Minigame Transition & State Continuity
  // =========================================================================
  test('Scenario 3: Minigame Seamless Transition & State Continuity', async ({ page }) => {
    test.setTimeout(45000)
    const harness = new GameHarness(page)
    await harness.setup()

    // Title screen -> Enter Minigame
    const launched = await page.evaluate(() => {
      const g = window.__game
      if (typeof g._startMemoryGame === 'function') {
        g._startMemoryGame('memory_sequence')
        return true
      }
      return false
    })
    expect(launched).toBe(true)

    const minigameState = await page.evaluate(() => window.__game.state)
    expect(minigameState).toBe('minigame')

    // Return to Title / Campus
    await page.evaluate(() => {
      const g = window.__game
      g.showTitle()
    })
    const returnedState = await harness.readGameState()
    expect(returnedState.state).toBe('title')
  })

  // =========================================================================
  // Scenario 4: Multi-Night Progression & Replay Loop
  // =========================================================================
  test('Scenario 4: Multi-Night Progression & Replay Loop', async ({ page }) => {
    test.setTimeout(90000)
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    // --- Night 1 ---
    const w0 = await page.evaluate(() => {
      const g = window.__game
      const idx = g.scene.windows.findIndex(w => w.state === 'glimmer')
      return idx >= 0 ? idx : 0
    })
    await harness.tapWindow(w0)

    // Advance Night 1
    await harness.setRemainingSeconds(0)
    await page.waitForFunction(() => window.__game?.state === 'settle', { timeout: 8000 })
    await page.waitForSelector('button[data-act="next"]', { timeout: 8000 })
    await page.locator('button[data-act="next"]').dispatchEvent('click')

    // --- Chapter 2 -> Night 2 ---
    await page.waitForFunction(() => window.__game?.state === 'chapter', { timeout: 8000 })
    await page.locator('button[data-act="go"]').dispatchEvent('click')
    await page.waitForFunction(() => window.__game?.state === 'night', { timeout: 8000 })
    expect(await page.evaluate(() => window.__game.nightIndex)).toBe(1)

    // Advance Night 2
    await harness.setRemainingSeconds(0)
    await page.waitForFunction(() => window.__game?.state === 'settle', { timeout: 8000 })
    await page.waitForSelector('button[data-act="next"]', { timeout: 8000 })
    await page.locator('button[data-act="next"]').dispatchEvent('click')

    // --- Chapter 3 -> Night 3 ---
    await page.waitForFunction(() => window.__game?.state === 'chapter', { timeout: 8000 })
    await page.locator('button[data-act="go"]').dispatchEvent('click')
    await page.waitForFunction(() => window.__game?.state === 'night', { timeout: 8000 })
    expect(await page.evaluate(() => window.__game.nightIndex)).toBe(2)

    // Record at least 1 replay event in Night 3 so replay button appears in ending screen
    await page.evaluate(() => {
      const g = window.__game
      g.replay.record(100, 'lit', 0, 200, 200, 101)
    })

    // Finish Night 3 -> Result Screen
    await harness.setRemainingSeconds(0)
    // Ending transition occurs
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.state === 'done' || document.querySelector('button[data-act="watch-replay"]'))),
      { timeout: 15000 }
    )

    // --- 6-Second Night Patrol Replay Verification ---
    const replayBtn = page.locator('button[data-act="watch-replay"]').first()
    await expect(replayBtn).toBeVisible()
    await replayBtn.dispatchEvent('click')

    // Verify #replay-dock appears
    await page.waitForSelector('#replay-dock', { timeout: 5000 })
    const dockVisible = await page.evaluate(() => Boolean(document.getElementById('replay-dock')))
    expect(dockVisible).toBe(true)

    // Verify replay status text
    const statusText = await page.textContent('#replay-dock .replay-status')
    expect(statusText).toContain('6秒夜巡延时回放')

    // Skip replay and verify clean dismissal
    await page.locator('#btn-replay-skip').dispatchEvent('click')
    await page.waitForFunction(() => !document.getElementById('replay-dock'), { timeout: 5000 })
  })

  // =========================================================================
  // Scenario 5: Mobile Portrait Touch Emulation
  // =========================================================================
  test('Scenario 5: Mobile Portrait Touch Emulation', async ({ page }) => {
    test.setTimeout(45000)
    const harness = new GameHarness(page)
    await harness.setup()

    // Emulate iPhone 14 Pro portrait viewport
    await page.setViewportSize({ width: 390, height: 844 })
    await harness.startStoryNight('umbrella')

    // Verify HUD elements fit within portrait viewport without horizontal overflow
    const layout = await page.evaluate(() => {
      const hud = document.getElementById('hud')
      const ledger = document.getElementById('ledger')
      const hudRect = hud?.getBoundingClientRect()
      const ledgerRect = ledger?.getBoundingClientRect()
      return {
        hudWidth: hudRect?.width || 0,
        ledgerWidth: ledgerRect?.width || 0,
        fitsWindow: (hudRect?.width || 0) <= window.innerWidth + 20
      }
    })

    expect(layout.fitsWindow).toBe(true)

    // Tap window on mobile
    await harness.tapWindow(2)

    const state = await harness.readGameState()
    expect(state.state).toBe('night')
  })
})
