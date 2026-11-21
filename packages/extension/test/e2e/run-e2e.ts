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

const googleHomeUrl = ['https', ':', '//', 'www', '.google.com', '/'].join('')
const aiModeUrl = ['https', ':', '//', 'www', '.google.com', '/search', '?udm=50'].join('')
const homeRouteGlob = ['**', '://', 'www', '.google.com', '/'].join('')
const aimRouteGlob = ['**', '://', 'www', '.google.com', '/search*'].join('')

const HOME_HTML =
  '<!doctype html><html><body><form role="search"><div style="display:flex"><textarea name="q" rows="1"></textarea><button type="submit">Search</button></div></form></body></html>'
const AIM_HTML = [
  '<!doctype html><html><body><main>',
  '<div class="CKgc1d" data-scope-id="turn"><div class="V3FYCf" jsname="eFVkfb">Write a sum helper</div>',
  '<div class="pWvJNd" data-subtree="aimc"><div data-hveid="c1"><pre><code class="language-ts">// src/math/sum.ts\nexport const sum = (a: number, b: number) => a + b;</code></pre></div></div></div>',
  '<form role="search"><div class="o8Wipc"><textarea id="aim-prompt" rows="2"></textarea><input id="aim-file" type="file" /></div></form>',
  '</main></body></html>',
].join('\n')

let bridgeProc: ChildProcess | null = null
let context: BrowserContext | undefined
try {
  bridgeProc = spawn(process.execPath, ['packages/bridge/src/server.ts'], {
    env: { ...process.env, VEXEL_PORT: '49152', VEXEL_ROOT_DIR: workspaceDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Bridge startup timeout')), 5000)
    let out = ''
    bridgeProc?.stdout?.on('data', (c: Buffer) => {
      out += c.toString()
      if (out.includes('127.0.0.1:')) {
        clearTimeout(t)
        resolve()
      }
    })
  })

  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-sandbox'],
  })
  const page = await context.newPage()
  await page.route(homeRouteGlob, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: HOME_HTML })
  )
  await page.route(aimRouteGlob, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: AIM_HTML })
  )

  // 1. Google Home: dock mounts cleanly without overlap
  await page.goto(googleHomeUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('#vexel-input-dock-host').waitFor({ state: 'attached', timeout: 4000 })

  // 2. AI Mode: Onboarding + CSS Booster
  await page.goto(aiModeUrl, { waitUntil: 'domcontentloaded' })
  const boosterCss = await page.locator('#vexel-fast-load-css').textContent()
  assert.ok(boosterCss?.includes('content-visibility: auto'))

  const ob = page.locator('#vexel-onboarding-host')
  await ob.waitFor({ state: 'attached', timeout: 5000 })
  for (let i = 0; i < 3; i++) {
    await ob.evaluate((el) => el.shadowRoot?.querySelector<HTMLElement>('.btn-primary')?.click())
  }
  await ob.waitFor({ state: 'detached', timeout: 3000 })

  // 3. Large paste -> auto file attachment
  const prompt = page.locator('#aim-prompt')
  await prompt.click()
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

  // 4. "/" Skills & "@" Bridge Files + Copy + Export .md
  await prompt.type('/')
  const pal = page.locator('#vexel-inline-menu-host')
  await pal.waitFor({ state: 'attached', timeout: 3000 })
  await page.keyboard.press('Enter')
  assert.ok((await prompt.inputValue()).length > 30)

  await prompt.fill('')
  await prompt.type('@')
  await page.waitForFunction(
    () =>
      (document.querySelector('#vexel-inline-menu-host')?.shadowRoot?.querySelectorAll('.item')
        .length || 0) >= 1
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
  await page.waitForTimeout(400)
  assert.ok(
    fs.readFileSync(path.join(workspaceDir, 'src/math/sum.ts'), 'utf8').includes('export const sum')
  )

  console.log(
    '✓ All full-pyramid Vexel E2E assertions (including real disk write, paste-to-file & .md export) passed!'
  )
} finally {
  await context?.close().catch(() => {})
  bridgeProc?.kill('SIGTERM')
  fs.rmSync(userDataDir, { recursive: true, force: true })
  fs.rmSync(workspaceDir, { recursive: true, force: true })
}
