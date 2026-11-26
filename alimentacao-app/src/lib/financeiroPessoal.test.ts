import { beforeEach, describe, expect, it, vi } from 'vitest'

// Supabase falso: registra cada operação e responde como se tudo desse certo
type Op = { tabela: string; op: string; dados?: unknown; ids?: string[] }
const ops: Op[] = []
let recusarDelete = false
let anexosEncontrados = false

vi.mock('./supabase', () => {
  const builder = (tabela: string) => {
    const b: Record<string, unknown> = {}
    let atual: Op | null = null
    let ids: string[] = []
    b.insert = (dados: unknown) => { ops.push({ tabela, op: 'insert', dados }); return Promise.resolve({ error: null }) }
    b.update = (dados: unknown) => { atual = { tabela, op: 'update', dados }; return b }
    b.delete = () => { atual = { tabela, op: 'delete' }; return b }
    b.eq = (_c: string, v: string) => { ids = [v]; return b }
    b.in = (_c: string, v: string[]) => { ids = v; return b }
    b.select = () => b
    // Resolve quando o código faz "await" na cadeia (select().eq().in() etc.)
    b.then = (ok: (v: unknown) => unknown) => {
      if (!atual) {
        const data = tabela === 'fp_anexos' && anexosEncontrados
          ? [{ id: 'anexo-1', storage_path: 'lancamento/teste/anexo.pdf' }]
          : []
        return Promise.resolve({ data, error: null }).then(ok)
      }
      ops.push({ ...atual, ids })
      const n = atual.op === 'delete' && recusarDelete ? 0 : ids.length
      return Promise.resolve({ data: ids.slice(0, n).map((id) => ({ id })), error: null }).then(ok)
    }
    return b
  }
  return { supabase: { from: (t: string) => builder(t), storage: { from: () => ({ remove: (dados: unknown) => { ops.push({ tabela: 'storage', op: 'delete', dados }); return Promise.resolve({}) } }) } } }
})

import { estadoParaLinhas, salvarFinanceiroPessoal, type FpState } from './financeiroPessoal'

const C = '11111111-1111-4111-8111-111111111111'
const T = '22222222-2222-4222-8222-222222222222'
const L = '33333333-3333-4333-8333-333333333333'
const B = '44444444-4444-4444-8444-444444444444'

function estadoBase(): FpState {
  return {
    accounts: [{ id: C, name: 'Nubank', type: 'Conta digital', initial: 4000 }],
    accChecks: [], investments: [], snapshots: [], goal: 15000,
    tasks: [{ id: T, title: 'Netflix', payee: 'Netflix', payeeKind: 'empresa', category: 'Lazer', expected: 55.9, account: C,
      rec: { type: 'monthly', every: 1, dayFrom: 10, dayTo: 15 }, start: '2026-11', end: null, paused: false, notes: '' }],
    txs: [], taskDone: [],
  }
}

describe('Controle Financeiro Pessoal — sincronização com o banco', () => {
  beforeEach(() => { ops.length = 0; recusarDelete = false; anexosEncontrados = false })

  it('converte tarefa mensal para as colunas do banco', () => {
    const t = estadoParaLinhas(estadoBase()).fp_tarefas[0]
    expect(t).toMatchObject({ recorrencia: 'mensal', a_cada_meses: 1, dia_inicio: 10, dia_fim: 15, comeca_em: '2026-11-01', valor_previsto: 55.9, conta_id: C })
  })

  it('não tenta apagar comprovante antes de o banco autorizar a exclusão', async () => {
    recusarDelete = true
    anexosEncontrados = true
    const s = estadoBase()
    s.txs.push({ id: L, date: '2026-11-12', amount: 55.9, kind: 'expense', description: 'Netflix', category: 'Lazer', account: C, receiptId: 'anexo-1' })
    const antes = estadoParaLinhas(s)
    await expect(salvarFinanceiroPessoal(antes, { ...s, txs: [] })).rejects.toThrow(/Sem permissão/)
    expect(ops.some((o) => o.tabela === 'storage' || (o.tabela === 'fp_anexos' && o.op === 'delete'))).toBe(false)
  })

  it('converte tarefa única e anual', () => {
    const s = estadoBase()
    s.tasks.push(
      { ...s.tasks[0], id: 'u', rec: { type: 'once', dateFrom: '2026-11-24', dateTo: '2026-11-30' } },
      { ...s.tasks[0], id: 'a', rec: { type: 'yearly', month: 1, dayFrom: 10, dayTo: 20 }, start: '2027-01' },
    )
    const [, u, a] = estadoParaLinhas(s).fp_tarefas
    expect(u).toMatchObject({ recorrencia: 'unica', data_inicio: '2026-11-24', data_fim: '2026-11-30', termina_em: null })
    expect(a).toMatchObject({ recorrencia: 'anual', mes_do_ano: 1, dia_inicio: 10, dia_fim: 20 })
  })

  it('grava só o que mudou, na ordem das chaves estrangeiras', async () => {
    const antes = estadoParaLinhas(estadoBase())
    const s = estadoBase()
    s.txs.push({ id: L, date: '2026-11-12', time: '10:30', amount: 55.9, kind: 'expense', description: 'Netflix', category: 'Lazer', account: C, taskId: T, period: '2026-11', by: 'Ana' })
    s.taskDone.push({ id: B, taskId: T, period: '2026-11', status: 'paga', txId: L, amount: 55.9, account: C, date: '2026-11-12', time: '10:30', by: 'Ana' })
    await salvarFinanceiroPessoal(antes, s)
    const escritas = ops.map((o) => `${o.op}:${o.tabela}`)
    // A auditoria é gravada por gatilho no banco, nunca pelo navegador
    expect(escritas).toEqual(['insert:fp_lancamentos', 'insert:fp_tarefas_baixas'])
  })

  it('ao excluir o lançamento, não tenta apagar a baixa (o banco apaga em cascata)', async () => {
    const s = estadoBase()
    s.txs.push({ id: L, date: '2026-11-12', amount: 55.9, kind: 'expense', description: 'Netflix', category: 'Lazer', account: C, taskId: T, period: '2026-11' })
    s.taskDone.push({ id: B, taskId: T, period: '2026-11', status: 'paga', txId: L, amount: 55.9, date: '2026-11-12' })
    const antes = estadoParaLinhas(s)
    const depois = { ...s, txs: [], taskDone: [] }
    await salvarFinanceiroPessoal(antes, depois)
    const deletes = ops.filter((o) => o.op === 'delete').map((o) => o.tabela)
    expect(deletes).toEqual(['fp_lancamentos'])
  })

  it('avisa quando o banco não deixa excluir (RLS)', async () => {
    recusarDelete = true
    const s = estadoBase()
    s.accChecks.push({ id: 'c1', accId: C, date: '2026-11-23', time: '18:00', balance: 5400, by: 'Ana' })
    const antes = estadoParaLinhas(s)
    await expect(salvarFinanceiroPessoal(antes, { ...s, accChecks: [] })).rejects.toThrow(/Sem permissão/)
  })

  it('edição gera update apenas da linha alterada', async () => {
    const antes = estadoParaLinhas(estadoBase())
    const s = estadoBase()
    s.accounts[0].initial = 4500
    await salvarFinanceiroPessoal(antes, s)
    const up = ops.filter((o) => o.op === 'update')
    expect(up).toHaveLength(1)
    expect(up[0]).toMatchObject({ tabela: 'fp_contas', ids: [C] })
    expect((up[0].dados as Record<string, unknown>).saldo_inicial).toBe(4500)
  })
})
