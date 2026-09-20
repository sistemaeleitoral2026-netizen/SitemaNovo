import { useEffect, useMemo, useState } from 'react'
import { History, MessageCircle, Car, Home, Link2, StickyNote, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { hasRole } from '../lib/roles'
import { Spinner } from '../components/ui/Spinner'
import { Pagination } from '../components/ui/Pagination'
import {
  fetchFormigasHistorico,
  fetchFormigasHistoricoActors,
  type FormigasHistoricoItem,
} from '../lib/ativacao'

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
  if (secao === 'carros') return 'Carros'
  if (secao === 'casa') return 'Casa'
  if (secao === 'links') return 'Redes'
  return 'Observações'
}

export function AtivacaoHistoricoPage() {
  const { profile } = useAuth()
  const canSeeAll = hasRole(profile, ['admin', 'diretoria'])
  const [items, setItems] = useState<FormigasHistoricoItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [actorFilter, setActorFilter] = useState('')
  const [actors, setActors] = useState<{ id: string; nome: string; email: string }[]>([])

  const title = canSeeAll ? 'Histórico — Formigas' : 'Meu histórico'
  const subtitle = canSeeAll
    ? 'Log de tudo que as formigas registraram no Lançar.'
    : 'Tudo o que você registrou no Lançar Formigas.'

  async function load() {
    setLoading(true)
    setError(null)
    const { items: rows, total: count, error: err } = await fetchFormigasHistorico({
      onlyMine: !canSeeAll,
      actorId: canSeeAll && actorFilter ? actorFilter : null,
      limit: pageSize,
      offset: page * pageSize,
    })
    setLoading(false)
    if (err) {
      setError(err)
      setItems([])
      setTotal(0)
      return
    }
    setItems(rows)
    setTotal(count)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, actorFilter, canSeeAll])

  useEffect(() => {
    if (!canSeeAll) return
    void fetchFormigasHistoricoActors().then(setActors)
  }, [canSeeAll])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const emptyHint = useMemo(() => {
    if (canSeeAll && actorFilter) return 'Nenhuma ação desta formiga ainda.'
    if (canSeeAll) return 'Ainda não há lançamentos registrados no histórico.'
    return 'Você ainda não registrou nenhuma ação. Use o Lançar para começar.'
  }, [canSeeAll, actorFilter])

  return (
    <div className="fh-page">
      <div className="fh-head">
        <div>
          <h1 className="fh-title">
            <History size={22} strokeWidth={2.25} />
            {title}
          </h1>
          <p className="fh-sub">{subtitle}</p>
        </div>
        <button type="button" className="fh-refresh" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {canSeeAll && (
        <div className="fh-filters">
          <label htmlFor="fh-actor">Formiga</label>
          <select
            id="fh-actor"
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="">Todas</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}{a.email ? ` · ${a.email}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="fh-loading"><Spinner /></div>
      ) : items.length === 0 ? (
        <div className="fh-empty">{emptyHint}</div>
      ) : (
        <ul className="fh-list">
          {items.map((item) => {
            const Icon = secaoIcon(item.secao)
            const tone = secaoTone(item.secao)
            return (
              <li key={item.id} className="fh-item">
                <div className={`fh-icon tone-${tone}`}>
                  <Icon size={18} />
                </div>
                <div className="fh-body">
                  <p className="fh-resumo">{item.resumo}</p>
                  <div className="fh-meta">
                    <span className="fh-chip">{secaoLabel(item.secao)}</span>
                    {item.valor_antes != null && item.valor_depois != null && (
                      <span className="fh-change">
                        {item.valor_antes} → {item.valor_depois}
                      </span>
                    )}
                    <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(0)
          }}
          pageSizeOptions={[15, 25, 50]}
        />
      )}
    </div>
  )
}
