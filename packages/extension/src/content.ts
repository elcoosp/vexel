import { t } from '@lingui/core/macro'
import { initLocaleSync } from './i18n'
import { animate } from 'motion'
import { initOnboarding } from './features/onboarding'
import { initCodeSave } from './features/code-save'
import { initCodeRepair } from './features/code-repair'
import { initDomBooster } from './features/dom-booster'
import {
  MAX_SAFE_LENGTH,
  getProjectedInputLength,
  resolvePromptInput,
  uploadAsTextFile,
} from './features/file-upload'
import { createLucideIcon } from './features/icons'
import { initCommandPalette } from './features/palette'
import { initThreadTools } from './features/thread-tools'
import { UI_COLORS, UI_FONT_SANS, UI_RADII, UI_SHADOWS } from './features/ui-tokens'

let activeToastEl: HTMLDivElement | null = null
let activeToastTimer: number | undefined

function showToast(message: string): void {
  const target = document.body || document.documentElement
  if (!target) return
  if (activeToastTimer) {
    globalThis.clearTimeout(activeToastTimer)
    activeToastTimer = undefined
  }
  if (activeToastEl) {
    activeToastEl.remove()
    activeToastEl = null
  }
  const isError = /failed|error|blocked|unable|unreachable|échec|erreur|bloqué|impossible/iu.test(
    message
  )
  const toast = document.createElement('div')
  toast.dataset.vexelUi = 'true'
  const badge = document.createElement('span')
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: UI_RADII.pill,
    backgroundColor: isError ? UI_COLORS.dangerSoft : UI_COLORS.successSoft,
    color: isError ? UI_COLORS.danger : UI_COLORS.success,
    flexShrink: '0',
  })
  badge.append(createLucideIcon(isError ? 'alert-circle' : 'check', 12, 'currentColor'))

  const label = document.createElement('span')
  label.textContent = t`Vexel: ${message}`
  Object.assign(label.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  })

  toast.append(badge, label)
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '22px',
    right: '22px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '9px',
    maxWidth: 'min(420px, calc(100vw - 44px))',
    backgroundColor: UI_COLORS.surface,
    backdropFilter: 'blur(18px)',
    color: UI_COLORS.text,
    border: `1px solid ${isError ? 'rgba(197, 34, 31, 0.24)' : UI_COLORS.border}`,
    padding: '8px 14px 8px 9px',
    borderRadius: UI_RADII.pill,
    fontSize: '12.5px',
    fontWeight: '500',
    letterSpacing: '-0.01em',
    fontFamily: UI_FONT_SANS,
    boxShadow: UI_SHADOWS.floating,
    zIndex: '2147483647',
    opacity: '0',
    transform: 'translateY(8px) scale(0.97)',
  })
  target.append(toast)
  activeToastEl = toast
  animate(
    toast,
    { opacity: 1, y: 0, scale: 1 },
    { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }
  )
  activeToastTimer = globalThis.setTimeout(() => {
    animate(toast, { opacity: 0, y: 6, scale: 0.98 }, { duration: 0.18 }).finished.then(() => {
      toast.remove()
      if (activeToastEl === toast) activeToastEl = null
    })
  }, 2900)
}

function initAutoFilePaste(): void {
  document.addEventListener(
    'paste',
    (e: ClipboardEvent) => {
      const promptInput = resolvePromptInput(e.target as HTMLElement | null)
      if (!promptInput) return
      const pasted = e.clipboardData?.getData('text/plain') || ''
      if (!pasted) return
      if (getProjectedInputLength(promptInput, pasted) > MAX_SAFE_LENGTH) {
        e.preventDefault()
        e.stopPropagation()
        uploadAsTextFile(pasted, promptInput, showToast)
      }
    },
    true
  )
}
const scheduleBackground = (fn: () => void): void => {
  const sched = (
    globalThis as unknown as {
      scheduler?: { postTask?: (cb: () => void, opts?: { priority?: string }) => void }
    }
  ).scheduler
  if (typeof sched?.postTask === 'function') {
    sched.postTask(fn, { priority: 'background' })
  } else if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 300 })
  } else {
    window.setTimeout(fn, 120)
  }
}

if (window === window.top) {
  initLocaleSync()
  initDomBooster()
  const bootUi = () => {
    initAutoFilePaste()
    initCommandPalette(showToast)
    scheduleBackground(() => {
      initThreadTools(showToast)
      initCodeRepair(showToast)
      initCodeSave(showToast)
      initOnboarding(showToast)
    })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootUi, { once: true })
  } else {
    bootUi()
  }
}
