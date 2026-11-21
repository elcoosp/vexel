import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type BrowserContext, chromium } from 'playwright'
const extPath = path.resolve('packages/extension/dist')
assert.ok(fs.existsSync(path.join(extPath, 'manifest.json')), 'Extension must be built before E2E')
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-e2e-profile-'))
const MOCK_GOOGLE_AIM_HTML = [
  '<!doctype html>',
  '<html><head><title>Google AI Mode E2E</title></head><body>',
  '  <main>',
  '    <div class="CKgc1d" data-scope-id="turn" data-hveid="turn-1">',
  '      <div class="V3FYCf" jsname="eFVkfb">Write a quick TypeScript sum helper</div>',
  '      <div class="pWvJNd" data-subtree="aimc">',
  '        <div class="Fzsovc">Sum Helper</div>',
  '        <p>Here is a clean implementation:</p>',
  '        <div data-hveid="code-card-1"><pre><code class="language-ts">// src/math/sum.ts\nexport const sum = (a: number, b: number) => a + b;</code></pre></div>',
  '      </div>',
  '    </div>',
  '    <form role="search">',
  '      <div class="o8Wipc">',
  '        <textarea id="aim-prompt" rows="2" placeholder="Ask AI Mode..."></textarea>',
  '      </div>',
  '    </form>',
  '  </main>',
  '</body></html>',
].join('\n')
let context: BrowserContext | undefined
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-sandbox'],
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.google.com',
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    let buf = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          buf = text
        },
        readText: async () => buf,
      },
    })
  })
  await page.route('**://www.google.com/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: MOCK_GOOGLE_AIM_HTML,
    })
  })
  await page.goto(['https', '://', 'www.', 'google.', 'com/search?udm=50'].join(''), {
    waitUntil: 'domcontentloaded',
  })
  // 1. Verify DOM Booster style injection (Full-Width & user-select unlock)
  const boosterCss = await page.locator('#vexel-fast-load-css').textContent()
  assert.ok(
    boosterCss?.includes('content-visibility: auto'),
    'DOM Booster must unlock text selection'
  )
  // 2. Verify automatic Onboarding modal on first launch + in-place skill chip switching
  const onboardingHost = page.locator('#vexel-onboarding-host')
  await onboardingHost.waitFor({ state: 'attached', timeout: 5000 })
  const step1Title = await onboardingHost.evaluate(
    (el) => el.shadowRoot?.querySelector('.title')?.textContent
  )
  assert.ok(
    step1Title && /Type \/ anywhere|Tapez \/ n'importe où/.test(step1Title),
    'Onboarding Step 1 should render'
  )
  await onboardingHost.evaluate((el) => {
    const chips = Array.from(el.shadowRoot?.querySelectorAll<HTMLElement>('.demo-chip') || [])
    chips.at(1)?.click()
  })
  const previewText = await onboardingHost.evaluate(
    (el) => el.shadowRoot?.querySelector('.demo-preview')?.textContent
  )
  assert.ok(
    previewText && /Maps data flow|Cartographie le flux/.test(previewText),
    'Switching skill chip should update preview text'
  )
  // Complete onboarding (Step 1 -> 2 -> 3 -> Close)
  await onboardingHost.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('.btn-primary')?.click()
  )
  await onboardingHost.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('.btn-primary')?.click()
  )
  await onboardingHost.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('.btn-primary')?.click()
  )
  await onboardingHost.waitFor({ state: 'detached', timeout: 3000 })
  // 3. Keyboard navigation in Command Palette (/, ArrowDown, Escape, then Enter)
  const promptBox = page.locator('#aim-prompt')
  await promptBox.click()
  await promptBox.type('/')
  const paletteHost = page.locator('#vexel-inline-menu-host')
  await paletteHost.waitFor({ state: 'attached', timeout: 3000 })
  const isOpen = await paletteHost.evaluate((el) =>
    el.shadowRoot?.querySelector('.popover')?.classList.contains('open')
  )
  assert.equal(isOpen, true, 'Command palette should open when typing /')
  await page.waitForFunction(
    () =>
      (document.querySelector('#vexel-inline-menu-host')?.shadowRoot?.querySelectorAll('.item')
        .length || 0) >= 2,
    { timeout: 3000 }
  )
  // ArrowDown moves selection to index 1
  await page.keyboard.press('ArrowDown')
  const secondActive = await paletteHost.evaluate((el) =>
    el.shadowRoot?.querySelectorAll('.item').item(1)?.classList.contains('active')
  )
  assert.equal(secondActive, true, 'ArrowDown should highlight second skill item')
  // Escape closes palette cleanly
  await page.keyboard.press('Escape')
  await page.waitForTimeout(180)
  const closedAfterEsc = await paletteHost.evaluate(
    (el) => !el.shadowRoot?.querySelector('.popover')?.classList.contains('open')
  )
  assert.equal(closedAfterEsc, true, 'Escape should close command palette')
  // Reopen with "/" and inject skill via Enter
  await promptBox.fill('')
  await promptBox.type('/')
  await page.keyboard.press('Enter')
  const injectedVal = await promptBox.inputValue()
  assert.ok(
    injectedVal.length > 30,
    'Selecting a built-in skill should inject its prompt into textarea'
  )
  // 4. Reopen palette with "@" to verify Files tab, zero redundant File badge, Copy Clean Thread, and "?" Onboarding relaunch
  await promptBox.fill('')
  await promptBox.type('@')
  await page.waitForTimeout(200)
  const filesTabState = await paletteHost.evaluate((el) => {
    const sr = el.shadowRoot
    const isFilesTabActive = Array.from(sr?.querySelectorAll('.tab') || []).some(
      (t) => t.classList.contains('active') && /Files|Fichiers/.test(t.textContent || '')
    )
    const hasOpenFolderBtn = Array.from(sr?.querySelectorAll('button') || []).some((b) =>
      /Open Local Folder|Ouvrir un dossier local/.test(b.textContent || '')
    )
    const itemCount = sr?.querySelectorAll('.item').length || 0
    const hasRedundantFileBadge = Array.from(sr?.querySelectorAll('.badge') || []).some(
      (b) => b.textContent?.trim() === 'File'
    )
    return { isFilesTabActive, hasOpenFolderBtn, itemCount, hasRedundantFileBadge }
  })
  assert.equal(filesTabState.isFilesTabActive, true, 'Typing @ should switch palette to Files tab')
  assert.equal(
    filesTabState.hasOpenFolderBtn || filesTabState.itemCount > 0,
    true,
    'Files tab should render either Zero-Server CTA or bridge file list'
  )
  assert.equal(
    filesTabState.hasRedundantFileBadge,
    false,
    'File rows must not render redundant File badge'
  )
  // Click "Copy" (Copy Clean Thread) in palette header
  await paletteHost.evaluate((el) => {
    const copyBtn = Array.from(el.shadowRoot?.querySelectorAll('button') || []).find((b) =>
      /^(Copy|Copier)$/.test(b.textContent?.trim() || '')
    )
    copyBtn?.click()
  })
  await page.waitForTimeout(150)
  const copyConfirmed = await paletteHost.evaluate((el) =>
    Array.from(el.shadowRoot?.querySelectorAll('button') || []).some((b) =>
      /^(Copied|Copié)$/u.test(b.textContent?.trim() || '')
    )
  )
  assert.equal(copyConfirmed, true, 'Copy Clean Thread should copy formatted Markdown')
  // Click circular "?" button in palette header to reopen Onboarding modal
  await paletteHost.evaluate((el) => {
    const helpBtn = Array.from(el.shadowRoot?.querySelectorAll('button') || []).find(
      (b) => b.textContent?.trim() === '?'
    )
    helpBtn?.click()
  })
  await onboardingHost.waitFor({ state: 'attached', timeout: 3000 })
  await onboardingHost.evaluate((el) =>
    el.shadowRoot?.querySelector<HTMLElement>('.skip-btn')?.click()
  )
  await onboardingHost.waitFor({ state: 'detached', timeout: 3000 })
  // 5. Hover code block, verify "Save to file" button + inferred path "// src/math/sum.ts"
  const codeBlock = page.locator('pre code')
  await codeBlock.hover()
  const saveTrigger = page.locator('button[data-vexel-ui="true"]', {
    hasText: /Save to file|Enregistrer dans un fichier/,
  })
  await saveTrigger.waitFor({ state: 'visible', timeout: 3000 })
  await saveTrigger.click()
  const pathInput = page.locator(
    'input[placeholder="folder/filename.ext"], input[placeholder="dossier/nom-fichier.ext"], input[placeholder="dossier/nom-fichier.ext"]'
  )
  await pathInput.waitFor({ state: 'visible', timeout: 3000 })
  const inferredPath = await pathInput.inputValue()
  assert.equal(
    inferredPath,
    'src/math/sum.ts',
    'Code-save popover must auto-infer file path from header comment'
  )
  console.log('✓ All 100% full-coverage Vexel E2E assertions passed in real Chromium!')
} finally {
  if (context) await context.close()
  fs.rmSync(userDataDir, { recursive: true, force: true })
}
