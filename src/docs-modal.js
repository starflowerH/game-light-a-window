// Lazy-loaded in-game competition whitepaper & player manual modal.
// Dynamically imported only when a judge or player opens "作品说明 · 手册"
// so initial landing JS payload remains zero-bloat.

import manualMd from '../docs/GAME_MANUAL.md?raw'
import specMd from '../docs/COMPETITION_PROJECT_SPEC.md?raw'

/** @type {ReadonlyArray<{ id: 'overview' | 'spec' | 'manual', label: string, hint: string }>} */
export const DOCS_TABS = [
  { id: 'overview', label: '评委速览', hint: '核心指标 · 系统架构 · 演示路线' },
  { id: 'spec', label: '项目白皮书', hint: 'F1–F12 功能模块与技术设计' },
  { id: 'manual', label: '游戏手册', hint: '五大玩法、六大结局与段位全表' }
]

/**
 * Escape raw HTML metacharacters before inline formatting to guarantee zero XSS.
 * @param {string} s
 */
export function escHtml(s) {
  return String(s === null || s === undefined ? '' : s).replace(
    /[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch)
  )
}

/**
 * Extract selected top-level `## ` chapters from a markdown document verbatim.
 * @param {string} md
 * @param {string[]} prefixes
 */
export function extractH2Sections(md, prefixes) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  /** @type {string[]} */
  const out = []
  let capturing = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim()
      capturing = prefixes.some(p => heading.startsWith(p))
    }
    if (capturing) out.push(line)
  }
  return out.join('\n')
}

function renderInline(raw) {
  let s = escHtml(raw)
  /** @type {string[]} */
  const codeTokens = []

  // Extract inline code first so **bold** can wrap `code` without regex collisions.
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeTokens.length
    codeTokens.push('<code class="docs-inline-code">' + code + '</code>')
    return '\u0000C' + idx + '\u0000'
  })

  // Safe links: only allow http/https URLs; strip relative file links to plain text.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const cleanHref = href.trim()
    if (/^https?:\/\//i.test(cleanHref)) {
      return '<a class="docs-link" href="' + cleanHref + '" target="_blank" rel="noopener noreferrer">' + label + ' ↗</a>'
    }
    return label
  })

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // eslint-disable-next-line no-control-regex
  s = s.replace(/\u0000C(\d+)\u0000/g, (_m, idx) => codeTokens[Number(idx)] || '')
  return s
}

function renderCellInline(rawCell) {
  const parts = String(rawCell || '')
    .split(/<br\s*\/?>/i)
    .map(seg => renderInline(seg.trim()))
  return parts.join('<br>')
}

function splitPipeRow(raw) {
  let inner = raw.trim()
  if (inner.startsWith('|')) inner = inner.slice(1)
  if (inner.endsWith('|')) inner = inner.slice(0, -1)
  return inner.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim())
}

