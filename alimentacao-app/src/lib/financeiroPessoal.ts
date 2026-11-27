/**
 * Controle Financeiro Pessoal ↔ banco Nerites (tabelas fp_*, bucket fp-comprovantes).
 *
 * O iframe (public/sistemas/financeiro-pessoal) trabalha com um estado em memória.
 * Aqui convertemos esse estado de/para linhas do banco e, a cada salvamento,
 * gravamos só a diferença em relação ao último estado sincronizado.
 * Schema: supabase/migrations/20261124_financeiro_pessoal.sql
 */
import { supabase } from './supabase'

const BUCKET = 'fp-comprovantes'

/* ---------- Estado no formato do iframe ---------- */
export type FpAccount = { id: string; name: string; type: string; initial: number; bank?: string; createdBy?: string | null }

/** A coluna fp_contas.banco só existe depois do SQL 20261125_fp_contas_banco.sql; sem ela o banco é deduzido do nome. */
let temColunaBanco = false
export type FpCheck = { id: string; accId: string; date: string; time: string; balance: number; by: string; createdBy?: string | null }
export type FpTx = {
  id: string; date: string; time?: string | null; amount: number; kind: 'income' | 'expense'
  description: string; category: string; account: string; payee?: string | null; by?: string | null
  taskId?: string | null; period?: string | null; receiptId?: string | null; note?: string | null; createdBy?: string | null
}
export type FpRec = {
  type: 'once' | 'weekly' | 'monthly' | 'yearly'; every?: number; dayFrom?: number; dayTo?: number; month?: number; dayOfWeek?: number
  dateFrom?: string; dateTo?: string
}
export type FpTaskKind = 'pagamento' | 'documentacao' | 'cobranca'
export type FpTask = {
  id: string; title: string; payee: string; payeeKind: 'pessoa' | 'empresa'; category: string
  kind?: FpTaskKind
  /** Cobrança: quem será cobrado */
  chargeTo?: string
  /** Documentação: quem deve resolver */
  docOwner?: string
  /** Nome de quem cadastrou a programação */
  createdByName?: string
  /** Data original do cadastro, usada na tela de documentação. */
  createdAt?: string
  expected: number | null; account: string | null; rec: FpRec; start: string | null; end: string | null
  paused: boolean; notes: string; createdBy?: string | null
}
export type FpDoneStatus = 'paga' | 'dispensada' | 'concluida' | 'cobrada'
export type FpDone = {
  id: string; taskId: string; period: string; status: FpDoneStatus; txId?: string | null
  amount?: number | null; account?: string | null; date?: string | null; time?: string | null
  by?: string | null; payee?: string | null; receiptId?: string | null; note?: string | null
}
export type FpInvestment = { id: string; name: string; type: string; institution: string; account?: string | null }
export type FpSnapshot = { id: string; invId: string; date: string; time: string; balance: number; by: string; createdBy?: string | null }

export type FpState = {
  accounts: FpAccount[]; accChecks: FpCheck[]; txs: FpTx[]; tasks: FpTask[]; taskDone: FpDone[]
  investments: FpInvestment[]; snapshots: FpSnapshot[]; goal: number; people?: string[]
}

type Row = Record<string, unknown> & { id: string }
export type FpRows = Record<TableName, Row[]>

const TABLES = [
  'fp_contas', 'fp_investimentos', 'fp_tarefas', 'fp_lancamentos',
  'fp_tarefas_baixas', 'fp_conferencias_conta', 'fp_investimentos_saldos',
] as const
type TableName = (typeof TABLES)[number]

const ROTULO: Record<TableName, string> = {
  fp_contas: 'conta', fp_investimentos: 'investimento', fp_tarefas: 'tarefa', fp_lancamentos: 'lancamento',
  fp_tarefas_baixas: 'baixa', fp_conferencias_conta: 'conta.saldo', fp_investimentos_saldos: 'investimento.saldo',
}

