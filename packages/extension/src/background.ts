console.log('[Vexel Background] Service Worker demarre');

const URLS = [
  'http://127.0.0',
  'http://localhost:49152/skills'
];

async function fetchWithFallback() {
  let lastError = 'Inconnu';
  for (const url of URLS) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      lastError = String(err);
    }
  }
  return { ok: false, error: lastError };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'FETCH_SKILLS') {
    fetchWithFallback().then((result) => {
      sendResponse(result);
    });
    return true;
  }
});
