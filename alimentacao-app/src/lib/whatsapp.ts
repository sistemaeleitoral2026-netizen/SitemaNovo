import { digitsOnly } from './normalize'

/** Mensagem padrão ao abrir o WhatsApp a partir da ficha. */
export const WHATSAPP_FICHA_MESSAGE = 'Oi tudo bem, aqui é Matheus do Beiju'

/**
 * Monta link wa.me com DDI Brasil (55).
 * Aceita 10/11 dígitos (DDD+número) ou já com 55.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string = WHATSAPP_FICHA_MESSAGE,
): string | null {
  let digits = digitsOnly(phone ?? '')
  if (!digits) return null

  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(0, 13)
  } else if (digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`
  } else {
    return null
  }

  const text = encodeURIComponent(message)
  return `https://wa.me/${digits}?text=${text}`
}
