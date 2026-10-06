import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, Search, X } from 'lucide-react'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/Pagination'
import { logAudit } from '../lib/audit'
import {
  buKey,
  corrigirZonaSecao,
  fetchFichasQueVotaram,
  loadBu,
  type Alvo,
  type AuditoriaFicha,
  type BuData,
} from '../lib/auditoriaBu'
import { loadLocaisVotacaoMa, lookupLocalVotacao, type LocalVotacaoRef } from '../lib/locaisVotacao'
import { normalizeSecao, normalizeZona } from '../lib/normalize'
import { signVotoFoto } from '../lib/votacao'

type Tab = 'zona' | 'secao' | 'equipe' | 'corrigir'
type StatusSecao = 'confere' | 'parcial' | 'abaixo' | 'excede'
type StatusFiltro = 'todos' | StatusSecao

const STATUS_LABEL: Record<StatusSecao, string> = {
  confere: 'Confere',
  parcial: 'Parcial',
  abaixo: 'Votos abaixo',
  excede: 'Acima do comparecimento',
}

type LinhaSecao = {
  key: string
  zona: string
  secao: string
  local: string
  fichas: AuditoriaFicha[]
  comparecimento: number
  /** votos de cada candidato acompanhado, na ordem de `alvos` */
  votos: number[]
  somaFederal: number
  somaEstadual: number
  branco: number
  nulo: number
  status: StatusSecao
  /** fichas que não cabem nos votos de cada candidato (fichas − votos, mínimo 0) */
  faltam: number[]
}

type LinhaEquipe = { linha: LinhaSecao; ficha: AuditoriaFicha }

type LinhaZona = {
  zona: string
  secoes: number
  votaram: number
  comparecimento: number
  votos: number[]
  somaFederal: number
  somaEstadual: number
  problemas: number
}

/** Abaixo disso (votos do candidato / fichas "Votou") a seção é marcada como "Votos abaixo". */
const TOLERANCIA = 0.75

type Sort = { key: string; dir: 'asc' | 'desc' }

const SEVERIDADE: Record<StatusSecao, number> = { confere: 0, parcial: 1, abaixo: 2, excede: 3 }

function cmp(a: string | number, b: string | number) {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR')
}

