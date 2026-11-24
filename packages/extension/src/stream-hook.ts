if (window === window.top) {
  const isAiStreamUrl = (rawUrl: string): boolean =>
    /\/(?:async\/|search\?|folwr|udm=50)/i.test(rawUrl)

  const emitStreamEnd = (): void => {
    document.dispatchEvent(new CustomEvent('vexel:stream-end'))
  }

  const origFetch = window.fetch
  if (typeof origFetch === 'function') {
    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : typeof (input as Request)?.url === 'string'
              ? (input as Request).url
              : ''
      const res = await origFetch.call(this, input, init)
      if (isAiStreamUrl(url) && res.body && typeof res.body.tee === 'function') {
        try {
          const [pageBranch, monitorBranch] = res.body.tee()
          const reader = monitorBranch.getReader()
          void (async () => {
            try {
              while (true) {
                const { done } = await reader.read()
                if (done) break
              }
            } catch {
            } finally {
              emitStreamEnd()
            }
          })()
          return new Response(pageBranch, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          })
        } catch {
          emitStreamEnd()
        }
      }
      return res
    }
  }

  const origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.send = function patchedSend(
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    this.addEventListener('loadend', emitStreamEnd, { once: true })
    origSend.call(this, body)
  }

  const wrapHistory = (method: 'pushState' | 'replaceState'): void => {
    const orig = history[method]
    history[method] = function patchedHistory(
      data: unknown,
      unused: string,
      url?: string | URL | null
    ): void {
      orig.call(this, data, unused, url)
      document.dispatchEvent(new CustomEvent('vexel:spa-nav'))
    }
  }
  wrapHistory('pushState')
  wrapHistory('replaceState')
}
