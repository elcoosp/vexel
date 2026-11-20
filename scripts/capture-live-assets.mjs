#!/usr/bin/env node
/**
 * Vexel — LIVE marketing capture, v5.
 *
 *   pnpm marketing:assets
 *
 * v5 (anti-bot resilience):
 *  - Run governor: cooldown between runs + daily query cap + block cool-off
 *    (state in scripts/.capture-state.json). FORCE=1 overrides.
 *  - Human cadence: jittered typing/holds, spaced submissions.
 *  - /sorry/ + reCAPTCHA detection after every navigation/answer; INTERACTIVE=1
 *    pauses to solve once (profile persists), else aborts with guidance.
 *  - Signed-out warning; REQUIRE_SIGNIN=1 pauses until signed in.
 *
 * Kept from v4: shots with recorder PAUSED (no flash); captions right-anchored
 * (clear of input/toast/TOC); docs/logo.png in intro/outro; clamped CDP scroll
 * gestures + wheel nudges; per-scene watchdogs; consent iframe handling;
 * pre-readied page; bridge ownership; dock-button palette; CDP full-page shots.
 *
 * Env: CHROME_BIN, CDP_PORT=9222, VEXEL_PORT=49152, PACE=1, HEADLESS=1,
 *      INTERACTIVE=1, REQUIRE_SIGNIN=1, KEEP_OPEN=1, KEEP_FRAMES=1, SKIP_BUILD=1,
 *      OUT_DIR=docs/assets, COOLDOWN_MIN=15, BLOCK_COOLDOWN_MIN=60,
 *      MAX_QUERIES_DAY=12, FORCE=1
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const CONFIG = {
  repo: 'github.com/elcoosp/vexel',
  queries: {
    ask: 'Show a minimal TypeScript retry helper with exponential backoff for a Stripe webhook handler. Answer in under 120 words.',
    paste: 'The attached CI log is huge. What is the root cause of the failure? Answer in 2 sentences.',
    followUp: 'List 3 regression tests to add for this bug. One line each.',
  },
  savePath: 'src/billing/retry-helper.ts',
  gifScene: 'paste',
  gifMaxSeconds: 10,
  answerTimeoutMs: 120000,
};
const PORT = Number(process.env.CDP_PORT || 9222);
const BRIDGE_PORT = Number(process.env.VEXEL_PORT || 49152);
const PACE = Math.max(0.5, Number(process.env.PACE || 1));
const OUT = path.resolve(ROOT, process.env.OUT_DIR || 'docs/assets');
const FRAMES = path.join(OUT, '.frames');
const CAPS = path.join(OUT, '.caps');
const SCENES = path.join(OUT, 'scenes');
const EXT = path.join(ROOT, 'packages/extension/dist');
const PROFILE = path.join(ROOT, 'scripts/.chrome-profile');
const WORKSPACE = path.join(ROOT, 'scripts/.demo-workspace');
const STATE = path.join(ROOT, 'scripts/.capture-state.json');
const AIM_URL = 'https://www.google.com/search?udm=50&hl=en&gl=us';
const HEADLESS = process.env.HEADLESS === '1';
const INTERACTIVE = process.env.INTERACTIVE === '1';
const REQUIRE_SIGNIN = process.env.REQUIRE_SIGNIN === '1';
const KEEP_OPEN = process.env.KEEP_OPEN === '1';
const KEEP_FRAMES = process.env.KEEP_FRAMES === '1';
const SKIP_BUILD = process.env.SKIP_BUILD === '1';
const FORCE = process.env.FORCE === '1';
const COOLDOWN_MIN = Number(process.env.COOLDOWN_MIN || 15);
const BLOCK_COOLDOWN_MIN = Number(process.env.BLOCK_COOLDOWN_MIN || 60);
const MAX_QUERIES_DAY = Number(process.env.MAX_QUERIES_DAY || 12);
const FPS = 30, VW = 1440, VH = 810, W = 1920, H = 1080, BG = '0xF8F9FA';

let chromeProc = null, bridgeProc = null, bridgeSafe = false;
let browser = null, context = null, page = null, cdp = null;
let LOGO = '';
const warnings = [], shots = [], scenes = [];
let frameCount = 0;
const rec = { last: null, lastAt: 0, timer: null, freeze: false, speed: 1, tick: 0 };

function warn(msg) { warnings.push(msg); console.warn('  [warn] ' + msg); }
function wait(ms) { return page.waitForTimeout(Math.round(ms * PACE)); }
function jitter(base, spread = 0.25) { return Math.round(base * (1 + (Math.random() * 2 - 1) * spread)); }
function kill(k) {
  if (!k || k.killed) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(k.pid), '/T', '/F']);
    else k.kill('SIGTERM');
  } catch { }
}
function cleanup() { kill(chromeProc); kill(bridgeProc); chromeProc = null; bridgeProc = null; }
process.on('SIGINT', () => { console.log('\nInterrupted - cleaning up...'); cleanup(); process.exit(130); });

// ---------- run governor (stop hammering Google) ----------
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { runs: [], queries: [], blockedAt: 0 }; }
}
function saveState(s) { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch { } }
function governorCheck() {
  const now = Date.now();
  const st = loadState();
  st.runs = (st.runs || []).filter(t => now - t < 86400000);
  st.queries = (st.queries || []).filter(t => now - t < 86400000);
  saveState(st);
  if (FORCE) { console.log('- FORCE=1: governor bypassed'); return st; }
  if (st.blockedAt && now - st.blockedAt < BLOCK_COOLDOWN_MIN * 60000) {
    const left = Math.ceil((BLOCK_COOLDOWN_MIN * 60000 - (now - st.blockedAt)) / 60000);
    throw new Error('GOVERNOR: Google blocked this IP/profile recently. Wait ~' + left + ' min, then run once with INTERACTIVE=1 to solve the captcha and sign in (profile persists). FORCE=1 overrides.');
  }
  const last = st.runs.length ? st.runs[st.runs.length - 1] : 0;
  const gapMin = (now - last) / 60000;
  if (last && gapMin < COOLDOWN_MIN) {
    throw new Error('GOVERNOR: last capture was ' + gapMin.toFixed(1) + ' min ago; cooldown is ' + COOLDOWN_MIN + ' min to avoid anti-bot blocks. Wait, or FORCE=1 / COOLDOWN_MIN=0.');
  }
  if (st.queries.length >= MAX_QUERIES_DAY) {
    throw new Error('GOVERNOR: ' + st.queries.length + ' live queries in 24h (cap ' + MAX_QUERIES_DAY + '). Wait tomorrow or FORCE=1 / MAX_QUERIES_DAY=…');
  }
  return st;
}
function noteQuery(st) {
  st.queries.push(Date.now());
  saveState(st);
  if (!FORCE && st.queries.length > MAX_QUERIES_DAY) throw new Error('GOVERNOR: daily query cap reached mid-run.');
}
function noteRun(st) { st.runs.push(Date.now()); saveState(st); }
function noteBlock(st) { st.blockedAt = Date.now(); saveState(st); }

async function fetchJson(url, timeoutMs = 1500) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
async function waitFor(fn, ms, step = 400) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, step)); }
  return false;
}
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(cmd + ' ' + args.join(' ') + ' failed');
}
function haveFfmpeg() { return spawnSync('ffmpeg', ['-version']).status === 0; }
function ff(args) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error'].concat(args), { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + String(r.stderr || '').trim().slice(0, 300));
}
function thousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------- demo workspace + skill seeding (never overwrites existing files) ----------
function seedFile(rel, content) {
  const p = path.join(WORKSPACE, rel);
  if (fs.existsSync(p)) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function buildCiLog() {
  const lines = ['# acme-billing-service - CI run 4821 (main @ 9f31c2e)', ''];
  const mods = ['vite', 'tsc', 'eslint', 'vitest', 'stripe-mock', 'redis-mock'];
  const lvl = ['INFO', 'DEBUG', 'WARN'];
  for (let i = 0; i < 140; i++) {
    const t = '2026-11-18T09:' + String(10 + Math.floor(i / 60)).padStart(2, '0') + ':' + String(i % 60).padStart(2, '0') + 'Z';
    const msg = i % 7 === 0
      ? 'cache hit for chunk ' + (i % 23)
      : 'processed module src/billing/mod-' + i + '.ts (' + (120 + (i * 37) % 900) + ' ms)';
    lines.push('[' + t + '] ' + lvl[i % 3] + ' ' + mods[i % mods.length] + ': ' + msg);
  }
  lines.push('', ' FAIL  test/billing/webhook.replay.test.ts > Stripe webhook > rejects replayed event ids');
  lines.push('AssertionError: expected 200 to be 409 // duplicate event was processed twice');
  for (let i = 0; i < 48; i++) lines.push('    at processBillingEvent (src/billing/webhook-handler.ts:' + (40 + i) + ':' + (3 + i % 20) + ')');
  lines.push('', 'ERROR: Redis SET NX was awaited after side effects - race window of ~12ms under load.',
    'Test Files  1 failed | 17 passed (18)', '     Tests  1 failed | 212 passed (213)', '  Duration  41.2s');
  let text = lines.join('\n');
  while (text.length < 12000) text += '\n[trace] frame ' + text.length + ' - idempotency claim missing for evt_1Nx' + (text.length % 97);
  return text;
}
function seedWorkspace() {
  seedFile('package.json', JSON.stringify({ name: 'acme-billing-service', private: true, type: 'module', scripts: { test: 'vitest run' } }, null, 2) + '\n');
  seedFile('README.md', '# acme-billing-service\n\nStripe billing + webhook processing. Demo workspace used by Vexel live captures.\n');
  seedFile('src/infra/redis.ts', "import { createClient } from 'redis';\nexport const redis = createClient({ url: process.env.REDIS_URL });\nawait redis.connect();\n");
  seedFile('src/billing/webhook-handler.ts', [
    "import Stripe from 'stripe';",
    "import { redis } from '../infra/redis';",
    "const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);",
    '',
    'export async function handleStripeWebhook(rawBody: Buffer, sig: string) {',
    '  const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);',
    "  const claimed = await redis.set('stripe:evt:' + event.id, '1', { NX: true, EX: 86400 });",
    '  if (!claimed) return { status: 200, duplicate: true };',
    '  await processBillingEvent(event);',
    '  return { status: 200, processed: event.id };',
    '}',
  ].join('\n') + '\n');
  seedFile('logs/ci-failure.log', buildCiLog());
}
function seedSkill() {
  const dir = path.join(os.homedir(), '.agents', 'skills', 'vexel-demo-code-review');
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return false;
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [
    '---', 'name: demo-code-review',
    'description: Senior code review checklist for billing services (demo skill seeded by Vexel live capture).',
    '---', '',
    'Review the attached code as a staff engineer. Check, in order:',
    '1. Idempotency and replay safety (claim event IDs atomically before side effects).',
    '2. Async race conditions and lock ordering.',
    '3. Input validation and signature verification.',
    '4. Failure modes: retries, backoff, dead-letter handling.',
    'Propose the smallest safe patch. Ask for reference files only if needed.',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'references', 'checkout-flow.md'),
    '# Checkout flow reference\n\n' + 'Sequence: intent -> confirm -> webhook -> fulfill. '.repeat(60) + '\n');
  return true;
}

// ---------- chrome + bridge lifecycle ----------
function resolveChrome() {
  if (process.env.CHROME_BIN) {
    if (!fs.existsSync(process.env.CHROME_BIN)) throw new Error('CHROME_BIN not found: ' + process.env.CHROME_BIN);
    return process.env.CHROME_BIN;
  }
  let exe = '';
  try { exe = chromium.executablePath(); } catch { }
  if (exe && fs.existsSync(exe)) return exe;
  console.log('- Chromium missing, running: pnpm exec playwright install chromium');
  run('pnpm', ['exec', 'playwright', 'install', 'chromium']);
  exe = chromium.executablePath();
  if (!fs.existsSync(exe)) throw new Error('Chromium not found after install');
  return exe;
}
async function ensureChrome() {
  let ver = await fetchJson('http://127.0.0.1:' + PORT + '/json/version');
  if (ver) { console.log('- Reusing Chrome already on CDP :' + PORT + ' (' + ver.Browser + ')'); return ver; }
  const exe = resolveChrome();
  fs.mkdirSync(PROFILE, { recursive: true });
  const args = [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--load-extension=' + EXT,
    '--disable-extensions-except=' + EXT,
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--mute-audio',
    '--hide-scrollbars', '--force-color-profile=srgb', '--lang=en-US',
    '--disable-features=PaintHolding',
    '--window-size=1320,920', '--window-position=40,30',
  ];
  if (HEADLESS) args.push('--headless=new');
  if (process.platform === 'linux' && (process.getuid?.() === 0 || process.env.CI)) args.push('--no-sandbox');
  args.push('about:blank');
  console.log('- Launching ' + path.basename(exe) + '  --load-extension=' + path.relative(ROOT, EXT) + '  CDP :' + PORT);
  chromeProc = spawn(exe, args, { stdio: 'ignore' });
  const up = await waitFor(async () => !!(await fetchJson('http://127.0.0.1:' + PORT + '/json/version')), 30000, 500);
  if (!up) throw new Error('Chrome did not expose CDP on 127.0.0.1:' + PORT + ' (Linux deps: libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2)');
  return fetchJson('http://127.0.0.1:' + PORT + '/json/version');
}
async function ensureBridge() {
  const existing = await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/skills');
  if (existing) {
    const browse = await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/browse?dir=');
    const rootLabel = browse && browse.rootLabel;
    if (rootLabel === path.basename(WORKSPACE)) {
      bridgeSafe = true;
      console.log('- Reusing bridge on :' + BRIDGE_PORT + ' (already rooted at the demo workspace)');
      return;
    }
    console.log('- External bridge on :' + BRIDGE_PORT + ' is rooted at "' + (rootLabel || '?') + '".');
    console.log('  Stop it (Ctrl+C in its terminal) so the @ scene never shows your real folders.');
    console.log('  Waiting up to 20s for the port to free up...');
    const freed = await waitFor(async () => !(await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/skills', 700)), 20000, 1000);
    if (!freed) {
      warn('external bridge still running - @ scene shows "' + (rootLabel || '?') + '" and code-save will not write to disk');
      return;
    }
  }
  bridgeProc = spawn(process.execPath, [path.join(ROOT, 'packages/bridge/src/server.mjs')], {
    env: Object.assign({}, process.env, { VEXEL_PORT: String(BRIDGE_PORT), VEXEL_ROOT_DIR: WORKSPACE }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bridgeSafe = true;
  bridgeProc.stdout.on('data', d => process.stdout.write('  [bridge] ' + d));
  bridgeProc.stderr.on('data', d => process.stderr.write('  [bridge] ' + d));
  const up = await waitFor(async () => !!(await fetchJson('http://127.0.0.1:' + BRIDGE_PORT + '/skills')), 15000, 300);
  if (!up) throw new Error('Bridge failed to start on :' + BRIDGE_PORT);
}

// ---------- CDP screencast recorder (30 fps CFR, pausable for flash-free shots) ----------
async function startRecorder() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const prime = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  rec.last = Buffer.from(prime.data, 'base64');
  rec.lastAt = Date.now();
  const opts = { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 };
  await cdp.send('Page.startScreencast', opts);
  cdp.on('Page.screencastFrame', ev => {
    if (!rec.freeze) {
      rec.last = Buffer.from(ev.data, 'base64');
      rec.lastAt = Date.now();
    }
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => { });
  });
  rec.timer = setInterval(() => {
    if (!rec.last) return;
    rec.tick++;
    if (rec.speed > 1 && (rec.tick % rec.speed) !== 0) return;
    frameCount++;
    const fPath = path.join(FRAMES, 'f' + String(frameCount).padStart(6, '0') + '.jpg');
    fs.promises.writeFile(fPath, rec.last).catch(() => {});
    if (Date.now() - rec.lastAt > 2500) { rec.lastAt = Date.now(); cdp.send('Page.startScreencast', opts).catch(() => { }); }
  }, Math.round(1000 / FPS));
}
async function stopRecorder() {
  if (rec.timer) { clearInterval(rec.timer); rec.timer = null; }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => { });
}
function mark(name, caption) { scenes.push({ name, caption, start: frameCount }); }
function finalizeScenes() {
  for (let i = 0; i < scenes.length; i++) {
    scenes[i].end = i + 1 < scenes.length ? scenes[i + 1].start : frameCount;
    scenes[i].seconds = +((scenes[i].end - scenes[i].start) / FPS).toFixed(2);
  }
}

// ---------- smooth scrolling: CLAMPED + duration-capped (never hangs) ----------
async function smoothScroll(dy, speed = 900) {
  const info = await page.evaluate(() => ({
    y: window.scrollY || 0,
    max: Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight),
  })).catch(() => null);
  let dist = dy;
  if (info) dist = dy > 0 ? Math.min(dy, Math.max(0, info.max - info.y)) : Math.max(dy, -info.y);
  if (Math.abs(dist) < 4) return;
  const sp = Math.round(Math.max(speed, Math.abs(dist) / 2.5));
  try {
    const g = cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(VW / 2), y: Math.round(VH / 2),
      xDistance: 0, yDistance: -dist, speed: sp, gestureSourceType: 'mouse',
    });
    g.catch(() => { });
    await Promise.race([g, new Promise(r => setTimeout(r, 4000))]);
  } catch {
    await page.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), dist).catch(() => { });
    await page.waitForTimeout(600);
  }
}
async function scrollToTop() {
  await smoothScroll(-1000000, 1800);
  await wait(350);
}
async function smoothScrollIntoView(locator) {
  const y = await locator.evaluate(el => el.getBoundingClientRect().top + window.scrollY).catch(() => null);
  if (y === null) return;
  const cur = await page.evaluate(() => window.scrollY).catch(() => 0);
  await smoothScroll(Math.max(0, y - 160) - cur, 700);
  await wait(300);
}

// ---------- screenshots: recorder PAUSED => zero flash in the video ----------
async function fullShot(name) {
  const m = await cdp.send('Page.getLayoutMetrics');
  const size = m.cssContentSize || m.contentSize;
  const w = Math.min(1920, Math.ceil(size.width));
  const h = Math.min(8000, Math.ceil(size.height));
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  fs.writeFileSync(path.join(OUT, name + '-full.png'), Buffer.from(r.data, 'base64'));
  shots.push(name + '-full.png');
}
async function shot(name, opts = {}) {
  await wait(opts.settle === undefined ? 350 : opts.settle);
  rec.freeze = true;
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = 'mk-caret-hide';
    s.textContent = '*{caret-color:transparent !important;}';
    (document.head || document.documentElement).appendChild(s);
  }).catch(() => { });
  try {
    const base = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(base.data, 'base64'));
    shots.push(name + '.png');
    if (opts.hiRes !== false) {
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { x: 0, y: 0, width: VW, height: VH, scale: 2 } });
      fs.writeFileSync(path.join(OUT, name + '@2x.png'), Buffer.from(r.data, 'base64'));
      shots.push(name + '@2x.png');
    }
    if (opts.full) await fullShot(name);
  } finally {
    await page.evaluate(() => { const s = document.getElementById('mk-caret-hide'); if (s) s.remove(); }).catch(() => { });
    await page.waitForTimeout(200);
    rec.freeze = false;
  }
  console.log('  [shot] ' + name);
  await wait(opts.hold === undefined ? 650 : opts.hold);
}

// ---------- page helpers ----------
async function focusPrompt() {
  await smoothScroll(100000, 1600);
  await wait(200);
  const inp = page.locator('textarea:visible, [contenteditable="true"]:visible').last();
  await inp.waitFor({ state: 'visible', timeout: 15000 });
  await inp.click();
  return inp;
}
async function clearPrompt() {
  const inp = page.locator('textarea:visible, [contenteditable="true"]:visible').last();
  if ((await inp.count()) === 0) return;
  await inp.fill('').catch(async () => {
    await inp.click().catch(() => { });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
  });
}
function paletteOpen(timeout) {
  return page.waitForFunction(() => {
    const h = document.getElementById('vexel-inline-menu-host');
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector('.popover.open'));
  }, undefined, { timeout }).then(() => true).catch(() => false);
}
async function openPalette(trigger) {
  const inp = await focusPrompt();
  await inp.pressSequentially(trigger, { delay: jitter(Math.round(90 * PACE), 0.3) });
  if (!(await paletteOpen(5000))) throw new Error('palette did not open on "' + trigger + '"');
}
async function openPaletteViaDock() {
  await smoothScroll(100000, 1600);
  const dock = page.locator('#vexel-input-dock-host .dock-btn');
  await dock.waitFor({ state: 'visible', timeout: 8000 });
  await dock.hover();
  await wait(350);
  await dock.click();
  if (!(await paletteOpen(5000))) throw new Error('palette did not open via dock button');
}
async function ensureVexel(timeout) {
  const ok = await page.waitForSelector('#vexel-inline-menu-host', { state: 'attached', timeout }).then(() => true).catch(() => false);
  if (ok) return;
  const css = await page.locator('#vexel-fast-load-css').count().catch(() => 0);
  if (css > 0) { warn('Vexel CSS booster present but palette host not mounted yet'); return; }
  throw new Error('Vexel content script not detected on ' + page.url() + ' - branded Chrome >= 137 ignores --load-extension. Use the default bundled Chromium / Chrome for Testing, and check packages/extension/dist exists.');
}
function ensureVexelLater() { return ensureVexel(8000).catch(e => warn(e.message)); }
async function bodyLen() { return page.evaluate(() => (document.body && document.body.innerText || '').length).catch(() => -1); }

// ---------- anti-bot detection + recovery ----------
async function isBlocked() {
  const u = page.url();
  if (u.includes('/sorry/') || u.includes('google.com/sorry')) return true;
  return page.evaluate(() => {
    if (document.querySelector('iframe[src*="recaptcha"], #recaptcha, form[action*="sorry"]')) return true;
    const t = (document.body && document.body.innerText) || '';
    return /unusual traffic|trafic exceptionnel|Je ne suis pas un robot/i.test(t);
  }).catch(() => false);
}
async function ensureNotBlocked(st, stage) {
  if (!(await isBlocked())) return;
  noteBlock(st);
  if (INTERACTIVE) {
    await pause('Google anti-bot page at ' + stage + ': solve the captcha (and sign in) in the Chrome window');
    await page.goto(AIM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => { });
    await dismissConsent(8000);
    if (await isBlocked()) throw new Error('ANTIBOT: still blocked after manual solve at ' + stage);
    return;
  }
  throw new Error('ANTIBOT: Google /sorry/ rate block at ' + stage + '. This is IP/profile-level, not a script bug. Wait ~' + BLOCK_COOLDOWN_MIN + ' min, then run once with INTERACTIVE=1 to solve + sign in (profile persists). FORCE=1 bypasses the governor only.');
}
async function waitAnswer(st, minLen, timeoutMs = CONFIG.answerTimeoutMs) {
  const prevSpeed = rec.speed;
  rec.speed = 4;
  try {
  const t0 = Date.now();
  let last = -1, stable = 0;
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 2).catch(() => { });
  await page.waitForTimeout(800);
  await page.mouse.wheel(0, 2).catch(() => { });
  await page.waitForTimeout(1300);
  while (Date.now() - t0 < timeoutMs) {
    const len = await bodyLen();
    const stopBtn = await page.getByRole('button', { name: /stop|arrêter/i }).first().isVisible().catch(() => false);
    if (len > minLen && !stopBtn && last >= 0 && Math.abs(len - last) < 40) stable++; else stable = 0;
    last = len;
    if (stable >= 3) break;
    await page.waitForTimeout(700);
  }
  const more = page.getByRole('button', { name: /^(Show more|Afficher plus)$/ }).first();
  if (await more.isVisible().catch(() => false)) { await more.click().catch(() => { }); await page.waitForTimeout(900); }
  await page.waitForTimeout(800);
  await ensureNotBlocked(st, 'answer');
  await ensureVexelLater();
  } finally {
    rec.speed = prevSpeed;
  }
}
async function waitToast(substr, timeout) {
  return page.waitForFunction(s => {
    return Array.from(document.querySelectorAll('body > div')).some(d => {
      const t = d.textContent || '';
      return (t.startsWith('Vexel:') || t.startsWith('Vexel :')) && t.includes(s) && d.style.position === 'fixed';
    });
  }, substr, { timeout }).then(() => true).catch(() => false);
}

// ---------- consent: full-page redirect, IFRAME overlay, or inline dialog ----------
async function consentVisible() {
  if (page.url().includes('consent.google.')) return { scope: page };
  for (const f of page.frames()) {
    if (f !== page.mainFrame() && f.url().includes('consent.google.')) return { scope: f };
  }
  const b = page.getByRole('button', { name: /^(Reject all|Accept all|Tout refuser|Tout accepter)$/ }).first();
  if (await b.isVisible().catch(() => false)) return { scope: page, btn: b };
  return null;
}
async function dismissConsent(deadlineMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    const c = await consentVisible();
    if (!c) {
      if (Date.now() - t0 < 3500) { await page.waitForTimeout(600); continue; }
      return true;
    }
    let clicked = false;
    for (const name of ['Reject all', 'Tout refuser', 'Accept all', 'Tout accepter']) {
      const b = c.scope.getByRole('button', { name }).first();
      if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => { }); clicked = true; break; }
    }
    if (!clicked && c.btn) { await c.btn.click({ timeout: 3000 }).catch(() => { }); clicked = true; }
    if (!clicked) {
      const legacy = c.scope.locator('#L2AGLb').first();
      if ((await legacy.count().catch(() => 0)) > 0) { await legacy.click({ timeout: 3000 }).catch(() => { }); clicked = true; }
    }
    if (!clicked) { await page.waitForTimeout(700); continue; }
    await page.waitForTimeout(1800);
    await page.waitForLoadState('domcontentloaded').catch(() => { });
  }
  return !(await consentVisible());
}
async function pause(msg) {
  if (!INTERACTIVE) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('\n[paused] ' + msg + ' - then press Enter here... ');
  rl.close();
  return true;
}

// ---------- branded cards (logo) + captions (RIGHT side) ----------
function cardInner(title, sub, foot) {
  const hero = LOGO
    ? '<img src="data:image/png;base64,' + LOGO + '" style="width:112px;height:112px;border-radius:26px;object-fit:cover;box-shadow:0 12px 32px rgba(26,115,232,0.22);margin-bottom:6px;" alt="Vexel">'
    : '<div style="font-size:64px;font-weight:800;letter-spacing:-2px;color:#1f1f1f;">' + title + '</div>';
  return '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(1100px 620px at 50% 15%,#e8f0fe 0%,#f8f9fa 52%,#ffffff 100%);color:#1f1f1f;font-family:\'Google Sans\',-apple-system,BlinkMacSystemFont,\'Inter\',sans-serif;text-align:center;padding:32px;">'
    + '<div style="display:inline-flex;align-items:center;gap:8px;padding:5px 14px;border-radius:999px;background:#e8f0fe;border:1px solid #c6dafc;color:#1967d2;font-size:12px;font-weight:700;letter-spacing:0.06em;">VEXEL FOR GOOGLE AI MODE</div>'
    + hero
    + '<div style="font-size:36px;font-weight:700;letter-spacing:-0.025em;color:#1f1f1f;line-height:1.2;max-width:860px;">' + sub + '</div>'
    + '<div style="font-size:19px;color:#5f6368;font-weight:500;max-width:680px;line-height:1.45;">' + foot + '</div></div>';
}
async function showCard(id, html) {
  await page.evaluate(a => {
    const d = document.createElement('div');
    d.id = a.id;
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;opacity:0;transition:opacity .45s ease;';
    d.innerHTML = a.html;
    document.body.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '1'; }));
  }, { id, html });
}
async function hideCard(id) {
  await page.evaluate(i => {
    const d = document.getElementById(i);
    if (!d) return;
    d.style.opacity = '0';
    setTimeout(() => d.remove(), 500);
  }, id);
}
function captionHtml(text) {
  return '<div style="position:fixed;left:112px;top:74px;max-width:540px;background:rgba(255,255,255,0.96);border:1px solid #dadce0;border-radius:16px;padding:16px 22px;box-shadow:0 12px 32px rgba(60,64,67,0.14),0 2px 6px rgba(60,64,67,0.06);font-family:\'Google Sans\',-apple-system,BlinkMacSystemFont,\'Inter\',sans-serif;text-align:left;">'
    + '<div style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#1967d2;margin-bottom:4px;"><span style="width:7px;height:7px;border-radius:50%;background:#1a73e8;display:inline-block;"></span>VEXEL • GOOGLE AI MODE</div>'
    + '<div style="font-size:20px;font-weight:600;color:#1f1f1f;line-height:1.3;letter-spacing:-0.01em;">' + escHtml(text) + '</div></div>';
}
function waitStep(n) {
  return page.waitForFunction(k => {
    const h = document.getElementById('vexel-onboarding-host');
    const p = h && h.shadowRoot && h.shadowRoot.querySelector('.step-pill');
    return !!p && (p.textContent || '').includes('Step ' + k);
  }, n, { timeout: 5000 }).catch(() => { });
}
const SCENE_BUDGET = {
  intro: 20000, landing: 30000, onboarding: 60000, ask: 200000,
  paste: 220000, skills: 60000, files: 45000, save: 60000, speed: 200000, outro: 20000,
};
async function scene(name, caption, fn) {
  mark(name, caption);
  console.log('> ' + name + ' - ' + caption);
  const budget = SCENE_BUDGET[name] || 60000;
  let timer = null;
  const work = fn();
  work.catch(() => { });
  try {
    await Promise.race([
      work,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('scene budget exceeded (' + Math.round(budget / 1000) + 's)')), budget); }),
    ]);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    if (m.startsWith('ANTIBOT') || m.startsWith('GOVERNOR')) throw e;
    warn(name + ': ' + m);
  }
  finally { if (timer) clearTimeout(timer); }
  await wait(jitter(500, 0.4));
}

// ---------- captions rendered in-browser (transparent PNGs, no font deps) ----------
async function renderCaptions() {
  const caps = new Map();
  const uniq = [];
  for (const s of scenes) {
    if (s.caption && s.name !== 'intro' && s.name !== 'outro' && !uniq.includes(s.caption)) uniq.push(s.caption);
  }
  if (!uniq.length) return caps;
  fs.mkdirSync(CAPS, { recursive: true });
  let cp = null;
  try {
    cp = await context.newPage();
    await cp.setViewportSize({ width: W, height: H });
    for (let i = 0; i < uniq.length; i++) {
      await cp.setContent('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style></head><body>' + captionHtml(uniq[i]) + '</body></html>');
      await cp.waitForTimeout(150);
      const file = path.join(CAPS, 'cap-' + i + '.png');
      await cp.screenshot({ path: file, omitBackground: true });
      caps.set(uniq[i], file);
    }
  } catch (e) {
    warn('caption rendering failed: ' + (e && e.message ? e.message : String(e)));
  }
  if (cp) await cp.close().catch(() => { });
  return caps;
}

// ---------- ffmpeg post-production ----------
function assembleVideo(caps) {
  if (!haveFfmpeg()) {
    warn('ffmpeg not found - raw frames kept in ' + FRAMES + ' (install: brew install ffmpeg / sudo apt install ffmpeg)');
    return false;
  }
  const listPath = path.join(OUT, '.concat.txt');
  const list = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const n = s.end - s.start;
    if (n < 2) continue;
    const file = path.join(SCENES, String(i).padStart(2, '0') + '-' + s.name + '.mp4');
    const base = 'scale=' + (W - 160) + ':' + (H - 90) + ':force_original_aspect_ratio=decrease,drawbox=x=0:y=0:w=iw:h=ih:color=0xDADCE0:t=2,pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2:color=' + BG;
    let fade = '';
    if (i === 0) fade = ',fade=t=in:st=0:d=0.5';
    if (i === scenes.length - 1 && s.seconds > 1.4) fade = ',fade=t=out:st=' + (s.seconds - 0.6).toFixed(2) + ':d=0.6';
    const cap = caps.get(s.caption);
    const common = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-r', String(FPS), '-frames:v', String(n), file];
    if (cap) {
      ff(['-framerate', String(FPS), '-start_number', String(s.start + 1), '-i', path.join(FRAMES, 'f%06d.jpg'),
        '-loop', '1', '-i', cap,
        '-filter_complex', '[0:v]' + base + '[bg];[1:v]format=rgba,fade=t=in:st=0.15:d=0.25:alpha=1[cap];[bg][cap]overlay=0:0' + fade + ',format=yuv420p'].concat(common));
    } else {
      ff(['-framerate', String(FPS), '-start_number', String(s.start + 1), '-i', path.join(FRAMES, 'f%06d.jpg'),
        '-vf', base + fade + ',format=yuv420p'].concat(common));
    }
    list.push("file '" + file + "'");
  }
  fs.writeFileSync(listPath, list.join('\n') + '\n');
  const mp4 = path.join(OUT, 'vexel-demo.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', mp4]);
  fs.rmSync(listPath, { force: true });
  const highlightNames = ['skills', 'files', 'save', 'paste'];
  const gifClips = [];
  for (const hName of highlightNames) {
    const idx = scenes.findIndex(s => s.name === hName && (s.end - s.start) > FPS);
    if (idx >= 0) {
      const srcClip = path.join(SCENES, String(idx).padStart(2, '0') + '-' + scenes[idx].name + '.mp4');
      const trimClip = path.join(SCENES, 'gif-' + hName + '.mp4');
      ff(['-i', srcClip, '-t', '3.5', '-c', 'copy', trimClip]);
      gifClips.push(trimClip);
    }
  }
  const gifListPath = path.join(OUT, '.gif-concat.txt');
  const gifInputMp4 = path.join(SCENES, 'gif-reel.mp4');
  if (gifClips.length > 0) {
    fs.writeFileSync(gifListPath, gifClips.map(c => "file '" + c + "'").join('\n') + '\n');
    ff(['-f', 'concat', '-safe', '0', '-i', gifListPath, '-c', 'copy', gifInputMp4]);
    fs.rmSync(gifListPath, { force: true });
    ff(['-i', gifInputMp4, '-vf',
      'fps=14,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0', path.join(OUT, 'vexel-demo.gif')]);
  }
  const ask = scenes.find(s => s.name === 'ask');
  const posterT = ask ? ((ask.start + (ask.end - ask.start) / 2) / FPS).toFixed(2) : '2';
  ff(['-i', mp4, '-ss', posterT, '-frames:v', '1', path.join(OUT, 'poster.png')]);
  const hero = ['02-ai-mode-answer@2x.png', '00-ai-mode-landing@2x.png'].map(f => path.join(OUT, f)).find(f => fs.existsSync(f));
  if (hero) ff(['-i', hero, '-vf', 'scale=1280:640:force_original_aspect_ratio=increase,crop=1280:640', path.join(OUT, 'github-social-1280x640.png')]);
  return true;
}
function writeAssetsMd(ver, extVersion, videoOk, elapsed) {
  const mb = p => (fs.statSync(p).size / 1048576).toFixed(1) + ' MB';
  const lines = [
    '# Vexel marketing assets - LIVE capture (v5)', '',
    'Captured ' + new Date().toISOString() + ' against **real Google AI Mode** (udm=50), no mocks.',
    'Browser: ' + (ver && ver.Browser || '?') + ' - Extension: v' + extVersion + ' - Bridge: 127.0.0.1:' + BRIDGE_PORT + ' - CDP: 127.0.0.1:' + PORT + ' - PACE: ' + PACE, '',
    'Anti-bot: run governor + jittered cadence + /sorry/ recovery; shots recorder-paused; captions right; logo from docs/logo.png.', '',
    '## Video', '',
    videoOk ? '- vexel-demo.mp4 (' + mb(path.join(OUT, 'vexel-demo.mp4')) + ', 1920x1080@30, captioned scenes)\n- vexel-demo.gif (' + mb(path.join(OUT, 'vexel-demo.gif')) + ', README-ready)\n- scenes/*.mp4 - individual clips for short cuts\n- poster.png, github-social-1280x640.png' : '- ffmpeg missing: frames kept in .frames/', '',
    '## Screenshots (1280x800 = Chrome Web Store; @2x = 2560x1600 heroes)', '',
    shots.map(s => '- ' + s).join('\n'), '',
    '## Storyboard', '',
    '| # | Scene | Seconds | Caption |', '|---|-------|---------|---------|',
    scenes.map((s, i) => '| ' + i + ' | ' + s.name + ' | ' + s.seconds + ' | ' + (s.caption || '') + ' |').join('\n'), '',
    '## Prompts used (real queries)', '',
    Object.entries(CONFIG.queries).map(([k, v]) => '- **' + k + '**: ' + v).join('\n'), '',
    '## Warnings', '',
    warnings.length ? warnings.map(w => '- ' + w).join('\n') : 'None.', '',
    'Regenerate: pnpm marketing:assets (knobs: PACE, INTERACTIVE=1, REQUIRE_SIGNIN=1, FORCE=1, COOLDOWN_MIN, MAX_QUERIES_DAY...).',
    'Elapsed: ' + elapsed + 's.', '',
  ];
  fs.writeFileSync(path.join(OUT, 'ASSETS.md'), lines.join('\n'));
  fs.writeFileSync(path.join(OUT, 'scenes.json'), JSON.stringify({ fps: FPS, pace: PACE, scenes }, null, 2));
}

// ---------- main ----------
async function main() {
  const t0 = Date.now();
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node 20+ required');
  if (!fs.existsSync(path.join(ROOT, 'packages/extension'))) throw new Error('Run this at the repo root (packages/extension missing)');
  const st = governorCheck();
  if (!SKIP_BUILD) { console.log('- pnpm build'); run('pnpm', ['build']); }
  if (!fs.existsSync(path.join(EXT, 'manifest.json'))) throw new Error('Missing ' + EXT + '/manifest.json - run pnpm build');
  const extVersion = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version || '?';
  try { LOGO = fs.readFileSync(path.join(ROOT, 'docs/logo.png')).toString('base64'); } catch { LOGO = ''; }
  if (LOGO) console.log('- Using docs/logo.png in intro/outro cards');
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SCENES, { recursive: true });
  seedWorkspace();
  if (seedSkill()) console.log('- Seeded ~/.agents/skills/vexel-demo-code-review (existing skills untouched)');
  const ver = await ensureChrome();
  await ensureBridge();

  browser = await chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  context = browser.contexts()[0];
  if (!context) throw new Error('No browser context over CDP');
  page = context.pages()[0] || (await context.newPage());
  await page.bringToFront();
  await context.addInitScript(() => { try { localStorage.setItem('vexel:locale', 'en'); localStorage.setItem('vexel:popup-locale', 'en'); } catch {} });
  await page.setViewportSize({ width: VW, height: VH });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.google.com' }).catch(() => { });
  cdp = await context.newCDPSession(page);

  // ---- PRE-READY: everything ugly happens BEFORE the recorder starts ----
  console.log('- Preparing page (consent, anti-bot, extension) before recording...');
  await page.goto(AIM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await dismissConsent(10000);
  if (INTERACTIVE) {
    await pause('Solve any Google captcha and sign in inside the Chrome window, then press Enter here');
    await dismissConsent(5000);
  }
  await ensureNotBlocked(st, 'landing');
  const signedOut = await page.getByRole('link', { name: 'Sign in' }).first().isVisible().catch(() => false);
  if (signedOut) {
    console.log('- NOTE: signed-out session. For fewer anti-bot challenges run once with INTERACTIVE=1 and sign in; the profile persists.');
    if (REQUIRE_SIGNIN) {
      if (!(await pause('REQUIRE_SIGNIN=1: sign in now in the Chrome window'))) throw new Error('REQUIRE_SIGNIN=1 but INTERACTIVE=0; cannot sign in headlessly.');
    }
  }
  await ensureVexel(20000);
  await page.waitForTimeout(900);
  await startRecorder();

  const pasteLog = fs.readFileSync(path.join(WORKSPACE, 'logs/ci-failure.log'), 'utf8');
  const pasteCaption = 'Paste ' + thousands(pasteLog.length) + ' chars -> auto-attached as a file. Zero truncation.';

  await scene('intro', 'Vexel - live on Google AI Mode', async () => {
    await showCard('mk-intro', cardInner('Vexel', 'Local Coding Workspace for Google AI Mode', 'Slash skills (/), local repo context (@), 1-click file save & fast thread virtualization.'));
    await wait(2300);
    await hideCard('mk-intro');
    await wait(550);
  });

  await scene('onboarding', 'First-run tour - keyboard-first, 3 steps', async () => {
    const host = page.locator('#vexel-onboarding-host');
    if ((await host.count()) === 0) {
      await openPaletteViaDock().catch(() => openPalette('/'));
      await page.locator('#vexel-inline-menu-host').getByRole('button', { name: '?', exact: true }).click({ timeout: 5000 }).catch(() => { });
      await wait(400);
    }
    await host.waitFor({ state: 'attached', timeout: 6000 });
    await wait(800);
    await shot('01-onboarding-hero');
    await host.locator('.demo-chip').nth(1).click().catch(() => { });
    await wait(700);
    await host.locator('.btn-primary').click();
    await waitStep(2);
    await wait(600);
    await host.locator('.btn-primary').click();
    await waitStep(3);
    await wait(600);
    await shot('01b-onboarding-shortcuts', { hiRes: false });
    await host.locator('.btn-primary').click();
    await host.waitFor({ state: 'detached', timeout: 6000 });
    await clearPrompt();
    await wait(400);
  });

  await scene('landing', 'Real Google AI Mode - no mocks, live over CDP', async () => {
    await wait(700);
    await page.locator('#vexel-input-dock-host .dock-btn').hover().catch(() => { });
    await wait(500);
    await shot('00-ai-mode-landing');
  });

  await scene('ask', 'Ask once - the real answer streams in', async () => {
    const inp = await focusPrompt();
    const baseline = await bodyLen();
    await inp.pressSequentially(CONFIG.queries.ask, { delay: jitter(Math.round(38 * PACE), 0.3) });
    await wait(jitter(450, 0.3));
    noteQuery(st);
    await page.keyboard.press('Enter');
    await waitAnswer(st, baseline + 150);
    await scrollToTop();
    await wait(700);
    await shot('02-ai-mode-answer', { full: true });
    await smoothScroll(Math.round(VH * 0.65), 420);
    await wait(700);
  });

  await scene('paste', pasteCaption, async () => {
    await ensureVexelLater();
    rec.speed = 4; await wait(jitter(6500, 0.25)); rec.speed = 1;
    const inp = await focusPrompt();
    let ok = false;
    try {
      await page.evaluate(t => navigator.clipboard.writeText(t), pasteLog);
      const mod = process.platform === 'darwin' ? 4 : 2;
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers: mod, commands: ['paste'] });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86, modifiers: mod });
      ok = await waitToast('attached', 2500);
    } catch { }
    if (!ok) {
      await page.evaluate(t => {
        const el = document.activeElement || document.querySelector('textarea, [contenteditable="true"]');
        const dt = new DataTransfer();
        dt.setData('text/plain', t);
        el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      }, pasteLog);
      ok = await waitToast('attached', 4000);
    }
    if (!ok) throw new Error('paste interception toast not seen (AI Mode variant may lack input[type=file])');
    await shot('03-paste-to-file');
    await wait(1300);
    const baseline = await bodyLen();
    await inp.pressSequentially(' ' + CONFIG.queries.paste, { delay: jitter(Math.round(20 * PACE), 0.3) });
    noteQuery(st);
    await page.keyboard.press('Enter');
    await waitAnswer(st, baseline + 100, 90000);
    await smoothScroll(100000, 1400);
    await wait(500);
    await shot('03b-paste-answer');
  });

  await scene('skills', 'One click on the Vexel dock - your skills palette', async () => {
    await ensureVexelLater();
    await clearPrompt();
    await openPaletteViaDock().catch(() => openPalette('/'));
    await wait(750);
    await shot('04-slash-skills-palette');
    await page.keyboard.press('ArrowDown'); await wait(jitter(450, 0.3));
    await page.keyboard.press('ArrowDown'); await wait(jitter(450, 0.3));
    await page.keyboard.press('Enter'); await wait(800);
    await shot('05-skill-injected', { hiRes: false });
    await clearPrompt();
  });

  await scene('files', 'Type @ - browse and attach local project files', async () => {
    await clearPrompt();
    const inp = await focusPrompt();
    await inp.pressSequentially('@', { delay: jitter(Math.round(90 * PACE), 0.3) });
    if (!(await paletteOpen(5000))) throw new Error('palette did not open on "@"');
    await wait(1300);
    await shot('06-at-files-workspace');
    await wait(500);
    await page.keyboard.press('Escape');
    await wait(350);
    await clearPrompt();
  });

  await scene('save', 'Hover code - Save to file, straight to disk', async () => {
    const code = page.locator('pre code').first();
    await code.waitFor({ state: 'attached', timeout: 8000 });
    await smoothScrollIntoView(code);
    await code.hover();
    const trig = page.locator('button[data-vexel-ui="true"]', { hasText: 'Save to file' }).first();
    await trig.waitFor({ state: 'visible', timeout: 6000 });
    await wait(450);
    await trig.click();
    const pathInput = page.locator('input[placeholder="folder/filename.ext"]');
    await pathInput.waitFor({ state: 'visible', timeout: 6000 });
    await pathInput.fill(CONFIG.savePath);
    await wait(700);
    await shot('07-code-save-popover');
    if (bridgeSafe) {
      await pathInput.press('Enter');
      const saved = await waitToast('Saved', 6000);
      await wait(450);
      await shot('07b-code-saved', { hiRes: false });
      await wait(600);
      const onDisk = fs.existsSync(path.join(WORKSPACE, CONFIG.savePath));
      if (saved && onDisk) console.log('  [ok] extension wrote a real file: ' + path.relative(ROOT, path.join(WORKSPACE, CONFIG.savePath)));
      else warn('code-save: toast=' + saved + ' onDisk=' + onDisk);
    } else {
      await page.keyboard.press('Escape');
    }
  });

  await scene('speed', 'Long threads stay instant - off-screen turns virtualized', async () => {
    rec.speed = 4; await wait(jitter(6500, 0.25)); rec.speed = 1;
    const inp = await focusPrompt();
    const baseline = await bodyLen();
    await inp.pressSequentially(CONFIG.queries.followUp, { delay: jitter(Math.round(28 * PACE), 0.3) });
    noteQuery(st);
    await page.keyboard.press('Enter');
    await waitAnswer(st, baseline + 80, 90000);
    await wait(500);
    await smoothScroll(-1900, 900);
    await wait(650);
    await smoothScroll(1900, 900);
    await wait(500);
    await page.keyboard.press('Alt+ArrowDown');
    await wait(950);
    await shot('08-long-thread-fast');
  });

  await scene('outro', 'Star it on GitHub', async () => {
    await page.evaluate(() => { document.documentElement.style.background = '#F8F9FA'; });
    const repoLabel = ['github.com', 'elcoosp', 'vexel'].join('/');
    await showCard('mk-outro', cardInner('Vexel', 'Open-Source • Local-First • Zero Telemetry', repoLabel));
    await wait(2700);
  });

  await stopRecorder();
  finalizeScenes();
  const caps = await renderCaptions();
  const videoOk = assembleVideo(caps);
  if (!KEEP_FRAMES && videoOk) {
    fs.rmSync(FRAMES, { recursive: true, force: true });
    fs.rmSync(CAPS, { recursive: true, force: true });
  }
  noteRun(st);
  const elapsed = Math.round((Date.now() - t0) / 1000);
  writeAssetsMd(ver, extVersion, videoOk, elapsed);
  if (browser) await browser.close().catch(() => { });
  if (KEEP_OPEN) console.log('- KEEP_OPEN=1: Chrome and bridge left running');
  else cleanup();
  console.log('\nDone in ' + elapsed + 's. Assets in ' + path.relative(ROOT, OUT) + '/');
  console.log(videoOk ? '  vexel-demo.mp4 + vexel-demo.gif + ' + shots.length + ' PNGs + scenes/ + ASSETS.md' : '  ' + shots.length + ' PNGs + ASSETS.md (install ffmpeg for video)');
  if (warnings.length) console.log('  ' + warnings.length + ' warning(s) - see ASSETS.md');
}

main().catch(async e => {
  console.error('\n[failed] ' + (e && e.stack ? e.stack : e));
  await stopRecorder().catch(() => { });
  if (!KEEP_OPEN) cleanup();
  process.exit(1);
});
