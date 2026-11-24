import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Building2, Clock3, Radio, ShieldCheck } from './adminIcons'
import { Spinner } from '../../components/ui/Spinner'
import { ADMIN_SYSTEMS, fetchAdminEventos, formatAdminDate, subscribeAdminEventos } from '../../lib/adminEventos'
import type { AdminEvento } from '../../lib/adminTypes'
import { useAdmin } from './adminContext'
import { PeriodBar, Valor } from './AdminFinWidgets'

export function AdminSistemasPage() {
  const [eventos, setEventos] = useState<AdminEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { fin } = useAdmin()
  const load = useCallback(async () => {
    setError(null)
    try { setEventos((await fetchAdminEventos({ pageSize: 500 })).eventos) }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar os sistemas.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(); return subscribeAdminEventos(() => void load()) }, [load])
  useEffect(() => { const r = () => void load(); window.addEventListener('admin:refresh', r); return () => window.removeEventListener('admin:refresh', r) }, [load])

  const cards = useMemo(() => {
    const now = Date.now()
    return ADMIN_SYSTEMS.map((system) => {
      const rows = eventos.filter((e) => e.sistema === system.id)
      return {
        ...system,
        total24h: rows.filter((e) => new Date(e.ocorridoEm).getTime() >= now - 86400000).length,
        total7d: rows.filter((e) => new Date(e.ocorridoEm).getTime() >= now - 7 * 86400000).length,
        last: rows[0] || null,
      }
    })
  }, [eventos])

  if (loading) return <div className="admin-loading"><Spinner size={36} /><span>Carregando sistemas…</span></div>

  return <>
    <PeriodBar />
    {error && <div className="admin-alert error">{error}<button type="button" onClick={() => void load()}>Tentar novamente</button></div>}
    <section className="admin-system-overview"><div><ShieldCheck size={22} /><span><strong>Contagem baseada no histórico de auditoria</strong><small>Só entra o que os sistemas registraram.</small></span></div><p><Radio size={16} /> Atualiza sozinho</p></section>
    <section className="admin-system-grid">
      {cards.map((system) => <article key={system.id} className="admin-system-card large" style={{ '--system-color': system.cor } as React.CSSProperties}>
        <div className="admin-system-card-top"><span><Building2 size={22} /></span><b>{system.total24h > 0 ? 'Ativo nas últimas 24h' : 'Sem atividade em 24h'}</b></div>
        <h2>{system.nome}</h2>
        <p>{system.last ? system.last.titulo : 'Nenhuma atividade registrada para este sistema.'}</p>
        {(() => { const f = fin?.sistemas.find((x) => x.sistema === system.id); return f?.available ? <dl className="admin-system-values">{f.metrics.slice(0, 4).map((m) => <div key={m.label}><dt>{m.label}</dt><dd className={m.tone ? 'tone-' + m.tone : undefined}><Valor value={m.value} kind={m.kind || 'money'} /></dd></div>)}</dl> : null })()}
        <div className="admin-system-stats"><div><strong>{system.total24h}</strong><small>atividades em 24h</small></div><div><strong>{system.total7d}</strong><small>atividades em 7 dias</small></div></div>
        <div className="admin-system-last"><Clock3 size={16} /><span>{system.last ? <>Última atividade em <strong>{formatAdminDate(system.last.ocorridoEm)}</strong> por {system.last.actorNome}</> : 'Ainda sem histórico disponível'}</span></div>
        <a href={system.home}>Abrir {system.nome} <ArrowUpRight size={17} /></a>
      </article>)}
    </section>
  </>
}
