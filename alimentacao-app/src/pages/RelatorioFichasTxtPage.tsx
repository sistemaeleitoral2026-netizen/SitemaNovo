import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileText, ListChecks, Save } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import {
  fetchRelatorioTxtLinhas,
  parseRelatorioTxtLines,
  saveRelatorioTxtLinhas,
  tituloKey,
  type RelatorioTxtLinha,
  type RelatorioTxtStatus,
} from '../lib/relatorioFichasTxt'

const HEADER = 'Titulo de eleitor;Data de nascimento;Nome completo da mãe'

type Tab = 'gerar' | 'testados' | 'erros'

type FichaRow = {
  id: string
  titulo: string | null
  data_nascimento: string | null
  nome_mae: string | null
}

function formatLine(row: FichaRow): string {
  const titulo = String(row.titulo ?? '').trim()
  const nasc = row.data_nascimento ? formatDate(row.data_nascimento) : ''
  const mae = String(row.nome_mae ?? '').trim()
  return `${titulo};${nasc};${mae}`
}

function pickRandom<T>(list: T[], n: number): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy.slice(0, n)
}

function downloadTxt(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function UsedTable({ lines }: { lines: RelatorioTxtLinha[] }) {
  if (!lines.length) return null
  return (
    <div className="table-wrapper">
      <table className="data-table rel-txt-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Título de eleitor</th>
            <th>Data de nascimento</th>
            <th>Nome da mãe</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={line.titulo_key}>
              <td className="mono-cell">{i + 1}</td>
              <td className="mono-cell">{line.titulo}</td>
              <td>{line.data_nascimento || '—'}</td>
              <td>{line.nome_mae || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RelatorioFichasTxtPage() {
  const { profile } = useAuth()

  const [tab, setTab] = useState<Tab>('gerar')
  const [rows, setRows] = useState<FichaRow[]>([])
  const [saved, setSaved] = useState<RelatorioTxtLinha[]>([])
  const [loading, setLoading] = useState(true)
  const [quantidade, setQuantidade] = useState('100')
  const [okDraft, setOkDraft] = useState('')
  const [errDraft, setErrDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  async function reloadSaved() {
    const lines = await fetchRelatorioTxtLinhas()
    setSaved(lines)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const pageSize = 1000
        const all: FichaRow[] = []
        let from = 0
        for (;;) {
          const { data, error: err } = await supabase
            .from('cadastros')
            .select('id, titulo, data_nascimento, nome_mae')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + pageSize - 1)
          if (err) throw new Error(err.message)
          const chunk = (data ?? []) as FichaRow[]
          all.push(...chunk)
          if (chunk.length < pageSize) break
          from += pageSize
        }
        const lines = await fetchRelatorioTxtLinhas()
        if (!cancelled) {
          setRows(all)
          setSaved(lines)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar o relatório.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const okLines = useMemo(() => saved.filter((l) => l.status === 'ok'), [saved])
  const errLines = useMemo(() => saved.filter((l) => l.status === 'erro'), [saved])
  const blockedKeys = useMemo(() => new Set(saved.map((l) => l.titulo_key)), [saved])

  const elegiveis = useMemo(() => {
    const seen = new Set<string>()
    const list: FichaRow[] = []
    for (const row of rows) {
      const key = tituloKey(row.titulo)
      if (!key) continue
      if (blockedKeys.has(key) || seen.has(key)) continue
      seen.add(key)
      list.push(row)
    }
    return list
  }, [rows, blockedKeys])

  function handleGerar() {
    setMessage(null)
    setError(null)
    const n = Math.floor(Number(quantidade))
    if (!Number.isFinite(n) || n < 1) {
      setError('Informe a quantidade de linhas (número maior que zero).')
      return
    }
    if (!elegiveis.length) {
      setError('Não há fichas novas com título (todas já estão em “Já testados” ou “Com erro”).')
      return
    }

    setGenerating(true)
    const picked = pickRandom(elegiveis, n)
    const bodyLines = picked.map(formatLine)
    downloadTxt(`${[HEADER, ...bodyLines].join('\n')}\n`, `relatorio-fichas-${new Date().toISOString().slice(0, 10)}.txt`)
    const shortfall = n - picked.length
    setMessage(
      shortfall > 0
        ? `Arquivo aleatório com ${picked.length} linhas (pediu ${n}). Depois cole o resultado e clique em Salvar.`
        : `Arquivo aleatório com ${picked.length} linhas. Depois cole o resultado e clique em Salvar.`,
    )
    setGenerating(false)
  }

  async function handleSalvar(status: RelatorioTxtStatus) {
    setMessage(null)
    setError(null)
    const draft = status === 'ok' ? okDraft : errDraft
    const parsed = parseRelatorioTxtLines(draft)
    if (!parsed.length) {
      setError('Cole pelo menos uma linha (título;nascimento;mãe) antes de salvar.')
      return
    }
    setSaving(true)
    try {
      const n = await saveRelatorioTxtLinhas(draft, status, profile?.id ?? null)
      await reloadSaved()
      if (status === 'ok') setOkDraft('')
      else setErrDraft('')
      setMessage(
        status === 'ok'
          ? `Salvas ${n} linha(s) em Já testados. Elas não entram mais no gerar.`
          : `Salvas ${n} linha(s) em Com erro. Elas não entram mais no gerar.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar no banco.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Spinner size={40} />
      </div>
    )
  }

  return (
    <div className="rel-txt-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatório fichas (TXT)</h1>
          <p className="page-subtitle">
            Gera linhas aleatórias do que ainda sobrou. Salvar grava no banco e alimenta as listas.
          </p>
        </div>
      </div>

      <div className="rel-txt-tabs" role="tablist" aria-label="Seções do relatório">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gerar'}
          className={`rel-txt-tab${tab === 'gerar' ? ' is-active' : ''}`}
          onClick={() => setTab('gerar')}
        >
          <Download size={15} /> Gerar arquivo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'testados'}
          className={`rel-txt-tab${tab === 'testados' ? ' is-active' : ''}`}
          onClick={() => setTab('testados')}
        >
          <ListChecks size={15} /> Já testados
          <em>{okLines.length}</em>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'erros'}
          className={`rel-txt-tab${tab === 'erros' ? ' is-active' : ''}`}
          onClick={() => setTab('erros')}
        >
          <AlertTriangle size={15} /> Com erro
          <em>{errLines.length}</em>
        </button>
      </div>

      <div className="rel-txt-stats">
        <div className="rel-txt-stat">
          <span>Fichas no sistema</span>
          <strong>{rows.length.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Disponíveis p/ gerar</span>
          <strong>{elegiveis.length.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Já testados (ok)</span>
          <strong>{okLines.length.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Com erro</span>
          <strong>{errLines.length.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      {error ? <p className="rel-txt-error">{error}</p> : null}
      {message ? <p className="rel-txt-ok">{message}</p> : null}

      {tab === 'gerar' ? (
        <Card
          title="Gerar arquivo (aleatório)"
          subtitle="Sorteia o que ainda não foi salvo. Se já gerou e não está em Já testados nem Com erro, pode sair de novo."
        >
          <div className="rel-txt-form">
            <label className="rel-txt-field">
              <span>Quantidade de linhas</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </label>
            <Button onClick={handleGerar} loading={generating} disabled={generating}>
              <Download size={16} /> Gerar TXT
            </Button>
          </div>
          <p className="rel-txt-hint">
            Formato: <code>{HEADER}</code>
          </p>
        </Card>
      ) : null}

      {tab === 'testados' ? (
        <>
          <Card
            title="Colar e salvar (ok)"
            subtitle="Cole o que testou e passou. Salvar alimenta a lista no banco — não some ao sair da página."
            action={(
              <Button
                size="sm"
                type="button"
                loading={saving}
                disabled={saving}
                onClick={() => void handleSalvar('ok')}
              >
                <Save size={14} /> Salvar
              </Button>
            )}
          >
            <label className="rel-txt-paste">
              <span className="rel-txt-paste-label">
                <FileText size={14} /> Colar aqui
              </span>
              <textarea
                value={okDraft}
                onChange={(e) => setOkDraft(e.target.value)}
                rows={10}
                placeholder={`${HEADER}\n123456789012;01/01/1990;NOME DA MAE\n...`}
                spellCheck={false}
              />
            </label>
          </Card>
          <Card title={`Já gravados (${okLines.length})`}>
            {!okLines.length ? (
              <p className="rel-txt-empty">Nada salvo ainda. Cole acima e clique em Salvar.</p>
            ) : (
              <UsedTable lines={okLines} />
            )}
          </Card>
        </>
      ) : null}

      {tab === 'erros' ? (
        <>
          <Card
            title="Colar e salvar (erro)"
            subtitle="Cole o que testou e deu erro. Salvar alimenta a lista no banco e tira do sorteio."
            action={(
              <Button
                size="sm"
                type="button"
                loading={saving}
                disabled={saving}
                onClick={() => void handleSalvar('erro')}
              >
                <Save size={14} /> Salvar
              </Button>
            )}
          >
            <label className="rel-txt-paste">
              <span className="rel-txt-paste-label">
                <FileText size={14} /> Colar aqui
              </span>
              <textarea
                value={errDraft}
                onChange={(e) => setErrDraft(e.target.value)}
                rows={10}
                placeholder={`${HEADER}\n123456789012;01/01/1990;NOME DA MAE\n...`}
                spellCheck={false}
              />
            </label>
          </Card>
          <Card title={`Já gravados (${errLines.length})`}>
            {!errLines.length ? (
              <p className="rel-txt-empty">Nada salvo ainda. Cole acima e clique em Salvar.</p>
            ) : (
              <UsedTable lines={errLines} />
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
