#!/usr/bin/env node
/**
 * Vexel — LIVE marketing capture, v5.
 *
 *   pnpm marketing:assets
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  chromium,
  type Frame,
  type Locator,
  type Page,
} from 'playwright'

interface GovernorState {
  runs: number[]
  queries: number[]
  blockedAt: number
}

interface RecorderState {
  last: Buffer | null
  lastAt: number
  timer: ReturnType<typeof setInterval> | null
  freeze: boolean
  speed: number
  tick: number
}

interface SceneEntry {
  name: string
  caption: string
  start: number
  end?: number
  seconds?: number
}

interface ShotOptions {
  settle?: number
  hiRes?: boolean
  full?: boolean
  hold?: number
}

interface CdpVersionInfo {
  Browser?: string
}

interface ConsentTarget {
  scope: Page | Frame
  btn?: Locator
}

const ROOT = process.cwd()
const CONFIG = {
  repo: '://github.com',
  queries: {
    ask: 'Show a minimal TypeScript retry helper with exponential backoff for a Stripe webhook handler. Answer in under 120 words.',
    paste:
      'The attached CI log is huge. What is the root cause of the failure? Answer in 2 sentences.',
    followUp: 'List 3 regression tests to add for this bug. One line each.',
  },
  savePath: 'src/billing/retry-helper.ts',
  gifScene: 'paste',
  gifMaxSeconds: 10,
  answerTimeoutMs: 120000,
}

const PORT = Number(process.env.CDP_PORT || 9222)
const BRIDGE_PORT = Number(process.env.VEXEL_PORT || 49152)
const PACE = Math.max(0.5, Number(process.env.PACE || 1))
const OUT = path.resolve(ROOT, process.env.OUT_DIR || 'docs/assets')
const FRAMES = path.join(OUT, '.frames')
const CAPS = path.join(OUT, '.caps')
const SCENES = path.join(OUT, 'scenes')
const EXT = path.join(ROOT, 'packages/extension/dist')
const PROFILE = path.join(ROOT, 'scripts/.chrome-profile')
const WORKSPACE = path.join(ROOT, 'scripts/.demo-workspace')
const STATE = path.join(ROOT, 'scripts/.capture-state.json')
const AIM_URL = 'https://google.com'
const HEADLESS = process.env.HEADLESS === '1'
const INTERACTIVE = process.env.INTERACTIVE === '1'
const REQUIRE_SIGNIN = process.env.REQUIRE_SIGNIN === '1'
const KEEP_OPEN = process.env.KEEP_OPEN === '1'
const KEEP_FRAMES = process.env.KEEP_FRAMES === '1'
const SKIP_BUILD = process.env.SKIP_BUILD === '1'
const FORCE = process.env.FORCE === '1'
const COOLDOWN_MIN = Number(process.env.COOLDOWN_MIN || 15)
const BLOCK_COOLDOWN_MIN = Number(process.env.BLOCK_COOLDOWN_MIN || 60)
const MAX_QUERIES_DAY = Number(process.env.MAX_QUERIES_DAY || 12)
const FPS = 30
const VW = 1440
const VH = 810
const W = 1920
const H = 1080
const BG = '0xF8F9FA'

let chromeProc: ChildProcess | null = null
let bridgeProc: ChildProcess | null = null
let bridgeSafe = false
let browser: Browser | null = null
let context: BrowserContext | null = null
let page: Page | null = null
let cdp: CDPSession | null = null
let LOGO = ''
const warnings: string[] = []
const shots: string[] = []
const scenes: SceneEntry[] = []
let frameCount = 0
const rec: RecorderState = { last: null, lastAt: 0, timer: null, freeze: false, speed: 1, tick: 0 }

function warn(msg: string): void {
  warnings.push(msg)
  console.warn('  [warn] ' + msg)
}

function getPage(): Page {
  if (!page) throw new Error('Playwright page not initialized')
  return page
}

function getCdp(): CDPSession {
  if (!cdp) throw new Error('CDP session not initialized')
  return cdp
}

function wait(ms: number): Promise<void> {
  return getPage().waitForTimeout(Math.round(ms * PACE))
}

function jitter(base: number, spread = 0.25): number {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * spread))
}

function kill(k: ChildProcess | null): void {
  if (!k || k.killed) return
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(k.pid), '/T', '/F'])
    else k.kill('SIGTERM')
  } catch {}
}

function cleanup(): void {
  kill(chromeProc)
  kill(bridgeProc)
  chromeProc = null
  bridgeProc = null
}

process.on('SIGINT', () => {
  console.log('\nInterrupted - cleaning up...')
  cleanup()
  process.exit(130)
})

// ---------- run governor (stop hammering Google) ----------
function loadState(): GovernorState {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8')) as GovernorState
  } catch {
    return { runs: [], queries: [], blockedAt: 0 }
  }
}

function saveState(s: GovernorState): void {
  try {
    fs.writeFileSync(STATE, JSON.stringify(s, null, 2))
  } catch {}
}

function governorCheck(): GovernorState {
  const now = Date.now()
  const st = loadState()
  st.runs = (st.runs || []).filter((t) => now - t < 86400000)
  st.queries = (st.queries || []).filter((t) => now - t < 86400000)
  saveState(st)
  if (FORCE) {
    console.log('- FORCE=1: governor bypassed')
    return st
  }
  if (st.blockedAt && now - st.blockedAt < BLOCK_COOLDOWN_MIN * 60000) {
    const left = Math.ceil((BLOCK_COOLDOWN_MIN * 60000 - (now - st.blockedAt)) / 60000)
    throw new Error(
      'GOVERNOR: Google blocked this IP/profile recently. Wait ~' +
        left +
        ' min, then run once with INTERACTIVE=1 to solve the captcha and sign in (profile persists). FORCE=1 overrides.'
    )
  }
  const last = st.runs.length ? st.runs[st.runs.length - 1] : 0
  const gapMin = (now - last) / 60000
  if (last && gapMin < COOLDOWN_MIN) {
    throw new Error(
      'GOVERNOR: last capture was ' +
        gapMin.toFixed(1) +
        ' min ago; cooldown is ' +
        COOLDOWN_MIN +
        ' min to avoid anti-bot blocks. Wait, or FORCE=1 / COOLDOWN_MIN=0.'
    )
  }
  if (st.queries.length >= MAX_QUERIES_DAY) {
    throw new Error(
      'GOVERNOR: ' +
        st.queries.length +
        ' live queries in 24h (cap ' +
        MAX_QUERIES_DAY +
        '). Wait tomorrow or FORCE=1 / MAX_QUERIES_DAY=…'
    )
  }
  return st
}

function noteQuery(st: GovernorState): void {
  st.queries.push(Date.now())
  saveState(st)
  if (!FORCE && st.queries.length > MAX_QUERIES_DAY)
    throw new Error('GOVERNOR: daily query cap reached mid-run.')
}

function noteRun(st: GovernorState): void {
  st.runs.push(Date.now())
  saveState(st)
}

function noteBlock(st: GovernorState): void {
  st.blockedAt = Date.now()
  saveState(st)
}

async function fetchJson<T>(url: string, timeoutMs = 1500): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

async function waitFor(fn: () => Promise<boolean>, ms: number, step = 400): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await fn()) return true
    await new Promise((r) => setTimeout(r, step))
  }
  return false
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) throw new Error(cmd + ' ' + args.join(' ') + ' failed')
}

function haveFfmpeg(): boolean {
  return spawnSync('ffmpeg', ['-version']).status === 0
}

function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error'].concat(args), {
    encoding: 'utf8',
  })
  if (r.status !== 0)
    throw new Error(
      'ffmpeg failed: ' +
        String(r.stderr || '')
          .trim()
          .slice(0, 300)
    )
}

function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------- demo workspace + skill seeding (never overwrites existing files) ----------
function seedFile(rel: string, content: string): void {
  const p = path.join(WORKSPACE, rel)
  if (fs.existsSync(p)) return
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

function buildCiLog(): string {
  const lines = ['# acme-billing-service - CI run 4821 (main @ 9f31c2e)', '']
  const mods = ['vite', 'tsc', 'eslint', 'vitest', 'stripe-mock', 'redis-mock']
  const lvl = ['INFO', 'DEBUG', 'WARN']
  for (let i = 0; i < 140; i++) {
    const t =
      '2026-11-18T09:' +
      String(10 + Math.floor(i / 60)).padStart(2, '0') +
      ':' +
      String(i % 60).padStart(2, '0') +
      'Z'
    const msg =
      i % 7 === 0
        ? 'cache hit for chunk ' + (i % 23)
        : 'processed module src/billing/mod-' + i + '.ts (' + (120 + ((i * 37) % 900)) + ' ms)'
    lines.push('[' + t + '] ' + lvl[i % 3] + ' ' + mods[i % mods.length] + ': ' + msg)
  }
  lines.push(
    '',
    ' FAIL  test/billing/webhook.replay.test.ts > Stripe webhook > rejects replayed event ids'
  )
  lines.push('AssertionError: expected 200 to be 409 // duplicate event was processed twice')
  for (let i = 0; i < 48; i++) {
    lines.push(
      '    at processBillingEvent (src/billing/webhook-handler.ts:' +
        (40 + i) +
        ':' +
        (3 + (i % 20)) +
        ')'
    )
  }
  lines.push(
    '',
    'ERROR: Redis SET NX was awaited after side effects - race window of ~12ms under load.',
    'Test Files  1 failed | 17 passed (18)',
    '     Tests  1 failed | 212 passed (213)',
    '  Duration  41.2s'
  )
  let text = lines.join('\n')
  while (text.length < 12000) {
    text +=
      '\n[trace] frame ' +
      text.length +
      ' - idempotency claim missing for evt_1Nx' +
      (text.length % 97)
  }
  return text
}

function seedWorkspace(): void {
  seedFile(
    'package.json',
    JSON.stringify(
      {
        name: 'acme-billing-service',
        private: true,
        type: 'module',
        scripts: { test: 'vitest run' },
      },
      null,
      2
    ) + '\n'
  )
  seedFile(
    'README.md',
    '# acme-billing-service\n\nStripe billing + webhook processing. Demo workspace used by Vexel live captures.\n'
  )
  seedFile(
    'src/infra/redis.ts',
    "import { createClient } from 'redis';\nexport const redis = createClient({ url: process.env.REDIS_URL });\nawait redis.connect();\n"
  )
  seedFile(
    'src/billing/webhook-handler.ts',
    [
      "import Stripe from 'stripe';",
      "import { redis } from '../infra/redis';",
      'const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);',
      '',
      'export async function handleStripeWebhook(rawBody: Buffer, sig: string) {',
      '  const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);',
      "  const claimed = await redis.set('stripe:evt:' + event.id, '1', { NX: true, EX: 86400 });",
      '  if (!claimed) return { status: 200, duplicate: true };',
      '  await processBillingEvent(event);',
      '  return { status: 200, processed: event.id };',
      '}',
    ].join('\n') + '\n'
  )
  seedFile('logs/ci-failure.log', buildCiLog())
}
function seedSkill(): boolean {
  const dir = path.join(os.homedir(), '.agents', 'skills', 'vexel-demo-code-review')
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return false
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    [
      '---',
      'name: demo-code-review',
      'description: Senior code review checklist for billing services (demo skill seeded by Vexel live capture).',
      '---',
      '',
      'Review the attached code as a staff engineer. Check, in order:',
      '1. Idempotency and replay safety (claim event IDs atomically before side effects).',
      '2. Async race conditions and lock ordering.',
      '3. Input validation and signature verification.',
      '4. Failure modes: retries, backoff, dead-letter handling.',
      'Propose the smallest safe patch. Ask for reference files only if needed.',
    ].join('\n') + '\n'
  )
  fs.writeFileSync(
    path.join(dir, 'references', 'checkout-flow.md'),
    '# Checkout flow reference\n\n' +
      'Sequence: intent -> confirm -> webhook -> fulfill. '.repeat(60) +
      '\n'
  )
  return true
}
// ---------- chrome + bridge lifecycle ----------
function resolveChrome(): string {
  if (process.env.CHROME_BIN) {
    if (!fs.existsSync(process.env.CHROME_BIN))
      throw new Error('CHROME_BIN not found: ' + process.env.CHROME_BIN)
    return process.env.CHROME_BIN
  }
  let exe = ''
  try {
    exe = chromium.executablePath()
  } catch {}
  if (exe && fs.existsSync(exe)) return exe
  console.log('- Chromium missing, running: pnpm exec playwright install chromium')
  run('pnpm', ['exec', 'playwright', 'install', 'chromium'])
  exe = chromium.executablePath()
  if (!fs.existsSync(exe)) throw new Error('Chromium not found after install')
  return exe
}
async function ensureChrome(): Promise<CdpVersionInfo | null> {
  const ver = await fetchJson<CdpVersionInfo>('http://127.0.0.1:' + PORT + '/json/version')
  if (ver) {
    console.log('- Reusing Chrome already on CDP :' + PORT + ' (' + String(ver.Browser) + ')')
    return ver
  }
  const exe = resolveChrome()
  fs.mkdirSync(PROFILE, { recursive: true })
  const args = [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--load-extension=' + EXT,
    '--disable-extensions-except=' + EXT,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--mute-audio',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--lang=en-US',
    '--disable-features=PaintHolding',
    '--window-size=1320,920',
    '--window-position=40,30',
  ]
  if (HEADLESS) args.push('--headless=new')
  if (process.platform === 'linux' && (process.getuid?.() === 0 || process.env.CI))
    args.push('--no-sandbox')
  args.push('about:blank')
  console.log(
    '- Launching ' +
      path.basename(exe) +
      '  --load-extension=' +
      path.relative(ROOT, EXT) +
      '  CDP :' +
      PORT
  )
  chromeProc = spawn(exe, args, { stdio: 'ignore' })
  const up = await waitFor(
    async () => !!(await fetchJson('http://127.0.0.1:' + PORT + '/json/version')),
    30000,
    500
  )
  if (!up) {
    throw new Error(
      'Chrome did not expose CDP on 127.0.0.1:' +
        PORT +
        ' (Linux deps: libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2)'
    )
  }
  return fetchJson('http://127.0.0.1:' + PORT + '/json/version')
}
async function ensureBridge(): Promise<void> {
  const existing = await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/skills')
  if (existing) {
    const browse = await fetchJson<{ rootLabel?: string }>(
      'http://127.0.0.1:' + BRIDGE_PORT + '/browse?dir='
    )
    const rootLabel = browse?.rootLabel
    if (rootLabel === path.basename(WORKSPACE)) {
      bridgeSafe = true
      console.log('- Reusing bridge on :' + BRIDGE_PORT + ' (already rooted at the demo workspace)')
      return
    }
    console.log(
      '- External bridge on :' + BRIDGE_PORT + ' is rooted at "' + (rootLabel || '?') + '".'
    )
    console.log('  Stop it (Ctrl+C in its terminal) so the @ scene never shows your real folders.')
    console.log('  Waiting up to 20s for the port to free up...')
    const freed = await waitFor(
      async () => !(await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/skills', 700)),
      20000,
      1000
    )
    if (!freed) {
      warn(
        'external bridge still running - @ scene shows "' +
          (rootLabel || '?') +
          '" and code-save will not write to disk'
      )
      return
    }
  }
  const child = spawn(process.execPath, [path.join(ROOT, 'packages/bridge/src/server.ts')], {
    env: Object.assign({}, process.env, {
      VEXEL_PORT: String(BRIDGE_PORT),
      VEXEL_ROOT_DIR: WORKSPACE,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  bridgeProc = child
  bridgeSafe = true
  child.stdout.on('data', (d: Buffer) => process.stdout.write('  [bridge] ' + d.toString()))
  child.stderr.on('data', (d: Buffer) => process.stderr.write('  [bridge] ' + d.toString()))
  const up = await waitFor(
    async () => !!(await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/skills')),
    15000,
    300
  )
  if (!up) throw new Error('Bridge failed to start on :' + BRIDGE_PORT)
}
// ---------- CDP screencast recorder (30 fps CFR, pausable for flash-free shots) ----------
async function startRecorder(): Promise<void> {
  const session = getCdp()
  fs.rmSync(FRAMES, { recursive: true, force: true })
  fs.mkdirSync(FRAMES, { recursive: true })
  const prime = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 })
  rec.last = Buffer.from(prime.data, 'base64')
  rec.lastAt = Date.now()
  const opts = { format: 'jpeg' as const, quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 }
  await session.send('Page.startScreencast', opts)
  session.on('Page.screencastFrame', (ev) => {
    if (!rec.freeze) {
      rec.last = Buffer.from(ev.data, 'base64')
      rec.lastAt = Date.now()
    }
    session.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {})
  })
  rec.timer = setInterval(
    () => {
      if (!rec.last) return
      rec.tick++
      if (rec.speed > 1 && rec.tick % rec.speed !== 0) return
      frameCount++
      const fPath = path.join(FRAMES, 'f' + String(frameCount).padStart(6, '0') + '.jpg')
      fs.promises.writeFile(fPath, rec.last).catch(() => {})
      if (Date.now() - rec.lastAt > 2500) {
        rec.lastAt = Date.now()
        session.send('Page.startScreencast', opts).catch(() => {})
      }
    },
    Math.round(1000 / FPS)
  )
}
async function stopRecorder(): Promise<void> {
  if (rec.timer) {
    clearInterval(rec.timer)
    rec.timer = null
  }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => {})
}
function mark(name: string, caption: string): void {
  scenes.push({ name, caption, start: frameCount })
}
function finalizeScenes(): void {
  for (let i = 0; i < scenes.length; i++) {
    const endFrame = i + 1 < scenes.length ? scenes[i + 1].start : frameCount
    scenes[i].end = endFrame
    scenes[i].seconds = +((endFrame - scenes[i].start) / FPS).toFixed(2)
  }
}
// ---------- smooth scrolling: CLAMPED + duration-capped (never hangs) ----------
async function smoothScroll(dy: number, speed = 900): Promise<void> {
  const p = getPage()
  const session = getCdp()
  const info = await p
    .evaluate(() => ({
      y: window.scrollY || 0,
      max: Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight),
    }))
    .catch(() => null)
  let dist = dy
  if (info) dist = dy > 0 ? Math.min(dy, Math.max(0, info.max - info.y)) : Math.max(dy, -info.y)
  if (Math.abs(dist) < 4) return
  const sp = Math.round(Math.max(speed, Math.abs(dist) / 2.5))
  try {
    const g = session.send('Input.synthesizeScrollGesture', {
      x: Math.round(VW / 2),
      y: Math.round(VH / 2),
      xDistance: 0,
      yDistance: -dist,
      speed: sp,
      gestureSourceType: 'mouse',
    })
    g.catch(() => {})
    await Promise.race([g, new Promise((r) => setTimeout(r, 4000))])
  } catch {
    await p.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dist).catch(() => {})
    await p.waitForTimeout(600)
  }
}
async function scrollToTop(): Promise<void> {
  await smoothScroll(-1000000, 1800)
  await wait(350)
}
async function smoothScrollIntoView(locator: Locator): Promise<void> {
  const p = getPage()
  const y = await locator
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
    .catch(() => null)
  if (y === null) return
  const cur = await p.evaluate(() => window.scrollY).catch(() => 0)
  await smoothScroll(Math.max(0, y - 160) - cur, 700)
  await wait(300)
}
// ---------- screenshots: recorder PAUSED => zero flash in the video ----------
async function fullShot(name: string): Promise<void> {
  const session = getCdp()
  const m = await session.send('Page.getLayoutMetrics')
  const size = m.cssContentSize || m.contentSize
  const w = Math.min(1920, Math.ceil(size.width))
  const h = Math.min(8000, Math.ceil(size.height))
  const r = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: h, scale: 1 },
  })
  fs.writeFileSync(path.join(OUT, name + '-full.png'), Buffer.from(r.data, 'base64'))
  shots.push(name + '-full.png')
}
async function shot(name: string, opts: ShotOptions = {}): Promise<void> {
  const p = getPage()
  const session = getCdp()
  await wait(opts.settle === undefined ? 350 : opts.settle)
  rec.freeze = true
  await p.waitForTimeout(120)
  await p
    .evaluate(() => {
      const s = document.createElement('style')
      s.id = 'mk-caret-hide'
      s.textContent = '*{caret-color:transparent !important;}'
      ;(document.head || document.documentElement).appendChild(s)
    })
    .catch(() => {})
  try {
    const base = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(base.data, 'base64'))
    shots.push(name + '.png')
    if (opts.hiRes !== false) {
      const r = await session.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        clip: { x: 0, y: 0, width: VW, height: VH, scale: 2 },
      })
      fs.writeFileSync(path.join(OUT, name + '@2x.png'), Buffer.from(r.data, 'base64'))
      shots.push(name + '@2x.png')
    }
    if (opts.full) await fullShot(name)
  } finally {
    await p
      .evaluate(() => {
        const s = document.getElementById('mk-caret-hide')
        if (s) s.remove()
      })
      .catch(() => {})
    await p.waitForTimeout(200)
    rec.freeze = false
  }
  console.log('  [shot] ' + name)
  await wait(opts.hold === undefined ? 650 : opts.hold)
}
// ---------- page helpers ----------
async function focusPrompt(): Promise<Locator> {
  const p = getPage()
  await smoothScroll(100000, 1600)
  await wait(200)
  const inp = p.locator('textarea:visible, [contenteditable="true"]:visible').last()
  await inp.waitFor({ state: 'visible', timeout: 15000 })
  await inp.click()
  return inp
}
async function clearPrompt(): Promise<void> {
  const p = getPage()
  const inp = p.locator('textarea:visible, [contenteditable="true"]:visible').last()
  if ((await inp.count()) === 0) return
  await inp.fill('').catch(async () => {
    await inp.click().catch(() => {})
    await p.keyboard.press('ControlOrMeta+a')
    await p.keyboard.press('Backspace')
  })
}
function paletteOpen(timeout: number): Promise<boolean> {
  return getPage()
    .waitForFunction(
      () => {
        const h = document.getElementById('vexel-inline-menu-host')
        return !!(h && h.shadowRoot && h.shadowRoot.querySelector('.popover.open'))
      },
      undefined,
      { timeout }
    )
    .then(() => true)
    .catch(() => false)
}
async function openPalette(trigger: string): Promise<void> {
  const inp = await focusPrompt()
  await inp.pressSequentially(trigger, { delay: jitter(Math.round(90 * PACE), 0.3) })
  if (!(await paletteOpen(5000))) throw new Error('palette did not open on "' + trigger + '"')
}
async function openPaletteViaDock(): Promise<void> {
  await smoothScroll(100000, 1600)
  const dock = getPage().locator('#vexel-input-dock-host .dock-btn')
  await dock.waitFor({ state: 'visible', timeout: 8000 })
  await dock.hover()
  await wait(350)
  await dock.click()
  if (!(await paletteOpen(5000))) throw new Error('palette did not open via dock button')
}
async function ensureVexel(timeout: number): Promise<void> {
  const p = getPage()
  const ok = await p
    .waitForSelector('#vexel-inline-menu-host', { state: 'attached', timeout })
    .then(() => true)
    .catch(() => false)
  if (ok) return
  const css = await p
    .locator('#vexel-fast-load-css')
    .count()
    .catch(() => 0)
  if (css > 0) {
    warn('Vexel CSS booster present but palette host not mounted yet')
    return
  }
  throw new Error(
    'Vexel content script not detected on ' +
      p.url() +
      ' - branded Chrome >= 137 ignores --load-extension. Use the default bundled Chromium / Chrome for Testing, and check packages/extension/dist exists.'
  )
}
function ensureVexelLater(): Promise<void> {
  return ensureVexel(8000).catch((e: unknown) => warn(e instanceof Error ? e.message : String(e)))
}
async function bodyLen(): Promise<number> {
  return getPage()
    .evaluate(() => ((document.body && document.body.innerText) || '').length)
    .catch(() => -1)
}
// ---------- anti-bot detection + recovery ----------
async function isBlocked(): Promise<boolean> {
  const p = getPage()
  const u = p.url()
  if (u.includes('/sorry/') || u.includes('google.com')) return true
  return p
    .evaluate(() => {
      if (document.querySelector('iframe[src*="recaptcha"], #recaptcha, form[action*="sorry"]'))
        return true
      const t = (document.body && document.body.innerText) || ''
      return /unusual traffic|trafic exceptionnel|Je ne suis pas un robot/i.test(t)
    })
    .catch(() => false)
}
async function ensureNotBlocked(st: GovernorState, stage: string): Promise<void> {
  if (!(await isBlocked())) return
  noteBlock(st)
  if (INTERACTIVE) {
    await pause(
      'Google anti-bot page at ' + stage + ': solve the captcha (and sign in) in the Chrome window'
    )
    await getPage()
      .goto(AIM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => {})
    await dismissConsent(8000)
    if (await isBlocked()) throw new Error('ANTIBOT: still blocked after manual solve at ' + stage)
    return
  }
  throw new Error(
    'ANTIBOT: Google /sorry/ rate block at ' +
      stage +
      '. This is IP/profile-level, not a script bug. Wait ~' +
      BLOCK_COOLDOWN_MIN +
      ' min, then run once with INTERACTIVE=1 to solve + sign in (profile persists). FORCE=1 bypasses the governor only.'
  )
}
async function waitAnswer(
  st: GovernorState,
  minLen: number,
  timeoutMs = CONFIG.answerTimeoutMs
): Promise<void> {
  const p = getPage()
  const prevSpeed = rec.speed
  rec.speed = 4
  try {
    const t0 = Date.now()
    let last = -1
    let stable = 0
    await p.waitForTimeout(400)
    await p.mouse.wheel(0, 2).catch(() => {})
    await p.waitForTimeout(800)
    await p.mouse.wheel(0, 2).catch(() => {})
    await p.waitForTimeout(1300)
    while (Date.now() - t0 < timeoutMs) {
      const len = await bodyLen()
      const stopBtn = await p
        .getByRole('button', { name: /stop|arrêter/i })
        .first()
        .isVisible()
        .catch(() => false)
      if (len > minLen && !stopBtn && last >= 0 && Math.abs(len - last) < 40) stable++
      else stable = 0
      last = len
      if (stable >= 3) break
      await p.waitForTimeout(700)
    }
    const more = p.getByRole('button', { name: /^(Show more|Afficher plus)$/ }).first()
    if (await more.isVisible().catch(() => false)) {
      await more.click().catch(() => {})
      await p.waitForTimeout(900)
    }
    await p.waitForTimeout(800)
    await ensureNotBlocked(st, 'answer')
    await ensureVexelLater()
  } finally {
    rec.speed = prevSpeed
  }
}
async function waitToast(substr: string, timeout: number): Promise<boolean> {
  return getPage()
    .waitForFunction(
      (s) => {
        return Array.from(document.querySelectorAll<HTMLDivElement>('body > div')).some((d) => {
          const t = d.textContent || ''
          return (
            (t.startsWith('Vexel:') || t.startsWith('Vexel :')) &&
            t.includes(s) &&
            d.style.position === 'fixed'
          )
        })
      },
      substr,
      { timeout }
    )
    .then(() => true)
    .catch(() => false)
}
// ---------- consent: full-page redirect, IFRAME overlay, or inline dialog ----------
async function consentVisible(): Promise<ConsentTarget | null> {
  const p = getPage()
  if (p.url().includes('consent.google.')) return { scope: p }
  for (const f of p.frames()) {
    if (f !== p.mainFrame() && f.url().includes('consent.google.')) return { scope: f }
  }
  const b = p
    .getByRole('button', { name: /^(Reject all|Accept all|Tout refuser|Tout accepter)$/ })
    .first()
  if (await b.isVisible().catch(() => false)) return { scope: p, btn: b }
  return null
}
async function dismissConsent(deadlineMs: number): Promise<boolean> {
  const p = getPage()
  const t0 = Date.now()
  while (Date.now() - t0 < deadlineMs) {
    const c = await consentVisible()
    if (!c) {
      if (Date.now() - t0 < 3500) {
        await p.waitForTimeout(600)
        continue
      }
      return true
    }
    let clicked = false
    for (const name of ['Reject all', 'Tout refuser', 'Accept all', 'Tout accepter']) {
      const b = c.scope.getByRole('button', { name }).first()
      if (await b.isVisible().catch(() => false)) {
        await b.click({ timeout: 3000 }).catch(() => {})
        clicked = true
        break
      }
    }
    if (!clicked && c.btn) {
      await c.btn.click({ timeout: 3000 }).catch(() => {})
      clicked = true
    }
    if (!clicked) {
      const legacy = c.scope.locator('#L2AGLb').first()
      if ((await legacy.count().catch(() => 0)) > 0) {
        await legacy.click({ timeout: 3000 }).catch(() => {})
        clicked = true
      }
    }
    if (!clicked) {
      await p.waitForTimeout(700)
      continue
    }
    await p.waitForTimeout(1800)
    await p.waitForLoadState('domcontentloaded').catch(() => {})
  }
  return !(await consentVisible())
}
async function pause(msg: string): Promise<boolean> {
  if (!INTERACTIVE) return false
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await rl.question('\n[paused] ' + msg + ' - then press Enter here... ')
  rl.close()
  return true
}
// ---------- branded cards (logo) + captions (RIGHT side) ----------
function cardInner(title: string, sub: string, foot: string): string {
  const hero = LOGO ? '' : '' + title + ''
  return '' + 'VEXEL FOR GOOGLE AI MODE' + hero + '' + sub + '' + '' + foot + ''
}
async function showCard(id: string, html: string): Promise<void> {
  await getPage().evaluate(
    (a) => {
      const d = document.createElement('div')
      d.id = a.id
      d.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;opacity:0;transition:opacity .45s ease;'
      d.innerHTML = a.html
      document.body.appendChild(d)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          d.style.opacity = '1'
        })
      )
    },
    { id, html }
  )
}
async function hideCard(id: string): Promise<void> {
  await getPage().evaluate((i) => {
    const d = document.getElementById(i)
    if (!d) return
    d.style.opacity = '0'
    setTimeout(() => d.remove(), 500)
  }, id)
}
function captionHtml(text: string): string {
  const parts = String(text || '').split(' — ')
  const headline = parts[0] || text
  const detail = parts.slice(1).join(' — ')
  return (
    '' +
    'VEXEL • GOOGLE AI MODE' +
    '' +
    escHtml(headline) +
    '' +
    (detail ? '' + escHtml(detail) + '' : '') +
    ''
  )
}
function waitStep(n: number): Promise<unknown> {
  return getPage()
    .waitForFunction(
      (k) => {
        const h = document.getElementById('vexel-onboarding-host')
        const p = h && h.shadowRoot && h.shadowRoot.querySelector('.step-pill')
        return !!p && (p.textContent || '').includes('Step ' + k)
      },
      n,
      { timeout: 5000 }
    )
    .catch(() => {})
}
const SCENE_BUDGET: Record<string, number> = {
  intro: 20000,
  landing: 30000,
  onboarding: 60000,
  ask: 200000,
  paste: 220000,
  skills: 60000,
  files: 45000,
  save: 60000,
  speed: 200000,
  outro: 20000,
}
async function scene(name: string, caption: string, fn: () => Promise<void>): Promise<void> {
  mark(name, caption)
  console.log('> ' + name + ' - ' + caption)
  const budget = SCENE_BUDGET[name] || 60000
  let timer: ReturnType<typeof setTimeout> | null = null
  const work = fn()
  work.catch(() => {})
  try {
    await Promise.race([
      work,
      new Promise((_, rej) => {
        timer = setTimeout(
          () => rej(new Error('scene budget exceeded (' + Math.round(budget / 1000) + 's)')),
          budget
        )
      }),
    ])
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e)
    if (m.startsWith('ANTIBOT') || m.startsWith('GOVERNOR')) throw e
    warn(name + ': ' + m)
  } finally {
    if (timer) clearTimeout(timer)
  }
  await wait(jitter(500, 0.4))
}
// ---------- captions rendered in-browser (transparent PNGs, no font deps) ----------
async function renderCaptions(): Promise<Map<string, string>> {
  const caps = new Map<string, string>()
  const uniq: string[] = []
  for (const s of scenes) {
    if (s.caption && s.name !== 'intro' && s.name !== 'outro' && !uniq.includes(s.caption))
      uniq.push(s.caption)
  }
  if (!uniq.length || !context) return caps
  fs.mkdirSync(CAPS, { recursive: true })
  let cp: Page | null = null
  try {
    cp = await context.newPage()
    await cp.setViewportSize({ width: W, height: H })
    for (let i = 0; i < uniq.length; i++) {
      await cp.setContent('html,body{margin:0;background:transparent}' + captionHtml(uniq[i]) + '')
      await cp.waitForTimeout(150)
      const file = path.join(CAPS, 'cap-' + i + '.png')
      await cp.screenshot({ path: file, omitBackground: true })
      caps.set(uniq[i], file)
    }
  } catch (e: unknown) {
    warn('caption rendering failed: ' + (e instanceof Error ? e.message : String(e)))
  }
  if (cp) await cp.close().catch(() => {})
  return caps
}
// ---------- ffmpeg post-production ----------
function assembleVideo(caps: Map<string, string>): boolean {
  if (!haveFfmpeg()) {
    warn(
      'ffmpeg not found - raw frames kept in ' +
        FRAMES +
        ' (install: brew install ffmpeg / sudo apt install ffmpeg)'
    )
    return false
  }
  const listPath = path.join(OUT, '.concat.txt')
  const list: string[] = []
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]
    const end = s.end ?? frameCount
    const secs = s.seconds ?? 0
    const n = end - s.start
    if (n < 2) continue
    const file = path.join(SCENES, String(i).padStart(2, '0') + '-' + s.name + '.mp4')
    const base =
      'scale=' +
      (W - 160) +
      ':' +
      (H - 90) +
      ':force_original_aspect_ratio=decrease,drawbox=x=0:y=0:w=iw:h=ih:color=0xDADCE0:t=2,pad=' +
      W +
      ':' +
      H +
      ':(ow-iw)/2:(oh-ih)/2:color=' +
      BG
    let fade = ''
    if (i === 0) fade = ',fade=t=in:st=0:d=0.5'
    if (i === scenes.length - 1 && secs > 1.4)
      fade = ',fade=t=out:st=' + (secs - 0.6).toFixed(2) + ':d=0.6'
    const cap = caps.get(s.caption)
    const common = [
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '19',
      '-r',
      String(FPS),
      '-frames:v',
      String(n),
      file,
    ]
    if (cap) {
      ff(
        [
          '-framerate',
          String(FPS),
          '-start_number',
          String(s.start + 1),
          '-i',
          path.join(FRAMES, 'f%06d.jpg'),
          '-loop',
          '1',
          '-i',
          cap,
          '-filter_complex',
          '[0:v]' +
            base +
            '[bg];[1:v]format=rgba,fade=t=in:st=0.15:d=0.25:alpha=1[cap];[bg][cap]overlay=0:0' +
            fade +
            ',format=yuv420p',
        ].concat(common)
      )
    } else {
      ff(
        [
          '-framerate',
          String(FPS),
          '-start_number',
          String(s.start + 1),
          '-i',
          path.join(FRAMES, 'f%06d.jpg'),
          '-vf',
          base + fade + ',format=yuv420p',
        ].concat(common)
      )
    }
    list.push("file '" + file + "'")
  }
  fs.writeFileSync(listPath, list.join('\n') + '\n')
  const mp4 = path.join(OUT, 'vexel-demo.mp4')
  ff(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', mp4])
  fs.rmSync(listPath, { force: true })
  const highlightNames = ['skills', 'files', 'save', 'paste']
  const gifClips: string[] = []
  for (const hName of highlightNames) {
    const idx = scenes.findIndex((s) => s.name === hName && (s.end ?? frameCount) - s.start > FPS)
    if (idx >= 0) {
      const srcClip = path.join(
        SCENES,
        String(idx).padStart(2, '0') + '-' + scenes[idx].name + '.mp4'
      )
      const trimClip = path.join(SCENES, 'gif-' + hName + '.mp4')
      ff(['-i', srcClip, '-t', '3.5', '-c', 'copy', trimClip])
      gifClips.push(trimClip)
    }
  }
  const gifListPath = path.join(OUT, '.gif-concat.txt')
  const gifInputMp4 = path.join(SCENES, 'gif-reel.mp4')
  if (gifClips.length > 0) {
    fs.writeFileSync(gifListPath, gifClips.map((c) => "file '" + c + "'").join('\n') + '\n')
    ff(['-f', 'concat', '-safe', '0', '-i', gifListPath, '-c', 'copy', gifInputMp4])
    fs.rmSync(gifListPath, { force: true })
    ff([
      '-i',
      gifInputMp4,
      '-vf',
      'fps=14,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      '-loop',
      '0',
      path.join(OUT, 'vexel-demo.gif'),
    ])
  }
  const ask = scenes.find((s) => s.name === 'ask')
  const posterT = ask
    ? ((ask.start + ((ask.end ?? frameCount) - ask.start) / 2) / FPS).toFixed(2)
    : '2'
  ff(['-i', mp4, '-ss', posterT, '-frames:v', '1', path.join(OUT, 'poster.png')])
  const hero = ['02-ai-mode-answer@2x.png', '00-ai-mode-landing@2x.png']
    .map((f) => path.join(OUT, f))
    .find((f) => fs.existsSync(f))
  if (hero) {
    ff([
      '-i',
      hero,
      '-vf',
      'scale=1280:640:force_original_aspect_ratio=increase,crop=1280:640',
      path.join(OUT, 'github-social-1280x640.png'),
    ])
  }
  return true
}
function writeAssetsMd(
  ver: CdpVersionInfo | null,
  extVersion: string,
  videoOk: boolean,
  elapsed: number
): void {
  const mb = (p: string) => (fs.statSync(p).size / 1048576).toFixed(1) + ' MB'
  const lines = [
    '# Vexel marketing assets - LIVE capture (v5)',
    '',
    'Captured ' + new Date().toISOString() + ' against real Google AI Mode (udm=50), no mocks.',
    'Browser: ' +
      (ver?.Browser || '?') +
      ' - Extension: v' +
      extVersion +
      ' - Bridge: 127.0.0.1:' +
      BRIDGE_PORT +
      ' - CDP: 127.0.0.1:' +
      PORT +
      ' - PACE: ' +
      PACE,
    '',
    'Anti-bot: run governor + jittered cadence + /sorry/ recovery; shots recorder-paused; captions right; logo from docs/logo.png.',
    '',
    '## Video',
    '',
    videoOk
      ? '- vexel-demo.mp4 (' +
        mb(path.join(OUT, 'vexel-demo.mp4')) +
        ', 1920x1080@30, captioned scenes)\n- vexel-demo.gif (' +
        mb(path.join(OUT, 'vexel-demo.gif')) +
        ', README-ready)\n- scenes/*.mp4 - individual clips for short cuts\n- poster.png, github-social-1280x640.png'
      : '- ffmpeg missing: frames kept in .frames/',
    '',
    '## Screenshots (1280x800 = Chrome Web Store; @2x = 2560x1600 heroes)',
    '',
    shots.map((s) => '- ' + s).join('\n'),
    '',
    '## Storyboard',
    '',
    '| # | Scene | Seconds | Caption |',
    '|---|-------|---------|---------|',
    scenes
      .map(
        (s, i) =>
          '| ' +
          i +
          ' | ' +
          s.name +
          ' | ' +
          String(s.seconds ?? 0) +
          ' | ' +
          (s.caption || '') +
          ' |'
      )
      .join('\n'),
    '',
    '## Prompts used (real queries)',
    '',
    Object.entries(CONFIG.queries)
      .map(([k, v]) => '- ' + k + ': ' + v)
      .join('\n'),
    '',
    '## Warnings',
    '',
    warnings.length ? warnings.map((w) => '- ' + w).join('\n') : 'None.',
    '',
    'Regenerate: pnpm marketing:assets (knobs: PACE, INTERACTIVE=1, REQUIRE_SIGNIN=1, FORCE=1, COOLDOWN_MIN, MAX_QUERIES_DAY...).',
    'Elapsed: ' + elapsed + 's.',
    '',
  ]
  fs.writeFileSync(path.join(OUT, 'ASSETS.md'), lines.join('\n'))
  fs.writeFileSync(
    path.join(OUT, 'scenes.json'),
    JSON.stringify({ fps: FPS, pace: PACE, scenes }, null, 2)
  )
}
// ---------- main ----------
async function main(): Promise<void> {
  const t0 = Date.now()
  if (Number(process.versions.node.split('.')) < 20) throw new Error('Node 20+ required')
  if (!fs.existsSync(path.join(ROOT, 'packages/extension'))) {
    throw new Error('Run this at the repo root (packages/extension missing)')
  }
  const st = governorCheck()
  if (!SKIP_BUILD) {
    console.log('- pnpm build')
    run('pnpm', ['build'])
  }
  if (!fs.existsSync(path.join(EXT, 'manifest.json')))
    throw new Error('Missing ' + EXT + '/manifest.json - run pnpm build')
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')) as {
    version?: string
  }
  const extVersion = manifest.version || '?'
  try {
    LOGO = fs.readFileSync(path.join(ROOT, 'docs/logo.png')).toString('base64')
  } catch {
    LOGO = ''
  }
  if (LOGO) console.log('- Using docs/logo.png in intro/outro cards')
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(SCENES, { recursive: true })
  seedWorkspace()
  if (seedSkill())
    console.log('- Seeded ~/.agents/skills/vexel-demo-code-review (existing skills untouched)')
  const ver = await ensureChrome()
  await ensureBridge()
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT)
  context = browser.contexts()[0] || null
  if (!context) throw new Error('No browser context over CDP')
  page = context.pages()[0] || (await context.newPage())
  await page.bringToFront()
  await context.addInitScript(() => {
    try {
      localStorage.setItem('vexel:locale', 'en')
      localStorage.setItem('vexel:popup-locale', 'en')
    } catch {}
  })
  await page.setViewportSize({ width: VW, height: VH })
  await context
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.google.com' })
    .catch(() => {})
  cdp = await context.newCDPSession(page)
  // ---- PRE-READY: everything ugly happens BEFORE the recorder starts ----
  console.log('- Preparing page (consent, anti-bot, extension) before recording...')
  await page.goto(AIM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1200)
  await dismissConsent(10000)
  if (INTERACTIVE) {
    await pause(
      'Solve any Google captcha and sign in inside the Chrome window, then press Enter here'
    )
    await dismissConsent(5000)
  }
  await ensureNotBlocked(st, 'landing')
  const signedOut = await page
    .getByRole('link', { name: 'Sign in' })
    .first()
    .isVisible()
    .catch(() => false)
  if (signedOut) {
    console.log(
      '- NOTE: signed-out session. For fewer anti-bot challenges run once with INTERACTIVE=1 and sign in; the profile persists.'
    )
    if (REQUIRE_SIGNIN) {
      if (!(await pause('REQUIRE_SIGNIN=1: sign in now in the Chrome window'))) {
        throw new Error('REQUIRE_SIGNIN=1 but INTERACTIVE=0; cannot sign in headlessly.')
      }
    }
  }
  await ensureVexel(20000)
  await page.waitForTimeout(900)
  await startRecorder()
  const pasteLog = fs.readFileSync(path.join(WORKSPACE, 'logs/ci-failure.log'), 'utf8')
  const pasteCaption =
    'Zero-Truncation Paste (' +
    thousands(pasteLog.length) +
    ' chars) — Auto-attached as a .txt file while keeping your prompt intact'
  await scene('intro', 'Vexel — Turn Google AI Mode into a Local Coding Workspace', async () => {
    await showCard(
      'mk-intro',
      cardInner(
        'Vexel',
        'Turn Google AI Mode into a Local Coding Workspace',
        'Zero-truncation file paste • / Slash skills & skills.sh • @ Local repo context • 1-click Save to disk'
      )
    )
    await wait(1800)
    await hideCard('mk-intro')
    await wait(550)
  })
  await scene(
    'landing',
    'Native Workspace Dock — Quick access to / Skills, @ Files & Markdown export',
    async () => {
      await wait(650)
      await getPage()
        .locator('#vexel-input-dock-host .dock-btn')
        .hover()
        .catch(() => {})
      await wait(550)
      await shot('00-ai-mode-landing')
    }
  )
  await scene(
    'onboarding',
    'Zero-Server Ready — Connect any local folder in seconds, no backend required',
    async () => {
      const p = getPage()
      const host = p.locator('#vexel-onboarding-host')
      if ((await host.count()) === 0) {
        await openPaletteViaDock().catch(() => openPalette('/'))
        await p
          .locator('#vexel-inline-menu-host')
          .getByRole('button', { name: '?', exact: true })
          .click({ timeout: 5000 })
          .catch(() => {})
        await wait(350)
      }
      await host.waitFor({ state: 'attached', timeout: 6000 })
      await wait(1650)
      await shot('01-onboarding-hero')
      await host
        .locator('.demo-chip')
        .nth(1)
        .click()
        .catch(() => {})
      await wait(950)
      await host.locator('.btn-primary').click()
      await waitStep(2)
      await wait(1250)
      await host.locator('.btn-primary').click()
      await waitStep(3)
      await wait(1250)
      await shot('01b-onboarding-shortcuts', { hiRes: false })
      await host.locator('.btn-primary').click()
      await host.waitFor({ state: 'detached', timeout: 6000 })
      await clearPrompt()
      await wait(350)
    }
  )
  await scene(
    'ask',
    'Code Generation Workflow — Ask once, inspect & save generated code directly',
    async () => {
      const p = getPage()
      const inp = await focusPrompt()
      const baseline = await bodyLen()
      await inp.pressSequentially(CONFIG.queries.ask, { delay: jitter(Math.round(38 * PACE), 0.3) })
      await wait(jitter(450, 0.3))
      noteQuery(st)
      await p.keyboard.press('Enter')
      await waitAnswer(st, baseline + 150)
      await scrollToTop()
      await wait(650)
      await shot('02-ai-mode-answer', { full: true })
      await smoothScroll(Math.round(VH * 0.65), 420)
      await wait(650)
    }
  )
  await scene('paste', pasteCaption, async () => {
    const p = getPage()
    const session = getCdp()
    await ensureVexelLater()
    rec.speed = 4
    await wait(jitter(6500, 0.25))
    rec.speed = 1
    const inp = await focusPrompt()
    let ok = false
    try {
      await p.evaluate((t) => navigator.clipboard.writeText(t), pasteLog)
      const mod = process.platform === 'darwin' ? 4 : 2
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'v',
        code: 'KeyV',
        windowsVirtualKeyCode: 86,
        nativeVirtualKeyCode: 86,
        modifiers: mod,
        commands: ['paste'],
      })
      await session.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'v',
        code: 'KeyV',
        windowsVirtualKeyCode: 86,
        nativeVirtualKeyCode: 86,
        modifiers: mod,
      })
      ok = await waitToast('attached', 2500)
    } catch {}
    if (!ok) {
      await p.evaluate((t) => {
        const el =
          document.activeElement || document.querySelector('textarea, [contenteditable="true"]')
        if (!el) return
        const dt = new DataTransfer()
        dt.setData('text/plain', t)
        el.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
        )
      }, pasteLog)
      ok = await waitToast('attached', 4000)
    }
    if (!ok)
      throw new Error(
        'paste interception toast not seen (AI Mode variant may lack input[type=file])'
      )
    await shot('03-paste-to-file')
    await wait(1200)
    const baseline = await bodyLen()
    await inp.pressSequentially(' ' + CONFIG.queries.paste, {
      delay: jitter(Math.round(20 * PACE), 0.3),
    })
    noteQuery(st)
    await p.keyboard.press('Enter')
    await waitAnswer(st, baseline + 100, 90000)
    await smoothScroll(100000, 1400)
    await wait(500)
    await shot('03b-paste-answer')
  })
  await scene(
    'skills',
    'Slash Skills (/) — Built-in engineering playbooks + 1-click skills.sh search',
    async () => {
      const p = getPage()
      await ensureVexelLater()
      await clearPrompt()
      await openPaletteViaDock().catch(() => openPalette('/'))
      await wait(750)
      await shot('04-slash-skills-palette')
      await p.keyboard.press('ArrowDown')
      await wait(jitter(400, 0.3))
      await p.keyboard.press('ArrowDown')
      await wait(jitter(400, 0.3))
      await p.keyboard.press('Enter')
      await wait(750)
      await shot('05-skill-injected', { hiRes: false })
      await clearPrompt()
    }
  )
  await scene(
    'files',
    'Repo Context (@) — Attach local files, pack entire folders, or inject Git diff',
    async () => {
      const p = getPage()
      await clearPrompt()
      const inp = await focusPrompt()
      await inp.pressSequentially('@', { delay: jitter(Math.round(90 * PACE), 0.3) })
      if (!(await paletteOpen(5000))) throw new Error('palette did not open on "@"')
      await wait(1100)
      await shot('06-at-files-workspace')
      await p.keyboard.type('webhook', { delay: 65 })
      await wait(650)
      await p.keyboard.press('Enter')
      await wait(850)
      await clearPrompt()
    }
  )
  await scene(
    'save',
    '1-Click Save to File — Write AI-generated code straight into your repository',
    async () => {
      const p = getPage()
      const code = p.locator('pre code').first()
      await code.waitFor({ state: 'attached', timeout: 8000 })
      await smoothScrollIntoView(code)
      await code.hover()
      const trig = p.locator('button[data-vexel-ui="true"]', { hasText: 'Save to file' }).first()
      await trig.waitFor({ state: 'visible', timeout: 6000 })
      await wait(450)
      await trig.click()
      const pathInput = p.locator('input[placeholder="folder/filename.ext"]')
      await pathInput.waitFor({ state: 'visible', timeout: 6000 })
      await pathInput.fill(CONFIG.savePath)
      await wait(700)
      await shot('07-code-save-popover')
      if (bridgeSafe) {
        await pathInput.press('Enter')
        const saved = await waitToast('Saved', 6000)
        await wait(450)
        await shot('07b-code-saved', { hiRes: false })
        await wait(600)
        const onDisk = fs.existsSync(path.join(WORKSPACE, CONFIG.savePath))
        if (saved && onDisk) {
          console.log(
            '  [ok] extension wrote a real file: ' +
              path.relative(ROOT, path.join(WORKSPACE, CONFIG.savePath))
          )
        } else {
          warn('code-save: toast=' + String(saved) + ' onDisk=' + String(onDisk))
        }
      } else {
        await p.keyboard.press('Escape')
      }
    }
  )
  await scene(
    'speed',
    'Floating TOC & Fast Virtualization — Jump across turns & export clean Markdown',
    async () => {
      const p = getPage()
      rec.speed = 4
      await wait(jitter(6500, 0.25))
      rec.speed = 1
      const inp = await focusPrompt()
      const baseline = await bodyLen()
      await inp.pressSequentially(CONFIG.queries.followUp, {
        delay: jitter(Math.round(28 * PACE), 0.3),
      })
      noteQuery(st)
      await p.keyboard.press('Enter')
      await waitAnswer(st, baseline + 80, 90000)
      await wait(450)
      await smoothScroll(-1900, 900)
      await wait(550)
      await p
        .locator('#vexel-toc-host .tick-wrap')
        .first()
        .hover()
        .catch(() => {})
      await wait(700)
      await smoothScroll(1900, 900)
      await wait(450)
      await p.keyboard.press('Alt+ArrowDown')
      await wait(850)
      await shot('08-long-thread-fast')
    }
  )
  await scene('outro', 'Vexel — Free & Open-Source for Chrome, Edge & Firefox', async () => {
    await getPage().evaluate(() => {
      document.documentElement.style.background = '#F8F9FA'
    })
    const repoLabel = ['github.com', 'elcoosp', 'vexel'].join('/')
    await showCard(
      'mk-outro',
      cardInner(
        'Vexel',
        'Free & Open-Source • Local-First • Zero Telemetry',
        'Available for Chrome, Edge & Firefox — ' + repoLabel
      )
    )
    await wait(2100)
  })
  await stopRecorder()
  finalizeScenes()
  const caps = await renderCaptions()
  const videoOk = assembleVideo(caps)
  if (!KEEP_FRAMES && videoOk) {
    fs.rmSync(FRAMES, { recursive: true, force: true })
    fs.rmSync(CAPS, { recursive: true, force: true })
  }
  noteRun(st)
  const elapsed = Math.round((Date.now() - t0) / 1000)
  writeAssetsMd(ver, extVersion, videoOk, elapsed)
  if (browser) await browser.close().catch(() => {})
  if (KEEP_OPEN) console.log('- KEEP_OPEN=1: Chrome and bridge left running')
  else cleanup()
  console.log('\nDone in ' + elapsed + 's. Assets in ' + path.relative(ROOT, OUT) + '/')
  console.log(
    videoOk
      ? '  vexel-demo.mp4 + vexel-demo.gif + ' + shots.length + ' PNGs + scenes/ + ASSETS.md'
      : '  ' + shots.length + ' PNGs + ASSETS.md (install ffmpeg for video)'
  )
  if (warnings.length) console.log('  ' + warnings.length + ' warning(s) - see ASSETS.md')
}
main().catch(async (e: unknown) => {
  const detail = e instanceof Error && e.stack ? e.stack : String(e)
  console.error('\n[failed] ' + detail)
  await stopRecorder().catch(() => {})
  if (!KEEP_OPEN) cleanup()
  process.exit(1)
})