function asError(e: unknown, padrao: string): Error {
  if (e instanceof Error) return e
  const o = e as { message?: string; details?: string } | null
  const msg = o?.message || o?.details || ''
  if (/conta_id/.test(msg) && /fp_investimentos|column/i.test(msg)) {
    return new Error('Falta rodar o SQL 20261124b_financeiro_pessoal_contas_editor.sql no Supabase (aplicação ligada à conta).')
  }
  if (/(cobrado|responsavel_doc)/.test(msg) && /column|schema/i.test(msg)) {
    return new Error('Falta rodar o SQL 20261125b_fp_programacao_campos.sql no Supabase (campos de documentação/cobrança).')
  }
  if (/emitido_por/.test(msg) && /column|schema/i.test(msg)) {
    return new Error('Falta rodar o SQL 20261125c_fp_emitido_por.sql no Supabase (quem emitiu a programação).')
  }
  if (/tipo/.test(msg) && /fp_tarefas|column|check/i.test(msg)) {
    return new Error('Falta rodar o SQL 20261125_fp_programacao_tipos.sql no Supabase (tipos de programação).')
  }
  if (/dia_semana|recorrencia/.test(msg) && /fp_tarefas|column|check|schema/i.test(msg)) {
    return new Error('Falta rodar o SQL 20261127_fp_programacao_semanal.sql no Supabase (programações semanais).')
  }
  return new Error(msg || padrao)
}

const hhmm = (t: unknown) => (typeof t === 'string' && t ? t.slice(0, 5) : null)
const num = (v: unknown) => (v == null ? null : Number(v))
const mes = (d: unknown) => (typeof d === 'string' && d ? d.slice(0, 7) : null)
const primeiroDia = (k: string | null | undefined) => (k ? `${k.slice(0, 7)}-01` : null)
const vazio = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim() : null)

/* ---------- Estado → linhas ---------- */
export function estadoParaLinhas(s: FpState): FpRows {
  const contas = new Set(s.accounts.map((a) => a.id))
  const tarefas = new Set(s.tasks.map((t) => t.id))
  const lancs = new Set(s.txs.map((t) => t.id))
  const invs = new Set(s.investments.map((i) => i.id))
  return {
    fp_contas: s.accounts.map((a, i) => ({
      id: a.id, nome: a.name, tipo: a.type, saldo_inicial: Number(a.initial) || 0, ordem: i,
      ...(temColunaBanco ? { banco: a.bank || null } : {}),
    })),
    fp_investimentos: s.investments.map((i) => ({
      id: i.id, nome: i.name, tipo: i.type, instituicao: i.institution || '',
      conta_id: i.account && contas.has(i.account) ? i.account : null,
    })),
    fp_tarefas: s.tasks.map((t) => {
      const r = t.rec || ({} as FpRec)
      const tipo = t.kind === 'documentacao' || t.kind === 'cobranca' ? t.kind : 'pagamento'
      const base = {
        id: t.id,
        titulo: t.title,
        // Pagamento: quem recebe. Cobrança/Documentação não usam este campo.
        recebedor: tipo === 'pagamento' ? (t.payee || '') : '',
        recebedor_tipo: t.payeeKind === 'pessoa' ? 'pessoa' : 'empresa',
        cobrado: tipo === 'cobranca' ? (t.chargeTo || t.payee || '') : '',
        responsavel_doc: tipo === 'documentacao' ? (t.docOwner || '') : '',
        emitido_por: t.createdByName || '',
        categoria: tipo === 'pagamento' ? (t.category || 'Outros') : 'Outros',
        tipo,
        valor_previsto: tipo === 'documentacao' || t.expected == null ? null : Number(t.expected),
        conta_id: tipo !== 'documentacao' && t.account && contas.has(t.account) ? t.account : null,
        pausada: !!t.paused, instrucoes: t.notes || '',
        recorrencia: 'mensal', a_cada_meses: 1, dia_inicio: null as number | null, dia_fim: null as number | null,
        mes_do_ano: null as number | null, data_inicio: null as string | null, data_fim: null as string | null,
        comeca_em: primeiroDia(t.start), termina_em: primeiroDia(t.end),
      }
      if (r.type === 'once') {
        return { ...base, recorrencia: 'unica', data_inicio: r.dateFrom || r.dateTo || null, data_fim: r.dateTo || r.dateFrom || null, termina_em: null }
      }
      if (r.type === 'weekly') return { ...base, recorrencia: 'semanal', dia_semana: Number(r.dayOfWeek) || 0 }
      const comum = { dia_inicio: Number(r.dayFrom) || 1, dia_fim: Number(r.dayTo || r.dayFrom) || 1 }
      if (r.type === 'yearly') return { ...base, ...comum, recorrencia: 'anual', a_cada_meses: 12, mes_do_ano: Number(r.month) || 1 }
      return { ...base, ...comum, recorrencia: 'mensal', a_cada_meses: Number(r.every) || 1 }
    }),
    fp_lancamentos: s.txs.map((x) => ({
      id: x.id, data: x.date, hora: x.time || null, tipo: x.kind === 'income' ? 'receita' : 'despesa',
      descricao: x.description, categoria: x.category || 'Outros', valor: Number(x.amount), conta_id: x.account,
      recebedor: vazio(x.payee), responsavel: vazio(x.by), observacao: vazio(x.note),
      tarefa_id: x.taskId && tarefas.has(x.taskId) ? x.taskId : null,
      tarefa_periodo: x.taskId && tarefas.has(x.taskId) ? x.period || null : null,
    })),
    fp_tarefas_baixas: s.taskDone.filter((d) => tarefas.has(d.taskId)).map((d) => ({
      id: d.id, tarefa_id: d.taskId, periodo: d.period, status: d.status,
      lancamento_id: d.txId && lancs.has(d.txId) ? d.txId : null,
      valor: d.amount == null ? null : Number(d.amount), conta_id: d.account && contas.has(d.account) ? d.account : null,
      data: d.date || null, hora: d.time || null, recebedor: vazio(d.payee), responsavel: vazio(d.by), observacao: vazio(d.note),
    })),
    fp_conferencias_conta: s.accChecks.filter((c) => contas.has(c.accId)).map((c) => ({
      id: c.id, conta_id: c.accId, data: c.date, hora: c.time, saldo: Number(c.balance), responsavel: c.by || '',
    })),
    fp_investimentos_saldos: s.snapshots.filter((x) => invs.has(x.invId)).map((x) => ({
      id: x.id, investimento_id: x.invId, data: x.date, hora: x.time, saldo: Number(x.balance), responsavel: x.by || '',
    })),
  }
}

