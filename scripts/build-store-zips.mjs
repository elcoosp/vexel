import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "packages/extension/dist");
const RELEASE_DIR = path.join(ROOT, "release");
const ASSETS_DIR = path.join(ROOT, "docs/assets");

if (!fs.existsSync(path.join(DIST_DIR, "manifest.json"))) {
  throw new Error("packages/extension/dist/manifest.json introuvable — lance pnpm build avant.");
}

fs.mkdirSync(RELEASE_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// 1. Chrome & Edge ZIP (standard Chromium MV3)
const chromeZip = path.join(RELEASE_DIR, "vexel-extension-store.zip");
fs.rmSync(chromeZip, { force: true });
execFileSync("zip", ["-rq", chromeZip, "."], { cwd: DIST_DIR });
console.log("✓ Built Chrome/Edge package:", path.relative(ROOT, chromeZip));

// 2. Firefox AMO ZIP (patches manifest.json with gecko ID + background.scripts)
const tmpFxDir = fs.mkdtempSync(path.join(os.tmpdir(), "vexel-fx-dist-"));
try {
  fs.cpSync(DIST_DIR, tmpFxDir, { recursive: true });
  const fxManifestPath = path.join(tmpFxDir, "manifest.json");
  const fxManifest = JSON.parse(fs.readFileSync(fxManifestPath, "utf8"));
  fxManifest.browser_specific_settings = {
    gecko: {
      id: "vexel@elcoosp.dev",
      strict_min_version: "121.0",
      data_collection_permissions: {
        required: ["none"],
      },
    },
  };
  if (fxManifest.background?.service_worker) {
    const sw = fxManifest.background.service_worker;
    fxManifest.background = {
      scripts: [sw],
      type: fxManifest.background.type || "module",
    };
  }
  fs.writeFileSync(fxManifestPath, JSON.stringify(fxManifest, null, 2) + "\n");

  const firefoxZip = path.join(RELEASE_DIR, "vexel-extension-firefox.zip");
  fs.rmSync(firefoxZip, { force: true });
  execFileSync("zip", ["-rq", firefoxZip, "."], { cwd: tmpFxDir });
  console.log("✓ Built Firefox AMO package:", path.relative(ROOT, firefoxZip));
} finally {
  fs.rmSync(tmpFxDir, { recursive: true, force: true });
}

// 3. Generate 300x300 Edge Partner Center icon from docs/logo.png or icon-128.png
const edgeIconOut = path.join(ASSETS_DIR, "store-icon-300x300.png");
const srcLogo = fs.existsSync(path.join(ROOT, "docs/logo.png"))
  ? path.join(ROOT, "docs/logo.png")
  : path.join(ROOT, "packages/extension/public/icons/icon-128.png");
try {
  execFileSync("sips", ["-z", "300", "300", srcLogo, "--out", edgeIconOut], { stdio: "ignore" });
  console.log("✓ Generated Edge 300x300 icon:", path.relative(ROOT, edgeIconOut));
} catch {
  execFileSync("ffmpeg", ["-y", "-i", srcLogo, "-vf", "scale=300:300:flags=lanczos", edgeIconOut], { stdio: "ignore" });
  console.log("✓ Generated Edge 300x300 icon via ffmpeg:", path.relative(ROOT, edgeIconOut));
}
