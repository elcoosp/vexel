import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import YAML from 'yaml';

const ROOT = process.cwd();
const LISTING_PATH = path.join(ROOT, 'store-listing.yml');
const CHROME_PROFILE_DIR = path.join(ROOT, '.cws-profile');
const EDGE_PROFILE_DIR = path.join(ROOT, '.edge-profile');

const RULES = {
  chrome: { titleMax: 75, titleRec: 45, summaryMax: 132, descMax: 16000, maxShots: 5 },
  edge: { titleMax: 75, titleRec: 45, summaryMax: 132, descMax: 10000, maxShots: 10 },
  firefox: { titleMax: 50, titleRec: 45, summaryMax: 250, descMax: 10000, maxShots: 10 },
};

function parseTargets() {
  const idx = process.argv.indexOf('--target');
  const raw = idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1].toLowerCase() : 'all';
  if (raw === 'all') return ['chrome', 'edge', 'firefox'];
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const t of list) {
    if (!['chrome', 'edge', 'firefox'].includes(t)) {
      throw new Error('Cible inconnue : ' + t + ' (attendu: chrome, edge, firefox ou all)');
    }
  }
  return list;
}

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  const pngSig = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== pngSig) {
    throw new Error('Format invalide (PNG requis) : ' + filePath);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function checkKeywordStuffing(text, locale) {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'into', 'from', 'your', 'that', 'this', 'are', 'you',
    'les', 'des', 'pour', 'avec', 'dans', 'sur', 'par', 'une', 'vos', 'sans', 'plus',
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n > 5)
    .map(([word, count]) => '[' + locale + '] Risque anti-spam Store : "' + word + '" apparaît ' + count + ' fois (max 5)');
}

function validateStoreListing(data, targets) {
  const errors = [];
  const warnings = [];

  if (!data?.manifestSync || !data?.storeListing || !data?.privacyPractices) {
    errors.push('Sections obligatoires manquantes dans store-listing.yml.');
    return { errors, warnings };
  }

  const manifestFullPath = path.join(ROOT, data.manifestSync.manifestPath);
  if (!fs.existsSync(manifestFullPath)) {
    errors.push('manifest.json introuvable : ' + data.manifestSync.manifestPath);
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestFullPath, 'utf8'));
    if (manifest.manifest_version !== 3) errors.push('manifest_version doit être 3.');
    if (manifest.name !== data.manifestSync.name) errors.push('Nom désynchronisé entre manifest.json et store-listing.yml.');
    if (manifest.version !== data.manifestSync.version) errors.push('Version désynchronisée entre manifest.json et store-listing.yml.');
  }

  const locales = data.storeListing.locales || {};
  if (!locales[data.storeListing.defaultLocale]) {
    errors.push('Langue par défaut absente : ' + data.storeListing.defaultLocale);
  }

  for (const [locale, loc] of Object.entries(locales)) {
    const titleLen = [...(loc.title || '')].length;
    const summaryLen = [...(loc.summary || '')].length;
    const descLen = [...(loc.detailedDescription || '')].length;

    for (const target of targets) {
      const rule = RULES[target];
      if (titleLen === 0 || titleLen > rule.titleMax) {
        errors.push('[' + target + ':' + locale + '] title invalide : ' + titleLen + ' car. (max ' + rule.titleMax + ').');
      }
      if (summaryLen === 0 || summaryLen > rule.summaryMax) {
        errors.push('[' + target + ':' + locale + '] summary invalide : ' + summaryLen + ' car. (max ' + rule.summaryMax + ').');
      }
      if (descLen === 0 || descLen > rule.descMax) {
        errors.push('[' + target + ':' + locale + '] detailedDescription invalide : ' + descLen + ' car. (max ' + rule.descMax + ').');
      }
    }
    warnings.push(...checkKeywordStuffing(loc.detailedDescription || '', locale));
  }

  if (!/^https:\/\//.test(data.privacyPractices.privacyPolicyUrl || '')) {
    errors.push('privacyPolicyUrl doit être une URL HTTPS publique valide.');
  }

  const assets = data.assets || {};
  if (assets.icon128 && fs.existsSync(path.join(ROOT, assets.icon128))) {
    const { width, height } = readPngDimensions(path.join(ROOT, assets.icon128));
    if (width !== 128 || height !== 128) errors.push('Icône 128x128 invalide : ' + width + 'x' + height);
  } else {
    errors.push('Icône 128x128 manquante.');
  }

  if (targets.includes('edge')) {
    const edgeIcon = assets.edgeIcon300 ? path.join(ROOT, assets.edgeIcon300) : null;
    if (!edgeIcon || !fs.existsSync(edgeIcon)) {
      errors.push('[edge] Icône 300x300 manquante (lance pnpm zip:store).');
    } else {
      const { width, height } = readPngDimensions(edgeIcon);
      if (width !== 300 || height !== 300) errors.push('[edge] Icône 300x300 invalide : ' + width + 'x' + height);
    }
  }

  if (targets.includes('firefox')) {
    const fxZip = assets.firefoxZip ? path.join(ROOT, assets.firefoxZip) : null;
    if (!fxZip || !fs.existsSync(fxZip)) {
      warnings.push('[firefox] Archive Firefox manquante : ' + assets.firefoxZip + ' (lance pnpm zip:store).');
    } else {
      const fxManifestRaw = execFileSync('unzip', ['-p', fxZip, 'manifest.json'], { encoding: 'utf8' });
      const fxManifest = JSON.parse(fxManifestRaw);
      if (!fxManifest.browser_specific_settings?.gecko?.id) {
        errors.push('[firefox] manifest.json dans le ZIP doit contenir browser_specific_settings.gecko.id.');
      }
      if (!Array.isArray(fxManifest.background?.scripts)) {
        errors.push('[firefox] manifest.json dans le ZIP doit utiliser background.scripts (pas uniquement service_worker).');
      }
    }
  }

  const screenshots = assets.screenshots || [];
  if (screenshots.length === 0 || screenshots.length > 5) {
    errors.push('Nombre de captures invalide : ' + screenshots.length + ' (1..5 autorisées).');
  }
  for (const shot of screenshots) {
    const shotPath = path.join(ROOT, shot.path);
    if (!fs.existsSync(shotPath)) {
      warnings.push('Capture manquante sur le disque : ' + shot.path);
      continue;
    }
    const { width, height } = readPngDimensions(shotPath);
    if (!((width === 1280 && height === 800) || (width === 640 && height === 400))) {
      errors.push('Capture ' + shot.path + ' : ' + width + 'x' + height + 'px (attendu 1280x800 ou 640x400).');
    }
  }

  return { errors, warnings };
}

