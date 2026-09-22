import { buildWhatsAppUrl, WHATSAPP_FICHA_MESSAGE } from '../../lib/whatsapp'

interface WhatsAppLinkProps {
  phone: string | null | undefined
  message?: string
  label?: string
  className?: string
  showLabel?: boolean
  onOpen?: () => void
}

/** Ícone oficial do WhatsApp — abre app/web com mensagem pronta. */
export function WhatsAppLink({
  phone,
  message = WHATSAPP_FICHA_MESSAGE,
  label = 'Abrir WhatsApp',
  className = '',
  showLabel = false,
  onOpen,
}: WhatsAppLinkProps) {
  const href = buildWhatsAppUrl(phone, message)
  const content = (
    <>
      <WhatsAppIcon size={20} />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </>
  )

  if (!href) {
    return (
      <span
        className={`whatsapp-link is-disabled ${className}`.trim()}
        title="Informe um telefone válido com DDD"
        aria-disabled="true"
      >
        {content}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`whatsapp-link ${className}`.trim()}
      title={label}
      aria-label={label}
      onClick={() => onOpen?.()}
    >
      {content}
    </a>
  )
}

/** Logo WhatsApp (círculo verde) — uso em cards, headers e botões. */
export function WhatsAppIcon({
  size = 20,
  className = '',
}: {
  size?: number
  className?: string
  /** Aceito para compatível com ícones Lucide nos cards do Painel */
  strokeWidth?: number
}) {
  return (
    <img
      src="/whatsapp-icon.png"
      alt=""
      width={size}
      height={size}
      className={`whatsapp-brand-icon ${className}`.trim()}
      draggable={false}
      aria-hidden
    />
  )
}
