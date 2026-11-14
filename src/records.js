// Local personal records + best score history
const KEY = 'law.records.v2'
export function loadRecords() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && typeof r === 'object') return r } catch {}
  return { bestWarmth: 0, bestCombo: 0, plays: 0, totalWindows: 0, bestNight: 0, items: [], history: [] }
}
export function saveRecords(r) { try { localStorage.setItem(KEY, JSON.stringify(r)) } catch {} }
export function mergeRun(records, run) {
  const r = { ...records }
  r.plays += 1
  r.bestWarmth = Math.max(r.bestWarmth, run.totalWarmth)
  r.bestCombo = Math.max(r.bestCombo, run.maxCombo)
  r.totalWindows += run.litTotal
  r.bestNight = Math.max(r.bestNight, run.bestNightWarmth || 0)
  r.items = Array.from(new Set([...(r.items || []), ...(run.items || [])])).slice(0, 60)
  r.history = [{ t: Date.now(), warmth: run.totalWarmth, combo: run.maxCombo, lit: run.litTotal, nights: run.nights }, ...(r.history || [])].slice(0, 20)
  return r
}
