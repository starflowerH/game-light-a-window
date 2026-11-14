// All DOM overlays: title, HUD, story cards, night summaries, result + leaderboard.
const esc = s => String(s ?? '').replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]))

export class UI {
  constructor(root) {
    this.root = root
    this.el = document.createElement('div'); this.el.id = 'ui'; this.el.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none'
    root.appendChild(this.el)
    this.fx = document.getElementById('fx')
  }

  _layer(html, cls = '') { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d }

  showTitle(onStart) {
    this.hideAll()
    const s = this._layer(`
      <div class="screen" data-screen="title">
        <div class="panel fade-in">
          <div class="kicker">A COZY CAMPUS NIGHT</div>
          <h1>今晚，<span class="accent">亮一盏灯</span></h1>
          <p class="lede">一栋宿舍，二十四扇窗。<br/>点亮正在发光的窗户，<b>看整栋楼慢慢亮起来</b>。</p>
          <div class="pills"><span class="pill">只有一个动作：点亮</span><span class="pill">连击有光链</span><span class="pill">没有失败，也不会扣分</span></div>
          <button class="btn primary" data-act="start">开始今晚</button>
          <button class="btn ghost" data-act="board">看看排行榜</button>
          <div class="note">AI 会为每一晚生成天气、小故事和一张明信片。你的成绩会进入今晚的匿名榜单。</div>
        </div>
      </div>`, '')
    s.querySelector('[data-act="start"]').onclick = onStart
    s.querySelector('[data-act="board"]').onclick = () => this.showLeaderboard()
    this.el.appendChild(s); this._cur = s
    requestAnimationFrame(() => { this.el.querySelector('.panel')?.classList.add('fade-in') })
    this.onStart = onStart
  }

  showLoading() {
    this.hideAll()
    const s = this._layer(`<div class="screen"><div class="panel" style="text-align:center"><div class="spin" style="margin:0 auto 16px"></div><h1 style="font-size:26px">灯，正在一盏盏亮起</h1><p class="lede" style="margin-bottom:0">正在为今晚准备天气、小故事和明信片…</p></div></div>`)
    this.el.appendChild(s); this._cur = s
  }

  hideAll() {
    this.el.querySelectorAll('.screen').forEach(n => n.remove())
    this.hideStory(); this.hidePause(); this.hideCoach()
    this._cur = null
    const hud = document.getElementById('hud')
    if (hud) { hud.classList.remove('on'); setTimeout(() => hud.remove(), 400) }
    this.hudEl = null
  }

  startNight({ night, index, count, onPause, onMute }) {
    this.hideAll(); this.hideStory()
    document.getElementById('hud')?.remove()
    const hud = document.createElement('div'); hud.id = 'hud'
    hud.innerHTML = `
      <div class="brand"><b>今晚，亮一盏灯</b><span>LIGHT A WINDOW</span></div>
      <div class="hud-top">
        <div class="stats">
          <div class="stat"><span class="chip">第 ${index + 1} 晚 / ${count}</span></div>
          <div class="stat"><span class="lab">温暖</span><b data-warm>0</b></div>
          <div class="warmbar"><i data-warmbar></i></div>
          <div class="stat"><span class="lab">连击</span><b data-combo>0</b></div>
          <div class="stat"><span class="lab">剩余</span><b data-time>75</b><span class="lab">s</span></div>
        </div>
      </div>
      <div class="hud-actions"><button class="iconbtn" data-mute title="声音">🔊</button><button class="iconbtn" data-pause title="暂停">⏸</button></div>
      <div class="hint">点击发光的窗户 · 连续点亮形成光链 · 偶尔有惊喜</div>`
    this.el.appendChild(hud)
    requestAnimationFrame(() => hud.classList.add('on'))
    hud.querySelector('[data-pause]').onclick = onPause
    hud.querySelector('[data-mute]').onclick = (e) => { const m = onMute(); e.currentTarget.textContent = m ? '🔇' : '🔊' }
    this.hudEl = hud
    this._warmEl = hud.querySelector('[data-warm]'); this._barEl = hud.querySelector('[data-warmbar]')
    this._comboEl = hud.querySelector('[data-combo]'); this._timeEl = hud.querySelector('[data-time]')
  }

