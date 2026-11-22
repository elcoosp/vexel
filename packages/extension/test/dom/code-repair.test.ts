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

  it('absorbs spilled TypeScript sections separated by banner comments (// ===) after class closing brace', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const longHead = [
      'export class BusEvenements {',
      '  private running = false;',
      ...Array.from({ length: 180 }, (_, i) => '  private field' + i + ' = ' + i + ';'),
      '  private async traiterFile(): Promise<void> {',
      '    if (!this.running) {',
      '      continue;',
      '    }',
    ].join('\n')

    document.body.innerHTML = [
      '<div data-scope-id="turn" data-last-turn="true">',
      '  <div data-subtree="aimc">',
      '    <div data-container-id="22">',
      '      <div data-hveid="CODE_TS_BANNER" data-sfc-cp="">',
      '        <div><div>typescript</div></div>',
      '        <pre><code>' +
        longHead.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code></pre>',
      '      </div>',
      '      <div data-sfc-cp="">    }<br>  }<br>}</div>',
      '      <div data-sfc-cp="">// ============================================================================<br>// Modélisation des Tâches et de l\'Exécution Distribuée<br>// ============================================================================</div>',
      "      <div data-sfc-cp=\"\">export enum StatutTache {<br>  EN_ATTENTE = 'EN_ATTENTE',<br>  TERMINEE = 'TERMINEE'<br>}</div>",
      '      <div data-xid="Gd7Hsc" data-sfc-cp="">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('[data-hveid="CODE_TS_BANNER"]')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('Modélisation des Tâches')
    expect(record?.code).toContain('StatutTache')
    expect(document.querySelectorAll('[data-container-id="22"] > [data-sfc-cp]').length).toBe(2)
  })

  it('repairs code cards without data-hveid and absorbs comment-heavy TypeScript fragments with single open brace', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const shortUnclosedHead = [
      'export interface OrchestratorConfig {',
      '  readonly maxWorkers: number;',
    ].join('\n')

    document.body.innerHTML = [
      '<div data-scope-id="turn" data-last-turn="true">',
      '  <div data-subtree="aimc">',
      '    <div data-container-id="99">',
      '      <div class="code-wrapper-no-hveid" data-sfc-cp="">',
      '        <div><div>typescript</div></div>',
      '        <pre><code>' + shortUnclosedHead + '</code></pre>',
      '      </div>',
      '      <div data-sfc-cp="">// ==========================================<br>// Section configuration réseau<br>// ==========================================<br>  readonly retryLimit: number;<br>  readonly timeoutMs: number;<br>}</div>',
      '      <div data-xid="Gd7Hsc" data-sfc-cp="">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('.code-wrapper-no-hveid')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('Section configuration réseau')
    expect(record?.code).toContain('timeoutMs: number;')
  })

  it('continues absorbing newly streamed spilled siblings across multiple streaming waves until legal footer', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const wave1Head = [
      'export class BusEvenements {',
      '  private enCoursDeTraitement = false;',
      ...Array.from({ length: 140 }, (_, i) => '  private prop' + i + ' = ' + i + ';'),
      '  private async traiterFile(): Promise<void> {',
      '    if (!this.enCoursDeTraitement) {',
      '      continue;',
      '    }',
    ].join('\n')

    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div data-subtree="aimc">',
      '    <div data-container-id="main-col">',
      '      <div data-hveid="CAIIAAgIEAA" data-sfc-cp="">',
      '        <div><div>typescript</div></div>',
      '        <pre><code>' +
        wave1Head.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code></pre>',
      '      </div>',
      '      <div data-sfc-cp="" data-hveid="CAIIAAgJEAA">const gestionnaires = this.abonnes.get(evenement.type);<br>if (!gestionnaires) {<br>continue;<br>}</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    // Wave 1 scan during streaming
    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    // Wave 2: Google streams the remaining 25 blocks + legal footer
    const container = document.querySelector('[data-container-id="main-col"]')!
    container.insertAdjacentHTML(
      'beforeend',
      [
        '<div data-sfc-cp="" data-hveid="CAIIAAgKEAA">    }<br>  }<br>}</div>',
        '<div data-sfc-cp="" data-hveid="CAIIAAhFEAA">export async function executerSimulation(): Promise<void> {<br>  const rapportSante = orchestrateur.verifierSanteGrappe();<br>  journal.info(\'Simulation\', \'Rapport de santé final de la grappe\', rapportSante);<br>}</div>',
        '<div data-xid="Gd7Hsc" data-sfc-cp="">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      ].join('')
    )

    // Wave 2 scan (triggered by MutationObserver / aimRenderComplete)
    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('[data-hveid="CAIIAAgIEAA"]')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('const gestionnaires = this.abonnes.get(evenement.type);')
    expect(record?.code).toContain('Rapport de santé final de la grappe')
    expect(document.querySelectorAll('[data-container-id="main-col"] > [data-sfc-cp]').length).toBe(
      2
    )
  })

  it('repairs the exact real Google AI Mode TypeScript dump (LJ1nve_f6 + 34 n6owBd siblings + Gd7Hsc footer)', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const realHead = [
      '// ============================================================================',
      "// Moteur de Simulation d'Écosystème Distribué et Gestionnaire d'Événements",
      '// ============================================================================',
      '',
      'export type IdentifiantUnique = string;',
      'export class BusEvenements {',
      '    private enCoursDeTraitement = false;',
      ...Array.from({ length: 120 }, (_, i) => '    private field' + i + ' = ' + i + ';'),
      '    private async traiterFile(): Promise<void> {',
      '        if (this.enCoursDeTraitement) {',
      '            return;',
      '        }',
      '        this.enCoursDeTraitement = true;',
      '',
      '        try {',
      '            while (!this.fileAttente.estVide()) {',
      '                const evenement = this.fileAttente.defiler();',
      '                if (!evenement) {',
      '                    continue;',
      '                }',
      '',
    ].join('\n')

    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn" jsname="CS7uPe" jsuid="LJ1nve_3p">',
      '  <div data-subtree="aimc" data-sfc-cp="" jsuid="LJ1nve_4l">',
      '    <div jsuid="LJ1nve_4g" class="Zkbeff" dir="ltr">',
      '      <div class="pWvJNd">',
      '        <div jsuid="LJ1nve_4z" dir="ltr" data-container-id="main-col" data-xid="VpUvz" class="mZJni">',
      '          <div style="display: contents" data-container-id="24">',
      '            <div class="yhAwj" data-sfc-cp="" jsuid="LJ1nve_6d"></div>',
      '            <div jsuid="LJ1nve_f6" class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="" data-hveid="CAIIAAgJEAA">',
      '              <div>',
      '                <div class="rq1a2" data-animation-atomic="true">',
      '                  <div class="a2TNg"><div class="GlO4G">typescript</div></div>',
      '                  <div class="PGvq2d" dir="ltr"><pre><code jsuid="LJ1nve_fn">' +
        realHead.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code></pre></div>',
      '                </div>',
      '                <div class="iMHp6c" data-animation-atomic="true"><div class="ZIumpf">Utilisez le code avec précaution.</div></div>',
      '              </div>',
      '            </div>',
      '            <div class="n6owBd awi2gc" data-sfc-cp="" jsuid="LJ1nve_g8" data-hveid="CAIIAAgKEAA"><span style="display:none;" data-key="aimhl"></span><span data-subtree="aimfl">const gestionnaires = this.abonnes.get(evenement.type);</span><br>if (!gestionnaires || gestionnaires.size === 0) {<br>continue;<br>}<span class="DHPVt Wg1cdb notranslate"><span class="NMq1me"><span aria-hidden="true">&nbsp;</span><span><span><button tabindex="0" data-amic="true" aria-label="Résultats associés" class="vDOt8c"></button></span></span></span></span></div>',
      '            <div class="n6owBd awi2gc" data-sfc-cp="" jsuid="LJ1nve_h1" data-hveid="CAIIAAgMEAA">} finally {<br>this.enCoursDeTraitement = false;<br>}<br>}<br>}</div>',
      '            <div class="n6owBd awi2gc" data-sfc-cp="" jsuid="LJ1nve_ho" data-hveid="CAIIAAgNEAA">// ============================================================================<br>// Modélisation des Tâches et de l\'Exécution Distribuée<br>// ============================================================================</div>',
      '            <div class="n6owBd awi2gc" data-sfc-cp="" jsuid="LJ1nve_hw" data-hveid="CAIIAAgOEAA">export enum StatutTache {<br>EN_ATTENTE = \'EN_ATTENTE\',<br>TERMINEE = \'TERMINEE\'<br>}</div>',
      '            <div class="n6owBd awi2gc" data-sfc-cp="" jsuid="LJ1nve_12o" data-hveid="CAIIAAhOEAA">const rapportSante = orchestrateur.verifierSanteGrappe();<br>journal.info(\'Simulation\', \'Rapport de santé final de la grappe\', rapportSante);<br>}</div>',
      '            <div class="yhAwj" data-sfc-cp="" jsuid="LJ1nve_12w"></div>',
      '            <div data-vexel-repaired-followup="true" data-vexel-ui="true"></div>',
      '            <div class="yhAwj" data-sfc-cp="" jsuid="LJ1nve_131"></div>',
      '            <div jsuid="LJ1nve_132" data-xid="Gd7Hsc" data-sfc-cp="" data-hveid="CAIIAAhQEAA"><div class="DBd2Wb"><div class="v4bSkd">Les réponses de l\'IA peuvent contenir des erreurs.</div></div></div>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('[jsuid="LJ1nve_f6"]')!
    expect(card.getAttribute('data-vexel-repaired')).toBe('1')
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('Rapport de santé final de la grappe')
    expect(document.querySelectorAll('.n6owBd.awi2gc').length).toBe(0)
  })

  it('absorbs spilled n6owBd siblings even when Google omits data-sfc-cp on streaming paragraphs (Da7Cvc_3z -> Da7Cvc_4a)', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const longUnclosedHead = [
      'export class BusEvenements {',
      ...Array.from({ length: 180 }, (_, i) => '  private item' + i + ' = ' + i + ';'),
      '  private async traiterFile(): Promise<void> {',
      '    if (!this.enCoursDeTraitement) {',
      '      continue;',
      '    }',
    ].join('\n')

    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn" jsuid="Da7Cvc_2l">',
      '  <div data-subtree="aimc">',
      '    <div class="mZJni" data-container-id="main-col">',
      '      <div style="display: contents" data-container-id="24">',
      '        <div jsuid="Da7Cvc_3z" class="BpxUDf aiModeUiCodeBlock__Container" data-hveid="CAIIAAgJEAA">',
      '          <div>',
      '            <div class="rq1a2"><div><div>typescript</div></div><pre><code>' +
        longUnclosedHead.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code></pre></div>',
      '            <div class="iMHp6c"><div>Utilisez le code avec précaution.</div></div>',
      '          </div>',
      '        </div>',
      '        <div class="n6owBd awi2gc" jsuid="Da7Cvc_4a">const gestionnaires = this.abonnes.get(evenement.type);<br>if (!gestionnaires) {<br>continue;<br>}</div>',
      '        <div class="n6owBd awi2gc" jsuid="Da7Cvc_4b">    }<br>  }<br>}</div>',
      '        <div jsuid="Da7Cvc_end" data-xid="Gd7Hsc">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('[jsuid="Da7Cvc_3z"]')!
    expect(card.getAttribute('data-vexel-repaired')).toBe('1')
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain('const gestionnaires = this.abonnes.get(evenement.type);')
    expect(document.querySelectorAll('.n6owBd.awi2gc').length).toBe(0)
  })

  it('never absorbs trailing Google internal <style> or <script> hydration nodes after code closes', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (_msg: unknown, cb?: (res: unknown) => void) => {
          cb?.({ ok: false })
        },
      },
    }
    const unclosedHead = [
      'export async function executerSimulation(): Promise<void> {',
      ...Array.from({ length: 160 }, (_, i) => '  const step' + i + ' = ' + i + ';'),
      '  if (true) {',
    ].join('\n')

    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div class="mZJni" data-container-id="main-col">',
      '    <div style="display: contents" data-container-id="24">',
      '      <div class="BpxUDf aiModeUiCodeBlock__Container" data-hveid="CAIIAAgJEAA">',
      '        <div>',
      '          <div class="rq1a2"><div><div>typescript</div></div><pre><code>' +
        unclosedHead.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
        '</code></pre></div>',
      '          <div class="iMHp6c"><div>Utilisez le code avec précaution.</div></div>',
      '        </div>',
      '      </div>',
      "      <div class=\"n6owBd awi2gc\">  }<br>  journal.info('Simulation', 'Rapport final');<br>}</div>",
      '      <style>.DdVMXd{clear:both;position:relative}.puIGge{position:sticky;top:100vh}</style>',
      '      <script>(function(){var pd=-1;var pi=0;})();</script>',
      '      <div data-xid="Gd7Hsc">Les réponses de l\'IA peuvent contenir des erreurs.</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('.aiModeUiCodeBlock__Container')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain("journal.info('Simulation', 'Rapport final');")
    expect(record?.code).not.toContain('.DdVMXd')
    expect(record?.code).not.toContain('var pd=-1')
  })

  it('restores inline <code> backticks for template literals in spilled n6owBd chunks', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (msg: { code?: string }, cb?: (res: unknown) => void) => {
          cb?.({ ok: true, formatted: msg.code, engine: 'oxfmt' })
        },
      },
    }
    const unclosedHead = [
      'export function logEvent(evenement: { type: string }) {',
      ...Array.from({ length: 160 }, (_, i) => '  const n' + i + ' = ' + i + ';'),
      '  try {',
    ].join('\n')

    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div class="mZJni" data-container-id="main-col">',
      '    <div style="display: contents" data-container-id="24">',
      '      <div class="BpxUDf aiModeUiCodeBlock__Container" data-hveid="CAIIAAgJEAA">',
      '        <div>',
      '          <div class="rq1a2"><div><div>typescript</div></div><pre><code>' +
        unclosedHead +
        '</code></pre></div>',
      '          <div class="iMHp6c"><div>Utilisez le code avec précaution.</div></div>',
      '        </div>',
      '      </div>',
      '      <div class="n6owBd awi2gc">  } catch (erreur) {<br>    console.error(\'Bus\', <code>Erreur sur ${evenement.type}</code>);<br>  }<br>}</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector('.aiModeUiCodeBlock__Container')!
    const record = getRepairedCodeForContainer(card)
    expect(record?.code).toContain("console.error('Bus', `Erreur sur ${evenement.type}`);")
    expect(record?.engine).toBe('oxfmt')
  })

  it('mounts format badge with elapsed milliseconds in the bottom bar next to the copy button', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (msg: { code?: string }, cb?: (res: unknown) => void) => {
          cb?.({ ok: true, formatted: msg.code, engine: 'oxfmt' })
        },
      },
    }
    const unclosedHead = [
      'export function demo() {',
      ...Array.from({ length: 160 }, (_, i) => '  const v' + i + ' = ' + i + ';'),
      '  if (true) {',
    ].join('\n')

    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div class="mZJni" data-container-id="main-col">',
      '    <div style="display: contents" data-container-id="24">',
      '      <div class="BpxUDf aiModeUiCodeBlock__Container" data-hveid="CAIIAAgJEAA">',
      '        <div>',
      '          <div class="rq1a2"><div><div>typescript</div></div><pre><code>' +
        unclosedHead +
        '</code></pre></div>',
      '          <div class="iMHp6c"><div class="ZIumpf">Utilisez le code avec précaution.</div><div class="YHsVn"><button aria-label="Copier">Copy</button></div></div>',
      '        </div>',
      '      </div>',
      '      <div class="n6owBd awi2gc">  }<br>}</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 80))

    const card = document.querySelector<HTMLElement>('.aiModeUiCodeBlock__Container')!
    const footer = card.querySelector<HTMLElement>('.iMHp6c')!
    const badge = footer.querySelector<HTMLElement>('[data-vexel-format-badge="true"]')!
    expect(badge).not.toBeNull()
    expect(badge.nextElementSibling?.querySelector("button[aria-label='Copier']")).not.toBeNull()
    const label =
      badge.shadowRoot?.querySelector('[data-vexel-pill-label="true"]')?.textContent || ''
    expect(label).toMatch(/· oxfmt · \d+ ms$/)
    const record = getRepairedCodeForContainer(card)
    expect(record?.durationMs).toBeGreaterThanOrEqual(1)
  })

  it('repairs truncated Python and Bash heredoc blocks with native engines in footer', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (msg: { code?: string }, cb?: (res: unknown) => void) => {
          const engine = msg.code?.includes('def sync_records')
            ? 'ruff'
            : msg.code?.includes('#!/usr/bin/env bash')
              ? 'shfmt'
              : 'fallback'
          cb?.({ ok: true, formatted: msg.code, engine })
        },
      },
    }
    const pyHead = [
      'def sync_records(records: list[dict]):',
      ...Array.from({ length: 180 }, (_, i) => '    processed_record_item_' + i + ' = ' + i),
      '    if len(records) > 0:',
    ].join('\n')
    const shHead = [
      '#!/usr/bin/env bash',
      ...Array.from({ length: 180 }, (_, i) => 'echo "executing pipeline step ' + i + '"'),
      "cat <<'EOF' > /tmp/config.yaml",
      'server:',
      '  port: 8080',
    ].join('\n')
    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div class="mZJni" data-container-id="main-col">',
      '    <div style="display: contents" data-container-id="10">',
      '      <div class="BpxUDf aiModeUiCodeBlock__Container" data-hveid="card-py"><div><div><div>python</div></div><pre><code>' +
        pyHead +
        '</code></pre></div><div data-testid="footer-py"><div>Caution</div><div><button aria-label="Copier">Copy</button></div></div></div></div>',
      '      <div class="n6owBd">        return len(records)</div>',
      '    </div>',
      '    <div class="n6owBd">Here is the deployment script:</div>',
      '    <div style="display: contents" data-container-id="11">',
      '      <div class="BpxUDf aiModeUiCodeBlock__Container" data-hveid="card-sh"><div><div><div>bash</div></div><pre><code>' +
        shHead +
        '</code></pre></div><div data-testid="footer-sh"><div>Caution</div><div><button aria-label="Copier">Copy</button></div></div></div></div>',
      '      <div class="n6owBd">EOF<br>chmod 600 /tmp/config.yaml</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')
    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 90))
    const pyCard = document.querySelector<HTMLElement>('[data-hveid="card-py"]')!
    const pyRecord = getRepairedCodeForContainer(pyCard)
    expect(pyRecord?.engine).toBe('ruff')
    expect(pyRecord?.code).toContain('return len(records)')
    expect(
      document
        .querySelector('[data-testid="footer-py"] [data-vexel-format-badge="true"]')
        ?.shadowRoot?.querySelector('[data-vexel-pill-label="true"]')?.textContent || ''
    ).toMatch(/· ruff · \d+ ms/)
    const shCard = document.querySelector<HTMLElement>('[data-hveid="card-sh"]')!
    const shRecord = getRepairedCodeForContainer(shCard)
    expect(shRecord?.engine).toBe('shfmt')
    expect(shRecord?.code).toContain('EOF\nchmod 600 /tmp/config.yaml')
    expect(
      document
        .querySelector('[data-testid="footer-sh"] [data-vexel-format-badge="true"]')
        ?.shadowRoot?.querySelector('[data-vexel-pill-label="true"]')?.textContent || ''
    ).toMatch(/· shfmt · \d+ ms/)
  })

  it('updates existing footer badge and tail span cleanly across incremental streaming waves', async () => {
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        sendMessage: (msg: { code?: string }, cb?: (res: unknown) => void) => {
          cb?.({ ok: true, formatted: msg.code, engine: 'oxfmt' })
        },
      },
    }
    const head = [
      'export function streamDemo() {',
      ...Array.from({ length: 140 }, (_, i) => '  const a' + i + ' = ' + i + ';'),
      '  if (true) {',
    ].join('\n')
    document.body.innerHTML = [
      '<div class="CKgc1d" data-last-turn="true" data-scope-id="turn">',
      '  <div class="mZJni" data-container-id="main-col">',
      '    <div style="display: contents" data-container-id="30">',
      '      <div class="BpxUDf" data-hveid="card-stream"><div><div><div><div>typescript</div></div><div><pre><code>' +
        head +
        '</code></pre></div></div><div data-testid="footer-stream"><div>Caution</div><div><button aria-label="Copier">Copy</button></div></div></div></div>',
      '      <div class="n6owBd">  const step = 1;</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('')
    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 70))
    const wave2 = document.createElement('div')
    wave2.className = 'n6owBd'
    wave2.innerHTML = '  }<br>}'
    document.querySelector('[data-container-id="30"]')?.appendChild(wave2)
    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 70))
    expect(
      document.querySelectorAll('[data-testid="footer-stream"] [data-vexel-format-badge="true"]')
        .length
    ).toBe(1)
    const card = document.querySelector<HTMLElement>('[data-hveid="card-stream"]')!
    expect(card.querySelectorAll('[data-vexel-repaired-tail="true"]').length).toBe(1)
    expect(getRepairedCodeForContainer(card)?.code).toContain('const step = 1;')
  })

  it('does NOT falsely repair a complete bash block containing #[allow] in strings or absorb sibling .AHmQrc prose', async () => {
    document.body.innerHTML = `
      <div class="CKgc1d" data-last-turn="true" data-scope-id="turn" jsname="CS7uPe">
        <div class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="" data-hveid="CAIIAQjxBhAA">
          <div>
            <div class="rq1a2">
              <div class="a2TNg"><div class="GlO4G">bash</div></div>
              <div class="PGvq2d">
                <pre><code>#!/usr/bin/env bash
set -euo pipefail
python3 - &lt;&lt; 'PY'
print("hello")
PY
echo "=== 1. Verification zero #[allow] &amp; Rust Clippy pedantic ==="
! grep -rn "#\\[allow" crates/
git status -s
</code></pre>
              </div>
            </div>
            <div class="iMHp6c">
              <div class="ZIumpf">Utilisez le code avec précaution.</div>
              <div class="YHsVn"><button aria-label="Copier le texte du code dans le presse-papiers.">Copier</button></div>
            </div>
          </div>
        </div>
        <div class="AHmQrc" data-sfc-cp="" data-hveid="CAIIAQjzBhAA">
          <div class="n6owBd awi2gc">Exécute <code>./wr.sh</code> avec ce script : il corrige ces 18 lignes exactes (<code>macos.rs</code> + ligne 191 de <code>main.rs</code>), exécute toute la suite de tests Rust + Extension et redéploie/signe le binaire macOS conformément à <code>AGENTS.md</code>.</div>
        </div>
      </div>
    `

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 30))

    const codeCard = document.querySelector('.aiModeUiCodeBlock__Container')!
    const proseBlock = document.querySelector('.AHmQrc')!
    expect(codeCard.hasAttribute('data-vexel-repaired')).toBe(false)
    expect(codeCard.querySelector('[data-vexel-format-badge="true"]')).toBeNull()
    expect(codeCard.querySelector('[data-vexel-repaired-tail="true"]')).toBeNull()
    expect(proseBlock.isConnected).toBe(true)
    expect(proseBlock.textContent).toContain('Exécute ./wr.sh avec ce script')
  })

  it('continues repairing shell/CLI commands after a heredoc closes mid-stream until the FollowUp boundary', async () => {
    document.body.innerHTML = `
      <div class="mZJni" data-scope-id="turn" jsname="CS7uPe">
        <div class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="" data-hveid="CAIIAQijCBAA">
          <div>
            <div class="rq1a2">
              <div class="a2TNg"><div class="GlO4G">bash</div></div>
              <div class="PGvq2d">
                <pre><code>#!/usr/bin/env bash
set -euo pipefail
python3 - &lt;&lt; 'PY'
print("hi")
</code></pre>
              </div>
            </div>
            <div class="iMHp6c">
              <div class="ZIumpf">Utilisez le code avec précaution.</div>
              <div class="YHsVn"><button aria-label="Copier le texte du code dans le presse-papiers.">Copier</button></div>
            </div>
          </div>
        </div>
        <div class="n6owBd awi2gc" data-sfc-cp="" data-hveid="CAIIAQilCBAA">assert_eq!(crate::macos::take_test_notifications(), Vec::new());<br>p_main.write_text(maintxt, encoding="utf-8")<br>PY</div>
        <div class="n6owBd awi2gc" data-sfc-cp="" data-hveid="CAIIAQjyCBAA">cargo fmt --all</div>
        <div class="n6owBd awi2gc" data-sfc-cp="" data-hveid="CAIIAQj0CBAA">echo "=== 1. Verification ==="<br>! grep -rn "#\\[allow" crates/<br>cargo clippy --workspace --all-targets -- -D warnings<br>cargo test --workspace</div>
        <div class="n6owBd awi2gc" data-sfc-cp="" data-hveid="CAIIAQj7CBAA">echo "=== 4. Etat Git ==="<br>git status -s</div>
        <div class="fMjZBb">
          <div class="BpxUDf aiModeUiCodeBlock__Container" data-sfc-cp="" data-hveid="CAIIAQj9CBAA">
            <div class="rq1a2"><div class="PGvq2d"><pre><code>&lt;FollowUp&gt;
Exécute \`./wr.sh\` avec ce script.
&lt;</FollowUp></pre></div></div>
          </div>
        </div>
      </div>
    `

    scanAndRepairCodeBlocks(document, () => {})
    await new Promise((r) => setTimeout(r, 40))

    const codeCard = document.querySelector('.aiModeUiCodeBlock__Container')!
    const fullText = codeCard.querySelector('pre code')?.textContent || ''
    expect(fullText).toContain('PY')
    expect(fullText).toContain('cargo fmt --all')
    expect(fullText).toContain('cargo clippy --workspace --all-targets -- -D warnings')
    expect(fullText).toContain('git status -s')
    expect(document.querySelector('[data-vexel-repaired-followup="true"]')).not.toBeNull()
  })
})
