import { useEffect, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../lib/format'
import { fetchCorrecaoBackups, reverterCorrecaoBackup, type CorrecaoBackup } from '../lib/relatorioFichasTxt'

export function RelatorioBackupPage() {
  const { profile } = useAuth()
  const [nome, setNome] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [rows, setRows] = useState<CorrecaoBackup[]>([])
  const [loading, setLoading] = useState(false)
  const [reverting, setReverting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [buscou, setBuscou] = useState(false)

  async function buscar(filtros?: { nome?: string; data?: string; hora?: string }) {
    const q = filtros ?? { nome, data, hora }
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      setRows(await fetchCorrecaoBackups(q))
      setBuscou(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível buscar o backup.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void buscar({ nome: '', data: '', hora: '' })
    // Abre já com as últimas correções.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reverter(id: string) {
    setReverting(id)
    setError(null)
    setMessage(null)
    try {
      await reverterCorrecaoBackup(id, profile?.id ?? null)
      setRows((atual) => atual.map((row) => (row.id === id ? { ...row, revertido: true } : row)))
      setMessage('Alteração revertida. A ficha voltou ao que era antes.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível reverter.')
    } finally {
      setReverting(null)
    }
  }

  return (
    <div className="rel-txt-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup</h1>
          <p className="page-subtitle">
            Toda correção que mudou a ficha fica aqui. A lista já abre com as últimas; use a busca para filtrar e desfazer.
          </p>
        </div>
      </div>

      <Card title="Pesquisar alteração">
        <div className="rel-txt-form">
          <label className="rel-txt-field" style={{ minWidth: 220 }}>
            <span>Nome da pessoa</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Clairton Sidney" />
          </label>
          <label className="rel-txt-field">
            <span>Dia</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="rel-txt-field">
            <span>Hora</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
          <Button type="button" onClick={() => void buscar()} loading={loading}>
            <Search size={16} /> Buscar
          </Button>
        </div>
      </Card>

      {error ? <p className="rel-txt-error">{error}</p> : null}
      {message ? <p className="rel-txt-ok">{message}</p> : null}

      <Card title={rows.length ? `Alterações (${rows.length})` : 'Alterações'}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Spinner />
          </div>
        ) : !rows.length ? (
          <p className="rel-txt-empty">
            {buscou
              ? 'Nada nesta busca. Limpe o nome e a data e clique em Buscar de novo.'
              : 'Carregando as últimas correções…'}
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table rel-txt-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Pessoa</th>
                  <th>Quem alterou</th>
                  <th>O que mudou</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const antes = row.antes ?? {}
                  const depois = row.depois ?? {}
                  const diffs = Object.keys(depois).filter((key) => (antes[key] ?? '') !== (depois[key] ?? ''))
                  return (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.alterado_em)}</td>
                      <td><strong>{row.nome_completo}</strong></td>
                      <td>{row.alterado_por_nome || '—'}</td>
                      <td>
                        {diffs.length
                          ? diffs.map((key) => `${key}: ${antes[key] || '—'} → ${depois[key] || '—'}`).join(' · ')
                          : '—'}
                      </td>
                      <td>
                        {row.revertido ? (
                          <span className="rel-txt-empty">Revertido</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            loading={reverting === row.id}
                            disabled={Boolean(reverting)}
                            onClick={() => void reverter(row.id)}
                          >
                            <RotateCcw size={14} /> Reverter
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
