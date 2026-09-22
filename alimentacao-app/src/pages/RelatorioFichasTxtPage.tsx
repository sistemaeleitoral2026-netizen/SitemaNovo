import { useEffect, useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { hasRole } from '../lib/roles'

const HEADER = 'Titulo de eleitor;Data de nascimento;Nome completo da mãe'
const USED_STORAGE_KEY = 'relatorio-fichas-txt-usados'

type FichaRow = {
  id: string
  titulo: string | null
  data_nascimento: string | null
  nome_mae: string | null
  diretoria_id: string | null
}

function tituloKey(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

/** Extrai títulos já usados do texto colado (1º campo de cada linha). */
function parseUsedTitulos(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.toLowerCase().startsWith('titulo de eleitor')) continue
    const first = line.split(';')[0] ?? ''
    const key = tituloKey(first)
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

function downloadTxt(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function RelatorioFichasTxtPage() {
  const { profile } = useAuth()
  const isAdmin = hasRole(profile, 'admin')
  const diretoriaScope = hasRole(profile, 'diretoria') && !isAdmin ? profile?.id ?? null : null

  const [rows, setRows] = useState<FichaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [quantidade, setQuantidade] = useState('100')
  const [usadosText, setUsadosText] = useState(() => {
    try {
      return localStorage.getItem(USED_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
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

  useEffect(() => {
    try {
      localStorage.setItem(USED_STORAGE_KEY, usadosText)
    } catch {
      /* ignore quota */
    }
  }, [usadosText])

  const usedKeys = useMemo(() => parseUsedTitulos(usadosText), [usadosText])

  const elegiveis = useMemo(() => {
    const seen = new Set<string>()
    const list: FichaRow[] = []
    for (const row of rows) {
      const key = tituloKey(row.titulo)
      const mae = String(row.nome_mae ?? '').trim()
      if (!key || !row.data_nascimento || !mae) continue
      if (usedKeys.has(key) || seen.has(key)) continue
      seen.add(key)
      list.push(row)
    }
    return list
  }, [rows, usedKeys])

  function handleGerar() {
    setMessage(null)
    setError(null)
    const n = Math.floor(Number(quantidade))
    if (!Number.isFinite(n) || n < 1) {
      setError('Informe a quantidade de linhas (número maior que zero).')
      return
    }
    if (!elegiveis.length) {
      setError('Não há fichas novas com título, nascimento e nome da mãe (todas já estão no texto colado ou incompletas).')
      return
    }

    setGenerating(true)
    const picked = elegiveis.slice(0, n)
    const bodyLines = picked.map(formatLine)
    const content = [HEADER, ...bodyLines].join('\n')
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTxt(`${content}\n`, `relatorio-fichas-${stamp}.txt`)

    const append = bodyLines.join('\n')
    setUsadosText((prev) => {
      const base = prev.trim()
      return base ? `${base}\n${append}` : append
    })

    const shortfall = n - picked.length
    setMessage(
      shortfall > 0
        ? `Geradas ${picked.length} linhas (pediu ${n}; só havia ${picked.length} novas). Elas já entraram na lista de usados.`
        : `Geradas ${picked.length} linhas. Elas já entraram na lista de usados para não repetir.`,
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
            Exporta título, data de nascimento e nome da mãe — sem repetir o que você já usou.
          </p>
        </div>
      </div>

      <div className="rel-txt-stats">
        <div className="rel-txt-stat">
          <span>Fichas no sistema</span>
          <strong>{rows.length.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Já usadas (coladas)</span>
          <strong>{usedKeys.size.toLocaleString('pt-BR')}</strong>
        </div>
        <div className="rel-txt-stat">
          <span>Ainda disponíveis</span>
          <strong>{elegiveis.length.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      <Card
        title="Gerar arquivo"
        subtitle="Formato: Titulo de eleitor;Data de nascimento;Nome completo da mãe"
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
      </Card>

      <Card
        title="Já ajustei / já usei"
        subtitle="Cole aqui o conteúdo que você já exportou e deu ok. Ao gerar, esses títulos não entram de novo. Depois de cada geração, as linhas novas são acrescentadas automaticamente."
        action={(
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => {
              setUsadosText('')
              setMessage('Lista de usados limpa.')
            }}
          >
            Limpar
          </Button>
        )}
      >
        <label className="rel-txt-paste">
          <span className="rel-txt-paste-label">
            <FileText size={14} /> Conteúdo já usado
          </span>
          <textarea
            value={usadosText}
            onChange={(e) => setUsadosText(e.target.value)}
            rows={14}
            placeholder={'Titulo de eleitor;Data de nascimento;Nome completo da mãe\n123456789012;01/01/1990;NOME DA MAE\n...'}
            spellCheck={false}
          />
        </label>
      </Card>
    </div>
  )
}
