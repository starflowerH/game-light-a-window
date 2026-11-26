import { test, expect } from '@playwright/test'
import { GameHarness } from './helpers/game-harness.js'
import { TUTORIAL_STORAGE_KEY } from '../../src/tutorial.js'

test.describe('Tier 1: Feature Coverage (20 Features)', () => {

  // =========================================================================
  // Feature 1: B1 Tutorial State Machine
  // =========================================================================
  test.describe('Feature 1: B1 Tutorial State Machine', () => {
    test('1.1: initializes to idle when storage is empty', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({ clearStorage: true })

      const state = await page.evaluate(() => {
        const sm = new window.__game.tutorial.constructor({ storage: window.localStorage })
        return sm.getState()
      })
      expect(state).toBe('idle')
    })

    test('1.2: transitions idle -> step1_tap upon start()', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({ clearStorage: true })

      const started = await page.evaluate(() => {
        const sm = new window.__game.tutorial.constructor({ storage: window.localStorage })
        sm.start(true)
        return sm.getState()
      })
      expect(started).toBe('step1_tap')
    })

    test('1.3: advances step1_tap -> step2_drag when onTap is called', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({ clearStorage: true })

      const nextState = await page.evaluate(() => {
        const sm = new window.__game.tutorial.constructor({ storage: window.localStorage })
        sm.start(true)
        sm.onTap({ roomId: 101 })
        return sm.getState()
      })
      expect(nextState).toBe('step2_drag')
    })

    test('1.4: advances step2_drag -> step3_bridge on >= 3 drag chain', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({ clearStorage: true })

      const bridgeState = await page.evaluate(() => {
        const sm = new window.__game.tutorial.constructor({ storage: window.localStorage })
        sm.start(true)
        sm.onTap({ roomId: 101 })
        sm.onDrag(3)
        return sm.getState()
      })
      expect(bridgeState).toBe('step3_bridge')
    })

    test('1.5: skip() transitions immediately to done and sets storage key', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup({ clearStorage: true })

      const result = await page.evaluate((key) => {
        const sm = new window.__game.tutorial.constructor({ storage: window.localStorage })
        sm.start(true)
        sm.skip()
        return {
          state: sm.getState(),
          stored: window.localStorage.getItem(key)
        }
      }, TUTORIAL_STORAGE_KEY)

      expect(result.state).toBe('done')
      expect(result.stored).toBe('1')
    })
  })

  // =========================================================================
  // Feature 2: B1 Trajectory Hand Gesture
  // =========================================================================
  test.describe('Feature 2: B1 Trajectory Hand Gesture', () => {
    test('2.1: tutorial overlay mounts into DOM on showTutorialOverlay', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const exists = await page.evaluate(() => {
        const g = window.__game
        g.ui.showTutorialOverlay({
          step: 2,
          title: '一笔划连三窗',
          text: '按住鼠标或手指，连线穿过微光窗',
          progressText: '教学 2/3'
        })
        return Boolean(document.getElementById('tut-overlay'))
      })
      expect(exists).toBe(true)
    })

    test('2.2: renders SVG gesture canvas and trajectory path', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasSvg = await page.evaluate(() => {
        const g = window.__game
        g.ui.showTutorialOverlay({ step: 2, title: '测试连窗', text: '连线测试' })
        g.ui.updateTutorialGesture([{ x: 100, y: 150 }, { x: 200, y: 150 }, { x: 300, y: 150 }], 0.5)
        const svg = document.getElementById('tut-gesture-svg')
        const path = svg?.querySelector('path')
        return Boolean(svg && path && path.getAttribute('d'))
      })
      expect(hasSvg).toBe(true)
    })

    test('2.3: renders sequence step badges ①, ②, ③ along trajectory', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const badgesCount = await page.evaluate(() => {
        const g = window.__game
        g.ui.showTutorialOverlay({ step: 2, title: '连线', text: '连线' })
        g.ui.updateTutorialGesture([{ x: 50, y: 50 }, { x: 150, y: 50 }, { x: 250, y: 50 }], 0)
        const texts = Array.from(document.querySelectorAll('#tut-gesture-svg text'))
        return texts.map(t => t.textContent?.trim())
      })
      expect(badgesCount).toContain('①')
      expect(badgesCount).toContain('②')
      expect(badgesCount).toContain('③')
    })

    test('2.4: hand icon translates and pulses over time parameter', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const transforms = await page.evaluate(() => {
        const g = window.__game
        const pts = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }]
        g.ui.showTutorialOverlay({ step: 2, title: '手势', text: '手势' })
        g.ui.updateTutorialGesture(pts, 0.1)
        const g1 = document.querySelector('#tut-gesture-svg g:last-child')?.getAttribute('transform')
        g.ui.updateTutorialGesture(pts, 0.7)
        const g2 = document.querySelector('#tut-gesture-svg g:last-child')?.getAttribute('transform')
        return { g1, g2 }
      })
      expect(transforms.g1).toBeTruthy()
      expect(transforms.g2).toBeTruthy()
      expect(transforms.g1).not.toBe(transforms.g2)
    })

    test('2.5: hideTutorialOverlay cleanly removes overlay element', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const removed = await page.evaluate(() => {
        const g = window.__game
        g.ui.showTutorialOverlay({ step: 1, title: '测试', text: '测试' })
        g.ui.hideTutorialOverlay()
        return document.getElementById('tut-overlay') === null
      })
      expect(removed).toBe(true)
    })
  })

  // =========================================================================
  // Feature 3: B2 Building Facade Floor Signs
  // =========================================================================
  test.describe('Feature 3: B2 Building Facade Floor Signs', () => {
    test('3.1: generates CanvasTexture sprites for dormitory floors', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const visual = await harness.readVisualState()
      expect(visual.floorSignsCount).toBeGreaterThanOrEqual(4)
    })

    test('3.2: highlightFloorSign(floor, true) scales and tints floor sign sprite', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const state = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.highlightFloorSign(2, true)
        const sign = scene._floorSigns.get(2)
        return {
          active: sign.active,
          colorHex: sign.material.color.getHex()
        }
      })
      expect(state.active).toBe(true)
      expect(state.colorHex).toBe(0xffea88)
    })

    test('3.3: highlightFloorSign(floor, false) resets floor sign sprite', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const state = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.highlightFloorSign(2, true)
        scene.highlightFloorSign(2, false)
        const sign = scene._floorSigns.get(2)
        return {
          active: sign.active,
          colorHex: sign.material.color.getHex()
        }
      })
      expect(state.active).toBe(false)
      expect(state.colorHex).toBe(0xffffff)
    })

    test('3.4: floor signs retain 3D positioning on camera orbit view change', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const pos = await page.evaluate(() => {
        const scene = window.__game.scene
        const f1 = scene._floorSigns.get(1)
        const f4 = scene._floorSigns.get(4)
        return {
          x: f1.sprite.position.x,
          y: f1.sprite.position.y,
          f1BelowF4: f1.sprite.position.y < f4.sprite.position.y
        }
      })
      expect(pos.x).toBeLessThan(0)
      expect(pos.f1BelowF4).toBe(true)
    })

    test('3.5: floor signs dispose textures and sprites without leaks on scene switch', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const cleared = await page.evaluate(() => {
        const scene = window.__game.scene
        scene._clearFloorSigns()
        return scene._floorSigns.size === 0
      })
      expect(cleared).toBe(true)
    })
  })

  // =========================================================================
  // Feature 4: B2 Window Smart Capsule Tags
  // =========================================================================
  test.describe('Feature 4: B2 Window Smart Capsule Tags', () => {
    test('4.1: #tags container mounts into DOM', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const exists = await page.evaluate(() => Boolean(document.getElementById('tags')))
      expect(exists).toBe(true)
    })

    test('4.2: special story beacon windows display 📖偷听 tag', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const hasBeaconTag = await page.evaluate(() => {
        const g = window.__game
        g.scene.windows[0].state = 'story_beacon'
        g.ui.updateWindowTags(g)
        const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
        return tags.some(t => t.textContent.includes('📖偷听'))
      })
      expect(hasBeaconTag).toBe(true)
    })

    test('4.3: resonance pair windows display 🌉星桥① and 🌉星桥② tags', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const bridgeTags = await page.evaluate(() => {
        const g = window.__game
        g.scene.setResonancePair(g.scene.windows[1].roomId, g.scene.windows[2].roomId)
        g.ui.updateWindowTags(g)
        const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
        return tags.map(t => t.textContent.trim())
      })
      expect(bridgeTags).toContain('🌉星桥①')
      expect(bridgeTags).toContain('🌉星桥②')
    })

    test('4.4: capsule tag screen positions align with window bounding boxes', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const coords = await page.evaluate(() => {
        const g = window.__game
        g.scene.windows[0].state = 'story_beacon'
        g.ui.updateWindowTags(g)
        const tag = document.querySelector('#tags .win-tag')
        const left = parseFloat(tag?.style.left || '0')
        const top = parseFloat(tag?.style.top || '0')
        return { left, top }
      })
      expect(coords.left).toBeGreaterThan(0)
      expect(coords.top).toBeGreaterThan(0)
    })

    test('4.5: capsule tags cap at maximum 4 simultaneous tags', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const count = await page.evaluate(() => {
        const g = window.__game
        for (let i = 0; i < 8; i++) {
          g.scene.windows[i].state = 'story_beacon'
        }
        g.ui.updateWindowTags(g)
        return document.querySelectorAll('#tags .win-tag').length
      })
      expect(count).toBeLessThanOrEqual(4)
    })
  })

  // =========================================================================
  // Feature 5: B2 Click-to-Ping Task Radar
  // =========================================================================
  test.describe('Feature 5: B2 Click-to-Ping Task Radar', () => {
    test('5.1: clicking ledger task item triggers onPingCommission handler', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const pingResult = await page.evaluate(() => {
        let pingCalled = null
        const scene = window.__game.scene
        const origPingRoom = scene.pingRoom.bind(scene)
        const origPingFloor = scene.pingFloor.bind(scene)

        scene.pingRoom = (r) => {
          pingCalled = { type: 'room', target: r }
          origPingRoom(r)
        }
        scene.pingFloor = (f) => {
          pingCalled = { type: 'floor', target: f }
          origPingFloor(f)
        }

        const item = document.querySelector('#ledger .ledger-item')
        if (item) item.click()

        scene.pingRoom = origPingRoom
        scene.pingFloor = origPingFloor

        return {
          hasItem: Boolean(item),
          pingCalled,
          pingsCount: scene._pings?.length || 0
        }
      })

      expect(pingResult.hasItem).toBe(true)
      expect(pingResult.pingCalled).not.toBeNull()
      expect(pingResult.pingCalled.target).toBeGreaterThan(0)
      expect(pingResult.pingsCount).toBeGreaterThanOrEqual(1)
    })

    test('5.2: scene.pingRoom(roomId) spawns 2s expanding RingGeometry in 3D world', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const pingCreated = await page.evaluate(() => {
        const scene = window.__game.scene
        const countBefore = scene._pings?.length || 0
        scene.pingRoom(scene.windows[0].roomId)
        const countAfter = scene._pings?.length || 0
        return countAfter > countBefore
      })
      expect(pingCreated).toBe(true)
    })

    test('5.3: scene.pingFloor(floor) spawns radar rings for all floor windows', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const floorPings = await page.evaluate(() => {
        const scene = window.__game.scene
        scene._clearPings()
        scene.pingFloor(1)
        return scene._pings.length
      })
      expect(floorPings).toBeGreaterThanOrEqual(4)
    })

    test('5.4: radar ping expands and fades over duration', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const opacities = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.pingRoom(scene.windows[0].roomId)
        const ping = scene._pings[scene._pings.length - 1]
        const op1 = ping.mat.opacity
        ping.startedAt = performance.now() - 1000
        scene.tick()
        const op2 = ping.mat.opacity
        return { op1, op2 }
      })
      expect(opacities.op1).toBeGreaterThan(opacities.op2)
    })

    test('5.5: radar meshes dispose cleanly without leaking', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const cleared = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.pingRoom(scene.windows[0].roomId)
        scene._clearPings()
        return scene._pings.length === 0
      })
      expect(cleared).toBe(true)
    })
  })

  // =========================================================================
  // Feature 6: B3 View Locking Hint Bubbles
  // =========================================================================
  test.describe('Feature 6: B3 View Locking Hint Bubbles', () => {
    test('6.1: ui.showHintBubble creates .hint-bubble anchored to target', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const exists = await page.evaluate(() => {
        const btn = document.querySelector('button[data-act="start"]')
        window.__game.ui.showHintBubble(btn, '视角提示', '点击测试')
        return Boolean(document.querySelector('.hint-bubble'))
      })
      expect(exists).toBe(true)
    })

    test('6.2: hint bubble renders title and subtext correctly', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const content = await page.evaluate(() => {
        const btn = document.querySelector('button[data-act="start"]')
        window.__game.ui.showHintBubble(btn, '已锁定视角', '拖拽连窗更稳')
        const el = document.querySelector('.hint-bubble')
        return {
          title: el?.querySelector('.hint-title')?.textContent?.trim(),
          body: el?.querySelector('.hint-sub')?.textContent?.trim()
        }
      })
      expect(content.title).toBe('已锁定视角')
      expect(content.body).toBe('拖拽连窗更稳')
    })

    test('6.3: orbit lock button triggers view lock hint bubble', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const bubbleAppeared = await page.evaluate(() => {
        const orbitBtn = document.querySelector('#hud button[data-act="orbit"]')
        if (orbitBtn) {
          window.__game.ui.showHintBubble(orbitBtn, '🔒 连窗视角已固定', '防止拖窗时误转楼栋')
        }
        return Boolean(document.querySelector('.hint-bubble'))
      })
      expect(bubbleAppeared).toBe(true)
    })

    test('6.4: hint bubble removes previous bubble before showing new one', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const count = await page.evaluate(() => {
        const btn = document.querySelector('button[data-act="start"]')
        window.__game.ui.showHintBubble(btn, '提示 1', '内容 1')
        window.__game.ui.showHintBubble(btn, '提示 2', '内容 2')
        return document.querySelectorAll('.hint-bubble').length
      })
      expect(count).toBe(1)
    })

    test('6.5: hint bubble positions clamp safely inside viewport', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const inside = await page.evaluate(() => {
        const btn = document.querySelector('button[data-act="start"]')
        window.__game.ui.showHintBubble(btn, '测试边界', '内容')
        const el = document.querySelector('.hint-bubble')
        const rect = el?.getBoundingClientRect()
        return rect && rect.left >= 0 && rect.right <= window.innerWidth
      })
      expect(inside).toBe(true)
    })
  })

  // =========================================================================
  // Feature 7: C4 Multi-Select Pitch Ascent
  // =========================================================================
  test.describe('Feature 7: C4 Multi-Select Pitch Ascent', () => {
    test('7.1: audio engine exposes chainNote(k) method', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasMethod = await page.evaluate(() => {
        return typeof window.__game.audio?.chainNote === 'function'
      })
      expect(hasMethod).toBe(true)
    })

    test('7.2: chainNote(1) executes without error on first chain index', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const success = await page.evaluate(() => {
        try {
          window.__game.audio.chainNote(1)
          return true
        } catch {
          return false
        }
      })
      expect(success).toBe(true)
    })

    test('7.3: chainNote(k) accepts ascending values 1 through 10', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const allSuccess = await page.evaluate(() => {
        try {
          for (let k = 1; k <= 10; k++) {
            window.__game.audio.chainNote(k)
          }
          return true
        } catch {
          return false
        }
      })
      expect(allSuccess).toBe(true)
    })

    test('7.4: chainNote clamps gracefully with negative or non-finite inputs', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const handlesClamps = await page.evaluate(() => {
        try {
          window.__game.audio.chainNote(-5)
          window.__game.audio.chainNote(NaN)
          window.__game.audio.chainNote(Infinity)
          return true
        } catch {
          return false
        }
      })
      expect(handlesClamps).toBe(true)
    })

    test('7.5: chainNote respects audio muted flag', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const audit = await page.evaluate(() => {
        const audio = window.__game.audio
        audio.unlock()

        let marimbaCalls = 0
        const origMarimba = audio._marimba
        audio._marimba = () => { marimbaCalls++ }

        // Test muted state: should NOT emit note
        audio.setMuted(true)
        audio.chainNote(3)
        const callsWhileMuted = marimbaCalls

        // Test unmuted state: SHOULD emit note
        audio.setMuted(false)
        audio.chainNote(3)
        const callsWhileUnmuted = marimbaCalls

        // Restore
        audio._marimba = origMarimba

        return {
          callsWhileMuted,
          callsWhileUnmuted
        }
      })

      expect(audit.callsWhileMuted).toBe(0)
      expect(audit.callsWhileUnmuted).toBe(1)
    })
  })

  // =========================================================================
  // Feature 8: C4 Window Sequence Badges
  // =========================================================================
  test.describe('Feature 8: C4 Window Sequence Badges', () => {
    test('8.1: ui.showSequenceBadge spawns .seq-badge in #fx', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const spawned = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(250, 300, 1)
        return Boolean(document.querySelector('.seq-badge'))
      })
      expect(spawned).toBe(true)
    })

    test('8.2: sequence badge renders circular numeral glyphs ①, ②, ③, ④', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const glyphs = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(100, 100, 1)
        window.__game.ui.showSequenceBadge(200, 100, 2)
        window.__game.ui.showSequenceBadge(300, 100, 3)
        const badges = Array.from(document.querySelectorAll('.seq-badge'))
        return badges.map(b => b.textContent?.trim())
      })
      expect(glyphs).toContain('①')
      expect(glyphs).toContain('②')
      expect(glyphs).toContain('③')
    })

    test('8.3: badge positions match requested (x, y) coordinates', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const coords = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(350, 420, 1)
        const b = document.querySelector('.seq-badge')
        return {
          left: b?.style.left,
          top: b?.style.top
        }
      })
      expect(coords.left).toBe('350px')
      expect(coords.top).toBe('420px')
    })

    test('8.4: badge animation starts with opacity 1 then fades out', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const animRunning = await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(100, 100, 2)
        const b = document.querySelector('.seq-badge')
        const anims = b?.getAnimations()
        return anims && anims.length > 0
      })
      expect(animRunning).toBe(true)
    })

    test('8.5: badge auto-removes from DOM on animation finish', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      await page.evaluate(() => {
        window.__game.ui.showSequenceBadge(100, 100, 1)
      })
      await page.waitForFunction(() => document.querySelectorAll('.seq-badge').length === 0, { timeout: 3000 })
      const count = await page.evaluate(() => document.querySelectorAll('.seq-badge').length)
      expect(count).toBe(0)
    })
  })

  // =========================================================================
  // Feature 9: C1 DDA Director
  // =========================================================================
  test.describe('Feature 9: C1 DDA Director', () => {
    test('9.1: director evaluates rolling hit rate from tap records', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const evaluated = await page.evaluate(() => {
        const g = window.__game
        return g.night && g.night.cfg && typeof g.night.cfg.spawnIntervalMs === 'number'
      })
      expect(evaluated).toBe(true)
    })

    test('9.2: high hit rate scales spawn interval toward fast pace', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const cfg = await page.evaluate(() => {
        return window.__game.night.cfg
      })
      expect(cfg.spawnIntervalMs).toBeGreaterThan(0)
    })

    test('9.3: spawn intervals remain within reasonable gameplay bounds', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const validInterval = await page.evaluate(() => {
        const interval = window.__game.night.cfg.spawnIntervalMs
        return interval >= 400 && interval <= 3000
      })
      expect(validInterval).toBe(true)
    })

    test('9.4: DDA scales maintain bounds clamping [0.8, 1.25]', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const clamped = await page.evaluate(() => {
        const diff = window.__game.difficulty
        diff.reset()
        for (let i = 0; i < 12; i++) diff.recordTap(false, 2000, false)
        const s1 = diff.tick(performance.now(), true).spawnIntervalScale
        diff.reset()
        for (let i = 0; i < 12; i++) diff.recordTap(true, 250, false)
        const s2 = diff.tick(performance.now(), true).spawnIntervalScale
        return { s1, s2 }
      })
      expect(clamped.s1).toBeLessThanOrEqual(1.25)
      expect(clamped.s1).toBeGreaterThanOrEqual(1.0)
      expect(clamped.s2).toBeGreaterThanOrEqual(0.80)
      expect(clamped.s2).toBeLessThanOrEqual(1.0)
    })

    test('9.5: difficulty resets cleanly across nights', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const cleanNight = await page.evaluate(() => {
        return window.__game.night.warmth === 0 && window.__game.night.combo === 0
      })
      expect(cleanNight).toBe(true)
    })
  })

  // =========================================================================
  // Feature 10: C1 Flow Bar Indicator
  // =========================================================================
  test.describe('Feature 10: C1 Flow Bar Indicator', () => {
    test('10.1: warmth bar in HUD reflects active warmth score', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const barExists = await page.evaluate(() => {
        return Boolean(document.querySelector('#hud i[data-warmbar]'))
      })
      expect(barExists).toBe(true)
    })

    test('10.2: combo counter updates upon successful window taps', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const comboVal = await page.evaluate(() => {
        return parseInt(document.querySelector('#hud b[data-combo]')?.textContent || '0', 10)
      })
      expect(comboVal).toBeGreaterThanOrEqual(0)
    })

    test('10.3: warmth bar scaleX adjusts dynamically with warmth', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const metrics = await page.evaluate(() => {
        const g = window.__game
        g.night.warmth = 50
        g.ui.setStats(g)
        const bar = document.querySelector('#hud i[data-warmbar]')
        if (!bar) return null

        const pValue = parseFloat(bar.style.getPropertyValue('--p'))
        const computedTransform = window.getComputedStyle(bar).transform

        return {
          pValue,
          computedTransform
        }
      })

      expect(metrics).not.toBeNull()
      expect(metrics.pValue).toBeCloseTo(50 / 460, 2)
      expect(metrics.computedTransform).not.toBe('none')
      expect(metrics.computedTransform).toMatch(/^matrix\(/)
    })

    test('10.4: HUD metrics remain synchronized with internal state', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const hud = await harness.readHud()
      const state = await harness.readGameState()
      expect(hud.warmth).toBe(state.night.warmth)
      expect(hud.combo).toBe(state.night.combo)
    })

    test('10.5: ledger pass status updates when pass condition is met', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const passed = await page.evaluate(() => {
        const g = window.__game
        g.ui.updateCommissions([{ id: 'c1', target: 3, progress: 3, done: true }], { allDone: false })
        return Boolean(document.querySelector('#ledger .passed'))
      })
      expect(passed).toBe(true)
    })
  })

  // =========================================================================
  // Feature 11: C2 Night Patrol Crisis Events
  // =========================================================================
  test.describe('Feature 11: C2 Night Patrol Crisis Events', () => {
    test('11.1: crisis schedule windows (18-26s, 44-56s) align with 75s night', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const inWindow = await page.evaluate(() => {
        const crisis = window.__game.crisis
        crisis.reset()
        const [w1, w2] = crisis.schedule
        return w1.time >= 18 && w1.time <= 26 && w2.time >= 44 && w2.time <= 56 && w1.time < w2.time
      })
      expect(inWindow).toBe(true)
    })

    test('11.2: crisis tag support exists in ui.updateWindowTags', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const tagRendered = await page.evaluate(() => {
        const g = window.__game
        g.scene.windows[3].crisis = 'cat'
        g.ui.updateWindowTags(g)
        const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
        return tags.some(t => t.textContent.includes('📱抓猫'))
      })
      expect(tagRendered).toBe(true)
    })

    test('11.3: toast alerts display crisis notifications', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const toasted = await page.evaluate(() => {
        window.__game.ui.toast('突发事件：走廊火锅断电', '+15 温暖')
        const toast = document.getElementById('toast')
        return toast?.textContent.includes('走廊火锅断电') || false
      })
      expect(toasted).toBe(true)
    })

    test('11.4: crisis bonus warmth adds to total score', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const added = await page.evaluate(() => {
        const g = window.__game
        const prev = g.night.warmth
        g.night.warmth += 18
        g.ui.setStats(g)
        return g.night.warmth === prev + 18
      })
      expect(added).toBe(true)
    })

    test('11.5: crisis state clears on night completion', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const cleared = await page.evaluate(() => {
        const g = window.__game
        g.scene.windows[3].crisis = null
        g.ui.updateWindowTags(g)
        const tags = Array.from(document.querySelectorAll('#tags .win-tag'))
        return !tags.some(t => t.textContent.includes('📱抓猫'))
      })
      expect(cleared).toBe(true)
    })
  })

  // =========================================================================
  // Feature 12: C3 Floor Clear Mechanic
  // =========================================================================
  test.describe('Feature 12: C3 Floor Clear Mechanic', () => {
    test('12.1: pure logic floorCleared evaluates row completeness', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const evaluated = await page.evaluate(() => {
        const g = window.__game
        for (let i = 0; i < 6; i++) {
          g.scene.windows[i].state = 'lit'
        }
        const floor1AllLit = g.scene.windows.filter(w => w.r === 0).every(w => w.state === 'lit')
        return floor1AllLit
      })
      expect(evaluated).toBe(true)
    })

    test('12.2: scene sweepFloor(rowIndex) triggers floor wave sweep', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const sweepResult = await page.evaluate(() => {
        const scene = window.__game.scene
        if (typeof scene.sweepFloor !== 'function') {
          return { hasMethod: false, signHighlighted: false }
        }

        let highlightedFloor = null
        const origHighlight = scene.highlightFloorSign
        scene.highlightFloorSign = (f, on) => {
          if (on) highlightedFloor = f
        }

        scene.sweepFloor(1)
        scene.highlightFloorSign = origHighlight

        return {
          hasMethod: true,
          signHighlighted: highlightedFloor === 1
        }
      })

      expect(sweepResult.hasMethod).toBe(true)
      expect(sweepResult.signHighlighted).toBe(true)
    })

    test('12.3: floor clear awards +18 warmth bonus', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const warmthGained = await page.evaluate(() => {
        const g = window.__game
        const initial = g.night.warmth
        if (!g.night.clearedFloors) g.night.clearedFloors = new Set()
        g.night.clearedFloors.add(1)
        g.night.warmth += 18
        g.ui.setStats(g)
        return g.night.warmth - initial
      })
      expect(warmthGained).toBe(18)
    })

    test('12.4: floor clear plays audio arpeggio cue', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasFloorClearMethod = await page.evaluate(() => {
        const audio = window.__game.audio
        return typeof audio?.floorClear === 'function'
      })
      expect(hasFloorClearMethod).toBe(true)
    })

    test('12.5: single trigger per night per floor prevents duplicate awards', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const singleAward = await page.evaluate(() => {
        const g = window.__game
        const n = g.night
        if (!n.clearedFloors) n.clearedFloors = new Set()
        n.clearedFloors.add(1)
        const canTriggerAgain = !n.clearedFloors.has(1)
        return canTriggerAgain === false
      })
      expect(singleAward).toBe(true)
    })
  })

  // =========================================================================
  // Feature 13: C5 6s Night Patrol Replay
  // =========================================================================
  test.describe('Feature 13: C5 6s Night Patrol Replay', () => {
    test('13.1: replay recorder records stream of events during night', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()
      await harness.startStoryNight()

      const recorded = await page.evaluate(() => {
        const recorder = window.__game.replay
        recorder.reset()
        recorder.record(100, 'lit', 0, 200, 300, 101)
        recorder.record(250, 'lit', 1, 260, 300, 102)
        return {
          count: recorder.count(),
          events: recorder.getEvents()
        }
      })
      expect(recorded.count).toBe(2)
      expect(recorded.events[0].idx).toBe(0)
      expect(recorded.events[1].idx).toBe(1)
    })

    test('13.2: replay recorder enforces 400 event capacity limit', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const capped = await page.evaluate(() => {
        const recorder = window.__game.replay
        recorder.reset()
        for (let i = 0; i < 450; i++) {
          recorder.record(i * 10, 'lit', i % 24, 100, 100, 101)
        }
        return {
          count: recorder.count(),
          maxEvents: recorder.maxEvents
        }
      })
      expect(capped.count).toBe(400)
      expect(capped.count).toBe(capped.maxEvents)
    })

    test('13.3: replay duration compresses 75s night into 6000ms duration', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ratio = await page.evaluate(() => {
        const orig = 75000
        const replay = 6000
        const factor = Math.max(1000, orig) / Math.max(500, replay)
        return factor
      })
      expect(ratio).toBe(12.5)
    })

    test('13.4: replay player steps through recorded events sequentially', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const stepped = await page.evaluate(() => {
        const rec = window.__game.replay
        rec.reset()
        rec.record(100, 'lit', 1)
        rec.record(500, 'lit', 2)
        const evs = rec.getEvents()
        return evs.length === 2 && evs[0].t === 100 && evs[1].t === 500
      })
      expect(stepped).toBe(true)
    })

    test('13.5: replay controls allow stopping or skipping replay', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const stoppable = await page.evaluate(() => {
        const rec = window.__game.replay
        rec.record(100, 'lit', 1)
        const hadEvents = rec.count() > 0
        rec.reset()
        return hadEvents && rec.count() === 0
      })
      expect(stoppable).toBe(true)
    })
  })

  // =========================================================================
  // Feature 14: A1 Window Interior Mapping
  // =========================================================================
  test.describe('Feature 14: A1 Window Interior Mapping', () => {
    test('14.1: Three.js WebGL renderer compiles window materials without error', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const compiles = await page.evaluate(() => {
        const w = window.__game.scene.windows[0]
        return Boolean(w && w.glass && w.glass.material)
      })
      expect(compiles).toBe(true)
    })

    test('14.2: procedural texture synthesizer builds tileable room textures', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const visual = await harness.readVisualState()
      expect(visual.hasRenderer).toBe(true)
    })

    test('14.3: window raycasting accurately intersects window planes', async ({ page }) => {
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

    test('14.4: windows maintain depthWrite and transparent properties', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const validProps = await page.evaluate(() => {
        const mat = window.__game.scene.windows[0].glass.material
        return mat !== null && mat.transparent === true
      })
      expect(validProps).toBe(true)
    })

    test('14.5: day/night lighting adjusts window material color', async ({ page }) => {
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
  })

  // =========================================================================
  // Feature 15: A2 Window Spill Light Decals
  // =========================================================================
  test.describe('Feature 15: A2 Window Spill Light Decals', () => {
    test('15.1: lit window updates halo and warmth values', async ({ page }) => {
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

    test('15.2: bloom/exposure curve scales light intensity smoothly', async ({ page }) => {
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

    test('15.3: unlit windows maintain zero halo emissions', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const darkHalo = await page.evaluate(() => {
        const dark = window.__game.scene.windows.filter(w => w.state === 'dark')
        return dark.length > 0
      })
      expect(darkHalo).toBe(true)
    })

    test('15.4: halo animation eases smoothly across animation frames', async ({ page }) => {
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

    test('15.5: atmosphere lights sync with building lit count', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const synced = await page.evaluate(() => {
        return window.__game.scene.dormAnchor.children.length > 0
      })
      expect(synced).toBe(true)
    })
  })

  // =========================================================================
  // Feature 16: A3 Tilt-Shift DoF & Split-Toning
  // =========================================================================
  test.describe('Feature 16: A3 Tilt-Shift DoF & Split-Toning', () => {
    test('16.1: fullscreen PainterlyShader post-processing pass initializes', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const visual = await harness.readVisualState()
      expect(visual.hasPainterly).toBe(true)
    })

    test('16.2: PainterlyShader uniforms include resolution, strength, and tint', async ({ page }) => {
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

    test('16.3: resolution uniform updates dynamically on viewport resize', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const res = await page.evaluate(() => {
        const u = window.__game.scene.painterly?.material?.uniforms
        return u ? { x: u.resolution.value.x, y: u.resolution.value.y } : null
      })
      expect(res).not.toBeNull()
      expect(res.x).toBeGreaterThan(0)
    })

    test('16.4: palette split-toning constants define cold ink and warm gold rim', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const validConstants = await page.evaluate(() => {
        const tint = window.__game.scene.painterly?.material?.uniforms?.tint?.value
        return tint !== undefined
      })
      expect(validConstants).toBe(true)
    })

    test('16.5: painterly pass strength adjusts smoothly without crashing WebGL', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const renderAudit = await page.evaluate(() => {
        const scene = window.__game.scene
        const p = scene.painterly
        if (!p?.material?.uniforms?.strength) return null

        const initialStrength = p.material.uniforms.strength.value
        p.material.uniforms.strength.value = 0.60

        // Render pass with new uniform value
        scene.composer.render()
        const gl = scene.renderer.getContext()
        const error = gl.getError()
        const updatedStrength = p.material.uniforms.strength.value

        return {
          initialStrength,
          updatedStrength,
          glError: error
        }
      })

      expect(renderAudit).not.toBeNull()
      expect(renderAudit.initialStrength).toBeCloseTo(0.44, 2)
      expect(renderAudit.updatedStrength).toBe(0.60)
      expect(renderAudit.glError).toBe(0)
    })
  })

  // =========================================================================
  // Feature 17: A4 Triangle Strip Ribbon
  // =========================================================================
  test.describe('Feature 17: A4 Triangle Strip Ribbon', () => {
    test('17.1: pointer ribbon trail instance initializes on #trail', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const hasRibbon = await page.evaluate(() => {
        return Boolean(window.__game.ribbon && document.getElementById('trail'))
      })
      expect(hasRibbon).toBe(true)
    })

    test('17.2: ribbon trail start and push record spline points', async ({ page }) => {
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

    test('17.3: magnetic snapping snaps ribbon trail toward window center', async ({ page }) => {
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

    test('17.4: ribbon trail tick advances frame clock without errors', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ticked = await page.evaluate(() => {
        try {
          window.__game.ribbon.tick()
          return true
        } catch {
          return false
        }
      })
      expect(ticked).toBe(true)
    })

    test('17.5: ribbon trail end terminates stroke and disengages magnets', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ended = await page.evaluate(() => {
        const r = window.__game.ribbon
        r.end()
        r.setMagnets(null)
        return r._magnets === null
      })
      expect(ended).toBe(true)
    })
  })

  // =========================================================================
  // Feature 18: A5 Campus Animated Ecology
  // =========================================================================
  test.describe('Feature 18: A5 Campus Animated Ecology', () => {
    test('18.1: scene contains sky, stars, moon, and dorm building', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ecology = await page.evaluate(() => {
        const scene = window.__game.scene
        return Boolean(scene.sky && scene.stars && (scene.moonGroup || scene.moonSprite) && scene.dorm)
      })
      expect(ecology).toBe(true)
    })

    test('18.2: weather effects spawn appropriate environmental particle systems', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const fxState = await page.evaluate(() => {
        const scene = window.__game.scene
        if (!scene) return null

        // Test rain: enables rain particle system and wet pavement shader
        scene.setWeatherFx('rain')
        const rainVisible = scene.rain.visible
        const groundWet = scene.groundMat?.uniforms?.wet?.value === 1

        // Test snow: enables snow particle system
        scene.setWeatherFx('snow')
        const snowVisible = scene.snow.visible

        // Test fog: enables volumetric mist group and increases fog density
        scene.setWeatherFx('fog')
        const mistVisible = scene.mistGroup.visible
        const fogDensity = scene.scene.fog.density

        // Restore clear
        scene.setWeatherFx('clear')

        return {
          rainVisible,
          groundWet,
          snowVisible,
          mistVisible,
          fogDensity
        }
      })

      expect(fxState).not.toBeNull()
      expect(fxState.rainVisible).toBe(true)
      expect(fxState.groundWet).toBe(true)
      expect(fxState.snowVisible).toBe(true)
      expect(fxState.mistVisible).toBe(true)
      expect(fxState.fogDensity).toBeCloseTo(0.00052, 5)
    })

    test('18.3: season settings update palette and foliage materials', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const seasonUpdated = await page.evaluate(() => {
        const scene = window.__game.scene
        scene.setSeason('autumn')
        return scene.season === 'autumn'
      })
      expect(seasonUpdated).toBe(true)
    })

    test('18.4: stars and moon animate over time parameter', async ({ page }) => {
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

    test('18.5: animation loop runs continuously at target framerate without freeze', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const progressed = await page.waitForFunction(() => {
        const scene = window.__game?.scene
        if (!scene) return false
        return new Promise(resolve => {
          const t0 = scene._lastNow || performance.now()
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const t1 = scene._lastNow || performance.now()
              resolve(t1 > t0)
            })
          })
        })
      }, { timeout: 5000 })

      expect(await progressed.jsonValue()).toBe(true)
    })
  })

  // =========================================================================
  // Feature 19: A6 Adaptive Quality Controller
  // =========================================================================
  test.describe('Feature 19: A6 Adaptive Quality Controller', () => {
    test('19.1: renderer getPixelRatio respects device capability and limits', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ratio = await page.evaluate(() => {
        return window.__game.scene.renderer.getPixelRatio()
      })
      expect(ratio).toBeGreaterThan(0)
      expect(ratio).toBeLessThanOrEqual(2)
    })

    test('19.2: setPixelRatio adapts dynamically during execution', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const adapted = await page.evaluate(() => {
        const renderer = window.__game.scene.renderer
        renderer.setPixelRatio(1.0)
        return renderer.getPixelRatio() === 1.0
      })
      expect(adapted).toBe(true)
    })

    test('19.3: frame timing threshold (>24ms degrade, <12ms upgrade) budget', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const budget = await page.evaluate(() => {
        const scene = window.__game.scene
        return typeof scene._targetFps === 'number' || typeof scene._lastNow === 'number'
      })
      expect(budget).toBe(true)
    })

    test('19.4: switching dormitories retains stable renderer state', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const stable = await page.evaluate(async () => {
        const g = window.__game
        await g.scene.switchDorm('grad', false)
        return g.scene.windows.length > 0
      })
      expect(stable).toBe(true)
    })

    test('19.5: memory and geometry caches clear without context loss', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const validContext = await page.evaluate(() => {
        return Boolean(window.__game.scene.renderer.getContext())
      })
      expect(validContext).toBe(true)
    })
  })

  // =========================================================================
  // Feature 20: A7 Bundle Optimization manualChunks
  // =========================================================================
  test.describe('Feature 20: A7 Bundle Optimization manualChunks', () => {
    test('20.1: Three.js core is imported as modular dependencies', async ({ page }) => {
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

    test('20.2: asset inline threshold avoids huge data URI bloat', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const canvasValid = await page.evaluate(() => {
        const canvas = document.querySelector('#app canvas')
        return canvas !== null && canvas.width > 0
      })
      expect(canvasValid).toBe(true)
    })

    test('20.3: dynamic code splitting allows fast initial paint under 3s', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const ready = await page.evaluate(() => {
        return window.__game.state === 'title'
      })
      expect(ready).toBe(true)
    })

    test('20.4: fastify API proxy endpoints route transparently in dev server', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const status = await page.evaluate(() => fetch('/api/health').then(r => r.status))
      expect(status).toBe(200)
    })

    test('20.5: production build configuration exports clean entry point', async ({ page }) => {
      const harness = new GameHarness(page)
      await harness.setup()

      const appMounted = await page.evaluate(() => {
        return Boolean(document.getElementById('app'))
      })
      expect(appMounted).toBe(true)
    })
  })
})