function plainHeadingText(raw) {
  return String(raw || '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*/g, '')
    .trim()
}

function buildDiagramFigureHtml() {
  return '<figure class="docs-diagram">' +
    '<a href="./docs/architecture_diagram.png" target="_blank" rel="noopener noreferrer" title="在新标签页打开高清原图">' +
      '<img src="./docs/architecture_diagram.png" loading="lazy" alt="《今晚，亮一盏灯 v5.1》五层全栈技术架构与双引擎渲染 / AI 管线" />' +
    '</a>' +
    '<figcaption>图 · 五层全栈技术架构与双引擎渲染 / 7-Agent AI 协同管线（点击图片可放大查看高清原图）</figcaption>' +
  '</figure>'
}

/**
 * Convert a structured project markdown file into sanitized HTML + section anchors.
 * @param {string} md
 * @param {{ replaceMermaidWithDiagram?: boolean, stripBeforeFirstH2?: boolean, skipTocSection?: boolean, idPrefix?: string }} [opts]
 * @returns {{ html: string, sections: Array<{ id: string, title: string, level: number }> }}
 */
export function renderMarkdownToHtml(md, opts = {}) {
  const replaceMermaid = opts.replaceMermaidWithDiagram !== false
  const stripIntro = opts.stripBeforeFirstH2 !== false
  const skipToc = opts.skipTocSection !== false
  const idPrefix = opts.idPrefix || 'doc-sec-'

  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  /** @type {string[]} */
  const html = []
  /** @type {Array<{ id: string, title: string, level: number }>} */
  const sections = []

  let i = 0
  if (stripIntro) {
    while (i < lines.length && !lines[i].startsWith('## ')) i++
  }

  let skippingToc = false
  let secCounter = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    // Fenced code blocks & mermaid replacement
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim().toLowerCase()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      if (skippingToc) continue
      if (replaceMermaid && lang === 'mermaid') {
        html.push(buildDiagramFigureHtml())
      } else {
        html.push('<pre class="docs-code"><code>' + escHtml(codeLines.join('\n')) + '</code></pre>')
      }
      continue
    }

    // Headings (## -> h2, ### -> h3, #### -> h4)
    const hMatch = trimmed.match(/^(#{2,4})\s+(.+)$/)
    if (hMatch) {
      const level = hMatch[1].length
      const rawTitle = hMatch[2].trim()
      const cleanTitle = plainHeadingText(rawTitle)

      if (level === 2 && skipToc && cleanTitle.includes('目录') && cleanTitle.length <= 16) {
        skippingToc = true
        i++
        continue
      }
      skippingToc = false
      secCounter++
      const id = idPrefix + secCounter
      const includeAnchor = level === 2 || (level === 3 && /^(F\d+|玩法|[0-9]+\.[0-9]+|Q\d+)/.test(cleanTitle))
      if (includeAnchor) {
        sections.push({ id, title: cleanTitle, level })
      }
      html.push('<h' + level + ' id="' + escHtml(id) + '" class="docs-h' + level + '">' + renderInline(rawTitle) + '</h' + level + '>')
      i++
      continue
    }

    if (skippingToc) {
      i++
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push('<hr class="docs-hr" />')
      i++
      continue
    }

    // Markdown pipe table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      const headers = splitPipeRow(lines[i])
      i += 2
      const bodyRows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = splitPipeRow(lines[i])
        while (row.length < headers.length) row.push('')
        bodyRows.push(row.slice(0, headers.length))
        i++
      }
      html.push(
        '<div class="docs-table-wrap"><table class="docs-table">' +
          '<thead><tr>' + headers.map(h => '<th>' + renderCellInline(h) + '</th>').join('') + '</tr></thead>' +
          '<tbody>' + bodyRows.map(r => '<tr>' + r.map(c => '<td>' + renderCellInline(c) + '</td>').join('') + '</tr>').join('') + '</tbody>' +
        '</table></div>'
      )
      continue
    }

    // Blockquote callout
    if (trimmed.startsWith('>')) {
      const qLines = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        const content = lines[i].trim().slice(1).trim()
        if (content) qLines.push(renderInline(content))
        i++
      }
      if (qLines.length) {
        html.push('<blockquote class="docs-callout">' + qLines.join('<br>') + '</blockquote>')
      }
      continue
    }

    // Lists (unordered & ordered with indented sub-bullets)
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const isOrdered = /^\s*\d+\./.test(line)
      const tag = isOrdered ? 'ol' : 'ul'
      const firstNumMatch = line.match(/^\s*(\d+)\./)
      const startAttr = isOrdered && firstNumMatch && Number(firstNumMatch[1]) > 1 ? ' start="' + Number(firstNumMatch[1]) + '"' : ''
      /** @type {string[]} */
      const items = []
      /** @type {string[]} */
      let subBullets = []

      const flushSubs = () => {
        if (subBullets.length && items.length) {
          items[items.length - 1] += '<ul class="docs-sublist">' + subBullets.map(sb => '<li>' + renderInline(sb) + '</li>').join('') + '</ul>'
          subBullets = []
        }
      }

      while (i < lines.length) {
        const cur = lines[i]
        const indentMatch = cur.match(/^(\s*)(?:[-*]|\d+\.)\s+(.+)$/)
        if (!indentMatch) break
        const indent = indentMatch[1].length
        const itemText = indentMatch[2].trim()
        if (indent >= 2 && items.length > 0) {
          subBullets.push(itemText)
        } else {
          flushSubs()
          items.push(renderInline(itemText))
        }
        i++
      }
      flushSubs()
      html.push('<' + tag + ' class="docs-list"' + startAttr + '>' + items.map(it => '<li>' + it + '</li>').join('') + '</' + tag + '>')
      continue
    }

    // Paragraph (coalesce consecutive non-block lines)
    const pLines = [trimmed]
    i++
    while (i < lines.length) {
      const nxt = lines[i]
      const nt = nxt.trim()
      if (
        !nt ||
        nt.startsWith('#') ||
        nt.startsWith('>') ||
        nt.startsWith('```') ||
        nt.startsWith('|') ||
        /^(-{3,}|\*{3,})$/.test(nt) ||
        /^\s*(?:[-*]|\d+\.)\s+/.test(nxt)
      ) {
        break
      }
      pLines.push(nt)
      i++
    }
    html.push('<p class="docs-p">' + renderInline(pLines.join(' ')) + '</p>')
  }

  return { html: html.join('\n'), sections }
}

