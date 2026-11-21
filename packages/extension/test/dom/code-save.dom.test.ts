import { beforeEach, describe, expect, it, vi } from 'vitest'
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

    const btn = document.querySelector('button[data-vexel-ui="true"]') as HTMLButtonElement
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

    const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-vexel-ui="true"]')
    expect(buttons.length).toBe(2)

    buttons.item(0)?.click()
    const goInput = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(goInput.value).toBe('cmd/worker/main.go')
    goInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((r) => setTimeout(r, 220))

    buttons.item(1)?.click()
    const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"]')
    const pyInput = allInputs.item(allInputs.length - 1)
    expect(pyInput?.value).toBe('pkg/handlers/script.py')
  })
})
