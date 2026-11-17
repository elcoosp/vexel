import { createLucideIcon } from './icons';

const EXT_BY_LANG: Record<string, string> = {
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  json: 'json',
  html: 'html',
  css: 'css',
  bash: 'sh',
  sh: 'sh',
  zsh: 'sh',
  yaml: 'yml',
  yml: 'yml',
  markdown: 'md',
  md: 'md',
  sql: 'sql',
};

function inferSuggestedPath(block: HTMLElement, codeText: string, lang: string): string {
  const firstLine = (codeText.split('\n')[0] || '').trim();
  const commentPathMatch = firstLine.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:file:\s*)?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/i);
  if (commentPathMatch && commentPathMatch[1]) {
    return commentPathMatch[1];
  }

  let prev: Element | null = block.previousElementSibling;
  for (let step = 0; step < 2 && prev; step++) {
    const txt = (prev.textContent || '').trim();
    const headerMatch = txt.match(/(?:File:|Path:|\b)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)/);
    if (headerMatch && headerMatch[1]) {
      return headerMatch[1];
    }
    prev = prev.previousElementSibling;
  }

  const ext = EXT_BY_LANG[lang.toLowerCase()] || 'txt';
  return 'snippet.' + ext;
}

export function initCodeSave(showToast: (msg: string) => void): void {
  const attachSaveButtons = () => {
    const containers = document.querySelectorAll<HTMLElement>(
      '.aiModeUiCodeBlock__Container:not([data-vexel-save="true"])'
    );

    containers.forEach((container) => {
      container.setAttribute('data-vexel-save', 'true');
      const codeEl = container.querySelector('code');
      const header = container.querySelector<HTMLElement>('.a2TNg') || container.firstElementChild as HTMLElement | null;
      if (!codeEl || !header) return;

      const langMatch = (codeEl.className || '').match(/language-([a-zA-Z0-9_-]+)/);
      const lang = langMatch ? langMatch[1] : '';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = 'Save code block to local file via Vexel Bridge';
      btn.append(createLucideIcon('download', 12, 'currentColor'), document.createTextNode('Save to file'));
      Object.assign(btn.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        marginLeft: '8px',
        padding: '3px 9px',
        borderRadius: '999px',
        border: '1px solid rgba(60, 64, 67, 0.16)',
        backgroundColor: '#ffffff',
        color: '#3c4043',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '11.5px',
        fontWeight: '500',
        lineHeight: '1.2',
        cursor: 'pointer',
        transition: 'background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease',
      });

      btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = '#f1f3f4';
        btn.style.borderColor = '#c6dafc';
        btn.style.color = '#1a73e8';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = '#ffffff';
        btn.style.borderColor = 'rgba(60, 64, 67, 0.16)';
        btn.style.color = '#3c4043';
      });

      let barEl: HTMLDivElement | null = null;

      const closeBar = () => {
        if (barEl) {
          barEl.remove();
          barEl = null;
        }
      };

      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        if (barEl) {
          closeBar();
          return;
        }

        const currentCode = codeEl.textContent || '';
        const suggested = inferSuggestedPath(container, currentCode, lang);

        barEl = document.createElement('div');
        Object.assign(barEl.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 12px',
          backgroundColor: '#f8f9fa',
          borderTop: '1px solid #e8eaed',
          borderBottom: '1px solid #e8eaed',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        });

        const label = document.createElement('span');
        label.textContent = 'Path:';
        Object.assign(label.style, {
          fontSize: '11.5px',
          fontWeight: '600',
          color: '#5f6368',
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.value = suggested;
        input.placeholder = 'relative/path/to/file.ts';
        Object.assign(input.style, {
          flex: '1',
          minWidth: '0',
          padding: '4px 8px',
          borderRadius: '6px',
          border: '1px solid #dadce0',
          backgroundColor: '#ffffff',
          color: '#1f1f1f',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '12px',
          outline: 'none',
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Save';
        Object.assign(confirmBtn.style, {
          padding: '4px 11px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: '#1a73e8',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        Object.assign(cancelBtn.style, {
          padding: '4px 9px',
          borderRadius: '6px',
          border: '1px solid #dadce0',
          backgroundColor: '#ffffff',
          color: '#5f6368',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
        });

        const commitSave = () => {
          const relPath = input.value.trim();
          if (!relPath) return;
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Saving...';
          chrome.runtime.sendMessage(
            { type: 'WRITE_FILE', relPath, content: codeEl.textContent || '' },
            (res) => {
              if (!res?.ok || !res.data?.ok) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Save';
                showToast(res?.data?.error || 'Failed to write file');
                return;
              }
              closeBar();
              showToast('Saved ' + relPath + ' (' + res.data.bytes + ' B)');
            }
          );
        };

        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          commitSave();
        });
        cancelBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeBar();
        });
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commitSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            closeBar();
          }
});
barEl.append(label, input, confirmBtn, cancelBtn);
header.insertAdjacentElement('afterend', barEl);
input.focus();
input.select();
});
header.appendChild(btn);
});
};
let timer: number | undefined;
const schedule = () => {
if (timer) window.clearTimeout(timer);
timer = window.setTimeout(attachSaveButtons, 280);
};
const obs = new MutationObserver((mutations) => {
for (let i = 0; i < mutations.length; i++) {
if (mutations[i].addedNodes.length > 0) {
schedule();
return;
}
}
});
obs.observe(document.body, { childList: true, subtree: true });
schedule();
}
