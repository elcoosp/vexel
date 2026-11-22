# AGENTS.md — Vexel Engineering & Agent Guide

This repository contains **Vexel** (`@vexel/extension` + `@vexel/bridge`), a browser extension (Chrome, Edge, Firefox) and local HTTP companion bridge that supercharges Google AI Mode with local workspace `@file` context, `/skill` commands, one-click code saving, DOM virtualization, and real-time broken code-block repair & syntax highlighting.

---

## 1. Repository Map

```text
vexel/
├── packages/
│   ├── extension/                  # @vexel/extension (MV3 WebExtension, Vite + TypeScript + Lingui)
│   │   ├── public/                 # manifest.json, popup.html, icons/, _locales/
│   │   ├── src/
│   │   │   ├── content.ts          # Main AI Mode content script entrypoint
│   │   │   ├── background.ts       # Service worker / background messaging & bridge proxy
│   │   │   ├── popup.ts            # Extension popup (language switcher, status, settings)
│   │   │   ├── i18n.ts             # Lingui runtime setup & live locale hot-swap
│   │   │   ├── locales/            # Compiled & source .po message catalogs
│   │   │   └── features/
│   │   │       ├── code-repair.ts      # Truncated code reassembly, heredoc/heading recovery, FollowUp renderer
│   │   │       ├── code-highlight.ts   # Zero-dependency tokenizer & structural indentation reconstructor
│   │   │       ├── code-save.ts        # One-click "Save to file" popover & filename inference
│   │   │       ├── dom-booster.ts      # Long-thread offscreen virtualization for smooth scrolling
│   │   │       ├── instant-preview.ts  # Live attachment / snippet preview
│   │   │       ├── local-fs.ts         # Browser File System Access API fallback (zero-server mode)
│   │   │       ├── palette.ts          # `/` skills & `@` workspace files command palette logic
│   │   │       ├── palette-ui.ts       # Shadow-DOM palette UI
│   │   │       ├── palette-files.ts    # File tree indexing & fuzzy matching
│   │   │       ├── builtin-skills.ts   # Built-in prompt skills
│   │   │       ├── file-upload.ts      # Large paste -> .txt file attachment interception
│   │   │       ├── thread-tools.ts     # Thread export (.md) & prompt utilities
│   │   │       ├── onboarding.ts       # First-run onboarding overlay
│   │   │       ├── icons.ts            # Inline SVG Lucide icon builders
│   │   │       └── ui-tokens.ts        # Shared design tokens (colors, fonts, radii, shadows)
│   │   └── test/
│   │       ├── unit/               # Pure logic unit tests (Vitest project: unit)
│   │       ├── dom/                # Happy-DOM / LinkeDOM integration tests (Vitest project: dom)
│   │       └── e2e/run-e2e.ts      # Full-stack Playwright + real bridge E2E suite
│   └── bridge/                     # @vexel/bridge (Node.js local HTTP server on 127.0.0.1:49152)
│       ├── src/
│       │   ├── server.ts           # HTTP endpoints (/health, /files, /read-file, /write-file, /format, /skills)
│       │   ├── formatter.ts        # Native CLI formatter routing over stdin/stdout (Rust, Python, TS, C++, Go, etc.)
│       │   └── skills-registry.ts  # Remote GitHub skill search & sandboxed local skill install/removal
│       └── test/                   # Bridge unit & security sandbox tests
├── scripts/
│   ├── build-store-zips.ts         # Builds Chrome/Edge zip, Firefox AMO zip, AMO source zip & 300x300 icon
│   ├── capture-live-assets.ts      # Automated Playwright screenshot/video capture
│   └── generate-store-assets.ts    # Deterministic store promo card generator
├── docs/                           # Store assets, demo media, store-deploy-env.md
└── .github/workflows/ci.yml        # CI pipeline (unit + dom + xvfb Playwright e2e)
```

---

## 2. Mandatory Validation Pyramid

Before committing or pushing any change, run the full validation pyramid in order:

```bash
pnpm fmt
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:dom
(lsof -ti :49152 | xargs -r kill -9 2>/dev/null || true) && pnpm test:e2e
```

- **`pnpm fmt`**: Formats all files with `oxfmt`.
- **`pnpm typecheck`**: Runs `tsc --noEmit` against both root `tsconfig.json` and `packages/extension/tsconfig.json`.
- **`pnpm lint`**: Runs `oxlint --deny-warnings -D typescript/no-explicit-any`. **Explicit `any` and warnings are strictly forbidden.**
- **`pnpm test:unit`**: Fast pure-function and `@vexel/bridge` tests (`vitest --project unit`).
- **`pnpm test:dom`**: Real Google AI Mode HTML fixture tests in Happy-DOM (`vitest --project dom`).
- **`pnpm test:e2e`**: Builds both packages (`pnpm build`) and executes Playwright against mocked Google Home/AI Mode pages with a live `@vexel/bridge` writing real files to disk. Always free port `49152` first.

---

## 3. Core Engineering Principles

### A. Strict Test-Driven Bugfixing (RED → GREEN → REFACTOR)

