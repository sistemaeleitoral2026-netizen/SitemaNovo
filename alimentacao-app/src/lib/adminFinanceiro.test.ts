import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('./gabinete', () => ({ carregarFinanceiro: vi.fn() }))
vi.mock('./financeiroPessoal', () => ({ carregarFinanceiroPessoal: vi.fn() }))

import {
  addMonths, computeAdminFinanceiro, fpAccountBalance, fpOccursIn, mbFalta, mbKind, monthsBack,
  mrContratoExecucao, neritesAlvos, tabelaParaCsv, variacao, type AdminFinRaw,
} from './adminFinanceiro'
import type { FpState, FpTask } from './financeiroPessoal'

describe('datas', () => {
  it('soma meses atravessando o ano', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(monthsBack('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('Assessoria MB', () => {
  it('classifica como o app e calcula o que falta', () => {
    expect(mbKind({ saida: 50, previsto: 0, recebido: 0 })).toBe('saida')
    expect(mbKind({ tipo_lancamento: 'entrada_por_fora', recebido: 10 })).toBe('entrada_por_fora')
    expect(mbFalta({ previsto: 100, recebido: 30 })).toBe(70)
    expect(mbFalta({ previsto: 100, recebido: 130 })).toBe(0)
    expect(mbFalta({ tipo_lancamento: 'saida', previsto: 100, recebido: 0 })).toBe(0)
  })
})

describe('Financeiro Pessoal', () => {
  const state = {
    accChecks: [{ id: 'c1', accId: 'a', date: '2026-11-10', time: '18:00', balance: 500, by: '' }],
    txs: [
      { id: 't0', date: '2026-11-05', amount: 999, kind: 'expense', account: 'a', description: '', category: '' },
      { id: 't1', date: '2026-11-12', time: '09:00', amount: 100, kind: 'income', account: 'a', description: '', category: '' },
      { id: 't2', date: '2026-11-15', amount: 40, kind: 'expense', account: 'a', description: '', category: '' },
    ],
  } as unknown as Pick<FpState, 'accChecks' | 'txs'>

  it('parte da última conferência e soma só o que veio depois', () => {
    expect(fpAccountBalance(state, { id: 'a', initial: 0 }, '2026-11-30T23:59')).toBe(560)
    expect(fpAccountBalance(state, { id: 'a', initial: 1000 }, '2026-11-08T23:59')).toBe(1)
  })

  it('respeita a recorrência da programação', () => {
    const mensal = { rec: { type: 'monthly', every: 2 }, start: '2026-01-01', end: null } as unknown as FpTask
    expect(fpOccursIn(mensal, '2026-03')).toBe(true)
    expect(fpOccursIn(mensal, '2026-04')).toBe(false)
    expect(fpOccursIn(mensal, '2025-12')).toBe(false)
    const anual = { rec: { type: 'yearly', month: 7 }, start: null, end: null } as unknown as FpTask
    expect(fpOccursIn(anual, '2027-07')).toBe(true)
    const unica = { rec: { type: 'once', dateTo: '2026-09-10' }, start: null, end: null } as unknown as FpTask
    expect(fpOccursIn(unica, '2026-09')).toBe(true)
  })
})

describe('Empresas e Nerites', () => {
  it('execução do contrato conta só entradas do contrato', () => {
    const ex = mrContratoExecucao({ id: 'k', valor_total: 1000 }, [
      { contrato_id: 'k', tipo: 'entrada', valor: 250 },
      { contrato_id: 'k', tipo: 'saida', valor: 900 },
      { contrato_id: 'x', tipo: 'entrada', valor: 500 },
    ])
    expect(ex).toEqual({ total: 1000, recebido: 250, falta: 750, pct: 0.25 })
  })

  it('não mistura coordenador e lideranças e não deixa falta negativa', () => {
    const alvos = neritesAlvos(
      [{ coordenador_id: 'c', lider_id: null, valor_devido: 100 }, { coordenador_id: 'c', lider_id: 'l', valor_devido: 50 }],
      [{ coordenador_id: 'c', lider_id: null, valor: 130 }, { coordenador_id: 'c', lider_id: 'l', valor: 20 }],
    )
    expect(alvos.reduce((t, a) => t + a.devido, 0)).toBe(150)
    expect(alvos.reduce((t, a) => t + a.falta, 0)).toBe(30)
  })
})

describe('consolidado', () => {
  it('soma os sistemas e não quebra quando um falha', () => {
    const raw: AdminFinRaw = {
      nerites: { ok: false, error: 'sem acesso' },
      empresas: { ok: true, data: { lancamentos: [{ tipo: 'entrada', valor: 300, data: '2026-11-03', empresa: 'mr' }, { tipo: 'saida', valor: 100, data: '2026-11-04', empresa: 'mr' }], contratos: [] } },
      assessoria: { ok: true, data: { lancamentos: [{ previsto: 200, recebido: 50, saida: 0, data: '2026-11-01' }], tarefas: [] } },
      pessoal: { ok: true, data: { accounts: [], accChecks: [], txs: [], tasks: [], taskDone: [], investments: [], snapshots: [], goal: 0 } },
      mandato: { ok: false, error: 'offline' },
      carregadoEm: '',
    }
    const r = computeAdminFinanceiro(raw, '2026-11')
    expect(r.consolidado.entradas).toBe(350)
    expect(r.consolidado.saidas).toBe(100)
    expect(r.consolidado.aReceber).toBe(150)
    expect(r.sistemas.find((s) => s.sistema === 'nerites')?.available).toBe(false)
    expect(r.sistemas.find((s) => s.sistema === 'mr-terceiriza')?.serie).toHaveLength(6)
  })

  it('variação e CSV', () => {
    expect(variacao(150, 100)).toBe(0.5)
    expect(variacao(10, 0)).toBeNull()
    const csv = tabelaParaCsv({ id: 'x', title: 'X', columns: [{ label: 'Nome', kind: 'text' }, { label: 'Valor', kind: 'money' }], rows: [{ cells: ['A; B', 12.5] }], empty: '' })
    expect(csv).toContain('"A; B";12,50')
  })
})
