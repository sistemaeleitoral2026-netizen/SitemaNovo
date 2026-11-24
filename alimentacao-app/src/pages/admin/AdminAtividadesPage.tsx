import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Filter, Search, X } from './adminIcons'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import {
  ADMIN_SYSTEMS, adminCategoriaLabel, adminMetadataEntries, adminSystem,
  fetchAdminEventos, formatAdminDate, subscribeAdminEventos,
} from '../../lib/adminEventos'
import type { AdminEvento, AdminEventoCategoria, AdminSystemId } from '../../lib/adminTypes'
import { AdminActivityTable } from './AdminActivityTable'

const PAGE_SIZE = 30
const CATEGORIES: AdminEventoCategoria[] = ['criacao', 'edicao', 'conclusao', 'exclusao', 'acesso', 'atividade']

export function AdminAtividadesPage() {
  const [params, setParams] = useSearchParams()
  const [eventos, setEventos] = useState<AdminEvento[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminEvento | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const page = Math.max(0, Number(params.get('page') || 1) - 1)
  const busca = params.get('q') || ''
  const sistema = (params.get('sistema') || '') as AdminSystemId | ''
  const categoria = (params.get('categoria') || '') as AdminEventoCategoria | ''
  const inicio = params.get('inicio') || ''
  const fim = params.get('fim') || ''

  const setParam = useCallback((key: string, value: string) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value); else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    }, { replace: true })
  }, [setParams])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const result = await fetchAdminEventos({ busca, sistema, categoria, inicio, fim, page, pageSize: PAGE_SIZE })
      setEventos(result.eventos); setTotal(result.total)
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar atividades.') }
    finally { setLoading(false) }
  }, [busca, sistema, categoria, inicio, fim, page])

  useEffect(() => { void load(); return subscribeAdminEventos(() => void load()) }, [load])
  useEffect(() => {
    const refresh = () => void load(); window.addEventListener('admin:refresh', refresh)
    return () => window.removeEventListener('admin:refresh', refresh)
  }, [load])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(busca || sistema || categoria || inicio || fim)
  const metadata = useMemo(() => selected ? adminMetadataEntries(selected.metadata) : [], [selected])

  function clearFilters() { setParams({}, { replace: true }) }

  return (
    <>
      <section className="admin-activity-toolbar">
        <div className="admin-activity-search"><Search size={18} /><input value={busca} onChange={(e) => setParam('q', e.target.value)} placeholder="Buscar por usuário, ação ou registro" /></div>
        <button className={`admin-filter-toggle${hasFilters ? ' is-active' : ''}`} type="button" onClick={() => setFiltersOpen((v) => !v)}><Filter size={18} /> Filtros{hasFilters ? ' ativos' : ''}</button>
      </section>

      <section className={`admin-filters${filtersOpen ? ' is-open' : ''}`}>
        <label><span>Sistema</span><select value={sistema} onChange={(e) => setParam('sistema', e.target.value)}><option value="">Todos os sistemas</option>{ADMIN_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
        <label><span>Tipo de ação</span><select value={categoria} onChange={(e) => setParam('categoria', e.target.value)}><option value="">Todas as ações</option>{CATEGORIES.map((c) => <option key={c} value={c}>{adminCategoriaLabel(c)}</option>)}</select></label>
        <label><span>De</span><input type="date" value={inicio} onChange={(e) => setParam('inicio', e.target.value)} /></label>
        <label><span>Até</span><input type="date" value={fim} onChange={(e) => setParam('fim', e.target.value)} /></label>
        {hasFilters && <button type="button" onClick={clearFilters}><X size={16} /> Limpar</button>}
      </section>

      <div className="admin-results-row"><span><strong>{total.toLocaleString('pt-BR')}</strong> {total === 1 ? 'atividade encontrada' : 'atividades encontradas'}</span>{hasFilters && <button type="button" onClick={clearFilters}>Limpar filtros</button>}</div>

      <section className="admin-panel admin-activity-list">
        {loading ? <div className="admin-loading compact"><Spinner size={30} /><span>Carregando atividades…</span></div>
          : error ? <div className="admin-alert error">{error}<button type="button" onClick={() => void load()}>Tentar novamente</button></div>
          : eventos.length ? <AdminActivityTable eventos={eventos} onDetails={setSelected} />
          : <EmptyState title="Nenhuma atividade encontrada" description={hasFilters ? 'Tente alterar ou remover os filtros.' : 'Os eventos dos sistemas aparecerão aqui.'} />}
      </section>

      {pages > 1 && <nav className="admin-pagination" aria-label="Paginação"><button type="button" disabled={page === 0} onClick={() => setParam('page', String(page))}>Anterior</button><span>Página <strong>{page + 1}</strong> de {pages}</span><button type="button" disabled={page + 1 >= pages} onClick={() => setParam('page', String(page + 2))}>Próxima</button></nav>}

      {selected && <div className="admin-detail-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
        <aside className="admin-detail-panel" role="dialog" aria-modal="true" aria-label="Detalhes da atividade" onMouseDown={(e) => e.stopPropagation()}>
          <header><div><span className="admin-system-pill" style={{ '--system-color': adminSystem(selected.sistema).cor } as React.CSSProperties}>{adminSystem(selected.sistema).nome}</span><h2>{selected.titulo}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Fechar"><X size={20} /></button></header>
          <dl>
            <div><dt>Responsável</dt><dd>{selected.actorNome}</dd></div>
            <div><dt>Data e hora</dt><dd>{formatAdminDate(selected.ocorridoEm)}</dd></div>
            <div><dt>Categoria</dt><dd>{adminCategoriaLabel(selected.categoria)}</dd></div>
            <div><dt>Ação registrada</dt><dd>{selected.acao}</dd></div>
            {selected.entidade && <div><dt>Entidade</dt><dd>{selected.entidade}</dd></div>}
            {selected.resumo && <div className="wide"><dt>Resumo</dt><dd>{selected.resumo}</dd></div>}
          </dl>
          {metadata.length > 0 && <section><h3>Informações do registro</h3><dl>{metadata.map(([key, value]) => <div key={key}><dt>{key.replace(/[._-]+/g, ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></section>}
          {selected.origemUrl && <a className="admin-detail-link" href={selected.origemUrl}>Abrir no sistema de origem <ExternalLink size={17} /></a>}
        </aside>
      </div>}
    </>
  )
}
