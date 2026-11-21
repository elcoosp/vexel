import { t } from '@lingui/core/macro'
import '../i18n'

export const MAX_SAFE_LENGTH = 8000

export function resolvePromptInput(target: HTMLElement | null): HTMLElement | null {
  if (!target) return null
  if (target.closest('[data-vexel-ui]') || target.id?.startsWith('vexel-')) return null
  if (target.matches('textarea, [contenteditable="true"], input[type="text"]')) {
    return target
  }
  return target.closest<HTMLElement>('textarea, [contenteditable="true"]')
}

export function getProjectedInputLength(inputEl: HTMLElement, incomingText: string): number {
  if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
    const currentLen = inputEl.value.length
    const start = inputEl.selectionStart ?? currentLen
    const end = inputEl.selectionEnd ?? currentLen
    const selectedLen = Math.max(0, end - start)
    return Math.max(0, currentLen - selectedLen) + incomingText.length
  }

  const currentText = inputEl.innerText || inputEl.textContent || ''
  const currentLen = currentText.length
  let selectedLen = 0
  const selection = window.getSelection()
  if (
    selection &&
    selection.rangeCount > 0 &&
    selection.anchorNode &&
    inputEl.contains(selection.anchorNode)
  ) {
    selectedLen = selection.toString().length
  }
  return Math.max(0, currentLen - selectedLen) + incomingText.length
}

export function uploadAsTextFile(
  content: string,
  inputTarget: HTMLElement,
  showToast: (msg: string) => void,
  customFileName?: string
): void {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const fileName = customFileName || 'prompt-' + timestamp + '.txt'
  const file = new File([content], fileName, { type: 'text/plain' })

  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)

  const formattedLen = content.length.toLocaleString()
  const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
  const targetInput = fileInputs.find((input) => !input.disabled) ?? fileInputs.find(() => true)

  if (targetInput) {
    targetInput.files = dataTransfer.files
    targetInput.dispatchEvent(new Event('input', { bubbles: true }))
    targetInput.dispatchEvent(new Event('change', { bubbles: true }))
    showToast(t`Attached file: ${fileName} (${formattedLen} chars)`)
    return
  }

  for (const eventName of ['dragenter', 'dragover', 'drop'] as const) {
    inputTarget.dispatchEvent(
      new DragEvent(eventName, {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      })
    )
  }
  showToast(t`Attached file: ${fileName} (${formattedLen} chars)`)
}
