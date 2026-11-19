import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

async function runLiveSmokeCheck() {
  const targetUrl = 'https://game.xiaoxin.email/'
  console.log(`[smoke-check] Launching browser to test live production: ${targetUrl}`)

  const localChromium = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1200', 'chrome-win64', 'chrome.exe')
    : undefined

  const browser = await chromium.launch({
    headless: true,
    executablePath: localChromium && fs.existsSync(localChromium) ? localChromium : undefined,
    args: [
      '--enable-webgl',
      '--use-gl=angle',
      '--ignore-gpu-blocklist',
      '--disable-web-security',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ]
  })

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  })

  const page = await context.newPage()
  const consoleErrors = []
  const consoleLogs = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
      console.error(`[browser error] ${msg.text()}`)
    } else {
      consoleLogs.push(msg.text())
    }
  })

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message)
    console.error(`[page error] ${err.message}`)
  })

  try {
    console.log('[smoke-check] 1. Navigating to live target...')
    const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 })
    console.log(`[smoke-check] HTTP status: ${response.status()}`)

    if (response.status() !== 200) {
      throw new Error(`Expected HTTP 200, got ${response.status()}`)
    }

    // 1. Verify page title and DOM readiness
    const title = await page.title()
    console.log(`[smoke-check] Page title: "${title}"`)

    // Check canvas mounting
    await page.waitForSelector('#app canvas', { timeout: 15000 })
    console.log('[smoke-check] WebGL canvas mounted successfully!')

    // 2. Check title screen or prologue overlay
    await page.waitForSelector('[data-act="start"]', { timeout: 15000 })
    console.log('[smoke-check] Title screen loaded with [data-act="start"]')

    // Verify game instance on window at title screen
    await page.waitForFunction(() => typeof window.__game !== 'undefined', { timeout: 15000 })
    let gameInfo = await page.evaluate(() => {
      const g = window.__game
      return {
        state: g.state,
        hasScene: !!g.scene,
        hasAudio: !!g.audio,
        hasUI: !!g.ui,
        windowsCount: g.scene?.windows?.length || 0
      }
    })
    console.log('[smoke-check] Title screen state:', JSON.stringify(gameInfo))

    // 3. Click Start to open Prologue
    console.log('[smoke-check] 2. Clicking Start Game CTA [data-act="start"]...')
    await page.click('[data-act="start"]')

    // Wait for Prologue mood card
    await page.waitForSelector('.mood-card', { timeout: 10000 })
    console.log('[smoke-check] Prologue screen appeared with mood cards!')

    // 4. Select the first mood card to enter Chapter Opener
    console.log('[smoke-check] 3. Selecting mood card to load chapter...')
    await page.click('.mood-card:first-child')

    // Wait for Chapter Opener [data-act="go"]
    await page.waitForSelector('[data-act="go"]', { timeout: 10000 })
    console.log('[smoke-check] Chapter opener appeared with [data-act="go"]!')

    // 5. Click [data-act="go"] to enter Night 1
    console.log('[smoke-check] 4. Clicking [data-act="go"] to start Night 1...')
    await page.click('[data-act="go"]')

    // Wait for game loop to transition to night
    await page.waitForFunction(() => {
      const g = window.__game
      return g && g.state === 'night' && !!g.night
    }, { timeout: 15000 })

    gameInfo = await page.evaluate(() => {
      const g = window.__game
      return {
        state: g.state,
        nightIndex: g.nightIndex,
        dormId: g.dormId,
        windowCount: g.scene?.windows?.length || 0,
        tutorialState: g.tutorial?.getState ? g.tutorial.getState() : 'none',
        ddaScales: g.difficulty?.getScales ? g.difficulty.getScales() : null,
        activeCrises: g.crisis?.activeCrises ? g.crisis.activeCrises.size : 0
      }
    })
    console.log('[smoke-check] Live gameplay runtime state:', JSON.stringify(gameInfo))

    // Wait a brief moment to let render loop tick
    await page.waitForTimeout(2000)

    // Check HUD is visible
    const hudVisible = await page.isVisible('#hud')
    console.log(`[smoke-check] In-game HUD visible: ${hudVisible}`)

    // Take screenshot of live night 1 gameplay
    await page.screenshot({ path: 'dist/live-production-night1.png' })
    console.log('[smoke-check] Screenshot saved to dist/live-production-night1.png')

    // Filter out harmless non-app errors if any
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('AudioContext'))

    console.log(`[smoke-check] Console errors count: ${fatalErrors.length}`)
    if (fatalErrors.length > 0) {
      console.warn(`[smoke-check] Found console errors:`, fatalErrors)
      throw new Error(`Console errors encountered: ${fatalErrors.join(', ')}`)
    }

    console.log('[smoke-check] ==========================================')
    console.log('[smoke-check] ALL LIVE PRODUCTION SMOKE CHECKS PASSED!')
    console.log('[smoke-check] ==========================================')
    await browser.close()
    process.exit(0)
  } catch (err) {
    console.error('[smoke-check] Smoke check failed:', err)
    await browser.close()
    process.exit(1)
  }
}

runLiveSmokeCheck()
