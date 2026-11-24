import { describe, expect, it } from 'vitest'
import { adminEventoValor } from './adminEventos'
import type { AdminEvento } from './adminTypes'

const base: AdminEvento = {
  id: '1', sistema: 'financeiro-pessoal', categoria: 'criacao', acao: 'lancamento.criar',
  entidade: 'lancamento', entidadeId: '1', titulo: 'Lançamento criado', resumo: null,
  actorId: '1', actorNome: 'Editor', ocorridoEm: '2026-11-23T12:00:00Z',
  metadata: {}, origemUrl: '/financeiro-pessoal', sourceKey: 'teste:1',
}

describe('adminEventoValor', () => {
  it('formata valor numérico real em BRL', () => {
    expect(adminEventoValor({ ...base, metadata: { valor: 1234.5 } })).toBe('R$ 1.234,50')
  })

  it('preserva uma quantia em reais já registrada no resumo', () => {
    expect(adminEventoValor({ ...base, resumo: 'Pagamento de R$ 89,90 concluído' })).toBe('R$ 89,90')
  })

  it('não inventa valor quando o evento não possui quantia', () => {
    expect(adminEventoValor(base)).toBeNull()
  })
})
