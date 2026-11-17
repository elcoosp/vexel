# Privacy Policy — Vexel for Google AI Mode

**Effective Date:** November 17, 2026

## 1. Zero Data Collection & Zero Telemetry
Vexel does **not** collect, store, transmit, or sell any personal data, browsing history, search queries, prompts, or source code to any external server or third party.

## 2. Local-Only Storage
Vexel uses Chrome's local storage (`chrome.storage.local`) and browser IndexedDB solely on your device to remember:
- Whether you have completed the initial onboarding tour.
- Your optional local directory handle (when using Zero-Server Mode via the File System Access API).

## 3. Optional Local Bridge (`127.0.0.1`)
If you choose to run the optional `@vexel/bridge` CLI on your computer, communication occurs strictly over your local loopback interface (`http://127.0.0.1:49152`) authenticated by a locally generated token. No data ever leaves your machine through Vexel.

## 4. Permissions Justification
- **`storage`**: Saves onboarding state and user preferences locally.
- **`activeTab` / `scripting` / Host permission (`https://google.com*`)**: Injects the Vexel command palette (`/` and `@`), code-block save triggers, and layout/virtualization enhancements on Google AI Mode pages.
- **`http://127.0.0*`**: Communicates exclusively with your local `@vexel/bridge` process when enabled.
