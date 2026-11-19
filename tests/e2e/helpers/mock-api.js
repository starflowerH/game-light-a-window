/**
 * 0ms Mock API Router for Night Window v5.0 E2E Tests.
 * Intercepts all backend `/api/**` calls via Playwright route handler to guarantee
 * zero network delay, instant determinism, and 100% offline testability.
 */

export const MOCK_BOOTSTRAP_PAYLOAD = {
  ok: true,
  player: {
    uid: 'e2e-tester-uid-001',
    passCode: 'TEST01',
    plays: 1,
    warmth: 120,
    unlockedEndings: ['ENDING_A_WARMTH'],
    titles: ['点灯人', '晚风旅者'],
    residentBonds: { 101: 2, 203: 1 },
    items: ['leaf_bookmark']
  },
  globalStats: {
    totalLit: 12450,
    players: 890
  },
  windowHeat: Array.from({ length: 24 }, (_, i) => ({
    roomId: 101 + i,
    litTotal: (i + 1) * 5
  })),
  whispers: [
    { id: 1, roomId: 101, content: '今夜的风很温柔，记得关窗。', likes: 12, nickname: '夜行学长' },
    { id: 2, roomId: 204, content: '考研加油，对面的灯还在亮着。', likes: 25, nickname: '西区考研人' },
    { id: 3, roomId: 302, content: '画完最后一张图就睡，晚安。', likes: 8, nickname: '设计民工' },
    { id: 4, roomId: 405, content: '听到楼顶有小猫叫声。', likes: 19, nickname: '寻猫启事' },
    { id: 5, roomId: 501, content: '星光照进阳台，梦开始的地方。', likes: 7, nickname: '天台诗人' },
    { id: 6, roomId: 106, content: '无论多晚，这里总有一盏灯留给你。', likes: 31, nickname: '宿管林阿姨' }
  ]
}

export const MOCK_PLAN_PAYLOAD = {
  ok: true,
  source: 'mock',
  payload: {
    directorNote: 'E2E Playwright Automated Test Night Plan',
    nights: [
      {
        night: 1,
        weather: 'clear',
        tempo: 'andante',
        palette: 'warm_blue',
        commissions: [
          { id: 'c1', type: 'lit_count', target: 3, label: '点亮 3 扇微光窗', floor: 1 },
          { id: 'c2', type: 'row_lit', target: 1, label: '点亮 2F 整层窗户', floor: 2 },
          { id: 'c3', type: 'resonance', target: 1, label: '连接 1 对星桥共鸣', floor: 3 }
        ],
        resonancePair: [101, 102],
        stories: [
          {
            roomId: 101,
            title: '走廊尽头的自习声',
            teaser: '101 窗前台灯静静亮着',
            body: '推开门，桌上摊着厚厚的复习笔记与半杯温水。',
            choices: [
              { id: 'A', text: '悄悄在便签上写句加油', warmthGain: 12, residentId: 'r101' },
              { id: 'B', text: '把窗户虚掩挡住夜风', warmthGain: 10, residentId: 'r101' }
            ]
          }
        ]
      },
      {
        night: 2,
        weather: 'breeze',
        tempo: 'moderato',
        palette: 'star_purple',
        commissions: [
          { id: 'c2_1', type: 'lit_count', target: 5, label: '点亮 5 扇窗户', floor: 2 },
          { id: 'c2_2', type: 'combo', target: 4, label: '达成 4 连击', floor: 3 }
        ],
        resonancePair: [201, 202],
        stories: []
      },
      {
        night: 3,
        weather: 'mist',
        tempo: 'allegro',
        palette: 'dawn_gold',
        commissions: [
          { id: 'c3_1', type: 'lit_count', target: 6, label: '点亮 6 扇窗户', floor: 3 }
        ],
        resonancePair: [301, 302],
        stories: []
      }
    ]
  }
}

/**
 * Attaches 0ms API route interceptors to the Playwright page.
 * @param {import('@playwright/test').Page} page
 */
export async function setupMockApiRoutes(page) {
  await page.route('**/api/**', async route => {
    const url = route.request().url()
    const _method = route.request().method()

    // 1. Bootstrap
    if (url.includes('/api/bootstrap')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BOOTSTRAP_PAYLOAD)
      })
    }

    // 2. Initial Plan / Agent Plan
    if (url.includes('/api/agent/plan') || url.includes('/api/plan') || url.includes('/api/generate')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PLAN_PAYLOAD)
      })
    }

    // 3. Agent Evolution
    if (url.includes('/api/agent/evolve')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          source: 'mock',
          payload: {
            nights: MOCK_PLAN_PAYLOAD.payload.nights.slice(1)
          }
        })
      })
    }

    // 4. Epilogue
    if (url.includes('/api/agent/epilogue')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          source: 'mock',
          payload: {
            letter: {
              to: '夜行列车乘客',
              body: '星夜长明，每盏亮起的窗都是写给校园的情书。',
              sign: '宿舍管理处'
            }
          }
        })
      })
    }

    // 5. Score sync
    if (url.includes('/api/score')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          rank: 1,
          player: MOCK_BOOTSTRAP_PAYLOAD.player
        })
      })
    }

    // 6. Whispers
    if (url.includes('/api/whispers')) {
      if (url.includes('/like')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, likes: 13 })
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: 999, content: '测试私语已留存' })
      })
    }

    // 7. Leaderboard
    if (url.includes('/api/leaderboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          items: [
            { rank: 1, nickname: '测试领航者', warmth: 888, endingId: 'ENDING_A_WARMTH' },
            { rank: 2, nickname: '微光守护星', warmth: 666, endingId: 'ENDING_B_STAR' }
          ],
          total: 2,
          myRank: 1,
          nextGap: 0
        })
      })
    }

    // 8. Health checks
    if (url.includes('/api/health') || url.includes('/api/ai-health')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, service: 'ok', model: 'mock-model' })
      })
    }

    // 9. Telemetry & Default fallback
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    })
  })
}