/* ---------- Carregar do banco ---------- */
export async function carregarFinanceiroPessoal(): Promise<{ estado: FpState; linhas: FpRows }> {
  const sel = (t: string, order: string) => supabase.from(t).select('*').order(order)
  const res = await Promise.all([
    sel('fp_contas', 'ordem'),
    sel('fp_investimentos', 'created_at'),
    sel('fp_tarefas', 'created_at'),
    sel('fp_lancamentos', 'data'),
    sel('fp_tarefas_baixas', 'periodo'),
    sel('fp_conferencias_conta', 'data'),
    sel('fp_investimentos_saldos', 'data'),
    supabase.from('fp_anexos').select('id,entidade,entidade_id,created_at').eq('entidade', 'lancamento').order('created_at'),
    supabase.from('fp_config').select('chave,valor'),
  ])
  const testeBanco = await supabase.from('fp_contas').select('banco').limit(1)
  temColunaBanco = !testeBanco.error
  const erro = res.find((r) => r.error)?.error
  if (erro) {
    const msg = String(erro.message || '')
    if (/fp_|relation|does not exist|schema cache/i.test(msg)) {
      throw new Error('As tabelas do Controle Financeiro Pessoal ainda não existem no banco. Rode o SQL 20261124_financeiro_pessoal.sql no Supabase (projeto Nerites).')
    }
    throw asError(erro, 'Falha ao carregar os dados do banco.')
  }
  const [contas, invs, tarefas, lancs, baixas, confs, saldos, anexos, config] = res.map((r) => (r.data || []) as Record<string, unknown>[])

  const anexoDe = new Map<string, string>()
  for (const a of anexos) anexoDe.set(String(a.entidade_id), String(a.id))

  const estado: FpState = {
    accounts: contas.filter((c) => c.ativo !== false).map((c) => ({
      id: String(c.id), name: String(c.nome), type: String(c.tipo), initial: Number(c.saldo_inicial) || 0, createdBy: (c.created_by as string) ?? null,
      ...(c.banco ? { bank: String(c.banco) } : {}),
    })),
    investments: invs.filter((i) => i.ativo !== false).map((i) => ({
      id: String(i.id), name: String(i.nome), type: String(i.tipo), institution: String(i.instituicao || ''),
      account: (i.conta_id as string) ?? null,
    })),
    tasks: tarefas.map((t) => {
      const rec: FpRec = t.recorrencia === 'unica'
        ? { type: 'once', dateFrom: (t.data_inicio as string) || (t.data_fim as string), dateTo: t.data_fim as string }
        : t.recorrencia === 'semanal'
          ? { type: 'weekly', dayOfWeek: Number(t.dia_semana) || 0 }
        : t.recorrencia === 'anual'
          ? { type: 'yearly', every: 12, month: Number(t.mes_do_ano), dayFrom: Number(t.dia_inicio), dayTo: Number(t.dia_fim) }
          : { type: 'monthly', every: Number(t.a_cada_meses) || 1, dayFrom: Number(t.dia_inicio), dayTo: Number(t.dia_fim) }
      const kindRaw = String(t.tipo || 'pagamento')
      const kind: FpTaskKind =
        kindRaw === 'documentacao' || kindRaw === 'cobranca' ? kindRaw : 'pagamento'
      return {
        id: String(t.id),
        title: String(t.titulo),
        payee: String(t.recebedor || ''),
        payeeKind: t.recebedor_tipo === 'pessoa' ? 'pessoa' : 'empresa',
        chargeTo: String(t.cobrado || ''),
        docOwner: String(t.responsavel_doc || ''),
        createdByName: String(t.emitido_por || ''),
        createdAt: typeof t.created_at === 'string' ? t.created_at : undefined,
        category: String(t.categoria || 'Outros'),
        kind,
        expected: num(t.valor_previsto),
        account: (t.conta_id as string) ?? null,
        rec,
        start: rec.type === 'once' ? mes(t.data_inicio || t.data_fim) : mes(t.comeca_em),
        end: mes(t.termina_em),
        paused: !!t.pausada,
        notes: String(t.instrucoes || ''),
        createdBy: (t.created_by as string) ?? null,
      }
    }),
    txs: lancs.map((x) => ({
      id: String(x.id), date: String(x.data), time: hhmm(x.hora), amount: Number(x.valor),
      kind: x.tipo === 'receita' ? 'income' : 'expense', description: String(x.descricao), category: String(x.categoria || 'Outros'),
      account: String(x.conta_id), payee: (x.recebedor as string) ?? null, by: (x.responsavel as string) ?? null,
      taskId: (x.tarefa_id as string) ?? null, period: (x.tarefa_periodo as string) ?? null,
      receiptId: anexoDe.get(String(x.id)) ?? null, note: (x.observacao as string) ?? null, createdBy: (x.created_by as string) ?? null,
    })),
    taskDone: baixas.map((d) => {
      const st = String(d.status || 'paga')
      const status: FpDoneStatus =
        st === 'dispensada' || st === 'concluida' || st === 'cobrada' ? st : 'paga'
      return {
        id: String(d.id), taskId: String(d.tarefa_id), period: String(d.periodo), status,
        txId: (d.lancamento_id as string) ?? null, amount: num(d.valor), account: (d.conta_id as string) ?? null,
        date: (d.data as string) ?? null, time: hhmm(d.hora), by: (d.responsavel as string) ?? null, payee: (d.recebedor as string) ?? null,
        receiptId: d.lancamento_id ? anexoDe.get(String(d.lancamento_id)) ?? null : null, note: (d.observacao as string) ?? null,
      }
    }),
    accChecks: confs.map((c) => ({
      id: String(c.id), accId: String(c.conta_id), date: String(c.data), time: hhmm(c.hora) || '00:00',
      balance: Number(c.saldo), by: String(c.responsavel || ''), createdBy: (c.created_by as string) ?? null,
    })),
    snapshots: saldos.map((x) => ({
      id: String(x.id), invId: String(x.investimento_id), date: String(x.data), time: hhmm(x.hora) || '00:00',
      balance: Number(x.saldo), by: String(x.responsavel || ''), createdBy: (x.created_by as string) ?? null,
    })),
    goal: Number(config.find((c) => c.chave === 'meta_reserva')?.valor ?? 15000) || 15000,
  }

  // Sugestões de "responsável": nomes mais recentes primeiro
  const nomes: [string, string][] = []
  for (const c of estado.accChecks) nomes.push([`${c.date}T${c.time}`, c.by])
  for (const x of estado.snapshots) nomes.push([`${x.date}T${x.time}`, x.by])
  for (const x of estado.txs) if (x.by) nomes.push([`${x.date}T${x.time || '00:00'}`, x.by])
  estado.people = [...new Set(nomes.sort((a, b) => b[0].localeCompare(a[0])).map((n) => n[1]).filter(Boolean))].slice(0, 10)

  return { estado, linhas: estadoParaLinhas(estado) }
}