function buildOverviewTab() {
  const excerptMd = extractH2Sections(specMd, [
    '1. 30 秒评审速览',
    '5. 四大比赛奖项对照与差异化举证',
    '7. 评审 3 分钟实机演示推荐路线'
  ])
  const parsed = renderMarkdownToHtml(excerptMd, {
    stripBeforeFirstH2: false,
    skipTocSection: true,
    replaceMermaidWithDiagram: true,
    idPrefix: 'ov-sec-'
  })

  const kpiHtml =
    '<div class="docs-kpi-grid">' +
      '<div class="docs-kpi"><span class="dk-num">6.84 MB</span><span class="dk-lab">全量包体 · 主题配乐按需加载</span></div>' +
      '<div class="docs-kpi"><span class="dk-num">85+ FPS</span><span class="dk-lab">满画质实测 · 4 档自适应</span></div>' +
      '<div class="docs-kpi"><span class="dk-num">5 × 4</span><span class="dk-lab">5 大模式 × 4 栋 Blender 宿舍</span></div>' +
      '<div class="docs-kpi"><span class="dk-num">7-Agent</span><span class="dk-lab">双模 AI 导演 · Key 零落库</span></div>' +
      '<div class="docs-kpi"><span class="dk-num">521 项</span><span class="dk-lab">304 单元 + 217 端到端全绿</span></div>' +
    '</div>'

  const ctaBarHtml =
    '<div class="docs-quick-jump">' +
      '<div class="dqj-copy">' +
        '<b>提交即所见 · 评审导读卡片</b>' +
        '<span>下方已精选最关键的 30 秒评审卡、奖项举证与 3 分钟实机路线；如需查阅全部 F1–F12 代码级设计细节或玩法数值表，可一键切换上方标签页。</span>' +
      '</div>' +
      '<div class="dqj-btns">' +
        '<button type="button" class="chip-btn" data-switchtab="spec">阅读 F1–F12 完整白皮书 ▸</button>' +
        '<button type="button" class="chip-btn" data-switchtab="manual">阅读玩家操作手册 ▸</button>' +
      '</div>' +
    '</div>'

  const archHtml = buildDiagramFigureHtml()

  return {
    html: kpiHtml + ctaBarHtml + archHtml + parsed.html,
    sections: parsed.sections
  }
}

/**
 * Mount the tabbed in-app project specification & manual modal into an overlay `.screen`.
 * @param {{
 *   container: HTMLElement,
 *   initialTab?: 'overview' | 'spec' | 'manual',
 *   onClose?: () => void,
 *   onEnterGame?: () => void
 * }} opts
 */
