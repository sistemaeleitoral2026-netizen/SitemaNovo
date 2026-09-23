import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileText, ListChecks } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { hasRole } from '../lib/roles'

const HEADER = 'Titulo de eleitor;Data de nascimento;Nome completo da mãe'
const OK_STORAGE_KEY = 'relatorio-fichas-txt-usados'
const ERR_STORAGE_KEY = 'relatorio-fichas-txt-erros'

type Tab = 'gerar' | 'testados' | 'erros'

type FichaRow = {
  id: string
  titulo: string | null
  data_nascimento: string | null
  nome_mae: string | null
  diretoria_id: string | null
}

type UsedLine = {
  titulo: string
  nascimento: string
  mae: string
  raw: string
}

function tituloKey(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

function parseUsedLines(text: string): UsedLine[] {
  const out: UsedLine[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.toLowerCase().startsWith('titulo de eleitor')) continue
    const parts = line.split(';')
    const titulo = (parts[0] ?? '').trim()
    const key = tituloKey(titulo)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      titulo,
      nascimento: (parts[1] ?? '').trim(),
      mae: (parts[2] ?? '').trim(),
      raw: line,
    })
  }
  return out
}

function parseUsedTitulos(text: string): Set<string> {
  const out = new Set<string>()
  for (const line of parseUsedLines(text)) {
    const key = tituloKey(line.titulo)
    if (key) out.add(key)
  }
  return out
}

function formatLine(row: FichaRow): string {
  const titulo = String(row.titulo ?? '').trim()
  const nasc = row.data_nascimento ? formatDate(row.data_nascimento) : ''
  const mae = String(row.nome_mae ?? '').trim()
  return `${titulo};${nasc};${mae}`
}

/** Embaralha e devolve os N primeiros (aleatório sem repetir na mesma leva). */
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

function readStorage(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function UsedTable({ lines }: { lines: UsedLine[] }) {
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
            <tr key={`${line.titulo}-${i}`}>
              <td className="mono-cell">{i + 1}</td>
              <td className="mono-cell">{line.titulo}</td>
              <td>{line.nascimento || '—'}</td>
              <td>{line.mae || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PasteCard({
  title,
  subtitle,
  value,
  onChange,
  onClear,
  placeholder,
}: {
  title: string
  subtitle: string
  value: string
  onChange: (v: string) => void
  onClear: () => void
  placeholder: string
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={(
        <Button variant="secondary" size="sm" type="button" onClick={onClear}>
          Limpar
        </Button>
      )}
    >
      <label className="rel-txt-paste">
        <span className="rel-txt-paste-label">
          <FileText size={14} /> Colar aqui
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          placeholder={placeholder}
          spellCheck={false}
        />
      </label>
    </Card>
  )
}

export function RelatorioFichasTxtPage() {
  const { profile } = useAuth()
  const isAdmin = hasRole(profile, 'admin')
  const diretoriaScope = hasRole(profile, 'diretoria') && !isAdmin ? profile?.id ?? null : null

  const [tab, setTab] = useState<Tab>('gerar')
  const [rows, setRows] = useState<FichaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [quantidade, setQuantidade] = useState('100')
  const [okText, setOkText] = useState(() => readStorage(OK_STORAGE_KEY))
  const [errText, setErrText] = useState(() => readStorage(ERR_STORAGE_KEY))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const pageSize = 1000
      const all: FichaRow[] = []
      let from = 0
      for (;;) {
        let query = supabase
          .from('cadastros')
          .select('id, titulo, data_nascimento, nome_mae, diretoria_id')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + pageSize - 1)
        if (diretoriaScope) {
          query = query.eq('diretoria_id', diretoriaScope)
        }
        const { data, error: err } = await query
        if (err) {
          if (!cancelled) {
            setError(err.message)
            setLoading(false)
          }
          return
        }
        const chunk = (data ?? []) as FichaRow[]
        all.push(...chunk)
        if (chunk.length < pageSize) break
        from += pageSize
      }
      if (!cancelled) {
        setRows(all)
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [diretoriaScope])

  useEffect(() => { writeStorage(OK_STORAGE_KEY, okText) }, [okText])
  useEffect(() => { writeStorage(ERR_STORAGE_KEY, errText) }, [errText])

  const okLines = useMemo(() => parseUsedLines(okText), [okText])
  const errLines = useMemo(() => parseUsedLines(errText), [errText])
  const blockedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const k of parseUsedTitulos(okText)) set.add(k)
    for (const k of parseUsedTitulos(errText)) set.add(k)
    return set
  }, [okText, errText])

  const elegiveis = useMemo(() => {
    const seen = new Set<string>()
    const list: FichaRow[] = []
    for (const row of rows) {
      const key = tituloKey(row.titulo)
      const mae = String(row.nome_mae ?? '').trim()
      if (!key || !row.data_nascimento || !mae) continue
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
      setError('Não há fichas novas (todas já estão em “Já testados” ou “Com erro”, ou incompletas).')
      return
    }

    setGenerating(true)
    const picked = pickRandom(elegiveis, n)
    const bodyLines = picked.map(formatLine)
    const content = [HEADER, ...bodyLines].join('\n')
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTxt(`${content}\n`, `relatorio-fichas-${stamp}.txt`)

    const shortfall = n - picked.length
    setMessage(
      shortfall > 0
        ? `Arquivo aleatório com ${picked.length} linhas (pediu ${n}). Cole em “Já testados” ou “Com erro” conforme o resultado.`
        : `Arquivo aleatório com ${picked.length} linhas. Depois cole em “Já testados” ou “Com erro” o que testou.`,
    )
    setGenerating(false)
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
            Gera linhas aleatórias do que ainda sobrou. Você cola o que passou e o que deu erro.
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

      {tab === 'gerar' ? (
        <Card
          title="Gerar arquivo (aleatório)"
          subtitle="Sorteia entre as fichas que ainda não estão em “Já testados” nem em “Com erro”."
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
          {error ? <p className="rel-txt-error">{error}</p> : null}
          {message ? <p className="rel-txt-ok">{message}</p> : null}
          <p className="rel-txt-hint">
            Formato: <code>{HEADER}</code>
          </p>
        </Card>
      ) : null}

      {tab === 'testados' ? (
        <>
          <PasteCard
            title="Já testados (ok)"
            subtitle="Cole manualmente o que testou e passou. Esses títulos não entram de novo no gerar."
            value={okText}
            onChange={setOkText}
            onClear={() => {
              setOkText('')
              setMessage('Lista de testados limpa.')
            }}
            placeholder={`${HEADER}\n123456789012;01/01/1990;NOME DA MAE\n...`}
          />
          <Card title={`Lista (${okLines.length})`}>
            {!okLines.length ? (
              <p className="rel-txt-empty">Nada colado ainda. Cole no quadro acima o TXT que passou no teste.</p>
            ) : (
              <UsedTable lines={okLines} />
            )}
          </Card>
        </>
      ) : null}

      {tab === 'erros' ? (
        <>
          <PasteCard
            title="Com erro"
            subtitle="Cole o que testou e deu erro. Também fica de fora na próxima geração (não fica sorteando de novo)."
            value={errText}
            onChange={setErrText}
            onClear={() => {
              setErrText('')
              setMessage('Lista de erros limpa.')
            }}
            placeholder={`${HEADER}\n123456789012;01/01/1990;NOME DA MAE\n...`}
          />
          <Card title={`Lista (${errLines.length})`}>
            {!errLines.length ? (
              <p className="rel-txt-empty">Nada colado ainda. Cole no quadro acima o que deu erro no teste.</p>
            ) : (
              <UsedTable lines={errLines} />
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