  setStats(game) {
    if (!game.night || !this._warmEl) return
    this._warmEl.textContent = game.night.warmth
    this._barEl.style.width = Math.min(100, game.night.warmth / 1.2) + '%'
    this._comboEl.textContent = game.night.combo
  }

  tick(game) {
    if (!this._timeEl || !game.night) return
    this._timeEl.textContent = Math.ceil(game.night.timeLeft)
    if (game.night.timeLeft < 10) this._timeEl.style.color = '#ff9a7a'
    this._warmEl.textContent = game.night.warmth
    this._barEl.style.width = Math.min(100, game.night.warmth / 1.2) + '%'
    this._comboEl.textContent = game.night.combo
  }

  combo(n) {
    let c = this._comboEl2
    if (!c) { c = document.createElement('div'); c.id = 'combo'; this.el.appendChild(c); this._comboEl2 = c }
    if (!n) { c.classList.remove('show'); return }
    const words = n >= 15 ? '灯海' : n >= 10 ? '光链' : n >= 6 ? '连击' : '点亮'
    c.innerHTML = `<div class="n" style="transform:scale(${Math.min(1.4, 0.8 + n * 0.03)})">×${n}</div><div class="t">${words}</div>`
    c.classList.add('show'); c.style.transform = 'translate(-50%,-50%) scale(1)'
    c.animate([{ transform: 'translate(-50%,-50%) scale(.85)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 160, easing: 'ease-out' })
  }

  floatText(text, x, y, color = '#ffd27a', kind = '') {
    const d = document.createElement('div'); d.className = 'pop' + (kind === 'center' ? ' center' : '')
    d.textContent = text; d.style.color = color
    if (kind === 'center') { d.style.left = '50%'; d.style.top = '42%'; d.style.fontSize = '34px' }
    else { d.style.left = x + 'px'; d.style.top = y + 'px' }
    if (kind === 'big') d.style.fontSize = '34px'
    this.fx.appendChild(d)
    d.animate([{ opacity: 1, transform: `translate(-50%,-50%) translateY(0) scale(1)` }, { opacity: 0, transform: `translate(-50%,-50%) translateY(-70px) scale(1.15)` }], { duration: 900, easing: 'cubic-bezier(.2,.9,.25,1)' }).onfinish = () => d.remove()
  }

  pulse() {
    let d = document.getElementById('tapglow')
    if (!d) { d = document.createElement('div'); d.id = 'tapglow'; document.body.appendChild(d) }
    d.animate([{ opacity: .9 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' })
  }

  shockwave(x, y) {
    const d = document.createElement('div'); d.className = 'shock'; d.style.left = x + 'px'; d.style.top = y + 'px'
    this.fx.appendChild(d)
    d.animate([{ width: '10px', height: '10px', opacity: .9, marginLeft: '-5px', marginTop: '-5px' }, { width: '120px', height: '120px', opacity: 0, marginLeft: '-60px', marginTop: '-60px' }], { duration: 520, easing: 'ease-out' }).onfinish = () => d.remove()
  }

  toast(text, gain) {
    document.getElementById('toast')?.remove()
    const d = document.createElement('div'); d.id = 'toast'
    d.style.cssText = 'position:fixed;left:50%;top:calc(74px + env(safe-area-inset-top));transform:translateX(-50%) translateY(0);opacity:1;z-index:9999;display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:16px;background:linear-gradient(135deg,rgba(38,28,18,.94),rgba(60,40,22,.94));border:1px solid rgba(255,205,140,.45);box-shadow:0 18px 50px rgba(0,0,0,.5),0 0 30px rgba(255,180,90,.28);backdrop-filter:blur(10px);max-width:90vw;pointer-events:none'
    d.innerHTML = `<div class="tw" style="color:#ffd27a;font-size:20px;filter:drop-shadow(0 0 8px rgba(255,190,100,.9))">✦</div><div class="tb" style="display:flex;flex-direction:column;gap:2px"><b style="font-size:14px;color:#ffedc8;font-weight:700;letter-spacing:.02em">${esc(text)}</b>${gain ? `<span style="font-size:12px;color:#ffbe6a;font-weight:800">${esc(gain)}</span>` : ''}</div>`
    document.body.appendChild(d)
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => d.remove(), 2400)
  }

  banner(text) {
    const d = document.createElement('div'); d.className = 'lit-banner'; d.textContent = text
    this.el.appendChild(d); requestAnimationFrame(() => d.classList.add('show'))
    setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 500) }, 1600)
  }

  flash(kind) {
    const d = document.createElement('div')
    d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6'
    const col = kind === 'golden' ? '255,210,120' : '255,180,90'
    d.animate([{ background: `radial-gradient(circle at 50% 45%, rgba(${col},.35), transparent 55%)`, opacity: 1 }, { background: `radial-gradient(circle at 50% 45%, rgba(${col},0), transparent 55%)`, opacity: 0 }], { duration: 700 })
    this.fx.appendChild(d); setTimeout(() => d.remove(), 720)
  }

  story(s, onClose, duration = 6000) {
    document.getElementById('story')?.remove()
    const d = document.createElement('div'); d.id = 'story'
    d.innerHTML = `<div class="eyebrow">窗后的小事</div><div class="icon"><span class="halo"></span>${esc(s.icon || '✧')}</div><h3>${esc(s.text)}</h3><div class="band">+6 温暖 · 收进了今晚的小物件：${esc(s.item || '小回忆')}</div>`
    this.el.appendChild(d); requestAnimationFrame(() => d.classList.add('show'))
    this._storyTimer = setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 500) }, duration)
    d.onclick = () => { clearTimeout(this._storyTimer); d.classList.remove('show'); onClose?.(); setTimeout(() => d.remove(), 500) }
  }
  hideStory() { document.getElementById('story')?.remove(); clearTimeout(this._storyTimer) }

  nightSummary(sum, onNext) {
    this.hideStory(); this.hideAll()
    const last = sum.night === sum.count
    const s = this._layer(`<div class="screen"><div class="panel fade-in" style="text-align:center">
      <div class="kicker">第 ${sum.night} 晚 · 结束</div>
      <h1 style="font-size:30px">${['灯，安静地亮着','风把灯吹得更暖了','整栋楼都有了回声'][sum.night - 1] || '灯，亮了'}</h1>
      <div class="statgrid"><div class="cell"><b>${sum.warmth}</b><span>温暖</span></div><div class="cell"><b>${sum.lit}</b><span>点亮窗</span></div><div class="cell"><b>${sum.maxCombo}</b><span>最高连击</span></div></div>
      <p class="lede" style="margin-bottom:16px">${last ? '最后一晚了，把灯都点亮吧。' : '天还会一点一点暗下去，下一晚的窗会更少、更慢。'}</p>
      <button class="btn primary" data-act="next">${last ? '看看今晚的明信片' : '继续第 ' + (sum.night + 1) + ' 晚'}</button>
    </div></div>`)
    s.querySelector('[data-act="next"]').onclick = onNext
    this.el.appendChild(s); this._cur = s
  }

  async result({ run, records, postcard, nights, aiSource, onReplay }) {
    this.hideAll()
    const s = this._layer(`<div class="screen"><div class="panel fade-in" style="max-width:560px">
      <div class="kicker">今晚的明信片</div>
      <h1 style="font-size:28px;margin-bottom:12px">你点亮了 <span class="accent">${run.litTotal}</span> 扇窗</h1>
      <img class="postcard" src="${postcard}" alt="今晚的明信片"/>
      <a class="btn ghost" data-act="save" download="light-a-window-${Date.now()}.png" href="${postcard}" style="margin:-4px 0 14px">保存这张明信片</a>
      <div class="statgrid"><div class="cell"><b>${run.totalWarmth}</b><span>温暖值</span></div><div class="cell"><b>${run.maxCombo}</b><span>最高连击</span></div><div class="cell"><b>${records.bestWarmth}</b><span>历史最佳</span></div></div>
      ${run.items?.length ? `<p class="lede" style="margin:4px 0 14px">今晚收集到：${run.items.map(esc).join(' · ')}</p>` : ''}
      <div class="tabs"><button class="on" data-tab="board">今晚排行榜</button><button data-tab="me">我的记录</button></div>
      <div data-body class="board"></div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <input data-nick maxlength="8" placeholder="留个昵称上榜" style="flex:1;border:1px solid rgba(150,110,60,.35);border-radius:12px;padding:13px;font-size:15px;background:rgba(255,255,255,.6);color:#3a2410;font-family:inherit"/>
        <button class="btn primary" data-act="submit" style="width:130px">上榜</button>
      </div>
      <button class="btn ghost" data-act="replay">再来一晚</button>
      <div class="note">AI 来源：${aiSource === 'ai' ? '本次天气与故事由 AI 实时生成' : '本地内容（AI 暂不可用）'} · 明信片可长按保存</div>
    </div></div>`)
    this.el.appendChild(s); this._cur = s
    const body = s.querySelector('[data-body]')
    const tabs = s.querySelectorAll('[data-tab]')
    const nick = s.querySelector('[data-nick]')
    try { nick.value = localStorage.getItem('law.nick') || '' } catch {}
    const submit = s.querySelector('[data-act="submit"]')
    submit.onclick = async () => {
      const name = (nick.value || '').trim() || '今晚的某某'
      try { localStorage.setItem('law.nick', name) } catch {}
      submit.textContent = '…'; submit.disabled = true
      const res = await window.__game.submitScore(name)
      submit.textContent = res?.ok ? '已上榜' : '稍后再试'; setTimeout(() => { submit.disabled = false; submit.textContent = '上榜' }, 1200)
      showBoard(name)
    }
    s.querySelector('[data-act="replay"]').onclick = () => { this.hideAll(); onReplay() }
    const showBoard = (mine) => {
      tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === 'board'))
      body.innerHTML = '<div class="empty">正在读取今晚的灯…</div>'
      fetch('/api/leaderboard?limit=20').then(r => r.json()).then(d => {
        const items = d?.items || []
        if (!items.length) { body.innerHTML = '<div class="empty">今晚还没有人上榜，做第一个吧</div>'; return }
        body.innerHTML = items.map((it, i) => `<div class="row ${i < 3 ? 'top' : ''} ${mine && it.nickname === mine ? 'me' : ''}">
          <div class="rk">${i + 1}</div><div class="nm">${esc(it.nickname)}</div>
          <div style="text-align:right"><div class="sc">${it.total_warmth} 温暖</div><div class="meta">点亮 ${it.lit_windows} · 连击 ${it.max_combo}</div></div></div>`).join('')
      }).catch(() => { body.innerHTML = '<div class="empty">榜单暂时连接不上，稍后再看</div>' })
    }
    const showMe = () => {
      tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === 'me'))
      const h = records.history || []
      body.innerHTML = `
        <div class="row"><div class="nm">历史最佳温暖</div><div class="sc">${records.bestWarmth}</div></div>
        <div class="row"><div class="nm">最高连击</div><div class="sc">${records.bestCombo}</div></div>
        <div class="row"><div class="nm">总共点亮窗户</div><div class="sc">${records.totalWindows}</div></div>
        <div class="row"><div class="nm">玩过几晚</div><div class="sc">${records.plays}</div></div>
        ${h.length ? '<div class="row" style="background:transparent;justify-content:center;color:#9a7a52;font-size:11px">最近记录</div>' + h.slice(0, 8).map(x => `<div class="row"><div class="nm">${new Date(x.t).toLocaleDateString('zh-CN')} · 点亮 ${x.lit}</div><div class="sc">${x.warmth}</div></div>`).join('') : ''}`
    }
    tabs.forEach(t => t.onclick = () => t.dataset.tab === 'me' ? showMe() : showBoard(null))
    showBoard(null)
  }


  // Cinematic intro: typewriter narration, then resolve when finished.
  intro(lines, onDone) {
    this.hideAll()
    const wrap = document.createElement('div')
    wrap.id = 'intro'
    wrap.style.cssText = 'position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:radial-gradient(70% 60% at 50% 45%,rgba(8,12,26,.35),rgba(4,7,16,.82));opacity:0;transition:opacity .6s'
    wrap.innerHTML = `<div style="max-width:min(88vw,560px);text-align:center;padding:0 24px">
      <div id="intro-line" style="font-family:var(--serif);font-size:clamp(20px,3.4vw,30px);line-height:1.7;color:#f4ecd8;min-height:3.4em;letter-spacing:.04em;text-shadow:0 4px 30px rgba(0,0,0,.5)"></div>
      <div id="intro-skip" style="margin-top:26px;font-size:12px;letter-spacing:.3em;color:#9aa7c4;cursor:pointer;pointer-events:auto">轻触继续 ▸</div>
    </div>`
    document.body.appendChild(wrap)
    requestAnimationFrame(() => wrap.style.opacity = '1')
    let idx = 0, typing = false, finishedAll = false
    const lineEl = wrap.querySelector('#intro-line')
    const finish = () => { finishedAll = true; wrap.style.opacity = '0'; setTimeout(() => { wrap.remove(); onDone?.() }, 550) }
    const typeLine = () => {
      if (idx >= lines.length) { finishedAll = true; setTimeout(finish, 900); return }
      const text = lines[idx]; lineEl.textContent = ''; typing = true
      let i = 0
      const step = () => {
        if (finishedAll) return
        if (i <= text.length) { lineEl.textContent = text.slice(0, i); i++; this._introTimer = setTimeout(step, 58) }
        else { typing = false; idx++; this._introTimer = setTimeout(typeLine, 1100) }
      }
      step()
    }
    const advance = (e) => {
      e && e.stopPropagation()
      if (finishedAll) return
      if (typing) { clearTimeout(this._introTimer); typing = false; lineEl.textContent = lines[idx]; idx++; this._introTimer = setTimeout(typeLine, 380) }
      else finish()
    }
    wrap.addEventListener('pointerdown', advance)
    wrap.querySelector('#intro-skip').addEventListener('pointerdown', (e) => { e.stopPropagation(); finishedAll = true; clearTimeout(this._introTimer); finish() })
    this._introEl = wrap
    typeLine()
  }

  // In-game coach mark pointing at a screen position
  coach(text, x, y) {
    this.hideCoach()
    const d = document.createElement('div'); d.id = 'coach'
    d.innerHTML = `<div class="ct">${text}</div><div class="ring"></div>`
    d.style.left = x + 'px'; d.style.top = y + 'px'
    d.style.cssText += ';position:fixed;z-index:12;pointer-events:none;transform:translate(-50%,-50%)'
    document.body.appendChild(d)
    this._coachEl = d
  }
  hideCoach() { this._coachEl?.remove(); this._coachEl = null }

  showLeaderboard() {
    const s = this._layer(`<div class="screen"><div class="panel fade-in">
      <div class="kicker">TONIGHT'S LIGHTS</div>
      <h1 style="font-size:28px">今晚的排行榜</h1>
      <p class="lede">匿名昵称，按整晚温暖值排序。</p>
      <div class="board" data-body><div class="empty">正在读取今晚的灯…</div></div>
      <button class="btn ghost" data-act="back">返回</button>
    </div></div>`)
    s.querySelector('[data-act="back"]').onclick = () => { this.showTitle(this.onStart) }
    this.el.appendChild(s); this._cur = s
    fetch('/api/leaderboard?limit=20').then(r => r.json()).then(d => {
      const items = d?.items || []
      const body = s.querySelector('[data-body]')
      body.innerHTML = items.length ? items.map((it, i) => `<div class="row ${i < 3 ? 'top' : ''}"><div class="rk">${i + 1}</div><div class="nm">${esc(it.nickname)}</div><div style="text-align:right"><div class="sc">${it.total_warmth} 温暖</div><div class="meta">点亮 ${it.lit_windows} · 连击 ${it.max_combo}</div></div></div>`).join('') : '<div class="empty">今晚还没有人上榜</div>'
    }).catch(() => { s.querySelector('[data-body]').innerHTML = '<div class="empty">榜单暂时连接不上</div>' })
  }

  pause(onResume) {
    const s = this._layer(`<div class="screen" style="z-index:30"><div class="panel" style="text-align:center"><div class="kicker">PAUSED</div><h1 style="font-size:26px">灯先替你留着</h1><p class="lede">暂停时，天色和窗户都不会变化。</p><button class="btn primary" data-act="resume">继续点亮</button></div></div>`)
    s.querySelector('[data-act="resume"]').onclick = onResume
    this.el.appendChild(s); this._pauseEl = s
  }
  hidePause() { this._pauseEl?.remove(); this._pauseEl = null }
}
