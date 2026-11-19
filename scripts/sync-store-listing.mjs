import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import YAML from 'yaml';

const ROOT = process.cwd();
const LISTING_PATH = path.join(ROOT, 'store-listing.yml');
const PROFILE_DIR = path.join(ROOT, '.cws-profile');

const CWS_RULES = {
  TITLE_MAX: 75,
  TITLE_RECOMMENDED: 45,
  SUMMARY_MAX: 132,
  DESCRIPTION_MAX: 16000,
  SINGLE_PURPOSE_MAX: 1000,
  JUSTIFICATION_MAX: 1000,
  KEYWORD_MAX_REPEATS: 5,
  MAX_SCREENSHOTS: 5,
  ICON_SIZE: 128,
  ALLOWED_SCREENSHOT_SIZES: Array.of(Array.of(1280, 800), Array.of(640, 400)),
};

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  const pngSig = '89504e470d0a1a0a';
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== pngSig) {
    throw new Error('Format invalide (PNG requis) : ' + filePath);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
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
  for (const w of words) {
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  const offenders = [...counts.entries()].filter(([, n]) => n > CWS_RULES.KEYWORD_MAX_REPEATS);
  return offenders.map(
    ([word, count]) =>
      '[' + locale + '] Risque anti-spam Store : "' + word + '" apparaît ' + count + ' fois (max ' + CWS_RULES.KEYWORD_MAX_REPEATS + ')'
  );
}

function validateStoreListing(data) {
  const errors = [];
  const warnings = [];

  if (!data?.manifestSync || !data?.storeListing || !data?.privacyPractices) {
    errors.push('Sections obligatoires manquantes dans store-listing.yml (manifestSync, storeListing, privacyPractices).');
    return { errors, warnings };
  }

  const manifestFullPath = path.join(ROOT, data.manifestSync.manifestPath);
  if (!fs.existsSync(manifestFullPath)) {
    errors.push('manifest.json introuvable : ' + data.manifestSync.manifestPath);
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestFullPath, 'utf8'));
    if (manifest.manifest_version !== 3) {
      errors.push('manifest_version doit être 3 (actuel : ' + manifest.manifest_version + ').');
    }
    if (manifest.name !== data.manifestSync.name) {
      errors.push('Nom désynchronisé entre manifest.json ("' + manifest.name + '") et store-listing.yml ("' + data.manifestSync.name + '").');
    }
    if (manifest.description !== data.manifestSync.shortDescription) {
      errors.push('shortDescription désynchronisée entre manifest.json et store-listing.yml.');
    }
    if (manifest.version !== data.manifestSync.version) {
      errors.push('Version désynchronisée entre manifest.json ("' + manifest.version + '") et store-listing.yml ("' + data.manifestSync.version + '").');
    }
  }

  const locales = data.storeListing.locales || {};
  if (!locales[data.storeListing.defaultLocale]) {
    errors.push('La langue par défaut "' + data.storeListing.defaultLocale + '" est absente de storeListing.locales.');
  }

  for (const [locale, loc] of Object.entries(locales)) {
    const titleLen = [...(loc.title || '')].length;
    const summaryLen = [...(loc.summary || '')].length;
    const descLen = [...(loc.detailedDescription || '')].length;

    if (titleLen === 0 || titleLen > CWS_RULES.TITLE_MAX) {
      errors.push('[' + locale + '] title invalide : ' + titleLen + ' caractères (1..' + CWS_RULES.TITLE_MAX + ').');
    } else if (titleLen > CWS_RULES.TITLE_RECOMMENDED) {
      warnings.push('[' + locale + '] title fait ' + titleLen + ' caractères (Google recommande <= ' + CWS_RULES.TITLE_RECOMMENDED + ' pour éviter la troncature).');
    }

    if (summaryLen === 0 || summaryLen > CWS_RULES.SUMMARY_MAX) {
      errors.push('[' + locale + '] summary invalide : ' + summaryLen + ' caractères (1..' + CWS_RULES.SUMMARY_MAX + ').');
    }

    if (descLen === 0 || descLen > CWS_RULES.DESCRIPTION_MAX) {
      errors.push('[' + locale + '] detailedDescription invalide : ' + descLen + ' caractères (1..' + CWS_RULES.DESCRIPTION_MAX + ').');
    }

    warnings.push(...checkKeywordStuffing(loc.detailedDescription || '', locale));
  }

  const spLen = [...(data.privacyPractices.singlePurpose || '')].length;
  if (spLen === 0 || spLen > CWS_RULES.SINGLE_PURPOSE_MAX) {
    errors.push('singlePurpose invalide : ' + spLen + ' caractères (1..' + CWS_RULES.SINGLE_PURPOSE_MAX + ').');
  }
  if (!/^https:\/\//.test(data.privacyPractices.privacyPolicyUrl || '')) {
    errors.push('privacyPolicyUrl doit être une URL HTTPS publique valide.');
  }

  const assets = data.assets || {};
  if (assets.icon128) {
    const iconPath = path.join(ROOT, assets.icon128);
    if (!fs.existsSync(iconPath)) {
      errors.push('Icône introuvable : ' + assets.icon128);
    } else {
      const { width, height } = readPngDimensions(iconPath);
      if (width !== CWS_RULES.ICON_SIZE || height !== CWS_RULES.ICON_SIZE) {
        errors.push('Icône ' + assets.icon128 + ' : ' + width + 'x' + height + 'px (attendu exactement 128x128px).');
      }
    }
  }

  const screenshots = assets.screenshots || [];
  if (screenshots.length === 0 || screenshots.length > CWS_RULES.MAX_SCREENSHOTS) {
    errors.push('Nombre de captures invalide : ' + screenshots.length + ' (1..' + CWS_RULES.MAX_SCREENSHOTS + ' autorisées).');
  }
  for (const shot of screenshots) {
    const shotPath = path.join(ROOT, shot.path);
    if (!fs.existsSync(shotPath)) {
      warnings.push('Capture manquante sur le disque (à générer avant upload) : ' + shot.path);
      continue;
    }
    const { width, height } = readPngDimensions(shotPath);
    const valid = CWS_RULES.ALLOWED_SCREENSHOT_SIZES.some(([w, h]) => w === width && h === height);
    if (!valid) {
      errors.push('Capture ' + shot.path + ' : ' + width + 'x' + height + 'px (attendu exactement 1280x800px ou 640x400px).');
    }
  }

  if (assets.packageZip && !fs.existsSync(path.join(ROOT, assets.packageZip))) {
    warnings.push('Archive ZIP non encore générée : ' + assets.packageZip + ' (lance pnpm zip:store).');
  }

  return { errors, warnings };
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
  console.log('  ⚠ Champ non détecté automatiquement sur cet onglet : ' + label);
  return false;
}

