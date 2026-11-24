import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatAdminMoney, type AdminSeriePonto } from '../../lib/adminFinanceiro'
import { useAdmin } from './adminContext'
import { FinSkeleton, FinTable, MetricTile, PeriodBar, systemColor } from './AdminFinWidgets'
import { ArrowUpRight } from './adminIcons'

function SerieChart({ serie, labels, color, hidden }: { serie: AdminSeriePonto[]; labels: [string, string]; color: string; hidden: boolean }) {
  return (
    <div className="admin-chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={serie} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e9f2" />
          <XAxis dataKey="rotulo" tick={{ fill: '#5d6876', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#5d6876', fontSize: 11 }} axisLine={false} tickLine={false} width={hidden ? 10 : 72}
            tickFormatter={(v: number) => (hidden ? '' : new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(v))} />
          <Tooltip cursor={{ fill: '#eef3fb' }} formatter={(v) => (hidden ? 'R$ •••••' : formatAdminMoney(Number(v) || 0))}
            contentStyle={{ border: '1px solid #d5dde8', borderRadius: 6, boxShadow: 'none', fontSize: 13 }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="a" name={labels[0]} fill={color} radius={[2, 2, 0, 0]} maxBarSize={34} />
          {labels[1] && <Bar dataKey="b" name={labels[1]} fill="#9aa8bb" radius={[2, 2, 0, 0]} maxBarSize={34} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AdminFinanceiroPage() {
  const { fin, finLoading, finError, hidden, month } = useAdmin()
  const [params, setParams] = useSearchParams()
  const sistemas = fin?.sistemas || []
  const ativo = params.get('sistema') || sistemas[0]?.sistema || 'mr-terceiriza'
  const atual = useMemo(() => sistemas.find((s) => s.sistema === ativo) || sistemas[0], [sistemas, ativo])

  useEffect(() => { window.scrollTo?.({ top: 0 }) }, [ativo])

  return (
    <>
      <PeriodBar />
      {finError && <div className="admin-alert error">{finError}</div>}
      <nav className="admin-tabs" aria-label="Sistemas">
        {(sistemas.length ? sistemas : []).map((s) => (
          <button key={s.sistema} type="button" className={s.sistema === atual?.sistema ? 'is-active' : ''}
            style={{ '--system-color': systemColor(s.sistema) } as React.CSSProperties}
            onClick={() => setParams({ sistema: s.sistema }, { replace: true })}>
            <i />{s.nome}{!s.available && <small> · indisponível</small>}
          </button>
        ))}
      </nav>

      {!fin && finLoading ? <FinSkeleton count={2} /> : atual && (
        <div className="admin-fin-detail" style={{ '--system-color': systemColor(atual.sistema) } as React.CSSProperties}>
          <section className="admin-panel admin-fin-head">
            <header>
              <div><h2>{atual.nome}</h2><p>{atual.periodo}</p></div>
              <a className="admin-ghost-btn" href={atual.home}>Abrir sistema <ArrowUpRight size={13} /></a>
            </header>
            {atual.available ? (
              <>
                <div className="admin-fin-metrics wide">{atual.metrics.map((m) => <MetricTile key={m.label} metric={m} />)}</div>
                {atual.message && <p className="admin-fin-note">{atual.message}</p>}
              </>
            ) : <p className="admin-fin-off">{atual.message}</p>}
          </section>

          {atual.available && (
            <>
              <section className="admin-panel">
                <header><div><h2>Últimos 6 meses</h2><p>{atual.serieLabels.filter(Boolean).join(' × ')}</p></div></header>
                <SerieChart serie={atual.serie} labels={atual.serieLabels} color={systemColor(atual.sistema)} hidden={hidden} />
              </section>
              <div className="admin-fin-tables">
                {atual.tables.map((t) => <FinTable key={t.id} table={t} prefixo={`${atual.sistema}-${month}`} />)}
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
