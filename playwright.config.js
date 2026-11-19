import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

process.env.NO_PROXY = 'localhost,127.0.0.1,::1'
process.env.no_proxy = 'localhost,127.0.0.1,::1'

const localChromium = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium-1200', 'chrome-win64', 'chrome.exe')
  : undefined

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: localChromium && fs.existsSync(localChromium) ? localChromium : undefined,
      args: [
        '--enable-webgl',
        '--use-gl=angle',
        '--ignore-gpu-blocklist',
        '--disable-web-security',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      NO_PROXY: 'localhost,127.0.0.1,::1',
      no_proxy: 'localhost,127.0.0.1,::1',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
