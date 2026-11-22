import { describe, expect, it } from 'vitest'
import {
  getRepairedCodeForContainer,
  scanAndRepairCodeBlocks,
} from '../../src/features/code-repair'

describe('code-repair DOM integration', () => {
  it('never alters healthy long code blocks that are already syntactically closed', async () => {
    document.body.innerHTML = ''
    const healthyCode =
      'export function healthy() {\n' + '  const a = 1;\n'.repeat(700) + '  return a;\n}'
    const root = document.createElement('div')
    root.innerHTML = `
      <div data-hveid="HEALTHY1">
        <div>
          <div>ts</div>
          <div><pre><code><span class="tok-kw">export</span> function healthy() {${healthyCode.slice(26)}</code></pre></div>
        </div>
      </div>
      <div data-hveid="PARA1" data-sfc-cp="">Here is how it works:</div>
    `
    document.body.appendChild(root)

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 30))

    const card = document.querySelector('[data-hveid="HEALTHY1"]') as HTMLElement
    expect(getRepairedCodeForContainer(card)).toBeUndefined()
    expect(card.querySelector('.tok-kw')).not.toBeNull()
    expect(card.querySelector('[data-vexel-format-badge="true"]')).toBeNull()
  })

  it('reassembles truncated code block while preserving head spans, removes spilled siblings, and renders FollowUp chips', async () => {
    document.body.innerHTML = ''
    const longHead =
      '// file: worker.ts\nexport function start() {\n' +
      '  const x = 1;\n'.repeat(600) +
      '  if (x === 1) {'

    const root = document.createElement('div')
    root.setAttribute('data-container-id', 'main-col')
    root.innerHTML = `
      <div data-hveid="CARD1">
        <div>
          <div>ts</div>
          <div><pre><code><span class="head-span">${longHead}</span></code></pre></div>
          <div><button aria-label="Copier le texte du code dans le presse-papiers.">Copy</button></div>
        </div>
      </div>
      <div data-hveid="SPILL1" data-sfc-cp="">
        const result = compute();<br>return result;<br>}<br>}<button data-amic="true" aria-label="Sources">1</button>
      </div>
      <div>
        <div data-hveid="FOLLOW1">
          <div>
            <div><pre><code>### Next steps\n* Check **lease** timeout\n&lt;FollowUp&gt;Add Redis Lua atomic script?&lt;/FollowUp&gt;</code></pre></div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(root)

    const toasts: string[] = []
    scanAndRepairCodeBlocks(document, (m) => toasts.push(m))
    await new Promise((r) => setTimeout(r, 30))

    const card1 = document.querySelector('[data-hveid="CARD1"]') as HTMLElement
    const record = getRepairedCodeForContainer(card1)
    expect(record).toBeDefined()
    expect(record?.code).toContain('    const result = compute();')
    expect(record?.code).toContain('    return result;')
    expect(card1.querySelector('.head-span')).not.toBeNull()
    expect(card1.querySelector('[data-vexel-repaired-tail="true"]')).not.toBeNull()
    expect(document.querySelector('[data-hveid="SPILL1"]')).toBeNull()
    expect(card1.querySelector('[data-vexel-format-badge="true"]')).not.toBeNull()

    const followUpHost = document.querySelector('[data-vexel-repaired-followup="true"]')
    expect(followUpHost).not.toBeNull()
    const chip = followUpHost?.shadowRoot?.querySelector('button')
    expect(chip).not.toBeNull()
    expect(chip?.textContent).toContain('Add Redis Lua atomic script?')
  })

  it('repairs truncated heredoc bash/python block below 6500 chars with spilled text siblings', async () => {
    const paddingEntries = Array.from(
      { length: 115 },
      (_, i) => `    "Key ${i}": "Wert ${i}",`
    ).join('\n')
    const headCode = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'cd ~/Documents/Repos/context-braid',
      '',
      "cat << 'EOF' > /tmp/translate_de_es_ko.py",
      'import json',
      '',
      'DATA = json.loads(r"""{',
      '  "de": {',
      paddingEntries,
      '    "Starting ContextBraid engine...": "ContextBraid-Engine wird gestartet...",',
    ].join('\n')

    // Reproduce exact ~6200-char heredoc truncation before EOF + spilled [data-sfc-cp] siblings
    expect(headCode.length).toBeLessThan(6500)

    document.body.innerHTML = `
      <div data-scope-id="turn" jsname="CS7uPe">
        <div data-container-id="main-col">
          <div style="display: contents" data-container-id="7">
            <div data-hveid="CAIIFBAA">
              <div>
                <div>
                  <div><div>bash</div></div>
                  <div><pre><code><span class="head-span">${headCode}</span></code></pre></div>
                </div>
              </div>
            </div>
            <div data-sfc-cp="" data-hveid="CAIIFRAA">"Switch to {0} ({1})": "{0}({1})로 전환",<br>}</div></div>""")</div>
            <div data-sfc-cp="" data-hveid="CAIIFhAA">for loc, mp in DATA.items():<br>p = f"packages/raycast/src/locales/{loc}/messages.po"<br>open(p, "w").write(txt)<br>print(f"OK {loc}")<br>EOF<br>python3 /tmp/translate_de_es_ko.py<br>rm -f /tmp/translate_de_es_ko.py</div>
          </div>
        </div>
      </div>
    `

    const toasts: string[] = []
    scanAndRepairCodeBlocks(document, (m) => toasts.push(m))
    await new Promise((r) => setTimeout(r, 30))

    const card = document.querySelector('[data-hveid="CAIIFBAA"]')!
    const record = getRepairedCodeForContainer(card)
    expect(record).toBeDefined()
    expect(record?.code).toContain('for loc, mp in DATA.items():')
    expect(record?.code).toContain('EOF')
    expect(record?.code).toContain('python3 /tmp/translate_de_es_ko.py')
    expect(document.querySelector('[data-hveid="CAIIFRAA"]')).toBeNull()
    expect(document.querySelector('[data-hveid="CAIIFhAA"]')).toBeNull()
  })

  it('never absorbs trailing prose or Google legal disclaimer footer into a code block', async () => {
    const longCommands = Array.from(
      { length: 120 },
      (_, i) => `pnpm --filter pkg-${i} run i18n:extract`
    ).join('\n')
    document.body.innerHTML = `
      <div data-scope-id="turn" jsname="CS7uPe">
        <div data-container-id="main-col">
          <div data-hveid="CODE_CLEAN">
            <div><div>bash</div></div>
            <div><pre><code>${longCommands}\ncat src/i18n.ts\npnpm run i18n:extract</code></pre></div>
          </div>
          <div data-sfc-cp="" data-hveid="PROSE_1">Exécute le Script 507 (./wr.sh) et colle sa sortie (src/i18n.ts + l'export) pour que je vérifie le catalogue.</div>
          <div data-sfc-cp="" data-hveid="FOOTER_1">Les réponses de l'IA peuvent contenir des erreurs. <a href="https://google.com">En savoir plus</a></div>
        </div>
      </div>
    `

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 30))

    const card = document.querySelector('[data-hveid="CODE_CLEAN"]')!
    const preText = card.querySelector('pre code')?.textContent || ''
    expect(preText).toContain('pnpm run i18n:extract')
    expect(preText).not.toContain('Exécute le Script 507')
    expect(preText).not.toContain("Les réponses de l'IA")
    expect(document.querySelector('[data-hveid="PROSE_1"]')).not.toBeNull()
    expect(document.querySelector('[data-hveid="FOOTER_1"]')).not.toBeNull()
  })

  it('renders narrative FollowUp prose as text rather than clickable action chips, and awaits bridge formatter (>250ms)', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          setTimeout(() => {
            cb?.({
              ok: true,
              data: {
                formatted: 'const x = 1;\nconst y = 2;\n',
                engine: 'prettier',
              },
            })
          }, 320)
        },
      },
    }

    const longHead = Array.from({ length: 280 }, (_, i) => `const v${i} = ${i};`).join('\n')
    document.body.innerHTML = `
      <div data-scope-id="turn" jsname="CS7uPe">
        <div data-hveid="CODE_BRIDGE">
          <div><div>ts</div></div>
          <div><pre><code>${longHead}</code></pre></div>
        </div>
        <div data-hveid="POISON_PROSE">
          <pre><code>${String.fromCharCode(60)}FollowUp>\nExécute ce mini Script 514 (\`./wr.sh\`) pour traduire \`de\`, \`es\` et \`ko\`, puis je te donne le Script 515 pour câbler \`src/i18n.ts\`.\n${String.fromCharCode(60, 47)}FollowUp></code></pre>
        </div>
      </div>
    `

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 420))

    const card = document.querySelector('[data-hveid="CODE_BRIDGE"]')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.engine).toBe('prettier')

    const followUpHost = document.querySelector('[data-vexel-repaired-followup="true"]')!
    expect(followUpHost).not.toBeNull()
    const actionButtons = followUpHost.shadowRoot?.querySelectorAll('button') || []
    expect(actionButtons.length).toBe(0)
    expect(followUpHost.shadowRoot?.firstElementChild?.textContent).toContain(
      'Exécute ce mini Script 514'
    )
  })

  it('absorbs multi-div spilled JS/bash heredoc fragments with escaped template backticks', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const BT = String.fromCodePoint(96)
    const headLines = [
      "cd ~/Documents/Repos/vexel && cat << 'EOF' > /tmp/add-instant-thread-cache.mjs",
      "import fs from 'node:fs';",
      "const p = 'packages/extension/src/features/dom-booster.ts';",
      "let s = fs.readFileSync(p, 'utf8');",
      "if (!s.includes('vexel-instant-preview-host')) {",
      '  const cacheModule = ' + BT,
      '  const getConversationCacheKey = (): string | null => {',
      "    const elids = url.searchParams.get('elids')",
      '    if (elids) return \\' + BT + 'elids:${elids}\\' + BT,
      '    return null',
      '  }',
      '  const waitRealTurns = () => {',
      '    const obs = new MutationObserver(() => {',
    ].join('\\n')

    document.body.innerHTML = [
      '<div data-scope-id="turn">',
      '  <div data-subtree="aimc">',
      '    <div data-container-id="main-col">',
      '      <div data-hveid="CODE_HEREDOC" class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="">',
      '        <div class="a2TNg"><div class="GlO4G">bash</div></div>',
      '        <pre><code>' +
        headLines.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code></pre>',
      '      </div>',
      '      <div class="n6owBd awi2gc" data-sfc-cp="">const turns = document.querySelectorAll(\'[data-scope-id="turn"]\')<br>if (turns.length &gt;= 2) {<br>obs.disconnect()<br>}</div>',
      '      <div class="n6owBd awi2gc" data-sfc-cp="">const lastBrace = s.lastIndexOf(\'}\');<br>s = s.slice(0, lastBrace) + cacheModule + \'}\\n\';<br>fs.writeFileSync(p, s);<br>}<br>' +
        BT +
        ';<br>EOF<br>node /tmp/add-instant-thread-cache.mjs &amp;&amp; rm /tmp/add-instant-thread-cache.mjs &amp;&amp; git commit -m "feat(perf): add stale-while-revalidate instant last-turn cache for fast thread reopen" &amp;&amp; git push</div>',
      '      <div data-vexel-repaired-followup="true" data-vexel-ui="true"></div>',
      '      <div data-xid="Gd7Hsc" data-sfc-cp="">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('[data-hveid="CODE_HEREDOC"]')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('EOF')
    expect(record?.code).toContain('git commit -m')
    expect(document.querySelectorAll('.n6owBd').length).toBe(0)
  })

  it('never stops early when spilled code contains markdown list items (ul/li) or a secondary split code card before closing braces', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const longHead = [
      'export async function runBigPipeline(items: string[]) {',
      '  const results: string[] = []',
      '  for (const item of items) {',
      '    if (item.length > 0) {',
      '      results.push(item.trim())',
      ...Array.from({ length: 240 }, (_, i) => '      const step' + i + ' = ' + i),
    ].join('\n')

    document.body.innerHTML = [
      '<div data-scope-id="turn">',
      '  <div data-subtree="aimc">',
      '    <div data-container-id="main-col">',
      '      <div data-hveid="CODE_SPLIT_20K" class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="">',
      '        <div class="a2TNg"><div class="GlO4G">typescript</div></div>',
      '        <pre><code>' + longHead + '</code></pre>',
      '      </div>',
      '      <ul class="XSq4R"><li data-sfc-cp=""> - first spilled bullet line inside open function</li></ul>',
      '      <div class="n6owBd awi2gc" data-sfc-cp="">    }<br>  }<br>  return results<br>}</div>',
      '      <div data-hveid="CODE_SPLIT_TAIL" class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="">',
      '        <div class="a2TNg"><div class="GlO4G">typescript</div></div>',
      '        <pre><code>export const PIPELINE_DONE = true</code></pre>',
      '      </div>',
      '      <div data-xid="Gd7Hsc" data-sfc-cp="">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('[data-hveid="CODE_SPLIT_20K"]')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('return results')
    expect(record?.code).toContain('PIPELINE_DONE')
    expect(document.querySelector('[data-hveid="CODE_SPLIT_TAIL"]')).toBeNull()
  })
})
