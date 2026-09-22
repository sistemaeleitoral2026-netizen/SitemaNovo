export type ImageCompressOptions = {
  /** Só reprocessa se o arquivo for maior que isto (bytes). */
  minBytes?: number
  /** Lado máximo em pixels. */
  maxSide?: number
  /** Qualidade JPEG 0–1. */
  quality?: number
}

/**
 * Compressão leve para uploads grandes — preserva qualidade visual na galeria.
 * Padrão: só acima de ~2 MB, max ~2400px, JPEG ~0.88.
 */
export async function compressImageForUpload(
  file: File,
  opts: ImageCompressOptions = {},
): Promise<File> {
  const minBytes = opts.minBytes ?? 2_000_000
  const maxSide = opts.maxSide ?? 2400
  const quality = opts.quality ?? 0.88

  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  if (file.size <= minBytes) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    })
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}
