<div align="center">
  <img src="https://cdn.jsdelivr.net/gh/elcoosp/vexel@main/docs/logo.png" alt="Vexel Logo" width="300"/>
  <p>
    <strong>A Chrome Manifest V3 extension and local skill bridge that removes input truncation, split code blocks, and UI lag in Google AI Mode</strong><br/>
    Vexel intercepts long clipboard pastes and converts them into file attachments, injects local
    <code>~/.agents/skills</code> playbooks through a <code>Cmd+K</code> palette with progressive disclosure,
    and reconstructs code blocks broken mid-stream by Google's Markdown parser. It is for developers and
    power users running multi-turn coding sessions on <code>google.com</code> and <code>google.fr</code>.
  </p>
  <p>
    <a href="https://github.com/elcoosp/vexel/releases"><img src="https://img.shields.io/badge/version-0.1.0-2563EB?style=flat-square" alt="Version"/></a>
    <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/chrome-manifest%20v3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Manifest V3"/></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js"/></a>
    <a href="https://typescriptlang.org"><img src="https://img.shields.io/badge/typescript-7.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/></a>
    <a href="https://github.com/elcoosp/vexel/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"/></a>
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

## Why Vexel exists

Google AI Mode on Search (`google.com` / `google.fr`) works well for short prompts, but breaks down under real development workflows:

1. **Silent prompt truncation.** Pasting large stack traces, diffs, or files directly into the prompt box gets clipped by input limits unless manually saved to disk and uploaded via the file picker.
2. **Broken Markdown code fences.** When an assistant response contains raw HTML tags (`<style>`, `<div>`) after blank lines inside a fenced block, Google's streaming parser closes the block early, dumps the rest of the code as raw DOM paragraphs under a caution banner, and drops half the script from its native Copy button.
3. **Context bloat and DOM lag.** Pasting full multi-file skill definitions burns context upfront, while keeping dozens of heavy syntax-highlighted turns painted in the DOM slows down typing.

Vexel fixes all four client-side without external runtime dependencies.

## Features

- **Automatic paste-to-file attachment (`untruncate.ts`).** Captures `paste` events when `currentText + pastedText` exceeds `8,000` characters (`MAX_SAFE_LENGTH`). Synthesizes a timestamped `File` (`prompt-YYYY-MM-DDTHH-MM-SS.txt`), injects it into `input[type="file"]` via `DataTransfer` (with drag-and-drop fallback), and prevents truncated text insertion.

- **Local skill bridge (`packages/bridge/src/server.mjs`).** Runs a zero-dependency Node.js HTTP server (`node:http`, `node:fs/promises`) on `127.0.0.1:49152`. Scans `~/.agents/skills/*/SKILL.md`, parses optional YAML `name` and `description` frontmatter, and indexes nested `.md`, `.txt`, `.yaml`, `.yml`, `.toml`, and `.json` reference files.

- **Progressive disclosure command palette (`palette.ts`).** Opens an isolated Shadow DOM modal on `Cmd+K` / `Ctrl+K`. Pressing `Enter` injects `SKILL.md` alongside a lightweight reference manifest (`relPath` + character count) so the model only requests specific reference files when needed. Use `ArrowRight` to drill into a skill's reference files individually, or `Cmd+Enter` to bundle everything at once. Payloads over `8,000` characters upload automatically as `.md` files.

- **Code block reconstruction (`code-repair.ts`).** Scans `.aiModeUiCodeBlock__Container` elements, extracts raw code strings from hidden `|||[[` page comments, stitches spilled DOM sibling nodes following Google's code-caution banner, hides leaked `<FollowUp>` blocks, and injects a one-click **Copier source exacte** / **Copier complet + suite** button into the code header.

- **Off-screen turn virtualization (`dom-booster.ts`).** Watches conversation turn containers and applies `content-visibility: auto` with `contain-intrinsic-size: auto 320px` to every turn except the 4 most recent ones, isolating layout and paint work on long threads.

