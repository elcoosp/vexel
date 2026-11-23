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
    await ob.waitFor({ state: 'hidden', timeout: 10000 })
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
  await ob.waitFor({ state: 'hidden', timeout: 10000 })

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

  logStep(
    'Stage 5: Mocked Google AI Mode multi-language truncated repair & native formatter matrix'
  )
  const strictFormatters = process.env.VEXEL_E2E_STRICT_FORMATTERS === '1'
  const NL = String.fromCharCode(10)
  const formatterCases = [
    {
      lang: 'typescript',
      expectedEngines: ['oxfmt', 'biome'],
      head: [
        'export function computeInvoiceTotal(items: Array<{ price: number; qty: number }>) {',
        '  const subtotal = items.reduce((acc, item) => acc + item.price * item.qty, 0)',
      ].join(NL),
      spill: ['return Math.round(subtotal * 100) / 100', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('export function computeInvoiceTotal(') &&
        txt.includes('return Math.round(subtotal * 100) / 100') &&
        txt.trim().endsWith('}'),
    },
    {
      lang: 'python',
      expectedEngines: ['ruff'],
      head: ['def audit_ledger(rows: list[dict[str, float]]) -> float:', '    if not rows:'].join(
        NL
      ),
      spill: [
        '        return 0.0',
        '    total = sum(r["amount"] for r in rows)',
        '    assert total >= 0',
        '    return total',
      ].join(NL),
      assertShape: (txt: string) =>
        txt.includes('def audit_ledger(') &&
        txt.includes('assert total >= 0') &&
        txt.trim().endsWith('return total'),
    },
    {
      lang: 'rust',
      expectedEngines: ['rustfmt'],
      head: [
        'pub fn normalize_code(input: &str) -> String {',
        '    let trimmed = input.trim();',
      ].join(NL),
      spill: ['    trimmed.to_uppercase()', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('pub fn normalize_code(input: &str) -> String {') &&
        txt.includes('trimmed.to_uppercase()') &&
        txt.trim().endsWith('}'),
    },
    {
      lang: 'go',
      expectedEngines: ['gofmt'],
      head: ['package main', 'func sumSlice(nums []int) int {', '\ttotal := 0'].join(NL),
      spill: ['\tfor _, n := range nums { total += n }', '\treturn total', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('package main') &&
        txt.includes('func sumSlice(nums []int) int {') &&
        txt.trim().endsWith('}'),
    },
    {
      lang: 'bash',
      expectedEngines: ['shfmt'],
      head: ['#!/usr/bin/env bash', 'deploy() {', '  set -euo pipefail'].join(NL),
      spill: ['  echo "target-ready"', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('#!/usr/bin/env bash') &&
        txt.includes('echo "target-ready"') &&
        txt.trim().endsWith('}'),
    },
    {
      lang: 'sql',
      expectedEngines: ['sleek', 'pg_format'],
      head: ['BEGIN;', 'SELECT company_name, total_eur FROM invoices WHERE meta = {'].join(NL),
      spill: ['  "paid": true', '}', 'ORDER BY total_eur DESC;', 'COMMIT;'].join(NL),
      assertShape: (txt: string) =>
        /SELECT/i.test(txt) && /ORDER BY/i.test(txt) && txt.trim().endsWith('COMMIT;'),
    },
    {
      lang: 'toml',
      expectedEngines: ['taplo'],
      head: [
        '[package]',
        'name = "vexel-demo"',
        '[dependencies.serde]',
        'version = "1.0"',
        'features = [',
        '  "serde",',
      ].join(NL),
      spill: ['  "tokio",', ']'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('[package]') &&
        txt.includes('[dependencies.serde]') &&
        txt.includes('"tokio"') &&
        txt.trim().endsWith(']'),
    },
    {
      lang: 'cpp',
      expectedEngines: ['clang-format'],
      head: [
        '#include <vector>',
        'int accumulate_vec(const std::vector<int>& v) {',
        '  int s = 0;',
      ].join(NL),
      spill: ['  for (int x : v) s += x;', '  return s;', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('int accumulate_vec(') &&
        txt.includes('return s;') &&
        txt.trim().endsWith('}'),
    },
    {
      lang: 'terraform',
      expectedEngines: ['tofu', 'terraform'],
      head: ['resource "aws_s3_bucket" "audit" {', '  bucket = "vexel-audit-logs"'].join(NL),
      spill: ['  force_destroy = false', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('resource "aws_s3_bucket" "audit"') &&
        txt.includes('force_destroy = false') &&
        txt.trim().endsWith('}'),
    },
    {
      lang: 'lua',
      expectedEngines: ['stylua'],
      head: ['local cfg = {', '  enabled = true,'].join(NL),
      spill: ['  retries = 3,', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('local cfg = {') && txt.includes('retries = 3') && txt.trim().endsWith('}'),
    },
    {
      lang: 'zig',
      expectedEngines: ['zig'],
      head: ['pub fn add(a: i32, b: i32) i32 {', '    const res = a + b;'].join(NL),
      spill: ['    return res;', '}'].join(NL),
      assertShape: (txt: string) =>
        txt.includes('pub fn add(a: i32, b: i32) i32 {') && txt.trim().endsWith('}'),
    },
    {
      lang: 'nix',
      expectedEngines: ['alejandra', 'nixfmt'],
      head: ['{ pkgs ? import <nixpkgs> {} }:', 'pkgs.mkShell {', '  packages = ['].join(NL),
      spill: ['    pkgs.nodejs_22', '  ];', '}'].join(NL),
      assertShape: (txt: string) => txt.includes('pkgs.mkShell') && txt.trim().endsWith('}'),
    },
    {
      lang: 'ruby',
      expectedEngines: ['standardrb', 'rubocop'],
      head: ['def format_price(cents)', '  opts = {'].join(NL),
      spill: [
        '    currency: "EUR",',
        '    amount: cents / 100.0',
        '  }',
        '  format("$%.2f", opts[:amount])',
        'end',
      ].join(NL),
      assertShape: (txt: string) =>
        txt.includes('def format_price(cents)') && txt.trim().endsWith('end'),
    },
  ]

  for (const tc of formatterCases) {
    const turnId = `turn-fmt-${tc.lang}`
    await page.evaluate(
      ({ turnId, lang, head, spill }) => {
        const main = document.querySelector('main')!
        const turn = document.createElement('div')
        turn.className = 'CKgc1d'
        turn.setAttribute('data-scope-id', 'turn')
        turn.setAttribute('data-hveid', turnId)
        turn.setAttribute('data-complete', 'true')

        const aimc = document.createElement('div')
        aimc.className = 'pWvJNd'
        aimc.setAttribute('data-subtree', 'aimc')

        const card = document.createElement('div')
        card.className = 'BpxUDf aiModeUiCodeBlock__Container'
        card.setAttribute('data-hveid', `card-${turnId}`)
        const header = document.createElement('div')
        header.className = 'GlO4G'
        header.textContent = lang
        const pre = document.createElement('pre')
        const code = document.createElement('code')
        code.textContent = head
        pre.appendChild(code)
        const footer = document.createElement('div')
        const btnWrap = document.createElement('div')
        const copyBtn = document.createElement('button')
        copyBtn.type = 'button'
        copyBtn.setAttribute('aria-label', 'Copy code')
        btnWrap.appendChild(copyBtn)
        footer.appendChild(btnWrap)
        card.append(header, pre, footer)

        const sib = document.createElement('div')
        sib.className = 'n6owBd awi2gc spilled-e2e'
        sib.setAttribute('data-sfc-cp', '')
        sib.innerHTML = spill.split(String.fromCharCode(10)).join('<br>')

        aimc.append(card, sib)
        turn.appendChild(aimc)
        main.appendChild(turn)
      },
      { turnId, lang: tc.lang, head: tc.head, spill: tc.spill }
    )

    const turnLoc = page.locator(`[data-hveid="${turnId}"]`)
    await turnLoc.locator('.spilled-e2e').waitFor({ state: 'hidden', timeout: 6000 })
    const badge = turnLoc.locator('[data-vexel-format-badge="true"]')
    await badge.waitFor({ state: 'attached', timeout: 6000 })
    if (strictFormatters) {
      await page.waitForFunction(
        (id) => {
          const el = document.querySelector(`[data-hveid="${id}"] [data-vexel-format-badge="true"]`)
          const txt =
            el?.shadowRoot?.querySelector('[data-vexel-pill-label="true"]')?.textContent ||
            el?.textContent ||
            ''
          return txt.length > 0 && !txt.includes(' · local · ')
        },
        turnId,
        { timeout: 6000 }
      )
    } else {
      await page.waitForTimeout(350)
    }
    const badgeText = await badge.evaluate(
      (el) =>
        el.shadowRoot?.querySelector('[data-vexel-pill-label="true"]')?.textContent ||
        el.textContent ||
        ''
    )
    const codeText = (await turnLoc.locator('pre code').textContent()) || ''

    assert.ok(
      tc.assertShape(codeText),
      `[${tc.lang}] Formatted output failed shape assertion. Badge="${badgeText}" Code:` +
        NL +
        codeText
    )
    if (strictFormatters) {
      assert.ok(
        tc.expectedEngines.some((eng) => badgeText.includes(eng)),
        `[${tc.lang}] Expected one of native engines ${JSON.stringify(tc.expectedEngines)} in CI badge, got: "${badgeText}"`
      )
    }
    logStep(`  ✓ [${tc.lang}] badge="${badgeText.trim()}"`)
  }

  console.log(
    '✓ All full-pyramid Vexel E2E assertions (including real disk write, paste-to-file & .md export) passed!'
  )
} finally {
  await context?.close().catch(() => {})
  bridgeProc?.kill('SIGTERM')
  fs.rmSync(userDataDir, { recursive: true, force: true })
  fs.rmSync(workspaceDir, { recursive: true, force: true })
}
