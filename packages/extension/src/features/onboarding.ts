import { t } from '@lingui/core/macro'
import '../i18n'
import { animate } from 'motion'
import { createLucideIcon } from './icons'
import { loadConnectedFolderName, pickLocalFolder } from './local-fs'

const ONBOARDED_KEY = 'vexel_onboarded_v1'

const ONBOARDING_CSS = [
  ':host { all: initial; color-scheme: light; }',
  '.backdrop { position: fixed; inset: 0; z-index: 2147483646; background: rgba(15, 23, 42, 0.28); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 20px; font-family: "Google Sans", -apple-system, BlinkMacSystemFont, "Inter", sans-serif; opacity: 0; }',
  '.card { width: 100%; max-width: 480px; background: rgba(255, 255, 255, 0.98); border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 22px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.06); overflow: hidden; will-change: transform, opacity; }',
  '.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px 0 22px; }',
  '.brand { display: inline-flex; align-items: center; gap: 10px; font-size: 14.5px; font-weight: 600; color: #1f1f1f; letter-spacing: -0.01em; }',
  '.brand-logo { width: 30px; height: 30px; border-radius: 8px; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 8px rgba(26, 115, 232, 0.25); }',
  '.skip-btn { border: none; background: transparent; color: #80868b; font-size: 12px; font-weight: 500; cursor: pointer; padding: 4px 8px; border-radius: 8px; transition: color 0.15s ease, background-color 0.15s ease; }',
  '.skip-btn:hover { color: #1f1f1f; background: #f1f3f4; }',
  '.body { padding: 20px 24px 22px 24px; }',
  '.step-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: #e8f0fe; color: #1967d2; font-size: 11px; font-weight: 600; margin-bottom: 10px; }',
  '.title { margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #1f1f1f; letter-spacing: -0.02em; line-height: 1.25; }',
  '.desc { margin: 0 0 18px 0; font-size: 13.5px; color: #5f6368; line-height: 1.5; }',
  '.sandbox { background: #f8f9fa; border: 1px solid #e8eaed; border-radius: 14px; padding: 14px; margin-bottom: 18px; }',
  '.demo-chips { display: flex; flex-wrap: wrap; gap: 8px; }',
  '.demo-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px; border: 1px solid #dadce0; background: #ffffff; color: #1f1f1f; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 500; cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.12s ease; }',
  '.demo-chip:hover { border-color: #1a73e8; background: #f0f6ff; color: #1967d2; }',
  '.demo-chip.selected { border-color: #1a73e8; background: #e8f0fe; color: #1967d2; }',
  '.demo-preview { margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: #ffffff; border: 1px solid #e8eaed; font-size: 12px; color: #3c4043; line-height: 1.45; }',
  '.folder-cta { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; border-radius: 12px; border: 1px dashed #a8c7fa; background: #f0f6ff; color: #1967d2; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color 0.15s ease, border-color 0.15s ease; }',
  '.folder-cta:hover { background: #e8f0fe; border-color: #1a73e8; }',
  '.folder-cta.connected { border-style: solid; border-color: #ceead6; background: #e6f4ea; color: #137333; }',
  '.shortcut-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }',
  '.shortcut-card { padding: 10px 12px; border-radius: 11px; background: #ffffff; border: 1px solid #e8eaed; display: flex; flex-direction: column; gap: 4px; }',
  '.kbd { display: inline-block; align-self: flex-start; padding: 2px 7px; border-radius: 6px; background: #f1f3f4; border: 1px solid #dadce0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 600; color: #1f1f1f; }',
  '.shortcut-lbl { font-size: 12px; color: #5f6368; }',
  '.footer { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: #f8f9fa; border-top: 1px solid #eceff1; }',
  '.dots { display: flex; align-items: center; gap: 6px; }',
  '.dot { width: 6px; height: 6px; border-radius: 999px; background: #dadce0; transition: width 0.2s ease, background-color 0.2s ease; }',
  '.dot.active { width: 18px; background: #1a73e8; }',
  '.actions { display: flex; align-items: center; gap: 8px; }',
  '.btn-secondary { height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid #dadce0; background: #ffffff; color: #3c4043; font-size: 12.5px; font-weight: 500; cursor: pointer; }',
  '.btn-secondary:hover { background: #f1f3f4; }',
  '.btn-primary { height: 34px; padding: 0 18px; border-radius: 999px; border: none; background: #1a73e8; color: #ffffff; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 6px rgba(26, 115, 232, 0.28); }',
  '.btn-primary:hover { background: #1557b0; }',
].join('\n')

