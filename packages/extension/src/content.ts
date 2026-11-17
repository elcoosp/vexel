import { initCodeSave } from './features/code-save'
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
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}
if (window === window.top) {
  initDomBooster();
  initCommandPalette(showToast);
  initThreadTools(showToast);
  initCodeSave(showToast);
}