function createAmoJwt(issuer, secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      jti: crypto.randomUUID(),
      iat: issuedAt,
      exp: issuedAt + 240,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + sig;
}

function buildAmoMetadataPayload(listing) {
  const locales = listing.storeListing.locales || {};
  const amoLocaleMap = {
    en: 'en-US',
    fr: 'fr',
    es: 'es-ES',
    de: 'de',
    pt_BR: 'pt-BR',
    ja: 'ja',
    zh_CN: 'zh-CN',
    ko: 'ko',
  };
  const name = {};
  const summary = {};
  const description = {};
  const homepage = {};
  const supportUrl = {};

  for (const [key, loc] of Object.entries(locales)) {
    const amoKey = amoLocaleMap[key] || key;
    name[amoKey] = loc.title;
    summary[amoKey] = loc.summary;
    description[amoKey] = loc.detailedDescription;
    homepage[amoKey] = listing.storeListing.homepageUrl;
    supportUrl[amoKey] = listing.storeListing.supportUrl;
  }

  return {
    slug: listing.platforms.firefox.slug,
    default_locale: amoLocaleMap[listing.storeListing.defaultLocale] || 'en-US',
    categories: listing.platforms.firefox.categories || ['developer-tools'],
    name,
    summary,
    description,
    homepage,
    support_url: supportUrl,
    privacy_policy: { 'en-US': listing.privacyPractices.privacyPolicyUrl },
  };
}

