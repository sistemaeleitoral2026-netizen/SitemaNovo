import { useMemo } from 'react'
import {
  addMonths, currentMonth, formatAdminValue, monthLabel, tabelaParaCsv, variacao,
  type AdminFinanceMetric, type AdminFinSistema, type AdminFinTable, type AdminValueKind,
} from '../../lib/adminFinanceiro'
import { ADMIN_SYSTEMS } from '../../lib/adminEventos'
import { ArrowUpRight, Download, Eye, EyeOff, RefreshCw, TrendDown, TrendUp } from './adminIcons'
import { useAdmin } from './adminContext'

export function systemColor(id: string) {
  return ADMIN_SYSTEMS.find((s) => s.id === id)?.cor || '#1d5bd6'
}

/** Valor formatado; vira "•••••" com "Ocultar valores" ligado. */
export function Valor({ value, kind = 'money', className }: { value: string | number; kind?: AdminValueKind; className?: string }) {
  const { hidden } = useAdmin()
  const masked = hidden && kind === 'money' && typeof value === 'number'
  return <span className={`admin-valor${masked ? ' is-hidden' : ''}${className ? ` ${className}` : ''}`}>{masked ? 'R$ •••••' : formatAdminValue(value, kind)}</span>
}

export function Delta({ value, prev, invert = false }: { value: number; prev?: number | null; invert?: boolean }) {
  const v = variacao(value, prev)
  if (v == null) return <span className="admin-delta is-flat">sem comparação</span>
  const up = v >= 0
  const good = invert ? !up : up
  return (
    <span className={`admin-delta ${Math.abs(v) < 0.005 ? 'is-flat' : good ? 'is-good' : 'is-bad'}`} title="Em relação ao mês anterior">
      {up ? <TrendUp size={13} /> : <TrendDown size={13} />}{`${up ? '+' : ''}${Math.round(v * 100)}%`}
    </span>
  )
}

export function MetricTile({ metric }: { metric: AdminFinanceMetric }) {
  const invert = /sa[ií]da|despesa|gast/i.test(metric.label)
  return (
    <div className={`admin-metric tone-${metric.tone || 'neutral'}`}>
      <small>{metric.label}</small>
      <strong><Valor value={metric.value} kind={metric.kind || 'money'} /></strong>
      <span className="admin-metric-foot">
        {metric.prev !== undefined && <Delta value={metric.value} prev={metric.prev} invert={invert} />}
        {metric.hint && <em>{metric.hint}</em>}
      </span>
    </div>
  )
}

/** Mini barras de 6 meses (a = cor do sistema, b = cinza). */
export function MiniSerie({ sistema }: { sistema: AdminFinSistema }) {
  const max = useMemo(() => Math.max(1, ...sistema.serie.flatMap((p) => [p.a, p.b])), [sistema.serie])
  if (!sistema.serie.length) return null
  return (
    <div className="admin-miniserie" aria-label={`${sistema.serieLabels.filter(Boolean).join(' e ')} nos últimos 6 meses`}>
      {sistema.serie.map((p) => (
        <div key={p.mes} className="admin-miniserie-col" title={`${p.rotulo}: ${sistema.serieLabels[0]} ${formatAdminValue(p.a, 'money')}${sistema.serieLabels[1] ? ` · ${sistema.serieLabels[1]} ${formatAdminValue(p.b, 'money')}` : ''}`}>
          <div className="admin-miniserie-bars">
            <i style={{ height: `${(p.a / max) * 100}%` }} />
            {sistema.serieLabels[1] && <i className="b" style={{ height: `${(p.b / max) * 100}%` }} />}
          </div>
          <span>{p.rotulo.split('/')[0]}</span>
        </div>
      ))}
    </div>
  )
}

export function SystemFinCard({ sistema, onDetails }: { sistema: AdminFinSistema; onDetails?: () => void }) {
  return (
    <article className="admin-fin-card" style={{ '--system-color': systemColor(sistema.sistema) } as React.CSSProperties}>
      <header>
        <div><h3>{sistema.nome}</h3><small>{sistema.periodo}</small></div>
        <a href={sistema.home} title={`Abrir ${sistema.nome}`}>Abrir <ArrowUpRight size={13} /></a>
      </header>
      {!sistema.available ? <p className="admin-fin-off">{sistema.message}</p> : <>
        <div className="admin-fin-metrics">{sistema.metrics.map((m) => <MetricTile key={m.label} metric={m} />)}</div>
        {sistema.message && <p className="admin-fin-note">{sistema.message}</p>}
        <footer>
          <MiniSerie sistema={sistema} />
          {onDetails && <button type="button" onClick={onDetails}>Ver detalhes</button>}
        </footer>
      </>}
    </article>
  )
}

