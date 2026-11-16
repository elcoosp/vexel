<div align="center">
  <img src="https://jsdelivr.net" alt="Vexel Logo" width="300"/>
  <p>
    <strong>A Chrome Manifest V3 extension and local skill bridge that eliminates input truncation and UI lag in Google AI Mode</strong><br/>
    Vexel intercepts long clipboard pastes and converts them into file attachments, injects local
    <code>~/.agents/skills</code> playbooks through a <code>Cmd+K</code> palette with progressive disclosure,
    and virtualizes off-screen conversation turns to keep long sessions responsive. It is for developers and
    power users running multi-turn coding sessions on <code>google.com</code> and <code>google.fr</code>.
  </p>
  <p>
    <a href="https://github.com"><img src="https://shields.io" alt="Version"/></a>
    <a href="https://chrome.com"><img src="https://shields.io" alt="Chrome Manifest V3"/></a>
    <a href="https://nodejs.org"><img src="https://shields.io" alt="Node.js"/></a>
    <a href="https://typescriptlang.org"><img src="https://shields.io" alt="TypeScript"/></a>
    <a href="https://github.com"><img src="https://shields.io" alt="MIT License"/></a>
  </p>
</div>

<p align="center">
  <a href="#quickstart">Quickstart</a> • <a href="#why-vexel-exists">Why Vexel exists</a> • <a href="#features">Features</a> • <a href="#how-it-works">How it works</a> • <a href="#usage">Usage</a> • <a href="#status">Status</a>
</p>

## Quickstart

Prerequisites: Node.js 20+ (developed on `v24.22.2`), pnpm 10+ (`12.18.0`), and Google Chrome.

**1. Clone and build both workspace packages:**

```bash
git clone git@github.com:elcoosp/vexel.git
cd vexel
pnpm install
pnpm build
```

```text
packages/bridge build$ echo 'Bridge ready (native ESM)'
Bridge ready (native ESM)
packages/extension build$ tsc && vite build
✓ 7 modules transformed.
dist/background.js   0.52 kB
dist/content.js     18.93 kB
✓ built in 16ms
```

**2. Load the extension in Chrome:**

- Open `chrome://extensions/` and toggle **Developer mode** on.
- Click **Load unpacked** and select `packages/extension/dist`.

**3. Start the local skill bridge:**

```bash
pnpm dev:bridge
```

```text
[Vexel Bridge] Pret sur http://127.0.0
```

**4. Open Google AI Mode** on `https://google.com` or `https://google.fr`:

- Paste any log or source file over `8,000` characters to watch it convert into an attached `.txt` file.
- Press `Cmd+K` (`Ctrl+K` on Linux/Windows) to search and inject skills from `~/.agents/skills/`.