export function openOnboardingModal(showToast: (msg: string) => void): void {
  if (document.getElementById('vexel-onboarding-host')) return

  const host = document.createElement('div')
  host.id = 'vexel-onboarding-host'
  host.setAttribute('data-vexel-ui', 'true')
  const shadow = host.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = ONBOARDING_CSS

  const backdrop = document.createElement('div')
  backdrop.className = 'backdrop'

  const card = document.createElement('div')
  card.className = 'card'

  const topBar = document.createElement('div')
  topBar.className = 'top-bar'

  const brand = document.createElement('div')
  brand.className = 'brand'
  const brandLogo = document.createElement('img')
  brandLogo.className = 'brand-logo'
  brandLogo.alt = 'Vexel'
  brandLogo.src =
    'data:image/png;base64,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'
  brand.append(brandLogo, document.createTextNode(t`Welcome to Vexel`))

  const skipBtn = document.createElement('button')
  skipBtn.type = 'button'
  skipBtn.className = 'skip-btn'
  skipBtn.textContent = t`Skip`

  topBar.append(brand, skipBtn)

  const body = document.createElement('div')
  body.className = 'body'

  const footer = document.createElement('div')
  footer.className = 'footer'

  const dotsWrap = document.createElement('div')
  dotsWrap.className = 'dots'
  const dotEls = Array(0, 1, 2).map(() => {
    const d = document.createElement('div')
    d.className = 'dot'
    dotsWrap.appendChild(d)
    return d
  })

  const actions = document.createElement('div')
  actions.className = 'actions'
  const backBtn = document.createElement('button')
  backBtn.type = 'button'
  backBtn.className = 'btn-secondary'
  backBtn.textContent = t`Back`

  const nextBtn = document.createElement('button')
  nextBtn.type = 'button'
  nextBtn.className = 'btn-primary'

  actions.append(backBtn, nextBtn)
  footer.append(dotsWrap, actions)

  card.append(topBar, body, footer)
  backdrop.appendChild(card)
  shadow.append(styleEl, backdrop)
  document.body.appendChild(host)

  let step = 0
  let connectedFolderName = ''
  let selectedDemoSkill = 'review-pr'

  loadConnectedFolderName().then((name) => {
    if (name) {
      connectedFolderName = name
      if (step === 1) renderStep()
    }
  })

  let closing = false
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finishOnboarding()
  }
  document.addEventListener('keydown', onKeyDown, true)
  const finishOnboarding = () => {
    if (closing) return
    closing = true
    document.removeEventListener('keydown', onKeyDown, true)
    try {
      chrome.storage?.local?.set({ [ONBOARDED_KEY]: true })
    } catch {}
    animate(backdrop, { opacity: 0 }, { duration: 0.16 })
    animate(card, { opacity: 0, scale: 0.96, y: 8 }, { duration: 0.16 }).finished.then(() => {
      host.remove()
      const input = document.querySelector<HTMLElement>('textarea, [contenteditable="true"]')
      input?.focus()
    })
  }

  const renderStep = () => {
    dotEls.forEach((d, idx) => d.classList.toggle('active', idx === step))
    backBtn.style.display = step === 0 ? 'none' : 'inline-block'
    nextBtn.textContent = step === 2 ? t`Start using Vexel` : t`Continue`

    body.replaceChildren()

    const pill = document.createElement('div')
    pill.className = 'step-pill'

    const title = document.createElement('h2')
    title.className = 'title'

    const desc = document.createElement('p')
    desc.className = 'desc'

    const sandbox = document.createElement('div')
    sandbox.className = 'sandbox'

    if (step === 0) {
      pill.textContent = t`Step 1 of 3 · Instant Prompts`
      title.textContent = t`Type / anywhere to summon reusable skills`
      desc.textContent = t`Turn repetitive engineering prompts into one-keystroke slash commands—ready out of the box with zero setup.`

      const chips = document.createElement('div')
      chips.className = 'demo-chips'
      const previews: Record<string, string> = {
        'review-pr': t`Injects a senior code review checklist: edge cases, async race conditions, security & minimal patches.`,
        'explain-architecture': t`Maps data flow, state boundaries, and bottlenecks in plain, structured diagrams.`,
        'fix-bug': t`Isolates root cause, reproduces failure mode, and writes a surgical regression test.`,
      }

      Object.keys(previews).forEach((skillKey) => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'demo-chip' + (selectedDemoSkill === skillKey ? ' selected' : '')
        chip.textContent = '/' + skillKey
        chip.addEventListener('click', () => {
          if (selectedDemoSkill === skillKey) return
          selectedDemoSkill = skillKey
          chips.querySelectorAll('.demo-chip').forEach((c) => c.classList.remove('selected'))
          chip.classList.add('selected')
          animate(chip, { scale: Array(0.95, 1) }, { duration: 0.16 })
          previewBox.textContent = previews[selectedDemoSkill] || ''
          animate(previewBox, { opacity: Array(0.45, 1) }, { duration: 0.16 })
        })
        chips.appendChild(chip)
      })

      const previewBox = document.createElement('div')
      previewBox.className = 'demo-preview'
      previewBox.textContent = previews[selectedDemoSkill] || ''
      sandbox.append(chips, previewBox)
    } else if (step === 1) {
      pill.textContent = t`Step 2 of 3 · Zero-Server Workspace`
      title.textContent = t`Attach files & pack entire folders with @`
      desc.textContent = t`Connect any local folder directly in Chrome—no terminal or background server needed. Pack codebases or write AI code blocks straight to disk.`
      const folderBtn = document.createElement('button')
      folderBtn.type = 'button'
      folderBtn.className = 'folder-cta' + (connectedFolderName ? ' connected' : '')
      folderBtn.append(
        createLucideIcon(connectedFolderName ? 'check' : 'folder', 15, 'currentColor'),
        document.createTextNode(
          connectedFolderName
            ? t`Connected: ${connectedFolderName} (click to switch)`
            : t`Connect a Project Folder`
        )
      )
      folderBtn.addEventListener('click', async () => {
        animate(folderBtn, { scale: Array(0.97, 1) }, { duration: 0.18 })
        const handle = await pickLocalFolder()
        if (handle) {
          connectedFolderName = handle.name
          const folderName = handle.name
          showToast(t`Connected folder: ${folderName}`)
          renderStep()
        }
      })
      sandbox.appendChild(folderBtn)
    } else {
      pill.textContent = t`Step 3 of 3 · Flow & Speed`
      title.textContent = t`Built for effortless keyboard flow`
      desc.textContent = t`Every action is designed to stay out of your way until the exact millisecond you need it.`
      const grid = document.createElement('div')
      grid.className = 'shortcut-grid'
      const items = [
        { kbd: '/', lbl: t`Insert prompt skill` },
        { kbd: '@', lbl: t`Attach file or Pack folder` },
        { kbd: t`Save to file`, lbl: t`Hover any code block to write` },
        { kbd: 'Alt + ↓', lbl: t`Jump to last user prompt` },
      ]
      items.forEach((it) => {
        const sc = document.createElement('div')
        sc.className = 'shortcut-card'
        const k = document.createElement('span')
        k.className = 'kbd'
        k.textContent = it.kbd
        const l = document.createElement('span')
        l.className = 'shortcut-lbl'
        l.textContent = it.lbl
        sc.append(k, l)
        grid.appendChild(sc)
      })
      sandbox.appendChild(grid)
    }
    body.append(pill, title, desc, sandbox)
    animate(body, { opacity: Array(0, 1), y: Array(6, 0) }, { duration: 0.18 })
  }
  backBtn.addEventListener('click', () => {
    if (step > 0) {
      step--
      renderStep()
    }
  })
  nextBtn.addEventListener('click', () => {
    animate(nextBtn, { scale: Array(0.95, 1) }, { duration: 0.15 })
    if (step < 2) {
      step++
      renderStep()
    } else {
      finishOnboarding()
    }
  })
  skipBtn.addEventListener('click', finishOnboarding)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) finishOnboarding()
  })
  renderStep()
  animate(backdrop, { opacity: Array(0, 1) }, { duration: 0.2 })
  animate(
    card,
    { opacity: Array(0, 1), scale: Array(0.94, 1), y: Array(12, 0) },
    { type: 'spring', stiffness: 460, damping: 32, mass: 0.75 }
  )
}
export function initOnboarding(showToast: (msg: string) => void): void {
  try {
    chrome.storage?.local?.get([ONBOARDED_KEY], (res) => {
      if (!res || !res[ONBOARDED_KEY]) {
        window.setTimeout(() => openOnboardingModal(showToast), 650)
      }
    })
  } catch {}
}
