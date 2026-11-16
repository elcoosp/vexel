export const MAX_SAFE_LENGTH = 8000

export function initUntruncate(showToast: (msg: string) => void): void {
  document.addEventListener(
    'paste',
    (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const isTextArea = target.tagName === 'TEXTAREA'
      const { isContentEditable } = target
      if (!isTextArea && !isContentEditable) return

      const pastedText = event.clipboardData?.getData('text/plain') || ''
      if (!pastedText) return

      const currentText = isTextArea
        ? (target as HTMLTextAreaElement).value
        : target.textContent || ''

      if (currentText.length + pastedText.length > MAX_SAFE_LENGTH) {
        event.preventDefault()
        event.stopImmediatePropagation()
        uploadAsTextFile(pastedText, target, showToast)
      }
    },
    true
  )
}

export function uploadAsTextFile(
  content: string,
  _targetInput: HTMLElement,
  showToast: (msg: string) => void,
  customFileName?: string
): void {
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(/[:T]/gu, '-')
  const fileName = customFileName || 'prompt-' + timestamp + '.txt'
  const file = new File([content], fileName, { type: 'text/plain' })

  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)

  const fileInputs = [...document.querySelectorAll('input[type="file"]')] as HTMLInputElement[]
  const targetInput = fileInputs.find((input) => !input.disabled) ?? fileInputs.find(() => true)

  if (targetInput) {
    targetInput.files = dataTransfer.files
    targetInput.dispatchEvent(new Event('change', { bubbles: true }))
    showToast('Attache en fichier (' + Math.round(content.length / 1000) + 'k car.)')
    return
  }

  const dropZone = document.querySelector('form') || document.querySelector('main') || document.body
  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer,
  })
  dropZone.dispatchEvent(dropEvent)
  showToast('Injecte via depot (' + Math.round(content.length / 1000) + 'k car.)')
}
