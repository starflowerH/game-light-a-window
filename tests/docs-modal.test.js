import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DOCS_TABS, extractH2Sections, renderMarkdownToHtml } from '../src/docs-modal.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

describe('docs-modal markdown renderer', () => {
  it('escapes raw HTML tags safely and preserves nested bold+code', () => {
    const md = [
      '# 顶部标题（应略过）',
      '',
      '## 1. 安全测试 <script>alert(1)</script>',
      '这里有 **开启 `WAL` 缓存** 和 <img src=x onerror=alert(2)> 注入尝试。',
      '',
      '访问 [在线体验](https://game.xiaoxin.email/) 或 [非法脚本](javascript:alert(3))。'
    ].join('\n')

    const { html, sections } = renderMarkdownToHtml(md)
    expect(sections).toEqual([{ id: 'doc-sec-1', title: '1. 安全测试 <script>alert(1)</script>', level: 2 }])
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('javascript:alert')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('<strong>开启 <code class="docs-inline-code">WAL</code> 缓存</strong>')
    expect(html).toContain('href="https://game.xiaoxin.email/"')
    expect(html).not.toContain('顶部标题')
  })

  it('renders tables with <br/>, callouts, lists, and replaces mermaid with lazy diagram', () => {
    const md = [
      '## 目录',
      '- [忽略的目录项](#x)',
      '',
      '## 3. 系统总体架构',
      '### 3.1 总体架构图',
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '| 模式 | 门槛<br/>(`stage`) | 说明 |',
      '| --- | --- | --- |',
      '| 剧情夜巡 | `D` / `SSS` | 3 晚<br/>6 结局 |',
      '',
      '> **评委提示：** 本系统无需外部 key 也可游玩。',
      '',
      '1. 第一步 **点亮**',
      '  - 子说明项',
      '2. 第二步 `drag`'
    ].join('\n')

    const { html, sections } = renderMarkdownToHtml(md)
    expect(sections.map(s => s.title)).toEqual(['3. 系统总体架构', '3.1 总体架构图'])
    expect(html).not.toContain('忽略的目录项')
    expect(html).not.toContain('flowchart LR')
    expect(html).toContain('./docs/architecture_diagram.png')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('<div class="docs-table-wrap"><table class="docs-table">')
    expect(html).toContain('门槛<br>(<code class="docs-inline-code">stage</code>)')
    expect(html).toContain('3 晚<br>6 结局')
    expect(html).toContain('<blockquote class="docs-callout">')
    expect(html).toContain('<ol class="docs-list">')
    expect(html).toContain('<ul class="docs-sublist">')
  })

  it('parses the full production competition spec & player manual cleanly', () => {
    const specMd = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'COMPETITION_PROJECT_SPEC.md'), 'utf8')
    const manualMd = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'GAME_MANUAL.md'), 'utf8')

    expect(DOCS_TABS.map(t => t.id)).toEqual(['overview', 'spec', 'manual'])

    const specOut = renderMarkdownToHtml(specMd, { idPrefix: 'sp-', replaceMermaidWithDiagram: true })
    expect(specOut.sections.some(s => s.title.includes('30 秒评审速览'))).toBe(true)
    expect(specOut.sections.some(s => s.title.startsWith('F1'))).toBe(true)
    expect(specOut.sections.some(s => s.title.startsWith('F12'))).toBe(true)
    expect(specOut.html).toContain('./docs/architecture_diagram.png')
    expect(specOut.html).not.toContain('<script')

    const manualOut = renderMarkdownToHtml(manualMd, { idPrefix: 'mn-', replaceMermaidWithDiagram: false })
    expect(manualOut.sections.some(s => s.title.includes('五大核心玩法'))).toBe(true)
    expect(manualOut.sections.some(s => s.title.includes('7 级夜巡段位徽章'))).toBe(true)
    expect(manualOut.html).toContain('<table class="docs-table">')
    expect(manualOut.html).not.toContain('<script')

    const overviewExcerpt = extractH2Sections(specMd, ['1. 30 秒评审速览', '5. 四大比赛奖项对照与差异化举证', '7. 评审 3 分钟实机演示推荐路线'])
    expect(overviewExcerpt).toContain('## 1. 30 秒评审速览')
    expect(overviewExcerpt).toContain('## 5. 四大比赛奖项对照与差异化举证')
    expect(overviewExcerpt).toContain('## 7. 评审 3 分钟实机演示推荐路线')
    expect(overviewExcerpt).not.toContain('## 4. 全功能设计详述')
  })
})