async function injectListingIntoPage(page, listing, primaryLocale) {
  const results = [];

  results.push(
    await fillFirstVisible(
      page,
      ['textarea[aria-label*="Description"]', 'textarea[aria-label*="description"]'],
      primaryLocale.detailedDescription,
      'Detailed description'
    )
  );

  results.push(
    await fillFirstVisible(
      page,
      ['input[aria-label*="Official URL"]', 'input[aria-label*="Site officiel"]', 'input[type="url"][data-field="homepage"]'],
      listing.storeListing.homepageUrl,
      'Homepage URL'
    )
  );

  results.push(
    await fillFirstVisible(
      page,
      ['textarea[aria-label*="Single purpose"]', 'textarea[aria-label*="objectif unique"]'],
      listing.privacyPractices.singlePurpose,
      'Single purpose description'
    )
  );

  const justifications = listing.privacyPractices.permissionJustifications || {};
  for (const [permKey, reason] of Object.entries(justifications)) {
    results.push(
      await fillFirstVisible(
        page,
        [
          'textarea[aria-label*="' + permKey + '"]',
          'textarea[data-permission="' + permKey + '"]',
        ],
        reason,
        'Justification (' + permKey + ')'
      )
    );
  }

  results.push(
    await fillFirstVisible(
      page,
      ['input[aria-label*="Privacy policy"]', 'input[aria-label*="confidentialité"]'],
      listing.privacyPractices.privacyPolicyUrl,
      'Privacy policy URL'
    )
  );

  const zipFullPath = listing.assets?.packageZip ? path.join(ROOT, listing.assets.packageZip) : null;
  if (zipFullPath && fs.existsSync(zipFullPath)) {
    const zipInputs = page.locator('input[type="file"][accept*="zip"], input[type="file"]:not([accept*="image"])');
    if ((await zipInputs.count()) > 0) {
      await zipInputs.first().setInputFiles(zipFullPath);
      console.log("  ✓ Package ZIP uploadé : " + listing.assets.packageZip);
      results.push(true);
    }
  }

  const validShots = (listing.assets?.screenshots || [])
    .map((s) => path.join(ROOT, s.path))
    .filter((p) => fs.existsSync(p));

  if (validShots.length > 0) {
    const fileInputs = page.locator('input[type="file"][accept*="image"]');
    if ((await fileInputs.count()) > 0) {
      await fileInputs.first().setInputFiles(validShots);
      console.log('  ✓ ' + validShots.length + " capture(s) d'écran uploadée(s)");
      results.push(true);
    }
  }

  return results.filter(Boolean).length;
}

function buildMockDevConsoleHtml(justifications) {
  const permBlocks = Object.keys(justifications)
    .map(
      (k) =>
        '<label>' +
        k +
        '<textarea aria-label="' +
        k +
        ' justification" data-permission="' +
        k +
        '"></textarea></label>'
    )
    .join('\n');

  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>CWS Dev Console Mock</title></head><body>',
    '<h1>Chrome Web Store Developer Dashboard (Dry-Run)</h1>',
    '<section id="store-listing">',
    '  <textarea aria-label="Description"></textarea>',
    '  <input type="url" aria-label="Official URL" data-field="homepage" />',
    '  <input type="file" accept="image/png,image/jpeg" multiple />',
    '</section>',
    '<section id="privacy-practices">',
    '  <textarea aria-label="Single purpose description"></textarea>',
    permBlocks,
    '  <input type="url" aria-label="Privacy policy URL" />',
    '</section>',
    '</body></html>',
  ].join('\n');
}