function nextSort(cur: Sort, key: string): Sort {
  if (cur.key !== key) return { key, dir: key === 'zona' || key === 'secao' || key === 'local' ? 'asc' : 'desc' }
  return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

export function AuditoriaPage() {
  const [tab, setTab] = useState<Tab>('zona')
  const [bu, setBu] = useState<BuData | null>(null)
  const [fichas, setFichas] = useState<AuditoriaFicha[]>([])
  const [locais, setLocais] = useState<Map<string, LocalVotacaoRef>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const [sortZ, setSortZ] = useState<Sort>({ key: 'votaram', dir: 'desc' })
  const [sortS, setSortS] = useState<Sort>({ key: 'votaram', dir: 'desc' })
  const [liderSel, setLiderSel] = useState('')
  const [sortE, setSortE] = useState<Sort>({ key: 'secao', dir: 'asc' })
  const [coordSel, setCoordSel] = useState('')
  const [zonaSel, setZonaSel] = useState('')
  const [status, setStatus] = useState<StatusFiltro>('todos')
  const [query, setQuery] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [fotoTitle, setFotoTitle] = useState('')
  const [edits, setEdits] = useState<Record<string, { zona: string; secao: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, f, l] = await Promise.all([
        loadBu(),
        fetchFichasQueVotaram(),
        loadLocaisVotacaoMa().catch(() => new Map<string, LocalVotacaoRef>()),
      ])
      setBu(b)
      setFichas(f)
      setLocais(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a auditoria.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => setPage(0), [zonaSel, status, query, tab, sortS, sortE, coordSel, liderSel])

  const alvos: Alvo[] = bu?.alvos ?? []

  /**
   * Mesma regra do mapa: zona/seção vazia ou fora da base TSE vai para Corrigir.
   * Existe no TSE mas não no BU de São Luís = ficha de outro município.
   */
  const { validas, invalidas, foraSl } = useMemo(() => {
    const v: AuditoriaFicha[] = []
    const inv: AuditoriaFicha[] = []
    const fora: AuditoriaFicha[] = []
    if (!bu) return { validas: v, invalidas: inv, foraSl: fora }
    for (const f of fichas) {
      if (!f.zona || !f.secao || !lookupLocalVotacao(locais, f.zona, f.secao)) inv.push(f)
      else if (bu.secoes.has(buKey(f.zona, f.secao))) v.push(f)
      else fora.push(f)
    }
    return { validas: v, invalidas: inv, foraSl: fora }
  }, [bu, fichas, locais])

  const linhas = useMemo<LinhaSecao[]>(() => {
    if (!bu) return []
    const grupos = new Map<string, AuditoriaFicha[]>()
    for (const f of validas) {
      const k = buKey(f.zona, f.secao)
      const arr = grupos.get(k)
      if (arr) arr.push(f)
      else grupos.set(k, [f])
    }
    const federal = bu.cargos.indexOf('Deputado Federal')
    const out: LinhaSecao[] = []
    for (const [key, list] of grupos) {
      const sec = bu.secoes.get(key)
      const votos = alvos.map((a) => sec?.get(a.cargoIdx)?.votos.get(a.candIdx) ?? 0)
      const somaFederal = alvos.reduce((s, a, i) => (a.cargo === 'Deputado Federal' ? s + votos[i] : s), 0)
      const somaEstadual = alvos.reduce((s, a, i) => (a.cargo === 'Deputado Estadual' ? s + votos[i] : s), 0)
      const comparecimento = sec?.get(federal)?.total ?? 0
      let st: StatusSecao = 'confere'
      if (list.length > comparecimento) st = 'excede'
      else if (somaFederal < list.length * TOLERANCIA || somaEstadual < list.length * TOLERANCIA) st = 'abaixo'
      else if (somaFederal < list.length || somaEstadual < list.length) st = 'parcial'
      const [zona, secao] = key.split('|')
      out.push({
        key,
        zona,
        secao,
        local: lookupLocalVotacao(locais, zona, secao)?.local?.trim() || '—',
        fichas: list,
        comparecimento,
        votos,
        somaFederal,
        somaEstadual,
        branco: sec?.get(federal)?.branco ?? 0,
        nulo: sec?.get(federal)?.nulo ?? 0,
        status: st,
        faltam: votos.map((v) => Math.max(0, list.length - v)),
      })
    }
    return out.sort((a, b) => a.zona.localeCompare(b.zona) || a.secao.localeCompare(b.secao))
  }, [bu, validas, alvos, locais])

  const porZona = useMemo<LinhaZona[]>(() => {
    const m = new Map<string, LinhaZona>()
    for (const l of linhas) {
      const z = m.get(l.zona) ?? {
        zona: l.zona,
        secoes: 0,
        votaram: 0,
        comparecimento: 0,
        votos: alvos.map(() => 0),
        somaFederal: 0,
        somaEstadual: 0,
        problemas: 0,
      }
      z.secoes += 1
      z.votaram += l.fichas.length
      z.comparecimento += l.comparecimento
      l.votos.forEach((v, i) => { z.votos[i] += v })
      z.somaFederal += l.somaFederal
      z.somaEstadual += l.somaEstadual
      if (l.status === 'abaixo' || l.status === 'excede') z.problemas += 1
      m.set(l.zona, z)
    }
    return [...m.values()].sort((a, b) => a.zona.localeCompare(b.zona))
  }, [linhas, alvos])

  const zonas = useMemo(() => porZona.map((z) => z.zona), [porZona])

  const zonasOrdenadas = useMemo(() => {
    const val = (z: LinhaZona): string | number => {
      if (sortZ.key.startsWith('alvo')) return z.votos[Number(sortZ.key.slice(4))]
      switch (sortZ.key) {
        case 'secoes': return z.secoes
        case 'votaram': return z.votaram
        case 'comparecimento': return z.comparecimento
        case 'problemas': return z.problemas
        default: return z.zona
      }
    }
    const m = sortZ.dir === 'asc' ? 1 : -1
    return [...porZona].sort((a, b) => m * cmp(val(a), val(b)) || a.zona.localeCompare(b.zona))
  }, [porZona, sortZ])

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    const val = (l: LinhaSecao): string | number => {
      if (sortS.key.startsWith('alvo')) return l.votos[Number(sortS.key.slice(4))]
      switch (sortS.key) {
        case 'secao': return l.secao
        case 'local': return l.local
        case 'votaram': return l.fichas.length
        case 'comparecimento': return l.comparecimento
        case 'status': return SEVERIDADE[l.status]
        default: return l.zona
      }
    }
    const m = sortS.dir === 'asc' ? 1 : -1
    return linhas.filter((l) => {
      if (zonaSel && l.zona !== zonaSel) return false
      if (status !== 'todos' && l.status !== status) return false
      if (!q) return true
      return (
        l.secao.includes(q)
        || l.local.toLowerCase().includes(q)
        || l.fichas.some((f) => f.nome_completo.toLowerCase().includes(q) || f.titulo.includes(q))
      )
    }).sort((a, b) => m * cmp(val(a), val(b)) || a.zona.localeCompare(b.zona) || a.secao.localeCompare(b.secao))
  }, [linhas, zonaSel, status, query, sortS])

  const totais = useMemo(() => {
    const t = { votaram: validas.length, secoes: linhas.length, problemas: 0, votos: alvos.map(() => 0) }
    for (const l of linhas) {
      if (l.status === 'abaixo' || l.status === 'excede') t.problemas += 1
      l.votos.forEach((v, i) => { t.votos[i] += v })
    }
    return t
  }, [linhas, validas, alvos])

  const coordenadores = useMemo(
    () => [...new Set(validas.map((f) => f.coordenador || 'Sem coordenação'))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [validas],
  )
  const lideresLista = useMemo(
    () => [...new Set(
      validas
        .filter((f) => !coordSel || (f.coordenador || 'Sem coordenação') === coordSel)
        .map((f) => f.lider || 'Sem liderança'),
    )].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [validas, coordSel],
  )

  /** Uma linha por ficha (filtrada), com os dados da seção onde votou. */
  const linhasEquipe = useMemo<LinhaEquipe[]>(() => {
    const q = query.trim().toLowerCase()
    const out: LinhaEquipe[] = []
    for (const linha of linhas) {
      if (zonaSel && linha.zona !== zonaSel) continue
      for (const f of linha.fichas) {
        const coordenador = f.coordenador || 'Sem coordenação'
        const lider = f.lider || 'Sem liderança'
        if (coordSel && coordenador !== coordSel) continue
        if (liderSel && lider !== liderSel) continue
        if (q && !(f.nome_completo.toLowerCase().includes(q) || f.titulo.includes(q)
          || lider.toLowerCase().includes(q) || coordenador.toLowerCase().includes(q)
          || linha.secao.includes(q) || linha.local.toLowerCase().includes(q))) continue
        out.push({ linha, ficha: f })
      }
    }
    const val = (r: LinhaEquipe): string | number => {
      if (sortE.key.startsWith('alvo')) return r.linha.votos[Number(sortE.key.slice(4))]
      switch (sortE.key) {
        case 'fichas': return r.linha.fichas.length
        case 'eleitor': return r.ficha.nome_completo
        case 'lider': return r.ficha.lider || 'Sem liderança'
        case 'coord': return r.ficha.coordenador || 'Sem coordenação'
        default: return r.linha.key
      }
    }
    const m = sortE.dir === 'asc' ? 1 : -1
    // Mantém as fichas da mesma seção juntas (chave da seção como desempate).
    return out.sort((a, b) => m * cmp(val(a), val(b)) || a.linha.key.localeCompare(b.linha.key)
      || a.ficha.nome_completo.localeCompare(b.ficha.nome_completo, 'pt-BR'))
  }, [linhas, coordSel, liderSel, zonaSel, query, sortE])

  const eqPages = Math.max(1, Math.ceil(linhasEquipe.length / pageSize))
  const eqPageSafe = Math.min(page, eqPages - 1)
  const eqVisiveis = linhasEquipe.slice(eqPageSafe * pageSize, (eqPageSafe + 1) * pageSize)

  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize))
  const pageSafe = Math.min(page, totalPages - 1)
  const visiveis = filtradas.slice(pageSafe * pageSize, (pageSafe + 1) * pageSize)

  const invalidasFiltradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return invalidas
    return invalidas.filter(
      (f) => f.nome_completo.toLowerCase().includes(q) || f.titulo.includes(q) || f.lider.toLowerCase().includes(q),
    )
  }, [invalidas, query])
  const invPages = Math.max(1, Math.ceil(invalidasFiltradas.length / pageSize))
  const invPageSafe = Math.min(page, invPages - 1)
  const invVisiveis = invalidasFiltradas.slice(invPageSafe * pageSize, (invPageSafe + 1) * pageSize)

  async function abrirFoto(f: AuditoriaFicha) {
    if (!f.voto_foto_path) return
    setError(null)
    try {
      const url = await signVotoFoto(f.voto_foto_path)
      if (!url) throw new Error('Anexo indisponível.')
      setFotoUrl(url)
      setFotoTitle(f.nome_completo)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o anexo.')
    }
  }

  async function salvarCorrecao(f: AuditoriaFicha) {
    const e = edits[f.id] ?? { zona: f.zonaRaw, secao: f.secaoRaw }
    const z = normalizeZona(e.zona)
    const s = normalizeSecao(e.secao)
    setError(null)
    setOkMsg(null)
    if (!z || !s) {
      setError('Informe zona e seção.')
      return
    }
    if (!lookupLocalVotacao(locais, z, s)) {
      setError(`Zona ${z} / seção ${s} não existe na base de locais de votação (TSE).`)
      return
    }
    setSavingId(f.id)
    try {
      await corrigirZonaSecao(f.id, z, s)
      logAudit('corrigir_zona_secao_auditoria', 'cadastros', f.id, {
        nome: f.nome_completo,
        de: { zona: f.zonaRaw, secao: f.secaoRaw },
        para: { zona: z, secao: s },
      })
      setFichas((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, zona: z, secao: s, zonaRaw: z, secaoRaw: s } : x)),
      )
      setOkMsg(`${f.nome_completo}: corrigido para zona ${z}, seção ${s}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSavingId(null)
    }
  }

  async function exportar() {
    const XLSX = await import('xlsx')
    const cab = ['Zona', 'Seção', 'Local', 'Votaram (sistema)', 'Comparecimento BU', ...alvos.map((a) => a.nome), 'Status']
    const dados = linhas.map((l) => [
      l.zona, l.secao, l.local, l.fichas.length, l.comparecimento, ...l.votos, STATUS_LABEL[l.status],
    ])
    const ws = XLSX.utils.aoa_to_sheet([cab, ...dados])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria')
    XLSX.writeFile(wb, 'auditoria-zona-secao.xlsx')
  }

  if (loading) {
    return (
      <div className="vot-page vot-center">
        <Spinner size={36} />
      </div>
    )
  }

  const th = (sort: Sort, set: (s: Sort) => void, key: string, label: React.ReactNode, num = false) => (
    <th
      className={`aud-sort ${num ? 'aud-num' : ''} ${sort.key === key ? 'is-on' : ''}`.trim()}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => set(nextSort(sort, key))}>
        {label}
        <i aria-hidden>{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</i>
      </button>
    </th>
  )

  const alvoLabel = (a: Alvo) => (
    <span className="aud-alvo">
      {a.nome}
      <small>{a.cargo === 'Deputado Federal' ? 'Federal' : 'Estadual'} {a.numero}</small>
    </span>
  )
  const colAlvosZ = alvos.map((a, i) => <Fragment key={a.id}>{th(sortZ, setSortZ, `alvo${i}`, alvoLabel(a), true)}</Fragment>)
  const colAlvosS = alvos.map((a, i) => <Fragment key={a.id}>{th(sortS, setSortS, `alvo${i}`, alvoLabel(a), true)}</Fragment>)

  return (
    <div className="aud-page">
      <header className="aud-head">
        <div>
          <h1>Auditoria de votos</h1>
          <p>
            Fichas marcadas como “Votou” comparadas com o boletim de urna de São Luís, por zona e seção.
          </p>
        </div>
        <div className="aud-head-actions">
          <Button variant="secondary" onClick={() => void carregar()}>Atualizar</Button>
          <Button variant="secondary" onClick={() => void exportar()} disabled={!linhas.length}>
            <Download size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Exportar
          </Button>
        </div>
      </header>

      <section className="aud-resumo">
        <div>
          <span>Votaram (sistema)</span>
          <strong>{fmt(totais.votaram)}</strong>
          <em>{fmt(totais.secoes)} seções{foraSl.length ? ` · +${fmt(foraSl.length)} fora de São Luís` : ''}</em>
        </div>
        {alvos.map((a, i) => (
          <div key={a.id}>
            <span>{a.nome}</span>
            <strong>{fmt(totais.votos[i])}</strong>
            <em>{a.cargo === 'Deputado Federal' ? 'Federal' : 'Estadual'} {a.numero}</em>
          </div>
        ))}
        <div className={totais.problemas ? 'is-alerta' : ''}>
          <span>Seções a revisar</span>
          <strong>{fmt(totais.problemas)}</strong>
          <em>{fmt(invalidas.length)} fichas sem zona/seção válida</em>
        </div>
      </section>

      <nav className="aud-tabs" aria-label="Seções da auditoria">
        <button type="button" className={tab === 'zona' ? 'is-on' : ''} onClick={() => setTab('zona')}>Por zona</button>
        <button type="button" className={tab === 'secao' ? 'is-on' : ''} onClick={() => setTab('secao')}>Por seção</button>
        <button type="button" className={tab === 'equipe' ? 'is-on' : ''} onClick={() => setTab('equipe')}>Fichas por equipe</button>
        <button type="button" className={tab === 'corrigir' ? 'is-on' : ''} onClick={() => setTab('corrigir')}>
          Corrigir zona/seção <span className="aud-badge">{invalidas.length}</span>
        </button>
      </nav>

      {error && <div className="alert alert-error">{error}</div>}
      {okMsg && <div className="alert alert-success">{okMsg}</div>}

      {tab === 'zona' && (
        <div className="aud-card">
          {!porZona.length ? (
            <EmptyState title="Sem dados" description="Nenhuma ficha “Votou” em zona/seção de São Luís." />
          ) : (
            <div className="table-wrapper">
              <table className="aud-table">
                <thead>
                  <tr>
                    {th(sortZ, setSortZ, 'zona', 'Zona')}
                    {th(sortZ, setSortZ, 'secoes', 'Seções', true)}
                    {th(sortZ, setSortZ, 'votaram', 'Votaram', true)}
                    {th(sortZ, setSortZ, 'comparecimento', 'Comparecimento', true)}
                    {colAlvosZ}
                    {th(sortZ, setSortZ, 'problemas', 'A revisar', true)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {zonasOrdenadas.map((z) => (
                    <tr key={z.zona}>
                      <td><strong>Zona {z.zona}</strong></td>
                      <td className="aud-num">{z.secoes}</td>
                      <td className="aud-num"><strong>{fmt(z.votaram)}</strong></td>
                      <td className="aud-num">{fmt(z.comparecimento)}</td>
                      {z.votos.map((v, i) => <td key={alvos[i].id} className="aud-num">{fmt(v)}</td>)}
                      <td className="aud-num">
                        {z.problemas ? <span className="aud-flag is-warn">{z.problemas}</span> : <span className="aud-muted">0</span>}
                      </td>
                      <td className="aud-num">
                        <button type="button" className="aud-link" onClick={() => { setZonaSel(z.zona); setTab('secao') }}>
                          Ver seções
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="aud-num">{totais.secoes}</td>
                    <td className="aud-num">{fmt(totais.votaram)}</td>
                    <td className="aud-num">{fmt(porZona.reduce((s, z) => s + z.comparecimento, 0))}</td>
                    {totais.votos.map((v, i) => <td key={alvos[i].id} className="aud-num">{fmt(v)}</td>)}
                    <td className="aud-num">{totais.problemas}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="aud-nota">
            Os votos dos candidatos são somados apenas nas seções em que há fichas “Votou”, para a comparação ser
            entre os mesmos locais.
          </p>
        </div>
      )}

      {tab === 'secao' && (
        <>
          <div className="aud-filtros">
            <select value={zonaSel} onChange={(e) => setZonaSel(e.target.value)} aria-label="Zona">
              <option value="">Todas as zonas</option>
              {zonas.map((z) => <option key={z} value={z}>Zona {z}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFiltro)} aria-label="Situação">
              <option value="todos">Todas as situações</option>
              <option value="confere">{STATUS_LABEL.confere}</option>
              <option value="parcial">{STATUS_LABEL.parcial}</option>
              <option value="abaixo">{STATUS_LABEL.abaixo}</option>
              <option value="excede">{STATUS_LABEL.excede}</option>
            </select>
            <div className="aud-busca">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Seção, local, nome ou título" />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpar"><X size={15} /></button>
              ) : null}
            </div>
            <span className="aud-contagem">{fmt(filtradas.length)} seções</span>
          </div>

          <div className="aud-card">
            {!visiveis.length ? (
              <EmptyState title="Nenhuma seção" description="Nada encontrado com os filtros atuais." />
            ) : (
              <div className="table-wrapper">
                <table className="aud-table">
                  <thead>
                    <tr>
                      {th(sortS, setSortS, 'zona', 'Zona')}
                      {th(sortS, setSortS, 'secao', 'Seção')}
                      {th(sortS, setSortS, 'local', 'Local de votação')}
                      {th(sortS, setSortS, 'votaram', 'Votaram', true)}
                      {th(sortS, setSortS, 'comparecimento', 'Comparecimento', true)}
                      {colAlvosS}
                      {th(sortS, setSortS, 'status', 'Situação')}
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => {
                      const open = aberta === l.key
                      return (
                        <Fragment key={l.key}>
                          <tr className={`aud-row ${open ? 'is-open' : ''}`} onClick={() => setAberta(open ? null : l.key)}>
                            <td>{l.zona}</td>
                            <td>{l.secao}</td>
                            <td className="aud-local">{l.local}</td>
                            <td className="aud-num"><strong>{l.fichas.length}</strong></td>
                            <td className="aud-num">{fmt(l.comparecimento)}</td>
                            {l.votos.map((v, i) => <td key={alvos[i].id} className="aud-num">{fmt(v)}</td>)}
                            <td>
                              <span className={`aud-flag ${l.status === 'confere' ? 'is-ok' : l.status === 'parcial' ? 'is-warn' : 'is-err'}`}>
                                {STATUS_LABEL[l.status]}
                              </span>
                              {l.faltam.some((n) => n > 0) ? (
                                <small className="aud-sub">
                                  {alvos.map((a, i) => (l.faltam[i] ? `${a.nome.split(' ')[0]}: ${l.faltam[i]} ficha${l.faltam[i] > 1 ? 's' : ''} a mais` : null)).filter(Boolean).join(' · ')}
                                </small>
                              ) : null}
                            </td>
                          </tr>
                          {open && (
                            <tr className="aud-detalhe">
                              <td colSpan={6 + alvos.length}>
                                <div className="aud-detalhe-grid">
                                  <div>
                                    <h4>Quem votou nesta seção ({l.fichas.length})</h4>
                                    <ul>
                                      {l.fichas.map((f) => (
                                        <li key={f.id}>
                                          <span>{f.nome_completo}</span>
                                          {f.lider ? <small>{f.lider}</small> : null}
                                          {f.voto_foto_path ? (
                                            <button type="button" className="aud-link" onClick={() => void abrirFoto(f)}>
                                              <Eye size={13} /> Anexo
                                            </button>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <h4>Conferência</h4>
                                    <dl>
                                      <dt>Fichas “Votou”</dt><dd>{l.fichas.length}</dd>
                                      <dt>Comparecimento (BU)</dt><dd>{fmt(l.comparecimento)}</dd>
                                      <dt>Federal: Fabiana Vilar</dt><dd>{fmt(l.somaFederal)}</dd>
                                      <dt>Estadual: Josimar</dt><dd>{fmt(l.somaEstadual)}</dd>
                                      <dt>Brancos / Nulos</dt><dd>{l.branco} / {l.nulo}</dd>
                                    </dl>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filtradas.length > pageSize && (
              <Pagination
                page={pageSafe}
                totalPages={totalPages}
                totalItems={filtradas.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(0) }}
                pageSizeOptions={[15, 25, 50, 100]}
                label={`${pageSafe * pageSize + 1}–${Math.min(filtradas.length, (pageSafe + 1) * pageSize)} de ${filtradas.length}`}
              />
            )}
          </div>
          <p className="aud-nota">
            <b>{STATUS_LABEL.confere}</b>: Fabiana e Josimar têm, cada um, pelo menos tantos votos na seção quantas são as fichas “Votou”. <b>{STATUS_LABEL.parcial}</b>: algum deles tem menos votos que fichas (a diferença aparece embaixo), mas ainda 75% ou mais. <b>{STATUS_LABEL.abaixo}</b>: algum deles ficou abaixo de 75% das fichas. <b>{STATUS_LABEL.excede}</b>: há mais fichas “Votou” do que eleitores que compareceram.
          </p>
        </>
      )}

      {tab === 'equipe' && (
        <>
          <div className="aud-filtros">
            <select value={coordSel} onChange={(e) => { setCoordSel(e.target.value); setLiderSel('') }} aria-label="Coordenação">
              <option value="">Todas as coordenações</option>
              {coordenadores.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={liderSel} onChange={(e) => setLiderSel(e.target.value)} aria-label="Liderança">
              <option value="">Todas as lideranças</option>
              {lideresLista.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={zonaSel} onChange={(e) => setZonaSel(e.target.value)} aria-label="Zona">
              <option value="">Todas as zonas</option>
              {zonas.map((z) => <option key={z} value={z}>Zona {z}</option>)}
            </select>
            <div className="aud-busca">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, título, liderança ou seção" />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpar"><X size={15} /></button>
              ) : null}
            </div>
            <span className="aud-contagem">
              {fmt(linhasEquipe.length)} fichas em {fmt(new Set(linhasEquipe.map((r) => r.linha.key)).size)} seções
            </span>
          </div>

          <div className="aud-card">
            {!eqVisiveis.length ? (
              <EmptyState title="Nenhuma ficha" description="Nada encontrado com os filtros atuais." />
            ) : (
              <div className="table-wrapper">
                <table className="aud-table aud-equipe">
                  <thead>
                    <tr>
                      {th(sortE, setSortE, 'secao', <span className="aud-alvo">Zona / seção<small>local de votação</small></span>)}
                      {alvos.map((a, i) => (
                        <Fragment key={a.id}>
                          {th(sortE, setSortE, `alvo${i}`, <span className="aud-alvo">{a.nome}<small>votos na seção (TSE)</small></span>, true)}
                        </Fragment>
                      ))}
                      {th(sortE, setSortE, 'fichas', <span className="aud-alvo">Fichas<small>que votaram na seção</small></span>, true)}
                      {th(sortE, setSortE, 'eleitor', 'Eleitor')}
                      {th(sortE, setSortE, 'lider', 'Liderança')}
                      {th(sortE, setSortE, 'coord', 'Coordenação')}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {eqVisiveis.map((r, idx) => {
                      const ant = idx > 0 ? eqVisiveis[idx - 1].linha.key : null
                      const novaSecao = ant !== r.linha.key
                      const f = r.ficha
                      return (
                        <tr key={f.id} className={novaSecao ? 'aud-inicio' : ''}>
                          <td className="aud-sec">
                            {novaSecao ? (
                              <>
                                <strong>{r.linha.zona} / {r.linha.secao}</strong>
                                <small>{r.linha.local}</small>
                              </>
                            ) : null}
                          </td>
                          {r.linha.votos.map((v, i) => (
                            <td key={alvos[i].id} className="aud-num">{novaSecao ? <strong>{fmt(v)}</strong> : null}</td>
                          ))}
                          <td className="aud-num">{novaSecao ? <strong>{fmt(r.linha.fichas.length)}</strong> : null}</td>
                          <td>
                            <strong>{f.nome_completo}</strong>
                            <small className="aud-sub">{f.titulo || 'sem título'}{f.nome_mae ? ` · mãe: ${f.nome_mae}` : ''}</small>
                          </td>
                          <td><span className="aud-tag is-lider">{f.lider || 'Sem liderança'}</span></td>
                          <td><span className="aud-tag is-coord">{f.coordenador || 'Sem coordenação'}</span></td>
                          <td className="aud-num">
                            {f.voto_foto_path ? (
                              <button type="button" className="aud-link" onClick={() => void abrirFoto(f)}>
                                <Eye size={13} /> Anexo
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {linhasEquipe.length > pageSize && (
              <Pagination
                page={eqPageSafe}
                totalPages={eqPages}
                totalItems={linhasEquipe.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(0) }}
                pageSizeOptions={[25, 50, 100]}
                label={`${eqPageSafe * pageSize + 1}–${Math.min(linhasEquipe.length, (eqPageSafe + 1) * pageSize)} de ${linhasEquipe.length}`}
              />
            )}
          </div>
          <p className="aud-nota">
            Uma linha por ficha. Os votos de cada candidato e o total de fichas são da <b>seção</b> e aparecem na
            primeira ficha de cada seção. Se uma seção teve menos votos do candidato do que fichas, nem todas podem ter
            votado nele. O voto é secreto: o BU não identifica o eleitor.
          </p>
        </>
      )}

      {tab === 'corrigir' && (
        <>
          <p className="aud-nota" style={{ marginTop: 0 }}>
            Fichas “Votou” com zona/seção vazia ou inexistente na base do TSE. Confira o anexo, informe os dados
            corretos e salve.
          </p>
          <div className="aud-filtros">
            <div className="aud-busca">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, título ou liderança" />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpar"><X size={15} /></button>
              ) : null}
            </div>
            <span className="aud-contagem">{fmt(invalidasFiltradas.length)} fichas</span>
          </div>
          <div className="aud-card">
            {!invVisiveis.length ? (
              <EmptyState title="Nada a corrigir" description="Nenhuma ficha com zona/seção inválida." />
            ) : (
              <div className="table-wrapper">
                <table className="aud-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Título</th>
                      <th>Liderança</th>
                      <th>Gravado</th>
                      <th>Zona</th>
                      <th>Seção</th>
                      <th>Anexo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invVisiveis.map((f) => {
                      const e = edits[f.id] ?? { zona: f.zonaRaw, secao: f.secaoRaw }
                      const set = (patch: Partial<{ zona: string; secao: string }>) =>
                        setEdits((p) => ({ ...p, [f.id]: { ...e, ...patch } }))
                      return (
                        <tr key={f.id}>
                          <td><strong>{f.nome_completo}</strong></td>
                          <td className="aud-mono">{f.titulo || '—'}</td>
                          <td>{f.lider || '—'}</td>
                          <td className="aud-muted">{f.zonaRaw || '—'} / {f.secaoRaw || '—'}</td>
                          <td>
                            <input className="aud-input" value={e.zona} onChange={(ev) => set({ zona: ev.target.value })} inputMode="numeric" aria-label="Zona" />
                          </td>
                          <td>
                            <input className="aud-input" value={e.secao} onChange={(ev) => set({ secao: ev.target.value })} inputMode="numeric" aria-label="Seção" />
                          </td>
                          <td>
                            {f.voto_foto_path ? (
                              <button type="button" className="aud-link" onClick={() => void abrirFoto(f)}>
                                <Eye size={13} /> Ver
                              </button>
                            ) : <span className="aud-muted">—</span>}
                          </td>
                          <td className="aud-num">
                            <Button size="sm" loading={savingId === f.id} onClick={() => void salvarCorrecao(f)}>
                              Salvar
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {invalidasFiltradas.length > pageSize && (
              <Pagination
                page={invPageSafe}
                totalPages={invPages}
                totalItems={invalidasFiltradas.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(n) => { setPageSize(n); setPage(0) }}
                pageSizeOptions={[15, 25, 50, 100]}
                label={`${invPageSafe * pageSize + 1}–${Math.min(invalidasFiltradas.length, (invPageSafe + 1) * pageSize)} de ${invalidasFiltradas.length}`}
              />
            )}
          </div>
        </>
      )}

      {fotoUrl && (
        <div className="vot-foto-modal" role="dialog" aria-modal aria-label="Anexo">
          <button type="button" className="vot-foto-modal-backdrop" onClick={() => setFotoUrl(null)} aria-label="Fechar" />
          <div className="vot-foto-modal-card">
            <div className="vot-foto-modal-head">
              <strong>{fotoTitle}</strong>
              <button type="button" className="vot-clear" onClick={() => setFotoUrl(null)} aria-label="Fechar"><X size={18} /></button>
            </div>
            <img src={fotoUrl} alt={`Anexo de ${fotoTitle}`} />
            <a className="vot-btn" href={fotoUrl} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a>
          </div>
        </div>
      )}
    </div>
  )
}
