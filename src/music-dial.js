import { BGM_TRACKS, bgmTrackDef } from '../shared/constants.js'

const esc = s => String(s === null || s === undefined ? '' : s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m] || m))
const DIAL_POS_KEY = 'law_dial_top_pct'
const DIAL_COACH_KEY = 'law_music_coach_done'

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
 * Side-edge collapsible true-semicircle vinyl turntable audio switcher.
 * - Collapsed: compact vertically draggable right-edge handle (compact mini-ear on mobile/gameplay).
 * - Expanded: smooth geometric half-disc turntable with touch/pointer rotary spin, mouse-wheel scroll,
 *   magnified active center track, tapered side track slots, and clean non-clipping marquee labels.
 */
export class MusicDial {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.parent = parent
    this.expanded = false
    this._state = {
      mode: BGM_TRACKS[0].id,
      activeTrack: BGM_TRACKS[0].id,
      playingTrack: BGM_TRACKS[0].id,
      bufferingTrack: '',
      bufferingTrackName: '',
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
    this._suppressPillClickUntil = 0
    this._wheelSuppressClickUntil = 0
    this._dragSlotDelta = 0
    this._lastPillTitle = ''
    this._pillTopPct = this._loadSavedTopPct()
    /** @type {0|1|2} */
    this._coachStep = 0
    /** @type {HTMLElement|null} */
    this._coachEl = null

    this.root = document.createElement('aside')
    this.root.id = 'music-dial'
    this.root.className = 'music-dial'
    this.root.setAttribute('aria-label', '校园夜巡音乐转盘')
    this.root.innerHTML = this._template()
    parent.appendChild(this.root)

    this._pill = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-pill]'))
    this._wheel = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-wheel]'))
    this._slotsHost = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-slots]'))
    this._vinylEl = /** @type {HTMLElement} */ (this.root.querySelector('.md-vinyl'))
    this._pillTitleEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-pill-title]'))
    this._pillSpanEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-pill-span]'))
    this._modeTagEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-mode]'))
    this._playBtn = /** @type {HTMLButtonElement} */ (this.root.querySelector('[data-dial-act="play"]'))
    this._carouselBtn = /** @type {HTMLButtonElement} */ (this.root.querySelector('[data-dial-act="carousel"]'))
    this._muteBtn = /** @type {HTMLButtonElement} */ (this.root.querySelector('[data-dial-act="mute"]'))
    this._customBarEl = /** @type {HTMLElement} */ (this.root.querySelector('[data-dial-custom]'))
    this._eqBars = Array.from(this.root.querySelectorAll('[data-eqbar]'))

    this._applyDockPosition()
    this._buildSlots()
    this._bindEvents()
    this._onResize = () => {
      this._applyDockPosition()
      if (this.expanded) this._layoutWheel(this._dragSlotDelta)
    }
    if (typeof addEventListener === 'function') addEventListener('resize', this._onResize)
    this.sync(this._state)
  }

  _defaultTopPct() {
    const narrow = typeof window !== 'undefined' && window.innerWidth <= 680
    return narrow ? 74 : 64
  }

  _loadSavedTopPct() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DIAL_POS_KEY) : null
      const num = raw !== null ? Number(raw) : NaN
      if (Number.isFinite(num) && num >= 14 && num <= 86) return num
    } catch {}
    return this._defaultTopPct()
  }

  _saveTopPct(pct) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(DIAL_POS_KEY, pct.toFixed(1))
    } catch {}
  }

  _applyDockPosition() {
    const h = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800
    const minPct = Math.min(40, (74 / h) * 100)
    const maxPct = Math.max(60, ((h - 86) / h) * 100)
    const clamped = Math.max(minPct, Math.min(maxPct, this._pillTopPct))
    this.root.style.setProperty('--dial-top', `${clamped.toFixed(2)}%`)
  }

  /** @param {any} handlers */
  bindHandlers(handlers = {}) {
    this._handlers = handlers || {}
  }

  _template() {
    const miniEq = Array.from({ length: 5 }, (_, i) =>
      `<i class="md-eq-bar" data-eqbar="${i}"></i>`
    ).join('')

    return (
      '<button type="button" class="md-pill" data-dial-pill aria-expanded="false" title="点击展开转盘 / 按住上下拖动位置">' +
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
          '<div class="md-rim-halo" aria-hidden="true"></div>' +
          '<div class="md-vinyl">' +
            '<div class="md-vinyl-grooves"></div>' +
            '<div class="md-vinyl-sheen"></div>' +
            '<div class="md-vinyl-label">' +
              '<span class="md-label-dot"></span>' +
            '</div>' +
          '</div>' +
          '<div class="md-tonearm" aria-hidden="true"><i class="md-arm-rod"></i><i class="md-arm-head"></i></div>' +
          '<div class="md-core-controls">' +
            '<div class="md-status-tag" data-dial-mode>自动轮播 · 8首</div>' +
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
              '<button type="button" class="md-mini-btn" data-dial-act="coach" title="音乐转盘指引">?</button>' +
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
        if (performance.now() < this._wheelSuppressClickUntil) return
        if (!this.expanded) this.open()
        if (this._coachStep === 2) this.finishCoach(true)
        if (this._handlers.onSelectTrack) this._handlers.onSelectTrack(track.id)
      }
      this._slotsHost.appendChild(btn)
      return { track, btn }
    })
  }

  _bindEvents() {
    // Vertically draggable edge capsule: tap expands turntable, drag moves dock height smoothly
    let pillPtr = null
    const onPillMove = e => {
      if (!pillPtr || e.pointerId !== pillPtr.id) return
      const dy = e.clientY - pillPtr.startY
      if (!pillPtr.moved && Math.abs(dy) >= 6) {
        pillPtr.moved = true
        this.root.classList.add('pill-dragging')
      }
      if (pillPtr.moved) {
        if (e.cancelable) e.preventDefault()
        const h = pillPtr.vh || window.innerHeight || 800
        const nextY = Math.max(74, Math.min(h - 86, pillPtr.startTopPx + dy))
        this._pillTopPct = (nextY / h) * 100
        this._applyDockPosition()
      }
    }
    const finishPillPtr = e => {
      if (!pillPtr || e.pointerId !== pillPtr.id) return
      const moved = pillPtr.moved
      pillPtr = null
      if (typeof removeEventListener === 'function') {
        removeEventListener('pointermove', onPillMove, true)
        removeEventListener('pointerup', finishPillPtr, true)
        removeEventListener('pointercancel', finishPillPtr, true)
      }
      if (moved) {
        this.root.classList.remove('pill-dragging')
        this._saveTopPct(this._pillTopPct)
        this._suppressPillClickUntil = performance.now() + 220
      }
    }
    this._pill.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const rect = this._pill.getBoundingClientRect()
      const h = window.innerHeight || 800
      pillPtr = {
        id: e.pointerId,
        startY: e.clientY,
        startTopPx: rect.top + rect.height / 2,
        moved: false,
        vh: h
      }
      if (typeof addEventListener === 'function') {
        addEventListener('pointermove', onPillMove, { capture: true, passive: false })
        addEventListener('pointerup', finishPillPtr, true)
        addEventListener('pointercancel', finishPillPtr, true)
      }
    })
    this._pill.onclick = () => {
      if (performance.now() < this._suppressPillClickUntil) return
      this.toggle()
    }

    for (const el of Array.from(this.root.querySelectorAll('[data-dial-act="collapse"]'))) {
      /** @type {HTMLElement} */ (el).onclick = () => this.close()
    }
    const prevBtn = /** @type {HTMLButtonElement|null} */ (this.root.querySelector('[data-dial-act="prev"]'))
    const nextBtn = /** @type {HTMLButtonElement|null} */ (this.root.querySelector('[data-dial-act="next"]'))
    const coachBtn = /** @type {HTMLButtonElement|null} */ (this.root.querySelector('[data-dial-act="coach"]'))
    if (prevBtn) prevBtn.onclick = () => { if (this._coachStep === 2) this.finishCoach(true); if (this._handlers.onPrevTrack) this._handlers.onPrevTrack() }
    if (nextBtn) nextBtn.onclick = () => { if (this._coachStep === 2) this.finishCoach(true); if (this._handlers.onNextTrack) this._handlers.onNextTrack() }
    if (coachBtn) coachBtn.onclick = () => this.startCoach(true)
    if (this._playBtn) this._playBtn.onclick = () => { if (this._handlers.onTogglePlay) this._handlers.onTogglePlay() }
    if (this._carouselBtn) this._carouselBtn.onclick = () => { if (this._coachStep === 2) this.finishCoach(true); if (this._handlers.onToggleCarousel) this._handlers.onToggleCarousel() }
    if (this._muteBtn) this._muteBtn.onclick = () => { if (this._handlers.onToggleMute) this._handlers.onToggleMute() }

    const fileInp = /** @type {HTMLInputElement|null} */ (this.root.querySelector('[data-dial-file]'))
    if (fileInp) {
      fileInp.onchange = () => {
        const f = fileInp.files && fileInp.files[0]
        if (f && this._handlers.onUploadFile) {
          if (this._coachStep === 2) this.finishCoach(true)
          this._handlers.onUploadFile(f)
        }
      }
    }

    // Continuous finger & mouse rotary spin across expanded wheel & slots (capture + window listeners so fast swipes anywhere never drop)
    let wheelPtr = null
    const pivotAngle = (cx, cy, x, y) => Math.atan2(y - cy, Math.max(32, cx - x))

    this._wheel.addEventListener('click', e => {
      if (performance.now() < this._wheelSuppressClickUntil) {
        e.preventDefault()
        e.stopPropagation()
      }
    }, true)

    const onWheelMove = e => {
      if (!wheelPtr || e.pointerId !== wheelPtr.id) return
      const dist = Math.hypot(e.clientX - wheelPtr.startX, e.clientY - wheelPtr.startY)
      if (!wheelPtr.dragging && dist >= 7) {
        wheelPtr.dragging = true
        this._isWheelDragging = true
        this.root.classList.add('is-dragging')
      }
      if (wheelPtr.dragging) {
        if (e.cancelable) e.preventDefault()
        const curA = pivotAngle(wheelPtr.cx, wheelPtr.cy, e.clientX, e.clientY)
        const dAngle = curA - wheelPtr.startA
        const vertBlend = (e.clientY - wheelPtr.startY) / (window.innerWidth <= 600 ? 130 : 165)
        const slotsDelta = Math.abs(dAngle) > 0.02 ? (dAngle / 0.42 + vertBlend) * 0.58 : vertBlend
        this._dragSlotDelta = slotsDelta
        this._layoutWheel(slotsDelta)
        if (this._vinylEl) {
          this._vinylEl.style.transform = `rotate(${(slotsDelta * 36).toFixed(1)}deg)`
        }
      }
    }

    const finishWheelPtr = e => {
      if (!wheelPtr || e.pointerId !== wheelPtr.id) return
      const wasDrag = wheelPtr.dragging
      wheelPtr = null
      if (typeof removeEventListener === 'function') {
        removeEventListener('pointermove', onWheelMove, true)
        removeEventListener('pointerup', finishWheelPtr, true)
        removeEventListener('pointercancel', finishWheelPtr, true)
      }
      if (wasDrag) {
        this._isWheelDragging = false
        this.root.classList.remove('is-dragging')
        if (this._vinylEl) this._vinylEl.style.transform = ''
        const n = BGM_TRACKS.length
        const activeIdx = Math.max(0, BGM_TRACKS.findIndex(t => t.id === this._state.mode))
        const steps = Math.round(-this._dragSlotDelta)
        this._dragSlotDelta = 0
        this._wheelSuppressClickUntil = performance.now() + 240
        if (steps !== 0 && this._handlers.onSelectTrack) {
          const nextIdx = ((activeIdx + steps) % n + n) % n
          if (this._coachStep === 2) this.finishCoach(true)
          this._handlers.onSelectTrack(BGM_TRACKS[nextIdx].id)
        } else {
          this._layoutWheel(0)
        }
      }
    }

    this._wheel.addEventListener('pointerdown', e => {
      if (!this.expanded) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const tgt = e.target
      if (tgt instanceof Element && tgt.closest('input[type="file"]')) return
      const dr = this._wheel.getBoundingClientRect()
      const cy = dr.top || (window.innerHeight || 800) / 2
      const cx = window.innerWidth || 1200
      wheelPtr = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        cx,
        cy,
        startA: pivotAngle(cx, cy, e.clientX, e.clientY),
        dragging: false
      }
      if (typeof addEventListener === 'function') {
        addEventListener('pointermove', onWheelMove, { capture: true, passive: false })
        addEventListener('pointerup', finishWheelPtr, true)
        addEventListener('pointercancel', finishWheelPtr, true)
      }
    }, true)

    // Mouse-wheel rotary scroll on desktop
    this._wheel.addEventListener('wheel', e => {
      if (!this.expanded) return
      e.preventDefault()
      const now = performance.now()
      if (now < this._wheelLockUntil) return
      this._wheelLockUntil = now + 115
      if (this._coachStep === 2) this.finishCoach(true)
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
    this._dragSlotDelta = 0
    this._layoutWheel(0)
    this._syncAnimLoop()
    if (this._coachStep === 1) {
      this._setCoachStep(2)
    }
  }

  close() {
    this.expanded = false
    this._dragSlotDelta = 0
    this.root.classList.remove('open', 'is-dragging')
    this._pill.setAttribute('aria-expanded', 'false')
    this._syncAnimLoop()
    if (this._coachStep === 2) {
      this.hideCoach()
    }
  }

  hasCompletedCoach() {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(DIAL_COACH_KEY) === '1'
    } catch {
      return false
    }
  }

  startCoach(force = false) {
    if (!force && this.hasCompletedCoach()) return false
    this._setCoachStep(this.expanded ? 2 : 1)
    return true
  }

  hideCoach() {
    this._coachStep = 0
    this.root.classList.remove('coach-step-1', 'coach-step-2')
    if (this._coachEl) {
      this._coachEl.remove()
      this._coachEl = null
    }
  }

  finishCoach(markDone = true) {
    const wasActive = this._coachStep > 0
    this.hideCoach()
    if (markDone) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(DIAL_COACH_KEY, '1')
      } catch {}
      if (wasActive && this._handlers.onCoachComplete) {
        this._handlers.onCoachComplete()
      }
    }
  }

  /** @param {0|1|2} step */
  _setCoachStep(step) {
    this._coachStep = step
    this.root.classList.toggle('coach-step-1', step === 1)
    this.root.classList.toggle('coach-step-2', step === 2)
    if (!step) {
      this.hideCoach()
      return
    }
    if (!this._coachEl) {
      const box = document.createElement('div')
      box.className = 'md-coach'
      box.setAttribute('role', 'status')
      box.setAttribute('aria-live', 'polite')
      this.root.appendChild(box)
      this._coachEl = box
    }
    if (step === 1) {
      this._coachEl.className = 'md-coach step-1'
      this._coachEl.innerHTML =
        '<div class="md-coach-head">' +
          '<span class="md-coach-badge">配乐指引 1/2</span>' +
          '<button type="button" class="md-coach-skip" data-coach-skip>跳过</button>' +
        '</div>' +
        '<div class="md-coach-title">🎵 点开黑胶音乐转盘</div>' +
        '<p class="md-coach-desc">点击右侧小唱片即可展开切歌；按住上下拖动可自由挪动停靠高度。</p>' +
        '<span class="md-coach-arrow" aria-hidden="true"></span>'
      const skipBtn = /** @type {HTMLButtonElement|null} */ (this._coachEl.querySelector('[data-coach-skip]'))
      if (skipBtn) skipBtn.onclick = () => this.finishCoach(true)
    } else {
      this._coachEl.className = 'md-coach step-2'
      this._coachEl.innerHTML =
        '<div class="md-coach-head">' +
          '<span class="md-coach-badge">配乐指引 2/2</span>' +
          '<button type="button" class="md-coach-skip" data-coach-skip>我学会了 ✓</button>' +
        '</div>' +
        '<div class="md-coach-title">👆 拨动转盘或点击选曲</div>' +
        '<p class="md-coach-desc">上下滑动黑胶即可旋转选歌，也能直接点歌名；盘内支持轮播/单曲、静音及 📁 导入本地音乐。</p>'
      const doneBtn = /** @type {HTMLButtonElement|null} */ (this._coachEl.querySelector('[data-coach-skip]'))
      if (doneBtn) doneBtn.onclick = () => this.finishCoach(true)
    }
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

    // Keep persistent span node so first-gesture audio unlock never tears down click targets
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
      if (this._state.customTitle) {
        this._modeTagEl.textContent = '本地曲目'
      } else if (this._state.bufferingTrack) {
        this._modeTagEl.textContent = '缓冲中 · 先听轻享'
      } else {
        this._modeTagEl.textContent = this._state.carousel ? '自动轮播 · ' + BGM_TRACKS.length + '首' : '单曲循环'
      }
    }
    if (this._customBarEl) {
      this._customBarEl.textContent = this._state.customTitle ? ('♪ ' + this._state.customTitle) : ''
      this._customBarEl.style.display = this._state.customTitle ? 'block' : 'none'
    }

    if (!this._isWheelDragging) this._layoutWheel(0)
    this._syncAnimLoop()
  }

  _layoutWheel(dragDelta = 0) {
    if (!this._slots || !this._slots.length) return
    const n = this._slots.length
    let activeIdx = BGM_TRACKS.findIndex(t => t.id === this._state.mode)
    if (activeIdx < 0) activeIdx = 0

    const isCompact = typeof window !== 'undefined' && window.innerWidth <= 600
    const rx = isCompact ? 140 : 180
    const ry = isCompact ? 164 : 206

    for (let i = 0; i < n; i++) {
      const { btn, track } = this._slots[i]
      // Continuous wrapped orbital offset around centered pointer
      let d = (i - activeIdx) + dragDelta
      while (d > n / 2) d -= n
      while (d < -n / 2) d += n

      const absD = Math.abs(d)
      const angle = d * 0.48
      const centerPush = Math.max(0, 1 - absD) * (isCompact ? -8 : -10)
      const tx = -Math.cos(angle) * rx + centerPush
      const ty = Math.sin(angle) * ry

      let scale = 0.60
      let opacity = 0
      if (absD < 1) {
        scale = 1.12 - absD * (1.12 - 0.85)
        opacity = 1 - absD * 0.20
      } else if (absD < 2) {
        scale = 0.85 - (absD - 1) * (0.85 - 0.72)
        opacity = 0.80 - (absD - 1) * 0.34
      } else if (absD < 2.6) {
        const k = (absD - 2) / 0.6
        scale = 0.72 - k * 0.12
        opacity = 0.46 * (1 - k)
      }

      btn.classList.toggle('active', absD < 0.5)
      btn.classList.toggle('near', absD >= 0.5 && absD < 1.5)
      btn.classList.toggle('is-long', track.name.length > 18)
      btn.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translateY(-50%) scale(${scale.toFixed(3)})`
      btn.style.opacity = opacity.toFixed(2)
      btn.style.pointerEvents = absD <= 2.3 ? 'auto' : 'none'
      btn.style.zIndex = String(Math.round(12 - absD * 3))
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
    }
  }

  dispose() {
    this.hideCoach()
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
    if (this._onResize && typeof removeEventListener === 'function') removeEventListener('resize', this._onResize)
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root)
  }
}
