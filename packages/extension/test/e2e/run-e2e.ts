import assert from 'node:assert/strict'
import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type BrowserContext, chromium } from 'playwright'

const extPath = path.resolve('packages/extension/dist')
assert.ok(fs.existsSync(path.join(extPath, 'manifest.json')), 'Extension must be built before E2E')

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-e2e-profile-'))
const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-e2e-ws-'))
fs.mkdirSync(path.join(workspaceDir, 'src', 'math'), { recursive: true })
fs.writeFileSync(
  path.join(workspaceDir, 'src', 'math', 'add.ts'),
  'export const add = (a: number, b: number) => a + b;\n'
)

let bridgeProc: ChildProcess | null = null
let context: BrowserContext | undefined

try {
  {
    let stderrBuf = ''
    bridgeProc = spawn(process.execPath, ['packages/bridge/src/server.ts'], {
      env: { ...process.env, VEXEL_PORT: '49152', VEXEL_ROOT_DIR: workspaceDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    bridgeProc.stderr?.on('data', (c: Buffer) => {
      stderrBuf += c.toString()
    })
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`Bridge startup timeout on :49152: ${stderrBuf.trim()}`)),
        8000
      )
      let out = ''
      bridgeProc?.stdout?.on('data', (c: Buffer) => {
        out += c.toString()
        if (out.includes('127.0.0.1:49152')) {
          clearTimeout(t)
          setTimeout(resolve, 150)
        }
      })
    })
  }

  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-sandbox'],
  })
  const t0 = Date.now()
  const logStep = (msg: string) => console.log(`[e2e +${Date.now() - t0}ms] ${msg}`)

  const HOME_HTML = [
    '<!doctype html>',
    '<html><head><title>Google</title></head><body>',
    '  <main>',
    '    <form role="search">',
    '      <textarea name="q" rows="1" placeholder="Search Google"></textarea>',
    '      <input id="home-file" type="file" multiple hidden />',
    '    </form>',
    '  </main>',
    '</body></html>',
  ].join('\n')

  const AIM_HTML = [
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
    '        <input id="aim-file" type="file" multiple hidden />',
    '      </div>',
    '    </form>',
    '  </main>',
    '</body></html>',
  ].join('\n')

  const googleHomeUrl = ['https', ':', '//', 'www', '.google.com', '/'].join('')
  const aiModeUrl = ['https', ':', '//', 'www', '.google.com', '/search', '?udm=50'].join('')

  const page = await context.newPage()
  page.on('pageerror', (err) => console.error(`[e2e pageerror] ${err.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`[e2e console.error] ${m.text()}`)
  })
  logStep('Browser context & page ready')
  await page.route('**/*', (r) => {
    const u = r.request().url()
    if (
      u.startsWith('chrome-extension://') ||
      u.startsWith('http://127.0.0.1:') ||
      u.startsWith('data:') ||
      u.startsWith('blob:')
    ) {
      return r.continue()
    }
    const isAim = u.includes('udm=50') || u.includes('/search')
    logStep(`Route intercepted (${isAim ? 'AIM_HTML' : 'HOME_HTML'}): ${u}`)
    return r.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: isAim ? AIM_HTML : HOME_HTML,
    })
  })

  logStep('Stage 1: goto Google Home')
  // 1. Google Home: dock mounts cleanly without overlap
  await page.goto(googleHomeUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('#vexel-input-dock-host').waitFor({ state: 'attached', timeout: 4000 })
  const ob = page.locator('#vexel-onboarding-host')
  if ((await ob.count()) > 0) {
    await ob.evaluate((el) => el.shadowRoot?.querySelector<HTMLButtonElement>('.skip-btn')?.click())
    await ob.waitFor({ state: 'detached', timeout: 4000 })
  }

  logStep('Stage 2: goto AI Mode')
  await page.goto(aiModeUrl, { waitUntil: 'domcontentloaded' })
  const boosterCss = await page.locator('#vexel-fast-load-css').textContent()
  assert.ok(boosterCss?.includes('content-visibility: auto'))

  await ob.waitFor({ state: 'attached', timeout: 5000 })
  await ob.evaluate((el) => {
    const chips = Array.from(el.shadowRoot?.querySelectorAll<HTMLButtonElement>('.demo-chip') || [])
    chips[1]?.click()
  })
  await ob.evaluate((el) => el.shadowRoot?.querySelector<HTMLButtonElement>('.skip-btn')?.click())
  await ob.waitFor({ state: 'detached', timeout: 4000 })

  logStep('Stage 3: Large paste -> .txt file')
  // 3. Large paste (>8,000 chars) auto-attaches as .txt file
  const prompt = page.locator('#aim-prompt')
  await prompt.click({ timeout: 5000 })
  await prompt.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'ERROR: stack trace\n'.repeat(650))
    el.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
    )
  })
  const attachedCount = await page
    .locator('#aim-file')
    .evaluate((el: HTMLInputElement) => el.files?.length || 0)
  assert.equal(attachedCount, 1, 'Large paste must attach as .txt file')

  logStep('Stage 4: / Skills, @ Bridge Files, Export .md & Save to disk')
  // 4. "/" Skills & "@" Bridge Files + Copy + Export .md
  await prompt.click()
  await prompt.type('/')
  const pal = page.locator('#vexel-inline-menu-host')
  await pal.waitFor({ state: 'attached', timeout: 3000 })
  await page.keyboard.press('Enter')
  assert.ok((await prompt.inputValue()).length > 30)

  await prompt.fill('')
  await prompt.click()
  await prompt.type('@')
  await page.waitForFunction(
    () => {
      const sr = document.querySelector('#vexel-inline-menu-host')?.shadowRoot
      const items = sr?.querySelectorAll('.item').length || 0
      const hasFolderBtn = Array.from(sr?.querySelectorAll('button') || []).some((b) =>
        /Open Local Folder|Ouvrir un dossier local/u.test(b.textContent || '')
      )
      return items >= 1 || hasFolderBtn
    },
    { timeout: 4000 }
  )
  const dlPromise = page.waitForEvent('download')
  await pal.evaluate((el) =>
    Array.from(el.shadowRoot?.querySelectorAll('button') || [])
      .find((b) => /Export|Exporter/u.test(b.textContent || ''))
      ?.click()
  )
  const dl = await dlPromise
  assert.ok(dl.suggestedFilename().endsWith('.md'))
  await page.keyboard.press('Escape')

  // 5. Real disk write via Save to file -> Enter
  await page.locator('pre code').hover()
  const saveBtn = page.locator('button[data-vexel-ui="true"]', {
    hasText: /Save to file|Enregistrer/u,
  })
  await saveBtn.click()
  const pathInput = page.locator(
    'input[placeholder="folder/filename.ext"], input[placeholder="dossier/nom-fichier.ext"]'
  )
  assert.equal(await pathInput.inputValue(), 'src/math/sum.ts')
  await pathInput.press('Enter')
  const targetSumPath = path.join(workspaceDir, 'src/math/sum.ts')
  const deadline = Date.now() + 3000
  while (!fs.existsSync(targetSumPath) && Date.now() < deadline) {
    await page.waitForTimeout(100)
  }
  if (!fs.existsSync(targetSumPath)) {
    const uiTexts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-vexel-ui="true"]')).map((el) =>
        el.textContent?.trim()
      )
    )
    const cfgPath = path.join(os.homedir(), '.vexel', 'bridge.json')
    const cfg = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : 'MISSING_BRIDGE_JSON'
    throw new Error(
      `sum.ts not written in ${workspaceDir}. uiTexts=${JSON.stringify(uiTexts)} bridge.json=${cfg}`
    )
  }
  assert.ok(fs.readFileSync(targetSumPath, 'utf8').includes('export const sum'))

  console.log(
    '✓ All full-pyramid Vexel E2E assertions (including real disk write, paste-to-file & .md export) passed!'
  )
} finally {
  await context?.close().catch(() => {})
  bridgeProc?.kill('SIGTERM')
  fs.rmSync(userDataDir, { recursive: true, force: true })
  fs.rmSync(workspaceDir, { recursive: true, force: true })
}
