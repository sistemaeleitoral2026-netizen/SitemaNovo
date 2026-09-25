import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, Eye, FileText, ListChecks, Pencil, Save } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCpf, formatDate } from '../lib/format'
import { digitsOnly } from '../lib/normalize'
import {
  fetchRelatorioTxtLinhas,
  parseRelatorioTxtLines,
  readUltimoGerado,
  RELATORIO_TXT_HEADER,
  rowKey,
  saveRelatorioTxtLinhas,
  writeUltimoGerado,
  type RelatorioTxtGerado,
  type RelatorioTxtLinha,
  type RelatorioTxtStatus,
} from '../lib/relatorioFichasTxt'

type Tab = 'gerar' | 'gerado' | 'testados' | 'erros'

type FichaRow = {
  id: string
  cpf: string | null
  titulo: string | null
  data_nascimento: string | null
  nome_mae: string | null
}

function formatLine(row: FichaRow): string {
  const cpf = digitsOnly(row.cpf ?? '')
  const titulo = String(row.titulo ?? '').trim()
  const nasc = row.data_nascimento ? formatDate(row.data_nascimento) : ''
  const mae = String(row.nome_mae ?? '').trim()
  return `${row.id};${cpf};${titulo};${nasc};${mae}`
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

function FichaLink({ id }: { id: string | null | undefined }) {
  if (!id) return <span>—</span>
  return (
    <Link to={`/cadastros/${id}/editar`} className="rel-txt-edit" title="Abrir ficha para corrigir">
      <span className="mono-cell">{id}</span>
      <Pencil size={13} />
    </Link>
  )
}

function ResultTable({
  rows,
}: {
  rows: Array<{
    id?: string | null
    cadastro_id?: string | null
    cpf?: string
    titulo: string
    data_nascimento: string
    nome_mae: string
  }>
}) {
  if (!rows.length) return null
  return (
    <div className="table-wrapper">
      <table className="data-table rel-txt-table">
        <thead>
          <tr>
            <th>#</th>
            <th>id</th>
            <th>CPF</th>
            <th>Título de eleitor</th>
            <th>Data de nascimento</th>
            <th>Nome completo da mãe</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const id = row.id ?? row.cadastro_id
            return (
              <tr key={id || `${row.titulo}-${i}`}>
                <td className="mono-cell">{i + 1}</td>
                <td><FichaLink id={id} /></td>
                <td className="mono-cell">{formatCpf(row.cpf) || row.cpf || '—'}</td>
                <td className="mono-cell">{row.titulo || '—'}</td>
                <td>{row.data_nascimento || '—'}</td>
                <td>{row.nome_mae || '—'}</td>
              </tr>
            )
          })}
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
  const [gerado, setGerado] = useState<RelatorioTxtGerado | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantidade, setQuantidade] = useState('100')
  const [okDraft, setOkDraft] = useState('')
  const [errDraft, setErrDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  async function reloadSaved() {
    setSaved(await fetchRelatorioTxtLinhas())
  }

  useEffect(() => {
    setGerado(readUltimoGerado())
  }, [])

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
            .select('id, cpf, titulo, data_nascimento, nome_mae')
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
  const blockedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const line of saved) {
      keys.add(line.titulo_key)
      if (line.cadastro_id) keys.add(rowKey(line.cadastro_id, line.titulo))
      const t = tituloDigits(line.titulo)
      if (t) keys.add(t)
    }
    return keys
  }, [saved])

  const elegiveis = useMemo(() => {
    const seen = new Set<string>()
    const list: FichaRow[] = []
    for (const row of rows) {
      const key = rowKey(row.id, row.titulo)
      const t = tituloDigits(row.titulo)
      if (!key) continue
      if (blockedKeys.has(key) || (t && blockedKeys.has(t)) || seen.has(key)) continue
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
      setError('Não há fichas novas (todas já estão em “Já testados” ou “Com erro”).')
      return
    }

    setGenerating(true)
    const picked = pickRandom(elegiveis, n)
    const bodyLines = picked.map(formatLine)
    const next: RelatorioTxtGerado = {
      at: new Date().toISOString(),
      lines: bodyLines,
      rows: picked.map((row) => ({
        id: row.id,
        cpf: digitsOnly(row.cpf ?? ''),
        titulo: String(row.titulo ?? '').trim(),
        data_nascimento: row.data_nascimento ? formatDate(row.data_nascimento) : '',
        nome_mae: String(row.nome_mae ?? '').trim(),
      })),
    }
    writeUltimoGerado(next)
    setGerado(next)
    downloadTxt(`${[RELATORIO_TXT_HEADER, ...bodyLines].join('\n')}\n`, `relatorio-fichas-${new Date().toISOString().slice(0, 10)}.txt`)
    const shortfall = n - picked.length
    setMessage(
      shortfall > 0
        ? `Arquivo com ${picked.length} linhas (pediu ${n}). Veja a aba “O que gerou” — o id aponta a ficha certa.`
        : `Arquivo com ${picked.length} linhas. Veja a aba “O que gerou” para conferir e corrigir pelo id.`,
    )
    setTab('gerado')
    setGenerating(false)
  }

  function handleBaixarGerado() {
    if (!gerado?.lines.length) return
    downloadTxt(
      `${[RELATORIO_TXT_HEADER, ...gerado.lines].join('\n')}\n`,
      `relatorio-fichas-${gerado.at.slice(0, 10)}.txt`,
    )
  }

  async function handleSalvar(status: RelatorioTxtStatus) {
    setMessage(null)
    setError(null)
    const draft = status === 'ok' ? okDraft : errDraft
    const parsed = parseRelatorioTxtLines(draft)
    if (!parsed.length) {
      setError('Cole pelo menos uma linha (id;CPF;título;nascimento;mãe) antes de salvar.')
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

  const geradoQuando = gerado?.at
    ? new Date(gerado.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="rel-txt-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatório fichas (TXT)</h1>
          <p className="page-subtitle">
            Gera linhas com o id da ficha. Abra “O que gerou” para conferir e corrigir a ficha certa.
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
          aria-selected={tab === 'gerado'}
          className={`rel-txt-tab${tab === 'gerado' ? ' is-active' : ''}`}
          onClick={() => setTab('gerado')}
        >
          <Eye size={15} /> O que gerou
          <em>{gerado?.rows.length ?? 0}</em>
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
          subtitle="Sorteia o que ainda não foi salvo. O TXT leva o id da ficha para você corrigir a certa."
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
            Formato: <code>{RELATORIO_TXT_HEADER}</code>
          </p>
        </Card>
      ) : null}

      {tab === 'gerado' ? (
        <Card
          title={gerado ? `Último gerado (${gerado.rows.length})` : 'Último gerado'}
          subtitle={
            gerado
              ? `Gerado em ${geradoQuando}. Clique no id para abrir a ficha e corrigir.`
              : 'Ainda não gerou nesta sessão. Use Gerar arquivo.'
          }
          action={
            gerado?.lines.length ? (
              <Button size="sm" type="button" onClick={handleBaixarGerado}>
                <Download size={14} /> Baixar de novo
              </Button>
            ) : undefined
          }
        >
          {!gerado?.rows.length ? (
            <p className="rel-txt-empty">Nada gerado ainda. Vá em Gerar arquivo.</p>
          ) : (
            <ResultTable rows={gerado.rows} />
          )}
        </Card>
      ) : null}

      {tab === 'testados' ? (
        <>
          <Card
            title="Colar e salvar (ok)"
            subtitle="Cole o que testou e passou. O id da linha aponta a ficha certa."
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
                placeholder={`${RELATORIO_TXT_HEADER}\n00000000-0000-0000-0000-000000000000;00000000000;123456789012;01/01/1990;NOME DA MAE\n...`}
                spellCheck={false}
              />
            </label>
          </Card>
          <Card title={`Já gravados (${okLines.length})`}>
            {!okLines.length ? (
              <p className="rel-txt-empty">Nada salvo ainda. Cole acima e clique em Salvar.</p>
            ) : (
              <ResultTable rows={okLines} />
            )}
          </Card>
        </>
      ) : null}

      {tab === 'erros' ? (
        <>
          <Card
            title="Colar e salvar (erro)"
            subtitle="Cole o que testou e deu erro. Depois abra a ficha pelo id para corrigir."
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
                placeholder={`${RELATORIO_TXT_HEADER}\n00000000-0000-0000-0000-000000000000;00000000000;123456789012;01/01/1990;NOME DA MAE\n...`}
                spellCheck={false}
              />
            </label>
          </Card>
          <Card title={`Já gravados (${errLines.length})`}>
            {!errLines.length ? (
              <p className="rel-txt-empty">Nada salvo ainda. Cole acima e clique em Salvar.</p>
            ) : (
              <ResultTable rows={errLines} />
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}

function tituloDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}
