import { animate } from 'motion';
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
  ':host { all: initial; color-scheme: light; }',
  '.rail { position: fixed; right: 16px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: none; flex-direction: column; align-items: flex-end; gap: 3px; padding: 8px 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(14px); border: 1px solid #e1e3e6; box-shadow: 0 4px 16px rgba(60, 64, 67, 0.1), 0 1px 3px rgba(60, 64, 67, 0.06); font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; transition: border-color 0.18s ease, box-shadow 0.18s ease; }',
  '.rail.visible { display: flex; }',
  '.rail:hover { border-color: #dadce0; box-shadow: 0 8px 24px rgba(60, 64, 67, 0.14); }',
  '.tick-wrap { position: relative; display: flex; align-items: center; justify-content: flex-end; cursor: pointer; padding: 4px 4px; border-radius: 999px; }',
  '.tick { width: 12px; height: 3px; border-radius: 999px; background: #dadce0; will-change: width, background-color; transition: background-color 0.15s ease; }',
  '.tick-wrap.current .tick { width: 18px; background: #1a73e8; }',
  '.tick-wrap:hover .tick { background: #1a73e8; }',
  '.tooltip { position: absolute; right: 34px; display: inline-flex; align-items: center; gap: 7px; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(16px); color: #1f1f1f; border: 1px solid #dadce0; padding: 6px 11px 6px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; white-space: nowrap; max-width: 300px; box-shadow: 0 8px 24px rgba(60, 64, 67, 0.16), 0 1px 3px rgba(60, 64, 67, 0.08); opacity: 0; pointer-events: none; will-change: transform, opacity; }',
  '.tip-badge { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10.5px; font-weight: 600; color: #1a73e8; background: #e8f0fe; padding: 1px 6px; border-radius: 999px; flex-shrink: 0; }',
  '.tip-text { overflow: hidden; text-overflow: ellipsis; }',
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
  let railWarm = false;
  let warmResetTimer: number | undefined;
  let activeTip: HTMLElement | null = null;
  let hoverDelayTimer: number | undefined;
  let turnEntries: Array<{ wrap: HTMLDivElement; tick: HTMLDivElement; target: HTMLElement }> = [];

  const updateCurrentTurn = () => {
    if (turnEntries.length === 0) return;
    const mid = window.innerHeight * 0.42;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < turnEntries.length; i++) {
      const rect = turnEntries[i].target.getBoundingClientRect();
      const dist = Math.abs(rect.top - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    for (let i = 0; i < turnEntries.length; i++) {
      const isCurr = i === bestIdx;
      const wasCurr = turnEntries[i].wrap.classList.contains('current');
      if (isCurr !== wasCurr) {
        turnEntries[i].wrap.classList.toggle('current', isCurr);
        animate(
          turnEntries[i].tick,
          { width: isCurr ? 18 : 12 },
          { type: 'spring', stiffness: 520, damping: 34 }
        );
      }
    }
  };

  rail.addEventListener('pointerleave', () => {
    if (hoverDelayTimer) window.clearTimeout(hoverDelayTimer);
    if (activeTip) {
      const closing = activeTip;
      activeTip = null;
      animate(closing, { opacity: 0, x: 4, scale: 0.97 }, { duration: 0.12 });
    }
    warmResetTimer = window.setTimeout(() => {
      railWarm = false;
    }, 320);
  });

  rail.addEventListener('pointerenter', () => {
    if (warmResetTimer) window.clearTimeout(warmResetTimer);
  });

  const refreshToc = () => {
    const userTurns = extractTurns().filter((t) => t.role === 'user');
    const sig = userTurns.map((t) => t.preview).join('|');
    if (sig === lastSignature) return;
    lastSignature = sig;
    turnEntries = [];
    rail.replaceChildren();
    if (userTurns.length < 1) {
      rail.classList.remove('visible');
      return;
    }
    rail.classList.add('visible');

    const step = userTurns.length > 35 ? Math.ceil(userTurns.length / 35) : 1;
    for (let i = 0; i < userTurns.length; i += step) {
      const turn = userTurns.slice(i, i + 1).find(() => true);
      if (!turn) continue;
      const wrap = document.createElement('div');
      wrap.className = 'tick-wrap';

      const tip = document.createElement('div');
      tip.className = 'tooltip';
      const badge = document.createElement('span');
      badge.className = 'tip-badge';
      badge.textContent = '#' + (i + 1);
      const txt = document.createElement('span');
      txt.className = 'tip-text';
      txt.textContent = turn.preview;
      tip.append(badge, txt);

      const tick = document.createElement('div');
      tick.className = 'tick';
      wrap.append(tip, tick);

      const turnRoot = turn.element.closest<HTMLElement>('.CKgc1d') || turn.element;
      turnEntries.push({ wrap, tick, target: turnRoot });

      const showTip = () => {
        if (activeTip && activeTip !== tip) {
          activeTip.style.opacity = '0';
        }
        activeTip = tip;
        railWarm = true;
        animate(
          tip,
          { opacity: 1, x: 0, scale: [0.97, 1] },
          { type: 'spring', stiffness: 540, damping: 34, mass: 0.7 }
        );
      };

      wrap.addEventListener('pointerenter', () => {
        animate(tick, { width: 24 }, { type: 'spring', stiffness: 560, damping: 32 });
        if (hoverDelayTimer) window.clearTimeout(hoverDelayTimer);
        if (railWarm) showTip();
        else hoverDelayTimer = window.setTimeout(showTip, 160);
      });

      wrap.addEventListener('pointerleave', () => {
        const isCurr = wrap.classList.contains('current');
        animate(tick, { width: isCurr ? 18 : 12 }, { type: 'spring', stiffness: 500, damping: 34 });
      });

      wrap.addEventListener('click', () => {
        animate(tick, { scaleX: [0.85, 1.08, 1] }, { duration: 0.24 });
        turnRoot.classList.remove('vexel-virtualized');
        turnRoot.style.contentVisibility = '';
        turnRoot.style.containIntrinsicSize = '';
        turnRoot.style.contain = '';
        turnRoot.inert = false;
        turnRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      rail.appendChild(wrap);
    }
    updateCurrentTurn();
  };

  window.addEventListener('scroll', updateCurrentTurn, { passive: true });

  let tocTimer: number | undefined;
  const scheduleToc = () => {
    if (tocTimer) window.clearTimeout(tocTimer);
    tocTimer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(refreshToc, { timeout: 1500 });
      else refreshToc();
    }, 600);
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
