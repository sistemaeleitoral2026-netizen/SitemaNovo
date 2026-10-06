import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, Search, X } from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/Pagination'
import { logAudit } from '../lib/audit'
import {
  buKey,
  corrigirZonaSecao,
  fetchFichasQueVotaram,
  loadBu,
  type AuditoriaFicha,
  type BuData,
} from '../lib/auditoriaBu'
import { loadLocaisVotacaoMa, lookupLocalVotacao, type LocalVotacaoRef } from '../lib/locaisVotacao'
import { normalizeSecao, normalizeZona } from '../lib/normalize'
import { signVotoFoto } from '../lib/votacao'

type Tab = 'conferencia' | 'corrigir'
type StatusFiltro = 'todos' | 'ok' | 'atencao' | 'erro'

const LS_KEY = 'auditoria-candidato'

function lsGet(): { cargo: number; cand: number } {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
    if (v && typeof v.cargo === 'number' && typeof v.cand === 'number') return v
  } catch {
    /* sem storage */
  }
  return { cargo: 0, cand: -1 }
}

function lsSet(v: { cargo: number; cand: number }) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(v))
  } catch {
    /* sem storage */
  }
}

type LinhaSecao = {
  key: string
  zona: string
  secao: string
  local: string
  fichas: AuditoriaFicha[]
  comparecimento: number
  candVotos: number | null
  status: 'ok' | 'atencao' | 'erro'
}

