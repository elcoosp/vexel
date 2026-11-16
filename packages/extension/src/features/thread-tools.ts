interface ThreadTurn {
  index: number;
  element: HTMLElement;
  role: 'user' | 'assistant';
  preview: string;
}

const BT3 = String.fromCharCode(96, 96, 96);

function findConversationContainer(): HTMLElement | null {
  const anchors = document.querySelectorAll('[data-hveid]');
  if (anchors.length === 0) return null;

  const visibleInput = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'))
    .find((el) => (el as HTMLElement).offsetParent !== null);

  const parentCounts = new Map<HTMLElement, number>();
  for (let i = 0; i < anchors.length; i++) {
    let curr: HTMLElement | null = anchors.item(i).parentElement;
    let depth = 0;
    while (curr && curr !== document.body && depth < 8) {
      if (curr.children.length >= 2 && curr.children.length <= 500) {
        parentCounts.set(curr, (parentCounts.get(curr) || 0) + 1);
      }
      curr = curr.parentElement;
      depth++;
    }
  }

  let bestContainer: HTMLElement | null = null;
  let bestScore = 0;
  parentCounts.forEach((count, container) => {
    if (!visibleInput || !container.contains(visibleInput)) {
      const score = count * container.children.length;
      if (score > bestScore) {
        bestScore = score;
        bestContainer = container;
      }
    }
  });

  return bestContainer;
}

function findUserBubbleInBlock(el: HTMLElement, containerRect: DOMRect): HTMLElement | null {
  const candidates = [el, ...Array.from(el.querySelectorAll<HTMLElement>("div, p, span"))];
  for (const node of candidates) {
    const text = (node.innerText || node.textContent || "").trim();
    if (!text || text.length > 2500) continue;
    if (/^\d{1,2}:\d{2}$/.test(text)) continue;
    if (node.querySelector("pre, code, table, ul, ol, h1, h2, h3, .aiModeUiCodeBlock__Container")) continue;

    const r = node.getBoundingClientRect();
    if (r.width < 12 || r.height < 12) continue;

    const isNarrower = r.width < containerRect.width * 0.78;
    const isShiftedRight = r.left - containerRect.left > containerRect.width * 0.22;
    if (isNarrower && isShiftedRight) {
      return node;
    }
  }
  return null;
}

function extractTurns(): ThreadTurn[] {
  const container = findConversationContainer();
  if (!container) return [];

  const containerRect = container.getBoundingClientRect();
  const turns: ThreadTurn[] = [];
  const seenElements = new Set<HTMLElement>();
  const children = Array.from(container.children) as HTMLElement[];

  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    const rawText = (el.textContent || "").trim();
    if (!rawText) continue;

    const bubble = findUserBubbleInBlock(el, containerRect);
    if (bubble) {
      const bubbleText = (bubble.innerText || bubble.textContent || "")
        .replace(/\b\d{1,2}:\d{2}\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (bubbleText && !seenElements.has(bubble)) {
        seenElements.add(bubble);
        turns.push({
          index: turns.length + 1,
          element: bubble,
          role: "user",
          preview: bubbleText.slice(0, 72)
        });
      }
      continue;
    }

    const cleanPreview = rawText.replace(/\s+/g, " ").slice(0, 72);
    turns.push({
      index: turns.length + 1,
      element: el,
      role: "assistant",
      preview: cleanPreview
    });
  }

  return turns;
}

function elementToMarkdown(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code');
    const langClass = codeEl?.className || '';
    const langMatch = langClass.match(/language-([a-zA-Z0-9_-]+)/);
    const lang = langMatch ? (langMatch.slice(1, 2).find(() => true) || '') : '';
    const codeText = (codeEl ? codeEl.textContent : pre.textContent) || '';
    const replacement = document.createTextNode('\n' + BT3 + lang + '\n' + codeText.trim() + '\n' + BT3 + '\n');
    pre.replaceWith(replacement);
  });

  clone.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    const level = Number(h.tagName.slice(1));
    const hashes = '#'.repeat(level);
    h.replaceWith(document.createTextNode('\n\n' + hashes + ' ' + (h.textContent || '').trim() + '\n\n'));
  });

  clone.querySelectorAll('li').forEach((li) => {
    li.replaceWith(document.createTextNode('\n- ' + (li.textContent || '').trim()));
  });

  clone.querySelectorAll('p').forEach((p) => {
    p.replaceWith(document.createTextNode('\n\n' + (p.textContent || '').trim() + '\n'));
  });

  return (clone.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function exportConversationMarkdown(showToast: (msg: string) => void): void {
  const turns = extractTurns().filter((t) => t.role === "user");
  if (turns.length === 0) {
    showToast('Aucun tour de conversation detecte');
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const lines: string[] = [
    '# Export Google AI Mode (' + new Date().toLocaleDateString('fr-FR') + ')',
    '',
    '> ' + turns.length + ' blocs exportes via Vexel',
    ''
  ];

  for (const turn of turns) {
    const header = turn.role === 'user' ? '## Utilisateur' : '## Assistant';
    const mdBody = elementToMarkdown(turn.element);
    if (!mdBody) continue;
    lines.push('---', '', header, '', mdBody, '');
  }

  const fullMd = lines.join('\n');
  const blob = new Blob([fullMd], { type: 'text/markdown;charset=utf-8' });
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
  '.rail { position: fixed; right: 12px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding: 8px 4px; font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }',
  '.tick-wrap { position: relative; display: flex; align-items: center; justify-content: flex-end; cursor: pointer; padding: 2px 4px; }',
  '.tick { width: 14px; height: 3px; border-radius: 2px; background: rgba(161, 161, 170, 0.45); transition: all 0.15s ease; }',
  '.tick-wrap:hover .tick { width: 24px; background: #3b82f6; }',
  '.tooltip { position: absolute; right: 30px; background: rgba(20, 20, 23, 0.96); color: #f4f4f5; border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px 9px; border-radius: 7px; font-size: 11.5px; white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); opacity: 0; pointer-events: none; transform: translateX(4px); transition: all 0.12s ease; }',
  '.tick-wrap:hover .tooltip { opacity: 1; transform: translateX(0); }'
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

  let lastCount = -1;
  const refreshToc = () => {
    const userTurns = extractTurns().filter((t) => t.role === 'user');
    if (userTurns.length === lastCount) return;
    lastCount = userTurns.length;

    rail.replaceChildren();
    if (userTurns.length < 2) return;

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
        turn.element.classList.remove('vexel-virtualized');
        turn.element.style.contentVisibility = '';
        turn.element.style.containIntrinsicSize = '';
        turn.element.style.contain = '';
        turn.element.inert = false;
        turn.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      rail.appendChild(wrap);
    }
  };

  let tocTimer: number | undefined;
  const scheduleToc = () => {
    if (tocTimer) window.clearTimeout(tocTimer);
    tocTimer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(refreshToc, { timeout: 1500 });
      } else {
        refreshToc();
      }
    }, 900);
  };

  const obs = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      if (mutations.slice(i, i + 1).find(() => true)?.addedNodes.length) {
        scheduleToc();
        return;
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  scheduleToc();
}