## How it works

```text
~/.agents/skills/<skill>/
  ├── SKILL.md
  └── references/*.md
        │
        │  packages/bridge/src/server.mjs
        │  zero-dep Node HTTP server (127.0.0.1:49152/skills)
        ▼
  background.js (MV3 Service Worker)
        │
        │  chrome.runtime.sendMessage({ type: "FETCH_SKILLS" })
        ▼
  content.js (injected on ://google.com* and google.fr/*)
        │
        ├─ untruncate.ts   — paste > 8,000 chars → DataTransfer file upload
        ├─ palette.ts      — Shadow DOM Cmd+K palette (smart / ref / full)
        ├─ code-repair.ts  — |||[[ comment parser + spilled DOM stitcher
        └─ dom-booster.ts  — content-visibility: auto on turns older than last 4
```

## Usage

### Keyboard shortcuts

| Shortcut | Context | Action |
| --- | --- | --- |
| `Cmd+K` / `Ctrl+K` | Page | Open or close the Vexel skill palette. |
| `ArrowUp` / `ArrowDown` | Palette | Navigate skills or reference files. |
| `Enter` | Skill list | Inject `SKILL.md` + lightweight index of `references/` (auto-uploads as `.md` if `> 8,000` chars). |
| `ArrowRight` | Skill list | Open the selected skill's reference files. |
| `Enter` | Reference list | Inject the selected reference file. |
| `ArrowLeft` | Reference list | Return to the skill list (when search input is empty). |
| `Cmd+Enter` / `Ctrl+Enter` | Skill list | Bundle `SKILL.md` + full contents of every reference file. |
| `Escape` | Palette | Step back from references or close the modal. |

### Skill folder convention

Each directory under `~/.agents/skills/` with a `SKILL.md` file is indexed automatically on every palette open:

```text
~/.agents/skills/
├── create-readme/
│   ├── SKILL.md
│   └── references/
│       └── checklist.md
└── zig-compiler/
    └── SKILL.md
```

Optional frontmatter at the top of `SKILL.md` sets the display name and search description:

```markdown
---
name: create-readme
description: Generate a grounded, funnel-ordered README from repository evidence.
---
```

### Workspace layout

| Path | Purpose |
| --- | --- |
| `packages/extension/manifest.json` | Chrome Manifest V3 configuration (`host_permissions` for `127.0.0.1:49152`). |
| `packages/extension/src/background.ts` | MV3 service worker querying `127.0.0.1:49152/skills` with `localhost` fallback. |
| `packages/extension/src/content.ts` | Entrypoint mounting toast notifications and initializing all 4 features. |
| `packages/extension/src/features/untruncate.ts` | Paste interceptor and `DataTransfer` `.txt`/`.md` uploader (`8,000` char threshold). |
| `packages/extension/src/features/palette.ts` | Shadow DOM `Cmd+K` palette with progressive disclosure and reference drill-down. |
| `packages/extension/src/features/code-repair.ts` | `|||[[` comment extractor and spilled DOM code block stitcher. |
| `packages/extension/src/features/dom-booster.ts` | `MutationObserver` applying `content-visibility: auto` to older conversation turns. |
| `packages/bridge/src/server.mjs` | Native ESM Node.js HTTP server indexing `~/.agents/skills`. |

## Status

> [!NOTE]
> Version **0.1.0** — active personal tooling in daily use on macOS (`Node v24.22.2`, `pnpm 12.18.0`, Google Chrome) against `https://www.://google.com` and `https://google.fr`.
>
> **Known limitations:**
> - Google AI Mode DOM selectors (`.aiModeUiCodeBlock__Container`, `.a2TNg`, `|||[[` comment format) track current Search frontend markup and may need updates when Google ships layout changes.
> - No automated test runner or GitHub Actions CI workflow is wired yet.
> - `docs/logo.png` must exist on `main` for the jsDelivr header image to resolve.
