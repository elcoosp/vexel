export interface RecentFileEntry {
name: string;
relPath: string;
isDir: boolean;
}
export const RECENT_FILES_KEY = 'vexel:recent-files';
export function loadRecentFiles(): RecentFileEntry[] {
try {
const raw = localStorage.getItem(RECENT_FILES_KEY);
const parsed = raw ? JSON.parse(raw) : [];
return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
} catch {
return [];
}
}
export function saveRecentFiles(entries: RecentFileEntry[]): void {
try {
localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries.slice(0, 5)));
} catch {}
}
export function clearRecentFilesStorage(): void {
try {
localStorage.removeItem(RECENT_FILES_KEY);
} catch {}
}
