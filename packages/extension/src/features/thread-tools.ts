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
  '.rail { position: fixed; right: 14px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: none; flex-direction: column; align-items: flex-end; gap: 2px; padding: 8px 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.78); backdrop-filter: blur(14px); border: 1px solid rgba(218, 220, 224, 0.75); box-shadow: 0 2px 10px rgba(60, 64, 67, 0.06); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }',
  '.rail.visible { display: flex; }',
  '.rail:hover { background: rgba(255, 255, 255, 0.96); border-color: #dadce0; box-shadow: 0 6px 20px rgba(60, 64, 67, 0.11); }',
  '.tick-wrap { display: flex; align-items: center; justify-content: flex-end; cursor: pointer; padding: 4px 4px; }',
  '.tick { width: 8px; height: 2px; border-radius: 999px; background: #dadce0; will-change: width, background-color; transition: background-color 0.15s ease; }',
  '.tick-wrap.current .tick { width: 14px; background: #1a73e8; }',
  '.tick-wrap:hover .tick { background: #1a73e8; }',
  '.shared-tip, .shared-tip * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; }',
  '.shared-tip { position: fixed; right: 44px; top: 0; display: inline-flex; align-items: center; gap: 7px; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(16px); color: #1f1f1f; border: 1px solid #e1e3e6; padding: 6px 11px 6px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; white-space: nowrap; max-width: 280px; box-shadow: 0 8px 24px rgba(60, 64, 67, 0.14), 0 1px 3px rgba(60, 64, 67, 0.06); opacity: 0; pointer-events: none; will-change: transform, opacity; z-index: 2147483641; }',
  '.tip-badge { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 600; color: #1a73e8; background: #e8f0fe; padding: 1px 6px; border-radius: 999px; flex-shrink: 0; }',
  '.tip-text { overflow: hidden; text-overflow: ellipsis; color: #3c4043; }',
].join('\n');

export function initThreadTools(_showToast?: (msg: string) => void): void {
  if (document.getElementById('vexel-toc-host')) return;
  const host = document.createElement('div');
  host.id = 'vexel-toc-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = TOC_CSS;

  const rail = document.createElement('div');
  rail.className = 'rail';

  const sharedTip = document.createElement('div');
  sharedTip.className = 'shared-tip';
  const tipBadge = document.createElement('span');
  tipBadge.className = 'tip-badge';
  const tipText = document.createElement('span');
  tipText.className = 'tip-text';
  sharedTip.append(tipBadge, tipText);

  shadow.append(styleEl, rail, sharedTip);
  document.body.appendChild(host);

  let lastSignature = '';
  let tipVisible = false;
  let hideTimer: number | undefined;
  let turnEntries: Array<{ wrap: HTMLDivElement; tick: HTMLDivElement; target: HTMLElement }> = [];

  const hideTooltip = () => {
    if (!tipVisible) return;
    tipVisible = false;
    animate(sharedTip, { opacity: 0, x: 6, scale: 0.96 }, { duration: 0.14 });
  };

  const showTooltipAt = (wrap: HTMLElement, indexLabel: string, preview: string) => {
    if (hideTimer) window.clearTimeout(hideTimer);
    tipBadge.textContent = indexLabel;
    tipText.textContent = preview;
    const rect = wrap.getBoundingClientRect();
    const centerY = Math.round(rect.top + rect.height / 2 - 15);
    if (!tipVisible) {
      tipVisible = true;
      sharedTip.style.transform = 'translateY(' + centerY + 'px) translateX(6px) scale(0.96)';
      animate(
        sharedTip,
        { opacity: 1, y: centerY, x: 0, scale: 1 },
        { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }
      );
    } else {
      animate(
        sharedTip,
        { opacity: 1, y: centerY, x: 0, scale: 1 },
        { type: 'spring', stiffness: 560, damping: 38, mass: 0.6 }
      );
    }
  };

  rail.addEventListener('pointerleave', () => {
    hideTimer = window.setTimeout(hideTooltip, 60);
  });

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
          { width: isCurr ? 14 : 8 },
          { type: 'spring', stiffness: 520, damping: 34 }
        );
      }
    }
  };

  const refreshToc = () => {
    const userTurns = extractTurns().filter((t) => t.role === 'user');
    const sig = userTurns.map((t) => t.preview).join('|');
    if (sig === lastSignature) return;
    lastSignature = sig;
    turnEntries = [];
    hideTooltip();
    rail.replaceChildren();
    if (userTurns.length < 2) {
      rail.classList.remove('visible');
      return;
    }
    rail.classList.add('visible');

    const maxTicks = 14;
    const step = userTurns.length > maxTicks ? Math.ceil(userTurns.length / maxTicks) : 1;
    for (let i = 0; i < userTurns.length; i += step) {
      const turn = userTurns.slice(i, i + 1).find(() => true);
      if (!turn) continue;
      const wrap = document.createElement('div');
      wrap.className = 'tick-wrap';
      const tick = document.createElement('div');
      tick.className = 'tick';
      wrap.appendChild(tick);

      const turnRoot = turn.element.closest<HTMLElement>('.CKgc1d') || turn.element;
      turnEntries.push({ wrap, tick, target: turnRoot });
      const badgeLabel = '#' + (i + 1);

      wrap.addEventListener('pointerenter', () => {
        animate(tick, { width: 18 }, { type: 'spring', stiffness: 560, damping: 32 });
        showTooltipAt(wrap, badgeLabel, turn.preview);
      });

      wrap.addEventListener('pointerleave', () => {
        const isCurr = wrap.classList.contains('current');
        animate(tick, { width: isCurr ? 14 : 8 }, { type: 'spring', stiffness: 500, damping: 34 });
      });

      wrap.addEventListener('click', () => {
        animate(tick, { scaleX: [0.85, 1.1, 1] }, { duration: 0.22 });
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
