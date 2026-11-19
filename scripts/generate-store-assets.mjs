import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const extPath = path.resolve('packages/extension/dist');
assert.ok(fs.existsSync(path.join(extPath, 'manifest.json')), 'Build extension first via pnpm build');

const outDir = path.resolve('docs/assets');
fs.mkdirSync(outDir, { recursive: true });

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-marketing-profile-'));
const videoTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexel-marketing-video-'));

const REALISTIC_GOOGLE_AIM_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Google AI Mode — Vexel Workspace</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      color: #1f1f1f;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 32px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid #e8eaed;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 18px;
      font-weight: 600;
      color: #202124;
    }
    .pill-aim {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: #e8f0fe;
      color: #1a73e8;
    }
    main {
      max-width: 880px;
      margin: 0 auto;
      padding: 28px 24px 160px;
    }
    .turn-user {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 20px;
    }
    .user-bubble {
      max-width: 620px;
      background: #f1f3f4;
      color: #202124;
      padding: 14px 18px;
      border-radius: 20px 20px 4px 20px;
      font-size: 14.5px;
      line-height: 1.5;
    }
    .turn-ai {
      background: #ffffff;
      border: 1px solid #e8eaed;
      border-radius: 18px;
      padding: 22px 24px;
      box-shadow: 0 2px 10px rgba(32, 33, 36, 0.04);
      margin-bottom: 28px;
    }
    .turn-ai h3 {
      margin: 0 0 10px;
      font-size: 16px;
      color: #202124;
    }
    .turn-ai p {
      margin: 0 0 14px;
      font-size: 14px;
      line-height: 1.6;
      color: #3c4043;
    }
    pre {
      margin: 14px 0 0;
      background: #0f172a;
      color: #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      font-family: "JetBrains Mono", "SF Mono", Menlo, Monaco, monospace;
      font-size: 12.5px;
      line-height: 1.55;
    }
    .a2TNg {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: #1e293b;
      color: #94a3b8;
      font-size: 11.5px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    pre code {
      display: block;
      padding: 14px 16px;
      overflow-x: auto;
    }
    .tok-kw { color: #38bdf8; }
    .tok-fn { color: #a78bfa; }
    .tok-str { color: #34d399; }
    .tok-cm { color: #64748b; }
    .composer-dock {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 16px 24px 22px;
      background: linear-gradient(to top, #ffffff 78%, rgba(255,255,255,0));
    }
    .composer-box {
      max-width: 840px;
      margin: 0 auto;
      background: #f8f9fa;
      border: 1.5px solid #dadce0;
      border-radius: 24px;
      padding: 12px 18px;
      box-shadow: 0 6px 24px rgba(32, 33, 36, 0.08);
    }
    .o8Wipc {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    textarea#aim-prompt {
      width: 100%;
      border: none;
      outline: none;
      resize: none;
      background: transparent;
      font-family: inherit;
      font-size: 15px;
      line-height: 1.45;
      color: #202124;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>Google</span>
      <span class="pill-aim">AI Mode</span>
    </div>
    <div style="font-size: 12.5px; color: #5f6368;">acme-billing-service · main</div>
  </header>

  <main>
    <div class="CKgc1d" data-scope-id="turn">
      <div class="turn-user">
        <div class="user-bubble" jsname="eFVkfb">
          Harden our Stripe webhook handler against replay attacks and idempotency races in TypeScript.
        </div>
      </div>

      <div class="turn-ai" data-subtree="aimc">
        <h3>Idempotent Stripe Webhook Handler</h3>
        <p>
          Verify the HMAC signature first, then claim the event ID atomically in Redis with a 24-hour TTL before processing side effects:
        </p>
        <pre><div class="a2TNg">typescript</div><code class="language-ts"><span class="tok-cm">// src/billing/webhook-handler.ts</span>
<span class="tok-kw">import</span> Stripe <span class="tok-kw">from</span> <span class="tok-str">'stripe'</span>;
<span class="tok-kw">import</span> { redis } <span class="tok-kw">from</span> <span class="tok-str">'../infra/redis'</span>;

<span class="tok-kw">export async function</span> <span class="tok-fn">handleStripeWebhook</span>(rawBody: Buffer, sig: string) {
  <span class="tok-kw">const</span> event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  <span class="tok-kw">const</span> claimed = <span class="tok-kw">await</span> redis.set(\`stripe:evt:\${event.id}\`, <span class="tok-str">'1'</span>, { NX: <span class="tok-kw">true</span>, EX: 86400 });
  <span class="tok-kw">if</span> (!claimed) <span class="tok-kw">return</span> { status: 200, duplicate: <span class="tok-kw">true</span> };

  <span class="tok-kw">await</span> processBillingEvent(event);
  <span class="tok-kw">return</span> { status: 200, processed: event.id };
}</code></pre>
      </div>
    </div>

    <div class="composer-dock">
      <form class="composer-box">
        <div class="o8Wipc">
          <textarea id="aim-prompt" name="q" aria-label="Ask follow-up" rows="2" placeholder="Ask follow-up — type / for skills or @ for local files..."></textarea>
        </div>
      </form>
    </div>
  </main>
</body>
</html>`;

let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoTmpDir, size: { width: 1280, height: 800 } },
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-sandbox',
    ],
  });

  await context.route('https://google.com*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: REALISTIC_GOOGLE_AIM_HTML,
    });
  });

  const page = await context.newPage();
  await context.addInitScript(() => { try { localStorage.setItem('vexel:locale', 'en'); localStorage.setItem('vexel:popup-locale', 'en'); } catch {} });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('https://google.com?udm=50&q=stripe-webhook-hardening', { waitUntil: 'domcontentloaded' });

  // Shot 1: Onboarding Hero
  const onboardingHost = page.locator('#vexel-onboarding-host');
  await onboardingHost.waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outDir, '01-onboarding-hero.png') });

  // Advance onboarding smoothly for video, then close
  await onboardingHost.evaluate((el) => (el.shadowRoot?.querySelector('.btn-primary'))?.click());
  await page.waitForTimeout(450);
  await onboardingHost.evaluate((el) => (el.shadowRoot?.querySelector('.btn-primary'))?.click());
  await page.waitForTimeout(450);
  await onboardingHost.evaluate((el) => (el.shadowRoot?.querySelector('.btn-primary'))?.click());
  await onboardingHost.waitFor({ state: 'detached', timeout: 3000 });
  await page.waitForTimeout(250);

  // Shot 2: Slash "/" Command Palette with Skills
  const promptBox = page.locator('#aim-prompt');
  await promptBox.click();
  await promptBox.type('/', { delay: 80 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outDir, '02-slash-skills-palette.png') });

  // Select top skill via Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);

  // Shot 3: "@" Files & Zero-Server / Bridge Workspace Tab
  await promptBox.fill('');
  await promptBox.type('@', { delay: 80 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '03-at-files-workspace.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // Shot 4: Hover code block -> "Save to file" popover with auto-inferred path
  const codeBlock = page.locator('pre code');
  await codeBlock.hover();
  const saveTrigger = page.locator('button[data-vexel-ui="true"]', { hasText: 'Save to file' });
  await saveTrigger.waitFor({ state: 'visible', timeout: 3000 });
  await page.waitForTimeout(250);
  await saveTrigger.click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outDir, '04-code-save-popover.png') });

  await page.waitForTimeout(500);

  const videoPath = await page.video()?.path();
  await context.close();
  context = null;

  if (videoPath && fs.existsSync(videoPath)) {
    const destWebm = path.join(outDir, 'vexel-demo.webm');
    fs.copyFileSync(videoPath, destWebm);
    console.log('✓ Saved demo video:', destWebm);

    try {
      const destGif = path.join(outDir, 'vexel-demo.gif');
      execFileSync(
        'ffmpeg',
        ['-y', '-i', destWebm, '-vf', 'fps=14,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', destGif],
        { stdio: 'ignore' }
      );
      console.log('✓ Converted optimized README GIF:', destGif);
    } catch {
console.log('ℹ ffmpeg not found — kept high-res docs/assets/vexel-demo.webm');
}
}
console.log('✓ Generated 4 Chrome Web Store 1280x800 PNGs in docs/assets/');
} finally {
if (context) await context.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.rmSync(videoTmpDir, { recursive: true, force: true });
}
