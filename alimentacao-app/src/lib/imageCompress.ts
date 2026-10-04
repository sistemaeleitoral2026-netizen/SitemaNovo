export type ImageCompressOptions = {
  /** Só reprocessa se o arquivo for maior que isto (bytes). */
  minBytes?: number
  /** Lado máximo em pixels. */
  maxSide?: number
  /** Qualidade JPEG 0–1. */
  quality?: number
}

function isHeicLike(file: File) {
  const t = (file.type || '').toLowerCase()
  const n = file.name.toLowerCase()
  return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif')
}

/** Decodifica já aplicando a orientação EXIF (fotos de celular vêm giradas). */
async function decodeBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Navegador antigo sem a opção: decodifica sem girar (melhor que falhar).
    return createImageBitmap(file)
  }
}

async function canvasToJpeg(file: File, maxSide: number, quality: number): Promise<File | null> {
  try {
    const bitmap = await decodeBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    })
    if (!blob) return null
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return null
  }
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
  if (file.size <= minBytes && !isHeicLike(file)) return file

  const converted = await canvasToJpeg(file, maxSide, quality)
  if (!converted) return file
  if (!isHeicLike(file) && converted.size >= file.size) return file
  return converted
}

/**
 * Garante JPEG/PNG/WebP aceito pelo bucket (converte HEIC e tipos vazios da câmera).
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  if (allowed.has(file.type) && !isHeicLike(file)) {
    return compressImageForUpload(file)
  }

  const converted = await canvasToJpeg(file, 2400, 0.88)
  if (converted) return converted

  if (isHeicLike(file)) {
    throw new Error(
      'Este celular enviou HEIC. Tire a foto de novo ou escolha “Mais compatível” / JPEG na câmera.',
    )
  }
  throw new Error('Formato de imagem não suportado. Use JPEG, PNG ou WebP.')
}