export function AuditoriaPage() {
  const [tab, setTab] = useState<Tab>('conferencia')
  const [bu, setBu] = useState<BuData | null>(null)
  const [fichas, setFichas] = useState<AuditoriaFicha[]>([])
  const [locais, setLocais] = useState<Map<string, LocalVotacaoRef>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const [cargo, setCargo] = useState(() => lsGet().cargo)
  const [cand, setCand] = useState(() => lsGet().cand)
  const [zonaSel, setZonaSel] = useState('')
  const [status, setStatus] = useState<StatusFiltro>('todos')
  const [query, setQuery] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoTitle, setFotoTitle] = useState('')
  const [edits, setEdits] = useState<Record<string, { zona: string; secao: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, f, l] = await Promise.all([
        loadBu(),
        fetchFichasQueVotaram(),
        loadLocaisVotacaoMa().catch(() => new Map<string, LocalVotacaoRef>()),
      ])
      setBu(b)
      setFichas(f)
      setLocais(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a auditoria.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => setPage(0), [cargo, cand, zonaSel, status, query, tab])

  const candidatos = bu?.candidatos[cargo] ?? []

  function escolherCargo(v: number) {
    setCargo(v)
    setCand(-1)
    lsSet({ cargo: v, cand: -1 })
  }
  function escolherCand(v: number) {
    setCand(v)
    lsSet({ cargo, cand: v })
  }

  /** Fichas cuja zona/seção existe no BU × as que não existem (aba Corrigir). */
  const { validas, invalidas } = useMemo(() => {
    const v: AuditoriaFicha[] = []
    const inv: AuditoriaFicha[] = []
    if (!bu) return { validas: v, invalidas: inv }
    for (const f of fichas) {
      if (f.zona && f.secao && bu.secoes.has(buKey(f.zona, f.secao))) v.push(f)
      else inv.push(f)
    }
    return { validas: v, invalidas: inv }
  }, [bu, fichas])

  const linhas = useMemo<LinhaSecao[]>(() => {
    if (!bu) return []
    const grupos = new Map<string, AuditoriaFicha[]>()
    for (const f of validas) {
      const k = buKey(f.zona, f.secao)
      const arr = grupos.get(k)
      if (arr) arr.push(f)
      else grupos.set(k, [f])
    }
    const out: LinhaSecao[] = []
    for (const [key, list] of grupos) {
      const porCargo = bu.secoes.get(key)?.get(cargo)
      const comparecimento = porCargo?.total ?? 0
      const candVotos = cand >= 0 ? (porCargo?.votos.find((x) => x.cand === cand)?.votos ?? 0) : null
      let st: LinhaSecao['status'] = 'ok'
      if (list.length > comparecimento) st = 'erro'
      else if (candVotos !== null && candVotos < list.length) st = 'atencao'
      const [zona, secao] = key.split('|')
      out.push({
        key,
        zona,
        secao,
        local: lookupLocalVotacao(locais, zona, secao)?.local?.trim() || '—',
        fichas: list,
        comparecimento,
        candVotos,
        status: st,
      })
    }
    return out.sort((a, b) => a.zona.localeCompare(b.zona) || a.secao.localeCompare(b.secao))
  }, [bu, validas, cargo, cand, locais])

  const zonas = useMemo(() => [...new Set(linhas.map((l) => l.zona))].sort(), [linhas])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    return linhas.filter((l) => {
      if (zonaSel && l.zona !== zonaSel) return false
      if (status !== 'todos' && l.status !== status) return false
      if (!q) return true
      return (
        l.secao.includes(q)
        || l.local.toLowerCase().includes(q)
        || l.fichas.some((f) => f.nome_completo.toLowerCase().includes(q) || f.titulo.includes(q))
      )
    })
  }, [linhas, zonaSel, status, query])

  const resumo = useMemo(() => {
    const r = { secoes: linhas.length, votaram: validas.length, ok: 0, atencao: 0, erro: 0 }
    for (const l of linhas) r[l.status] += 1
    return r
  }, [linhas, validas])

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize))
  const pageSafe = Math.min(page, totalPages - 1)
  const visiveis = filtradas.slice(pageSafe * pageSize, (pageSafe + 1) * pageSize)

  const invalidasFiltradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return invalidas
    return invalidas.filter(
      (f) => f.nome_completo.toLowerCase().includes(q) || f.titulo.includes(q) || f.lider.toLowerCase().includes(q),
    )
  }, [invalidas, query])
  const invPages = Math.max(1, Math.ceil(invalidasFiltradas.length / pageSize))
  const invPageSafe = Math.min(page, invPages - 1)
  const invVisiveis = invalidasFiltradas.slice(invPageSafe * pageSize, (invPageSafe + 1) * pageSize)

  async function abrirFoto(f: AuditoriaFicha) {
    if (!f.voto_foto_path) return
    setError(null)
    try {
      const url = await signVotoFoto(f.voto_foto_path)
      if (!url) throw new Error('Anexo indisponível.')
      setFotoUrl(url)
      setFotoTitle(f.nome_completo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.')
    }
  }

  async function salvarCorrecao(f: AuditoriaFicha) {
    const e = edits[f.id] ?? { zona: f.zonaRaw, secao: f.secaoRaw }
    const z = normalizeZona(e.zona)
    const s = normalizeSecao(e.secao)
    setError(null)
    setOkMsg(null)
    if (!z || !s) {
      setError('Informe zona e seção.')
      return
    }
    if (!bu?.secoes.has(buKey(z, s))) {
      setError(`Zona ${z} / seção ${s} não existe na planilha do BU de São Luís.`)
      return
    }
    setSavingId(f.id)
    try {
      await corrigirZonaSecao(f.id, z, s)
      logAudit('corrigir_zona_secao_auditoria', 'cadastros', f.id, {
        nome: f.nome_completo,
        de: { zona: f.zonaRaw, secao: f.secaoRaw },
        para: { zona: z, secao: s },
      })
      setFichas((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, zona: z, secao: s, zonaRaw: z, secaoRaw: s } : x)),
      )
      setOkMsg(`Ficha de ${f.nome_completo} corrigida para zona ${z} / seção ${s}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="vot-page vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  const nomeCand = cand >= 0 && candidatos[cand] ? candidatos[cand] : null

  return (
    <div className="vot-page vot-historico vot-historico-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Auditoria</h1>
          <p className="page-subtitle">
            Confere quem votou (sistema) com os votos do BU por zona e seção — só fichas marcadas como “Votou”.
          </p>
        </div>
        <div className="page-header-actions">
          <Button variant="secondary" onClick={() => void carregar()}>Recarregar</Button>
        </div>
      </div>

      <div className="filter-panel vot-hist-filter">
        <Button variant={tab === 'conferencia' ? 'primary' : 'secondary'} onClick={() => setTab('conferencia')}>
          Conferência ({validas.length})
        </Button>
        <Button variant={tab === 'corrigir' ? 'primary' : 'secondary'} onClick={() => setTab('corrigir')}>
          Corrigir zona/seção ({invalidas.length})
        </Button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-success">{okMsg}</div>}

      {tab === 'conferencia' ? (
        <>
          <div className="filter-panel vot-hist-filter" style={{ flexWrap: 'wrap', gap: '.6rem' }}>
            <select value={cargo} onChange={(e) => escolherCargo(Number(e.target.value))} aria-label="Cargo">
              {(bu?.cargos ?? []).map((c, i) => (
                <option key={c} value={i}>{c}</option>
              ))}
            </select>
            <select value={cand} onChange={(e) => escolherCand(Number(e.target.value))} aria-label="Candidato">
              <option value={-1}>Candidato: nenhum (só comparecimento)</option>
              {candidatos.map((c, i) => (
                <option key={`${c.numero}-${i}`} value={i}>{c.numero} · {c.nome} ({c.partido})</option>
              ))}
            </select>
            <select value={zonaSel} onChange={(e) => setZonaSel(e.target.value)} aria-label="Zona">
              <option value="">Todas as zonas</option>
              {zonas.map((z) => <option key={z} value={z}>Zona {z}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)} aria-label="Status">
              <option value="todos">Todos os status</option>
              <option value="ok">OK</option>
              <option value="atencao">Atenção</option>
              <option value="erro">Erro</option>
            </select>
            <div className="search-field">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Seção, local, nome ou título…" />
              {query ? (
                <button type="button" className="vot-clear" onClick={() => setQuery('')} aria-label="Limpar"><X size={16} /></button>
              ) : null}
            </div>
          </div>

          <div className="vot-hist-count" style={{ margin: '.4rem 0 .8rem' }}>
            <strong>{resumo.votaram}</strong> votaram em <strong>{resumo.secoes}</strong> seções ·{' '}
            <span className="vot-pill is-yes">{resumo.ok} OK</span>{' '}
            {nomeCand ? <span className="vot-pill is-pend">{resumo.atencao} atenção</span> : null}{' '}
            <span className="vot-pill is-no">{resumo.erro} erro</span>
          </div>
          <p className="page-subtitle" style={{ marginBottom: '.8rem' }}>
            <b>Erro</b>: mais fichas “votou” do que eleitores que compareceram na seção (BU).{' '}
            <b>Atenção</b>:{' '}
            {nomeCand
              ? 'o candidato selecionado teve menos votos na seção do que fichas “votou”.'
              : 'selecione um candidato para comparar.'}
          </p>

          <div className="cadastros-table-card vot-hist-table-card">
            {!visiveis.length ? (
              <EmptyState title="Nenhuma seção" description="Nada encontrado com os filtros atuais." />
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Zona</th>
                      <th>Seção</th>
                      <th>Local</th>
                      <th>Votaram (sistema)</th>
                      <th>Comparecimento (BU)</th>
                      <th>{nomeCand ? `Votos ${nomeCand.nome}` : 'Candidato'}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => {
                      const open = aberta === l.key
                      const porCargo = bu?.secoes.get(l.key)?.get(cargo)
                      return (
                        <Fragment key={l.key}>
                          <tr style={{ cursor: 'pointer' }} onClick={() => setAberta(open ? null : l.key)}>
                            <td>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                            <td>{l.zona}</td>
                            <td>{l.secao}</td>
                            <td>{l.local}</td>
                            <td><strong>{l.fichas.length}</strong></td>
                            <td>{l.comparecimento}</td>
                            <td>{l.candVotos ?? '—'}</td>
                            <td>
                              {l.status === 'ok' && <span className="vot-pill is-yes"><CheckCircle2 size={12} /> OK</span>}
                              {l.status === 'atencao' && <span className="vot-pill is-pend"><AlertTriangle size={12} /> Atenção</span>}
                              {l.status === 'erro' && <span className="vot-pill is-no"><AlertTriangle size={12} /> Erro</span>}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td />
                              <td colSpan={7}>
                                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', padding: '.4rem 0' }}>
                                  <div>
                                    <strong>Quem votou nesta seção ({l.fichas.length})</strong>
                                    <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
                                      {l.fichas.map((f) => (
                                        <li key={f.id}>
                                          {f.nome_completo}
                                          {f.lider ? <span className="vot-hist-muted"> — {f.lider}</span> : null}
                                          {f.voto_foto_path ? (
                                            <Button variant="ghost" size="sm" aria-label="Ver anexo" onClick={() => void abrirFoto(f)}>
                                              <Eye size={14} />
                                            </Button>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <strong>Mais votados no BU ({bu?.cargos[cargo]})</strong>
                                    <ol style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
                                      {(porCargo?.votos ?? []).slice(0, 8).map((v) => {
                                        const c = candidatos[v.cand]
                                        const marcado = v.cand === cand
                                        return (
                                          <li key={v.cand} style={marcado ? { fontWeight: 700 } : undefined}>
                                            {c?.nome} <span className="vot-hist-muted">({c?.partido})</span> — {v.votos}
                                          </li>
                                        )
                                      })}
                                    </ol>
                                    <div className="vot-hist-muted" style={{ marginTop: '.4rem' }}>
                                      Branco {porCargo?.branco ?? 0} · Nulo {porCargo?.nulo ?? 0} · Legenda {porCargo?.legenda ?? 0}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filtradas.length > pageSize && (
              <Pagination
                page={pageSafe}
                totalPages={totalPages}
                totalItems={filtradas.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(0) }}
                pageSizeOptions={[15, 25, 50, 100]}
                label={`${pageSafe * pageSize + 1}–${Math.min(filtradas.length, (pageSafe + 1) * pageSize)} de ${filtradas.length}`}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <p className="page-subtitle" style={{ marginBottom: '.8rem' }}>
            Fichas que votaram mas cuja zona/seção está vazia ou não existe no BU de São Luís. Confira o anexo e corrija.
          </p>
          <div className="filter-panel vot-hist-filter">
            <div className="search-field">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, título ou liderança…" />
              {query ? (
                <button type="button" className="vot-clear" onClick={() => setQuery('')} aria-label="Limpar"><X size={16} /></button>
              ) : null}
            </div>
            <div className="vot-hist-count"><strong>{invalidasFiltradas.length}</strong> ficha(s)</div>
          </div>
          <div className="cadastros-table-card vot-hist-table-card">
            {!invVisiveis.length ? (
              <EmptyState title="Tudo certo" description="Nenhuma ficha com zona/seção inválida." />
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Título</th>
                      <th>Líder</th>
                      <th>Atual</th>
                      <th>Zona</th>
                      <th>Seção</th>
                      <th>Anexo</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invVisiveis.map((f) => {
                      const e = edits[f.id] ?? { zona: f.zonaRaw, secao: f.secaoRaw }
                      const set = (patch: Partial<{ zona: string; secao: string }>) =>
                        setEdits((p) => ({ ...p, [f.id]: { ...e, ...patch } }))
                      return (
                        <tr key={f.id}>
                          <td><strong>{f.nome_completo}</strong></td>
                          <td className="mono-cell">{f.titulo || '—'}</td>
                          <td><span className="vot-hist-muted">{f.lider || '—'}</span></td>
                          <td>{f.zonaRaw || '—'} / {f.secaoRaw || '—'}</td>
                          <td>
                            <input value={e.zona} onChange={(ev) => set({ zona: ev.target.value })} inputMode="numeric" style={{ width: 70 }} aria-label="Zona" />
                          </td>
                          <td>
                            <input value={e.secao} onChange={(ev) => set({ secao: ev.target.value })} inputMode="numeric" style={{ width: 80 }} aria-label="Seção" />
                          </td>
                          <td>
                            {f.voto_foto_path ? (
                              <Button variant="ghost" size="sm" aria-label="Ver anexo" onClick={() => void abrirFoto(f)}>
                                <Eye size={16} />
                              </Button>
                            ) : '—'}
                          </td>
                          <td>
                            <Button size="sm" loading={savingId === f.id} onClick={() => void salvarCorrecao(f)}>
                              Salvar
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {invalidasFiltradas.length > pageSize && (
              <Pagination
                page={invPageSafe}
                totalPages={invPages}
                totalItems={invalidasFiltradas.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(0) }}
                pageSizeOptions={[15, 25, 50, 100]}
                label={`${invPageSafe * pageSize + 1}–${Math.min(invalidasFiltradas.length, (invPageSafe + 1) * pageSize)} de ${invalidasFiltradas.length}`}
              />
            )}
          </div>
        </>
      )}

      {fotoUrl && (
        <div className="vot-foto-modal" role="dialog" aria-modal aria-label="Anexo">
          <button type="button" className="vot-foto-modal-backdrop" onClick={() => setFotoUrl(null)} aria-label="Fechar" />
          <div className="vot-foto-modal-card">
            <div className="vot-foto-modal-head">
              <strong>{fotoTitle}</strong>
              <button type="button" className="vot-clear" onClick={() => setFotoUrl(null)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <img src={fotoUrl} alt={`Anexo de ${fotoTitle}`} />
            <a className="vot-btn" href={fotoUrl} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
          </div>
        </div>
      )}
    </div>
  )
}