async function runDryRun(listing, primaryLocale) {
console.log('🧪 Lancement du mode --dry-run (simulation Playwright de la console Chrome Web Store)...');
const browser = await chromium.launch({ headless: true });
try {
const page = await browser.newPage();
const mockHtml = buildMockDevConsoleHtml(listing.privacyPractices.permissionJustifications || {});
await page.setContent(mockHtml, { waitUntil: 'domcontentloaded' });
const filledCount = await injectListingIntoPage(page, listing, primaryLocale);
const descVal = await page.locator('textarea[aria-label="Description"]').inputValue();
const homeVal = await page.locator('input[aria-label="Official URL"]').inputValue();
const spVal = await page.locator('textarea[aria-label="Single purpose description"]').inputValue();
const privVal = await page.locator('input[aria-label="Privacy policy URL"]').inputValue();
if (descVal !== primaryLocale.detailedDescription) {
throw new Error('Dry-run assertion failed: Detailed description mismatch.');
}
if (homeVal !== listing.storeListing.homepageUrl) {
throw new Error('Dry-run assertion failed: Homepage URL mismatch.');
}
if (spVal !== listing.privacyPractices.singlePurpose) {
throw new Error('Dry-run assertion failed: Single purpose mismatch.');
}
if (privVal !== listing.privacyPractices.privacyPolicyUrl) {
throw new Error('Dry-run assertion failed: Privacy policy URL mismatch.');
}
for (const [permKey, reason] of Object.entries(listing.privacyPractices.permissionJustifications || {})) {
const val = await page.locator('textarea[data-permission="' + permKey + '"]').inputValue();
if (val !== reason) {
throw new Error('Dry-run assertion failed: Permission justification mismatch for ' + permKey);
}
}
console.log('\n✅ Dry-run Playwright réussi : ' + filledCount + ' champs/fichiers injectés et vérifiés dans le DOM !');
} finally {
await browser.close();
}
}
async function run() {
if (!fs.existsSync(LISTING_PATH)) {
console.error('❌ Fichier store-listing.yml introuvable à la racine.');
process.exit(1);
}
const rawYaml = fs.readFileSync(LISTING_PATH, 'utf8');
const listing = YAML.parse(rawYaml);
console.log('🔍 Validation des règles Chrome Web Store...');
const { errors, warnings } = validateStoreListing(listing);
for (const w of warnings) console.warn('  ⚠', w);
if (errors.length > 0) {
for (const e of errors) console.error('  ❌', e);
process.exit(1);
}
console.log('✅ Métadonnées 100 % conformes aux exigences Chrome Web Store !\n');
if (process.argv.includes('--validate-only')) {
return;
}
const defaultLocale = listing.storeListing.defaultLocale || 'en';
const primaryLocale = listing.storeListing.locales[defaultLocale];
if (process.argv.includes('--dry-run')) {
await runDryRun(listing, primaryLocale);
return;
}
console.log('🌐 Ouverture de Google Chrome (profil persistant .cws-profile)...');
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
headless: false,
channel: 'chrome',
viewport: { width: 1360, height: 900 },
args: ['--disable-blink-features=AutomationControlled'],
});
const pages = context.pages();
const page = pages.length > 0 ? pages.at(0) : await context.newPage();
await page.goto(listing.targetConsoleUrl, { waitUntil: 'domcontentloaded' });
console.log('⏳ Connecte-toi à ton compte Google / résous le CAPTCHA si nécessaire, puis ouvre la fiche de ton extension...');
await page.waitForURL(new RegExp("chrome\\.google\\.com/webstore/devconsole/[^/]+/[^/]+"), {
timeout: 0,
});
console.log('\n✍️  Injection automatique active sur tous les onglets (Package, Fiche Store, Confidentialité)...');
const zipFile = listing.assets?.packageZip ? path.join(ROOT, listing.assets.packageZip) : null;
if (zipFile && fs.existsSync(zipFile)) {
  page.on('filechooser', async (chooser) => {
    const isImage = (chooser.isMultiple() || false);
    if (!isImage) {
      await chooser.setFiles(zipFile).catch(() => {});
      console.log('  ✓ Package ZIP fourni au sélecteur de fichier : ' + listing.assets.packageZip);
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
console.log('\n🎉 Synchronisation terminée ! Vérifie les onglets dans Chrome et clique sur "Enregistrer le brouillon".');
console.log('   (Ferme simplement la fenêtre Chrome quand tu as terminé.)');
await new Promise((resolve) => context.on('close', resolve));
}
run().catch((err) => {
console.error('❌ Erreur sync-store-listing:', err);
process.exit(1);
});
