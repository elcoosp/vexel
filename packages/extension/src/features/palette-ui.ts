import { UI_COLORS, UI_FONT_MONO, UI_FONT_SANS, UI_RADII, UI_SHADOWS } from './ui-tokens'

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
  dir?: string
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

export const BT1 = String.fromCodePoint(96)
export const BT3 = String.fromCodePoint(96, 96, 96)

export function formatChars(len: number): string {
  return len >= 1000 ? (len / 1000).toFixed(1) + 'k' : len + ' c'
}

export const DOCK_CSS = [
  ':host { all: initial; display: inline-flex; align-items: center; vertical-align: middle; margin-left: 6px; color-scheme: light; }',
  `.dock-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px 0 9px; border-radius: ${UI_RADII.pill}; background: ${UI_COLORS.surfaceSubtle}; color: ${UI_COLORS.textSecondary}; border: 1px solid #e1e3e6; font-family: ${UI_FONT_SANS}; font-size: 12px; font-weight: 500; letter-spacing: -0.01em; cursor: pointer; user-select: none; will-change: transform; transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease; box-shadow: ${UI_SHADOWS.subtle}; }`,
  `.dock-btn:hover { background: ${UI_COLORS.surfaceHover}; border-color: ${UI_COLORS.primaryBorder}; color: ${UI_COLORS.primary}; box-shadow: 0 2px 6px rgba(26, 115, 232, 0.12); }`,
  `.dock-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.22); }`,
  `.dock-btn.active { background: ${UI_COLORS.primarySoft}; border-color: ${UI_COLORS.primaryBorderStrong}; color: ${UI_COLORS.primaryText}; }`,
  '.dock-keys { display: inline-flex; align-items: center; gap: 3px; margin-left: 2px; }',
  `.dock-keys kbd { font-family: ${UI_FONT_MONO}; font-size: 10px; font-weight: 600; line-height: 1; background: ${UI_COLORS.surfaceSolid}; border: 1px solid ${UI_COLORS.border}; border-bottom-width: 1.5px; padding: 2px 4px; border-radius: 5px; color: ${UI_COLORS.textMuted}; transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease; }`,
  `.dock-btn:hover .dock-keys kbd, .dock-btn.active .dock-keys kbd { border-color: ${UI_COLORS.primaryBorder}; color: ${UI_COLORS.primary}; }`,
  `.dock-keys kbd.lit { background: ${UI_COLORS.primary}; color: #ffffff !important; border-color: ${UI_COLORS.primary} !important; }`,
].join('\n')

