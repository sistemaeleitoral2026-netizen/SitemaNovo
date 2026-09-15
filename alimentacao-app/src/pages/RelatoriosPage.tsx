import { useEffect, useMemo, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Spinner } from '../components/ui/Spinner'
import { PeriodFilterSelect } from '../components/ui/PeriodFilter'
import { EmptyState } from '../components/ui/EmptyState'
import { getPeriodFromPreset, type PeriodPreset } from '../lib/period'
import { fetchCadastros } from '../lib/cadastros'
import { supabase } from '../lib/supabase'
import type { Cadastro, Profile } from '../types'

export function RelatoriosPage() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([])
  const [operadores, setOperadores] = useState<Profile[]>([])
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d')
  const [loading, setLoading] = useState(true)

  const period = useMemo(() => getPeriodFromPreset(periodPreset), [periodPreset])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [cads, ops] = await Promise.all([
        fetchCadastros({ period }),
        supabase.from('profiles').select('*').eq('role', 'operador'),
      ])
      setCadastros(cads)
      setOperadores((ops.data ?? []) as Profile[])
      setLoading(false)
    }
    load()
  }, [period])

  const porZona = useMemo(() => {
    const map = new Map<string, number>()
    cadastros.forEach((c) => map.set(c.zona, (map.get(c.zona) ?? 0) + 1))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [cadastros])

  const porSecao = useMemo(() => {
    const map = new Map<string, number>()
    cadastros.forEach((c) => map.set(c.secao, (map.get(c.secao) ?? 0) + 1))
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [cadastros])

  const porOperador = useMemo(() => {
    const map = new Map<string, number>()
    cadastros.forEach((c) => map.set(c.operator_id, (map.get(c.operator_id) ?? 0) + 1))
    return operadores
      .map((op) => ({ nome: op.nome, total: map.get(op.id) ?? 0 }))
      .filter((o) => o.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [cadastros, operadores])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Resumo consolidado dos cadastros</p>
        </div>
        <PeriodFilterSelect value={periodPreset} onChange={setPeriodPreset} />
      </div>

      {!cadastros.length ? (
        <Card>
          <EmptyState title="Sem dados no período" description="Não há cadastros para gerar relatórios." />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <Card title={`Por zona eleitoral (${cadastros.length} total)`}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Zona eleitoral</th><th>Quantidade</th></tr></thead>
                <tbody>
                  {porZona.map(([zona, qtd]) => (
                    <tr key={zona}><td>{zona}</td><td>{qtd}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Por seção eleitoral">
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Seção eleitoral</th><th>Quantidade</th></tr></thead>
                <tbody>
                  {porSecao.map(([secao, qtd]) => (
                    <tr key={secao}><td>{secao}</td><td>{qtd}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Por nerite">
            {!porOperador.length ? (
              <EmptyState title="Sem dados por nerite" />
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Nerite</th><th>Quantidade</th></tr></thead>
                  <tbody>
                    {porOperador.map((o) => (
                      <tr key={o.nome}><td>{o.nome}</td><td>{o.total}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
