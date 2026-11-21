import { beforeEach, describe, expect, it } from 'vitest'
import { initDomBooster, scrollToLastUserPrompt } from '../../src/features/dom-booster'
import {
  getProjectedInputLength,
  resolvePromptInput,
  uploadAsTextFile,
} from '../../src/features/file-upload'

describe('dom-booster & native file-upload edge cases (linkedom)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = `
      <div data-scope-id="turn"><div jsname="eFVkfb">First</div></div>
      <div data-scope-id="turn" data-last-turn="true"><div jsname="eFVkfb" id="last-q">Second</div></div>
      <textarea id="prompt">hello world</textarea>
      <div data-vexel-ui="true"><textarea id="vexel-inner"></textarea></div>
    `
  })

  it('ignores Vexel UI inputs and computes projected length across selections', () => {
    const prompt = document.getElementById('prompt') as HTMLTextAreaElement
    const inner = document.getElementById('vexel-inner') as HTMLTextAreaElement
    expect(resolvePromptInput(inner)).toBeNull()
    expect(resolvePromptInput(prompt)).toBe(prompt)
    prompt.selectionStart = 0
    prompt.selectionEnd = 5
    expect(getProjectedInputLength(prompt, 'x'.repeat(8000))).toBe(8006)
  })

  it('injects virtualization CSS idempotently and attaches files via DragEvent or input[type="file"]', () => {
    initDomBooster()
    initDomBooster()
    expect(document.querySelectorAll('#vexel-fast-load-css').length).toBe(1)
    const lastQ = document.getElementById('last-q') as HTMLElement
    let scrolled = false
    lastQ.scrollIntoView = () => {
      scrolled = true
    }
    expect(scrollToLastUserPrompt(true)).toBe(true)
    expect(scrolled).toBe(true)

    class MockDT {
      items = {
        files: [] as File[],
        add(f: File) {
          this.files.push(f)
        },
      }
      get files() {
        return this.items.files as unknown as FileList
      }
    }
    class MockDE extends Event {
      dataTransfer: unknown
      constructor(t: string, i?: { dataTransfer?: unknown }) {
        super(t, i)
        this.dataTransfer = i?.dataTransfer
      }
    }
    ;(globalThis as Record<string, unknown>).DataTransfer = MockDT
    ;(globalThis as Record<string, unknown>).DragEvent = MockDE

    const prompt = document.getElementById('prompt') as HTMLTextAreaElement
    const toasts: string[] = []
    let dropped = 0
    prompt.addEventListener('drop', (e: Event) => {
      dropped =
        (e as unknown as { dataTransfer?: { files?: File[] } }).dataTransfer?.files?.length || 0
    })
    uploadAsTextFile('# Pack\n', prompt, (m) => toasts.push(m), 'pack.md')
    expect(dropped).toBe(1)
    expect(toasts.at(-1)).toContain('pack.md')
  })
})
