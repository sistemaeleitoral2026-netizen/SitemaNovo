export const BUILD_VERSION = __BUILD_VERSION__

export function systemUrl(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ v: BUILD_VERSION, ...params })
  return `${path}?${query.toString()}`
}