export function mountDocsModal({ container, initialTab = 'overview', onClose, onEnterGame }) {
  /** @type {'overview' | 'spec' | 'manual'} */
  let activeTab = DOCS_TABS.some(t => t.id === initialTab) ? initialTab : 'overview'

  /** @type {Record<string, { html: string, sections: Array<{ id: string, title: string, level: number }> }>} */
  const cache = {}

  const getTabContent = (tabId) => {
    if (cache[tabId]) return cache[tabId]
    if (tabId === 'spec') {
      cache[tabId] = renderMarkdownToHtml(specMd, { idPrefix: 'sp-sec-', replaceMermaidWithDiagram: true })
    } else if (tabId === 'manual') {
      cache[tabId] = renderMarkdownToHtml(manualMd, { idPrefix: 'mn-sec-', replaceMermaidWithDiagram: false })
    } else {
      cache[tabId] = buildOverviewTab()
    }
    return cache[tabId]
  }

  container.innerHTML =
    '<div class="panel glass docs-panel" role="dialog" aria-modal="true" aria-label="作品说明 · 评审白皮书与玩家手册">' +
      '<div class="docs-head">' +
        '<div class="docs-head-top">' +
          '<div>' +
            '<div class="kicker">LIGHT A WINDOW · V5.1 PROJECT ARCHIVE</div>' +
            '<h2 class="h2" style="margin:4px 0 2px;">作品说明 · 评审白皮书与玩家手册</h2>' +
          '</div>' +
          '<button type="button" class="docs-close-btn" data-act="close" aria-label="关闭文档弹窗">✕</button>' +
        '</div>' +
        '<div class="docs-tabs" role="tablist">' +
          DOCS_TABS.map(t =>
            '<button type="button" role="tab" class="docs-tab ' + (t.id === activeTab ? 'on' : '') + '" data-tab="' + t.id + '">' + escHtml(t.label) + '</button>'
          ).join('') +
        '</div>' +
        '<div class="docs-toc" data-toc></div>' +
      '</div>' +
      '<div class="docs-body" data-docsbody></div>' +
      '<div class="docs-foot">' +
        '<span class="docs-foot-note">线上体验：<a class="docs-link" href="https://game.xiaoxin.email/" target="_blank" rel="noopener noreferrer">https://game.xiaoxin.email/</a> · 开源仓库含完整 Word 版白皮书与演示视频</span>' +
        '<div class="docs-foot-actions">' +
          (onEnterGame ? '<button type="button" class="btn primary docs-cta-btn" data-act="enter-game">进入校园体验 ▸</button>' : '') +
          '<button type="button" class="btn ghost" data-act="close-foot">返回</button>' +
        '</div>' +
      '</div>' +
    '</div>'

  const bodyEl = /** @type {HTMLElement} */ (container.querySelector('[data-docsbody]'))
  const tocEl = /** @type {HTMLElement} */ (container.querySelector('[data-toc]'))

  const renderActiveTab = (tabId) => {
    activeTab = tabId
    for (const btn of container.querySelectorAll('.docs-tab')) {
      btn.classList.toggle('on', btn.getAttribute('data-tab') === activeTab)
    }

    const { html, sections } = getTabContent(activeTab)
    bodyEl.innerHTML = html
    bodyEl.scrollTop = 0

    if (sections.length) {
      tocEl.style.display = ''
      tocEl.innerHTML = sections
        .map(s => '<button type="button" class="docs-toc-chip' + (s.level === 3 ? ' sub' : '') + '" data-jump="' + escHtml(s.id) + '">' + escHtml(s.title) + '</button>')
        .join('')
      for (const chip of tocEl.querySelectorAll('[data-jump]')) {
        chip.addEventListener('click', () => {
          const targetId = chip.getAttribute('data-jump') || ''
          const target = bodyEl.querySelector('[id="' + targetId.replace(/"/g, '\\"') + '"]')
          if (target instanceof HTMLElement) {
            bodyEl.scrollTo({ top: Math.max(0, target.offsetTop - 14), behavior: 'smooth' })
          }
          for (const c of tocEl.querySelectorAll('.docs-toc-chip')) c.classList.toggle('on', c === chip)
        })
      }
    } else {
      tocEl.style.display = 'none'
      tocEl.innerHTML = ''
    }

    for (const sw of bodyEl.querySelectorAll('[data-switchtab]')) {
      sw.addEventListener('click', () => {
        const nxt = /** @type {'overview' | 'spec' | 'manual'} */ (sw.getAttribute('data-switchtab') || 'overview')
        renderActiveTab(nxt)
      })
    }
  }

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    window.removeEventListener('keydown', onKeyDown)
    if (onClose) onClose()
  }

  /** @param {any} e */
  const onKeyDown = (e) => {
    if (e && e.key === 'Escape') {
      e.preventDefault?.()
      close()
    }
  }
  window.addEventListener('keydown', onKeyDown)

  for (const tabBtn of container.querySelectorAll('.docs-tab')) {
    tabBtn.addEventListener('click', () => {
      const id = /** @type {'overview' | 'spec' | 'manual'} */ (tabBtn.getAttribute('data-tab') || 'overview')
      renderActiveTab(id)
    })
  }

  container.addEventListener('click', e => {
    if (e.target === container) close()
  })
  container.querySelector('[data-act="close"]')?.addEventListener('click', close)
  container.querySelector('[data-act="close-foot"]')?.addEventListener('click', close)

  const enterBtn = container.querySelector('[data-act="enter-game"]')
  if (enterBtn && onEnterGame) {
    enterBtn.addEventListener('click', () => {
      if (closed) return
      closed = true
      window.removeEventListener('keydown', onKeyDown)
      onEnterGame()
    })
  }

  renderActiveTab(activeTab)
}
