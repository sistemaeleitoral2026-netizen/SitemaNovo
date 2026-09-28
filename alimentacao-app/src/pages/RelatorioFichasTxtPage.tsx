import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, Eye, FileText, Pencil, RotateCcw, Save, X, Wrench } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCpf, formatDate } from '../lib/format'
import { hasRole } from '../lib/roles'
import {
  aplicarCorrecoesTxt,
  FICHA_CAMPOS,
  fetchRelatorioTxtLinhas,
  formatRelatorioLinha,
  linhaTxtDe,
  parseRelatorioTxtLines,
  previsualizarCorrecoesTxt,
  RELATORIO_TXT_HEADER,
  RELATORIO_TXT_LIMITE,
  rowKey,
  saveFalhasTxt,
  type CorrecaoPreview,
  type ProgressoCorrecao,
  type RelatorioTxtGerado,
  type RelatorioTxtLinha,
} from '../lib/relatorioFichasTxt'

type Tab = 'gerar' | 'correcoes' | 'falhas'

type FichaRow = {
  id: string
  nome_completo: string | null
  cpf: string | null
  titulo: string | null
  data_nascimento: string | null
  nome_mae: string | null
  zona: string | null
  secao: string | null
  diretoria_id?: string | null
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
    <Link to={`/cadastros/${id}/editar`} className="rel-txt-edit" title="Abrir ficha">
      <span className="mono-cell">{id}</span>
      <Pencil size={13} />
    </Link>
  )
}

function ProgressoSubida({ info }: { info: ProgressoCorrecao }) {
  const pct = info.total ? Math.min(100, Math.round((info.atual / info.total) * 100)) : 0
  const titulo =
    info.etapa === 'conferindo' ? `Conferindo ${info.total} ficha(s)…`
      : info.etapa === 'subindo' ? `Subindo ${info.atual} de ${info.total}`
        : info.etapa === 'gravando' ? 'Gravando no relatório…'
          : 'Pronto'
  return (
    <div className="rel-txt-progress" role="status" aria-live="polite">
      <header>
        <strong>{titulo}</strong>
        <span>{pct}%</span>
      </header>
      <div className="rel-txt-progress-track">
        <i style={{ width: `${info.etapa === 'conferindo' ? 18 : pct}%` }} />
      </div>
      {info.nome ? <p className="rel-txt-progress-nome">{info.nome}</p> : null}
      {info.etapa === 'subindo' || info.etapa === 'gravando' || info.etapa === 'concluido' ? (
        <p className="rel-txt-progress-meta">
          Corrigidas {info.aplicadas} · Sem mudança {info.inalteradas} · Falhas {info.falhas}
        </p>
      ) : null}
    </div>
  )
}

