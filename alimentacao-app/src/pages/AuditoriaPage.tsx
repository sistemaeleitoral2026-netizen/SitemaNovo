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
type StatusSecao = 'confere' | 'abaixo' | 'excede'
type StatusFiltro = 'todos' | StatusSecao

const STATUS_LABEL: Record<StatusSecao, string> = {
  confere: 'Confere',
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
}

/** Ficha com a leitura do BU na seção onde votou. */
type FichaLida = {
  ficha: AuditoriaFicha
  /** votos de cada candidato acompanhado na seção da ficha */
  votosSecao: number[]
  /** fichas "Votou" na mesma seção (inclui esta) */
  fichasSecao: number
  /** chance de a ficha estar entre os votos do candidato: min(1, votos / fichas na seção) */
  chance: number[]
}

type LinhaEquipe = {
  key: string
  coordenador: string
  lider: string
  fichas: FichaLida[]
  /** fichas em que todos os candidatos têm voto na seção */
  constaTodos: number
  /** votos prováveis por candidato (soma das chances) */
  provaveis: number[]
  /** votos do candidato no TSE nas seções distintas da liderança */
  tse: number[]
}

type GrupoEquipe = {
  coordenador: string
  lideres: LinhaEquipe[]
  fichas: number
  constaTodos: number
  provaveis: number[]
  tse: number[]
}

type LeituraFiltro = 'todas' | 'forte' | 'media' | 'fraca'

function pctInt(parte: number, total: number) {
  return total ? Math.round((parte / total) * 100) : 0
}

function leituraDe(pct: number): 'forte' | 'media' | 'fraca' {
  if (pct >= 0.8) return 'forte'
  if (pct >= 0.5) return 'media'
  return 'fraca'
}

const LEITURA_LABEL = { forte: 'Forte', media: 'Média', fraca: 'Fraca' } as const
const LEITURA_CLS = { forte: 'is-ok', media: 'is-warn', fraca: 'is-err' } as const

function LeituraTag({ pct, showPct = false }: { pct: number; showPct?: boolean }) {
  const l = leituraDe(pct)
  return (
    <span className={`aud-flag ${LEITURA_CLS[l]}`}>
      {showPct ? `${Math.round(pct * 100)}%` : LEITURA_LABEL[l]}
    </span>
  )
}

/** Pior (menor) chance entre os candidatos acompanhados. */
function leituraPct(e: LinhaEquipe) {
  return e.fichas.length ? Math.min(...e.provaveis.map((p) => p / e.fichas.length)) : 0
}

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

