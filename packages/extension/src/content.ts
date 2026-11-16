import { initUntruncate } from './features/untruncate'
import { initDomBooster } from './features/dom-booster'
import { initCommandPalette } from './features/palette'
import { initThreadTools } from './features/thread-tools'
function showToast(message: string): void {
  const toast = document.createElement('div')
  toast.textContent = 'Vexel : ' + message
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    backgroundColor: '#18181b',
    color: '#fafafa',
    border: '1px solid #27272a',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    zIndex: '2147483647',
    transition: 'opacity 0.3s ease',
  })
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}
initDomBooster()
initUntruncate(showToast)
initCommandPalette(showToast)
initThreadTools(showToast)
