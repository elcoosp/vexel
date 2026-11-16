export function initDomBooster(): void {
  console.log('[Vexel DOM Booster] Demarrage');
  const style = document.createElement('style');
  style.id = 'vexel-dom-booster';
  style.textContent = [
    '.vexel-virtualized {',
    '  content-visibility: auto !important;',
    '  contain-intrinsic-size: auto 320px !important;',
    '}',
    'textarea, [contenteditable="true"] {',
    '  contain: layout style !important;',
    '  transition: none !important;',
    '  animation: none !important;',
    '}',
    'pre, code, table {',
    '  contain: content !important;',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  const virtualizeOldTurns = () => {
    const rawList = document.querySelectorAll('[data-turn-id], [data-message-id], .conversation-container > div, [jsname] > div > div[data-hveid]');
    const candidates: HTMLElement[] = [];
    rawList.forEach((node) => {
      const el = node as HTMLElement;
      if (el.offsetHeight > 120 && !el.querySelector('textarea, [contenteditable="true"]')) {
        candidates.push(el);
      }
    });

    if (candidates.length <= 4) return;

    const oldTurns = candidates.slice(0, candidates.length - 4);
    let newlyVirtualized = 0;
    for (const turn of oldTurns) {
      if (!turn.classList.contains('vexel-virtualized')) {
        turn.classList.add('vexel-virtualized');
        newlyVirtualized++;
      }
    }
    if (newlyVirtualized > 0) {
      console.log('[Vexel DOM Booster] ' + newlyVirtualized + ' blocs virtualises (total: ' + oldTurns.length + '/' + candidates.length + ')');
    }
  };

  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(virtualizeOldTurns, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  virtualizeOldTurns();
}
