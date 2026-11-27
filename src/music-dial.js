import { BGM_TRACKS, bgmTrackDef } from '../shared/constants.js'

const esc = s => String(s === null || s === undefined ? '' : s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&amp;': '&amp;', '"': '&quot;' }[m] || m))

/**
 * Refined crimson-and-gold National Emblem icon for ICP compliance footer.
 * @returns {string}
 */
export function renderNationalEmblemSvg() {
  return (
    '<svg class="icp-emblem" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10.2" fill="#b91c1c" stroke="#f5c85c" stroke-width="1.6"/>' +
      '<path d="M5.5 14.8c1.4 2.4 3.8 3.8 6.5 3.8s5.1-1.4 6.5-3.8" fill="none" stroke="#f5c85c" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M7.5 13.5h9l-1-2.5H8.5l-1 2.5z" fill="#f5c85c"/>' +
      '<polygon points="12,4.4 13.1,7.3 16.1,7.3 13.7,9.1 14.6,12 12,10.2 9.4,12 10.3,9.1 7.9,7.3 10.9,7.3" fill="#ffd966"/>' +
    '</svg>'
  )
}

/**
 * Mount the responsive MIIT ICP filing badge cleanly at the bottom edge.
 * @param {HTMLElement} parent
 * @returns {HTMLElement}
 */
export function mountIcpFooter(parent) {
  const existing = document.getElementById('icp-footer')
  if (existing) return existing
  const el = document.createElement('footer')
  el.id = 'icp-footer'
  el.setAttribute('aria-label', 'ICP备案信息')
  el.innerHTML =
    '<a class="icp-link" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" title="主体备案：湘ICP备2026031960号 · 主办单位：肖瑜（xiaoxin.email）">' +
      renderNationalEmblemSvg() +
      '<span class="icp-code">湘ICP备2026031960号-2</span>' +
      '<span class="icp-extra"> · 肖瑜（个人）· xiaoxin.email</span>' +
    '</a>'
  parent.appendChild(el)
  return el
}

/**
 * Side-edge collapsible semi-circular vinyl turntable audio switcher.
 * - Collapsed: compact glass capsule along the right edge with spinning mini-disc, EQ bars & marquee track title.
 * - Expanded: dynamic curved radial wheel where the centered active track scales up smoothly,
 *   adjacent tracks scale down cleanly along the arc, and long titles scroll without breaking layout.
 */
export class MusicDial {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.parent = parent
    this.expanded = false
    this._state = {
      mode: BGM_TRACKS[0].id,
      activeTrack: BGM_TRACKS[0].id,
      customTitle: '',
      muted: false,
      paused: false,
      playing: false,
      carousel: true
    }
    /** @type {any} */
    this._handlers = {}
    this._raf = 0
    this._wheelLockUntil = 0

    this.root = document.createElement('aside')
    this.root.id = 'music-dial'
    this.root.className = 'music-dial'
    this.root.setAttribute('aria-label', '校园夜巡音乐转盘')
    this.root.innerHTML = this._template()
    parent.appendChild(this.root)

    this._pill = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-pill]'))
    this._wheel = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-wheel]'))
    this._slotsHost = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-slots]'))
    this._pillTitleEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-pill-title]'))
    this._pillSpanEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-pill-span]'))
    this._lastPillTitle = ''
    this._modeTagEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-mode]'))
    this._playBtn = /** @type {HTMLButtonElement} */ (this.root.querySelector('[data-dial-act="play"]'))
    this._carouselBtn = /** @type {HTMLButtonElement} */ (this.root.querySelector('[data-dial-act="carousel"]'))
    this._muteBtn = /** @type {HTMLButtonElement} */ (this.root.querySelector('[data-dial-act="mute"]'))
    this._customBarEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-custom]'))
    this._eqBars = Array.from(this.root.querySelectorAll('[data-eqbar]'))
    this._radialBars = Array.from(this.root.querySelectorAll('[data-radialbar]'))

    this._buildSlots()
    this._bindEvents()
    this._onResize = () => { if (this.expanded) this._layoutWheel() }
    if (typeof addEventListener === 'function') addEventListener('resize', this._onResize)
    this.sync(this._state)
  }

  /** @param {any} handlers */
  bindHandlers(handlers = {}) {
    this._handlers = handlers || {}
  }

  _template() {
    const miniEq = Array.from({ length: 5 }, (_, i) =>
      `<i class="md-eq-bar" data-eqbar="${i}"></i>`
    ).join('')

    const radialEq = Array.from({ length: 14 }, (_, i) => {
      const deg = -65 + i * 10
      return `<i class="md-radial-bar" data-radialbar="${i}" style="--rdeg:${deg}deg"></i>`
    }).join('')

    return (
      '<button type="button" class="md-pill" data-dial-pill aria-expanded="false" title="展开黑胶音乐转盘">' +
        '<span class="md-mini-vinyl" aria-hidden="true"><i class="md-mini-core"></i></span>' +
        '<span class="md-eq" aria-hidden="true">' + miniEq + '</span>' +
        '<span class="md-pill-name" data-pill-title><span class="md-static" data-pill-span></span></span>' +
        '<span class="md-pill-arrow" aria-hidden="true">‹</span>' +
      '</button>' +
      '<div class="md-backdrop" data-dial-act="collapse"></div>' +
      '<div class="md-drawer" data-dial-wheel>' +
        '<div class="md-arc-slots" data-dial-slots></div>' +
        '<div class="md-pointer" aria-hidden="true"><span class="md-pointer-gem"></span></div>' +
        '<div class="md-disc-shell">' +
          '<div class="md-radial-eq" aria-hidden="true">' + radialEq + '</div>' +
          '<div class="md-vinyl">' +
            '<div class="md-vinyl-grooves"></div>' +
            '<div class="md-vinyl-sheen"></div>' +
            '<div class="md-vinyl-label">' +
              '<span class="md-label-dot"></span>' +
            '</div>' +
          '</div>' +
          '<div class="md-tonearm" aria-hidden="true"><i class="md-arm-rod"></i><i class="md-arm-head"></i></div>' +
          '<div class="md-core-controls">' +
            '<div class="md-status-tag" data-dial-mode>顺序轮播</div>' +
            '<div class="md-custom-banner" data-dial-custom></div>' +
            '<div class="md-btn-grid">' +
              '<button type="button" class="md-ctrl" data-dial-act="prev" title="上一曲">⏮</button>' +
              '<button type="button" class="md-ctrl primary" data-dial-act="play" title="播放 / 暂停">▶</button>' +
              '<button type="button" class="md-ctrl" data-dial-act="next" title="下一曲">⏭</button>' +
            '</div>' +
            '<div class="md-btn-row-sub">' +
              '<button type="button" class="md-mini-btn" data-dial-act="carousel" title="切换自动轮播 / 单曲循环">🔁 轮播</button>' +
              '<button type="button" class="md-mini-btn" data-dial-act="mute" title="静音">🔊</button>' +
              '<label class="md-mini-btn md-upload" title="导入本地音乐">📁<input type="file" accept="audio/*" data-dial-file style="display:none"/></label>' +
              '<button type="button" class="md-mini-btn close" data-dial-act="collapse" title="收起转盘">›</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    )
  }

  _buildSlots() {
    this._slots = BGM_TRACKS.map((track, idx) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'md-slot'
      btn.setAttribute('data-dial-track', track.id)
      btn.setAttribute('title', track.name)
      btn.innerHTML =
        '<span class="md-slot-index">' + String(idx + 1).padStart(2, '0') + '</span>' +
        '<span class="md-slot-title-wrap"><span class="md-slot-title">' + esc(track.name) + '</span></span>'
      btn.onclick = () => {
        if (!this.expanded) this.open()
        if (this._handlers.onSelectTrack) this._handlers.onSelectTrack(track.id)
      }
      this._slotsHost.appendChild(btn)
      return { track, btn }
    })
  }

  _bindEvents() {
    this._pill.onclick = () => this.toggle()

    for (const el of Array.from(this.root.querySelectorAll('[data-dial-act="collapse"]'))) {
      /** @type {HTMLElement} */ (el).onclick = () => this.close()
    }
    const prevBtn = /** @type {HTMLButtonElement|null} */ (this.root.querySelector('[data-dial-act="prev"]'))
    const nextBtn = /** @type {HTMLButtonElement|null} */ (this.root.querySelector('[data-dial-act="next"]'))
    if (prevBtn) prevBtn.onclick = () => { if (this._handlers.onPrevTrack) this._handlers.onPrevTrack() }
    if (nextBtn) nextBtn.onclick = () => { if (this._handlers.onNextTrack) this._handlers.onNextTrack() }
    if (this._playBtn) this._playBtn.onclick = () => { if (this._handlers.onTogglePlay) this._handlers.onTogglePlay() }
    if (this._carouselBtn) this._carouselBtn.onclick = () => { if (this._handlers.onToggleCarousel) this._handlers.onToggleCarousel() }
    if (this._muteBtn) this._muteBtn.onclick = () => { if (this._handlers.onToggleMute) this._handlers.onToggleMute() }

    const fileInp = /** @type {HTMLInputElement|null} */ (this.root.querySelector('[data-dial-file]'))
    if (fileInp) {
      fileInp.onchange = () => {
        const f = fileInp.files && fileInp.files[0]
        if (f && this._handlers.onUploadFile) this._handlers.onUploadFile(f)
      }
    }

    // Mouse-wheel rotary jog feel when expanded
    this._wheel.addEventListener('wheel', e => {
      if (!this.expanded) return
      e.preventDefault()
      const now = performance.now()
      if (now < this._wheelLockUntil) return
      this._wheelLockUntil = now + 115
      if (e.deltaY > 0) {
        if (this._handlers.onNextTrack) this._handlers.onNextTrack()
      } else if (e.deltaY < 0) {
        if (this._handlers.onPrevTrack) this._handlers.onPrevTrack()
      }
    }, { passive: false })
  }

  open() {
    this.expanded = true
    this.root.classList.add('open')
    this._pill.setAttribute('aria-expanded', 'true')
    this._layoutWheel()
    this._syncAnimLoop()
  }

  close() {
    this.expanded = false
    this.root.classList.remove('open')
    this._pill.setAttribute('aria-expanded', 'false')
    this._syncAnimLoop()
  }

  toggle() {
    if (this.expanded) this.close()
    else this.open()
    return this.expanded
  }

  /** @param {any} bgmState */
  sync(bgmState) {
    if (!bgmState) return
    this._state = { ...this._state, ...bgmState }
    const def = bgmTrackDef(this._state.mode)
    const labelText = this._state.customTitle || def.name

    // Active song label in collapsed pill — keep persistent span node so pointer sequences never detach mid-click
    if (this._pillSpanEl && this._lastPillTitle !== labelText) {
      this._lastPillTitle = labelText
      this._pillSpanEl.className = labelText.length > 14 ? 'md-marquee' : 'md-static'
      this._pillSpanEl.textContent = labelText
      this._pillTitleEl.title = labelText
    }

    const isPlaying = Boolean(this._state.playing && !this._state.muted)
    this.root.classList.toggle('is-playing', isPlaying)
    this.root.classList.toggle('is-muted', Boolean(this._state.muted))

    if (this._playBtn) {
      this._playBtn.textContent = isPlaying ? '⏸' : '▶'
      this._playBtn.title = isPlaying ? '暂停播放' : '继续播放'
    }
    if (this._carouselBtn) {
      this._carouselBtn.classList.toggle('on', Boolean(this._state.carousel))
      this._carouselBtn.textContent = this._state.carousel ? '🔁 轮播' : '🔂 单曲'
    }
    if (this._muteBtn) {
      this._muteBtn.textContent = this._state.muted ? '🔇' : '🔊'
    }
    if (this._modeTagEl) {
      this._modeTagEl.textContent = this._state.customTitle
        ? '本地曲目'
        : (this._state.carousel ? '自动轮播 · ' + BGM_TRACKS.length + '首' : '单曲循环')
    }
    if (this._customBarEl) {
      this._customBarEl.textContent = this._state.customTitle ? ('♪ ' + this._state.customTitle) : ''
      this._customBarEl.style.display = this._state.customTitle ? 'block' : 'none'
    }

    this._layoutWheel()
    this._syncAnimLoop()
  }

  _layoutWheel() {
    if (!this._slots || !this._slots.length) return
    const n = this._slots.length
    let activeIdx = BGM_TRACKS.findIndex(t => t.id === this._state.mode)
    if (activeIdx < 0) activeIdx = 0

    const isCompact = typeof window !== 'undefined' && window.innerWidth <= 600
    const rx = isCompact ? 134 : 168
    const ry = isCompact ? 160 : 204

    for (let i = 0; i < n; i++) {
      const { btn, track } = this._slots[i]
      // Wrapped shortest distance in [-n/2, n/2] so turntable wraps infinitely
      let d = i - activeIdx
      if (d > n / 2) d -= n
      if (d < -n / 2) d += n

      const absD = Math.abs(d)
      const angle = d * 0.48 // generous spacing so inner vinyl core stays unobstructed
      const tx = -Math.cos(angle) * rx + (absD === 0 ? (isCompact ? -8 : -14) : 0)
      const ty = Math.sin(angle) * ry

      const scale = absD === 0 ? 1.12 : absD === 1 ? 0.85 : absD === 2 ? 0.72 : 0.60
      const opacity = absD === 0 ? 1 : absD === 1 ? 0.80 : absD === 2 ? 0.46 : 0

      btn.classList.toggle('active', absD === 0)
      btn.classList.toggle('near', absD === 1)
      btn.classList.toggle('is-long', track.name.length > 18)
      btn.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translateY(-50%) scale(${scale})`
      btn.style.opacity = String(opacity)
      btn.style.pointerEvents = absD <= 2 ? 'auto' : 'none'
      btn.style.zIndex = String(10 - absD)
    }
  }

  _syncAnimLoop() {
    const shouldAnimate = Boolean(this._state.playing && !this._state.muted)
    if (shouldAnimate && !this._raf) {
      const step = () => {
        if (!this._state.playing || this._state.muted || !this.root.isConnected) {
          this._raf = 0
          return
        }
        const bars = this._handlers.getSpectrum ? this._handlers.getSpectrum(14) : []
        for (let i = 0; i < this._eqBars.length; i++) {
          const val = bars[i * 2] ?? 0.35
          const bar = /** @type {HTMLElement} */ (this._eqBars[i])
          bar.style.transform = `scaleY(${(0.22 + val * 0.85).toFixed(2)})`
        }
        if (this.expanded) {
          for (let i = 0; i < this._radialBars.length; i++) {
            const val = bars[i] ?? 0.25
            const rbar = /** @type {HTMLElement} */ (this._radialBars[i])
            rbar.style.transform = `rotate(var(--rdeg)) scaleX(${(0.35 + val * 1.15).toFixed(2)})`
          }
        }
        this._raf = requestAnimationFrame(step)
      }
      this._raf = requestAnimationFrame(step)
    } else if (!shouldAnimate) {
      if (this._raf) {
        cancelAnimationFrame(this._raf)
        this._raf = 0
      }
      const idleHeights = [0.32, 0.68, 0.46, 0.84, 0.54]
      for (let i = 0; i < this._eqBars.length; i++) {
        const bar = /** @type {HTMLElement} */ (this._eqBars[i])
        bar.style.transform = `scaleY(${idleHeights[i] ?? 0.36})`
      }
      for (let i = 0; i < this._radialBars.length; i++) {
        const rbar = /** @type {HTMLElement} */ (this._radialBars[i])
        rbar.style.transform = `rotate(var(--rdeg)) scaleX(${(0.35 + (i % 3) * 0.14).toFixed(2)})`
      }
    }
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
    if (this._onResize && typeof removeEventListener === 'function') removeEventListener('resize', this._onResize)
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
  }
}
