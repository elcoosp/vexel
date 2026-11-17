import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = path.resolve('docs/assets');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const defaultContext = browser.contexts().at(0);
const page = await defaultContext.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto('https://google.com', {
  waitUntil: 'domcontentloaded',
});

await page.waitForTimeout(1500);
console.log('Current URL:', page.url());

// Ferme le bandeau de cookies Google (France / UE)
for (const label of ['Tout refuser', 'Tout accepter', 'Reject all', 'Accept all']) {
  const btn = page.getByRole('button', { name: label }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1500);
    break;
  }
}

// Vérifie si l'extension Vexel est chargée dans ce profil Chrome
const hasVexel = await page.locator('#vexel-inline-menu-host').count();
if (hasVexel === 0) {
  console.log('⚠ L’extension Vexel n’est pas encore chargée dans ce profil Chrome (chrome://extensions -> Charger l’extension non empaquetée -> packages/extension/dist).');
  await page.screenshot({ path: path.join(outDir, 'debug-page.png') });
  await page.close();
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(4500);

// 1. Vue d'ensemble Google AI Mode + Vexel
await page.screenshot({ path: path.join(outDir, '01-google-aim-overview.png') });
console.log('✓ 01-google-aim-overview.png');

// 2. Ouverture de la palette "/" (Skills)
const promptBox = page.locator('textarea[name="q"], textarea[aria-label], [contenteditable="true"]').last();
await promptBox.click();
await promptBox.pressSequentially('/', { delay: 90 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '02-slash-skills-palette.png') });
console.log('✓ 02-slash-skills-palette.png');

// 3. Bascule sur l'onglet "@" (Fichiers / Dossier)
await page.keyboard.press('Backspace');
await promptBox.pressSequentially('@', { delay: 90 });
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '03-at-files-workspace.png') });
console.log('✓ 03-at-files-workspace.png');
await page.keyboard.press('Escape');
await page.waitForTimeout(350);

// 4. Survol d'un bloc de code -> bouton "Save to file" + popover
const codeBlock = page.locator('pre code').first();
if (await codeBlock.count() > 0) {
  await codeBlock.scrollIntoViewIfNeeded();
  await codeBlock.hover();
  await page.waitForTimeout(450);
  const saveTrigger = page.locator('button[data-vexel-ui="true"]', { hasText: 'Save to file' }).first();
  if (await saveTrigger.isVisible().catch(() => false)) {
    await saveTrigger.click();
    await page.waitForTimeout(450);
  }
  await page.screenshot({ path: path.join(outDir, '04-code-save-popover.png') });
  console.log('✓ 04-code-save-popover.png');
}

try {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-framerate', '0.75',
      '-pattern_type', 'glob',
      '-i', path.join(outDir, '0*.png'),
      '-vf', 'scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      path.join(outDir, 'vexel-demo.gif'),
    ],
    { stdio: 'ignore' }
  );
  console.log('✓ docs/assets/vexel-demo.gif généré !');
} catch {
  console.log('ℹ ffmpeg absent — 4 PNG 1280x800 prêts dans docs/assets/');
}

await page.close();
await browser.close();