function baixarCsv(table: AdminFinTable, prefixo: string) {
  const blob = new Blob([tabelaParaCsv(table)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${prefixo}-${table.id}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function FinTable({ table, prefixo }: { table: AdminFinTable; prefixo: string }) {
  const totals = table.columns.map((c, i) => (c.kind === 'money' ? table.rows.reduce((t, r) => t + (typeof r.cells[i] === 'number' ? Number(r.cells[i]) : 0), 0) : null))
  const showTotal = table.rows.length > 1 && totals.some((t) => t != null) && !/item/i.test(table.columns[0]?.label || '')
  return (
    <section className="admin-panel admin-fin-table">
      <header>
        <div><h2>{table.title}</h2>{table.note && <p>{table.note}</p>}</div>
        {table.rows.length > 0 && <button type="button" className="admin-ghost-btn" onClick={() => baixarCsv(table, prefixo)}><Download size={14} /> CSV</button>}
      </header>
      {table.rows.length ? (
        <div className="admin-sheet-wrap">
          <table className="admin-sheet-table admin-sheet-compact">
            <thead><tr>{table.columns.map((c) => <th key={c.label} className={c.kind !== 'text' ? 'money' : undefined}>{c.label}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className={r.tone ? `tone-${r.tone}` : undefined}>
                  {r.cells.map((cell, ci) => {
                    const kind = table.columns[ci]?.kind || 'text'
                    return <td key={ci} className={kind !== 'text' ? 'money' : undefined}>
                      {kind === 'pct' && typeof cell === 'number'
                        ? <span className="admin-pct"><span className="admin-pct-track"><i style={{ width: `${Math.min(100, cell * 100)}%` }} /></span><b>{formatAdminValue(cell, 'pct')}</b></span>
                        : <Valor value={cell} kind={kind} />}
                    </td>
                  })}
                </tr>
              ))}
            </tbody>
            {showTotal && (
              <tfoot><tr>{totals.map((t, i) => <td key={i} className={t != null ? 'money' : undefined}>{i === 0 ? 'Total' : t != null ? <Valor value={Math.round(t * 100) / 100} /> : ''}</td>)}</tr></tfoot>
            )}
          </table>
        </div>
      ) : <p className="admin-panel-empty">{table.empty}</p>}
    </section>
  )
}

/** Mês + ocultar valores + atualizar — fica no topo das telas com valores. */
export function PeriodBar() {
  const { month, setMonth, hidden, setHidden, finLoading, carregadoEm, reloadFin } = useAdmin()
  const now = currentMonth()
  const options = useMemo(() => Array.from({ length: 24 }, (_, i) => addMonths(now, -i)), [now])
  return (
    <div className="admin-period-bar">
      <label className="admin-period-select">
        <span>Período</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {options.map((m) => <option key={m} value={m}>{monthLabel(m)}{m === now ? ' (atual)' : ''}</option>)}
        </select>
      </label>
      {month !== now && <button type="button" className="admin-ghost-btn" onClick={() => setMonth(now)}>Voltar ao mês atual</button>}
      <span className="admin-period-spacer" />
      {carregadoEm && <small className="admin-period-stamp">Atualizado às {new Date(carregadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>}
      <button type="button" className="admin-ghost-btn" onClick={reloadFin} disabled={finLoading}><RefreshCw size={14} /> {finLoading ? 'Atualizando…' : 'Atualizar'}</button>
      <button type="button" className={`admin-ghost-btn${hidden ? ' is-on' : ''}`} onClick={() => setHidden(!hidden)} aria-pressed={hidden}>
        {hidden ? <Eye size={14} /> : <EyeOff size={14} />} {hidden ? 'Mostrar valores' : 'Ocultar valores'}
      </button>
    </div>
  )
}

export function FinSkeleton({ count = 3 }: { count?: number }) {
  return <div className="admin-fin-grid">{Array.from({ length: count }, (_, i) => <div key={i} className="admin-fin-card is-skeleton"><span /><span /><span /></div>)}</div>
}
