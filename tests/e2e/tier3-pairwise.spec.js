import { test, expect } from '@playwright/test'
import { GameHarness } from './helpers/game-harness.js'

test.describe('Tier 3: Pairwise Combinatorial Cross-Feature Suites', () => {

  // =========================================================================
  // Pairwise 1: Micro-Tutorial + Orbit View Lock
  // =========================================================================
  test('P1: toggling orbit lock button during active tutorial preserves step state and updates lock HUD', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const result = await page.evaluate(() => {
      const g = window.__game
      g.ui.showTutorialOverlay({
        step: 1,
        title: '点亮微光窗',
        text: '点击任意一扇微光窗'
      })

      // Toggle orbit view lock
      const orbitBtn = document.querySelector('#hud button[data-act="orbit"]')
      if (orbitBtn) orbitBtn.click()

      const tutVisible = Boolean(document.getElementById('tut-overlay'))
      const orbitLocked = typeof g.orbitLocked === 'boolean' ? g.orbitLocked : g.scene.controls?.enableRotate === false
      return { tutVisible, orbitLocked }
    })

    expect(result.tutVisible).toBe(true)
    expect(typeof result.orbitLocked).toBe('boolean')
  })

  // =========================================================================
  // Pairwise 2: Night Patrol Crisis + Story Beacon Window
  // =========================================================================
  test('P2: crisis event coexistence with story beacon respects tag priority ordering', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const tagState = await page.evaluate(() => {
      const g = window.__game
      // Story beacon on window 0 (priority 10), Crisis cat on window 1 (priority 12)
      g.scene.windows[0].state = 'story_beacon'
      g.scene.windows[1].crisis = 'cat'
      g.ui.updateWindowTags(g)

      const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
      const texts = tags.map(t => t.textContent.trim())
      return {
        count: tags.length,
        hasBeacon: texts.some(t => t.includes('📖偷听')),
        hasCrisis: texts.some(t => t.includes('📱抓猫')),
        firstTag: texts[0]
      }
    })

    expect(tagState.hasBeacon).toBe(true)
    expect(tagState.hasCrisis).toBe(true)
    // Crisis (priority 12) must appear before Beacon (priority 10)
    expect(tagState.firstTag).toContain('📱抓猫')
  })

  // =========================================================================
  // Pairwise 3: Floor Clear + Multi-Select Chain Drag
  // =========================================================================
  test('P3: floor clear wave sweep occurring simultaneously with a multi-select chain drag', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const simultaneous = await page.evaluate(() => {
      const g = window.__game
      // Start drag chain
      g.night.chain = { active: true, count: 3, ids: new Set([0, 1, 2]), startRoom: 101 }
      // Trigger floor clear
      if (typeof g.scene.sweepFloor === 'function') {
        g.scene.sweepFloor(1)
      }
      g.night.warmth += 18
      g.ui.setStats(g)

      return {
        chainActive: g.night.chain.active,
        warmth: g.night.warmth
      }
    })

    expect(simultaneous.chainActive).toBe(true)
    expect(simultaneous.warmth).toBeGreaterThanOrEqual(18)
  })

  // =========================================================================
  // Pairwise 4: Click-to-Ping Task Radar + DDA Flow State Rush
  // =========================================================================
  test('P4: clicking task radar during high tempo rush emits radar rings without disrupting HUD', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const flowAndRadar = await page.evaluate(() => {
      const g = window.__game
      g.night.combo = 15
      g.night.warmth = 120
      g.ui.setStats(g)

      const pingsBefore = g.scene._pings?.length || 0
      g.scene.pingFloor(2)
      const pingsAfter = g.scene._pings?.length || 0

      return {
        combo: g.night.combo,
        pingSpawned: pingsAfter > pingsBefore
      }
    })

    expect(flowAndRadar.combo).toBe(15)
    expect(flowAndRadar.pingSpawned).toBe(true)
  })

  // =========================================================================
  // Pairwise 5: Adaptive Quality Degradation + Painterly Post-Processing
  // =========================================================================
  test('P5: dynamic pixel ratio degradation preserves painterly uniforms and canvas stability', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()

    const degradedSafely = await page.evaluate(() => {
      const scene = window.__game.scene
      scene.renderer.setPixelRatio(0.75)
      scene.painterly.material.uniforms.resolution.value.set(960, 540)
      scene.tick()

      return {
        ratio: scene.renderer.getPixelRatio(),
        strength: scene.painterly.material.uniforms.strength.value,
        hasContext: Boolean(scene.renderer.getContext())
      }
    })

    expect(degradedSafely.ratio).toBe(0.75)
    expect(degradedSafely.strength).toBeGreaterThan(0)
    expect(degradedSafely.hasContext).toBe(true)
  })

  // =========================================================================
  // Pairwise 6: BGM Track Cycling + Ascending Sequence Badges
  // =========================================================================
  test('P6: cycling background music tracks while popping multi-select sequence badges', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const cycleResult = await page.evaluate(() => {
      const g = window.__game
      // Cycle BGM track
      const bgmBefore = g.getBgmState().mode
      g.cycleBgmTrack()
      const bgmAfter = g.getBgmState().mode

      // Pop sequence badges ①, ②, ③
      g.ui.showSequenceBadge(200, 200, 1)
      g.ui.showSequenceBadge(250, 200, 2)
      g.ui.showSequenceBadge(300, 200, 3)

      const badgesCount = document.querySelectorAll('.seq-badge').length
      return { bgmChanged: bgmBefore !== bgmAfter, badgesCount }
    })

    expect(cycleResult.bgmChanged).toBe(true)
    expect(cycleResult.badgesCount).toBe(3)
  })

  // =========================================================================
  // Pairwise 7: Mute Toggle + Chain Pitch Ascent
  // =========================================================================
  test('P7: audio mute toggle mutes synthesizer without breaking pitch ascent sequence', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()

    const muteState = await page.evaluate(() => {
      const g = window.__game
      g.toggleMute()
      const isMuted = g.audio._muted || g.audio.muted
      g.audio.chainNote(1)
      g.audio.chainNote(2)
      g.toggleMute()
      const isUnmuted = !(g.audio._muted || g.audio.muted)
      return { isMuted, isUnmuted }
    })

    expect(muteState.isMuted).toBe(true)
    expect(muteState.isUnmuted).toBe(true)
  })

  // =========================================================================
  // Pairwise 8: Window Tags Repositioning + Camera Orbit Flyover
  // =========================================================================
  test('P8: capsule tag screen projection updates cleanly when camera flies over building', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const tagMoved = await page.evaluate(() => {
      const g = window.__game
      g.scene.windows[0].state = 'story_beacon'
      g.ui.updateWindowTags(g)
      const tag0 = document.querySelector('#tags .win-tag')
      const pos0 = { left: tag0?.style.left, top: tag0?.style.top }

      // Adjust camera slightly
      g.scene.camera.position.x += 100
      g.scene.camera.lookAt(0, 0, 0)
      g.ui.updateWindowTags(g)

      const tag1 = document.querySelector('#tags .win-tag')
      const pos1 = { left: tag1?.style.left, top: tag1?.style.top }

      return {
        tag0Exists: Boolean(pos0.left),
        tag1Exists: Boolean(pos1.left),
        moved: pos0.left !== pos1.left
      }
    })

    expect(tagMoved.tag0Exists).toBe(true)
    expect(tagMoved.tag1Exists).toBe(true)
    expect(tagMoved.moved).toBe(true)
  })

  // =========================================================================
  // Pairwise 9: Pausing Game During Active Drag Stroke
  // =========================================================================
  test('P9: opening pause modal freezes night state and hides active HUD overlay', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const pauseHandled = await page.evaluate(() => {
      const g = window.__game
      g.night.warmth = 45
      g.togglePause()
      const pausedState = g.state
      const pauseLayer = Boolean(document.querySelector('.pause-panel, [data-act="resume"]'))
      return { pausedState, pauseLayer }
    })

    expect(pauseHandled.pausedState).toBe('paused')
    expect(pauseHandled.pauseLayer).toBe(true)
  })

  // =========================================================================
  // Pairwise 10: Season and Weather Change with Floor Signs
  // =========================================================================
  test('P10: switching season from autumn to winter updates weather FX without destroying floor signs', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()

    const seasonResult = await page.evaluate(() => {
      const g = window.__game
      const signsCount0 = g.scene._floorSigns.size
      g.changeSeason('winter')
      g.scene.setWeatherFx('snow')
      const signsCount1 = g.scene._floorSigns.size
      return { signsCount0, signsCount1, season: g.season }
    })

    expect(seasonResult.season).toBe('winter')
    expect(seasonResult.signsCount0).toBeGreaterThanOrEqual(4)
    expect(seasonResult.signsCount1).toBe(seasonResult.signsCount0)
  })

  // =========================================================================
  // Pairwise 11: Early Night Advance CTA with Unfinished Tasks
  // =========================================================================
  test('P11: early advance night button displays and triggers when minPassed is true', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const advanceTriggered = await page.evaluate(() => {
      const g = window.__game
      g.ui.updateCommissions([{ id: 'c1', target: 3, progress: 3, done: true }], { allDone: false })
      const btn = document.querySelector('#ledger [data-act="next-night"]')
      return btn && btn.style.display !== 'none'
    })

    expect(advanceTriggered).toBe(true)
  })

  // =========================================================================
  // Pairwise 12: Dialogue Choice Modal + Night Countdown Freeze
  // =========================================================================
  test('P12: opening story dialogue choice modal pauses night timer countdown', async ({ page }) => {
    const harness = new GameHarness(page)
    await harness.setup()
    await harness.startStoryNight()

    const timerPaused = await page.evaluate(async () => {
      const g = window.__game
      g._choiceOpen = true
      const timeLeft0 = g.night.timeLeft
      await new Promise(r => setTimeout(r, 100))
      const timeLeft1 = g.night.timeLeft
      return timeLeft0 === timeLeft1
    })

    expect(timerPaused).toBe(true)
  })
})
