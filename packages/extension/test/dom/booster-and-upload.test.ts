import { describe, it, expect, beforeEach } from 'vitest'
import { initDomBooster, scrollToLastUserPrompt } from '../../src/features/dom-booster'
import { uploadAsTextFile } from '../../src/features/file-upload'

describe('dom-booster & native file-upload attachment (linkedom)', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = `
      <div data-scope-id="turn"><div jsname="eFVkfb">First question</div></div>
      <div data-scope-id="turn" data-last-turn="true"><div jsname="eFVkfb" id="last-q">Second question</div></div>
      <textarea id="prompt"></textarea>
    `
  })

  it('injects content-visibility virtualization CSS idempotently and scrolls to last user prompt', () => {
    initDomBooster()
    initDomBooster()
    const styles = document.querySelectorAll('#vexel-fast-load-css')
    expect(styles.length).toBe(1)
    expect(styles.item(0)?.textContent).toContain('content-visibility: auto')
    expect(styles.item(0)?.textContent).toContain('contain-intrinsic-size: auto 480px')

    const lastQ = document.getElementById('last-q') as HTMLElement
    let scrolled = false
    lastQ.scrollIntoView = () => {
      scrolled = true
    }
    expect(scrollToLastUserPrompt(true)).toBe(true)
    expect(scrolled).toBe(true)
  })

  it('attaches large context via input[type="file"] or DragEvent drop fallback', () => {
    class MockDataTransfer {
      items = {
        files: [] as File[],
        add(file: File) {
          this.files.push(file)
        },
      }
      get files() {
        return this.items.files as unknown as FileList
      }
    }

    class MockDragEvent extends Event {
      dataTransfer: unknown
      constructor(
        type: string,
        init?: { dataTransfer?: unknown; bubbles?: boolean; cancelable?: boolean }
      ) {
        super(type, init)
        this.dataTransfer = init?.dataTransfer
      }
    }

    ;(globalThis as Record<string, unknown>).DataTransfer = MockDataTransfer
    ;(globalThis as Record<string, unknown>).DragEvent = MockDragEvent

    const textarea = document.getElementById('prompt') as HTMLTextAreaElement
    const toasts: string[] = []

    // 1. Test DragEvent fallback when no <input type="file"> exists
    let droppedFiles = 0
    textarea.addEventListener('drop', (ev: Event) => {
      const de = ev as unknown as { dataTransfer?: { files?: File[] } }
      droppedFiles = de.dataTransfer?.files?.length || 0
    })
    uploadAsTextFile('# Packed Repo\n', textarea, (m) => toasts.push(m), 'repo-pack.md')
    expect(droppedFiles).toBe(1)
    expect(toasts.at(-1)).toContain('repo-pack.md')

    // 2. Test direct <input type="file"> attachment when file input exists
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    document.body.appendChild(fileInput)
    let changeTriggered = false
    fileInput.addEventListener('change', () => {
      changeTriggered = true
    })
    uploadAsTextFile('export const x = 1;\n', textarea, (m) => toasts.push(m), 'context.ts')
    expect(changeTriggered).toBe(true)
    expect(toasts.at(-1)).toContain('context.ts')
  })
})
