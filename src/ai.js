// Talks to our own backend at /api/generate. Falls back to local content.
// FALLBACK_NIGHTS is exported so the game can start immediately when the AI is
// slow, and swap in generated content for nights that have not been played yet.
export const FALLBACK_NIGHTS = [
    { night: 1, weather: 'light_rain', tempo: 'slow', palette: 'rainy_amber',
      stories: [{ text: '图书馆闭馆铃响了两遍，还有人趴着没动。', item: '闭馆铃', icon: '🔔' }, { text: '三楼窗台那盆绿萝，又冒了一片新叶。', item: '绿萝', icon: '🌿' }],
      postcard: '今晚亮了十六扇窗。雨很小，刚好盖过走廊的拖鞋声。' },
    { night: 2, weather: 'fog', tempo: 'normal', palette: 'warm_blue',
      stories: [{ text: '操场的跑道还湿着，有人绕圈慢慢走。', item: '跑道', icon: '🏃' }, { text: '食堂阿姨多打了一勺汤，什么也没说。', item: '汤勺', icon: '🥣' }],
      postcard: '天是灰的，风有点闷。自习室的灯一直亮到十一点半。' },
    { night: 3, weather: 'clear', tempo: 'brisk', palette: 'clear_peach',
      stories: [{ text: '宿舍走廊有人抱着被子出来晒月亮。', item: '被子', icon: '🛏️' }, { text: '楼下便利店的关东煮，今晚最后一份被买走。', item: '关东煮', icon: '🍢' }],
      postcard: '云散了，月亮挂在树梢。有人在阳台小声聊天，一直没有回去。' }
].map(n => ({ ...n, source: 'fallback' }))

export async function generateNights(seedHint = '') {
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 12000)
    const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: seedHint }), signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) throw new Error('bad status ' + res.status)
    const data = await res.json()
    if (!data?.ok || !data?.payload?.nights?.length) throw new Error('no payload')
    return { nights: data.payload.nights, source: 'ai' }
  } catch {
    return { nights: FALLBACK_NIGHTS, source: 'fallback' }
  }
}
