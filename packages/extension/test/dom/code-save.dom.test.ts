import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scanAndRepairCodeBlocks } from '../../src/features/code-repair'
import { initCodeSave } from '../../src/features/code-save'
import { RECENT_FILES_KEY } from '../../src/features/palette-files'

describe('code-save.ts DOM drawer, path inference & disk write (linkedom)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        lastError: null,
        sendMessage: vi.fn((msg: { type: string }, cb?: (res: unknown) => void) => {
          if (msg.type === 'BROWSE_DIR') cb?.({ ok: true, data: { entries: [] } })
          else if (msg.type === 'WRITE_FILE') cb?.({ ok: true, data: { ok: true, bytes: 42 } })
        }),
      },
    }
  })

  it('mounts Save to file on hover and infers path from // header comment', async () => {
    document.body.innerHTML = `
      <div data-hveid="card-1">
        <div class="a2TNg">typescript</div>
        <pre><code class="language-ts">// src/billing/retry.ts
export const retry = () => true;</code></pre>
      </div>
    `
    const toasts: string[] = []
    initCodeSave((m) => toasts.push(m))

    const code = document.querySelector('code') as HTMLElement
    code.dispatchEvent(new Event('pointerover', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    const card = document.querySelector('[data-hveid="card-1"]') as HTMLElement
    expect(card.textContent).not.toContain('Save to file')
    const host = card.querySelector('span[data-vexel-ui="true"]') as HTMLElement
    const btn = host?.shadowRoot?.querySelector('button') as HTMLButtonElement
    expect(btn).toBeTruthy()
    btn.click()

    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('src/billing/retry.ts')

    input.value = 'src/billing/Makefile'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(toasts.some((t) => t.includes('.ts'))).toBe(true)

    input.value = 'src/billing/retry.ts'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(toasts.some((t) => t.includes('src/billing/retry.ts'))).toBe(true)
  })

  it('infers path from preceding File: label or falls back to recent folder + language ext', async () => {
    localStorage.setItem(
      RECENT_FILES_KEY,
      JSON.stringify([{ name: 'handlers', relPath: 'pkg/handlers', isDir: true }])
    )
    document.body.innerHTML = `
      <p>File: <code>cmd/worker/main.go</code></p>
      <div data-hveid="card-go">
        <div class="a2TNg">go</div>
        <pre><code class="language-go">package main</code></pre>
      </div>
      <p>Unrelated section</p><p>Another note</p><div data-hveid="card-py">
        <div class="a2TNg">python</div>
        <pre><code class="language-python">print("ok")</code></pre>
      </div>
    `
    initCodeSave(() => {})

    const codes = document.querySelectorAll('code')
    codes.item(1)?.dispatchEvent(new Event('pointerover', { bubbles: true }))
    codes.item(2)?.dispatchEvent(new Event('pointerover', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    const hosts = document.querySelectorAll<HTMLElement>('span[data-vexel-ui="true"]')
    expect(hosts.length).toBe(2)

    hosts.item(0)?.shadowRoot?.querySelector('button')?.click()
    const goInput = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(goInput.value).toBe('cmd/worker/main.go')
    goInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 220))

    hosts.item(1)?.shadowRoot?.querySelector('button')?.click()
    const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"]')
    const pyInput = allInputs.item(allInputs.length - 1)
    expect(pyInput?.value).toBe('pkg/handlers/script.py')
  })

  it('writes the full reassembled & formatted code when saving a repaired code block', async () => {
    const writtenPayloads: Array<{ relPath?: string; content?: string }> = []
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        lastError: null,
        sendMessage: vi.fn(
          (
            msg: { type: string; code?: string; relPath?: string; content?: string },
            cb?: (res: unknown) => void
          ) => {
            if (msg.type === 'FORMAT_CODE')
              cb?.({
                ok: true,
                formatted: (msg.code || '') + '\n// formatted-by-bridge',
                engine: 'oxfmt',
              })
            else if (msg.type === 'BROWSE_DIR') cb?.({ ok: true, data: { entries: [] } })
            else if (msg.type === 'WRITE_FILE') {
              writtenPayloads.push({ relPath: msg.relPath, content: msg.content })
              cb?.({ ok: true, data: { ok: true, bytes: (msg.content || '').length } })
            }
          }
        ),
      },
    }
    const head = [
      '// src/services/repaired.ts',
      'export function computeTotal() {',
      ...Array.from({ length: 130 }, (_, i) => '  const item' + i + ' = ' + i + ';'),
      '  if (true) {',
    ].join('\n')
    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div class="mZJni" data-container-id="main-col">',
      '    <div style="display: contents" data-container-id="40">',
      '      <div class="BpxUDf" data-hveid="card-repaired-save"><div><div class="a2TNg"><div>typescript</div></div><div><pre><code>' +
        head +
        '</code></pre></div><div data-testid="footer-save"><div>Caution</div><div><button aria-label="Copier">Copy</button></div></div></div></div>',
      '      <div class="n6owBd">    return 42;<br>  }<br>}</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')
    initCodeSave(() => {})
    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))
    const code = document.querySelector('code') as HTMLElement
    code.dispatchEvent(new Event('pointerover', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    const saveHost = Array.from(
      document.querySelectorAll<HTMLElement>('span[data-vexel-ui="true"]')
    ).find((el) => !el.hasAttribute('data-vexel-format-badge'))
    expect(saveHost).toBeTruthy()
    saveHost?.shadowRoot?.querySelector('button')?.click()
    const input = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(input.value).toBe('src/services/repaired.ts')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    expect(writtenPayloads.length).toBe(1)
    expect(writtenPayloads[0]?.relPath).toBe('src/services/repaired.ts')
    expect(writtenPayloads[0]?.content).toContain('return 42;')
    expect(writtenPayloads[0]?.content).toContain('// formatted-by-bridge')
  })
})
