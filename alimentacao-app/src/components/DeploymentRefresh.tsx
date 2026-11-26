import { useEffect } from 'react'

const APP_ASSET_PATTERN = /\/assets\/index-[^/]+\.js$/

function assetPathFromDocument(documentToRead: Document) {
  for (const script of Array.from(documentToRead.scripts)) {
    if (!script.src) continue
    const pathname = new URL(script.src, window.location.origin).pathname
    if (APP_ASSET_PATTERN.test(pathname)) return pathname
  }
  return null
}

/**
 * Detecta um novo deploy mesmo quando a usuaria deixou a aba aberta.
 * Ao voltar para a aba, troca automaticamente o aplicativo antigo pelo atual.
 */
export function DeploymentRefresh() {
  useEffect(() => {
    const currentAsset = assetPathFromDocument(document)
    if (!currentAsset) return

    let checking = false
    let disposed = false

    async function checkForUpdate() {
      if (checking || disposed) return
      checking = true

      try {
        const response = await fetch(`/?__build_check=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!response.ok || disposed) return

        const html = await response.text()
        const latestDocument = new DOMParser().parseFromString(html, 'text/html')
        const latestAsset = assetPathFromDocument(latestDocument)

        if (latestAsset && latestAsset !== currentAsset) {
          window.location.reload()
        }
      } catch {
        // Sem internet: a proxima volta para a aba tenta novamente.
      } finally {
        checking = false
      }
    }

    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }

    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', checkWhenVisible)
    const intervalId = window.setInterval(checkWhenVisible, 5 * 60 * 1000)
    void checkForUpdate()

    return () => {
      disposed = true
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', checkWhenVisible)
      window.clearInterval(intervalId)
    }
  }, [])

  return null
}
