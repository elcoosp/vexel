export interface RefFile {
  relPath: string
  content: string
  length: number
}

export interface SkillItem {
  id: string
  name: string
  description: string
  smartContent: string
  smartLength: number
  fullContent: string
  fullLength: number
  refCount: number
  refs: RefFile[]
  sourceRepo?: string
  installs?: string | number
  isBuiltin?: boolean
}

export interface RemoteSkill {
  id: string
  name: string
  repo: string
  installs?: string | number
  description?: string
}

export interface BrowseEntry {
  name: string
  relPath: string
  isDir: boolean
}

export type MenuMode = 'skills' | 'refs' | 'files'

export const BT1 = String.fromCharCode(96)
export const BT3 = String.fromCharCode(96, 96, 96)

export function formatChars(len: number): string {
  return len >= 1000 ? (len / 1000).toFixed(1) + 'k' : len + ' c'
}

export const DOCK_CSS = [
  ':host { all: initial; display: inline-flex; align-items: center; vertical-align: middle; margin-left: 6px; color-scheme: light; }',
  '.dock-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px 0 9px; border-radius: 999px; background: #f8f9fa; color: #3c4043; border: 1px solid #e1e3e6; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; font-size: 12px; font-weight: 500; letter-spacing: -0.01em; cursor: pointer; user-select: none; will-change: transform; transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease; box-shadow: 0 1px 2px rgba(60, 64, 67, 0.05); }',
  '.dock-btn:hover { background: #f1f3f4; border-color: #c6dafc; color: #1a73e8; box-shadow: 0 2px 6px rgba(26, 115, 232, 0.12); }',
  '.dock-btn.active { background: #e8f0fe; border-color: #a8c7fa; color: #1967d2; }',
  '.dock-keys { display: inline-flex; align-items: center; gap: 3px; margin-left: 2px; }',
  '.dock-keys kbd { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 10px; font-weight: 600; line-height: 1; background: #ffffff; border: 1px solid #dadce0; border-bottom-width: 1.5px; padding: 2px 4px; border-radius: 5px; color: #5f6368; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease; }',
  '.dock-btn:hover .dock-keys kbd, .dock-btn.active .dock-keys kbd { border-color: #c6dafc; color: #1a73e8; }',
  '.dock-keys kbd.lit { background: #1a73e8; color: #ffffff !important; border-color: #1a73e8 !important; }',
].join('\n')

