interface ThreadTurn {
  index: number;
  element: HTMLElement;
  role: 'user' | 'assistant';
  preview: string;
}

const BT3 = String.fromCharCode(96, 96, 96);

function extractTurns(): ThreadTurn[] {
  const turns: ThreadTurn[] = [];
  const turnBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('.CKgc1d[data-scope-id="turn"], [jsname="CS7uPe"]')
  );

  if (turnBlocks.length > 0) {
    for (const block of turnBlocks) {
      const userEl =
        block.querySelector<HTMLElement>('[jsname="eFVkfb"], .VndcI.veK2kb, .tbIZh.Odbbif') || null;
      if (userEl) {
        const userText = (userEl.innerText || userEl.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (userText) {
          turns.push({
            index: turns.length + 1,
            element: userEl,
            role: 'user',
            preview: userText.slice(0, 72),
          });
        }
      }

      const aiEl = block.querySelector<HTMLElement>('[data-subtree="aimc"]') || null;
      if (aiEl) {
        const aiText = (aiEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (aiText) {
          turns.push({
            index: turns.length + 1,
            element: aiEl,
            role: 'assistant',
            preview: aiText.slice(0, 72),
          });
        }
      }
    }
    return turns;
  }

  const fallbackUserNodes = Array.from(
    document.querySelectorAll<HTMLElement>('[jsname="eFVkfb"], .VndcI.veK2kb')
  );
  for (const node of fallbackUserNodes) {
    const clean = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    if (clean) {
      turns.push({
        index: turns.length + 1,
        element: node,
        role: 'user',
        preview: clean.slice(0, 72),
      });
    }
  }
  return turns;
}

function elementToMarkdown(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code');
    const langMatch = (codeEl?.className || '').match(/language-([a-zA-Z0-9_-]+)/);
    const lang = langMatch ? (langMatch.slice(1, 2).find(() => true) || '') : '';
    const codeText = (codeEl ? codeEl.textContent : pre.textContent) || '';
    pre.replaceWith(document.createTextNode('\n' + BT3 + lang + '\n' + codeText.trim() + '\n' + BT3 + '\n'));
  });
  clone.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    const hashes = '#'.repeat(Number(h.tagName.slice(1)));
    h.replaceWith(document.createTextNode('\n\n' + hashes + ' ' + (h.textContent || '').trim() + '\n\n'));
  });
  clone.querySelectorAll('li').forEach((li) => li.replaceWith(document.createTextNode('\n- ' + (li.textContent || '').trim())));
  clone.querySelectorAll('p').forEach((p) => p.replaceWith(document.createTextNode('\n\n' + (p.textContent || '').trim() + '\n')));
  return (clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export function exportConversationMarkdown(showToast: (msg: string) => void): void {
  const turns = extractTurns();
  if (turns.length === 0) {
    showToast('Aucun tour de conversation detecte');
    return;
  }
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const lines: string[] = [
    '# Export Google AI Mode (' + new Date().toLocaleDateString('fr-FR') + ')',
    '',
    '> ' + turns.length + ' blocs exportes via Vexel',
    '',
  ];
  for (const turn of turns) {
    const mdBody = elementToMarkdown(turn.element);
    if (mdBody) lines.push('---', '', turn.role === 'user' ? '## Utilisateur' : '## Assistant', '', mdBody, '');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'google-ai-mode-' + timestamp + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Conversation exportee (' + turns.length + ' blocs)');
}

const TOC_CSS = [
  ':host { all: initial; }',
  '.rail { position: fixed; right: 14px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding: 8px 4px; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }',
  '.tick-wrap { position: relative; display: flex; align-items: center; justify-content: flex-end; cursor: pointer; padding: 3px 4px; }',
  '.tick { width: 14px; height: 3px; border-radius: 999px; background: #dadce0; transition: all 0.15s ease; }',
  '.tick-wrap:hover .tick { width: 24px; background: #1a73e8; }',
  '.tooltip { position: absolute; right: 30px; background: #ffffff; color: #1f1f1f; border: 1px solid #dadce0; padding: 6px 10px; border-radius: 10px; font-size: 12px; font-weight: 500; white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 12px rgba(60, 64, 67, 0.18); opacity: 0; pointer-events: none; transform: translateX(4px); transition: all 0.12s ease; }',
  '.tick-wrap:hover .tooltip { opacity: 1; transform: translateX(0); }',
].join('\n');

export function initThreadTools(showToast: (msg: string) => void): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      exportConversationMarkdown(showToast);
    }
  }, true);

  const host = document.createElement('div');
  host.id = 'vexel-toc-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = TOC_CSS;
  const rail = document.createElement('div');
  rail.className = 'rail';
  shadow.appendChild(styleEl);
  shadow.appendChild(rail);
  document.body.appendChild(host);

  let lastSignature = '';
  const refreshToc = () => {
    const userTurns = extractTurns().filter((t) => t.role === 'user');
    const sig = userTurns.map((t) => t.preview).join('|');
    if (sig === lastSignature) return;
    lastSignature = sig;
    rail.replaceChildren();
    if (userTurns.length < 1) return;

    const step = userTurns.length > 35 ? Math.ceil(userTurns.length / 35) : 1;
    for (let i = 0; i < userTurns.length; i += step) {
      const turn = userTurns.slice(i, i + 1).find(() => true);
      if (!turn) continue;
      const wrap = document.createElement('div');
      wrap.className = 'tick-wrap';
      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = '#' + (i + 1) + ' — ' + turn.preview;
      const tick = document.createElement('div');
      tick.className = 'tick';
      wrap.appendChild(tip);
      wrap.appendChild(tick);
      wrap.addEventListener('click', () => {
        const turnRoot = turn.element.closest<HTMLElement>('.CKgc1d') || turn.element;
        turnRoot.classList.remove('vexel-virtualized');
        turnRoot.style.contentVisibility = '';
        turnRoot.style.containIntrinsicSize = '';
        turnRoot.style.contain = '';
        turnRoot.inert = false;
        turnRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      rail.appendChild(wrap);
    }
  };

  let tocTimer: number | undefined;
  const scheduleToc = () => {
    if (tocTimer) window.clearTimeout(tocTimer);
    tocTimer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(refreshToc, { timeout: 1500 });
      else refreshToc();
    }, 900);
  };

  const obs = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length) {
        scheduleToc();
        return;
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  scheduleToc();
}
