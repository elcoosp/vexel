import { animate } from 'motion';
import { createLucideIcon } from './icons';
import { loadDirectoryHandle, pickLocalFolder } from './local-fs';

const ONBOARDED_KEY = 'vexel_onboarded_v1';

const ONBOARDING_CSS = [
  ':host { all: initial; color-scheme: light; }',
  '.backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(15, 23, 42, 0.28); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 20px; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; opacity: 0; }',
  '.card { width: 100%; max-width: 480px; background: rgba(255, 255, 255, 0.98); border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 22px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.06); overflow: hidden; will-change: transform, opacity; }',
  '.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px 0 22px; }',
  '.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #1f1f1f; letter-spacing: -0.01em; }',
  '.brand-dot { width: 22px; height: 22px; border-radius: 7px; background: linear-gradient(135deg, #1a73e8, #4285f4); color: #fff; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(26, 115, 232, 0.32); }',
  '.skip-btn { border: none; background: transparent; color: #80868b; font-size: 12px; font-weight: 500; cursor: pointer; padding: 4px 8px; border-radius: 8px; transition: color 0.15s ease, background-color 0.15s ease; }',
  '.skip-btn:hover { color: #1f1f1f; background: #f1f3f4; }',
  '.body { padding: 20px 24px 22px 24px; }',
  '.step-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #e8f0fe; color: #1967d2; font-size: 11px; font-weight: 600; margin-bottom: 10px; }',
  '.title { margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #1f1f1f; letter-spacing: -0.02em; line-height: 1.25; }',
  '.desc { margin: 0 0 18px 0; font-size: 13.5px; color: #5f6368; line-height: 1.5; }',
  '.sandbox { background: #f8f9fa; border: 1px solid #e8eaed; border-radius: 14px; padding: 14px; margin-bottom: 18px; }',
  '.demo-chips { display: flex; flex-wrap: wrap; gap: 8px; }',
  '.demo-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px; border: 1px solid #dadce0; background: #ffffff; color: #1f1f1f; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 500; cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.12s ease; }',
  '.demo-chip:hover { border-color: #1a73e8; background: #f0f6ff; color: #1967d2; }',
  '.demo-chip.selected { border-color: #1a73e8; background: #e8f0fe; color: #1967d2; }',
  '.demo-preview { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #ffffff; border: 1px solid #e8eaed; font-size: 12px; color: #3c4043; line-height: 1.45; }',
  '.folder-cta { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; border-radius: 12px; border: 1px dashed #a8c7fa; background: #f0f6ff; color: #1967d2; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color 0.15s ease, border-color 0.15s ease; }',
  '.folder-cta:hover { background: #e8f0fe; border-color: #1a73e8; }',
  '.folder-cta.connected { border-style: solid; border-color: #ceead6; background: #e6f4ea; color: #137333; }',
  '.shortcut-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }',
  '.shortcut-card { padding: 10px 12px; border-radius: 11px; background: #ffffff; border: 1px solid #e8eaed; display: flex; flex-direction: column; gap: 4px; }',
  '.kbd { display: inline-block; align-self: flex-start; padding: 2px 7px; border-radius: 6px; background: #f1f3f4; border: 1px solid #dadce0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; color: #1f1f1f; }',
  '.shortcut-lbl { font-size: 12px; color: #5f6368; }',
  '.footer { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: #f8f9fa; border-top: 1px solid #eceff1; }',
  '.dots { display: flex; align-items: center; gap: 6px; }',
  '.dot { width: 6px; height: 6px; border-radius: 999px; background: #dadce0; transition: width 0.2s ease, background-color 0.2s ease; }',
  '.dot.active { width: 18px; background: #1a73e8; }',
  '.actions { display: flex; align-items: center; gap: 8px; }',
  '.btn-secondary { height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid #dadce0; background: #ffffff; color: #3c4043; font-size: 12.5px; font-weight: 500; cursor: pointer; }',
  '.btn-secondary:hover { background: #f1f3f4; }',
  '.btn-primary { height: 34px; padding: 0 18px; border-radius: 999px; border: none; background: #1a73e8; color: #ffffff; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(26, 115, 232, 0.28); }',
  '.btn-primary:hover { background: #1557b0; }',
].join('\n');