/* ---------- Salvar só a diferença ---------- */
const igual = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b)

/** A auditoria (fp_auditoria) é gravada pelo próprio banco, por gatilho, a cada inclusão/alteração/exclusão. */
export async function salvarFinanceiroPessoal(anterior: FpRows, estado: FpState): Promise<FpRows> {
  const proximo = estadoParaLinhas(estado)

  // 1) Inclusões e alterações, na ordem das chaves estrangeiras
  for (const t of TABLES) {
    const antes = new Map((anterior[t] || []).map((r) => [r.id, r]))
    const novos = proximo[t].filter((r) => !antes.has(r.id))
    const alterados = proximo[t].filter((r) => antes.has(r.id) && !igual(antes.get(r.id)!, r))
    if (novos.length) {
      const { error } = await supabase.from(t).insert(novos)
      if (error) throw asError(error, `Falha ao salvar (${ROTULO[t]}).`)
    }
    for (const r of alterados) {
      const { id, ...campos } = r
      const { data, error } = await supabase.from(t).update(campos).eq('id', id).select('id')
      if (error) throw asError(error, `Falha ao alterar (${ROTULO[t]}).`)
      if (!data?.length) throw new Error(`Sem permissão para alterar este registro (${ROTULO[t]}).`)
    }
  }

  // 2) Exclusões, na ordem inversa
  const removidos = {} as Record<TableName, Row[]>
  for (const t of TABLES) {
    const ids = new Set(proximo[t].map((r) => r.id))
    removidos[t] = (anterior[t] || []).filter((r) => !ids.has(r.id))
  }
  const lancsRemovidos = new Set(removidos.fp_lancamentos.map((r) => r.id))
  const tarefasRemovidas = new Set(removidos.fp_tarefas.map((r) => r.id))
  // Baixas que somem junto com o lançamento/tarefa são apagadas pelo próprio banco (ON DELETE CASCADE)
  removidos.fp_tarefas_baixas = removidos.fp_tarefas_baixas.filter(
    (r) => !lancsRemovidos.has(String(r.lancamento_id)) && !tarefasRemovidas.has(String(r.tarefa_id)),
  )

  for (const t of [...TABLES].reverse()) {
    const ids = removidos[t].map((r) => r.id)
    if (!ids.length) continue
    const { data, error } = await supabase.from(t).delete().in('id', ids).select('id')
    if (error) {
      if (/foreign key/i.test(error.message)) throw new Error(`Não dá para excluir: existem registros ligados a este item (${ROTULO[t]}).`)
      throw asError(error, `Falha ao excluir (${ROTULO[t]}).`)
    }
    if ((data?.length || 0) < ids.length) {
      throw new Error('Sem permissão para excluir. Rode o SQL 20261202_fp_editor_tudo_auditoria.sql no Supabase.')
    }
  }

  // Só remove os arquivos depois de o banco confirmar a exclusão dos
  // lançamentos. Assim, uma recusa da RLS não deixa um lançamento válido sem
  // seu comprovante.
  if (lancsRemovidos.size) await apagarComprovantesDe([...lancsRemovidos])
  return proximo
}

