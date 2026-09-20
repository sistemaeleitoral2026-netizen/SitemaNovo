import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Car, History, Home, Link2, MessageCircle, StickyNote, X } from 'lucide-react'
import {
  fetchFormigasHistoricoPorPessoa,
  historicoDescricao,
  type AtivacaoTipo,
  type FormigasHistoricoItem,
} from '../lib/ativacao'
import { Spinner } from './ui/Spinner'

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function secaoIcon(secao: FormigasHistoricoItem['secao']) {
  if (secao === 'whatsapp') return MessageCircle
  if (secao === 'carros') return Car
  if (secao === 'casa') return Home
  if (secao === 'links') return Link2
  return StickyNote
}

function secaoTone(secao: FormigasHistoricoItem['secao']) {
  if (secao === 'whatsapp') return 'wa'
  if (secao === 'carros') return 'blue'
  if (secao === 'casa') return 'teal'
  if (secao === 'links') return 'violet'
  return 'amber'
}

function secaoLabel(secao: FormigasHistoricoItem['secao']) {
  if (secao === 'whatsapp') return 'WhatsApp'
  if (secao === 'carros') return 'Veículos'
  if (secao === 'casa') return 'Casa'
  if (secao === 'links') return 'Redes'
  return 'Observações'
}

function tipoPessoaLabel(tipo: FormigasHistoricoItem['tipo']) {
  if (tipo === 'eleitor') return 'Eleitor'
  if (tipo === 'lideranca') return 'Liderança'
  return 'Coordenador'
}

export function FormigasFichaHistoricoDrawer({
  open,
  onClose,
  tipo,
  pessoaId,
  pessoaNome,
}: {
  open: boolean
  onClose: () => void
  tipo: AtivacaoTipo
  pessoaId: string
  pessoaNome: string
}) {
  const [items, setItems] = useState<FormigasHistoricoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchFormigasHistoricoPorPessoa(tipo, pessoaId).then(({ items: rows, error: err }) => {
      if (cancelled) return
      setLoading(false)
      if (err) {
        setError(err)
        setItems([])
        return
      }
      setItems(rows)
    })
    return () => {
      cancelled = true
    }
  }, [open, tipo, pessoaId])

  if (!open) return null

  return createPortal(
    <div className="ffh-overlay" role="presentation" onClick={onClose}>
      <aside
        className="ffh-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ffh-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ffh-head">
          <div>
            <h2 id="ffh-title">
              <History size={18} strokeWidth={2.25} />
              Histórico desta ficha
            </h2>
            <p className="ffh-sub">{pessoaNome}</p>
          </div>
          <button type="button" className="ffh-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="ffh-body">
          {loading ? (
            <div className="ffh-loading"><Spinner /></div>
          ) : error ? (
            <div className="alert alert-error">{error}</div>
          ) : items.length === 0 ? (
            <p className="ffh-empty">
              Sem histórico recuperável — lançamentos anteriores à auditoria não têm autor registrado.
            </p>
          ) : (
            <>
              <div className="fh-list-head" aria-hidden>
                <span>Formiga</span>
                <span>Pessoa</span>
                <span>Descrição</span>
              </div>
              <ul className="ffh-list">
                {items.map((item) => {
                  const Icon = secaoIcon(item.secao)
                  const tone = secaoTone(item.secao)
                  return (
                    <li key={item.id} className="ffh-item fh-item-card">
                      <div className={`fh-icon tone-${tone}`}>
                        <Icon size={16} />
                      </div>
                      <div className="ffh-item-body">
                        <div className="fh-item-grid">
                          <div>
                            <span className="fh-k">Formiga</span>
                            <strong>{item.actor_nome || 'Formiga'}</strong>
                          </div>
                          <div>
                            <span className="fh-k">{tipoPessoaLabel(item.tipo)}</span>
                            <strong>{item.pessoa_nome}</strong>
                          </div>
                          <div className="fh-desc">
                            <span className="fh-k">Descrição</span>
                            <p>{historicoDescricao(item)}</p>
                          </div>
                        </div>
                        <div className="ffh-meta">
                          <span className="fh-chip">{secaoLabel(item.secao)}</span>
                          <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

export function ownerCaption(
  ownerId: string | null | undefined,
  ownerNome: string | null | undefined,
  hasValue: boolean,
): string | null {
  if (ownerId) return `Registrado por ${ownerNome?.trim() || 'Formiga'}`
  if (hasValue) return 'Sem registro de autor'
  return null
}