export const POPOVER_CSS = [
  ':host { all: initial; color-scheme: light; }',
  `.popover { position: fixed; width: 580px; max-width: calc(100vw - 24px); background: ${UI_COLORS.surface}; backdrop-filter: blur(18px); border: 1px solid ${UI_COLORS.border}; border-radius: ${UI_RADII.panel}; box-shadow: ${UI_SHADOWS.popover}; z-index: 2147483646; display: none; flex-direction: column; overflow: hidden; transform-origin: bottom center; will-change: transform, opacity; font-family: ${UI_FONT_SANS}; color: ${UI_COLORS.text}; }`,
  '.popover.open { display: flex; }',
  `.header { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px 8px 12px; border-bottom: 1px solid ${UI_COLORS.surfaceHover}; background: ${UI_COLORS.surfaceHeader}; gap: 8px; flex-wrap: nowrap; }`,
  `.tabs { position: relative; display: inline-flex; align-items: center; background: ${UI_COLORS.surfaceHover}; padding: 3px; border-radius: ${UI_RADII.pill}; gap: 2px; flex-shrink: 0; }`,
  `.tab-pill { position: absolute; top: 3px; left: 3px; height: calc(100% - 6px); border-radius: ${UI_RADII.pill}; background: ${UI_COLORS.surfaceSolid}; box-shadow: 0 1px 3px rgba(60, 64, 67, 0.16); pointer-events: none; will-change: transform, width; z-index: 0; }`,
  `.tab { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; padding: 4px 11px; border-radius: ${UI_RADII.pill}; cursor: pointer; color: ${UI_COLORS.textMuted}; background: transparent; border: none; transition: color 0.16s ease; }`,
  `.tab:hover { color: ${UI_COLORS.text}; }`,
  `.tab:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.3); }`,
  `.tab.active { color: ${UI_COLORS.primary}; }`,
  '.header-actions { display: inline-flex; align-items: center; gap: 5px; min-width: 0; flex-shrink: 0; }',
  `.action-pill { display: inline-flex; align-items: center; justify-content: center; gap: 5px; height: 28px; font-family: inherit; font-size: 11.5px; font-weight: 500; color: ${UI_COLORS.textMuted}; background: ${UI_COLORS.surfaceSolid}; border: 1px solid #e0e0e0; border-radius: ${UI_RADII.pill}; padding: 0 10px; cursor: pointer; white-space: nowrap; will-change: transform; transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease; }`,
  `.action-pill:hover { background: ${UI_COLORS.surfaceSubtle}; color: ${UI_COLORS.primary}; border-color: ${UI_COLORS.primaryBorder}; }`,
  `.action-pill:focus-visible { outline: none; box-shadow: 0 0 0 2.5px rgba(26, 115, 232, 0.25); }`,
  `.action-pill.done { background: ${UI_COLORS.successSoft}; color: ${UI_COLORS.success}; border-color: ${UI_COLORS.successBorder}; }`,
  '.action-pill.icon-only { width: 28px; min-width: 28px; padding: 0; }',
  '.action-pill.lang-pill { min-width: 34px; padding: 0 8px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; }',
  `.breadcrumbs { display: none; align-items: center; flex-wrap: wrap; gap: 3px; padding: 6px 14px; border-bottom: 1px solid ${UI_COLORS.surfaceHover}; background: ${UI_COLORS.surfaceSolid}; font-size: 11.5px; color: ${UI_COLORS.textMuted}; }`,
  '.breadcrumbs.visible { display: flex; }',
  `.crumb { cursor: pointer; padding: 2px 6px; border-radius: 6px; color: ${UI_COLORS.primary}; font-weight: 500; transition: background-color 0.12s ease; }`,
  `.crumb:hover { background: ${UI_COLORS.primarySoft}; }`,
  '.crumb-sep { color: #bdc1c6; }',
  `.search-row { padding: 9px 14px; border-bottom: 1px solid ${UI_COLORS.surfaceHover}; display: flex; align-items: center; gap: 8px; background: ${UI_COLORS.surfaceSolid}; }`,
  `.search-icon { display: inline-flex; align-items: center; justify-content: center; color: ${UI_COLORS.textSubtle}; flex-shrink: 0; }`,
  `.back-pill { display: none; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: ${UI_RADII.pill}; border: 1px solid ${UI_COLORS.primaryBorder}; background: ${UI_COLORS.primaryTint}; color: ${UI_COLORS.primaryText}; font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0; transition: background-color 0.14s ease; }`,
  `.back-pill:hover { background: ${UI_COLORS.primarySoft}; }`,
  '.back-pill.visible { display: inline-flex; }',
  `.search-row input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: ${UI_COLORS.text}; font-family: inherit; font-size: 13.5px; }`,
  `.search-row input::placeholder { color: ${UI_COLORS.textSubtle}; }`,
  `.clear-input-btn { display: none; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: ${UI_RADII.pill}; border: none; background: ${UI_COLORS.surfaceHover}; color: ${UI_COLORS.textMuted}; cursor: pointer; flex-shrink: 0; transition: background-color 0.14s ease, color 0.14s ease; }`,
  `.clear-input-btn:hover { background: #e8eaed; color: ${UI_COLORS.text}; }`,
  '.clear-input-btn.visible { display: inline-flex; }',
  `.list { position: relative; max-height: 280px; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; scrollbar-color: ${UI_COLORS.border} transparent; }`,
  '.list::-webkit-scrollbar { width: 5px; }',
  `.list::-webkit-scrollbar-thumb { background: ${UI_COLORS.border}; border-radius: ${UI_RADII.pill}; }`,
  `.row-highlight { position: absolute; left: 8px; right: 8px; top: 0; border-radius: ${UI_RADII.row}; background: ${UI_COLORS.primaryTint}; border: 1px solid #d2e3fc; pointer-events: none; will-change: transform, height; z-index: 0; opacity: 0; }`,
  `.row-highlight::before { content: ""; position: absolute; left: 4px; top: 8px; bottom: 8px; width: 3px; border-radius: ${UI_RADII.pill}; background: ${UI_COLORS.primary}; }`,
  `.item { position: relative; z-index: 1; padding: 8px 12px; border-radius: ${UI_RADII.row}; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border: 1px solid transparent; will-change: transform; }`,
  '.item-row { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }',
  `.item-title { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: ${UI_COLORS.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1; min-width: 0; }`,
  `.item.active .item-title { color: ${UI_COLORS.primaryText}; }`,
  `.item-sub { font-size: 12px; color: ${UI_COLORS.textMuted}; line-height: 1.4; padding-left: 21px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
  `.badge { display: inline-flex; align-items: center; font-family: ${UI_FONT_MONO}; font-size: 10.5px; font-weight: 500; color: ${UI_COLORS.textMuted}; background: rgba(60, 64, 67, 0.055); border: 1px solid rgba(60, 64, 67, 0.08); padding: 1px 7px; border-radius: 6px; white-space: nowrap; flex-shrink: 0; }`,
  `.item.active .badge { background: ${UI_COLORS.primarySoft}; color: ${UI_COLORS.primaryText}; }`,
  `.badge.dir { margin-left: auto; font-family: inherit; font-weight: 500; color: ${UI_COLORS.primaryText}; background: ${UI_COLORS.primarySoft}; }`,
  `.pack-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-family: ${UI_FONT_MONO}; font-size: 10.5px; font-weight: 600; line-height: 1; color: ${UI_COLORS.primaryText}; background: ${UI_COLORS.primarySoft}; border: 1px solid #d2e3fc; padding: 3px 8px; border-radius: 6px; cursor: pointer; opacity: 0; transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease; flex-shrink: 0; appearance: none; -webkit-appearance: none; }`,
  '.item:hover .pack-btn, .item.active .pack-btn { opacity: 1; }',
  '.pack-btn:hover { background: #d2e3fc; color: #174ea6; }',
  `.install-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; color: #ffffff; background: ${UI_COLORS.primary}; border: none; padding: 5px 11px; border-radius: 7px; cursor: pointer; flex-shrink: 0; transition: background-color 0.14s ease; }`,
  `.install-btn:hover { background: ${UI_COLORS.primaryHover}; color: #ffffff; }`,
  '.install-btn svg { stroke: #ffffff; flex-shrink: 0; }',
  `.installing-btn { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 11.5px; font-weight: 600; line-height: 1; color: ${UI_COLORS.primaryText}; background: ${UI_COLORS.primarySoft}; border: 1px solid #d2e3fc; padding: 4px 10px; border-radius: 7px; flex-shrink: 0; }`,
  '.del-btn { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 22px; height: 22px; padding: 0; border-radius: 6px; border: 1px solid transparent; background: transparent; color: #9aa0a6; font-size: 10px; font-weight: 600; line-height: 1; cursor: pointer; opacity: 0; transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease, border-color 0.14s ease; flex-shrink: 0; }',
  '.item:hover .del-btn, .item.active .del-btn, .del-btn.confirm, .del-btn.removing { opacity: 1; }',
  `.del-btn:hover { background: rgba(197, 34, 31, 0.08); color: ${UI_COLORS.danger}; }`,
  `.del-btn.confirm { width: auto; padding: 0 7px; background: ${UI_COLORS.dangerSoft}; color: ${UI_COLORS.danger}; border-color: rgba(197, 34, 31, 0.24); }`,
  `.del-btn.removing { width: auto; padding: 0 8px; background: ${UI_COLORS.dangerSoft}; color: ${UI_COLORS.danger}; border-color: rgba(197, 34, 31, 0.24); cursor: default; }`,
  `.vexel-spinner.danger { width: 9px; height: 9px; border-width: 1.5px; border-color: rgba(197, 34, 31, 0.25); border-top-color: ${UI_COLORS.danger}; }`,
  `.vexel-spinner { width: 11px; height: 11px; border: 1.8px solid rgba(26, 115, 232, 0.25); border-top-color: ${UI_COLORS.primary}; border-radius: 50%; animation: vexelSpin 0.65s linear infinite; flex-shrink: 0; }`,
  '.empty-state { padding: 24px 16px; text-align: center; }',
  `.empty-loading { display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: ${UI_COLORS.textMuted}; font-size: 13px; }`,
  '.section-loading { display: inline-flex; align-items: center; gap: 6px; }',
  '@keyframes vexelSpin { to { transform: rotate(360deg); } }',
  `.section-label { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: ${UI_COLORS.textSubtle}; padding: 8px 12px 2px 12px; }`,
  `.section-clear { font-size: 10px; font-weight: 500; text-transform: none; letter-spacing: 0; color: ${UI_COLORS.textSubtle}; background: none; border: none; padding: 1px 4px; border-radius: 4px; cursor: pointer; }`,
  `.section-clear:hover { color: ${UI_COLORS.primary}; background: rgba(26, 115, 232, 0.08); }`,
  `.footer { display: flex; justify-content: space-between; align-items: center; padding: 7px 14px; border-top: 1px solid ${UI_COLORS.surfaceHover}; background: ${UI_COLORS.surfaceHeader}; font-size: 11px; color: ${UI_COLORS.textMuted}; }`,
  `.empty { padding: 24px 16px; text-align: center; color: ${UI_COLORS.textMuted}; font-size: 12.5px; }`,
].join('\n')