const SEVERIDADE: Record<StatusSecao, number> = { confere: 0, abaixo: 1, excede: 2 }

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

  const [sortZ, setSortZ] = useState<Sort>({ key: 'zona', dir: 'asc' })
  const [sortS, setSortS] = useState<Sort>({ key: 'zona', dir: 'asc' })
  const [sortE, setSortE] = useState<Sort>({ key: 'lider', dir: 'asc' })
  const [coordSel, setCoordSel] = useState('')
  const [leituraSel, setLeituraSel] = useState<LeituraFiltro>('todas')
  const [liderAberta, setLiderAberta] = useState<string | null>(null)
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

  useEffect(() => setPage(0), [zonaSel, status, query, tab, sortS])

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
      if (l.status !== 'confere') z.problemas += 1
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
      if (l.status !== 'confere') t.problemas += 1
      l.votos.forEach((v, i) => { t.votos[i] += v })
    }
    return t
  }, [linhas, validas, alvos])

  /** Coordenação → liderança, com a leitura do BU de cada ficha. */
  const equipe = useMemo<LinhaEquipe[]>(() => {
    const secoes = new Map(linhas.map((l) => [l.key, l]))
    const grupos = new Map<string, LinhaEquipe>()
    const vistas = new Map<string, Set<string>>()
    for (const f of validas) {
      const k = buKey(f.zona, f.secao)
      const sec = secoes.get(k)
      if (!sec) continue
      const coordenador = f.coordenador || 'Sem coordenação'
      const lider = f.lider || 'Sem liderança'
      const key = `${coordenador.toLowerCase()}|${lider.toLowerCase()}`
      const g = grupos.get(key) ?? {
        key, coordenador, lider, fichas: [], constaTodos: 0,
        provaveis: alvos.map(() => 0), tse: alvos.map(() => 0),
      }
      const n = sec.fichas.length
      const chance = sec.votos.map((v) => Math.min(1, v / n))
      g.fichas.push({ ficha: f, votosSecao: sec.votos, fichasSecao: n, chance })
      if (sec.votos.every((v) => v > 0)) g.constaTodos += 1
      chance.forEach((c, i) => { g.provaveis[i] += c })
      const set = vistas.get(key) ?? new Set<string>()
      if (!set.has(k)) {
        set.add(k)
        sec.votos.forEach((v, i) => { g.tse[i] += v })
      }
      vistas.set(key, set)
      grupos.set(key, g)
    }
    return [...grupos.values()]
  }, [validas, linhas, alvos])

  const coordenadores = useMemo(
    () => [...new Set(equipe.map((e) => e.coordenador))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [equipe],
  )

  const equipeFiltrada = useMemo(() => {
    const q = query.trim().toLowerCase()
    const val = (e: LinhaEquipe): string | number => {
      if (sortE.key.startsWith('tse')) return e.tse[Number(sortE.key.slice(3))]
      if (sortE.key.startsWith('pct')) return e.provaveis[Number(sortE.key.slice(3))] / e.fichas.length
      switch (sortE.key) {
        case 'votaram': return e.fichas.length
        case 'consta': return e.constaTodos
        case 'leitura': return leituraPct(e)
        default: return e.lider
      }
    }
    const m = sortE.dir === 'asc' ? 1 : -1
    return equipe
      .filter((e) => {
        if (coordSel && e.coordenador !== coordSel) return false
        if (leituraSel !== 'todas' && leituraDe(leituraPct(e)) !== leituraSel) return false
        if (!q) return true
        return e.lider.toLowerCase().includes(q) || e.coordenador.toLowerCase().includes(q)
          || e.fichas.some((x) => x.ficha.nome_completo.toLowerCase().includes(q) || x.ficha.titulo.includes(q))
      })
      .sort((a, b) => m * cmp(val(a), val(b)) || a.lider.localeCompare(b.lider, 'pt-BR'))
  }, [equipe, coordSel, leituraSel, query, sortE])

  /** Lideranças agrupadas por coordenação, com total de cada coordenação. */
  const gruposEquipe = useMemo<GrupoEquipe[]>(() => {
    const secoes = new Map(linhas.map((l) => [l.key, l]))
    const m = new Map<string, GrupoEquipe & { vistas: Set<string> }>()
    for (const e of equipeFiltrada) {
      const g = m.get(e.coordenador) ?? {
        coordenador: e.coordenador, lideres: [], fichas: 0, constaTodos: 0,
        provaveis: alvos.map(() => 0), tse: alvos.map(() => 0), vistas: new Set<string>(),
      }
      g.lideres.push(e)
      g.fichas += e.fichas.length
      g.constaTodos += e.constaTodos
      e.provaveis.forEach((p, i) => { g.provaveis[i] += p })
      for (const x of e.fichas) {
        const k = buKey(x.ficha.zona, x.ficha.secao)
        if (g.vistas.has(k)) continue
        g.vistas.add(k)
        secoes.get(k)?.votos.forEach((v, i) => { g.tse[i] += v })
      }
      m.set(e.coordenador, g)
    }
    return [...m.values()].sort((a, b) => a.coordenador.localeCompare(b.coordenador, 'pt-BR'))
  }, [equipeFiltrada, linhas, alvos])

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
        <button type="button" className={tab === 'equipe' ? 'is-on' : ''} onClick={() => setTab('equipe')}>Coordenação e liderança</button>
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
                              <span className={`aud-flag ${l.status === 'confere' ? 'is-ok' : l.status === 'abaixo' ? 'is-warn' : 'is-err'}`}>
                                {STATUS_LABEL[l.status]}
                              </span>
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
            <b>{STATUS_LABEL.abaixo}</b>: os votos de Fabiana Vilar (Federal) ou de Josimar (Estadual) ficaram abaixo de 75% das fichas “Votou” na
            seção. <b>{STATUS_LABEL.excede}</b>: há mais fichas “Votou” do que eleitores que compareceram.
          </p>
        </>
      )}

      {tab === 'equipe' && (
        <>
          <div className="aud-legenda">
            <strong>Como ler esta tabela</strong>
            <ul>
              <li><b>Fichas</b>: eleitores da liderança marcados como “Votou”, em seções de São Luís.</li>
              <li><b>Votos no TSE</b>: quantos votos o candidato teve, pelo BU, nas seções onde essa liderança tem fichas.</li>
              <li><b>Fichas que podem ser dele</b>: quantas das fichas da liderança cabem nesses votos. Ex.: “27 de 30” = 27 das 30 fichas podem ter votado nele.</li>
              <li><b>Leitura</b>: <span className="aud-flag is-ok">Forte</span> 80% ou mais · <span className="aud-flag is-warn">Média</span> 50% a 79% · <span className="aud-flag is-err">Fraca</span> abaixo de 50% (vale o pior dos dois candidatos).</li>
            </ul>
          </div>

          <div className="aud-filtros">
            <select value={coordSel} onChange={(e) => setCoordSel(e.target.value)} aria-label="Coordenação">
              <option value="">Todas as coordenações</option>
              {coordenadores.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={leituraSel} onChange={(e) => setLeituraSel(e.target.value as LeituraFiltro)} aria-label="Leitura">
              <option value="todas">Todas as leituras</option>
              <option value="forte">Forte</option>
              <option value="media">Média</option>
              <option value="fraca">Fraca</option>
            </select>
            <div className="aud-busca">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Liderança, coordenação, nome ou título" />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpar"><X size={15} /></button>
              ) : null}
            </div>
            <span className="aud-contagem">{fmt(equipeFiltrada.length)} lideranças · {fmt(gruposEquipe.length)} coordenações</span>
          </div>

          <div className="aud-card">
            {!equipeFiltrada.length ? (
              <EmptyState title="Nenhuma liderança" description="Nada encontrado com os filtros atuais." />
            ) : (
              <div className="table-wrapper">
                <table className="aud-table">
                  <thead>
                    <tr>
                      {th(sortE, setSortE, 'lider', 'Liderança')}
                      {th(sortE, setSortE, 'votaram', 'Fichas', true)}
                      {th(sortE, setSortE, 'consta', <span className="aud-alvo">Seção com voto dos 2<small>fichas</small></span>, true)}
                      {alvos.map((a, i) => (
                        <Fragment key={a.id}>
                          {th(sortE, setSortE, `tse${i}`, <span className="aud-alvo">{a.nome}<small>votos no TSE</small></span>, true)}
                          {th(sortE, setSortE, `pct${i}`, <span className="aud-alvo">{a.nome}<small>fichas que podem ser dele</small></span>, true)}
                        </Fragment>
                      ))}
                      {th(sortE, setSortE, 'leitura', 'Leitura')}
                    </tr>
                  </thead>
                  <tbody>
                    {gruposEquipe.map((g) => (
                      <Fragment key={g.coordenador}>
                        <tr className="aud-grupo">
                          <td>{g.coordenador} <span className="aud-muted">· {g.lideres.length} {g.lideres.length === 1 ? 'liderança' : 'lideranças'}</span></td>
                          <td className="aud-num">{fmt(g.fichas)}</td>
                          <td className="aud-num">{fmt(g.constaTodos)}</td>
                          {alvos.map((a, i) => (
                            <Fragment key={a.id}>
                              <td className="aud-num">{fmt(g.tse[i])}</td>
                              <td className="aud-num">{fmt(Math.round(g.provaveis[i]))} de {fmt(g.fichas)} <small className="aud-muted">({pctInt(g.provaveis[i], g.fichas)}%)</small></td>
                            </Fragment>
                          ))}
                          <td><LeituraTag pct={g.fichas ? Math.min(...g.provaveis.map((p) => p / g.fichas)) : 0} /></td>
                        </tr>
                        {g.lideres.map((e) => {
                          const open = liderAberta === e.key
                          return (
                            <Fragment key={e.key}>
                              <tr className={`aud-row ${open ? 'is-open' : ''}`} onClick={() => setLiderAberta(open ? null : e.key)}>
                                <td className="aud-recuo"><strong>{e.lider}</strong></td>
                                <td className="aud-num">{fmt(e.fichas.length)}</td>
                                <td className="aud-num">{fmt(e.constaTodos)} de {fmt(e.fichas.length)}</td>
                                {alvos.map((a, i) => (
                                  <Fragment key={a.id}>
                                    <td className="aud-num">{fmt(e.tse[i])}</td>
                                    <td className="aud-num">
                                      <strong>{fmt(Math.round(e.provaveis[i]))} de {fmt(e.fichas.length)}</strong>{' '}
                                      <small className="aud-muted">({pctInt(e.provaveis[i], e.fichas.length)}%)</small>
                                    </td>
                                  </Fragment>
                                ))}
                                <td><LeituraTag pct={leituraPct(e)} /></td>
                              </tr>
                              {open && (
                                <tr className="aud-detalhe">
                                  <td colSpan={4 + alvos.length * 2}>
                                    <table className="aud-table aud-interna">
                                      <thead>
                                        <tr>
                                          <th>Eleitor</th>
                                          <th>Zona / seção</th>
                                          <th className="aud-num">Fichas “Votou” na seção</th>
                                          {alvos.map((a) => (
                                            <Fragment key={a.id}>
                                              <th className="aud-num">{a.nome}<small>votos no TSE na seção</small></th>
                                              <th className="aud-num">{a.nome}<small>chance desta ficha</small></th>
                                            </Fragment>
                                          ))}
                                          <th />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {e.fichas
                                          .slice()
                                          .sort((x, y) => x.ficha.nome_completo.localeCompare(y.ficha.nome_completo, 'pt-BR'))
                                          .map((x) => (
                                            <tr key={x.ficha.id}>
                                              <td>{x.ficha.nome_completo}</td>
                                              <td>{x.ficha.zona} / {x.ficha.secao}</td>
                                              <td className="aud-num">{x.fichasSecao}</td>
                                              {alvos.map((a, i) => (
                                                <Fragment key={a.id}>
                                                  <td className="aud-num">{fmt(x.votosSecao[i])}</td>
                                                  <td className="aud-num"><LeituraTag pct={x.chance[i]} showPct /></td>
                                                </Fragment>
                                              ))}
                                              <td className="aud-num">
                                                {x.ficha.voto_foto_path ? (
                                                  <button type="button" className="aud-link" onClick={() => void abrirFoto(x.ficha)}>
                                                    <Eye size={13} /> Anexo
                                                  </button>
                                                ) : null}
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="aud-nota">
            É uma estimativa: o voto é secreto e o BU não identifica o eleitor. A chance de cada ficha é os votos do
            candidato na seção ÷ fichas “Votou” na mesma seção (no máximo 100%). Se a seção teve 26 votos dele e há 32
            fichas, cada uma tem cerca de 81% de chance.
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
