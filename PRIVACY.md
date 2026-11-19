# Privacy Policy — Vexel

Last updated: November 19, 2026

## Overview

Vexel ("the Extension") turns Google AI Mode (`https://google.com*`) into a local coding workspace. Vexel is designed with strict local-first privacy: **we do not collect, transmit, sell, or store any user data on external servers.**

## Data Handling & Permissions

1. **Local File System Access (`showDirectoryPicker`) & Optional Local Bridge (`127.0.0.1:49152` / `localhost:49152`)**
   - File reads (`@` file context injection) and file writes (`Save to file`) happen exclusively when explicitly triggered by the user.
   - Selected workspace directory handles are stored locally in the browser (`IndexedDB`) and never leave your machine.
   - If the optional local companion CLI (`npx vexel-bridge`) is running on `127.0.0.1:49152`, communication stays strictly on the local loopback interface (`127.0.0.1` / `localhost`) and requires a per-session authentication token.

2. **`storage` Permission**
   - Used solely to persist user preferences locally (selected language `EN`/`FR`, onboarding tour state, and optional local bridge port/token).

3. **`clipboardWrite` Permission**
   - Used exclusively when the user clicks **Copy** or **Copy Thread** to copy code blocks or clean Markdown conversations to the system clipboard.

4. **Host Access (`https://google.com*`)**
   - Used solely to render Vexel's Shadow DOM UI (inline `/` skills and `@` file palette, code block save buttons, floating thread table of contents, and auto-file attachment for long pastes) on Google Search / AI Mode pages.

## Analytics & Third Parties

Vexel contains **zero** analytics SDKs, **zero** tracking pixels, **zero** advertisements, and makes **zero** network requests to any remote server.

## Contact

For privacy questions or security reports, open an issue on the official GitHub repository: https://github.com
