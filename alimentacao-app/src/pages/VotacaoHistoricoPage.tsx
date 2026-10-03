import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ImageIcon, Pencil, Search, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { VotacaoBottomNav } from '../components/votacao/VotacaoBottomNav'
import { hasRole } from '../lib/roles'
import {
  fetchAuxiliarLiderNomes,
  fetchVotacaoHistorico,
  signVotoFoto,
  type VotacaoHit,
} from '../lib/votacao'
import { supabase } from '../lib/supabase'

function fmtWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    if (sameDay) return `Hoje, ${hh}:${mi}`
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}, ${hh}:${mi}`
  } catch {
    return iso
  }
}

function statusChip(votou: boolean | null | undefined) {
  if (votou === true) return { label: 'Votou', cls: 'is-yes' }
  if (votou === false) return { label: 'Não votou', cls: 'is-no' }
  return { label: 'Lançado', cls: 'is-pend' }
}

export function VotacaoHistoricoPage() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<VotacaoHit[]>([])
  const [coordNome, setCoordNome] = useState('')
  const [liderNomes, setLiderNomes] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoTitle, setFotoTitle] = useState('')
  const [scopeReady, setScopeReady] = useState(false)

  const isStaff = hasRole(profile, ['admin', 'diretoria'])
  const isCoordenador = hasRole(profile, 'coordenador')
  const isAuxiliar =
    hasRole(profile, 'auxiliar') && !hasRole(profile, ['admin', 'diretoria', 'coordenador'])

  useEffect(() => {
    let cancelled = false
    async function resolveScope() {
      try {
        if (isAuxiliar && profile?.id) {
          const nomes = await fetchAuxiliarLiderNomes(profile.id)
          if (cancelled) return
          setLiderNomes(nomes)
          if (!nomes.length) {
            setError('Nenhuma liderança atribuída. Peça ao coordenador em Equipe → Auxiliares.')
          }
        } else if (isCoordenador && profile?.id && !isStaff) {
          const { data: row } = await supabase
            .from('coordenadores')
            .select('nome')
            .or(`user_id.eq.${profile.id}${profile.coordenador_id ? `,id.eq.${profile.coordenador_id}` : ''}`)
            .limit(1)
            .maybeSingle()
          if (cancelled) return
          const nome = row?.nome ?? ''
          if (!nome) {
            setError('Coordenação não vinculada ao login.')
            setScopeReady(true)
            setLoading(false)
            return
          }
          setCoordNome(nome)
        }
        if (!cancelled) setScopeReady(true)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar escopo.')
          setScopeReady(true)
          setLoading(false)
        }
      }
    }
    void resolveScope()
    return () => { cancelled = true }
  }, [profile, isCoordenador, isStaff, isAuxiliar])

  useEffect(() => {
    if (!scopeReady) return
    if (isCoordenador && !isStaff && !coordNome) return
    if (isAuxiliar && !liderNomes.length) {
      setRows([])
      setLoading(false)
      return
    }
    const q = query.trim()
    if (q.length === 1) return

    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        setError(null)
        try {
          const list = await fetchVotacaoHistorico({
            coordenadorNome: isCoordenador && !isStaff ? coordNome : null,
            liderNomes: isAuxiliar ? liderNomes : undefined,
            query: q,
            limit: 80,
          })
          if (!cancelled) setRows(list)
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar histórico.')
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, q ? 280 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [scopeReady, query, coordNome, liderNomes, isCoordenador, isStaff, isAuxiliar])

  async function openFoto(hit: VotacaoHit) {
    if (!hit.voto_foto_path) return
    setError(null)
    try {
      const url = await signVotoFoto(hit.voto_foto_path)
      if (!url) throw new Error('Anexo indisponível.')
      setFotoUrl(url)
      setFotoTitle(hit.nome_completo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.')
    }
  }

  const subtitle = useMemo(() => {
    if (isAuxiliar) {
      if (!liderNomes.length) return 'Sem lideranças atribuídas'
      return `Suas lideranças: ${liderNomes.join(', ')}`
    }
    if (coordNome) return `Coordenação: ${coordNome}`
    return 'Registros recentes salvos no sistema'
  }, [coordNome, isAuxiliar, liderNomes])

  if (!scopeReady || (loading && !rows.length && !error)) {
    return (
      <div className="vot-page vot-historico vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div className="vot-page vot-historico vot-has-bottom">
      <header className="vot-head vot-head-center">
        <h1 className="vot-title">Histórico de lançamentos</h1>
        <p className="vot-sub">{subtitle}</p>
      </header>

      <div className="vot-search">
        <Search size={18} aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome, mãe, título, zona ou seção…"
          autoComplete="off"
        />
        {query ? (
          <button type="button" className="vot-clear" onClick={() => setQuery('')} aria-label="Limpar">
            <X size={16} />
          </button>
        ) : null}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && (
        <div className="vot-center vot-muted">
          <Spinner size={22} /> Atualizando…
        </div>
      )}

      {!loading && !rows.length ? (
        <EmptyState
          title="Nenhum lançamento"
          description={
            isAuxiliar
              ? 'Ainda não há votos lançados nas suas lideranças.'
              : 'Ainda não há votos registrados neste escopo.'
          }
        />
      ) : (
        <ul className="vot-hist-list">
          {rows.map((h) => {
            const chip = statusChip(h.votou)
            return (
              <li key={h.id} className="vot-hist-card">
                <div className="vot-hist-top">
                  <span className={`vot-pill ${chip.cls}`}>{chip.label}</span>
                  <time>{fmtWhen(h.voto_em)}</time>
                </div>
                <strong className="vot-hist-name">{h.nome_completo}</strong>

                <dl className="vot-hist-fields">
                  <div>
                    <dt>Título</dt>
                    <dd>{h.titulo || '—'}</dd>
                  </div>
                  <div>
                    <dt>Zona</dt>
                    <dd>{h.zona || '—'}</dd>
                  </div>
                  <div>
                    <dt>Seção</dt>
                    <dd>{h.secao || '—'}</dd>
                  </div>
                  <div className="vot-hist-fields-wide">
                    <dt>Nome da mãe</dt>
                    <dd>{h.nome_mae || '—'}</dd>
                  </div>
                  <div>
                    <dt>Liderança</dt>
                    <dd>{h.lider || '—'}</dd>
                  </div>
                  <div>
                    <dt>Coord.</dt>
                    <dd>{h.coordenador || '—'}</dd>
                  </div>
                </dl>

                <div className="vot-hist-actions">
                  <Link
                    to={`/votacao/lancar?edit=${encodeURIComponent(h.id)}`}
                    className="vot-btn ghost vot-btn-xs"
                  >
                    <Pencil size={14} /> Editar
                  </Link>
                  {h.voto_foto_path ? (
                    <button type="button" className="vot-btn ghost vot-btn-xs" onClick={() => void openFoto(h)}>
                      <Eye size={14} /> Ver anexo
                    </button>
                  ) : (
                    <span className="vot-muted vot-no-anexo">
                      <ImageIcon size={12} /> Sem anexo
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {fotoUrl && (
        <div className="vot-foto-modal" role="dialog" aria-modal aria-label="Anexo">
          <button type="button" className="vot-foto-modal-backdrop" onClick={() => setFotoUrl(null)} aria-label="Fechar" />
          <div className="vot-foto-modal-card">
            <div className="vot-foto-modal-head">
              <strong>{fotoTitle}</strong>
              <button type="button" className="vot-clear" onClick={() => setFotoUrl(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <img src={fotoUrl} alt={`Anexo de ${fotoTitle}`} />
            <a className="vot-btn" href={fotoUrl} target="_blank" rel="noopener noreferrer">
              Abrir em nova aba
            </a>
          </div>
        </div>
      )}

      <VotacaoBottomNav />
    </div>
  )
}