export function openOnboardingModal(showToast: (msg: string) => void): void {
  if (document.getElementById('vexel-onboarding-host')) return;

  const host = document.createElement('div');
  host.id = 'vexel-onboarding-host';
  host.setAttribute('data-vexel-ui', 'true');
  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = ONBOARDING_CSS;

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const card = document.createElement('div');
  card.className = 'card';

  const topBar = document.createElement('div');
  topBar.className = 'top-bar';

  const brand = document.createElement('div');
  brand.className = 'brand';
  const brandDot = document.createElement('span');
  brandDot.className = 'brand-dot';
  brandDot.appendChild(createLucideIcon('sparkles', 13, '#ffffff'));
  brand.append(brandDot, document.createTextNode('Welcome to Vexel'));

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'skip-btn';
  skipBtn.textContent = 'Skip';

  topBar.append(brand, skipBtn);

  const body = document.createElement('div');
  body.className = 'body';

  const footer = document.createElement('div');
  footer.className = 'footer';

  const dotsWrap = document.createElement('div');
  dotsWrap.className = 'dots';
  const dotEls = Array(0, 1, 2).map(() => {
    const d = document.createElement('div');
    d.className = 'dot';
    dotsWrap.appendChild(d);
    return d;
  });

  const actions = document.createElement('div');
  actions.className = 'actions';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn-secondary';
  backBtn.textContent = 'Back';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn-primary';

  actions.append(backBtn, nextBtn);
  footer.append(dotsWrap, actions);

  card.append(topBar, body, footer);
  backdrop.appendChild(card);
  shadow.append(styleEl, backdrop);
  document.body.appendChild(host);

  let step = 0;
  let connectedFolderName = '';
  let selectedDemoSkill = 'review-pr';

  loadDirectoryHandle().then((h) => {
    if (h) {
      connectedFolderName = h.name;
      if (step === 1) renderStep();
    }
  });

  const finishOnboarding = () => {
    try {
      chrome.storage?.local?.set({ [ONBOARDED_KEY]: true });
    } catch {}
    animate(backdrop, { opacity: 0 }, { duration: 0.16 });
    animate(card, { opacity: 0, scale: 0.96, y: 8 }, { duration: 0.16 }).finished.then(() => {
      host.remove();
      const input = document.querySelector<HTMLElement>('textarea, [contenteditable="true"]');
      input?.focus();
    });
  };

  const renderStep = () => {
    dotEls.forEach((d, idx) => d.classList.toggle('active', idx === step));
    backBtn.style.display = step === 0 ? 'none' : 'inline-block';
    nextBtn.textContent = step === 2 ? 'Start using Vexel' : 'Continue';

    body.replaceChildren();

    const pill = document.createElement('div');
    pill.className = 'step-pill';

    const title = document.createElement('h2');
    title.className = 'title';

    const desc = document.createElement('p');
    desc.className = 'desc';

    const sandbox = document.createElement('div');
    sandbox.className = 'sandbox';

    if (step === 0) {
      pill.textContent = 'Step 1 of 3 · Instant Prompts';
      title.textContent = 'Type / anywhere to summon reusable skills';
      desc.textContent =
        'Turn repetitive engineering prompts into one-keystroke slash commands—ready out of the box with zero setup.';

      const chips = document.createElement('div');
      chips.className = 'demo-chips';
      const previews: Record<string, string> = {
        'review-pr':
          'Injects a senior code review checklist: edge cases, async race conditions, security & minimal patches.',
        'explain-architecture':
          'Maps data flow, state boundaries, and bottlenecks in plain, structured diagrams.',
        'fix-bug':
          'Isolates root cause, reproduces failure mode, and writes a surgical regression test.',
      };

      Object.keys(previews).forEach((skillKey) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'demo-chip' + (selectedDemoSkill === skillKey ? ' selected' : '');
        chip.textContent = '/' + skillKey;
        chip.addEventListener('click', () => {
          selectedDemoSkill = skillKey;
          animate(chip, { scale: Array(0.95, 1) }, { duration: 0.16 });
          renderStep();
        });
        chips.appendChild(chip);
      });

      const previewBox = document.createElement('div');
previewBox.className = 'demo-preview';
previewBox.textContent = previews[selectedDemoSkill] || '';
sandbox.append(chips, previewBox);
} else if (step === 1) {
pill.textContent = 'Step 2 of 3 · Zero-Server Workspace';
title.textContent = 'Attach files & pack entire folders with @';
desc.textContent =
'Connect any local folder directly in Chrome—no terminal or background server needed. Pack codebases or write AI code blocks straight to disk.';
const folderBtn = document.createElement('button');
folderBtn.type = 'button';
folderBtn.className = 'folder-cta' + (connectedFolderName ? ' connected' : '');
folderBtn.append(
createLucideIcon(connectedFolderName ? 'check' : 'folder', 15, 'currentColor'),
document.createTextNode(
connectedFolderName
? 'Connected: ' + connectedFolderName + ' (click to switch)'
: 'Connect a Project Folder'
)
);
folderBtn.addEventListener('click', async () => {
animate(folderBtn, { scale: Array(0.97, 1) }, { duration: 0.18 });
const handle = await pickLocalFolder();
if (handle) {
connectedFolderName = handle.name;
showToast('Connected folder: ' + handle.name);
renderStep();
}
});
sandbox.appendChild(folderBtn);
} else {
pill.textContent = 'Step 3 of 3 · Flow & Speed';
title.textContent = 'Built for effortless keyboard flow';
desc.textContent =
'Every action is designed to stay out of your way until the exact millisecond you need it.';
const grid = document.createElement('div');
grid.className = 'shortcut-grid';
const items = [
{ kbd: '/', lbl: 'Insert prompt skill' },
{ kbd: '@', lbl: 'Attach file or Pack folder' },
{ kbd: 'Save to file', lbl: 'Hover any code block to write' },
{ kbd: 'Alt + ↓', lbl: 'Jump to last user prompt' },
];
items.forEach((it) => {
const sc = document.createElement('div');
sc.className = 'shortcut-card';
const k = document.createElement('span');
k.className = 'kbd';
k.textContent = it.kbd;
const l = document.createElement('span');
l.className = 'shortcut-lbl';
l.textContent = it.lbl;
sc.append(k, l);
grid.appendChild(sc);
});
sandbox.appendChild(grid);
}
body.append(pill, title, desc, sandbox);
animate(body, { opacity: Array(0, 1), y: Array(6, 0) }, { duration: 0.18 });
};
backBtn.addEventListener('click', () => {
if (step > 0) {
step--;
renderStep();
}
});
nextBtn.addEventListener('click', () => {
animate(nextBtn, { scale: Array(0.95, 1) }, { duration: 0.15 });
if (step < 2) {
step++;
renderStep();
} else {
finishOnboarding();
}
});
skipBtn.addEventListener('click', finishOnboarding);
backdrop.addEventListener('click', (e) => {
if (e.target === backdrop) finishOnboarding();
});
renderStep();
animate(backdrop, { opacity: Array(0, 1) }, { duration: 0.2 });
animate(
card,
{ opacity: Array(0, 1), scale: Array(0.94, 1), y: Array(12, 0) },
{ type: 'spring', stiffness: 460, damping: 32, mass: 0.75 }
);
}
export function initOnboarding(showToast: (msg: string) => void): void {
try {
chrome.storage?.local?.get([ONBOARDED_KEY], (res) => {
if (!res || !res[ONBOARDED_KEY]) {
window.setTimeout(() => openOnboardingModal(showToast), 650);
}
});
} catch {}
}