/* ---------- Auditoria (só Admin lê; gravada pelo banco) ---------- */
export type FpAuditoriaItem = { id: string; quando: string; usuario: string; cargo: string; descricao: string }

const VERBO: Record<string, string> = {
  criar: 'Criou', editar: 'Editou', excluir: 'Excluiu', paga: 'Deu baixa em', dispensada: 'Dispensou',
  concluida: 'Concluiu', cobrada: 'Registrou recebimento de',
}
const COISA: Record<string, string> = {
  lancamento: 'lançamento', tarefa: 'programação', conta: 'conta', investimento: 'aplicação',
  'conta.saldo': 'saldo da conta', 'investimento.saldo': 'saldo da aplicação', baixa: 'registro',
}

/** Registros gravados antes do SQL 20261202 não têm descrição pronta: monta uma a partir da ação. */
function descricaoAntiga(acao: string, d: Record<string, unknown>): string {
  const i = acao.lastIndexOf('.')
  const coisa = acao.slice(0, i)
  const op = acao.slice(i + 1)
  // tarefa.paga / tarefa.dispensada…: o verbo já diz o que aconteceu com a programação
  const alvo = coisa === 'tarefa' && !['criar', 'editar', 'excluir'].includes(op) ? '' : COISA[coisa] || coisa
  const nome = d.descricao || d.titulo || d.nome
  const valor = d.valor ?? d.saldo ?? d.valor_previsto
  const partes = [`${VERBO[op] || 'Alterou'} ${alvo}`.trim()]
  if (nome) partes.push(`“${String(nome)}”`)
  if (valor != null && Number.isFinite(Number(valor))) {
    partes.push(Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
  }
  if (d.periodo) partes.push(`(${String(d.periodo).split('-').reverse().join('/')})`)
  return partes.join(' ')
}

export async function carregarAuditoria(opts: { pagina: number; porPagina: number; busca?: string }): Promise<{ itens: FpAuditoriaItem[]; total: number }> {
  const de = (Math.max(1, opts.pagina) - 1) * opts.porPagina
  let q = supabase
    .from('fp_auditoria')
    .select('id,at,actor_nome,actor_cargo,descricao,acao,detalhes', { count: 'exact' })
    .order('at', { ascending: false })
    .range(de, de + opts.porPagina - 1)
  const termo = (opts.busca || '').replace(/[%,()*\\]/g, ' ').trim()
  if (termo) q = q.or(`descricao.ilike.%${termo}%,actor_nome.ilike.%${termo}%`)
  const { data, error, count } = await q
  if (error) {
    if (/actor_cargo|descricao/.test(error.message) && /column|schema/i.test(error.message)) {
      throw new Error('Falta rodar o SQL 20261202_fp_editor_tudo_auditoria.sql no Supabase (Auditoria).')
    }
    throw asError(error, 'Falha ao carregar a auditoria.')
  }
  const itens = (data || []).map((r) => ({
    id: String(r.id),
    quando: String(r.at),
    usuario: String(r.actor_nome || 'Usuário'),
    cargo: String(r.actor_cargo || '—'),
    descricao: String(r.descricao || descricaoAntiga(String(r.acao || ''), (r.detalhes || {}) as Record<string, unknown>)),
  }))
  return { itens, total: count ?? itens.length }
}

/* ---------- Comprovantes ---------- */
export async function enviarComprovante(arquivo: Blob, nome: string, entidadeId: string): Promise<string> {
  const id = crypto.randomUUID()
  const mime = arquivo.type || 'application/octet-stream'
  const seguro = (nome || 'comprovante').replace(/[^\w.-]+/g, '_').slice(0, 80)
  const path = `lancamento/${entidadeId}/${id}-${seguro}`
  const up = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: mime, upsert: false })
  if (up.error) throw asError(up.error, 'Falha no envio do comprovante.')
  const { error } = await supabase.from('fp_anexos').insert({
    id, entidade: 'lancamento', entidade_id: entidadeId, nome: nome || 'comprovante', mime, tamanho: arquivo.size, storage_path: path,
  })
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw asError(error, 'Falha ao registrar o comprovante.')
  }
  return id
}

export async function baixarComprovante(id: string): Promise<{ blob: Blob; nome: string; mime: string; tamanho: number }> {
  const { data, error } = await supabase.from('fp_anexos').select('nome,mime,tamanho,storage_path').eq('id', id).maybeSingle()
  if (error) throw asError(error, 'Falha ao buscar o comprovante.')
  if (!data) throw new Error('Comprovante não encontrado.')
  const dl = await supabase.storage.from(BUCKET).download(data.storage_path)
  if (dl.error || !dl.data) throw asError(dl.error, 'Falha ao baixar o comprovante.')
  return { blob: dl.data, nome: data.nome, mime: data.mime || dl.data.type, tamanho: Number(data.tamanho) || dl.data.size }
}

async function apagarComprovantesDe(lancamentoIds: string[]) {
  const { data } = await supabase.from('fp_anexos').select('id,storage_path')
    .eq('entidade', 'lancamento').in('entidade_id', lancamentoIds)
  if (!data?.length) return
  await supabase.storage.from(BUCKET).remove(data.map((a) => a.storage_path))
  await supabase.from('fp_anexos').delete().in('id', data.map((a) => a.id))
}