1. **Reproduce first**: When fixing a DOM parsing, syntax highlighting, or bridge bug, add a minimal deterministic test in `packages/extension/test/dom/` or `test/unit/` reproducing the exact failure.
2. **Verify RED**: Run `pnpm test:dom` or `pnpm test:unit` and confirm the new test fails for the expected reason.
3. **Fix root cause**: Implement the smallest, cleanest semantic fix.
4. **Verify GREEN**: Run the entire pyramid (`fmt`, `typecheck`, `lint`, `test:unit`, `test:dom`, `test:e2e`).

### B. Zero Hacks & Zero Hardcoded Obfuscated Classes

- Google AI Mode obfuscated CSS class names (e.g., `ZLzG0d`, `ncoeY`, `E8xBUb`, `yhAwj`) change frequently across deployments.
- **Anchor DOM logic on structural & WAI-ARIA/HTML semantics**: `pre code`, `role="heading"`, `H1`–`H6`, `aria-label`, `data-sfc-cp`, `data-complete`, `data-zzy`, and Shadow DOM boundaries. Never add new hardcoded obfuscated Google class names.
- **Isolate all Vexel UI**: Stamp every injected wrapper with `data-vexel-ui="true"` and render interactive UI inside an open `ShadowRoot` so `MutationObserver`, native copy buttons, and code-repair walkers ignore Vexel elements.

### C. Streaming Performance Invariants (`code-repair.ts` & `code-highlight.ts`)

Google AI Mode mutates the DOM dozens of times per second during response streaming. Keep these hot-path invariants intact:

1. **O(1) signature & topology caching**: `scannedCardSignatures` (`WeakMap<Element, string>`) and `cardTopologyCache` (`WeakMap<Element, CardTopology>`) prevent redundant ancestor walks when a card's signature has not changed.
2. **Freeze completed turns**: Once a turn is complete (`data-complete="true"` or `[data-zzy="1"]`), mark the card `data-vexel-repaired-final="1"` and its `<pre>` `data-vexel-final-pre="1"`. `scanAndRepairCodeBlocks` queries `pre:not([data-vexel-final-pre]) code` so historical turns cost ~0 ms.
3. **Dirty-root scoping**: `initCodeRepair` tracks mutated turn containers in `dirtyRoots: Set<Element>` and scans only those subtrees during incremental streaming.
4. **Zero-allocation tokenization**: In `code-highlight.ts`, index strings directly (`str[i]`) and coalesce consecutive plain tokens in `plainBuf` into a single `TextNode` rather than creating per-character DOM nodes.
5. **Benchmark before keeping micro-optimizations**: Validate hot-path changes with an A/B `performance.now()` benchmark against `HEAD`. If an optimization regresses (for example, repeated live `childNodes` getter allocations in tight loops), revert immediately.

### D. Code-Repair Domain Rules (`code-repair.ts`)

- `hasUnclosedCodeDelimiter(code)` tracks unclosed heredocs (`<< 'PY'`, `<<-EOF`), triple-quoted strings (`"""`, `'''`), and structural `{` / `` ` `` outside comments and quoted literals.
- **Semantic headings inside open delimiters**: When Google's Markdown parser truncates a code fence prematurely inside a heredoc or multiline string, subsequent `# comment` lines are parsed as semantic headings (`role="heading"` or `H1`–`H6`) without their `#` prefix. When `stillOpen && isSemanticHeadingElement(node)`, absorb the node and restore `# ${cleaned}`.
- **Prose & footer boundaries**: Never absorb trailing natural-language prose (`isNaturalLanguageProseBlock`) or Google legal disclaimer footers (`isGoogleLegalFooterNode`).

---

## 4. Internationalization (`i18n`)

- Wrap all user-facing extension strings in `t\`...\``from`@lingui/core/macro`(and ensure`../i18n` is imported).
- Whenever adding or modifying strings:
  ```bash
  pnpm i18n:extract
  pnpm i18n:check
  ```
- Update all locale `.po` files (`en`, `fr`, etc.) so `pnpm i18n:check` reports zero missing translations.

---

## 5. Packaging & Store Releases

- **Build all store archives & icons** (outputs to `release/`):
  ```bash
  pnpm zip:store
  ```
  Produces:
  - `release/vexel-extension-store.zip` (Chrome Web Store & Microsoft Edge Add-ons)
  - `release/vexel-extension-firefox.zip` (Firefox AMO)
  - `release/vexel-source-firefox.zip` (Firefox AMO source archive)
  - `docs/assets/store-icon-300x300.png`
- **Validate / Dry-Run / Publish via `extship`** (requires credentials documented in `docs/store-deploy-env.md`):
  ```bash
  pnpm store:validate
  pnpm store:dry-run
  pnpm store:sync          # or store:sync:chrome / store:sync:edge / store:sync:firefox
  ```

---

## 6. Shell Scripting Tips

- Always use **single-quoted heredoc delimiters** (`node <<'EOF'`) when running inline Node scripts from bash so `$` template expressions and backticks inside TypeScript/JavaScript snippets are never expanded by the shell.
