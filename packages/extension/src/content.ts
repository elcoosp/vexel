import { t } from '@lingui/core/macro'
import './i18n'
import { initOnboarding } from './features/onboarding'
import { initCodeSave } from './features/code-save'
import { initDomBooster } from './features/dom-booster'
import { MAX_SAFE_LENGTH, uploadAsTextFile } from './features/file-upload'
import { initCommandPalette } from './features/palette'
import { initThreadTools } from './features/thread-tools'

function showToast(message: string): void {
  const target = document.body || document.documentElement
  if (!target) return
  const toast = document.createElement('div')
  toast.textContent = t`Vexel: ${message}`
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: '#ffffff',
    color: '#1f1f1f',
    border: '1px solid #dadce0',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 4px 12px rgba(60,64,67,0.18)',
    zIndex: '2147483647',
    transition: 'opacity 0.3s ease',
  })
  target.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

function initAutoFilePaste(): void {
  document.addEventListener(
    'paste',
    (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-vexel-ui]') || target.id?.startsWith('vexel-')) return
      const isPromptInput =
        target.matches('textarea, [contenteditable="true"], input[type="text"]') ||
        Boolean(target.closest('textarea, [contenteditable="true"]'))
      if (!isPromptInput) return

      const pasted = e.clipboardData?.getData('text/plain') || ''
      if (pasted.length > MAX_SAFE_LENGTH) {
        e.preventDefault()
        e.stopPropagation()
        uploadAsTextFile(pasted, target, showToast)
      }
    },
    true
  )
}

if (window === window.top) {
  initDomBooster()

  const bootUi = () => {
    initAutoFilePaste()
    initCommandPalette(showToast)
    initThreadTools(showToast)
    initCodeSave(showToast)
    initOnboarding(showToast)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootUi, { once: true })
  } else {
    bootUi()
  }
}
