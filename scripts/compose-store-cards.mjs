import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'docs/assets');

function pickBestSource(candidates) {
  for (const rel of candidates) {
    const full = path.join(ASSETS_DIR, rel);
    if (fs.existsSync(full) && fs.statSync(full).size > 30000) {
      return full;
    }
  }
  throw new Error('Aucune capture source valide trouvée parmi : ' + candidates.join(', '));
}

function toDataUri(filePath) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  return 'data:image/png;base64,' + b64;
}

const SLIDES = [
  {
    outName: 'store-01-slash-skills.png',
    badge: 'SLASH COMMANDS  •  /',
    title: 'Turn Google AI Mode into a Local Coding Workspace',
    subtitle: 'Summon reusable engineering skills and custom SKILL.md workflows in one keystroke.',
    accent: '#1967d2',
    pillBg: '#e8f0fe',
    pillBorder: '#c6dafc',
    sources: ['04-slash-skills-palette.png', '04-slash-skills-palette@2x.png'],
    cropTopPct: 14,
  },
  {
    outName: 'store-02-at-repo-context.png',
    badge: 'LOCAL REPO CONTEXT  •  @',
    title: 'Browse Files & Pack Folders with Zero Server',
    subtitle: 'Connect any local repository via Chrome File System Access API or optional localhost bridge.',
    accent: '#137333',
    pillBg: '#e6f4ea',
    pillBorder: '#ceead6',
    sources: ['06-at-files-workspace.png', '06-at-files-workspace@2x.png'],
    cropTopPct: 14,
  },
  {
    outName: 'store-03-save-to-file.png',
    badge: '1-CLICK DISK WRITE',
    title: 'Save Generated Code Blocks Straight to Disk',
    subtitle: 'Auto-infers target file paths from comments & language tags with folder autocomplete.',
    accent: '#1967d2',
    pillBg: '#e8f0fe',
    pillBorder: '#c6dafc',
    sources: ['07-code-save-popover@2x.png', '07-code-save-popover.png'],
    cropTopPct: 28,
  },
  {
    outName: 'store-04-paste-attachments.png',
    badge: 'SMART CLIPBOARD',
    title: 'Auto-Convert Huge Logs into Clean Attachments',
    subtitle: 'Paste multi-thousand-line stack traces without overflowing the prompt box.',
    accent: '#b06000',
    pillBg: '#fef7e0',
    pillBorder: '#fde293',
    sources: ['03-paste-to-file.png'],
    cropTopPct: 0,
  },
  {
    outName: 'store-05-fast-virtualization.png',
    badge: 'KEYBOARD-FIRST WORKFLOW',
    title: 'Instant Shortcuts, Timeline Rail & Markdown Export',
    subtitle: 'Navigate long sessions at zero lag with CSS content-visibility virtualization.',
    accent: '#1967d2',
    pillBg: '#e8f0fe',
    pillBorder: '#c6dafc',
    sources: ['01b-onboarding-shortcuts.png', '08-long-thread-fast.png'],
    cropTopPct: 16,
  },
];

function renderCardHtml(slide, imgUri) {
  const displayUrl = ['https', '://', 'www.', 'google.', 'com/search?udm=50'].join('');
  const imgStyle = slide.cropTopPct
    ? 'width: 100%; height: ' + (100 + slide.cropTopPct) + '%; margin-top: -' + (slide.cropTopPct * 0.85) + '%; object-fit: cover; object-position: top;'
    : 'width: 100%; height: 100%; object-fit: contain; object-position: center center;';

  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  width: 1280px; height: 800px; overflow: hidden;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;',
    '  background: radial-gradient(1100px 540px at 50% -10%, #e8f0fe 0%, transparent 65%), linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%); color: #1f1f1f;',
    '  display: flex; flex-direction: column; align-items: center;',
    '  padding: 14px 40px 0;',
    '}',
    '.header { text-align: center; max-width: 1060px; margin-bottom: 10px; }',
    '.pill {',
    '  display: inline-flex; align-items: center; gap: 7px;',
    '  padding: 4px 12px; border-radius: 999px;',
    '  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;',
    '  background: ' + slide.pillBg + ';',
    '  border: 1px solid ' + slide.pillBorder + ';',
    '  color: ' + slide.accent + ';',
    '  margin-bottom: 7px;',
    '}',
    '.dot { width: 6px; height: 6px; border-radius: 50%; background: ' + slide.accent + '; }',
    'h1 {',
    '  font-size: 30px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.12;',
    '  color: #1f1f1f; margin-bottom: 5px;',
    '}',
    '.sub {',
    '  font-size: 15px; font-weight: 450; color: #5f6368; line-height: 1.35;',
    '}',
    '.window {',
    '  width: 1059px; flex: 1;',
    '  background: #FFFFFF;',
    '  border-radius: 14px 14px 0 0;',
    '  border: 1px solid #dadce0;',
    '  border-bottom: none;',
    '  box-shadow: 0 20px 56px rgba(60, 64, 67, 0.14), 0 2px 8px rgba(60, 64, 67, 0.06);',
    '  overflow: hidden; display: flex; flex-direction: column;',
    '}',
    '.chrome-bar {',
    '  height: 28px; background: #F1F5F9; border-bottom: 1px solid #E2E8F0;',
    '  display: flex; align-items: center; padding: 0 14px; gap: 7px; flex-shrink: 0;',
    '}',
    '.tl { width: 10px; height: 10px; border-radius: 50%; }',
    '.tl-r { background: #FF5F56; } .tl-y { background: #FFBD2E; } .tl-g { background: #27C93F; }',
    '.url-pill {',
    '  margin: 0 auto; padding: 2px 16px; border-radius: 999px;',
    '  background: #FFFFFF; border: 1px solid #E2E8F0;',
    '  font-size: 11px; font-weight: 500; color: #475569;',
    '}',
    '.shot-wrap { width: 100%; flex: 1; min-height: 0; overflow: hidden; background: #FFFFFF; display: flex; align-items: center; justify-content: center; }',
    '.shot-wrap img { ' + imgStyle + ' display: block; }',
    '</style></head><body>',
    '<div class="header">',
    '  <div class="pill"><span class="dot"></span><span>' + slide.badge + '</span></div>',
    '  <h1>' + slide.title + '</h1>',
    '  <div class="sub">' + slide.subtitle + '</div>',
    '</div>',
    '<div class="window">',
    '  <div class="chrome-bar">',
    '    <span class="tl tl-r"></span><span class="tl tl-y"></span><span class="tl tl-g"></span>',
    '    <div class="url-pill">' + displayUrl + '  •  Vexel Workspace</div>',
    '  </div>',
    '  <div class="shot-wrap"><img src="' + imgUri + '" /></div>',
    '</div>',
    '</body></html>',
  ].join('\n');
}

