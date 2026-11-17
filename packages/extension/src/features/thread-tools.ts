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
    showToast('No conversation turns found');
    return;
  }
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const lines: string[] = [
    '# Google AI Mode Export (' + new Date().toLocaleDateString('en-US') + ')',
    '',
    '> ' + turns.length + ' blocks exported via Vexel',
    '',
  ];
  for (const turn of turns) {
    const mdBody = elementToMarkdown(turn.element);
    if (mdBody) lines.push('---', '', turn.role === 'user' ? '## User' : '## Assistant', '', mdBody, '');
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
  showToast('Conversation exported (' + turns.length + ' blocks)');
}

const TOC_CSS = [
  ':host { all: initial; color-scheme: light; }',
  '.rail { box-sizing: border-box; position: fixed; right: 16px; top: 50%; transform: translateY(-50%); z-index: 2147483640; display: none; flex-direction: column; align-items: center; width: 28px; max-height: min(62vh, 420px); padding: 6px 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(16px); border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; transition: width 0.22s cubic-bezier(0.2, 0, 0, 1), background-color 0.2s ease, box-shadow 0.2s ease; }',
  '.rail.overflowing:hover { width: 33px; }',
  '.rail.visible { display: flex; }',
  '.rail:hover { background: rgba(255, 255, 255, 0.98); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05); }',
  '.rail-scroll { box-sizing: border-box; position: relative; width: 100%; max-height: calc(min(62vh, 420px) - 12px); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: transparent transparent; padding: 0 1px; transition: scrollbar-color 0.22s ease; }',
  '.rail.overflowing:hover .rail-scroll { scrollbar-color: rgba(60, 64, 67, 0.26) transparent; }',
  '.rail-scroll::-webkit-scrollbar { width: 4px; }',
  '.rail-scroll::-webkit-scrollbar-track { background: transparent; margin: 6px 0; }',
  '.rail-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 999px; transition: background-color 0.22s ease; }',
  '.rail.overflowing:hover .rail-scroll::-webkit-scrollbar-thumb { background: rgba(60, 64, 67, 0.24); }',
  '.rail.overflowing:hover .rail-scroll::-webkit-scrollbar-thumb:hover { background: rgba(26, 115, 232, 0.55); }',
  '.rail-scroll.overflowing { mask-image: linear-gradient(to bottom, transparent 0%, #000 10px, #000 calc(100% - 10px), transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 10px, #000 calc(100% - 10px), transparent 100%); }',
  '.rail-inner { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; }',
  '.active-pill { position: absolute; left: 0; top: 0; width: 18px; height: 18px; border-radius: 999px; background: #e8f0fe; pointer-events: none; will-change: transform; }',
  '.tick-wrap { position: relative; z-index: 1; width: 18px; height: 18px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 999px; }',
  '.tick { width: 5px; height: 5px; border-radius: 50%; background: #c4c7c5; transition: background-color 0.18s ease, transform 0.18s ease; }',
  '.tick-wrap:hover .tick { background: #5f6368; transform: scale(1.25); }',
  '.tick-wrap.current .tick { background: #1a73e8; transform: scale(1.2); }',
  '.shared-tip, .shared-tip * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif; }',
  '.shared-tip { position: fixed; right: 50px; top: 0; display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(18px); color: #1f1f1f; border: 1px solid rgba(0, 0, 0, 0.08); padding: 6px 12px 6px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; line-height: 1.3; white-space: nowrap; max-width: 280px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05); opacity: 0; pointer-events: none; will-change: transform, opacity; z-index: 2147483641; }',
  '.tip-badge { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 600; color: #1a73e8; background: #e8f0fe; padding: 1px 6px; border-radius: 6px; flex-shrink: 0; }',
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
  const railScroll = document.createElement('div');
  railScroll.className = 'rail-scroll';
  const railInner = document.createElement('div');
  railInner.className = 'rail-inner';
  const activePill = document.createElement('div');
  activePill.className = 'active-pill';
  railScroll.appendChild(railInner);
  rail.appendChild(railScroll);

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
  let currentIdx = -1;
  let turnEntries: Array<{ wrap: HTMLDivElement; target: HTMLElement }> = [];

  const hideTooltip = () => {
    if (!tipVisible) return;
    tipVisible = false;
    animate(sharedTip, { opacity: 0, x: 4 }, { duration: 0.14 });
  };

  const showTooltipAt = (wrap: HTMLElement, indexLabel: string, preview: string) => {
    if (hideTimer) window.clearTimeout(hideTimer);
    tipBadge.textContent = indexLabel;
    tipText.textContent = preview;
    const rect = wrap.getBoundingClientRect();
    const centerY = Math.round(rect.top + rect.height / 2 - 15);
    if (!tipVisible) {
      tipVisible = true;
      sharedTip.style.transform = 'translateY(' + centerY + 'px) translateX(4px)';
      animate(
        sharedTip,
        { opacity: 1, y: centerY, x: 0 },
        { duration: 0.16, ease: [0.2, 0, 0, 1] }
      );
    } else {
      animate(
        sharedTip,
        { opacity: 1, y: centerY, x: 0 },
        { type: 'spring', stiffness: 520, damping: 38, mass: 0.6 }
      );
    }
  };

  rail.addEventListener('pointerleave', () => {
    hideTimer = window.setTimeout(hideTooltip, 80);
  });

  railScroll.addEventListener('scroll', hideTooltip, { passive: true });

const moveActivePill = (idx: number, instant = false) => {
if (idx < 0 || idx >= turnEntries.length) return;
const targetY = idx * 20;
if (instant) {
activePill.style.transform = 'translateY(' + targetY + 'px)';
} else {
animate(
activePill,
{ y: targetY },
{ type: 'spring', stiffness: 480, damping: 36, mass: 0.7 }
);
}
if (railScroll.scrollHeight > railScroll.clientHeight) {
const desiredTop = Math.max(0, targetY - railScroll.clientHeight / 2 + 9);
railScroll.scrollTo({ top: desiredTop, behavior: instant ? 'auto' : 'smooth' });
}
};
const updateCurrentTurn = (instant = false) => {
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
if (bestIdx !== currentIdx || instant) {
currentIdx = bestIdx;
for (let i = 0; i < turnEntries.length; i++) {
turnEntries[i].wrap.classList.toggle('current', i === bestIdx);
}
moveActivePill(bestIdx, instant);
}
};
const refreshToc = () => {
const userTurns = extractTurns().filter((t) => t.role === 'user');
const sig = userTurns.map((t) => t.preview).join('|');
if (sig === lastSignature) return;
lastSignature = sig;
turnEntries = [];
currentIdx = -1;
hideTooltip();
railInner.replaceChildren(activePill);
if (userTurns.length < 2) {
rail.classList.remove('visible');
return;
}
rail.classList.add('visible');
for (let i = 0; i < userTurns.length; i++) {
const turn = userTurns[i];
const wrap = document.createElement('div');
wrap.className = 'tick-wrap';
const dot = document.createElement('div');
dot.className = 'tick';
wrap.appendChild(dot);
const turnRoot = (turn.element.closest('.CKgc1d') || turn.element) as HTMLElement;
turnEntries.push({ wrap, target: turnRoot });
const badgeLabel = '#' + (i + 1);
wrap.addEventListener('pointerenter', () => {
showTooltipAt(wrap, badgeLabel, turn.preview);
});
wrap.addEventListener('click', () => {
turnRoot.classList.remove('vexel-virtualized');
turnRoot.style.contentVisibility = '';
turnRoot.style.containIntrinsicSize = '';
turnRoot.style.contain = '';
turnRoot.inert = false;
turnRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
railInner.appendChild(wrap);
}
window.requestAnimationFrame(() => {
const isOverflow = railScroll.scrollHeight > railScroll.clientHeight; rail.classList.toggle('overflowing', isOverflow); railScroll.classList.toggle('overflowing', isOverflow);
updateCurrentTurn(true);
});
};
window.addEventListener('scroll', () => updateCurrentTurn(false), { passive: true });
window.addEventListener('resize', () => {
const isOverflow = railScroll.scrollHeight > railScroll.clientHeight; rail.classList.toggle('overflowing', isOverflow); railScroll.classList.toggle('overflowing', isOverflow);
}, { passive: true });
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
