/** Cache de signed URLs na sessão do browser (TTL abaixo da validade de 1h do Storage). */

const DEFAULT_TTL_MS = 50 * 60 * 1000

type Entry = { url: string; expiresAt: number }

const cache = new Map<string, Entry>()

function key(bucket: string, path: string) {
  return `${bucket}:${path}`
}

export function getCachedSignedUrl(bucket: string, path: string): string | null {
  const hit = cache.get(key(bucket, path))
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    cache.delete(key(bucket, path))
    return null
  }
  return hit.url
}

export function setCachedSignedUrl(
  bucket: string,
  path: string,
  url: string,
  ttlMs = DEFAULT_TTL_MS,
): void {
  cache.set(key(bucket, path), { url, expiresAt: Date.now() + ttlMs })
}

export function takeCachedSignedUrls(
  bucket: string,
  paths: string[],
): { hits: Map<string, string>; missing: string[] } {
  const hits = new Map<string, string>()
  const missing: string[] = []
  for (const path of paths) {
    const url = getCachedSignedUrl(bucket, path)
    if (url) hits.set(path, url)
    else missing.push(path)
  }
  return { hits, missing }
}