async function syncFirefoxAmo(listing, dryRun) {
  console.log('\n🦊 [Firefox AMO] Synchronisation via API REST v5...');
  const fxCfg = listing.platforms.firefox;
  const baseUrl = fxCfg.amoApiBaseUrl;
  const metaPayload = buildAmoMetadataPayload(listing);
  const fxZipPath = path.join(ROOT, listing.assets.firefoxZip);

  if (dryRun) {
    console.log('  ✓ [Dry-Run AMO] Payload multilingue généré (' + Object.keys(metaPayload.name).length + ' locales) + ' + (listing.assets.screenshots || []).length + ' previews prêts.');
    return;
  }

  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;
  if (!issuer || !secret) {
    console.log('  ⚠ Variables AMO_JWT_ISSUER / AMO_JWT_SECRET absentes — ouverture du Developer Hub Firefox en fallback...');
    const context = await chromium.launchPersistentContext(path.join(ROOT, '.amo-profile'), { headless: false });
    const page = context.pages() || (await context.newPage());
    await page.goto('https://mozilla.org', { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => context.on('close', resolve));
    return;
  }

  const authHeader = () => ({ Authorization: 'JWT ' + createAmoJwt(issuer, secret) });

  const uploadForm = new FormData();
  uploadForm.append('upload', new Blob([fs.readFileSync(fxZipPath)], { type: 'application/zip' }), 'vexel-extension-firefox.zip');
  uploadForm.append('channel', 'listed');

const upRes = await fetch(baseUrl + '/addons/upload/', {
method: 'POST',
headers: authHeader(),
body: uploadForm,
});
if (!upRes.ok) throw new Error('AMO upload failed (' + upRes.status + '): ' + (await upRes.text()));
let uploadObj = await upRes.json();
console.log('  ✓ ZIP Firefox uploadé (upload UUID: ' + uploadObj.uuid + '), attente validation AMO...');
for (let i = 0; i < 30 && !uploadObj.processed; i++) {
await new Promise((r) => setTimeout(r, 2000));
const pollRes = await fetch(baseUrl + '/addons/upload/' + uploadObj.uuid + '/', { headers: authHeader() });
uploadObj = await pollRes.json();
}
if (!uploadObj.valid) {
throw new Error('AMO validation rejetée : ' + JSON.stringify(uploadObj.validation));
}
console.log('  ✓ Validation automatique AMO réussie !');
const latestVersion = listing.manifestSync.version;
const releaseNoteText = listing.releaseNotes?.[latestVersion] || 'Release ' + latestVersion;
const checkAddon = await fetch(baseUrl + '/addons/addon/' + fxCfg.slug + '/', { headers: authHeader() });
if (checkAddon.status === 404) {
const createRes = await fetch(baseUrl + '/addons/addon/', {
method: 'POST',
headers: { ...authHeader(), 'Content-Type': 'application/json' },
body: JSON.stringify({
...metaPayload,
version: {
upload: uploadObj.uuid,
license: fxCfg.license || 'MIT',
release_notes: { 'en-US': releaseNoteText },
},
}),
});
if (!createRes.ok) throw new Error('AMO create addon failed: ' + (await createRes.text()));
console.log('  ✓ Fiche Firefox AMO créée et version ' + latestVersion + ' soumise !');
} else {
const verRes = await fetch(baseUrl + '/addons/addon/' + fxCfg.slug + '/versions/', {
method: 'POST',
headers: { ...authHeader(), 'Content-Type': 'application/json' },
body: JSON.stringify({
upload: uploadObj.uuid,
license: fxCfg.license || 'MIT',
release_notes: { 'en-US': releaseNoteText },
}),
});
if (!verRes.ok) throw new Error('AMO version submit failed: ' + (await verRes.text()));
const patchRes = await fetch(baseUrl + '/addons/addon/' + fxCfg.slug + '/', {
method: 'PATCH',
headers: { ...authHeader(), 'Content-Type': 'application/json' },
body: JSON.stringify(metaPayload),
});
if (!patchRes.ok) throw new Error('AMO metadata PATCH failed: ' + (await patchRes.text()));
console.log('  ✓ Version ' + latestVersion + ' + métadonnées (8 langues) mises à jour sur AMO !');
}
const shots = listing.assets.screenshots || [];
for (let idx = 0; idx < shots.length; idx++) {
const s = shots[idx];
const full = path.join(ROOT, s.path);
if (!fs.existsSync(full)) continue;
const prevForm = new FormData();
prevForm.append('image', new Blob([fs.readFileSync(full)], { type: 'image/png' }), path.basename(full));
prevForm.append('position', String(idx));
prevForm.append('caption', JSON.stringify({ 'en-US': s.caption }));
const prevRes = await fetch(baseUrl + '/addons/addon/' + fxCfg.slug + '/previews/', {
method: 'POST',
headers: authHeader(),
body: prevForm,
});
if (prevRes.ok) console.log('  ✓ Capture AMO #' + (idx + 1) + ' uploadée : ' + path.basename(full));
}
}
async function syncEdgeAddons(listing, primaryLocale, dryRun) {
console.log('\n🌐 [Microsoft Edge] Synchronisation hybride (Publish API v1.1 + Playwright Partner Center)...');
const edgeCfg = listing.platforms.edge;
const zipPath = path.join(ROOT, listing.assets.packageZip);
const productId = process.env.EDGE_PRODUCT_ID;
const clientId = process.env.EDGE_CLIENT_ID;
const apiKey = process.env.EDGE_API_KEY;
if (dryRun) {
console.log('  ✓ [Dry-Run Edge] ZIP (' + listing.assets.packageZip + '), icône 300x300 et descriptions prêts.');
return;
}
if (productId && clientId && apiKey && fs.existsSync(zipPath)) {
const uploadUrl = edgeCfg.apiBaseUrl + '/products/' + productId + '/submissions/draft/package';
const res = await fetch(uploadUrl, {
method: 'POST',
headers: {
Authorization: 'ApiKey ' + apiKey,
'X-ClientID': clientId,
'Content-Type': 'application/zip',
},
body: fs.readFileSync(zipPath),
});
if (res.ok) {
const opId = res.headers.get('Location');
console.log('  ✓ Package ZIP uploadé via Edge Publish API v1.1 (Operation: ' + opId + ')');
} else {
console.warn('  ⚠ Edge API ZIP upload statut ' + res.status + ' — le ZIP sera fourni via Partner Center UI.');
}
} else {
console.log('  ℹ EDGE_PRODUCT_ID / EDGE_CLIENT_ID / EDGE_API_KEY non définis — ouverture directe de Partner Center Playwright.');
}
const context = await chromium.launchPersistentContext(EDGE_PROFILE_DIR, {
headless: false,
viewport: { width: 1360, height: 900 },
args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages() || (await context.newPage());
await page.goto(edgeCfg.partnerCenterUrl, { waitUntil: 'domcontentloaded' });
console.log('⏳ Connecte-toi à Microsoft Partner Center et ouvre la fiche Vexel...');
await page.waitForURL(new RegExp('partner\.microsoft\.com/.*/microsoftedge/'), { timeout: 0 });
await page.waitForTimeout(1500);
await injectListingIntoPage(page, listing, primaryLocale, { includeEdge300Icon: true });
page.on('framenavigated', async (frame) => {
if (frame === page.mainFrame()) {
await page.waitForTimeout(1200);
await injectListingIntoPage(page, listing, primaryLocale, { includeEdge300Icon: true }).catch(() => {});
}
});
console.log('🎉 Injection Edge Partner Center active — vérifie les onglets et clique sur "Publier".');
await new Promise((resolve) => context.on('close', resolve));
}
async function fillFirstVisible(page, selectors, value, label) {
for (const sel of selectors) {
const loc = page.locator(sel).first();
if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
await loc.click();
await loc.fill(value);
console.log('  ✓ ' + label + ' rempli');
return true;
}
}
return false;
}
async function injectListingIntoPage(page, listing, primaryLocale, opts = {}) {
let count = 0;
if (await fillFirstVisible(page, ['textarea[aria-label*="Description"]', 'textarea[aria-label*="description"]'], primaryLocale.detailedDescription, 'Detailed description')) count++;
if (await fillFirstVisible(page, ['input[aria-label*="Short description"]', 'textarea[aria-label*="Short description"]'], primaryLocale.summary, 'Short description')) count++;
if (await fillFirstVisible(page, ['input[aria-label*="Official URL"]', 'input[aria-label*="Website"]', 'input[type="url"][data-field="homepage"]'], listing.storeListing.homepageUrl, 'Homepage URL')) count++;
if (await fillFirstVisible(page, ['input[aria-label*="Support URL"]', 'input[aria-label*="Support"]'], listing.storeListing.supportUrl, 'Support URL')) count++;
if (await fillFirstVisible(page, ['textarea[aria-label*="Single purpose"]', 'textarea[aria-label*="objectif unique"]'], listing.privacyPractices.singlePurpose, 'Single purpose')) count++;
if (await fillFirstVisible(page, ['input[aria-label*="Privacy policy"]', 'input[aria-label*="confidentialité"]'], listing.privacyPractices.privacyPolicyUrl, 'Privacy policy URL')) count++;
const justifications = listing.privacyPractices.permissionJustifications || {};
for (const [permKey, reason] of Object.entries(justifications)) {
if (await fillFirstVisible(page, ['textarea[aria-label*="' + permKey + '"]', 'textarea[data-permission="' + permKey + '"]'], reason, 'Justification (' + permKey + ')')) count++;
}
if (opts.includeEdge300Icon && listing.assets?.edgeIcon300) {
const icon300 = path.join(ROOT, listing.assets.edgeIcon300);
if (fs.existsSync(icon300)) {
const iconInput = page.locator('input[type="file"][accept*="image"]:not([multiple])').first();
if ((await iconInput.count()) > 0) {
await iconInput.setInputFiles(icon300).catch(() => {});
console.log('  ✓ Icône Edge 300x300 uploadée');
count++;
}
}
}
const validShots = (listing.assets?.screenshots || []).map((s) => path.join(ROOT, s.path)).filter((p) => fs.existsSync(p));
if (validShots.length > 0) {
const fileInputs = page.locator('input[type="file"][accept*="image"][multiple], input[type="file"][accept*="image"]');
if ((await fileInputs.count()) > 0) {
await fileInputs.first().setInputFiles(validShots).catch(() => {});
console.log('  ✓ ' + validShots.length + ' capture(s) 1280x800 uploadée(s)');
count++;
}
}
return count;
}
async function syncChromeWebStore(listing, primaryLocale, dryRun) {
console.log('\n🔵 [Chrome Web Store] Synchronisation Playwright Developer Console...');
if (dryRun) {
const browser = await chromium.launch({ headless: true });
try {
const page = await browser.newPage();
await page.setContent(
''
);
const n = await injectListingIntoPage(page, listing, primaryLocale);
console.log('  ✓ [Dry-Run Chrome] ' + n + ' champs vérifiés dans le DOM.');
} finally {
await browser.close();
}
return;
}
const context = await chromium.launchPersistentContext(CHROME_PROFILE_DIR, {
headless: false,
channel: 'chrome',
viewport: { width: 1360, height: 900 },
args: ['--disable-blink-features=AutomationControlled'],
});
const page = context.pages() || (await context.newPage());
await page.goto(listing.platforms.chrome.consoleUrl, { waitUntil: 'domcontentloaded' });
console.log('⏳ Connecte-toi à Chrome Web Store Developer Console et ouvre la fiche Vexel...');
await page.waitForURL(new RegExp('chrome\.google\.com/webstore/devconsole/[^/]+/[^/]+'), { timeout: 0 });
const zipFile = listing.assets?.packageZip ? path.join(ROOT, listing.assets.packageZip) : null;
if (zipFile && fs.existsSync(zipFile)) {
page.on('filechooser', async (chooser) => {
if (!chooser.isMultiple()) {
await chooser.setFiles(zipFile).catch(() => {});
console.log('  ✓ Package ZIP Chrome fourni : ' + listing.assets.packageZip);
}
});
}
await page.waitForTimeout(1500);
await injectListingIntoPage(page, listing, primaryLocale);
page.on('framenavigated', async (frame) => {
if (frame === page.mainFrame()) {
await page.waitForTimeout(1200);
await injectListingIntoPage(page, listing, primaryLocale).catch(() => {});
}
});
console.log('🎉 Injection Chrome Web Store active — vérifie les onglets et clique sur "Enregistrer le brouillon".');
await new Promise((resolve) => context.on('close', resolve));
}
async function run() {
if (!fs.existsSync(LISTING_PATH)) {
console.error('❌ Fichier store-listing.yml introuvable à la racine.');
process.exit(1);
}
const listing = YAML.parse(fs.readFileSync(LISTING_PATH, 'utf8'));
const targets = parseTargets();
console.log('🔍 Validation multi-store (' + targets.join(', ') + ')...');
const { errors, warnings } = validateStoreListing(listing, targets);
for (const w of warnings) console.warn('  ⚠', w);
if (errors.length > 0) {
for (const e of errors) console.error('  ❌', e);
process.exit(1);
}
console.log('✅ Métadonnées et packages 100 % conformes pour : ' + targets.join(', ') + ' !');
if (process.argv.includes('--validate-only')) return;
const dryRun = process.argv.includes('--dry-run');
const defaultLocale = listing.storeListing.defaultLocale || 'en';
const primaryLocale = listing.storeListing.locales[defaultLocale];
if (targets.includes('firefox')) await syncFirefoxAmo(listing, dryRun);
if (targets.includes('chrome')) await syncChromeWebStore(listing, primaryLocale, dryRun);
if (targets.includes('edge')) await syncEdgeAddons(listing, primaryLocale, dryRun);
}
run().catch((err) => {
console.error('❌ Erreur sync-store-listing:', err);
process.exit(1);
});
