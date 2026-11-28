import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicDial } from '../src/music-dial.js'

class MiniClassList {
  /** @param {MiniElement} el */
  constructor(el) {
    this.el = el
  }

  _list() {
    return String(this.el.className || '').split(/\s+/).filter(Boolean)
  }

  /** @param {...string} names */
  add(...names) {
    const set = new Set(this._list())
    for (const n of names) set.add(n)
    this.el.className = Array.from(set).join(' ')
  }

  /** @param {...string} names */
  remove(...names) {
    const rm = new Set(names)
    this.el.className = this._list().filter(n => !rm.has(n)).join(' ')
  }

  /**
   * @param {string} name
   * @param {boolean} [force]
   */
  toggle(name, force) {
    const has = this.contains(name)
    const next = force === undefined ? !has : Boolean(force)
    if (next) this.add(name)
    else this.remove(name)
    return next
  }

  /** @param {string} name */
  contains(name) {
    return this._list().includes(name)
  }
}

/** @param {string} rawAttrs */
function parseAttrs(rawAttrs) {
  /** @type {Record<string, string>} */
  const attrs = {}
  const re = /([a-zA-Z0-9_:-]+)(?:\s*=\s*"([^"]*)")?/g
  let m
  while ((m = re.exec(rawAttrs))) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : ''
  }
  return attrs
}

/**
 * Minimal HTML fragment parser for unit-testing MusicDial DOM state in Node.
 * @param {string} html
 * @param {MiniElement} root
 */
function parseHtmlInto(html, root) {
  root.children = []
  /** @type {Array<MiniElement>} */
  const stack = [root]
  const tokenRe = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g
  let m
  while ((m = tokenRe.exec(html))) {
    const full = m[0]
    if (full.startsWith('</')) {
      if (stack.length > 1) stack.pop()
    } else if (full.startsWith('<')) {
      const tag = m[1]
      const rawAttrs = m[2] || ''
      const selfClosing = rawAttrs.endsWith('/') || tag.toLowerCase() === 'input'
      const attrs = parseAttrs(rawAttrs.replace(/\/$/, ''))
      const el = new MiniElement(tag)
      el.attrs = attrs
      if (attrs.id) el.id = attrs.id
      if (attrs.class) el.className = attrs.class
      stack[stack.length - 1].appendChild(el)
      if (!selfClosing) stack.push(el)
    } else if (m[3]) {
      stack[stack.length - 1]._text += m[3]
    }
  }
}

/**
 * @param {MiniElement} el
 * @param {string} selector
 */
function matchesSelector(el, selector) {
  const s = selector.trim()
  if (!s) return false
  if (s.startsWith('.')) return el.classList.contains(s.slice(1))
  const attrM = /^\[([a-zA-Z0-9_:-]+)(?:="([^"]*)")?\]$/.exec(s)
  if (attrM) {
    const k = attrM[1]
    if (!(k in el.attrs)) return false
    return attrM[2] === undefined ? true : el.attrs[k] === attrM[2]
  }
  return el.tagName.toLowerCase() === s.toLowerCase()
}

class MiniElement {
  /** @param {string} tagName */
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase()
    this.id = ''
    this.className = ''
    /** @type {Record<string, string>} */
    this.attrs = {}
    /** @type {Array<MiniElement>} */
    this.children = []
    /** @type {MiniElement|null} */
    this.parentNode = null
    this._innerHTML = ''
    this._text = ''
    this.onclick = null
    this.onchange = null
    /** @type {Record<string, Array<Function>>} */
    this._listeners = {}
    this.isConnected = true
    /** @type {Record<string, any>} */
    this.style = {
      setProperty: (k, v) => { this.style[k] = v }
    }
    this.classList = new MiniClassList(this)
  }

  get innerHTML() {
    return this._innerHTML
  }

  set innerHTML(val) {
    this._innerHTML = String(val)
    this._text = ''
    parseHtmlInto(this._innerHTML, this)
  }

  get textContent() {
    return this._text + this.children.map(c => c.textContent).join('')
  }

  set textContent(v) {
    this._text = String(v)
    this.children = []
  }

  /** @param {MiniElement} child */
  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  /** @param {MiniElement} child */
  removeChild(child) {
    this.children = this.children.filter(c => c !== child)
    if (child.parentNode === this) child.parentNode = null
    return child
  }

  remove() {
    if (!this.parentNode) return
    this.parentNode.children = this.parentNode.children.filter(c => c !== this)
    this.parentNode = null
  }

  /**
   * @param {string} k
   * @param {string} v
   */
  setAttribute(k, v) {
    this.attrs[k] = String(v)
    if (k === 'id') this.id = String(v)
    if (k === 'class') this.className = String(v)
  }

  /** @param {string} k */
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null
  }

  /**
   * @param {string} ev
   * @param {Function} fn
   */
  addEventListener(ev, fn) {
    if (!this._listeners[ev]) this._listeners[ev] = []
    this._listeners[ev].push(fn)
  }

  /** @param {string} sel */
  querySelectorAll(sel) {
    /** @type {Array<MiniElement>} */
    const out = []
    const walk = node => {
      for (const c of node.children) {
        if (matchesSelector(c, sel)) out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }

  /** @param {string} sel */
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null
  }
}

