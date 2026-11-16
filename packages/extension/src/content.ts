import { initUntruncate } from './features/untruncate'
import { initCodeRepair } from './features/code-repair'
import { initCommandPalette } from './features/palette'
import { initThreadTools } from './features/thread-tools'
import { initDomBooster } from './features/dom-booster'

function createToastManager(): (msg: string) => void {
  const host = document.createElement('div')
  host.id = 'vexel-toast-host'
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = [
    ':host { all: initial; }',
    '.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(16px); z-index: 2147483647; background: rgba(20, 20, 23, 0.96); color: #f4f4f5; border: 1px solid rgba(255, 255, 255, 0.14); padding: 8px 14px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; font-size: 12.5px; font-weight: 500; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); opacity: 0; pointer-events: none; transition: all 0.18s ease; }',
    '.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }',
  ].join('\n')
  const toastEl = document.createElement('div')
  toastEl.className = 'toast'
  shadow.append(style, toastEl)
  ;(document.body || document.documentElement).append(host)
  let hideTimer: number | undefined
  return (msg: string) => {
    toastEl.textContent = msg
    toastEl.classList.add('show')
    if (hideTimer !== undefined) {
      globalThis.clearTimeout(hideTimer)
    }
    hideTimer = globalThis.setTimeout(() => {
      toastEl.classList.remove('show')
    }, 2600)
  }
}
function safeRun(label: string, fn: () => void): void {
  try {
    fn()
  } catch (error) {
    console.error('[Vexel] Erreur dans ' + label + ':', error)
  }
}
function bootstrap(): void {
  if (document.querySelector('#vexel-toast-host')) return
  console.log('[Vexel] Initialisation active sur', globalThis.location.href)
  const showToast = createToastManager()
  safeRun('untruncate', () => initUntruncate(showToast))
  safeRun('code-repair', () => initCodeRepair(showToast))
  safeRun('palette', () => initCommandPalette(showToast))
  safeRun('thread-tools', () => initThreadTools(showToast))
  safeRun('dom-booster', () => initDomBooster())
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
} else {
  bootstrap()
}
