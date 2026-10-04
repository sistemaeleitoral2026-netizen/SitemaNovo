import { describe, expect, it } from 'vitest'
import {
  countFichasForLider,
  dedupeLiderIdsByNome,
  liderancasOcupadasPorOutros,
  liderFichaKey,
  uniqueLiderNomes,
} from './liderFichas'

const rows = [
  { lider: 'ALANIA CARDOSO', coordenador: 'GABRIEL LUCAS', diretoria_id: 'd1', total: 16 },
  { lider: 'ALANIA CARDOSO', coordenador: 'ANDRÉ', diretoria_id: 'd1', total: 20 },
]

describe('countFichasForLider', () => {
  it('não mistura homônimos de coordenadores diferentes', () => {
    expect(countFichasForLider(rows, {
      nome: 'ALANIA CARDOSO',
      coordenadorNome: 'GABRIEL LUCAS',
      diretoriaId: 'd1',
    })).toBe(16)

    expect(countFichasForLider(rows, {
      nome: 'ALANIA CARDOSO',
      coordenadorNome: 'ANDRÉ',
      diretoriaId: 'd1',
    })).toBe(20)
  })

  it('liderança sem coordenador não herda fichas com coordenador', () => {
    expect(countFichasForLider(rows, {
      nome: 'ALANIA CARDOSO',
      coordenadorNome: '',
      diretoriaId: 'd1',
    })).toBe(0)
  })
})

describe('liderFichaKey', () => {
  it('diferencia o mesmo nome sob coordenadores distintos', () => {
    expect(liderFichaKey('ALANIA CARDOSO', 'GABRIEL LUCAS', 'd1'))
      .not.toBe(liderFichaKey('ALANIA CARDOSO', 'ANDRÉ', 'd1'))
  })
})

describe('dedupeLiderIdsByNome', () => {
  const refs = [
    { id: 'a', nome: 'Maria Silva' },
    { id: 'b', nome: '  maria silva ' },
    { id: 'c', nome: 'João' },
  ]

  it('mantém um id por nome (case/espaço)', () => {
    expect(dedupeLiderIdsByNome(['a', 'b', 'c'], refs)).toEqual(['a', 'c'])
  })

  it('aceita options value/label', () => {
    expect(dedupeLiderIdsByNome(['b', 'a'], [
      { value: 'a', label: 'Maria' },
      { value: 'b', label: 'maria' },
    ])).toEqual(['b'])
  })
})

describe('uniqueLiderNomes', () => {
  it('deduplica por chave estável', () => {
    expect(uniqueLiderNomes(['Maria', ' maria ', 'João', 'JOÃO'])).toEqual(['Maria', 'João'])
  })
})

describe('liderancasOcupadasPorOutros', () => {
  it('marca liderança de outro auxiliar da mesma coord', () => {
    const { takenIds, takenNames, ocupadaPor } = liderancasOcupadasPorOutros({
      auxiliarLiderMap: {
        aux1: ['l1'],
        aux2: ['l2'],
      },
      auxiliares: [
        { id: 'aux1', coordenador_id: 'c1', nome: 'Ana' },
        { id: 'aux2', coordenador_id: 'c1', nome: 'Bruno' },
      ],
      lideres: [
        { id: 'l1', nome: 'Maria', coordenador_id: 'c1' },
        { id: 'l2', nome: 'João', coordenador_id: 'c1' },
      ],
      coordenadorId: 'c1',
      excludeAuxiliarId: 'aux2',
    })
    expect(takenIds.has('l1')).toBe(true)
    expect(takenNames.has('maria')).toBe(true)
    expect(ocupadaPor.get('l1')).toBe('Ana')
    expect(takenIds.has('l2')).toBe(false)
  })
})
