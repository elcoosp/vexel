import { describe, it, expect, beforeEach } from 'vitest'
import { copyCleanThread } from '../../src/features/thread-tools'

describe('thread-tools Clean Markdown serialization (linkedom)', () => {
  let copiedText = ''

  beforeEach(() => {
    copiedText = ''
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          copiedText = text
        },
      },
      configurable: true,
    })

    document.body.innerHTML = `
      <main>
        <div class="CKgc1d" data-scope-id="turn"><div jsname="eFVkfb">How do I debounce a function in TypeScript?</div>
        <div data-subtree="aimc">
          <h3>Typed Debounce Helper</h3>
          <p>Use <strong>clearTimeout</strong> inside a closure:</p>
          <pre><code class="language-ts">export function debounce(fn: () => void, ms: number) {
  let timer: ReturnType&lt;typeof setTimeout&gt;;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}</code></pre>
        </div></div>
      </main>
    `
  })

  it('copies formatted conversation turns to clipboard and triggers toast', async () => {
    const toasts: string[] = []
    const ok = await copyCleanThread((msg) => toasts.push(msg))
    expect(ok).toBe(true)
    expect(copiedText).toContain('## User')
    expect(copiedText).toContain('How do I debounce a function in TypeScript?')
    expect(copiedText).toContain('## Assistant')
    expect(copiedText).toContain('### Typed Debounce Helper')
    expect(copiedText).toContain('```ts')
    expect(copiedText).toContain('export function debounce')
    expect(toasts.some((t) => t.includes('Clean thread copied'))).toBe(true)
  })
})