function ResultTable({
  rows,
}: {
  rows: Array<{
    id?: string | null
    cadastro_id?: string | null
    nome?: string
    cpf?: string
    titulo: string
    data_nascimento: string
    nome_mae: string
    zona?: string
    secao?: string
  }>
}) {
  if (!rows.length) return null
  return (
    <div className="table-wrapper">
      <table className="data-table rel-txt-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th>id</th>
            <th>CPF</th>
            <th>Título</th>
            <th>Nascimento</th>
            <th>Mãe</th>
            <th>Zona</th>
            <th>Seção</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const id = row.id ?? row.cadastro_id
            return (
              <tr key={id || `${row.titulo}-${i}`}>
                <td className="mono-cell">{i + 1}</td>
                <td><strong style={{ fontWeight: 600 }}>{row.nome || '—'}</strong></td>
                <td><FichaLink id={id} /></td>
                <td className="mono-cell">{formatCpf(row.cpf) || row.cpf || '—'}</td>
                <td className="mono-cell">{row.titulo || '—'}</td>
                <td>{row.data_nascimento || '—'}</td>
                <td>{row.nome_mae || '—'}</td>
                <td>{row.zona || '—'}</td>
                <td>{row.secao || '—'}</td>
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
  const isDiretoria = hasRole(profile, 'diretoria') && !hasRole(profile, 'admin')
  const diretoriaId = isDiretoria ? profile?.id : null

  const [tab, setTab] = useState<Tab>('gerar')
  const [rows, setRows] = useState<FichaRow[]>([])
  const [saved, setSaved] = useState<RelatorioTxtLinha[]>([])
  const [gerado, setGerado] = useState<RelatorioTxtGerado | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantidade, setQuantidade] = useState('100')
  const [correcaoDraft, setCorrecaoDraft] = useState('')
  const [falhaDraft, setFalhaDraft] = useState('')
  const [previews, setPreviews] = useState<CorrecaoPreview[] | null>(null)
  const [canceladas, setCanceladas] = useState<Set<string>>(new Set())
  const [previewing, setPreviewing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoCorrecao | null>(null)

  async function reloadSaved() {
    setSaved(await fetchRelatorioTxtLinhas())
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
          let q = supabase
            .from('cadastros')
            .select('id, nome_completo, cpf, titulo, data_nascimento, nome_mae, zona, secao, diretoria_id')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, from + pageSize - 1)
          if (diretoriaId) q = q.eq('diretoria_id', diretoriaId)
          const { data, error: err } = await q
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
  }, [diretoriaId])

  const falhaLines = useMemo(() => saved.filter((l) => l.status === 'erro'), [saved])
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

  const geradoAberto = useMemo(() => {
    if (!gerado) return null
    const rowsAbertas = gerado.rows.filter((row) => {
      const key = rowKey(row.id, row.titulo)
      const t = tituloDigits(row.titulo)
      if (key && blockedKeys.has(key)) return false
      if (t && blockedKeys.has(t)) return false
      return true
    })
    if (!rowsAbertas.length) return null
    const ids = new Set(rowsAbertas.map((r) => r.id))
    return {
      ...gerado,
      rows: rowsAbertas,
      lines: gerado.lines.filter((line) => ids.has(line.split(';')[1] ?? '')),
    }
  }, [gerado, blockedKeys])

  const falhasTxt = useMemo(
    () => falhaLines.map((row) => linhaTxtDe(row)).join('\n'),
    [falhaLines],
  )
  const correcaoCount = useMemo(() => parseRelatorioTxtLines(correcaoDraft).length, [correcaoDraft])
  const falhaCount = useMemo(() => parseRelatorioTxtLines(falhaDraft).length, [falhaDraft])
  const correcaoAcima = correcaoCount > RELATORIO_TXT_LIMITE
  const falhaAcima = falhaCount > RELATORIO_TXT_LIMITE

  function mensagemLimite(n: number) {
    return `São ${n} linhas. O limite é ${RELATORIO_TXT_LIMITE} por vez — não dá para subir mais. Tire o restante e faça outro lote.`
  }

  function handleGerar() {
    setMessage(null)
    setError(null)
    const n = Math.floor(Number(quantidade))
    if (!Number.isFinite(n) || n < 1) {
      setError('Informe a quantidade de linhas (número maior que zero).')
      return
    }
    if (n > RELATORIO_TXT_LIMITE) {
      setError(`Máximo ${RELATORIO_TXT_LIMITE} linhas por vez. Não dá para gerar mais que isso de uma vez.`)
      return
    }
    if (!elegiveis.length) {
      setError('Não há fichas novas (todas já estão em Falhas ou já foram corrigidas).')
      return
    }

    setGenerating(true)
    const picked = pickRandom(elegiveis, n)
    const bodyLines = picked.map((row) => formatRelatorioLinha({
      ...row,
      data_nascimento: row.data_nascimento ? formatDate(row.data_nascimento) : '',
    }))
    const next: RelatorioTxtGerado = {
      at: new Date().toISOString(),
      lines: bodyLines,
      rows: picked.map((row) => ({
        id: row.id,
        nome: String(row.nome_completo ?? '').trim(),
        cpf: String(row.cpf ?? ''),
        titulo: String(row.titulo ?? '').trim(),
        data_nascimento: row.data_nascimento ? formatDate(row.data_nascimento) : '',
        nome_mae: String(row.nome_mae ?? '').trim(),
        zona: String(row.zona ?? '').trim(),
        secao: String(row.secao ?? '').trim(),
      })),
    }
    setGerado(next)
    downloadTxt(`${[RELATORIO_TXT_HEADER, ...bodyLines].join('\n')}\n`, `relatorio-correcao-${new Date().toISOString().slice(0, 10)}.txt`)
    const shortfall = n - picked.length
    setMessage(
      shortfall > 0
        ? `Arquivo com ${picked.length} linhas (pediu ${n}). Depois cole as correções na aba Correções.`
        : `Arquivo com ${picked.length} linhas. Depois cole as correções na aba Correções.`,
    )
    setGenerating(false)
  }

  function handleBaixarGerado() {
    if (!geradoAberto?.lines.length) return
    downloadTxt(
      `${[RELATORIO_TXT_HEADER, ...geradoAberto.lines].join('\n')}\n`,
      `relatorio-correcao-${geradoAberto.at.slice(0, 10)}.txt`,
    )
  }

  async function handleConferir() {
    setMessage(null)
    setError(null)
    if (!correcaoCount) {
      setError('Cole pelo menos uma linha (Nome;id;CPF;título;nascimento;mãe;zona;seção).')
      return
    }
    if (correcaoAcima) {
      setError(mensagemLimite(correcaoCount))
      return
    }
    setPreviewing(true)
    setProgresso({
      etapa: 'conferindo',
      atual: 0,
      total: correcaoCount,
      nome: '',
      aplicadas: 0,
      inalteradas: 0,
      falhas: 0,
    })
    try {
      const next = await previsualizarCorrecoesTxt(correcaoDraft, diretoriaId)
      setPreviews(next)
      setCanceladas(new Set())
      setMessage(`Conferência: ${next.length} ficha(s). Cancele as que não quiser aplicar.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível montar as fichas.')
    } finally {
      setPreviewing(false)
      setProgresso(null)
    }
  }

  function toggleCancelar(key: string) {
    setCanceladas((atual) => {
      const next = new Set(atual)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleAplicar() {
    setMessage(null)
    setError(null)
    if (!correcaoCount) {
      setError('Cole pelo menos uma linha (Nome;id;CPF;título;nascimento;mãe;zona;seção).')
      return
    }
    if (correcaoAcima) {
      setError(mensagemLimite(correcaoCount))
      return
    }
    if (!previews?.length) {
      await handleConferir()
      return
    }
    const selecionadas = new Set(previews.filter((item) => !canceladas.has(item.key)).map((item) => item.key))
    if (!selecionadas.size) {
      setError('Todas as fichas foram canceladas. Deixe pelo menos uma ou cole de novo.')
      return
    }
    if (selecionadas.size > RELATORIO_TXT_LIMITE) {
      setError(mensagemLimite(selecionadas.size))
      return
    }
    setSaving(true)
    setProgresso({
      etapa: 'subindo',
      atual: 0,
      total: selecionadas.size,
      nome: '',
      aplicadas: 0,
      inalteradas: 0,
      falhas: 0,
    })
    try {
      const result = await aplicarCorrecoesTxt(
        correcaoDraft,
        profile ? { id: profile.id, nome: profile.nome } : null,
        diretoriaId,
        selecionadas,
        setProgresso,
      )
      await reloadSaved()
      setCorrecaoDraft('')
      setPreviews(null)
      setCanceladas(new Set())
      setTab(result.falhas.length ? 'falhas' : 'correcoes')
      setMessage(
        `Corrigidas ${result.aplicadas}. Sem mudança ${result.inalteradas}. Falhas ${result.falhas.length}.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível aplicar as correções.')
    } finally {
      setSaving(false)
      setProgresso(null)
    }
  }

  async function handleSalvarFalhas() {
    setMessage(null)
    setError(null)
    if (!falhaCount) {
      setError('Cole pelo menos uma linha antes de salvar em Falhas.')
      return
    }
    if (falhaAcima) {
      setError(mensagemLimite(falhaCount))
      return
    }
    setSaving(true)
    setProgresso({
      etapa: 'gravando',
      atual: falhaCount,
      total: falhaCount,
      nome: '',
      aplicadas: 0,
      inalteradas: 0,
      falhas: falhaCount,
    })
    try {
      const n = await saveFalhasTxt(falhaDraft, profile?.id ?? null)
      await reloadSaved()
      setFalhaDraft('')
      setMessage(`Salvas ${n} falha(s). Elas não entram mais no gerar.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar as falhas.')
    } finally {
      setSaving(false)
      setProgresso(null)
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
          <h1 className="page-title">Relatório/Correção</h1>
          <p className="page-subtitle">
            Gera o TXT, cola as correções e confere a ficha montada — o que era e o que vai ficar — antes de gravar.
          </p>
        </div>
      </div>

      <div className="rel-txt-tabs" role="tablist" aria-label="Seções">
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
          aria-selected={tab === 'correcoes'}
          className={`rel-txt-tab${tab === 'correcoes' ? ' is-active' : ''}`}
          onClick={() => setTab('correcoes')}
        >
          <Wrench size={15} /> Correções
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'falhas'}
          className={`rel-txt-tab${tab === 'falhas' ? ' is-active' : ''}`}
          onClick={() => setTab('falhas')}
        >
          <AlertTriangle size={15} /> Falhas
          <em>{falhaLines.length}</em>
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
          <span>Falhas</span>
          <strong>{falhaLines.length.toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      {error ? <p className="rel-txt-error">{error}</p> : null}
      {message ? <p className="rel-txt-ok">{message}</p> : null}
      {progresso ? <ProgressoSubida info={progresso} /> : null}

      {tab === 'gerar' ? (
        <>
          <Card
            title="Gerar arquivo"
            subtitle="Sorteia o que ainda não está em Falhas e o que ainda não foi corrigido. Máximo 200 por vez."
          >
            <div className="rel-txt-form">
              <label className="rel-txt-field">
                <span>Quantidade de linhas</span>
                <input
                  type="number"
                  min={1}
                  max={RELATORIO_TXT_LIMITE}
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
              Máximo {RELATORIO_TXT_LIMITE} linhas. Formato: <code>{RELATORIO_TXT_HEADER}</code>
            </p>
          </Card>
          {geradoAberto ? (
            <Card
              title={`Deste sorteio (${geradoAberto.rows.length})`}
              action={(
                <Button size="sm" type="button" onClick={handleBaixarGerado}>
                  <Download size={14} /> Baixar de novo
                </Button>
              )}
            >
              <ResultTable rows={geradoAberto.rows} />
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'correcoes' ? (
        <>
          <Card
            title="Colar correções"
            subtitle={`Cole o retorno do outro app. Conferência e gravação: no máximo ${RELATORIO_TXT_LIMITE} linhas por vez.`}
            action={(
              <div className="rel-prev-actions">
                <Button size="sm" type="button" variant="secondary" loading={previewing} disabled={previewing || saving || correcaoAcima} onClick={() => void handleConferir()}>
                  <Eye size={14} /> Conferir fichas
                </Button>
                <Button size="sm" type="button" loading={saving} disabled={saving || previewing || correcaoAcima} onClick={() => void handleAplicar()}>
                  <Save size={14} /> Aplicar na ficha
                </Button>
              </div>
            )}
          >
            <label className="rel-txt-paste">
              <span className="rel-txt-paste-label">
                <FileText size={14} /> Colar aqui
              </span>
              <textarea
                className={correcaoAcima ? 'is-over' : undefined}
                value={correcaoDraft}
                onChange={(e) => {
                  setCorrecaoDraft(e.target.value)
                  setPreviews(null)
                  setCanceladas(new Set())
                }}
                rows={8}
                placeholder={`${RELATORIO_TXT_HEADER}\nClairton Sidney Carvalho França;96956dc1-4ab4-40df-bdd0-1354e9c7a349;409.400.123-91;017359631155;20/11/1968;Maria das graças Pereira de Carvalho;089;0364`}
                spellCheck={false}
              />
              <p className={`rel-txt-count${correcaoAcima ? ' is-over' : ''}`}>
                {correcaoCount} / {RELATORIO_TXT_LIMITE} linhas
                {correcaoAcima
                  ? ' — não dá para subir mais. Apague o restante e faça outro lote.'
                  : ' · máximo 200 por vez'}
              </p>
            </label>
          </Card>
          {previewing && !progresso ? (
            <div className="gg-loading">
              <Spinner size={32} />
            </div>
          ) : previews?.length ? (
            <PreviewFichas
              items={previews}
              canceladas={canceladas}
              onToggle={toggleCancelar}
            />
          ) : null}
        </>
      ) : null}

      {tab === 'falhas' ? (
        <>
          <Card
            title="Colar falhas"
            subtitle={`Cole as linhas que não passaram. Máximo ${RELATORIO_TXT_LIMITE} por vez. Fica gravado com nerite, coordenador e liderança da ficha.`}
            action={(
              <Button size="sm" type="button" loading={saving} disabled={saving || falhaAcima} onClick={() => void handleSalvarFalhas()}>
                <Save size={14} /> Salvar falhas
              </Button>
            )}
          >
            <label className="rel-txt-paste">
              <span className="rel-txt-paste-label">
                <FileText size={14} /> Colar aqui
              </span>
              <textarea
                className={falhaAcima ? 'is-over' : undefined}
                value={falhaDraft}
                onChange={(e) => setFalhaDraft(e.target.value)}
                rows={8}
                placeholder={`${RELATORIO_TXT_HEADER}\nClairton Sidney Carvalho França;96956dc1-4ab4-40df-bdd0-1354e9c7a349;409.400.123-91;017359631155;20/11/1968;Maria das graças Pereira de Carvalho;089;0364`}
                spellCheck={false}
              />
              <p className={`rel-txt-count${falhaAcima ? ' is-over' : ''}`}>
                {falhaCount} / {RELATORIO_TXT_LIMITE} linhas
                {falhaAcima
                  ? ' — não dá para subir mais. Apague o restante e faça outro lote.'
                  : ' · máximo 200 por vez'}
              </p>
            </label>
          </Card>
          <Card title={`Falhas gravadas (${falhaLines.length})`}>
            {!falhaLines.length ? (
              <p className="rel-txt-empty">Nenhuma falha ainda.</p>
            ) : (
              <>
                <div className="table-wrapper">
                  <table className="data-table rel-txt-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Mãe</th>
                        <th>Nerite</th>
                        <th>Coordenador</th>
                        <th>Liderança</th>
                        <th>Motivo</th>
                        <th>id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {falhaLines.map((row) => (
                        <tr key={row.titulo_key}>
                          <td><strong>{row.nome || '—'}</strong></td>
                          <td>{row.nome_mae || '—'}</td>
                          <td>{row.operador_nome || '—'}</td>
                          <td>{row.coordenador || '—'}</td>
                          <td>{row.lider || '—'}</td>
                          <td>{row.motivo || '—'}</td>
                          <td><FichaLink id={row.cadastro_id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="rel-txt-paste" style={{ marginTop: '1rem' }}>
                  <span className="rel-txt-paste-label">Linhas devolvidas</span>
                  <textarea value={falhasTxt} readOnly rows={Math.min(12, falhaLines.length + 1)} spellCheck={false} />
                </label>
              </>
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

function valorFicha(key: string, value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return '—'
  if (key === 'cpf') return formatCpf(raw) || raw
  if (key === 'data_nascimento') {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatDate(raw.slice(0, 10))
    return raw
  }
  return raw
}

function PreviewFichas({
  items,
  canceladas,
  onToggle,
}: {
  items: CorrecaoPreview[]
  canceladas: Set<string>
  onToggle: (key: string) => void
}) {
  const ativas = items.filter((item) => !canceladas.has(item.key))
  const prontas = ativas.filter((item) => item.status === 'aplicar').length
  return (
    <Card
      title={`Fichas conferidas (${items.length})`}
      subtitle={`${prontas} prontas para gravar. ${canceladas.size} cancelada(s). O que estiver amarelo é o que muda.`}
    >
      <div className="rel-prev-list">
        {items.map((item, index) => {
          const off = canceladas.has(item.key)
          const changed = new Set(
            FICHA_CAMPOS
              .map((campo) => campo.key)
              .filter((key) => (item.antes?.[key] ?? '') !== (item.depois?.[key] ?? '')),
          )
          return (
            <article
              key={item.key}
              className={`rel-prev-card${off ? ' is-off' : ''}${item.status === 'falha' ? ' is-fail' : ''}`}
            >
              <header className="rel-prev-top">
                <div>
                  <em>{index + 1} de {items.length}</em>
                  <strong>{(item.depois?.nome_completo || item.antes?.nome_completo || item.line.nome || '—').toUpperCase()}</strong>
                  {item.extra.coordenador || item.extra.lider ? (
                    <small>{[item.extra.coordenador, item.extra.lider].filter(Boolean).join(' · ')}</small>
                  ) : null}
                  {item.status === 'inalterada' ? <span className="rel-prev-tag">Sem mudança</span> : null}
                  {item.status === 'falha' ? <span className="rel-prev-tag is-bad">{item.motivo || 'Não aplica'}</span> : null}
                  {off ? <span className="rel-prev-tag">Cancelada</span> : null}
                </div>
                <button type="button" className="rel-prev-cancel" onClick={() => onToggle(item.key)}>
                  {off ? <RotateCcw size={15} /> : <X size={15} />}
                  {off ? 'Voltar' : 'Cancelar esta'}
                </button>
              </header>
              <div className="rel-prev-cols">
                <FichaMontada
                  titulo="Como está agora"
                  dados={item.antes}
                  mudou={changed}
                  lado="antes"
                />
                <FichaMontada
                  titulo="Como vai ficar"
                  dados={item.depois}
                  mudou={changed}
                  lado="depois"
                />
              </div>
            </article>
          )
        })}
      </div>
    </Card>
  )
}

function FichaMontada({
  titulo,
  dados,
  mudou,
  lado,
}: {
  titulo: string
  dados: Record<string, string> | null
  mudou: Set<string>
  lado: 'antes' | 'depois'
}) {
  return (
    <section className={`rel-ficha rel-ficha-${lado}`}>
      <header>{titulo}</header>
      <div className="rel-ficha-body">
        <div className="rel-ficha-nome">
          <span>Nome Completo</span>
          <h3 className={mudou.has('nome_completo') ? 'is-diff' : undefined}>
            {valorFicha('nome_completo', dados?.nome_completo)}
          </h3>
        </div>
        <div className="rel-ficha-grid">
          {FICHA_CAMPOS.filter((campo) => campo.key !== 'nome_completo').map((campo) => (
            <div key={campo.key} className={`rel-ficha-field${mudou.has(campo.key) ? ' is-diff' : ''}`}>
              <span>{campo.label}</span>
              <strong>{valorFicha(campo.key, dados?.[campo.key])}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
