export const MAX_SAFE_LENGTH = 8000

export function initUntruncate(showToast: (msg: string) => void): void {
  document.addEventListener(
    'paste',
    (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const isTextArea = target.tagName === 'TEXTAREA'
      const isContentEditable = target.isContentEditable
      if (!isTextArea && !isContentEditable) return

      const pastedText = event.clipboardData?.getData('text/plain') || ''
      if (!pastedText) return

      const currentText = isTextArea
        ? (target as HTMLTextAreaElement).value
        : target.innerText || target.textContent || ''

      if (currentText.length + pastedText.length <= MAX_SAFE_LENGTH) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      uploadAsTextFile(pastedText, target, showToast)
    },
    true
  )
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

  const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
  const targetInput = fileInputs.find((input) => !input.disabled) ?? fileInputs.find(() => true)

  if (targetInput) {
    targetInput.files = dataTransfer.files
    targetInput.dispatchEvent(new Event('input', { bubbles: true }))
    targetInput.dispatchEvent(new Event('change', { bubbles: true }))
    showToast('Fichier joint : ' + fileName + ' (' + content.length.toLocaleString() + ' car.)')
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
  showToast('Fichier depose : ' + fileName + ' (' + content.length.toLocaleString() + ' car.)')
}