function renderPromoTileHtml(width, height, iconUri, compact) {
  return [
    '<!doctype html><html><head><meta charset="utf-8"><style>',
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  width: ' + width + 'px; height: ' + height + 'px; overflow: hidden;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;',
    '  background: radial-gradient(circle at 82% 20%, #e8f0fe 0%, transparent 62%), linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); color: #1f1f1f;',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  padding: ' + (compact ? '26px 30px' : '48px 72px') + ';',
    '}',
    '.left { max-width: ' + (compact ? '280px' : '780px') + '; }',
    '.brand { display: flex; align-items: center; gap: ' + (compact ? '10px' : '16px') + '; margin-bottom: ' + (compact ? '12px' : '18px') + '; }',
    '.brand img { width: ' + (compact ? '36px' : '56px') + '; height: ' + (compact ? '36px' : '56px') + '; border-radius: 12px; }',
    '.brand span { font-size: ' + (compact ? '22px' : '34px') + '; font-weight: 800; letter-spacing: -0.02em; }',
    'h1 { font-size: ' + (compact ? '21px' : '46px') + '; font-weight: 800; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: ' + (compact ? '10px' : '16px') + '; }',
    '.tags { display: flex; flex-wrap: wrap; gap: 8px; }',
    '.tag {',
    '  padding: ' + (compact ? '4px 9px' : '7px 14px') + '; border-radius: 8px;',
    '  background: #e8f0fe; border: 1px solid #c6dafc;',
    '  font-size: ' + (compact ? '11px' : '15px') + '; font-weight: 600; color: #1967d2;',
    '}',
    '.right {',
    '  display: ' + (compact ? 'none' : 'flex') + '; flex-direction: column; gap: 12px;',
    '  background: #ffffff; border: 1px solid #dadce0;',
    '  border-radius: 16px; padding: 24px 28px; width: 420px;',
    '  box-shadow: 0 14px 36px rgba(60, 64, 67, 0.12), 0 2px 6px rgba(60, 64, 67, 0.05);',
    '}',
    '.cmd { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; color: #3c4043; }',
    '.cmd b { color: #1967d2; }',
    '</style></head><body>',
    '<div class="left">',
    '  <div class="brand"><img src="' + iconUri + '" /><span>Vexel</span></div>',
    '  <h1>Local Coding Workspace for Google AI Mode</h1>',
    '  <div class="tags">',
    '    <span class="tag">/ Skills</span>',
    '    <span class="tag">@ Repo Context</span>',
    '    <span class="tag">Save to file</span>',
    '    <span class="tag">Zero Telemetry</span>',
    '  </div>',
    '</div>',
    '<div class="right">',
    '  <div class="cmd"><b>/review-pr</b>  Senior code & security audit</div>',
    '  <div class="cmd"><b>@src/billing/</b>  Zero-server folder pack</div>',
    '  <div class="cmd"><b>Save to file</b>  1-click write to disk</div>',
    '</div>',
    '</body></html>',
  ].join('\n');
}

const browser = await chromium.launch({ headless: true });
try {
  for (const slide of SLIDES) {
    const srcPath = pickBestSource(slide.sources);
    const imgUri = toDataUri(srcPath);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await page.setContent(renderCardHtml(slide, imgUri), { waitUntil: 'load' });
    const outPath = path.join(ASSETS_DIR, slide.outName);
    await page.screenshot({ path: outPath });
    await page.close();
    console.log('✓ Generated 1280x800 Store Card:', slide.outName);
  }

  const iconUri = toDataUri(path.join(ROOT, 'packages/extension/public/icons/icon-128.png'));

  const smallPage = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await smallPage.setContent(renderPromoTileHtml(440, 280, iconUri, true), { waitUntil: 'load' });
  await smallPage.screenshot({ path: path.join(ASSETS_DIR, 'store-promo-small-440x280.png') });
  await smallPage.close();

const marqueePage = await browser.newPage({ viewport: { width: 1400, height: 560 }, deviceScaleFactor: 1 });
await marqueePage.setContent(renderPromoTileHtml(1400, 560, iconUri, false), { waitUntil: 'load' });
await marqueePage.screenshot({ path: path.join(ASSETS_DIR, 'store-promo-marquee-1400x560.png') });
await marqueePage.close();
} finally {
await browser.close();
}
