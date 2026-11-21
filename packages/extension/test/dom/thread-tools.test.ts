import { beforeEach, describe, expect, it } from 'vitest'
import {
  copyCleanThread,
  exportConversationMarkdown,
  initThreadTools,
} from '../../src/features/thread-tools'

describe('thread-tools Clean Markdown & floating TOC rail (linkedom)', () => {
  let copiedText = ''

  beforeEach(() => {
    copiedText = ''
    document.body.innerHTML = ''
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          copiedText = text
        },
      },
      configurable: true,
    })
  })

  it('handles empty thread gracefully with toast notification', async () => {
    const toasts: string[] = []
    expect(await copyCleanThread((m) => toasts.push(m))).toBe(false)
    expect(toasts.at(-1)).toContain('No conversation turns')
  })

  it('serializes attachments, 4-backtick code fences, nested lists, and exports .md', async () => {
    const BT3 = String.fromCharCode(96, 96, 96)
    document.body.innerHTML = `
      <main>
        <div class="CKgc1d" data-scope-id="turn">
          <div data-sn-container="1"><div role="listitem"><span>ci-failure.log</span></div></div>
          <div jsname="eFVkfb">Fix this nested markdown block</div>
          <div data-subtree="aimc">
            <h3>Nested Fence &amp; Lists</h3>
            <ul><li>Outer<ul><li>Inner item</li></ul></li></ul>
            <div data-hveid="c1"><pre><code class="language-md">Example:\n${BT3}ts\nconst x = 1\n${BT3}</code></pre></div>
          </div>
        </div>
      </main>
    `
    const toasts: string[] = []
    expect(await copyCleanThread((m) => toasts.push(m))).toBe(true)
    expect(copiedText).toContain('> Attachments: `ci-failure.log`')
    expect(copiedText).toContain('### Nested Fence & Lists')
    expect(copiedText).toContain('- Outer')
    expect(copiedText).toContain('  - Inner item')
    expect(copiedText).toContain('````md')

    let downloaded = ''
    const origCreate = document.createElement.bind(document)
    document.createElement = ((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a')
        el.click = () => {
          downloaded = (el as HTMLAnchorElement).download
        }
      return el
    }) as typeof document.createElement
    globalThis.URL.createObjectURL = () => 'blob:md'
    globalThis.URL.revokeObjectURL = () => {}

    exportConversationMarkdown((m) => toasts.push(m))
    expect(downloaded).toMatch(/^google-ai-mode-.*\.md$/)

    initThreadTools()
    await new Promise((r) => setTimeout(r, 150))
    const tocHost = document.getElementById('vexel-toc-host')
    expect(tocHost?.shadowRoot?.querySelectorAll('.tick-wrap').length).toBe(1)
  })
})