function installDomEnv() {
  const prevDocument = globalThis.document
  const prevWindow = globalThis.window
  const prevStorage = globalThis.localStorage
  const prevAdd = globalThis.addEventListener
  const prevRemove = globalThis.removeEventListener
  const prevRaf = globalThis.requestAnimationFrame
  const prevCaf = globalThis.cancelAnimationFrame

  const store = new Map()
  const localStorageMock = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  }
  const docMock = {
    createElement: tag => new MiniElement(tag),
    getElementById: () => null
  }

  globalThis.document = /** @type {any} */ (docMock)
  globalThis.window = /** @type {any} */ ({ innerWidth: 1280, innerHeight: 800 })
  globalThis.localStorage = /** @type {any} */ (localStorageMock)
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}

  return {
    store,
    cleanup() {
      globalThis.document = prevDocument
      globalThis.window = prevWindow
      globalThis.localStorage = prevStorage
      globalThis.addEventListener = prevAdd
      globalThis.removeEventListener = prevRemove
      globalThis.requestAnimationFrame = prevRaf
      globalThis.cancelAnimationFrame = prevCaf
    }
  }
}

describe('MusicDial onboarding coach', () => {
  /** @type {ReturnType<typeof installDomEnv>} */
  let env
  /** @type {MiniElement} */
  let host
  /** @type {MusicDial} */
  let dial

  beforeEach(() => {
    env = installDomEnv()
    host = new MiniElement('div')
    dial = new MusicDial(/** @type {any} */ (host))
  })

  afterEach(() => {
    dial.dispose()
    env.cleanup()
  })

  it('shows Step 1 when collapsed and transitions to Step 2 when opened', () => {
    expect(dial.startCoach(false)).toBe(true)
    expect(dial.root.classList.contains('coach-step-1')).toBe(true)
    const badge1 = dial.root.querySelector('.md-coach-badge')
    expect(badge1?.textContent).toBe('配乐指引 1/2')

    dial.open()
    expect(dial.expanded).toBe(true)
    expect(dial.root.classList.contains('coach-step-1')).toBe(false)
    expect(dial.root.classList.contains('coach-step-2')).toBe(true)
    const badge2 = dial.root.querySelector('.md-coach-badge')
    expect(badge2?.textContent).toBe('配乐指引 2/2')
    expect(dial.hasCompletedCoach()).toBe(false)
  })

  it('auto-completes, persists flag, and invokes onCoachComplete when selecting a track in Step 2', () => {
    const onSelectTrack = vi.fn()
    const onCoachComplete = vi.fn()
    dial.bindHandlers({ onSelectTrack, onCoachComplete })

    dial.startCoach(false)
    dial.open()
    const slots = /** @type {Array<any>} */ (/** @type {unknown} */ (dial.root.querySelectorAll('.md-slot')))
    expect(slots.length).toBeGreaterThan(2)
    slots[1].onclick()

    expect(onSelectTrack).toHaveBeenCalledTimes(1)
    expect(onCoachComplete).toHaveBeenCalledTimes(1)
    expect(dial.hasCompletedCoach()).toBe(true)
    expect(dial.root.querySelector('.md-coach')).toBeNull()
    expect(dial.startCoach(false)).toBe(false)
  })

  it('dismisses Step 2 transiently on close without marking done, and supports force replay via ?', () => {
    const onCoachComplete = vi.fn()
    dial.bindHandlers({ onCoachComplete })

    dial.startCoach(false)
    dial.open()
    dial.close()

    expect(dial.root.querySelector('.md-coach')).toBeNull()
    expect(dial.hasCompletedCoach()).toBe(false)

    // Complete via skip button on step 1
    dial.startCoach(false)
    const skipBtn = /** @type {any} */ (dial.root.querySelector('[data-coach-skip]'))
    skipBtn.onclick()
    expect(dial.hasCompletedCoach()).toBe(true)
    expect(onCoachComplete).toHaveBeenCalledTimes(1)

    // Replay on demand via ? button even after completion
    dial.open()
    const coachBtn = /** @type {any} */ (dial.root.querySelector('[data-dial-act="coach"]'))
    expect(coachBtn).not.toBeNull()
    coachBtn.onclick()
    expect(dial.root.classList.contains('coach-step-2')).toBe(true)
  })
})
