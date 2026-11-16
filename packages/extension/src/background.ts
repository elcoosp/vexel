console.log('[Vexel Background] Service Worker demarre');
const BASES = [
'http://127.0.0.1:49152',
'http://localhost:49152'
];
async function fetchBridgeEndpoint(endpoint: string) {
let lastError = 'Inconnu';
for (const base of BASES) {
try {
const controller = new AbortController();
const id = setTimeout(() => controller.abort(), 2500);
const res = await fetch(base + endpoint, { signal: controller.signal, cache: 'no-store' });
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
if (!message || !message.type) return;
if (message.type === 'FETCH_SKILLS') {
fetchBridgeEndpoint('/skills').then(sendResponse);
return true;
}
if (message.type === 'BROWSE_DIR') {
const dir = encodeURIComponent(message.dir || '');
const q = encodeURIComponent(message.query || '');
fetchBridgeEndpoint('/browse?dir=' + dir + '&q=' + q).then(sendResponse);
return true;
}
if (message.type === 'FETCH_FILE_CONTENT') {
const p = encodeURIComponent(message.relPath || '');
fetchBridgeEndpoint('/file?path=' + p).then(sendResponse);
return true;
}
});