export const POPOVER_CSS = [
  ':host { all: initial; color-scheme: light; }',
  '.popover { position: fixed; width: 580px; max-width: calc(100vw - 24px); background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(18px); border: 1px solid #dadce0; border-radius: 24px; box-shadow: 0 18px 44px rgba(60, 64, 67, 0.22), 0 2px 8px rgba(60, 64, 67, 0.08); z-index: 2147483646; display: none; flex-direction: column; overflow: hidden; transform-origin: bottom center; will-change: transform, opacity; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #1f1f1f; }',
  '.popover.open { display: flex; }',
  '.header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 8px 14px; border-bottom: 1px solid #f1f3f4; background: #fafbfc; gap: 8px; flex-wrap: wrap; }',
  '.tabs { position: relative; display: inline-flex; align-items: center; background: #f1f3f4; padding: 3px; border-radius: 999px; gap: 2px; }',
  '.tab-pill { position: absolute; top: 3px; left: 3px; height: calc(100% - 6px); border-radius: 999px; background: #ffffff; box-shadow: 0 1px 3px rgba(60, 64, 67, 0.16); pointer-events: none; will-change: transform, width; z-index: 0; }',
  '.tab { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 999px; cursor: pointer; color: #5f6368; background: transparent; border: none; transition: color 0.16s ease; }',
  '.tab:hover { color: #1f1f1f; }',
  '.tab.active { color: #1a73e8; }',
  '.export-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 112px; font-size: 11.5px; font-weight: 500; color: #5f6368; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 999px; padding: 5px 11px; cursor: pointer; will-change: transform; transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease; }',
  '.export-btn:hover { background: #f8f9fa; color: #1a73e8; border-color: #c6dafc; }',
  '.export-btn.done { background: #e6f4ea; color: #137333; border-color: #ceead6; }',
  '.breadcrumbs { display: none; align-items: center; flex-wrap: wrap; gap: 3px; padding: 6px 16px; border-bottom: 1px solid #f1f3f4; background: #ffffff; font-size: 11.5px; color: #5f6368; }',
  '.breadcrumbs.visible { display: flex; }',
  '.crumb { cursor: pointer; padding: 2px 6px; border-radius: 6px; color: #1a73e8; font-weight: 500; transition: background-color 0.12s ease; }',
  '.crumb:hover { background: #e8f0fe; }',
  '.crumb-sep { color: #bdc1c6; }',
  '.search-row { padding: 10px 16px; border-bottom: 1px solid #f1f3f4; display: flex; align-items: center; gap: 10px; background: #ffffff; }',
  '.search-row input { flex: 1; background: transparent; border: none; outline: none; color: #1f1f1f; font-family: inherit; font-size: 14px; }',
  '.search-row input::placeholder { color: #80868b; }',
  '.list { position: relative; max-height: 280px; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; scrollbar-color: #dadce0 transparent; }',
  '.list::-webkit-scrollbar { width: 5px; }',
  '.list::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 999px; }',
  '.row-highlight { position: absolute; left: 8px; right: 8px; top: 0; border-radius: 12px; background: #f0f6ff; border: 1px solid #d2e3fc; pointer-events: none; will-change: transform, height; z-index: 0; opacity: 0; }',
  '.row-highlight::before { content: ""; position: absolute; left: 4px; top: 8px; bottom: 8px; width: 3px; border-radius: 999px; background: #1a73e8; }',
  '.item { position: relative; z-index: 1; padding: 8px 12px; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border: 1px solid transparent; will-change: transform; }',
  '.item-row { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }',
  '.item-title { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #1f1f1f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0; }',
  '.item.active .item-title { color: #1967d2; }',
  '.item-sub { font-size: 12px; color: #5f6368; line-height: 1.4; padding-left: 21px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '.badge { display: inline-flex; align-items: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 500; color: #5f6368; background: rgba(60, 64, 67, 0.055); border: 1px solid rgba(60, 64, 67, 0.08); padding: 1px 7px; border-radius: 6px; white-space: nowrap; flex-shrink: 0; }',
  '.item.active .badge { background: #e8f0fe; color: #1967d2; }',
  '.badge.dir { margin-left: auto; font-family: inherit; font-weight: 500; color: #1967d2; background: #e8f0fe; }',
  '.pack-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 600; line-height: 1; color: #1967d2; background: #e8f0fe; border: 1px solid #d2e3fc; padding: 3px 8px; border-radius: 6px; cursor: pointer; opacity: 0; transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease; flex-shrink: 0; appearance: none; -webkit-appearance: none; }',
  '.item:hover .pack-btn, .item.active .pack-btn { opacity: 1; }',
  '.pack-btn:hover { background: #d2e3fc; color: #174ea6; }',
  '.install-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; color: #ffffff; background: #1a73e8; border: none; padding: 5px 11px; border-radius: 7px; cursor: pointer; flex-shrink: 0; transition: background-color 0.14s ease; }',
  '.install-btn:hover { background: #1557b0; color: #ffffff; }',
  '.install-btn svg { stroke: #ffffff; flex-shrink: 0; }',
  '.installing-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; color: #1967d2; background: #e8f0fe; border: 1px solid #d2e3fc; padding: 4px 10px; border-radius: 7px; flex-shrink: 0; }',
  '.del-btn { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 22px; height: 22px; padding: 0; border-radius: 6px; border: 1px solid transparent; background: transparent; color: #9aa0a6; font-size: 10px; font-weight: 600; line-height: 1; cursor: pointer; opacity: 0; transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease; flex-shrink: 0; }',
  '.item:hover .del-btn, .item.active .del-btn, .del-btn.confirm, .del-btn.removing { opacity: 1; }',
  '.del-btn:hover { background: rgba(197, 34, 31, 0.08); color: #c5221f; }',
  '.del-btn.confirm { width: auto; padding: 0 7px; background: #fce8e6; color: #c5221f; border-color: rgba(197, 34, 31, 0.24); }',
  '.del-btn.removing { width: auto; padding: 0 8px; background: #fce8e6; color: #c5221f; border-color: rgba(197, 34, 31, 0.24); cursor: default; }',
  '.vexel-spinner.danger { width: 9px; height: 9px; border-width: 1.5px; border-color: rgba(197, 34, 31, 0.25); border-top-color: #c5221f; }',
  '.vexel-spinner { width: 11px; height: 11px; border: 1.8px solid rgba(26, 115, 232, 0.25); border-top-color: #1a73e8; border-radius: 50%; animation: vexelSpin 0.65s linear infinite; flex-shrink: 0; }',
  '.empty-loading { display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: #5f6368; font-size: 13px; }',
  '.section-loading { display: inline-flex; align-items: center; gap: 6px; }',
  '@keyframes vexelSpin { to { transform: rotate(360deg); } }',
  '.section-label { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #80868b; padding: 8px 12px 2px 12px; }',
  '.section-clear { font-size: 10px; font-weight: 500; text-transform: none; letter-spacing: 0; color: #80868b; background: none; border: none; padding: 1px 4px; border-radius: 4px; cursor: pointer; }',
  '.section-clear:hover { color: #1a73e8; background: rgba(26, 115, 232, 0.08); }',
  '.footer { display: flex; justify-content: space-between; align-items: center; padding: 7px 16px; border-top: 1px solid #f1f3f4; background: #fafbfc; font-size: 11px; color: #5f6368; }',
  '.empty { padding: 24px 16px; text-align: center; color: #5f6368; font-size: 12.5px; }',
].join('\n')
